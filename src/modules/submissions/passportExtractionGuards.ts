import type {
  Applicant,
  PassportExtractedFieldKey,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "./types";

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

const passportGateActions = new Set<SubmissionAction>([
  "submit_for_review",
  "submit_corrections",
  "accept",
  "close_issues_accept",
  "generate_export",
  "mark_exported",
]);

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
  return passportGateActions.has(action) && passportGateIssues(submission, now).length > 0;
}

export function passportGateReason(
  submission: Submission,
  now: Date = new Date(),
) {
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
      ? [
          issue(
            applicant,
            "passport_not_confirmed",
            "Загранпаспорт не подтвержден: распознавание еще не выполнено.",
          ),
        ]
      : [];
  }

  if (state.status === "extracting") {
    return [
      issue(
        applicant,
        "passport_not_confirmed",
        "Дождитесь завершения распознавания загранпаспорта.",
      ),
    ];
  }

  if (state.status === "failed" || state.status === "unavailable") {
    return [
      issue(
        applicant,
        "passport_not_confirmed",
        "Файл не подтвержден как загранпаспорт. Загрузите разворот паспорта с MRZ.",
      ),
    ];
  }

  if (!state.extractedFields.length) {
    return [
      issue(
        applicant,
        "passport_not_confirmed",
        "Загранпаспорт не подтвержден: паспортные поля не извлечены.",
      ),
    ];
  }

  const issues: PassportGateIssue[] = [];
  const passportNumber = normalizePassportNumber(
    passportValue(applicant, "passportNumber"),
  );
  const passportType = normalizeText(passportValue(applicant, "passportType"));
  const issuedAt = parseDate(passportValue(applicant, "passportIssuedAt"));
  const expiresAt = parseDate(passportValue(applicant, "passportExpiresAt"));
  const tripDate = parseDate(questionnaireValue(applicant, "travel-date")) ??
    parseDate(submission.tripDateFrom);

  if (!passportNumber) {
    issues.push(issue(applicant, "passport_number_missing", "Не найден номер загранпаспорта."));
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
    !state.dismissedAtIso
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

function passportNumberForDuplicateCheck(
  applicant: Applicant,
  submission: Submission,
) {
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
      file.status !== "missing" &&
      file.status !== "needs_replacement" &&
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
