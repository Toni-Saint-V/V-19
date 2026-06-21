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

const mrzCountryNames: Record<string, string> = {
  ESP: "Spain",
  RUS: "Russian Federation",
};

type BrowserCanvas = {
  getContext(type: "2d"): {
    drawImage(image: BrowserImageBitmap, offsetX: number, offsetY: number): void;
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

function td3Line2Candidates(rawLine: string) {
  const line = rawLine.slice(0, 44);
  // OCR often appends noisy characters after TD3 line2; validate composite only
  // when the recognizer produced an exact 44-character MRZ line.
  const validateComposite = rawLine.length === 44;
  return Array.from(
    new Set([
      line,
      correctMrzLine2Digits(line, { includeDocumentNumber: false }),
      correctMrzLine2Digits(line, { includeDocumentNumber: true }),
    ]),
  ).map((candidate) => ({ line: candidate, validateComposite }));
}

function cleanMrzName(value: string) {
  return value.replace(/</g, " ").replace(/\s+/g, " ").trim();
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
  const [surnameRaw = "", givenRaw = ""] = namePart.split("<<");
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
  if (!quality || quality.status === "pass") return unavailable;

  return {
    ...unavailable,
    summary: `${unavailable.summary} ${passportImageQualitySummary(quality)}`,
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
  const rotations = [0, 90, 180, 270] as const;

  for (const rotation of rotations) {
    const canvas = await passportCanvasFromFile(input.localFile, rotation);
    const response = await recognize(canvas as Parameters<typeof recognize>[0], "eng");
    const fields = parsePassportMrzText(response.data.text);
    if (!fields.length) continue;

    const result: PassportExtractionResult = {
      applicantIndex: input.applicantIndex,
      fields,
      guardrails: [
        "Данные из паспорта нужно проверить вручную.",
        "Распознавание не является официальной проверкой.",
        "Пустые или сомнительные поля остаются незаполненными.",
      ],
      orientation: {
        corrected: rotation !== 0,
        reason: "mrz_detected",
        rotation,
      },
      source: "local-ocr",
      status: "extracted",
      summary:
        rotation === 0
          ? localOcrSummary(fields.length, quality)
          : `${localOcrSummary(fields.length, quality)} Паспорт был повернут на ${rotation}° по MRZ.`,
    };

    const parsed = parsePassportExtractionResult(result);
    if (!parsed.ok) throw new Error(parsed.safeMessage);
    return parsed.data;
  }

  return unavailableWithQuality(input.applicantIndex, quality);
}

function localOcrSummary(fields: number, quality: PassportImageQualityReport | null) {
  const qualityNote =
    quality && quality.status !== "pass" ? ` ${passportImageQualitySummary(quality)}` : "";
  return `Локальный OCR нашёл ${fields} полей MRZ. Проверьте их вручную перед отправкой.${qualityNote}`;
}

export async function invokePassportExtraction(input: {
  applicantIndex?: number;
  file: SubmissionFile;
  localFile?: File;
  submission: Submission;
}): Promise<PassportExtractionResult> {
  if (input.localFile) {
    return invokeLocalPassportExtraction({
      applicantIndex: input.applicantIndex,
      localFile: input.localFile,
    });
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
    return safeUnavailablePassportExtractionResult(input.applicantIndex);
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

  return parsed.data;
}
