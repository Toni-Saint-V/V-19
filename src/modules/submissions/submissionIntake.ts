import {
  passportScanUploadAccept,
  passportScanUploadFormatLabel,
  validatePassportScanUploadFile,
  type PassportScanUploadFileValidation,
} from "./mediaStoragePolicy";
import type {
  City,
  PassportExtractedField,
  PassportExtractionStatus,
  PassportUploadDraft,
  PreliminaryIntakeDraft,
  Submission,
  ApplicantRole,
} from "./types";

export const submissionIntakeFamilyMax = 6;
export { passportScanUploadAccept, passportScanUploadFormatLabel };

export type SubmissionIntakeDestination = "list" | "questionnaire";

export type PassportIntakeItem = {
  applicantIndex: number;
  extractedFields: PassportExtractedField[];
  file: File;
  fileName: string;
  id: string;
  status: Extract<
    PassportExtractionStatus,
    "extracting" | "failed" | "ready" | "selected" | "unavailable"
  >;
  summary: string;
};

export type SubmissionIntakeIntent = {
  applicantRoles?: ApplicantRole[];
  city: City;
  destination: SubmissionIntakeDestination;
  familyCount: number;
  passportUploads: PassportUploadDraft[];
  preliminaryIntake?: PreliminaryIntakeDraft;
  type: Submission["type"];
};

export type SubmissionIntakeProgress =
  | { stage: "saving_submission" }
  | {
      applicantIndex: number;
      current: number;
      stage: "uploading_passport";
      total: number;
    }
  | {
      applicantIndex: number;
      current: number;
      stage: "saving_passport_metadata";
      total: number;
    }
  | { stage: "complete" };

export type SubmissionIntakeProgressListener = (
  progress: SubmissionIntakeProgress,
) => void;

export type SubmissionIntakeSubmit = (
  intent: SubmissionIntakeIntent,
  onProgress: SubmissionIntakeProgressListener,
) => Promise<void> | void;

export type PassportIntakePreviewField = {
  confidenceLabel: "Проверьте" | "Распознано";
  key: PassportExtractedField["key"];
  label: string;
  value: string;
};

const passportFieldLabels: Record<PassportExtractedField["key"], string> = {
  birthCountry: "Страна рождения",
  birthDate: "Дата рождения",
  birthPlace: "Место рождения",
  citizenship: "Гражданство",
  firstName: "Имя",
  gender: "Пол",
  passportExpiresAt: "Срок действия",
  passportIssueCountry: "Страна выдачи",
  passportIssuePlace: "Место выдачи",
  passportIssuedAt: "Дата выдачи",
  passportNumber: "Номер паспорта",
  passportType: "Тип паспорта",
  surname: "Фамилия",
};

export function validatePassportIntakeFile(
  file: Pick<File, "name" | "size" | "type">,
): PassportScanUploadFileValidation {
  return validatePassportScanUploadFile(file);
}

export function passportUploadFromIntakeItem(
  item: PassportIntakeItem,
): PassportUploadDraft {
  return {
    applicantIndex: item.applicantIndex,
    extractedFields: item.extractedFields,
    file: item.file,
    fileName: item.fileName,
    id: item.id,
    status:
      item.status === "ready"
        ? "ready"
        : item.status === "failed"
          ? "failed"
          : "unavailable",
  };
}

export function passportIntakePreviewFields(
  item: PassportIntakeItem | undefined,
): PassportIntakePreviewField[] {
  if (!item) return [];

  return item.extractedFields.flatMap((field) => {
    const value = field.value.trim();
    if (!value) return [];
    return [
      {
        confidenceLabel:
          field.confidence === "high" && !field.needsManualReview
            ? "Распознано"
            : "Проверьте",
        key: field.key,
        label: passportFieldLabels[field.key],
        value,
      } satisfies PassportIntakePreviewField,
    ];
  });
}

export function passportIntakeApplicantName(
  item: PassportIntakeItem | undefined,
): string {
  if (!item) return "";
  const firstName = item.extractedFields.find(
    (field) => field.key === "firstName",
  )?.value;
  const surname = item.extractedFields.find((field) => field.key === "surname")?.value;
  return [firstName, surname]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
}

export function submissionIntakeApplicantCount(
  type: Submission["type"],
  requestedCount: number,
): number {
  if (type === "single") return 1;
  return Math.min(submissionIntakeFamilyMax, Math.max(2, requestedCount));
}
