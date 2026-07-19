const legacyDatePattern = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/;

function validCalendarDate(year: number, monthIndex: number, day: number) {
  const date = new Date(year, monthIndex, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === monthIndex &&
    date.getDate() === day
  )
    ? date
    : null;
}

export function resolveSubmissionCreatedAt(
  value: string,
  now: Date = new Date(),
): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized === "сейчас") return new Date(now.getTime());

  const legacyMatch = normalized.match(legacyDatePattern);
  if (legacyMatch) {
    const day = Number(legacyMatch[1]);
    const monthIndex = Number(legacyMatch[2]) - 1;
    const explicitYear = legacyMatch[3] ? Number(legacyMatch[3]) : undefined;
    let year = explicitYear ?? now.getFullYear();
    let date = validCalendarDate(year, monthIndex, day);
    if (!date) return null;
    if (!explicitYear && date.getTime() > now.getTime()) {
      year -= 1;
      date = validCalendarDate(year, monthIndex, day);
    }
    return date;
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function yearLabel(value: number) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} лет назад`;
  const last = value % 10;
  if (last === 1) return `${value} год назад`;
  if (last >= 2 && last <= 4) return `${value} года назад`;
  return `${value} лет назад`;
}

export function relativeSubmissionCreatedAt(
  value: string,
  now: Date = new Date(),
): string {
  const createdAt = resolveSubmissionCreatedAt(value, now);
  if (!createdAt) return "дата неизвестна";

  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes} мин назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "1 день назад";
  if (days < 7) return `${days} дн назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед назад`;
  if (days < 365) return `${Math.floor(days / 30)} мес назад`;
  return yearLabel(Math.floor(days / 365));
}

export function submissionCreatedAtDateTime(
  value: string,
  now: Date = new Date(),
): string | undefined {
  return resolveSubmissionCreatedAt(value, now)?.toISOString();
}
