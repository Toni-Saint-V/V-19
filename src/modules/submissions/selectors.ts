import type { Submission, SubmissionStatus } from "./types";
import { blockerCount, fixedIssueCount, openIssueCount } from "./status";

export function byStatus(submissions: Submission[], statuses: SubmissionStatus[]) {
  return submissions.filter((submission) => statuses.includes(submission.status));
}

export function agentQueue(submissions: Submission[]) {
  return submissions.filter((submission) =>
    [
      "draft",
      "in_progress",
      "requires_action",
      "returned",
      "submitted_for_review",
      "corrections_received",
      "ready_for_export",
      "exported",
    ].includes(submission.status),
  );
}

export function reviewQueue(submissions: Submission[]) {
  return submissions.filter((submission) =>
    ["submitted_for_review", "corrections_received", "ready_for_export"].includes(
      submission.status,
    ),
  );
}

export function readyForExport(submissions: Submission[]) {
  return submissions.filter((submission) => submission.status === "ready_for_export");
}

export function exportedHistory(submissions: Submission[]) {
  return submissions.filter((submission) => submission.status === "exported");
}

export function counts(submissions: Submission[]) {
  return {
    draft: submissions.filter((submission) => submission.status === "draft").length,
    inProgress: submissions.filter((submission) => submission.status === "in_progress")
      .length,
    requiresAction: submissions.filter((submission) =>
      ["requires_action", "returned"].includes(submission.status),
    ).length,
    inReview: submissions.filter(
      (submission) => submission.status === "submitted_for_review",
    ).length,
    corrections: submissions.filter(
      (submission) => submission.status === "corrections_received",
    ).length,
    ready: readyForExport(submissions).length,
    exported: exportedHistory(submissions).length,
  };
}

export function searchSubmissions(
  submissions: Submission[],
  query: string,
  city: string,
) {
  const normalized = query.trim().toLowerCase();
  return submissions.filter((submission) => {
    const matchesCity = city === "Все города" || submission.city === city;
    if (!matchesCity) return false;
    if (!normalized) return true;
    return [
      submission.id,
      submission.title,
      submission.city,
      submission.status,
      ...submission.applicants.map((applicant) => applicant.fullName),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

export function highestPriorityFirst(submissions: Submission[]) {
  return [...submissions].sort((left, right) => {
    const leftScore =
      blockerCount(left) * 100 +
      openIssueCount(left) * 20 +
      fixedIssueCount(left) * 10 +
      left.completeness.total;
    const rightScore =
      blockerCount(right) * 100 +
      openIssueCount(right) * 20 +
      fixedIssueCount(right) * 10 +
      right.completeness.total;
    return rightScore - leftScore;
  });
}

export function applicantCountLabel(count: number) {
  if (count === 1) return "1 заявитель";
  if (count > 1 && count < 5) return `${count} заявителя`;
  return `${count} заявителей`;
}

export function tripDates(submission: Submission) {
  return `${submission.tripDateFrom}-${submission.tripDateTo}`;
}

export function nextAuditLine(submission: Submission) {
  if (blockerCount(submission) > 0) return "Сначала закрыть блокеры";
  if (fixedIssueCount(submission) > 0) return "Проверить исправления";
  if (submission.status === "submitted_for_review") return "Открыть и проверить пакет";
  if (submission.status === "ready_for_export") return "Можно выгружать";
  return "Наблюдать статус";
}
