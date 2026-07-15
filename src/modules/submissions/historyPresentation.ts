import type { SubmissionHistoryItem } from "./types";

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}(?:T|\s|$)/;
const technicalStorageDetailPattern = /(?:^|[\s,])(?:bucket|path|generated|original)=/i;

export function historyTimestampForUser(value: string): string {
  const normalized = value.trim();
  if (!normalized || !isoTimestampPattern.test(normalized)) return normalized || "—";

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function historyDetailForUser(event: Pick<SubmissionHistoryItem, "detail">) {
  const detail = event.detail?.trim();
  if (!detail) return undefined;

  return technicalStorageDetailPattern.test(detail)
    ? "Предыдущая версия файла сохранена в истории."
    : detail;
}
