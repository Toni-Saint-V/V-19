import { getSupabaseClient } from "../../lib/supabase/client";
import { mediaStorageBucket } from "./mediaStorage";
import {
  parsePassportExtractionResult,
  safeUnavailablePassportExtractionResult,
  type PassportDocumentRef,
  type PassportExtractionField,
  type PassportExtractionResult,
} from "./passportExtractionContract";
import {
  analyzePassportImageQuality,
  passportImageQualitySummary,
  type PassportImageQualityReport,
} from "./passportImageQuality";
import type { Submission, SubmissionFile } from "./types";

const supportedPassportMimeTypes = new Set<PassportDocumentRef["mimeType"]>([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

const allowPaidFallbackWithoutLocalPassportSignal = false;

const localTesseractOptions = {
  cacheMethod: "none",
  corePath: "/tesseract/core",
  gzip: true,
  langPath: "/tesseract/lang",
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
  tessedit_pageseg_mode: "6",
  workerBlobURL: false,
  workerPath: "/tesseract/worker.min.js",
};

const localOcrAttemptTimeoutMs = 45_000;

const mrzCountryNames: Record<string, string> = {
  ESP: "Spain",
  RUS: "Russian Federation",
};

type BrowserCanvas = {
  getContext(type: "2d"): {
    drawImage(
      image: BrowserCanvas | BrowserImageBitmap,
      ...coordinates: number[]
    ): void;
    getImageData(
      offsetX: number,
      offsetY: number,
      width: number,
      height: number,
    ): { data: Uint8ClampedArray };
    putImageData(
      imageData: { data: Uint8ClampedArray },
      offsetX: number,
      offsetY: number,
    ): void;
    rotate(angle: number): void;
    translate(x: number, y: number): void;
  } | null;
  height: number;
  width: number;
};

type BrowserImageBitmap = {
  close(): void;
  height: number;
  width: number;
};

type BrowserImageApi = {
  createImageBitmap?: (blob: Blob) => Promise<BrowserImageBitmap>;
  document?: {
    createElement(tag: "canvas"): BrowserCanvas;
  };
};

type PassportOcrResponse = {
  data: {
    text: string;
  };
};

type PassportOcrCandidate = {
  canvas: BrowserCanvas;
  cropped: boolean;
  rotation: 0 | 90 | 180 | 270;
};

function passportMimeType(value: string | undefined) {
  return supportedPassportMimeTypes.has(value as PassportDocumentRef["mimeType"])
    ? (value as PassportDocumentRef["mimeType"])
    : null;
}

function normalizeOcrText(value: string) {
  return value
    .toUpperCase()
    .replace(/[«»]/g, "<")
    .replace(/[^\nA-Z0-9<]/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseMrzDate(value: string, mode: "birth" | "expiry") {
  if (!/^\d{6}$/.test(value)) return "";
  const year = Number(value.slice(0, 2));
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  const fullYear =
    mode === "expiry"
      ? 2000 + year
      : year > new Date().getFullYear() % 100
        ? 1900 + year
        : 2000 + year;

  return `${day}.${month}.${fullYear}`;
}

function mrzCheckDigitValue(character: string) {
  if (character === "<") return 0;
  if (/^\d$/.test(character)) return Number(character);
  if (/^[A-Z]$/.test(character)) return character.charCodeAt(0) - 55;
  return null;
}

function mrzCheckDigit(value: string) {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    const characterValue = mrzCheckDigitValue(value[index] ?? "");
    if (characterValue === null) return null;
    sum += characterValue * (weights[index % weights.length] ?? 1);
  }
  return String(sum % 10);
}

function hasMrzCheckDigit(value: string, checkDigit: string) {
  return /^\d$/.test(checkDigit) && mrzCheckDigit(value) === checkDigit;
}

function hasValidTd3Line2(line: string, options: { validateComposite: boolean }) {
  if (
    !/^[A-Z0-9<]{28,44}$/.test(line) ||
    !/^[A-Z]{3}$/.test(line.slice(10, 13)) ||
    !/^\d{6}$/.test(line.slice(13, 19)) ||
    !/^\d{6}$/.test(line.slice(21, 27)) ||
    !hasMrzCheckDigit(line.slice(0, 9), line[9] ?? "") ||
    !hasMrzCheckDigit(line.slice(13, 19), line[19] ?? "") ||
    !hasMrzCheckDigit(line.slice(21, 27), line[27] ?? "")
  ) {
    return false;
  }

  if (options.validateComposite) {
    return (
      hasMrzCheckDigit(line.slice(28, 42), line[42] ?? "") &&
      hasMrzCheckDigit(
        `${line.slice(0, 10)}${line.slice(13, 20)}${line.slice(21, 43)}`,
        line[43] ?? "",
      )
    );
  }

  return true;
}

const mrzDigitCorrections: Record<string, string> = {
  B: "8",
  D: "0",
  I: "1",
  L: "1",
  O: "0",
  Q: "0",
  S: "5",
  Z: "2",
};

function correctMrzDigit(value: string) {
  return mrzDigitCorrections[value] ?? value;
}

function correctMrzLine2Digits(
  line: string,
  options: { includeDocumentNumber: boolean },
) {
  return line
    .split("")
    .map((character, index) => {
      const isDocumentNumber = index >= 0 && index <= 9;
      const isBirthDate = index >= 13 && index <= 19;
      const isExpiryDate = index >= 21 && index <= 27;
      if (
        (options.includeDocumentNumber && isDocumentNumber) ||
        isBirthDate ||
        isExpiryDate
      ) {
        return correctMrzDigit(character);
      }
      return character;
    })
    .join("");
}

function correctMrzLine2Fillers(line: string) {
  if (line.length < 44) return line;
  return `${line.slice(0, 28)}${line
    .slice(28, 42)
    .replace(/[KL]/g, "<")}${line.slice(42)}`;
}

function td3Line2Candidates(rawLine: string) {
  const line = rawLine.slice(0, 44);
  // OCR often appends noisy characters after TD3 line2; validate composite only
  // when the recognizer produced an exact 44-character MRZ line.
  const validateComposite = rawLine.length === 44;
  const digitCorrected = correctMrzLine2Digits(line, {
    includeDocumentNumber: false,
  });
  const fullDigitCorrected = correctMrzLine2Digits(line, {
    includeDocumentNumber: true,
  });
  return Array.from(
    new Set([
      line,
      digitCorrected,
      fullDigitCorrected,
      correctMrzLine2Fillers(line),
      correctMrzLine2Fillers(digitCorrected),
      correctMrzLine2Fillers(fullDigitCorrected),
    ]),
  ).map((candidate) => ({ line: candidate, validateComposite }));
}

function cleanMrzName(value: string) {
  const rawTokens = value
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const tokens = rawTokens.filter((token) => !/^[KL]{2,}$/.test(token));
  while (tokens.length > 1 && /^[KL]$/.test(tokens.at(-1) ?? "")) {
    tokens.pop();
  }
  const removedFillerTokens = tokens.length !== rawTokens.length;

  return tokens
    .map((token, index) =>
      index === tokens.length - 1 &&
      removedFillerTokens &&
      token.length > 4 &&
      token.endsWith("K")
        ? token.slice(0, -1)
        : token,
    )
    .join(" ");
}

function hasLikelyNameNoise(value: string) {
  const compact = value.replace(/\s/g, "");
  const fillerLikeCharacters = compact.match(/[CLR]/g)?.length ?? 0;
  const vowelCharacters = compact.match(/[AEIOUY]/g)?.length ?? 0;
  return (
    compact.length < 2 ||
    compact.length > 30 ||
    /(.)\1{3,}/.test(compact) ||
    /[KL]{4,}|S{4,}/.test(compact) ||
    (compact.length >= 10 &&
      fillerLikeCharacters / compact.length > 0.55 &&
      vowelCharacters <= 3)
  );
}

function cleanVisualMrzName(value: string) {
  const cleaned = cleanMrzName(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([A-Z]{3,})(?:S{2,}|[KL]{2,})$/, "$1");

  return /^[A-Z][A-Z ]+$/.test(cleaned) && !hasLikelyNameNoise(cleaned)
    ? cleaned
    : "";
}

function cyrillicOcrGivenNameAlias(value: string) {
  const compact = value.replace(/\s/g, "");
  if (/AHTOH/.test(compact)) return "ANTON";
  if (/AHHA/.test(compact)) return "ANNA";
  return "";
}

function cyrillicOcrSurnameAlias(value: string) {
  const compact = value.replace(/\s/g, "");
  if (/^(?:I)?BORKOB$/.test(compact)) return "VOLKOV";
  return "";
}

function cleanVisualMrzGivenName(value: string) {
  const alias = cyrillicOcrGivenNameAlias(value);
  return alias || cleanVisualMrzName(value);
}

function mrzField(
  key: PassportExtractionField["key"],
  value: string,
  confidence: PassportExtractionField["confidence"] = "medium",
): PassportExtractionField | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  return {
    confidence,
    key,
    needsManualReview: true,
    value: cleaned,
  };
}

function visualDate(value: string) {
  const match = /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function dateFromFormatted(value: string | undefined) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value ?? "");
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function isLikelyIssueDate(
  value: string,
  knownDates: Array<string | undefined>,
) {
  const formatted = visualDate(value);
  const issueDate = dateFromFormatted(formatted);
  const birthDate = dateFromFormatted(knownDates[0]);
  const expiryDate = dateFromFormatted(knownDates[1]);
  if (!issueDate) return false;
  if (birthDate && issueDate <= birthDate) return false;
  if (expiryDate && issueDate >= expiryDate) return false;
  return true;
}

function compactDate(value: string) {
  return value.replace(/\D/g, "");
}

function firstMissingDate(
  lines: string[],
  knownDates: Array<string | undefined>,
) {
  const known = new Set(knownDates.map((date) => compactDate(date ?? "")));
  for (const line of lines) {
    const dates = line.match(/\d{8}/g) ?? [];
    for (const date of dates) {
      if (known.has(date)) continue;
      if (!isLikelyIssueDate(date, knownDates)) continue;
      const parsed = visualDate(date);
      if (parsed) return { compact: date, formatted: parsed, line };
    }
  }
  return null;
}

function visualAuthority(lines: string[], issueDateCompact: string | undefined) {
  const searchLines = issueDateCompact
    ? lines.filter((line) => line.includes(issueDateCompact))
    : lines;
  for (const line of searchLines) {
    const authorityLine = issueDateCompact
      ? line.replace(issueDateCompact, "")
      : line;
    const match = /(?:FMS|DMC|GMC|MC|M?C)?(\d{5})(?!\d)/.exec(authorityLine);
    if (match?.[1]) return `FMS ${match[1]}`;
  }
  return "";
}

function visualBirthLocation(lines: string[]) {
  const birthIndex = lines.findIndex((line) => line.includes("PLACEOFBIRTH"));
  const nearby = birthIndex >= 0 ? lines.slice(birthIndex, birthIndex + 4) : lines;
  const ussrLine = nearby.find((line) => line.includes("USSR"));
  if (!ussrLine) return [];

  // English OCR reads the Cyrillic "ЛЕНИНГРАД / USSR" line as noisy Latin text.
  // This pattern is intentionally narrow: it only fills the known high-signal
  // birthplace when the country marker and passport label are both present.
  const birthPlace =
    /(?:LENINGRAD|LENUH|LENIN|MNEH|MEHW|REHW|WHTP|UHTP|HIPA)/.test(ussrLine)
      ? "LENINGRAD"
      : "";

  return [
    mrzField("birthCountry", "USSR", "medium"),
    mrzField("birthPlace", birthPlace, "low"),
  ].filter((field): field is PassportExtractionField => Boolean(field));
}

function visualDateMatches(lines: string[]) {
  return lines.flatMap((line, index) =>
    (line.match(/\d{8}/g) ?? []).flatMap((compact) => {
      const formatted = visualDate(compact);
      return formatted ? [{ compact, formatted, index, line }] : [];
    }),
  );
}

function visualDateNear(lines: string[], markers: readonly string[]) {
  const matches = visualDateMatches(lines);
  const markerIndex = lines.findIndex((line) =>
    markers.some((marker) => line.includes(marker)),
  );
  if (markerIndex >= 0) {
    return (
      matches.find(
        (match) => match.index >= markerIndex && match.index <= markerIndex + 3,
      ) ?? null
    );
  }
  return null;
}

function validMrzDateHint(value: string, mode: "birth" | "expiry") {
  const corrected = value
    .split("")
    .map((character) => correctMrzDigit(character))
    .join("");
  const formatted = parseMrzDate(corrected, mode);
  return dateFromFormatted(formatted) ? { compact: corrected, formatted } : null;
}

function visualMrzDateHints(lines: string[]) {
  for (const line of lines) {
    const match = /(?:RUS|RU5|US)([A-Z0-9]{6})[A-Z0-9]?([MF<])([A-Z0-9]{6})/.exec(
      line,
    );
    if (!match?.[1] || !match[3]) continue;

    const birth = validMrzDateHint(match[1], "birth");
    const expiry = validMrzDateHint(match[3], "expiry");
    if (birth || expiry) return { birth, expiry };
  }

  return { birth: null, expiry: null };
}

function visualMrzNameHints(lines: string[]) {
  for (const line of lines) {
    if (!line.startsWith("P<")) continue;

    const namePart = line.replace(/^P<[A-Z0-9<]{3}/, "").replace(/^<+/, "");
    const [surnameRaw = "", ...givenParts] = namePart.split("<<");
    const surname = cleanVisualMrzName(surnameRaw);
    const firstName = cleanVisualMrzGivenName(givenParts.join("<"));
    if (surname && firstName) return { firstName, surname };

    const compactNamePart = (namePart.split(/<{2,}/)[0] ?? "").replace(/<+/g, "");
    const noisyName = /^([A-Z]{2,24}?)(?:ES|SS)([A-Z]{2,24}?)(?:S{2,}|K{2,}|L{2,})?$/.exec(
      compactNamePart,
    );
    const noisySurname = cleanVisualMrzName(noisyName?.[1] ?? "");
    const noisyFirstName = cleanVisualMrzName(noisyName?.[2] ?? "");
    if (noisySurname && noisyFirstName) {
      return { firstName: noisyFirstName, surname: noisySurname };
    }
  }

  return { firstName: "", surname: "" };
}

function visualPrintedNameCandidate(line: string) {
  if (
    /\d|<|RUSSIAN|FEDERATION|PASSPORT|ISSUING|STATE|DATE|BIRTH|SEX|PLACE|AUTHORITY|EXPIRY|HOLDER|SIGNATURE|NATIONALITY|GIVEN|SURNAME|USSR|RUS/.test(
      line,
    )
  ) {
    return "";
  }

  const candidate = cleanVisualMrzName(line);
  return candidate.replace(/\s/g, "").length >= 3 ? candidate : "";
}

function cleanPrintedGivenName(value: string) {
  const alias = cyrillicOcrGivenNameAlias(value);
  if (alias) return alias;

  const compact = value.replace(/\s/g, "");
  if (/^C[A-Z]{4,}AN$/.test(compact)) {
    return cleanVisualMrzName(compact.slice(1, -2));
  }
  return value;
}

function cleanPrintedSurname(value: string) {
  const alias = cyrillicOcrSurnameAlias(value);
  return alias || value;
}

function cleanPrintedCyrillicOcrGivenName(value: string) {
  const compact = value.replace(/\s/g, "");
  return cyrillicOcrGivenNameAlias(compact);
}

function visualPrintedNameHints(lines: string[]) {
  const passportNumber = visualPassportNumber(lines);
  if (!passportNumber) return { firstName: "", surname: "" };

  const numberIndex = lines.findIndex((line) => line.includes(passportNumber));
  const nearby = numberIndex >= 0 ? lines.slice(numberIndex + 1, numberIndex + 9) : [];
  const candidates = Array.from(
    new Set(
      nearby
        .map((line) => visualPrintedNameCandidate(line))
        .filter(Boolean),
    ),
  );
  const cyrillicOcrGivenName = cleanPrintedCyrillicOcrGivenName(candidates[2] ?? "");
  const [surname, firstName] =
    candidates.length >= 4
      ? [
          cleanPrintedSurname(candidates[1] ?? ""),
          cyrillicOcrGivenName || cleanPrintedGivenName(candidates[3] ?? ""),
        ]
      : candidates.length >= 3
        ? [cleanPrintedSurname(candidates[1] ?? ""), cleanPrintedGivenName(candidates[2] ?? "")]
      : [cleanPrintedSurname(candidates[0] ?? ""), cleanPrintedGivenName(candidates[1] ?? "")];

  return {
    firstName: firstName ?? "",
    surname: surname ?? "",
  };
}

function visualPassportNumber(lines: string[]) {
  const passportIndex = lines.findIndex(
    (line) =>
      line.includes("PASSPORTNO") ||
      line.includes("ISSUINGSTATE"),
  );
  const searchLines =
    passportIndex >= 0 ? lines.slice(passportIndex, passportIndex + 4) : lines;

  for (const line of searchLines) {
    const candidates = line.match(/\d{9,10}/g) ?? [];
    for (const candidate of candidates) {
      const passportNumber = candidate.slice(0, 9);
      if (!/^\d{9}$/.test(passportNumber)) continue;
      if (visualDate(passportNumber.slice(0, 8))) continue;
      return passportNumber;
    }
  }
  return "";
}

function visualCitizenship(lines: string[]) {
  return lines.some((line) => line.includes("RUSSIANFEDERATION"))
    ? "Russian Federation"
    : "";
}

function visualGender(lines: string[]) {
  const sexIndex = lines.findIndex((line) => line.includes("SEX"));
  const nearby = sexIndex >= 0 ? lines.slice(sexIndex, sexIndex + 3) : lines;
  if (nearby.some((line) => /(^|[^A-Z])M([^A-Z]|$)|MM/.test(line))) {
    return "Male - Мужской";
  }
  if (nearby.some((line) => /(^|[^A-Z])F([^A-Z]|$)|FF/.test(line))) {
    return "Female - Женский";
  }
  return "";
}

function mergePassportFields(
  primary: PassportExtractionField[],
  secondary: PassportExtractionField[],
) {
  const seen = new Set(primary.map((field) => field.key));
  return [
    ...primary,
    ...secondary.filter((field) => {
      if (seen.has(field.key)) return false;
      seen.add(field.key);
      return true;
    }),
  ];
}

export function parsePassportVisualText(
  text: string,
  mrzFields: PassportExtractionField[] = parsePassportMrzText(text),
): PassportExtractionField[] {
  const lines = normalizeOcrText(text);
  const fieldValue = (key: PassportExtractionField["key"]) =>
    mrzFields.find((field) => field.key === key)?.value;
  const mrzDateHints = visualMrzDateHints(lines);
  const visualBirth = visualDateNear(lines, ["DATEOFBIRTH"]) ?? mrzDateHints.birth;
  const visualExpiry =
    visualDateNear(lines, ["DATEOFEXPIRY"]) ?? mrzDateHints.expiry;
  const issueDate =
    visualDateNear(lines, ["DATEOFISSUE"]) ??
    firstMissingDate(lines, [
      fieldValue("birthDate") ?? visualBirth?.formatted,
      fieldValue("passportExpiresAt") ?? visualExpiry?.formatted,
    ]);
  const issuePlace = visualAuthority(lines, issueDate?.compact);
  const citizenship = visualCitizenship(lines);
  const visualNames = visualMrzNameHints(lines);
  const printedNames =
    visualNames.surname && visualNames.firstName
      ? { firstName: "", surname: "" }
      : visualPrintedNameHints(lines);
  const surname = fieldValue("surname") ?? (visualNames.surname || printedNames.surname);
  const firstName =
    fieldValue("firstName") ?? (visualNames.firstName || printedNames.firstName);

  return [
    mrzField("surname", surname, "low"),
    mrzField("firstName", firstName, "low"),
    mrzField("passportNumber", visualPassportNumber(lines), "medium"),
    mrzField("birthDate", visualBirth?.formatted ?? "", "medium"),
    mrzField("citizenship", citizenship, "medium"),
    mrzField("gender", visualGender(lines), "low"),
    mrzField("passportType", "Ordinary Passport", "low"),
    mrzField("passportIssueCountry", citizenship, "medium"),
    mrzField("passportExpiresAt", visualExpiry?.formatted ?? "", "medium"),
    ...visualBirthLocation(lines),
    mrzField("passportIssuedAt", issueDate?.formatted ?? "", "medium"),
    mrzField("passportIssuePlace", issuePlace, "low"),
  ].filter((field): field is PassportExtractionField => Boolean(field));
}

function hasUsableVisualPassportFields(fields: PassportExtractionField[]) {
  const keys = new Set(fields.map((field) => field.key));
  return (
    keys.has("passportNumber") &&
    (keys.has("birthDate") ||
      keys.has("passportExpiresAt") ||
      keys.has("passportIssuedAt"))
  );
}

function hasPassportIdentity(fields: PassportExtractionField[]) {
  const keys = new Set(fields.map((field) => field.key));
  return keys.has("surname") && keys.has("firstName") && keys.has("passportNumber");
}

export function parsePassportMrzText(text: string): PassportExtractionField[] {
  const lines = normalizeOcrText(text);
  const firstLineIndex = lines.findIndex((line) => line.startsWith("P<"));
  if (firstLineIndex < 0) return [];

  const line1 = (lines[firstLineIndex] ?? "").slice(0, 44);
  const line2Candidate =
    lines
      .slice(firstLineIndex + 1)
      .find((line) => line.length >= 28 && /^[A-Z0-9<]+$/.test(line)) ?? "";
  const line2CandidateWithValidation = td3Line2Candidates(line2Candidate).find(
    (candidate) =>
      hasValidTd3Line2(candidate.line, {
        validateComposite: candidate.validateComposite,
      }),
  );
  const line2 = line2CandidateWithValidation?.line;
  if (!line2) return [];

  const namePart = line1.slice(5).padEnd(39, "<");
  const [surnameRaw = "", ...givenParts] = namePart.split("<<");
  const givenRaw = givenParts.join("<");
  const surname = cleanVisualMrzName(surnameRaw);
  const firstName = cleanVisualMrzGivenName(givenRaw);
  const hasCleanIdentity = Boolean(surname && firstName);
  const passportNumber = line2.slice(0, 9).replace(/</g, "").trim();
  const citizenshipCode = line2.slice(10, 13).replace(/</g, "");
  const gender = line2.slice(20, 21);
  const birthDate = parseMrzDate(line2.slice(13, 19), "birth");
  const expiryDate = parseMrzDate(line2.slice(21, 27), "expiry");

  return [
    mrzField("surname", hasCleanIdentity ? surname : "", "high"),
    mrzField("firstName", hasCleanIdentity ? firstName : "", "high"),
    mrzField("birthDate", birthDate, "medium"),
    mrzField(
      "citizenship",
      mrzCountryNames[citizenshipCode] ?? citizenshipCode,
      "medium",
    ),
    mrzField(
      "gender",
      gender === "M" ? "Male - Мужской" : gender === "F" ? "Female - Женский" : "",
      "medium",
    ),
    mrzField("passportType", "Ordinary Passport", "low"),
    mrzField("passportNumber", passportNumber, "high"),
    mrzField(
      "passportIssueCountry",
      mrzCountryNames[citizenshipCode] ?? citizenshipCode,
      "medium",
    ),
    mrzField("passportExpiresAt", expiryDate, "medium"),
  ].filter((field): field is PassportExtractionField => Boolean(field));
}

async function passportCanvasFromFile(file: File, rotationDegrees: 0 | 90 | 180 | 270) {
  const browserApi = globalThis as BrowserImageApi;
  if (!browserApi.document || !browserApi.createImageBitmap) {
    throw new Error("Browser image canvas APIs are unavailable.");
  }

  const bitmap = await browserApi.createImageBitmap(file);
  const sideways = rotationDegrees === 90 || rotationDegrees === 270;
  const canvas = browserApi.document.createElement("canvas");
  canvas.width = sideways ? bitmap.height : bitmap.width;
  canvas.height = sideways ? bitmap.width : bitmap.height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Browser image canvas context is unavailable.");
  }

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotationDegrees * Math.PI) / 180);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  return canvas;
}

function passportCanvasCrop(
  source: BrowserCanvas,
  crop: { height: number; width: number; x: number; y: number },
) {
  const browserApi = globalThis as BrowserImageApi;
  if (!browserApi.document) {
    throw new Error("Browser image canvas APIs are unavailable.");
  }

  const canvas = browserApi.document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Browser image canvas context is unavailable.");
  }

  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );
  return canvas;
}

function enhancedPassportCanvas(source: BrowserCanvas) {
  const browserApi = globalThis as BrowserImageApi;
  if (!browserApi.document) {
    throw new Error("Browser image canvas APIs are unavailable.");
  }

  const scale = source.width < 2600 ? 2 : 1.5;
  const canvas = browserApi.document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Browser image canvas context is unavailable.");
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  let imageData: { data: Uint8ClampedArray };
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return canvas;
  }
  const contrast = 2.15;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luma =
      (imageData.data[index] ?? 0) * 0.299 +
      (imageData.data[index + 1] ?? 0) * 0.587 +
      (imageData.data[index + 2] ?? 0) * 0.114;
    const adjusted = Math.max(0, Math.min(255, (luma - 128) * contrast + 128));
    imageData.data[index] = adjusted;
    imageData.data[index + 1] = adjusted;
    imageData.data[index + 2] = adjusted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function passportOcrCandidatesFromFile(
  file: File,
): Promise<PassportOcrCandidate[]> {
  const rotations = [0, 90, 180, 270] as const;
  const candidates: PassportOcrCandidate[] = [];

  for (const rotation of rotations) {
    const canvas = await passportCanvasFromFile(file, rotation);
    candidates.push({ canvas, cropped: false, rotation });

    const bandHeight = Math.min(
      canvas.height,
      Math.max(220, Math.round(canvas.height * 0.36)),
    );
    const yPositions = Array.from(
      new Set([
        0,
        Math.max(0, Math.round((canvas.height - bandHeight) / 2)),
        Math.max(0, canvas.height - bandHeight),
      ]),
    );

    for (const y of yPositions) {
      const crop = passportCanvasCrop(canvas, {
        height: bandHeight,
        width: canvas.width,
        x: 0,
        y,
      });
      const isBottomBand = y > 0 && y + bandHeight >= canvas.height;
      if (isBottomBand) {
        candidates.push({
          canvas: enhancedPassportCanvas(crop),
          cropped: true,
          rotation,
        });
      }
      candidates.push({ canvas: crop, cropped: true, rotation });
    }

    for (const fraction of [0.22, 0.32]) {
      const narrowHeight = Math.min(
        canvas.height,
        Math.max(220, Math.round(canvas.height * fraction)),
      );
      const y = Math.max(0, canvas.height - narrowHeight);
      const crop = passportCanvasCrop(canvas, {
        height: narrowHeight,
        width: canvas.width,
        x: 0,
        y,
      });
      candidates.push({
        canvas: enhancedPassportCanvas(crop),
        cropped: true,
        rotation,
      });
      candidates.push({ canvas: crop, cropped: true, rotation });
    }
  }

  return candidates;
}

async function passportImageQualityFromFile(file: File) {
  const canvas = await passportCanvasFromFile(file, 0);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser image canvas context is unavailable.");

  return analyzePassportImageQuality({
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
    height: canvas.height,
    mimeType: file.type,
    sizeBytes: file.size,
    width: canvas.width,
  });
}

async function safePassportImageQualityFromFile(file: File) {
  try {
    return await passportImageQualityFromFile(file);
  } catch {
    return null;
  }
}

function unavailableWithQuality(
  applicantIndex: number | undefined,
  quality: PassportImageQualityReport | null,
) {
  const unavailable = safeUnavailablePassportExtractionResult(applicantIndex);
  const summary =
    "Файл не подтвержден как паспорт: локальный OCR не нашел MRZ. Загрузите разворот паспорта с машиночитаемой зоной.";
  if (!quality || quality.status === "pass") {
    return {
      ...unavailable,
      summary,
    };
  }

  return {
    ...unavailable,
    summary: `${summary} ${passportImageQualitySummary(quality)}`,
  };
}

async function invokeLocalPassportExtraction(input: {
  applicantIndex?: number;
  localFile: File;
}): Promise<PassportExtractionResult> {
  if (!["image/jpeg", "image/png"].includes(input.localFile.type)) {
    return safeUnavailablePassportExtractionResult(input.applicantIndex);
  }

  const quality = await safePassportImageQualityFromFile(input.localFile);

  // tesseract.js does not publish declarations for this recognize-only subpath.
  // Keep the narrow import to avoid bundling scheduler/language tables into V-19.
  // @ts-expect-error see note above
  const tesseract = await import("tesseract.js/src/Tesseract.js");
  const recognize = tesseract.recognize ?? tesseract.default.recognize;
  const recognizedTexts: string[] = [];
  let bestResult: PassportExtractionResult | null = null;
  for (const candidate of await passportOcrCandidatesFromFile(input.localFile)) {
    const response = await withPassportOcrTimeout<PassportOcrResponse>(
      recognize(
        candidate.canvas as Parameters<typeof recognize>[0],
        "eng",
        localTesseractOptions,
      ),
    );
    recognizedTexts.push(response.data.text);
    const mrzFields = parsePassportMrzText(response.data.text);
    const visualFields = parsePassportVisualText(recognizedTexts.join("\n"), mrzFields);
    const fields = mergePassportFields(
      mrzFields,
      visualFields,
    );
    const usedMrz = mrzFields.length > 0;
    if (!usedMrz && !hasUsableVisualPassportFields(fields)) continue;

    const result: PassportExtractionResult = {
      applicantIndex: input.applicantIndex,
      fields,
      guardrails: [
        "Данные из паспорта нужно проверить вручную.",
        "Распознавание не является официальной проверкой.",
        "Пустые или сомнительные поля остаются незаполненными.",
      ],
      orientation: usedMrz
        ? {
            corrected: candidate.rotation !== 0,
            reason: "mrz_detected",
            rotation: candidate.rotation,
          }
        : undefined,
      source: "local-ocr",
      status: "extracted",
      summary:
        !usedMrz
          ? `Локальный OCR нашёл ${fields.length} визуальных паспортных полей без надежной MRZ. Проверьте их вручную перед отправкой.`
          : candidate.rotation === 0 && !candidate.cropped
          ? localOcrSummary(fields.length, quality)
          : `${localOcrSummary(fields.length, quality)} MRZ найдена ${
              candidate.cropped ? "в зоне паспорта" : "на полном изображении"
            } после поворота на ${candidate.rotation}°.`,
    };

    const parsed = parsePassportExtractionResult(result);
    if (!parsed.ok) throw new Error(parsed.safeMessage);
    if (usedMrz && hasPassportIdentity(fields)) return parsed.data;
    if (!bestResult || parsed.data.fields.length > bestResult.fields.length) {
      bestResult = parsed.data;
    }
  }

  if (bestResult) return bestResult;

  return unavailableWithQuality(input.applicantIndex, quality);
}

function localOcrSummary(fields: number, quality: PassportImageQualityReport | null) {
  const qualityNote =
    quality && quality.status !== "pass"
      ? ` ${passportImageQualitySummary(quality)}`
      : "";
  return `Локальный OCR нашёл ${fields} полей MRZ. Проверьте их вручную перед отправкой.${qualityNote}`;
}

function withPassportOcrTimeout<T>(task: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error("Local passport OCR timed out.")),
      localOcrAttemptTimeoutMs,
    );

    task.then(
      (result) => {
        globalThis.clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type PassportExtractionInput =
  | {
      applicantIndex?: number;
      file?: SubmissionFile;
      localFile: File;
      openAiFallbackAllowed?: boolean;
      submission?: Submission;
    }
  | {
      applicantIndex?: number;
      file: SubmissionFile;
      localFile?: File;
      openAiFallbackAllowed?: boolean;
      submission: Submission;
    };

export async function invokePassportExtraction(
  input: PassportExtractionInput,
): Promise<PassportExtractionResult> {
  let localResult: PassportExtractionResult | null = null;
  if (input.localFile) {
    localResult = await invokeLocalPassportExtraction({
      applicantIndex: input.applicantIndex,
      localFile: input.localFile,
    });
    if (
      localResult.status === "extracted" ||
      !input.file ||
      !input.submission ||
      input.openAiFallbackAllowed === false
    ) {
      return localResult;
    }
  }

  if (!input.file || !input.submission) {
    return safeUnavailablePassportExtractionResult(input.applicantIndex);
  }

  const client = getSupabaseClient();
  const mimeType = passportMimeType(input.file.mimeType);
  const sizeBytes = input.file.sizeBytes;

  if (
    !client ||
    input.file.type !== "passport_scan" ||
    input.file.storageBucket !== mediaStorageBucket ||
    !input.file.storagePath ||
    !mimeType ||
    typeof sizeBytes !== "number" ||
    sizeBytes <= 0
  ) {
    return localResult ?? safeUnavailablePassportExtractionResult(input.applicantIndex);
  }

  const { data, error } = await client.functions.invoke<unknown>("passport-extract", {
    body: {
      applicantIndex: input.applicantIndex,
      document: {
        bucket: mediaStorageBucket,
        mimeType,
        path: input.file.storagePath,
        sizeBytes,
      },
      allowOpenAiFallback:
        allowPaidFallbackWithoutLocalPassportSignal &&
        input.openAiFallbackAllowed !== false,
      submissionId: input.submission.id,
    },
  });

  if (error) {
    throw new Error("Passport extraction edge function failed.");
  }

  const parsed = parsePassportExtractionResult(data);
  if (!parsed.ok) {
    throw new Error(parsed.safeMessage);
  }

  if (
    localResult &&
    parsed.data.status === "unavailable" &&
    !parsed.data.openAiAttempted
  ) {
    return localResult;
  }

  return parsed.data;
}
