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
  cacheMethod: "write",
  corePath: "/tesseract/core",
  gzip: true,
  langPath: "/tesseract/lang",
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
  tessedit_pageseg_mode: "6",
  workerBlobURL: false,
  workerPath: "/tesseract/worker.min.js",
};

const localOcrTotalTimeoutMs = 45_000;

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

type LocalPassportOcrWorker = {
  recognize(image: BrowserCanvas): Promise<PassportOcrResponse>;
  terminate(): Promise<unknown>;
};

type LocalPassportOcrWorkerLease = {
  promise: Promise<LocalPassportOcrWorker>;
  worker: LocalPassportOcrWorker;
};

type LocalTesseractModule = {
  createWorker?: (
    languages: string,
    oem: number,
    options: typeof localTesseractOptions,
  ) => Promise<LocalPassportOcrWorker>;
  default?: {
    createWorker?: (
      languages: string,
      oem: number,
      options: typeof localTesseractOptions,
    ) => Promise<LocalPassportOcrWorker>;
  };
};

let localPassportOcrWorkerPromise: Promise<LocalPassportOcrWorker> | null = null;
let localPassportOcrWorkerLifecycleBarrier: Promise<void> = Promise.resolve();
const localPassportOcrWorkerShutdowns = new WeakMap<
  LocalPassportOcrWorker,
  Promise<void>
>();

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

function localPassportFileKind(file: File): "image" | "pdf" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/.test(name)) {
    return "image";
  }

  return null;
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

  return /^[A-Z][A-Z ]+$/.test(cleaned) && !hasLikelyNameNoise(cleaned) ? cleaned : "";
}

function cleanVisualMrzGivenName(value: string) {
  return cleanVisualMrzName(value);
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

function isLikelyIssueDate(value: string, knownDates: Array<string | undefined>) {
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

function firstMissingDate(lines: string[], knownDates: Array<string | undefined>) {
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
    const authorityLine = issueDateCompact ? line.replace(issueDateCompact, "") : line;
    const match = /(?:(MVD|FMS|DMC|GMC|MC|M?C))?(\d{5})(?!\d)/.exec(
      authorityLine,
    );
    if (match?.[2]) {
      const issueYear = Number(issueDateCompact?.slice(4));
      const authority =
        match[1] === "MVD" || (!match[1] && issueYear >= 2016) ? "MVD" : "FMS";
      return `${authority} ${match[2]}`;
    }
  }
  return "";
}

function visualBirthLocation(lines: string[]) {
  const birthIndex = lines.findIndex((line) => line.includes("PLACEOFBIRTH"));
  const nearby = birthIndex >= 0 ? lines.slice(birthIndex, birthIndex + 4) : lines;
  const ussrLine = nearby.find((line) => line.includes("USSR"));
  if (!ussrLine) return [];

  return [mrzField("birthCountry", "USSR", "medium")].filter(
    (field): field is PassportExtractionField => Boolean(field),
  );
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
    const match = /(?:RUS|RU5|US)([A-Z0-9]{6})[A-Z0-9]?([MF<])([A-Z0-9]{6})/.exec(line);
    if (!match?.[1] || !match[3]) continue;

    const birth = validMrzDateHint(match[1], "birth");
    const expiry = validMrzDateHint(match[3], "expiry");
    if (birth || expiry) return { birth, expiry };
  }

  return { birth: null, expiry: null };
}

function visualPassportNumber(lines: string[]) {
  const passportIndex = lines.findIndex(
    (line) => line.includes("PASSPORTNO") || line.includes("ISSUINGSTATE"),
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
  const visualExpiry = visualDateNear(lines, ["DATEOFEXPIRY"]) ?? mrzDateHints.expiry;
  const issueDate =
    visualDateNear(lines, ["DATEOFISSUE"]) ??
    firstMissingDate(lines, [
      fieldValue("birthDate") ?? visualBirth?.formatted,
      fieldValue("passportExpiresAt") ?? visualExpiry?.formatted,
    ]);
  const issuePlace = visualAuthority(lines, issueDate?.compact);
  const citizenship = visualCitizenship(lines);
  // OCR text outside a check-digit-validated MRZ is too unreliable for identity.
  // Other visual fields may still be offered for manual verification.
  const surname = fieldValue("surname") ?? "";
  const firstName = fieldValue("firstName") ?? "";

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
  const line2CandidateWithValidation = lines
    .filter((line) => line.length >= 28 && /^[A-Z0-9<]+$/.test(line))
    .flatMap((line) => td3Line2Candidates(line))
    .find((candidate) =>
      hasValidTd3Line2(candidate.line, {
        validateComposite: candidate.validateComposite,
      }),
    );
  const line2 = line2CandidateWithValidation?.line;
  if (!line2) return [];

  const identity = lines
    .filter((line) => line.startsWith("P<"))
    .map((line) => {
      const namePart = line.slice(0, 44).slice(5).padEnd(39, "<");
      const [surnameRaw = "", ...givenParts] = namePart.split("<<");
      const surname = cleanVisualMrzName(surnameRaw);
      const firstName = cleanVisualMrzGivenName(givenParts.join("<"));
      return { firstName, surname };
    })
    .find(({ firstName, surname }) => Boolean(surname && firstName));
  const surname = identity?.surname ?? "";
  const firstName = identity?.firstName ?? "";
  const hasCleanIdentity = Boolean(identity);
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
  signal?: AbortSignal;
}): Promise<PassportExtractionResult> {
  const deadline = createPassportExtractionDeadline(input.signal);
  let workerLease: LocalPassportOcrWorkerLease | undefined;

  try {
    deadline.throwIfCancelled();
    const fileKind = localPassportFileKind(input.localFile);
    if (fileKind === "pdf") {
      return await awaitPassportExtractionStep(
        Promise.resolve().then(() =>
          invokeLocalPassportPdfExtraction({
            ...input,
            signal: deadline.signal,
          }),
        ),
        deadline,
      );
    }

    if (fileKind !== "image") {
      return safeUnavailablePassportExtractionResult(input.applicantIndex);
    }

    const quality = await awaitPassportExtractionStep(
      Promise.resolve().then(() => safePassportImageQualityFromFile(input.localFile)),
      deadline,
    );
    const candidates = await awaitPassportExtractionStep(
      Promise.resolve().then(() => passportOcrCandidatesFromFile(input.localFile)),
      deadline,
    );
    workerLease = await localPassportOcrWorkerBeforeDeadline(deadline);

    let bestResult: PassportExtractionResult | null = null;
    for (const candidate of candidates) {
      const response = await recognizePassportOcrCandidate(
        workerLease,
        candidate.canvas,
        deadline,
      );
      const mrzFields = parsePassportMrzText(response.data.text);
      const visualFields = parsePassportVisualText(response.data.text, mrzFields);
      const fields = mergePassportFields(mrzFields, visualFields);
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
        summary: !usedMrz
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
  } catch (error) {
    if (workerLease && deadline.signal.aborted) {
      await invalidateLocalPassportOcrWorker(workerLease);
    }
    if (deadline.signal.aborted) throw deadline.error();
    throw error;
  } finally {
    deadline.dispose();
  }
}

async function localPassportOcrWorker(): Promise<LocalPassportOcrWorkerLease> {
  await localPassportOcrWorkerLifecycleBarrier;
  if (!localPassportOcrWorkerPromise) {
    localPassportOcrWorkerPromise = (async () => {
      const tesseract =
        (await import("tesseract.js/src/index.js")) as unknown as LocalTesseractModule;
      const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
      if (!createWorker) {
        throw new Error("Local passport OCR worker is unavailable.");
      }
      return createWorker("eng", 1, localTesseractOptions);
    })();
    void localPassportOcrWorkerPromise.catch(() => {
      localPassportOcrWorkerPromise = null;
    });
  }
  const promise = localPassportOcrWorkerPromise;
  return {
    promise,
    worker: await promise,
  };
}

export async function prewarmLocalPassportOcr(): Promise<void> {
  try {
    await localPassportOcrWorker();
  } catch {
    // Extraction remains fail-closed and retries worker bootstrap on upload.
  }
}

async function invokeLocalPassportPdfExtraction(input: {
  applicantIndex?: number;
  localFile: File;
  signal?: AbortSignal;
}): Promise<PassportExtractionResult> {
  throwIfPassportExtractionAborted(input.signal);
  const { extractPdfTextFromFile } = await import("./pdfTextExtraction");
  const pdf = await extractPdfTextFromFile(input.localFile);
  throwIfPassportExtractionAborted(input.signal);
  const mrzFields = parsePassportMrzText(pdf.text);
  const fields = mergePassportFields(
    mrzFields,
    parsePassportVisualText(pdf.text, mrzFields),
  );

  if (!mrzFields.length && !hasUsableVisualPassportFields(fields)) {
    return {
      ...safeUnavailablePassportExtractionResult(input.applicantIndex),
      summary:
        "В PDF не найдена читаемая машиночитаемая зона паспорта. Загрузите разворот паспорта целиком или проверьте данные вручную.",
    };
  }

  const result: PassportExtractionResult = {
    applicantIndex: input.applicantIndex,
    fields,
    guardrails: [
      "Данные из паспорта нужно проверить вручную.",
      "Распознавание не является официальной проверкой.",
      "Пустые или сомнительные поля остаются незаполненными.",
    ],
    source: "local-ocr",
    status: "extracted",
    summary: `Локальный OCR обработал PDF паспорта и нашёл ${fields.length} полей. Проверьте их вручную перед отправкой.`,
  };
  const parsed = parsePassportExtractionResult(result);
  if (!parsed.ok) throw new Error(parsed.safeMessage);
  return parsed.data;
}

function localOcrSummary(fields: number, quality: PassportImageQualityReport | null) {
  const qualityNote =
    quality && quality.status !== "pass"
      ? ` ${passportImageQualitySummary(quality)}`
      : "";
  return `Локальный OCR нашёл ${fields} полей MRZ. Проверьте их вручную перед отправкой.${qualityNote}`;
}

function passportExtractionAbortError() {
  const error = new Error("Local passport OCR was cancelled.");
  error.name = "AbortError";
  return error;
}

function passportExtractionTimeoutError() {
  return new Error("Local passport OCR timed out.");
}

type PassportExtractionDeadline = {
  dispose(): void;
  error(): Error;
  signal: AbortSignal;
  throwIfCancelled(): void;
};

function createPassportExtractionDeadline(
  externalSignal: AbortSignal | undefined,
): PassportExtractionDeadline {
  const controller = new AbortController();
  let cancellationError: Error | null = null;
  const cancel = (error: Error) => {
    if (controller.signal.aborted) return;
    cancellationError = error;
    controller.abort(error);
  };
  const timeout = globalThis.setTimeout(
    () => cancel(passportExtractionTimeoutError()),
    localOcrTotalTimeoutMs,
  );
  const abort = () => cancel(passportExtractionAbortError());

  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener("abort", abort, { once: true });

  const error = () => cancellationError ?? passportExtractionAbortError();
  return {
    dispose() {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    },
    error,
    signal: controller.signal,
    throwIfCancelled() {
      if (controller.signal.aborted) throw error();
    },
  };
}

function throwIfPassportExtractionAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw passportExtractionAbortError();
}

async function racePassportExtractionTask<T>(
  task: Promise<T>,
  deadline: PassportExtractionDeadline,
): Promise<T> {
  deadline.throwIfCancelled();
  let rejectCancellation: ((error: Error) => void) | undefined;
  const cancel = () => rejectCancellation?.(deadline.error());
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
    if (deadline.signal.aborted) cancel();
    else deadline.signal.addEventListener("abort", cancel, { once: true });
  });

  try {
    return await Promise.race([task, cancellation]);
  } finally {
    deadline.signal.removeEventListener("abort", cancel);
  }
}

async function awaitPassportExtractionStep<T>(
  task: Promise<T>,
  deadline: PassportExtractionDeadline,
): Promise<T> {
  try {
    return await racePassportExtractionTask(task, deadline);
  } catch (error) {
    if (!deadline.signal.aborted) throw error;
    // Canvas/PDF preprocessing has no cancellation API. Do not release the
    // applicant queue until the in-flight step has actually settled.
    await task.then(
      () => undefined,
      () => undefined,
    );
    throw deadline.error();
  }
}

function appendLocalPassportOcrLifecycleBarrier(task: Promise<unknown>) {
  const previousBarrier = localPassportOcrWorkerLifecycleBarrier;
  localPassportOcrWorkerLifecycleBarrier = Promise.all([previousBarrier, task]).then(
    () => undefined,
  );
}

async function invalidateLocalPassportOcrWorker(
  lease: LocalPassportOcrWorkerLease,
  recognitionTask?: Promise<PassportOcrResponse>,
) {
  if (localPassportOcrWorkerPromise === lease.promise) {
    localPassportOcrWorkerPromise = null;
  }

  let shutdown = localPassportOcrWorkerShutdowns.get(lease.worker);
  if (!shutdown) {
    shutdown = (async () => {
      try {
        await lease.worker.terminate();
      } catch {
        // If termination cannot be confirmed, do not release the lifecycle
        // barrier until the in-flight recognition actually settles.
        if (recognitionTask) {
          await recognitionTask.then(
            () => undefined,
            () => undefined,
          );
        }
      }
    })();
    localPassportOcrWorkerShutdowns.set(lease.worker, shutdown);
  }

  appendLocalPassportOcrLifecycleBarrier(shutdown);
  await shutdown;
}

async function localPassportOcrWorkerBeforeDeadline(
  deadline: PassportExtractionDeadline,
): Promise<LocalPassportOcrWorkerLease> {
  const workerTask = localPassportOcrWorker();
  try {
    return await racePassportExtractionTask(workerTask, deadline);
  } catch (error) {
    if (!deadline.signal.aborted) throw error;
    // Worker bootstrap cannot be interrupted. Reserve the lifecycle barrier
    // immediately, then invalidate the worker as soon as creation settles.
    const cleanup = workerTask.then(
      (lease) => invalidateLocalPassportOcrWorker(lease),
      () => undefined,
    );
    appendLocalPassportOcrLifecycleBarrier(cleanup);
    await cleanup;
    throw deadline.error();
  }
}

async function recognizePassportOcrCandidate(
  lease: LocalPassportOcrWorkerLease,
  canvas: BrowserCanvas,
  deadline: PassportExtractionDeadline,
) {
  deadline.throwIfCancelled();
  const recognitionTask = Promise.resolve().then(() => lease.worker.recognize(canvas));

  try {
    return await racePassportExtractionTask(recognitionTask, deadline);
  } catch (error) {
    await invalidateLocalPassportOcrWorker(lease, recognitionTask);
    if (deadline.signal.aborted) throw deadline.error();
    throw error;
  }
}

type PassportExtractionInput =
  | {
      applicantIndex?: number;
      file?: SubmissionFile;
      localFile: File;
      openAiFallbackAllowed?: boolean;
      signal?: AbortSignal;
      submission?: Submission;
    }
  | {
      applicantIndex?: number;
      file: SubmissionFile;
      localFile?: File;
      openAiFallbackAllowed?: boolean;
      signal?: AbortSignal;
      submission: Submission;
    };

export async function invokePassportExtraction(
  input: PassportExtractionInput,
): Promise<PassportExtractionResult> {
  throwIfPassportExtractionAborted(input.signal);
  let localResult: PassportExtractionResult | null = null;
  if (input.localFile) {
    localResult = await invokeLocalPassportExtraction({
      applicantIndex: input.applicantIndex,
      localFile: input.localFile,
      signal: input.signal,
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

  throwIfPassportExtractionAborted(input.signal);

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
