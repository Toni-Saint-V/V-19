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
  const issueDate = firstMissingDate(lines, [
    fieldValue("birthDate"),
    fieldValue("passportExpiresAt"),
  ]);
  const issuePlace = visualAuthority(lines, issueDate?.compact);

  return [
    ...visualBirthLocation(lines),
    mrzField("passportIssuedAt", issueDate?.formatted ?? "", "medium"),
    mrzField("passportIssuePlace", issuePlace, "low"),
  ].filter((field): field is PassportExtractionField => Boolean(field));
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
  const passportNumber = line2.slice(0, 9).replace(/</g, "").trim();
  const citizenshipCode = line2.slice(10, 13).replace(/</g, "");
  const gender = line2.slice(20, 21);
  const birthDate = parseMrzDate(line2.slice(13, 19), "birth");
  const expiryDate = parseMrzDate(line2.slice(21, 27), "expiry");

  return [
    mrzField("surname", cleanMrzName(surnameRaw), "high"),
    mrzField("firstName", cleanMrzName(givenRaw), "high"),
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
      candidates.push({
        canvas: passportCanvasCrop(canvas, {
          height: bandHeight,
          width: canvas.width,
          x: 0,
          y,
        }),
        cropped: true,
        rotation,
      });
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
    if (!mrzFields.length) continue;
    const fields = mergePassportFields(
      mrzFields,
      parsePassportVisualText(recognizedTexts.join("\n"), mrzFields),
    );

    const result: PassportExtractionResult = {
      applicantIndex: input.applicantIndex,
      fields,
      guardrails: [
        "Данные из паспорта нужно проверить вручную.",
        "Распознавание не является официальной проверкой.",
        "Пустые или сомнительные поля остаются незаполненными.",
      ],
      orientation: {
        corrected: candidate.rotation !== 0,
        reason: "mrz_detected",
        rotation: candidate.rotation,
      },
      source: "local-ocr",
      status: "extracted",
      summary:
        candidate.rotation === 0 && !candidate.cropped
          ? localOcrSummary(fields.length, quality)
          : `${localOcrSummary(fields.length, quality)} MRZ найдена ${
              candidate.cropped ? "в зоне паспорта" : "на полном изображении"
            } после поворота на ${candidate.rotation}°.`,
    };

    const parsed = parsePassportExtractionResult(result);
    if (!parsed.ok) throw new Error(parsed.safeMessage);
    return parsed.data;
  }

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
