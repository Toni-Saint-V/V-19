import {
  hasPassportExtractionReviewPending,
} from "./passportExtractionGuards";
import { passportExtractionRows } from "./passportExtraction";
import type {
  PassportExtractedFieldKey,
  PassportExtractionStatus,
  Submission,
  SubmissionAction,
} from "./types";

export type PassportExtractionBriefStatus =
  | "not_started"
  | "extracting"
  | "review_required"
  | "reviewed"
  | "failed"
  | "unavailable";

export type PassportExtractionNextStepAction =
  | "start_extraction"
  | "wait"
  | "apply_safe_fields"
  | "resolve_conflicts"
  | "verify_review"
  | "manual_entry"
  | "none";

export type PassportExtractionApplicantBrief = {
  applicantId: string;
  applicantName: string;
  appliedFieldKeys: PassportExtractedFieldKey[];
  conflictFieldKeys: PassportExtractedFieldKey[];
  extractedFieldKeys: PassportExtractedFieldKey[];
  lowConfidenceFieldKeys: PassportExtractedFieldKey[];
  manualReviewFieldKeys: PassportExtractedFieldKey[];
  safeApplyFieldKeys: PassportExtractedFieldKey[];
  sourceFileName?: string;
  status: PassportExtractionStatus | "not_started";
  summary: string;
};

export type PassportExtractionBrief = {
  applicants: PassportExtractionApplicantBrief[];
  blockedActions: SubmissionAction[];
  guardrails: string[];
  metrics: {
    applicantsTotal: number;
    applicantsWithExtraction: number;
    conflicts: number;
    fieldsApplied: number;
    fieldsExtracted: number;
    lowConfidenceFields: number;
    manualReviewFields: number;
    safeFieldsToApply: number;
  };
  nextStep: {
    action: PassportExtractionNextStepAction;
    label: string;
  };
  status: PassportExtractionBriefStatus;
  summary: string;
};

const blockedByPendingReview: SubmissionAction[] = [
  "submit_for_review",
  "submit_corrections",
];
const manualEntryLabel = "Заполните паспортные данные вручную";
const guardrails = [
  "Распознавание паспорта не является официальной проверкой.",
  "Перед отправкой нужно вручную проверить распознанные поля.",
  "Конфликтные значения не применяются автоматически.",
];

export function buildPassportExtractionBrief(
  submission: Submission,
): PassportExtractionBrief {
  let hasExpiryBlocker = false;
  const applicants: PassportExtractionApplicantBrief[] = submission.applicants.map(
    (applicant) => {
      const state = applicant.passportExtraction;
      const status: PassportExtractionStatus | "not_started" =
        state?.status ?? "not_started";
      const rows = passportExtractionRows(applicant);
      const extractedFieldKeys =
        state?.extractedFields.map((field) => {
          if (field.key === "passportExpiresAt") {
            hasExpiryBlocker ||= isExpiredPassportDate(field.value);
          }
          return field.key;
        }) ?? [];
      const appliedFieldKeys = state?.appliedFieldKeys ?? [];
      const conflictFieldKeys = rows
        .filter((row) => row.conflict)
        .map((row) => row.key);
      const safeApplyFieldKeys = rows
        .filter((row) => !row.conflict && !row.applied)
        .map((row) => row.key);
      const manualReviewFieldKeys =
        state?.extractedFields
          .filter((field) => field.needsManualReview)
          .map((field) => field.key) ?? [];
      const lowConfidenceFieldKeys =
        state?.extractedFields
          .filter((field) => field.confidence === "low")
          .map((field) => field.key) ?? [];

      return {
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        appliedFieldKeys,
        conflictFieldKeys,
        extractedFieldKeys,
        lowConfidenceFieldKeys,
        manualReviewFieldKeys,
        safeApplyFieldKeys,
        sourceFileName: state?.sourceFileName,
        status,
        summary: applicantSummary(
          status,
          extractedFieldKeys.length,
          conflictFieldKeys.length,
          safeApplyFieldKeys.length,
        ),
      };
    },
  );

  const metrics = {
    applicantsTotal: applicants.length,
    applicantsWithExtraction: applicants.filter(
      (applicant) => applicant.status !== "not_started",
    ).length,
    conflicts: applicants.reduce(
      (sum, applicant) => sum + applicant.conflictFieldKeys.length,
      0,
    ),
    fieldsApplied: applicants.reduce(
      (sum, applicant) => sum + applicant.appliedFieldKeys.length,
      0,
    ),
    fieldsExtracted: applicants.reduce(
      (sum, applicant) => sum + applicant.extractedFieldKeys.length,
      0,
    ),
    lowConfidenceFields: applicants.reduce(
      (sum, applicant) => sum + applicant.lowConfidenceFieldKeys.length,
      0,
    ),
    manualReviewFields: applicants.reduce(
      (sum, applicant) => sum + applicant.manualReviewFieldKeys.length,
      0,
    ),
    safeFieldsToApply: applicants.reduce(
      (sum, applicant) => sum + applicant.safeApplyFieldKeys.length,
      0,
    ),
  };
  const status = briefStatus(submission, applicants);
  const blockedActions = hasPassportExtractionReviewPending(submission)
    ? blockedByPendingReview
    : [];

  return {
    applicants,
    blockedActions,
    guardrails,
    metrics,
    nextStep: nextStep(status, metrics, hasExpiryBlocker),
    status,
    summary: briefSummary(status, metrics),
  };
}

function isExpiredPassportDate(value: string, now = new Date()): boolean {
  const parsed = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!parsed) return false;

  const day = Number(parsed[1]);
  const month = Number(parsed[2]);
  const year = Number(parsed[3]);
  const expiry = new Date(year, month - 1, day);
  if (
    expiry.getFullYear() !== year ||
    expiry.getMonth() !== month - 1 ||
    expiry.getDate() !== day
  ) {
    return false;
  }

  const endOfExpiryDay = new Date(year, month - 1, day + 1).getTime();
  return endOfExpiryDay <= now.getTime();
}

function briefStatus(
  submission: Submission,
  applicants: PassportExtractionApplicantBrief[],
): PassportExtractionBriefStatus {
  if (applicants.some((applicant) => applicant.status === "extracting")) {
    return "extracting";
  }
  if (hasPassportExtractionReviewPending(submission)) {
    return "review_required";
  }
  if (applicants.some((applicant) => applicant.status === "failed")) {
    return "failed";
  }
  if (applicants.some((applicant) => applicant.status === "unavailable")) {
    return "unavailable";
  }
  if (
    applicants.some((applicant) =>
      ["ready", "uploaded", "selected"].includes(applicant.status),
    )
  ) {
    return "reviewed";
  }
  return "not_started";
}

function nextStep(
  status: PassportExtractionBriefStatus,
  metrics: PassportExtractionBrief["metrics"],
  hasExpiryBlocker: boolean,
): PassportExtractionBrief["nextStep"] {
  if (status === "extracting") {
    return { action: "wait", label: "Дождитесь завершения распознавания" };
  }
  if (metrics.conflicts > 0) {
    return {
      action: "resolve_conflicts",
      label: "Разберите конфликтные паспортные поля вручную",
    };
  }
  if (hasExpiryBlocker) {
    return {
      action: "manual_entry",
      label: manualEntryLabel,
    };
  }
  if (metrics.safeFieldsToApply > 0) {
    return {
      action: "apply_safe_fields",
      label: "Примените безопасные поля в анкету",
    };
  }
  if (status === "review_required") {
    return {
      action: "verify_review",
      label: "Подтвердите ручную проверку паспортных данных",
    };
  }
  if (status === "failed" || status === "unavailable") {
    return {
      action: "manual_entry",
      label: manualEntryLabel,
    };
  }
  if (status === "not_started") {
    return {
      action: "start_extraction",
      label: "Загрузите скан паспорта и запустите распознавание",
    };
  }
  return { action: "none", label: "Паспортные данные проверены" };
}

function briefSummary(
  status: PassportExtractionBriefStatus,
  metrics: PassportExtractionBrief["metrics"],
) {
  if (status === "not_started") {
    return "Распознавание паспорта еще не запускалось.";
  }
  if (status === "extracting") {
    return "Распознавание паспорта выполняется.";
  }
  if (status === "review_required") {
    return `Найдено ${metrics.fieldsExtracted} паспортных полей, требуется ручная проверка.`;
  }
  if (status === "failed") {
    return "Распознавание паспорта завершилось ошибкой.";
  }
  if (status === "unavailable") {
    return "Распознавание паспорта недоступно для части данных.";
  }
  return `Проверено ${metrics.fieldsApplied}/${metrics.fieldsExtracted} распознанных паспортных полей.`;
}

function applicantSummary(
  status: PassportExtractionStatus | "not_started",
  fields: number,
  conflicts: number,
  safeFields: number,
) {
  if (status === "not_started") return "Скан паспорта еще не распознавался.";
  if (status === "extracting") return "Распознавание выполняется.";
  if (status === "failed") return "Распознавание завершилось ошибкой.";
  if (status === "unavailable") return "Распознавание недоступно.";
  if (conflicts) return `${fields} полей найдено, ${conflicts} конфликтуют с анкетой.`;
  if (safeFields) return `${fields} полей найдено, ${safeFields} можно применить.`;
  return `${fields} паспортных полей готовы к ручной проверке.`;
}
