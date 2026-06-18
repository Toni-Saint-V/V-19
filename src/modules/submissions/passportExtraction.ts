import { updateQuestionnaireField } from "./submissionActions";
import type {
  Applicant,
  PassportExtractedField,
  PassportExtractedFieldKey,
  PassportExtractionReviewState,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "./types";
import type { PassportExtractionResult } from "./passportExtractionContract";

export type PassportFieldApplyMode = "safe" | "replace";

export type PassportExtractionMappedField = {
  applied: boolean;
  confidence: PassportExtractedField["confidence"];
  conflict: boolean;
  currentValue: string;
  extractedValue: string;
  fieldId: string;
  fieldLabel: string;
  key: PassportExtractedFieldKey;
  needsManualReview: boolean;
  sectionId: string;
  sectionTitle: string;
};

export type PassportExtractionAttemptUsage = {
  used: number;
};

type PassportFieldTarget = {
  fieldId: string;
  label: string;
  sectionId: "personal" | "passport";
};

const passportFieldTargets: Record<PassportExtractedFieldKey, PassportFieldTarget> = {
  birthCountry: {
    fieldId: "birth-country",
    label: "Страна рождения",
    sectionId: "personal",
  },
  birthDate: {
    fieldId: "birth-date",
    label: "Дата рождения",
    sectionId: "personal",
  },
  birthPlace: {
    fieldId: "birth-place",
    label: "Место рождения",
    sectionId: "personal",
  },
  citizenship: {
    fieldId: "nationality",
    label: "Гражданство",
    sectionId: "personal",
  },
  firstName: {
    fieldId: "first-name",
    label: "Имя",
    sectionId: "personal",
  },
  gender: {
    fieldId: "gender",
    label: "Пол",
    sectionId: "personal",
  },
  passportExpiresAt: {
    fieldId: "passport-expiry-date",
    label: "Дата окончания паспорта",
    sectionId: "passport",
  },
  passportIssueCountry: {
    fieldId: "passport-issue-country",
    label: "Страна выдачи паспорта",
    sectionId: "passport",
  },
  passportIssuePlace: {
    fieldId: "passport-issue-place",
    label: "Место выдачи паспорта",
    sectionId: "passport",
  },
  passportIssuedAt: {
    fieldId: "passport-issue-date",
    label: "Дата выдачи паспорта",
    sectionId: "passport",
  },
  passportNumber: {
    fieldId: "passport-no",
    label: "Номер паспорта",
    sectionId: "passport",
  },
  passportType: {
    fieldId: "passport-type",
    label: "Тип паспорта",
    sectionId: "passport",
  },
  surname: {
    fieldId: "surname",
    label: "Фамилия",
    sectionId: "personal",
  },
};

function normalizeCompare(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function createRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `passport-extraction-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function safeAttemptCount(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 0;
}

function updateApplicantExtraction(
  submission: Submission,
  applicantId: string,
  update: (
    state: PassportExtractionReviewState | undefined,
  ) => PassportExtractionReviewState,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) =>
      applicant.id === applicantId
        ? {
            ...applicant,
            passportExtraction: update(applicant.passportExtraction),
          }
        : applicant,
    ),
    updatedAt: "сейчас",
  };
}

export function passportExtractionEnabledFromEnv(env: {
  readonly VITE_PASSPORT_EXTRACTION_ENABLED?: string;
}) {
  return ["1", "true", "yes", "on"].includes(
    (env.VITE_PASSPORT_EXTRACTION_ENABLED ?? "").trim().toLowerCase(),
  );
}

export function passportExtractionAttemptUsage(
  applicant: Applicant,
): PassportExtractionAttemptUsage {
  const state = applicant.passportExtraction;
  const used = safeAttemptCount(state?.attemptCount);

  return {
    used,
  };
}

export function canStartPassportExtraction(applicant: Applicant) {
  return applicant.passportExtraction?.status !== "extracting";
}

export function startPassportExtraction(
  submission: Submission,
  file: SubmissionFile,
): Submission {
  return updateApplicantExtraction(submission, file.applicantId, (state) => ({
    appliedFieldKeys: [],
    attemptCount: safeAttemptCount(state?.attemptCount) + 1,
    extractedFields: [],
    lastAttemptAtIso: new Date().toISOString(),
    sourceFileId: file.id,
    sourceFileName: file.originalFileName ?? file.generatedFileName,
    sourceStoragePath: file.storagePath,
    status: "extracting",
    summary: "Распознавание паспорта выполняется.",
  }));
}

export function finishPassportExtraction(
  submission: Submission,
  file: SubmissionFile,
  result: PassportExtractionResult,
): Submission {
  return updateApplicantExtraction(submission, file.applicantId, (state) => ({
    appliedFieldKeys: [],
    attemptCount: safeAttemptCount(state?.attemptCount),
    extractedFields: result.fields.map((field) => ({
      ...field,
      source: "passport_scan" as const,
      verified: false,
    })),
    lastAttemptAtIso: state?.lastAttemptAtIso,
    orientation: result.orientation,
    requestId: createRequestId(),
    sourceFileId: file.id,
    sourceFileName: file.originalFileName ?? file.generatedFileName,
    sourceStoragePath: file.storagePath,
    status: result.status === "extracted" ? "ready" : "unavailable",
    summary: result.summary,
  }));
}

export function failPassportExtraction(
  submission: Submission,
  file: SubmissionFile,
  error: string,
): Submission {
  return updateApplicantExtraction(submission, file.applicantId, (state) => ({
    appliedFieldKeys: [],
    attemptCount: safeAttemptCount(state?.attemptCount),
    error,
    extractedFields: [],
    lastAttemptAtIso: state?.lastAttemptAtIso,
    sourceFileId: file.id,
    sourceFileName: file.originalFileName ?? file.generatedFileName,
    sourceStoragePath: file.storagePath,
    status: "failed",
    summary: "Распознавание не выполнено. Заполните поля вручную.",
  }));
}

export function passportExtractionRows(
  applicant: Applicant,
): PassportExtractionMappedField[] {
  const state = applicant.passportExtraction;
  if (!state?.extractedFields.length) return [];

  return state.extractedFields.flatMap((field) => {
    const target = passportFieldTargets[field.key];
    const section = applicant.sections.find((item) =>
      item.fields.some((candidate) => candidate.id === target.fieldId),
    );
    const questionnaireField = section?.fields.find(
      (candidate) => candidate.id === target.fieldId,
    );
    if (!section || !questionnaireField) return [];

    const currentValue = questionnaireField.value.trim();
    const extractedValue = field.value.trim();
    const conflict =
      Boolean(currentValue) &&
      normalizeCompare(currentValue) !== normalizeCompare(extractedValue);

    return [
      {
        applied: state.appliedFieldKeys.includes(field.key),
        confidence: field.confidence,
        conflict,
        currentValue,
        extractedValue,
        fieldId: questionnaireField.id,
        fieldLabel: questionnaireField.label || target.label,
        key: field.key,
        needsManualReview: field.needsManualReview,
        sectionId: section.id,
        sectionTitle: section.title,
      },
    ];
  });
}

export function applyPassportExtractionField(
  submission: Submission,
  applicantId: string,
  key: PassportExtractedFieldKey,
  mode: PassportFieldApplyMode = "safe",
): Submission {
  const applicant = submission.applicants.find((item) => item.id === applicantId);
  if (!applicant?.passportExtraction) return submission;

  const row = passportExtractionRows(applicant).find((item) => item.key === key);
  if (!row) return submission;
  if (row.conflict && mode !== "replace") return submission;

  const withField = updateQuestionnaireField(submission, {
    applicantId,
    fieldId: row.fieldId,
    sectionId: row.sectionId,
    value: row.extractedValue,
  });

  return updateApplicantExtraction(withField, applicantId, (state) => ({
    ...state,
    appliedFieldKeys: Array.from(new Set([...(state?.appliedFieldKeys ?? []), key])),
    extractedFields: state?.extractedFields ?? [],
    status: state?.status ?? "ready",
  }));
}

export function hasPassportExtractionReviewPending(submission: Submission) {
  return submission.applicants.some((applicant) => {
    const state = applicant.passportExtraction;
    return (
      state?.status === "ready" &&
      state.extractedFields.length > 0 &&
      !state.verifiedAtIso &&
      !state.dismissedAtIso
    );
  });
}

export function requiresPassportExtractionReviewBeforeAction(
  submission: Submission,
  action: SubmissionAction,
) {
  return (
    (action === "submit_for_review" || action === "submit_corrections") &&
    hasPassportExtractionReviewPending(submission)
  );
}

export function markPassportExtractionReviewed(
  submission: Submission,
  mode: "verified" | "dismissed",
): Submission {
  const timestamp = new Date().toISOString();

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      const state = applicant.passportExtraction;
      if (state?.status !== "ready" || state.verifiedAtIso || state.dismissedAtIso) {
        return applicant;
      }

      return {
        ...applicant,
        passportExtraction: {
          ...state,
          dismissedAtIso: mode === "dismissed" ? timestamp : state.dismissedAtIso,
          verifiedAtIso: mode === "verified" ? timestamp : state.verifiedAtIso,
        },
      };
    }),
    history: [
      {
        id: `и-${submission.id}-паспорт-ocr-${mode}-${timestamp}`,
        text:
          mode === "verified"
            ? "Агент проверил распознанные паспортные данные перед отправкой"
            : "Агент отправил подачу без дополнительной проверки распознанных паспортных данных",
        at: "сейчас",
        source: "agent",
      },
      ...submission.history,
    ],
    updatedAt: "сейчас",
  };
}
