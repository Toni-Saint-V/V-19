import type { Applicant, SubmissionFileType } from "./types";

export const submissionDocumentTypes = [
  "selfie",
  "selfie_2",
  "passport_scan",
  "pdf",
] as const;

export type SubmissionDocumentType = (typeof submissionDocumentTypes)[number];

export const submissionFilesBucket = "submission-files" as const;

export const missingPassportUploadMessage =
  "Сначала укажите номер паспорта заявителя";

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const pdfMimeType = "application/pdf";
const imageMaxBytes = 10 * 1024 * 1024;
const pdfMaxBytes = 25 * 1024 * 1024;

export type SubmissionDocumentValidationResult =
  | { ok: true; extension: SubmissionDocumentExtension }
  | { ok: false; safeMessage: string };

export type SubmissionDocumentExtension = "jpg" | "png" | "webp" | "pdf";

export function isSubmissionDocumentType(
  value: unknown,
): value is SubmissionDocumentType {
  return submissionDocumentTypes.includes(value as SubmissionDocumentType);
}

export function documentTypeForSubmissionFileType(
  fileType: SubmissionFileType,
): SubmissionDocumentType | null {
  return isSubmissionDocumentType(fileType) ? fileType : null;
}

export function normalizePassportNumber(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]+/g, "");
}

export function passportNumberFromApplicant(applicant: Applicant): string {
  return (
    applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "passport-no")
      ?.value.trim() ?? ""
  );
}

export function normalizedPassportNumberFromApplicant(
  applicant: Applicant,
): string {
  return normalizePassportNumber(passportNumberFromApplicant(applicant));
}

export function validateSubmissionDocumentFile(
  file: Pick<File, "name" | "size" | "type">,
  documentType: SubmissionDocumentType,
): SubmissionDocumentValidationResult {
  const extension = extensionForMimeType(file.type);
  if (!extension) {
    return {
      ok: false,
      safeMessage: allowedTypeMessage(documentType),
    };
  }

  if (!isMimeAllowedForDocumentType(file.type, documentType)) {
    return {
      ok: false,
      safeMessage: allowedTypeMessage(documentType),
    };
  }

  if (!Number.isInteger(file.size) || file.size <= 0) {
    return {
      ok: false,
      safeMessage: "Файл пустой. Загрузите документ заново.",
    };
  }

  const maxBytes = extension === "pdf" ? pdfMaxBytes : imageMaxBytes;
  if (file.size > maxBytes) {
    return {
      ok: false,
      safeMessage:
        extension === "pdf"
          ? "PDF больше 25 МБ. Загрузите облегчённый файл."
          : "Изображение больше 10 МБ. Сожмите файл или загрузите другой.",
    };
  }

  return { ok: true, extension };
}

export function defaultExtensionForDocumentType(
  documentType: SubmissionDocumentType,
): SubmissionDocumentExtension {
  return documentType === "selfie" || documentType === "selfie_2" ? "jpg" : "pdf";
}

export function buildSubmissionDocumentFileName(input: {
  documentType: SubmissionDocumentType;
  extension: SubmissionDocumentExtension;
  normalizedPassportNumber: string;
}): string {
  return `${input.normalizedPassportNumber}_${input.documentType}.${input.extension}`;
}

export function expectedSubmissionDocumentFileName(input: {
  applicant: Applicant;
  documentType: SubmissionDocumentType;
  extension?: SubmissionDocumentExtension;
}): { fileName: string; ok: true } | { ok: false; safeMessage: string } {
  const normalizedPassportNumber = normalizedPassportNumberFromApplicant(
    input.applicant,
  );
  if (!normalizedPassportNumber) {
    return { ok: false, safeMessage: missingPassportUploadMessage };
  }

  return {
    ok: true,
    fileName: buildSubmissionDocumentFileName({
      documentType: input.documentType,
      extension: input.extension ?? defaultExtensionForDocumentType(input.documentType),
      normalizedPassportNumber,
    }),
  };
}

export function buildSubmissionDocumentStoragePath(input: {
  applicantId: string;
  fileName: string;
  submissionId: string;
}): string {
  return `${safeStorageSegment(input.submissionId, "submissionId")}/${safeStorageSegment(
    input.applicantId,
    "applicantId",
  )}/${safeStorageSegment(input.fileName, "fileName")}`;
}

export function buildSubmissionDocumentIdentity(input: {
  applicant: Applicant;
  documentType: SubmissionDocumentType;
  extension: SubmissionDocumentExtension;
  submissionId: string;
}):
  | {
      fileName: string;
      filePath: string;
      normalizedPassportNumber: string;
      ok: true;
    }
  | { ok: false; safeMessage: string } {
  const normalizedPassportNumber = normalizedPassportNumberFromApplicant(
    input.applicant,
  );
  if (!normalizedPassportNumber) {
    return { ok: false, safeMessage: missingPassportUploadMessage };
  }

  const fileName = buildSubmissionDocumentFileName({
    documentType: input.documentType,
    extension: input.extension,
    normalizedPassportNumber,
  });

  return {
    fileName,
    filePath: buildSubmissionDocumentStoragePath({
      applicantId: input.applicant.id,
      fileName,
      submissionId: input.submissionId,
    }),
    normalizedPassportNumber,
    ok: true,
  };
}

export function extensionForMimeType(
  mimeType: string,
): SubmissionDocumentExtension | null {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === pdfMimeType) return "pdf";
  return null;
}

export function acceptForDocumentType(documentType: SubmissionDocumentType): string {
  if (documentType === "pdf") return pdfMimeType;
  if (documentType === "passport_scan") {
    return [...imageMimeTypes, pdfMimeType].join(",");
  }
  return imageMimeTypes.join(",");
}

function isMimeAllowedForDocumentType(
  mimeType: string,
  documentType: SubmissionDocumentType,
): boolean {
  if (documentType === "pdf") return mimeType === pdfMimeType;
  if (documentType === "passport_scan") {
    return mimeType === pdfMimeType || imageMimeTypes.includes(mimeType as never);
  }
  return imageMimeTypes.includes(mimeType as never);
}

function allowedTypeMessage(documentType: SubmissionDocumentType): string {
  if (documentType === "pdf") return "Для PDF принимается только application/pdf.";
  if (documentType === "passport_scan") {
    return "Для скана паспорта принимаются JPG, PNG, WEBP или PDF.";
  }
  return "Для фото принимаются только JPG, PNG или WEBP.";
}

function safeStorageSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error(`${label} is required for document storage path.`);
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`${label} contains unsafe characters.`);
  }
  return normalized;
}
