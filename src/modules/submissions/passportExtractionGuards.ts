import type {
  Applicant,
  PassportExtractedFieldKey,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "./types";
import { isCompletedFileAsset } from "./fileAsset";

export type PassportGateIssue = {
  applicantId: string;
  applicantName: string;
  code:
    | "duplicate_passport"
    | "passport_expired"
    | "passport_expires_before_trip"
    | "passport_issued_after_expiry"
    | "passport_extraction_not_reviewed"
    | "passport_not_confirmed"
    | "passport_number_missing"
    | "passport_number_unexpected_format"
    | "passport_type_not_ordinary";
  message: string;
};

const passportQuestionnaireFieldIds: Record<PassportExtractedFieldKey, string> = {
  birthCountry: "birth-country",
  birthDate: "birth-date",
  birthPlace: "birth-place",
  citizenship: "nationality",
  firstName: "first-name",
  gender: "gender",
  passportExpiresAt: "passport-expiry-date",
  passportIssueCountry: "passport-issue-country",
  passportIssuePlace: "passport-issue-place",
  passportIssuedAt: "passport-issue-date",
  passportNumber: "passport-no",
  passportType: "passport-type",
  surname: "surname",
};

const passportGateActions = new Set<SubmissionAction>([
  "submit_for_review",
  "submit_corrections",
  "accept",
  "close_issues_accept",
  "generate_export",
  "mark_exported",
]);

export function hasPassportExtractionReviewPending(submission: Submission) {
  return submission.applicants.some(hasApplicantPassportExtractionReviewPending);
}

export function hasApplicantPassportExtractionReviewPending(applicant: Applicant) {
  const state = applicant.passportExtraction;
  return (
    state?.status === "ready" &&
    state.extractedFields.length > 0 &&
    !state.verifiedAtIso &&
    !state.dismissedAtIso &&
    !hasPersistedPassportExtractionReview(applicant)
  );
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

export function passportGateIssues(
  submission: Submission,
  now: Date = new Date(),
): PassportGateIssue[] {
  const issues = submission.applicants.flatMap((applicant) =>
    applicantPassportGateIssues(applicant, submission, now),
  );

  const owners = new Map<string, Applicant[]>();
  for (const applicant of submission.applicants) {
    const passportNumber = passportNumberForDuplicateCheck(applicant, submission);
    if (!passportNumber) continue;
    owners.set(passportNumber, [...(owners.get(passportNumber) ?? []), applicant]);
  }

  for (const [passportNumber, applicants] of owners.entries()) {
    if (applicants.length < 2) continue;
    const names = applicants.map((applicant) => applicant.fullName).join(", ");
    issues.push(
      ...applicants.map((applicant) => ({
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        code: "duplicate_passport" as const,
        message: `Один номер паспорта ${passportNumber} указан у нескольких заявителей: ${names}.`,
      })),
    );
  }

  return issues;
}

export function requiresPassportGateBeforeAction(
  submission: Submission,
  action: SubmissionAction,
  now: Date = new Date(),
) {
  return (
    passportGateActions.has(action) && passportGateIssues(submission, now).length > 0
  );
}

export function passportGateReason(submission: Submission, now: Date = new Date()) {
  const firstIssue = passportGateIssues(submission, now)[0];
  return firstIssue?.message ?? "Паспортные данные не прошли боевую проверку.";
}

function applicantPassportGateIssues(
  applicant: Applicant,
  submission: Submission,
  now: Date,
): PassportGateIssue[] {
  const state = applicant.passportExtraction;
  const file = passportFileForApplicant(submission, applicant.id);

  if (!state) {
    return hasRealPassportUpload(file)
      ? [issue(applicant, "passport_not_confirmed", "Скан паспорта не проверен.")]
      : [];
  }

  if (state.status === "extracting") {
    return [issue(applicant, "passport_not_confirmed", "Дождитесь проверки скана.")];
  }

  const canUseQuestionnaireFallback =
    state.status === "ready" ||
    ((state.status === "failed" || state.status === "unavailable") &&
      hasRealPassportUpload(file));

  if (state.status === "ready" && !state.extractedFields.length) {
    return [
      issue(applicant, "passport_not_confirmed", "Паспортные данные не прочитаны."),
    ];
  }

  const issues: PassportGateIssue[] = [];
  const passportNumber = normalizePassportNumber(
    passportGateValue(applicant, "passportNumber", canUseQuestionnaireFallback),
  );
  const passportType = normalizeText(
    passportGateValue(applicant, "passportType", canUseQuestionnaireFallback),
  );
  const issuedAt = parseDate(
    passportGateValue(applicant, "passportIssuedAt", canUseQuestionnaireFallback),
  );
  const expiresAt = parseDate(
    passportGateValue(applicant, "passportExpiresAt", canUseQuestionnaireFallback),
  );
  const tripDate =
    parseDate(questionnaireValue(applicant, "travel-date")) ??
    parseDate(submission.tripDateFrom);

  if (!passportNumber) {
    issues.push(
      issue(applicant, "passport_number_missing", "Не найден номер загранпаспорта."),
    );
  } else if (!/^\d{8,9}$/.test(passportNumber)) {
    issues.push(
      issue(
        applicant,
        "passport_number_unexpected_format",
        `Номер паспорта ${passportNumber} имеет неожиданный формат.`,
      ),
    );
  }

  if (passportType && !passportType.includes("ORDINARY PASSPORT")) {
    issues.push(
      issue(
        applicant,
        "passport_type_not_ordinary",
        "Загруженный документ не подтвержден как обычный загранпаспорт.",
      ),
    );
  }

  if (issuedAt && expiresAt && issuedAt > expiresAt) {
    issues.push(
      issue(
        applicant,
        "passport_issued_after_expiry",
        "Дата выдачи паспорта позже даты окончания.",
      ),
    );
  }

  if (expiresAt && startOfDay(expiresAt) < startOfDay(now)) {
    issues.push(
      issue(
        applicant,
        "passport_expired",
        `Паспорт ${passportNumber || applicant.fullName} просрочен.`,
      ),
    );
  }

  if (expiresAt && tripDate && expiresAt < tripDate) {
    issues.push(
      issue(
        applicant,
        "passport_expires_before_trip",
        "Паспорт заканчивается раньше даты поездки.",
      ),
    );
  }

  if (
    issues.length === 0 &&
    state.status === "ready" &&
    !state.verifiedAtIso &&
    !state.dismissedAtIso &&
    !hasPersistedPassportExtractionReview(applicant)
  ) {
    issues.push(
      issue(
        applicant,
        "passport_extraction_not_reviewed",
        "Проверьте распознанные паспортные данные перед отправкой",
      ),
    );
  }

  return issues;
}

function hasPersistedPassportExtractionReview(applicant: Applicant) {
  const state = applicant.passportExtraction;
  if (state?.status !== "ready" || state.extractedFields.length === 0) {
    return false;
  }

  const appliedFieldKeys = new Set(state.appliedFieldKeys);
  const questionnaireFields = new Map(
    applicant.sections
      .flatMap((section) => section.fields)
      .map((field) => [field.id, field]),
  );

  return state.extractedFields.every((extractedField) => {
    const field = questionnaireFields.get(
      passportQuestionnaireFieldIds[extractedField.key],
    );
    const reviewOrigin = field?.reviewOriginSource ?? field?.reviewSource;
    const hasQuestionnaireProof =
      appliedFieldKeys.has(extractedField.key) &&
      reviewOrigin === "passport_ocr" &&
      field?.reviewState === "confirmed" &&
      Boolean(field.reviewConfirmedAtIso) &&
      Boolean(field.reviewConfirmedBy);
    const hasExtractionProof =
      extractedField.verified === true &&
      Boolean(field?.value.trim()) &&
      !field?.error &&
      field?.reviewState !== "needs_review" &&
      normalizeText(field?.value ?? "") === normalizeText(extractedField.value);

    return hasQuestionnaireProof || hasExtractionProof;
  });
}

function passportNumberForDuplicateCheck(applicant: Applicant, submission: Submission) {
  const extracted = normalizePassportNumber(passportValue(applicant, "passportNumber"));
  if (extracted) return extracted;

  const state = applicant.passportExtraction;
  const file = passportFileForApplicant(submission, applicant.id);
  if (!state?.verifiedAtIso && !hasRealPassportUpload(file)) return "";

  return normalizePassportNumber(questionnaireValue(applicant, "passport-no"));
}

function passportFileForApplicant(submission: Submission, applicantId: string) {
  return submission.files.find(
    (file) => file.applicantId === applicantId && file.type === "passport_scan",
  );
}

function hasRealPassportUpload(file: SubmissionFile | undefined) {
  return Boolean(
    file &&
    isCompletedFileAsset(file) &&
    (file.mimeType ||
      file.originalFileName ||
      file.generatedFileName ||
      file.storagePath ||
      file.storageBucket),
  );
}

function issue(
  applicant: Applicant,
  code: PassportGateIssue["code"],
  message: string,
): PassportGateIssue {
  return {
    applicantId: applicant.id,
    applicantName: applicant.fullName,
    code,
    message,
  };
}

function passportValue(applicant: Applicant, key: PassportExtractedFieldKey) {
  return (
    applicant.passportExtraction?.extractedFields.find((field) => field.key === key)
      ?.value ?? ""
  );
}

function passportGateValue(
  applicant: Applicant,
  key: PassportExtractedFieldKey,
  useQuestionnaireFallback: boolean,
) {
  const extracted = passportValue(applicant, key).trim();
  if (extracted || !useQuestionnaireFallback) return extracted;

  const fieldId = passportQuestionnaireFieldIds[key];
  if (!fieldId) return extracted;

  return questionnaireValue(applicant, fieldId);
}

function questionnaireValue(applicant: Applicant, fieldId: string) {
  return (
    applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)
      ?.value.trim() ?? ""
  );
}

function normalizePassportNumber(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function parseDate(value: string) {
  const trimmed = value.trim();
  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(trimmed);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!dotted && !iso) return null;

  const year = Number(iso ? iso[1] : dotted?.[3]);
  const month = Number(iso ? iso[2] : dotted?.[2]);
  const day = Number(iso ? iso[3] : dotted?.[1]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
