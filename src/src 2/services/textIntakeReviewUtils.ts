export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizedText(value: unknown): string {
  return cleanText(value).replace(/\s+/g, " ").toLowerCase();
}

export function normalizePassport(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizeContact(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizedComparableText(value: unknown): string {
  return normalizedText(value).replace(/[^a-zа-яё0-9]+/gi, "");
}

export function containsCyrillic(value: string): boolean {
  return /[А-Яа-яЁё]/.test(value);
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function yearsBetween(start: Date, end: Date): number {
  return daysBetween(start, end) / 365.25;
}

export function ageAt(birthDate: Date, targetDate: Date): number {
  let age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    targetDate.getUTCMonth() < birthDate.getUTCMonth() ||
    (targetDate.getUTCMonth() === birthDate.getUTCMonth() &&
      targetDate.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function canonicalSubmissionCity(value: string | undefined): string | null {
  const normalized = normalizedComparableText(value);
  if (!normalized) return null;

  const aliases: Record<string, string> = {
    moscow: "moscow",
    москва: "moscow",
    spb: "saint-petersburg",
    saintpetersburg: "saint-petersburg",
    stpetersburg: "saint-petersburg",
    санктпетербург: "saint-petersburg",
    петербург: "saint-petersburg",
    kazan: "kazan",
    казань: "kazan",
    ekaterinburg: "yekaterinburg",
    yekaterinburg: "yekaterinburg",
    екатеринбург: "yekaterinburg",
    novosibirsk: "novosibirsk",
    новосибирск: "novosibirsk",
    nizhniynovgorod: "nizhny-novgorod",
    нижнийновгород: "nizhny-novgorod",
    samara: "samara",
    самара: "samara",
    rostovondon: "rostov-on-don",
    ростовнадону: "rostov-on-don",
  };

  return aliases[normalized] ?? null;
}

export function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value.trim() ? parsed : null;
}

export function parseDmyDate(value: string | undefined): Date | null {
  const match = value?.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? parsed
    : null;
}

export function extractIsoDates(value: string | undefined): Date[] {
  const matches = value?.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return matches.flatMap((match) => {
    const parsed = parseIsoDate(match);
    return parsed ? [parsed] : [];
  });
}
