// src/modules/submissions/passportReviewContract.ts
import { questionnaireFieldMatchesTarget } from "./questionnaire";

export const ADMIN_PASSPORT_REVIEW_FIELD_IDS = [
  "first-name",
  "surname",
  "gender",
  "birth-date",
  "birth-place",
  "birth-country",
  "nationality",
  "passport-type",
  "passport-no",
  "passport-issue-date",
  "passport-expiry-date",
  "passport-issue-country",
  "passport-issue-place",
] as const;

export type AdminPassportReviewFieldId =
  (typeof ADMIN_PASSPORT_REVIEW_FIELD_IDS)[number];

export const ADMIN_PASSPORT_REVIEW_FIELD_LABELS: Record<
  AdminPassportReviewFieldId,
  string
> = {
  "first-name": "Имя",
  surname: "Фамилия",
  gender: "Пол",
  "birth-date": "Дата рождения",
  "birth-place": "Место рождения",
  "birth-country": "Страна рождения",
  nationality: "Гражданство",
  "passport-type": "Тип документа",
  "passport-no": "Номер паспорта",
  "passport-issue-date": "Дата выдачи",
  "passport-expiry-date": "Действителен до",
  "passport-issue-country": "Страна выдачи",
  "passport-issue-place": "Кем / где выдан",
};

export const PRIMARY_APPLICANT_REQUIRED_MEDIA_TYPES = [
  "passport_scan",
  "selfie",
  "selfie_2",
] as const;

export const SECONDARY_FAMILY_APPLICANT_REQUIRED_MEDIA_TYPES = [
  "passport_scan",
] as const;

export type PassportReviewMediaType =
  (typeof PRIMARY_APPLICANT_REQUIRED_MEDIA_TYPES)[number];

type PassportReviewApplicant = {
  id: string;
  role?: string;
};

type PassportReviewIssue = {
  status: string;
  target: {
    applicantId?: string;
    field?: string;
    fileType?: string;
  };
};

type PassportReviewIssueField = {
  id: string;
  label: string;
};

type PassportReviewSubmission = {
  applicants: readonly PassportReviewApplicant[];
  issues?: readonly PassportReviewIssue[];
};

export type RequiredPassportReviewMediaSlot = {
  applicantId: string;
  type: PassportReviewMediaType;
};

export function isAdminPassportReviewFieldId(
  fieldId: string,
): fieldId is AdminPassportReviewFieldId {
  return ADMIN_PASSPORT_REVIEW_FIELD_IDS.some((candidate) => candidate === fieldId);
}

export function hasAdminPassportReviewValue(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return Boolean(normalized) && normalized !== "—" && normalized !== "не заполнено";
}

export function primaryApplicantIdForPassportReview(
  submission: PassportReviewSubmission,
): string | undefined {
  const explicitPrimaryApplicants = submission.applicants.filter(
    (applicant) => applicant.role === "main",
  );
  if (explicitPrimaryApplicants.length > 1) return undefined;
  return explicitPrimaryApplicants[0]?.id ?? submission.applicants[0]?.id;
}

export function hasUnambiguousPrimaryApplicantForPassportReview(
  submission: PassportReviewSubmission,
): boolean {
  return Boolean(primaryApplicantIdForPassportReview(submission));
}

export function requiredPassportReviewMediaTypesForApplicant(
  submission: PassportReviewSubmission,
  applicantId: string,
): readonly PassportReviewMediaType[] {
  return applicantId === primaryApplicantIdForPassportReview(submission)
    ? PRIMARY_APPLICANT_REQUIRED_MEDIA_TYPES
    : SECONDARY_FAMILY_APPLICANT_REQUIRED_MEDIA_TYPES;
}

export function passportReviewMediaTypeForIssue(
  issue: PassportReviewIssue,
): PassportReviewMediaType | undefined {
  const fileType = issue.target.fileType;
  if (
    fileType === "passport_scan" ||
    fileType === "selfie" ||
    fileType === "selfie_2"
  ) {
    return fileType;
  }
  if (fileType) return undefined;

  const target = (issue.target.field ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
  if (
    ["скан паспорта", "скан загранпаспорта", "passport scan", "passport_scan"].includes(
      target,
    )
  ) {
    return "passport_scan";
  }
  if (
    ["селфи 2", "селфи профиль", "профиль", "selfie 2", "selfie_2"].includes(target)
  ) {
    return "selfie_2";
  }
  if (
    ["селфи", "селфи 1", "анфас", "selfie", "selfie 1", "selfie_1"].includes(target)
  ) {
    return "selfie";
  }
  return undefined;
}

export function isAdminPassportReviewIssueInScope(
  issue: PassportReviewIssue,
  input: {
    applicantId: string;
    fields: readonly PassportReviewIssueField[];
    mediaTypes: readonly PassportReviewMediaType[];
  },
): boolean {
  if (issue.target.applicantId !== input.applicantId) return false;

  if (issue.target.fileType) {
    const mediaType = passportReviewMediaTypeForIssue(issue);
    return Boolean(mediaType && input.mediaTypes.includes(mediaType));
  }

  const mediaType = passportReviewMediaTypeForIssue(issue);
  if (mediaType && input.mediaTypes.includes(mediaType)) return true;

  if (!issue.target.field) return false;
  return input.fields.some(
    (field) =>
      isAdminPassportReviewFieldId(field.id) &&
      questionnaireFieldMatchesTarget(field, issue.target.field),
  );
}

export function passportReviewMediaTypesVisibleForApplicant(
  submission: PassportReviewSubmission,
  applicantId: string,
): PassportReviewMediaType[] {
  const canonicalTypes = requiredPassportReviewMediaTypesForApplicant(
    submission,
    applicantId,
  );
  const activeCorrectionTypes = (submission.issues ?? [])
    .filter(
      (issue) =>
        (issue.status === "open" || issue.status === "fixed_by_agent") &&
        issue.target.applicantId === applicantId,
    )
    .map(passportReviewMediaTypeForIssue)
    .filter((fileType): fileType is PassportReviewMediaType => Boolean(fileType));

  return Array.from(
    new Set<PassportReviewMediaType>([...canonicalTypes, ...activeCorrectionTypes]),
  );
}

export function requiredPassportReviewMediaSlots(
  submission: PassportReviewSubmission,
): RequiredPassportReviewMediaSlot[] {
  return submission.applicants.flatMap((applicant) =>
    requiredPassportReviewMediaTypesForApplicant(submission, applicant.id).map(
      (type) => ({ applicantId: applicant.id, type }),
    ),
  );
}
