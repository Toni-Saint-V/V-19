import type { Submission } from "./types";

export type OperationalDrawerSourceStatus =
  | "draft"
  | "in_progress"
  | "submitted_for_review"
  | "returned"
  | "corrections_received"
  | "ready_for_export"
  | "exported";

export function operationalDrawerSourceStatus(
  submission: Submission,
): OperationalDrawerSourceStatus {
  if (submission.status === "draft") return "draft";
  if (submission.status === "returned") return "returned";
  if (submission.status === "submitted_for_review") return "submitted_for_review";
  if (submission.status === "corrections_received") return "corrections_received";
  if (submission.status === "ready_for_export") return "ready_for_export";
  if (submission.status === "exported") return "exported";
  return "in_progress";
}

export function operationalDrawerCompactStatusLabel(
  status: OperationalDrawerSourceStatus,
) {
  if (status === "returned") return "возвращено";
  if (status === "submitted_for_review") return "проверка";
  if (status === "corrections_received") return "исправления";
  if (status === "ready_for_export") return "готово";
  if (status === "exported") return "выгружено";
  if (status === "in_progress") return "в работе";
  return "черновик";
}
