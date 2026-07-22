// src/modules/submissions/passportReviewInsights.ts
import {
  ADMIN_PASSPORT_REVIEW_FIELD_LABELS,
  hasAdminPassportReviewValue,
  type AdminPassportReviewFieldId,
  type PassportReviewMediaType,
} from "./passportReviewContract";

export type PassportReviewInsightTone = "success" | "warning" | "danger" | "info";

export type PassportReviewFieldSignal = {
  hasError: boolean;
  id: AdminPassportReviewFieldId;
  value: string;
};

export type PassportReviewMediaSignal = {
  ready: boolean;
  type: PassportReviewMediaType;
  visited: boolean;
};

export type PassportReviewInsight = {
  id: string;
  message: string;
  title: string;
  tone: PassportReviewInsightTone;
};

export type PassportReviewInsightModel = {
  headline: string;
  insights: PassportReviewInsight[];
  mode: "ready" | "needs_attention" | "blocked";
  recommendation: string;
  score: number;
  summary: string;
};

type PassportReviewInsightInput = {
  fields: PassportReviewFieldSignal[];
  media: PassportReviewMediaSignal[];
  openIssueCount: number;
  now?: Date;
};

const mediaLabels: Record<PassportReviewMediaType, string> = {
  passport_scan: "паспорт",
  selfie: "селфи 1",
  selfie_2: "селфи 2",
};

function parseReviewDate(value: string): Date | null {
  const normalized = value.trim();
  const ruDate = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(normalized);
  if (ruDate) {
    const [, day, month, year] = ruDate;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function fieldValue(
  fields: PassportReviewFieldSignal[],
  id: AdminPassportReviewFieldId,
): string {
  return fields.find((field) => field.id === id)?.value ?? "";
}

function joinedLabels(fields: PassportReviewFieldSignal[], limit = 3): string {
  const labels = fields.map((field) => ADMIN_PASSPORT_REVIEW_FIELD_LABELS[field.id]);
  const visible = labels.slice(0, limit).join(", ");
  const hiddenCount = labels.length - limit;
  return hiddenCount > 0 ? `${visible} и ещё ${hiddenCount}` : visible;
}

function mediaList(media: PassportReviewMediaSignal[]): string {
  return media.map((item) => mediaLabels[item.type]).join(", ");
}

export function buildPassportReviewInsights({
  fields,
  media,
  openIssueCount,
  now = new Date(),
}: PassportReviewInsightInput): PassportReviewInsightModel {
  const incompleteFields = fields.filter(
    (field) => !hasAdminPassportReviewValue(field.value) || field.hasError,
  );
  const unavailableMedia = media.filter((item) => !item.ready);
  const unseenMedia = media.filter((item) => item.ready && !item.visited);
  const insights: PassportReviewInsight[] = [];

  if (incompleteFields.length > 0) {
    insights.push({
      id: "fields",
      message: joinedLabels(incompleteFields),
      title: `${incompleteFields.length} полей требуют внимания`,
      tone: "danger",
    });
  } else {
    insights.push({
      id: "fields",
      message: "Все паспортные значения заполнены без ошибок формата.",
      title: `${fields.length}/${fields.length} полей готовы к сверке`,
      tone: "success",
    });
  }

  if (unavailableMedia.length > 0) {
    insights.push({
      id: "media-unavailable",
      message: `Недоступны: ${mediaList(unavailableMedia)}.`,
      title: "Не хватает защищённых оригиналов",
      tone: "danger",
    });
  } else if (unseenMedia.length > 0) {
    insights.push({
      id: "media-unseen",
      message: `Откройте: ${mediaList(unseenMedia)}.`,
      title: `${unseenMedia.length} файла ещё не просмотрены`,
      tone: "warning",
    });
  } else {
    insights.push({
      id: "media-ready",
      message: "Паспорт и обязательные селфи открыты в текущей сессии.",
      title: `${media.length}/${media.length} файла просмотрены`,
      tone: "success",
    });
  }

  if (openIssueCount > 0) {
    insights.push({
      id: "issues",
      message: "Положительное решение недоступно до закрытия замечаний.",
      title: `${openIssueCount} открытых замечаний`,
      tone: "danger",
    });
  }

  const birthDate = parseReviewDate(fieldValue(fields, "birth-date"));
  const issueDate = parseReviewDate(fieldValue(fields, "passport-issue-date"));
  const expiryDate = parseReviewDate(fieldValue(fields, "passport-expiry-date"));
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  if (issueDate && expiryDate && issueDate.getTime() >= expiryDate.getTime()) {
    insights.push({
      id: "date-order",
      message: "Дата выдачи должна быть раньше даты окончания действия.",
      title: "Нарушена хронология паспорта",
      tone: "danger",
    });
  } else if (birthDate && issueDate && birthDate.getTime() >= issueDate.getTime()) {
    insights.push({
      id: "birth-order",
      message: "Дата рождения должна быть раньше даты выдачи паспорта.",
      title: "Проверьте даты документа",
      tone: "danger",
    });
  } else if (expiryDate && expiryDate.getTime() < todayUtc) {
    insights.push({
      id: "expired",
      message: "Срок действия документа уже завершился.",
      title: "Паспорт просрочен",
      tone: "danger",
    });
  } else if (issueDate && expiryDate) {
    insights.push({
      id: "dates",
      message: "Дата выдачи предшествует сроку окончания действия.",
      title: "Хронология дат корректна",
      tone: "info",
    });
  }

  const passportNumber = fieldValue(fields, "passport-no").replace(/[^\p{L}\p{N}]/gu, "");
  if (passportNumber && passportNumber.length < 6) {
    insights.push({
      id: "passport-number",
      message: "Номер короче ожидаемого диапазона и требует ручной проверки.",
      title: "Необычный формат номера",
      tone: "warning",
    });
  }

  const hasDanger = insights.some((insight) => insight.tone === "danger");
  const hasWarning = insights.some((insight) => insight.tone === "warning");
  const fieldCoverage =
    fields.length > 0 ? (fields.length - incompleteFields.length) / fields.length : 0;
  const readyCoverage =
    media.length > 0 ? (media.length - unavailableMedia.length) / media.length : 0;
  const visitedCoverage =
    media.length > 0
      ? media.filter((item) => item.ready && item.visited).length / media.length
      : 0;
  const issueCoverage = openIssueCount === 0 ? 1 : 0;
  const score = Math.round(
    fieldCoverage * 50 + readyCoverage * 25 + visitedCoverage * 15 + issueCoverage * 10,
  );

  if (hasDanger) {
    return {
      headline: "Нужна ручная проверка",
      insights,
      mode: "blocked",
      recommendation: "Исправьте критичные пункты или создайте точное замечание.",
      score,
      summary: "Паспортный контур пока не готов к положительному решению.",
    };
  }

  if (hasWarning) {
    return {
      headline: "Почти готово",
      insights,
      mode: "needs_attention",
      recommendation: "Откройте все оригиналы и завершите визуальную сверку.",
      score,
      summary: "Данные заполнены, но обязательный просмотр ещё не завершён.",
    };
  }

  return {
    headline: "Готово к решению",
    insights,
    mode: "ready",
    recommendation: "Подтвердите паспортную секцию после ручной сверки лица.",
    score,
    summary: "Паспортные поля и обязательные оригиналы готовы.",
  };
}
