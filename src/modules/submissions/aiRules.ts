import { fileTypeLabels } from "./status";
import {
  passportGateIssues,
  type PassportGateIssue,
} from "./passportExtractionGuards";
import type { AiSuggestion, Submission, SubmissionFile } from "./types";

export function generateAiSuggestions(submission: Submission): AiSuggestion[] {
  const suggestions = [
    ...questionnaireSuggestions(submission),
    ...fileSuggestions(submission),
    ...passportGuardSuggestions(submission),
  ];

  return suggestions.filter((suggestion) => !hasMatchingIssue(submission, suggestion));
}

function questionnaireSuggestions(submission: Submission): AiSuggestion[] {
  return submission.applicants.flatMap((applicant) =>
    applicant.sections
      .filter(
        (section) => section.status === "partial" || section.status === "needs_fix",
      )
      .map((section) => ({
        id: suggestionId(submission.id, applicant.id, "section", section.id),
        type: "section" as const,
        target: {
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          section: "Данные",
          field: section.title,
        },
        title: `Проверить анкету: ${section.title}`,
        reason:
          section.missing ??
          `${applicant.fullName}: раздел заполнен не полностью и может заблокировать отправку на проверку.`,
        confidence:
          section.status === "needs_fix" ? ("high" as const) : ("medium" as const),
        severity:
          section.status === "needs_fix" ? ("blocker" as const) : ("warning" as const),
        status: "suggested" as const,
        createdAt: "сейчас",
      })),
  );
}

function fileSuggestions(submission: Submission): AiSuggestion[] {
  return submission.files.flatMap((file) => {
    const applicant = submission.applicants.find(
      (item) => item.id === file.applicantId,
    );
    if (!applicant) return [];

    const suggestion = suggestionForFile(submission.id, applicant.fullName, file);
    if (!suggestion) return [];

    return [
      {
        ...suggestion,
        target: {
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          section: "Файлы",
          fileType: file.type,
        },
      },
    ];
  });
}

function passportGuardSuggestions(submission: Submission): AiSuggestion[] {
  return passportGateIssues(submission).map((issue) => ({
    id: suggestionId(
      submission.id,
      issue.applicantId,
      "passport",
      issue.code,
    ),
    type: "field" as const,
    target: {
      applicantId: issue.applicantId,
      applicantName: issue.applicantName,
      section: "Паспорт",
      field: passportGateFieldLabel(issue),
    },
    title: passportGateSuggestionTitle(issue),
    reason: issue.message,
    confidence: "high" as const,
    severity: "blocker" as const,
    status: "suggested" as const,
    createdAt: "сейчас",
  }));
}

function passportGateFieldLabel(issue: PassportGateIssue) {
  if (
    issue.code === "passport_expired" ||
    issue.code === "passport_expires_before_trip"
  ) {
    return "Дата окончания паспорта";
  }
  if (issue.code === "passport_issued_after_expiry") return "Дата выдачи паспорта";
  if (
    issue.code === "duplicate_passport" ||
    issue.code === "passport_number_missing" ||
    issue.code === "passport_number_unexpected_format"
  ) {
    return "Номер паспорта";
  }
  if (issue.code === "passport_type_not_ordinary") return "Тип паспорта";
  return "Распознанные данные паспорта";
}

function passportGateSuggestionTitle(issue: PassportGateIssue) {
  if (issue.code === "duplicate_passport") return "Проверить дубль паспорта";
  if (issue.code === "passport_expired") return "Паспорт просрочен";
  if (issue.code === "passport_expires_before_trip") {
    return "Паспорт истекает до поездки";
  }
  if (issue.code === "passport_issued_after_expiry") {
    return "Проверить даты паспорта";
  }
  if (issue.code === "passport_number_missing") return "Нет номера паспорта";
  if (issue.code === "passport_number_unexpected_format") {
    return "Проверить формат номера паспорта";
  }
  if (issue.code === "passport_type_not_ordinary") {
    return "Проверить тип паспорта";
  }
  return "Проверить распознанные паспортные данные";
}

function suggestionForFile(
  submissionId: string,
  applicantName: string,
  file: SubmissionFile,
): Omit<AiSuggestion, "target"> | null {
  if (file.status === "missing") {
    return {
      id: suggestionId(submissionId, file.applicantId, "file", `${file.type}-missing`),
      type: "file",
      title: `Нет файла: ${fileTypeLabels[file.type]}`,
      reason: `${applicantName}: загрузите файл.`,
      confidence: "high",
      severity: "blocker",
      status: "suggested",
      createdAt: "сейчас",
    };
  }

  if (file.status === "needs_replacement") {
    return {
      id: suggestionId(submissionId, file.applicantId, "file", `${file.type}-replace`),
      type: "file",
      title: `Заменить: ${fileTypeLabels[file.type]}`,
      reason: `${applicantName}: нужен новый файл.`,
      confidence: "high",
      severity: "blocker",
      status: "suggested",
      createdAt: "сейчас",
    };
  }

  if (file.status === "pending_review") {
    return {
      id: suggestionId(submissionId, file.applicantId, "file", `${file.type}-review`),
      type: "file",
      title: `Проверить: ${fileTypeLabels[file.type]}`,
      reason: `${applicantName}: файл ждёт проверки.`,
      confidence: "medium",
      severity: "warning",
      status: "suggested",
      createdAt: "сейчас",
    };
  }

  return null;
}

function hasMatchingIssue(submission: Submission, suggestion: AiSuggestion) {
  return submission.issues.some(
    (issue) =>
      issue.target.applicantId === suggestion.target.applicantId &&
      normalizedIssueSection(issue.target.section) ===
        normalizedIssueSection(suggestion.target.section) &&
      issue.target.field === suggestion.target.field &&
      issue.target.fileType === suggestion.target.fileType &&
      issue.status !== "closed_by_admin",
  );
}

function normalizedIssueSection(section: string | undefined) {
  if (section === "Медиа") return "Файлы";
  if (section === "Анкета") return "Данные";
  return section ?? "";
}

function suggestionId(
  submissionId: string,
  applicantId: string,
  type: string,
  target: string,
) {
  return `бб-${submissionId}-${applicantId}-${type}-${target}`;
}
