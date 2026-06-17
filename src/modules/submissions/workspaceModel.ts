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
      tab: "data";
    }
  | {
      applicantId: string;
      fileType: SubmissionFileType;
      tab: "media";
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
  { id: "data", label: "Данные" },
  { id: "media", label: "Медиа" },
  { id: "issues", label: "Замечания" },
  { id: "history", label: "История" },
];

export const activeMediaFileTypes: SubmissionFileType[] = [
  "photo",
  "selfie",
  "selfie_2",
  "passport_scan",
];

export function buildReadinessQueue(submission: Submission): ReadinessQueueItem[] {
  return [
    ...submission.issues.filter((issue) => issue.status === "open").map(issueQueueItem),
    ...submission.issues
      .filter((issue) => issue.status === "fixed_by_manager")
      .map(fixedIssueQueueItem),
    ...activeAiSuggestions(submission).map(aiSuggestionQueueItem),
    ...systemMissingQueueItems(submission),
  ].sort(queueSort);
}

export function firstActionableQueueItem(submission: Submission) {
  return buildReadinessQueue(submission).find((item) => item.status !== "fixed");
}

export function targetElementId(target: WorkspaceTarget): string {
  if (target.tab === "media") {
    return `workspace-media-${target.applicantId}-${target.fileType}`;
  }
  if (target.tab === "data") {
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
  if (type === "photo") return "Фото 35x45";
  if (type === "selfie") return "Селфи 1";
  if (type === "selfie_2") return "Селфи 2";
  if (type === "passport_scan") return "Паспорт";
  return "Видео";
}

export function fileStatusLabel(file: SubmissionFile | undefined) {
  return file ? fileStatusLabels[file.status] : "Нет файла";
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
          tab: "data",
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
      tab: "media",
    };
  }

  return {
    applicantId: issue.target.applicantId,
    field: issue.target.field,
    section: issue.target.section,
    tab: "data",
  };
}

function targetForSuggestion(suggestion: AiSuggestion): WorkspaceTarget {
  if (suggestion.target.fileType) {
    return {
      applicantId: suggestion.target.applicantId,
      fileType: suggestion.target.fileType,
      tab: "media",
    };
  }

  return {
    applicantId: suggestion.target.applicantId,
    field: suggestion.target.field,
    section: suggestion.target.section,
    tab: "data",
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
