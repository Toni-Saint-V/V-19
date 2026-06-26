import { activeAiSuggestions } from "./aiSuggestions";
import {
  fileStatusLabels,
  fileTypeLabels,
  fixedIssueCount,
  openIssueCount,
} from "./status";
import type {
  AiSuggestion,
  DrawerTab,
  Issue,
  Submission,
  SubmissionFile,
  SubmissionFileType,
} from "./types";

export type WorkspaceTarget =
  | {
      applicantId: string;
      field?: string;
      section?: string;
      tab: "questionnaire";
    }
  | {
      applicantId: string;
      fileType: SubmissionFileType;
      tab: "files";
    }
  | {
      issueId?: string;
      tab: "issues";
    };

export type ReadinessQueueItem = {
  actionLabel: string;
  body: string;
  id: string;
  source: "admin" | "ai" | "system";
  status: "open" | "fixed" | "review";
  target: WorkspaceTarget;
  title: string;
  tone: "danger" | "warning" | "info" | "success";
  type: "admin_blocker" | "ai_suggestion" | "fixed_waiting_admin" | "system_missing";
};

export const workspaceTabs: Array<{ id: DrawerTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "applicants", label: "Заявители" },
  { id: "questionnaire", label: "Анкета" },
  { id: "files", label: "Файлы" },
  { id: "issues", label: "Замечания" },
  { id: "history", label: "История" },
];

export const activeMediaFileTypes: SubmissionFileType[] = [
  "passport_scan",
  "photo",
  "selfie",
  "video",
];

export function buildReadinessQueue(submission: Submission): ReadinessQueueItem[] {
  return [
    ...submission.issues.filter((issue) => issue.status === "open").map(issueQueueItem),
    ...submission.issues
      .filter((issue) => issue.status === "fixed_by_agent")
      .map(fixedIssueQueueItem),
    ...activeAiSuggestions(submission).map(aiSuggestionQueueItem),
    ...systemMissingQueueItems(submission),
  ].sort(queueSort);
}

export function firstActionableQueueItem(submission: Submission) {
  return buildReadinessQueue(submission).find((item) => item.status !== "fixed");
}

export function targetElementId(target: WorkspaceTarget): string {
  if (target.tab === "files") {
    return `workspace-media-${target.applicantId}-${target.fileType}`;
  }
  if (target.tab === "questionnaire") {
    const suffix = target.field ?? target.section ?? "profile";
    return `workspace-data-${target.applicantId}-${stableDomToken(suffix)}`;
  }
  return target.issueId ? `workspace-issue-${target.issueId}` : "workspace-issues";
}

export function tabForTarget(target: WorkspaceTarget): DrawerTab {
  return target.tab;
}

export function fileLabel(type: SubmissionFileType) {
  if (type === "selfie_2") return "Селфи N2";
  if (type === "passport_scan") return "Загранпаспорт";
  if (type === "video") return "Видео";
  return fileTypeLabels[type];
}

export function fileShortLabel(type: SubmissionFileType) {
  if (type === "photo") return "Фото";
  if (type === "selfie") return "Селфи";
  if (type === "selfie_2") return "Селфи 2";
  if (type === "passport_scan") return "Паспорт";
  return "Видео 1 мин";
}

export function fileStatusLabel(file: SubmissionFile | undefined) {
  return file ? fileStatusLabels[file.status] : "Нет файла";
}

export function sectionNavigationTarget(
  submission: Submission,
  sectionTitle: string,
): WorkspaceTarget {
  const issueTarget = submission.issues.find(
    (issue) =>
      issue.status === "open" &&
      !issue.target.fileType &&
      (issue.target.section === sectionTitle || issue.target.field === sectionTitle),
  );
  if (issueTarget) return targetForIssue(issueTarget);

  const applicantWithWork = submission.applicants.find((applicant) =>
    applicant.sections.some(
      (section) => section.title === sectionTitle && section.status !== "complete",
    ),
  );

  return {
    applicantId: applicantWithWork?.id ?? submission.applicants[0]?.id ?? "",
    section: sectionTitle,
    tab: "questionnaire",
  };
}

function issueQueueItem(issue: Issue): ReadinessQueueItem {
  const target = targetForIssue(issue);
  const blocker = issue.severity === "blocker";

  return {
    actionLabel: "Открыть место исправления",
    body: issue.comment,
    id: `issue:${issue.id}`,
    source: issue.createdBy === "admin" ? "admin" : "system",
    status: "open",
    target,
    title: issueTargetLabel(issue),
    tone: blocker ? "danger" : issue.severity === "warning" ? "warning" : "info",
    type: blocker ? "admin_blocker" : "system_missing",
  };
}

function fixedIssueQueueItem(issue: Issue): ReadinessQueueItem {
  return {
    actionLabel: "Открыть замечание",
    body: "Исправление отправлено и ждёт закрытия администратором.",
    id: `fixed:${issue.id}`,
    source: "admin",
    status: "fixed",
    target: { issueId: issue.id, tab: "issues" },
    title: issueTargetLabel(issue),
    tone: "success",
    type: "fixed_waiting_admin",
  };
}

function aiSuggestionQueueItem(suggestion: AiSuggestion): ReadinessQueueItem {
  return {
    actionLabel: suggestion.target.fileType ? "Открыть файл" : "Открыть поле",
    body: suggestion.reason,
    id: `ai:${suggestion.id}`,
    source: "ai",
    status: "review",
    target: targetForSuggestion(suggestion),
    title: suggestionTargetLabel(suggestion),
    tone: suggestion.severity === "blocker" ? "warning" : "info",
    type: "ai_suggestion",
  };
}

function systemMissingQueueItems(submission: Submission): ReadinessQueueItem[] {
  const items: ReadinessQueueItem[] = [];

  for (const applicant of submission.applicants) {
    for (const section of applicant.sections) {
      if (section.status === "complete") continue;
      if (
        submission.issues.some(
          (issue) =>
            issue.status === "open" &&
            issue.target.applicantId === applicant.id &&
            (issue.target.section === section.title ||
              issue.target.field === section.title),
        )
      ) {
        continue;
      }

      items.push({
        actionLabel: "Открыть раздел",
        body: section.missing ?? "Раздел нужно проверить вручную.",
        id: `missing:${applicant.id}:${section.id}`,
        source: "system",
        status: "open",
        target: {
          applicantId: applicant.id,
          section: section.title,
          tab: "questionnaire",
        },
        title: `${applicant.fullName} · Данные · ${section.title}`,
        tone: "warning",
        type: "system_missing",
      });
    }
  }

  return items;
}

export function targetForIssue(issue: Issue): WorkspaceTarget {
  if (issue.target.fileType) {
    return {
      applicantId: issue.target.applicantId,
      fileType: issue.target.fileType,
      tab: "files",
    };
  }

  return {
    applicantId: issue.target.applicantId,
    field: issue.target.field,
    section: issue.target.section,
    tab: "questionnaire",
  };
}

function targetForSuggestion(suggestion: AiSuggestion): WorkspaceTarget {
  if (suggestion.target.fileType) {
    return {
      applicantId: suggestion.target.applicantId,
      fileType: suggestion.target.fileType,
      tab: "files",
    };
  }

  return {
    applicantId: suggestion.target.applicantId,
    field: suggestion.target.field,
    section: suggestion.target.section,
    tab: "questionnaire",
  };
}

function issueTargetLabel(issue: Issue) {
  if (issue.target.fileType) {
    return `${issue.target.applicantName} · Медиа · ${fileLabel(issue.target.fileType)}`;
  }

  const parts = [
    issue.target.applicantName,
    "Данные",
    issue.target.field ?? issue.target.section,
  ];
  return parts.filter(Boolean).join(" · ");
}

function suggestionTargetLabel(suggestion: AiSuggestion) {
  if (suggestion.target.fileType) {
    return `${suggestion.target.applicantName} · Медиа · ${fileLabel(suggestion.target.fileType)}`;
  }

  const parts = [
    suggestion.target.applicantName,
    "Данные",
    suggestion.target.field ?? suggestion.target.section,
  ];
  return parts.filter(Boolean).join(" · ");
}

function queueSort(left: ReadinessQueueItem, right: ReadinessQueueItem) {
  return queueWeight(left) - queueWeight(right);
}

function queueWeight(item: ReadinessQueueItem) {
  if (item.type === "admin_blocker") return 0;
  if (item.type === "system_missing") return 1;
  if (item.type === "ai_suggestion") return 2;
  return 3;
}

function stableDomToken(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export function workspaceSummary(submission: Submission) {
  const queue = buildReadinessQueue(submission);
  const aiCount = queue.filter((item) => item.type === "ai_suggestion").length;

  return {
    aiCount,
    openCount: openIssueCount(submission),
    queue,
    queueCount: queue.length,
    waitingAdminCount: fixedIssueCount(submission),
  };
}
