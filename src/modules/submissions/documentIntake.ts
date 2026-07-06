import { maxVisaApplicationPdfBytes } from "./visaApplicationPdfReviewTypes";
import {
  documentTypeForSubmissionFileType,
  validateSubmissionDocumentFile,
} from "./documentUploadContract";
import type { Submission, SubmissionFile, SubmissionFileType } from "./types";

export type IntakeFileKind = "image" | "pdf" | "unknown";

export type UploadGuardCode =
  | "file_empty"
  | "file_too_large"
  | "passport_type"
  | "selfie_type"
  | "unsupported_slot"
  | "unsupported_type";

export type UploadGuardResult =
  | {
      code?: never;
      fileKind: IntakeFileKind;
      ok: true;
      safeMessage?: never;
      sizeLabel: string;
    }
  | {
      code: UploadGuardCode;
      fileKind?: IntakeFileKind;
      ok: false;
      safeMessage: string;
      sizeLabel: string;
    };

export type DocumentReadinessSummary = {
  acceptedSlots: number;
  applicantCount: number;
  missingRequiredSlots: number;
  ready: boolean;
  replacementRequiredSlots: number;
  requiredSlots: number;
  trackedOptionalSlots: number;
  uploadedSlots: number;
};

export const requiredExportDocumentTypes = [
  "passport_scan",
  "selfie",
  "selfie_2",
  "pdf",
] as const satisfies readonly SubmissionFileType[];

export const optionalTrackedDocumentTypes = [] as const satisfies readonly SubmissionFileType[];

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
const pdfExtensions = [".pdf"];

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = value >= 10 || index === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[index]}`;
}

export function intakeFileKind(file: File): IntakeFileKind {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || pdfExtensions.some((ext) => name.endsWith(ext))) {
    return "pdf";
  }
  if (imageMimeTypes.has(file.type) || imageExtensions.some((ext) => name.endsWith(ext))) {
    return "image";
  }
  return "unknown";
}

export function validateSubmissionFileUpload(
  file: File,
  slotType: SubmissionFile["type"],
): UploadGuardResult {
  const sizeLabel = formatFileSize(file.size);
  const fileKind = intakeFileKind(file);
  const documentType = documentTypeForSubmissionFileType(slotType);
  if (documentType) {
    const validation = validateSubmissionDocumentFile(file, documentType);
    if (validation.ok) return { fileKind, ok: true, sizeLabel };

    return {
      code:
        file.size <= 0
          ? "file_empty"
          : validation.safeMessage.includes("МБ")
            ? "file_too_large"
            : slotType === "passport_scan"
              ? "passport_type"
              : slotType === "selfie" || slotType === "selfie_2"
                ? "selfie_type"
                : "unsupported_type",
      fileKind,
      ok: false,
      safeMessage: validation.safeMessage,
      sizeLabel,
    };
  }

  return {
    code: "unsupported_slot",
    fileKind,
    ok: false,
    safeMessage: "Этот слот документа не входит в канонический V-19 media contract.",
    sizeLabel,
  };
}

export function validateVisaApplicationPdfUpload(file: File): UploadGuardResult {
  const sizeLabel = formatFileSize(file.size);
  const fileKind = intakeFileKind(file);

  if (file.size <= 0) {
    return {
      code: "file_empty",
      ok: false,
      safeMessage: "PDF анкеты пустой. Экспортируйте анкету ещё раз.",
      sizeLabel,
    };
  }

  if (fileKind !== "pdf") {
    return {
      code: "unsupported_type",
      fileKind,
      ok: false,
      safeMessage: "Загрузите именно PDF анкеты, не изображение и не архив.",
      sizeLabel,
    };
  }

  if (file.size > maxVisaApplicationPdfBytes) {
    return {
      code: "file_too_large",
      fileKind,
      ok: false,
      safeMessage: "PDF анкеты больше 25 МБ. Разделите файл или экспортируйте облегчённую версию.",
      sizeLabel,
    };
  }

  return { fileKind, ok: true, sizeLabel };
}

export function summarizeSubmissionDocumentReadiness(
  submission: Submission,
): DocumentReadinessSummary {
  const requiredSlots = submission.applicants.length * requiredExportDocumentTypes.length;
  const trackedOptionalSlots = submission.applicants.length * optionalTrackedDocumentTypes.length;
  const acceptedSlots = submission.files.filter((file) => file.status === "accepted").length;
  const uploadedSlots = submission.files.filter((file) =>
    file.status === "uploaded" || file.status === "pending_review" || file.status === "accepted",
  ).length;
  const missingRequiredSlots = submission.applicants.reduce(
    (sum, applicant) =>
      sum +
      requiredExportDocumentTypes.filter((type) => {
        const slot = submission.files.find(
          (file) => file.applicantId === applicant.id && file.type === type,
        );
        return !slot || slot.status === "missing";
      }).length,
    0,
  );
  const replacementRequiredSlots = submission.files.filter(
    (file) => file.status === "needs_replacement",
  ).length;

  return {
    acceptedSlots,
    applicantCount: submission.applicants.length,
    missingRequiredSlots,
    ready: missingRequiredSlots === 0 && replacementRequiredSlots === 0,
    replacementRequiredSlots,
    requiredSlots,
    trackedOptionalSlots,
    uploadedSlots,
  };
}

export function documentReadinessLabel(summary: DocumentReadinessSummary) {
  if (summary.replacementRequiredSlots > 0) {
    return `${summary.replacementRequiredSlots} на замену`;
  }
  if (summary.missingRequiredSlots > 0) {
    return `${summary.missingRequiredSlots} не хватает`;
  }
  return `${summary.uploadedSlots}/${summary.requiredSlots} файлов`;
}
