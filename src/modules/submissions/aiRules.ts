import { fileTypeLabels } from "./status";
import type { AiSuggestion, Submission, SubmissionFile } from "./types";

export function generateAiSuggestions(submission: Submission): AiSuggestion[] {
  const suggestions = [
    ...questionnaireSuggestions(submission),
    ...fileSuggestions(submission),
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
        title: "Проверить раздел анкеты",
        reason:
          section.missing ?? "Раздел выглядит неполным и требует ручной проверки.",
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
          section: "Медиа",
          fileType: file.type,
        },
      },
    ];
  });
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
      title: `Добавить файл: ${fileTypeLabels[file.type]}`,
      reason: `${applicantName}: файл отсутствует и может заблокировать движение подачи.`,
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
      title: `Проверить замену файла: ${fileTypeLabels[file.type]}`,
      reason: `${applicantName}: файл отмечен как проблемный, нужна ручная проверка.`,
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
      title: `Проверить файл: ${fileTypeLabels[file.type]}`,
      reason: `${applicantName}: файл ожидает проверки администратором.`,
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
  if (section === "Файлы") return "Медиа";
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
