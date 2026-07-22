// src/modules/submissions/adminReviewQueuePlan.ts
import { adminTriageRadarItem } from "./adminTriageRadar";
import type { Submission } from "./types";
import { isAdminReviewQueueSubmission } from "./uiTypes";

export type AdminReviewPriorityBand = "critical" | "attention" | "standard";

export type AdminReviewTripUrgency =
  | "overdue"
  | "imminent"
  | "soon"
  | "planned"
  | "unknown";

export type AdminReviewQueuePlanItem = {
  band: AdminReviewPriorityBand;
  daysToTrip: number | null;
  nextAction: string;
  priorityReason: string;
  reasons: string[];
  score: number;
  submissionId: string;
  tripUrgency: AdminReviewTripUrgency;
};

export type AdminReviewQueuePlan = {
  items: AdminReviewQueuePlanItem[];
  top?: AdminReviewQueuePlanItem;
  totals: Record<AdminReviewPriorityBand, number>;
};

const bandOrder = {
  critical: 0,
  attention: 1,
  standard: 2,
} satisfies Record<AdminReviewPriorityBand, number>;

const millisecondsPerDay = 86_400_000;

export function buildAdminReviewQueuePlan(
  submissions: Submission[],
  now: Date = new Date(),
): AdminReviewQueuePlan {
  const items = submissions
    .filter(isAdminReviewQueueSubmission)
    .map((submission) => planItemForSubmission(submission, now))
    .sort(comparePlanItems);

  const totals = items.reduce(
    (result, item) => {
      result[item.band] += 1;
      return result;
    },
    {
      attention: 0,
      critical: 0,
      standard: 0,
    } satisfies Record<AdminReviewPriorityBand, number>,
  );

  return {
    items,
    top: items[0],
    totals,
  };
}

function planItemForSubmission(
  submission: Submission,
  now: Date,
): AdminReviewQueuePlanItem {
  const radar = adminTriageRadarItem(submission);
  const openBlockers = submission.issues.filter(
    (issue) => issue.status === "open" && issue.severity === "blocker",
  ).length;
  const openWarnings = submission.issues.filter(
    (issue) => issue.status === "open" && issue.severity !== "blocker",
  ).length;
  const fixedByAgent = submission.issues.filter(
    (issue) => issue.status === "fixed_by_agent",
  ).length;
  const replacementFiles = submission.files.filter(
    (file) => file.status === "needs_replacement",
  ).length;
  const pendingReviewFiles = submission.files.filter(
    (file) => file.status === "pending_review" || file.status === "uploaded",
  ).length;
  const advisorySignals = (submission.aiSuggestions ?? []).filter(
    (suggestion) => suggestion.status === "suggested",
  ).length;
  const daysToTrip = daysUntilTrip(submission.tripDateFrom, now);
  const tripUrgency = tripUrgencyForDays(daysToTrip);
  const band = priorityBand({
    daysToTrip,
    fixedByAgent,
    openBlockers,
    openWarnings,
    replacementFiles,
    status: submission.status,
  });
  const reasons = priorityReasons({
    advisorySignals,
    daysToTrip,
    fixedByAgent,
    openBlockers,
    openWarnings,
    pendingReviewFiles,
    replacementFiles,
    status: submission.status,
  });
  const score = Math.round(
    30 +
      openBlockers * 90 +
      fixedByAgent * 55 +
      openWarnings * 28 +
      replacementFiles * 35 +
      pendingReviewFiles * 8 +
      advisorySignals * 4 +
      (submission.status === "corrections_received" ? 30 : 10) +
      tripPriorityBoost(daysToTrip) +
      readinessGap(submission) * 0.1,
  );

  return {
    band,
    daysToTrip,
    nextAction: radar.nextAction,
    priorityReason: reasons[0],
    reasons,
    score,
    submissionId: submission.id,
    tripUrgency,
  };
}

function priorityBand({
  daysToTrip,
  fixedByAgent,
  openBlockers,
  openWarnings,
  replacementFiles,
  status,
}: {
  daysToTrip: number | null;
  fixedByAgent: number;
  openBlockers: number;
  openWarnings: number;
  replacementFiles: number;
  status: Submission["status"];
}): AdminReviewPriorityBand {
  if (openBlockers > 0 || (daysToTrip !== null && daysToTrip <= 7)) {
    return "critical";
  }

  if (
    status === "corrections_received" ||
    fixedByAgent > 0 ||
    openWarnings > 0 ||
    replacementFiles > 0 ||
    (daysToTrip !== null && daysToTrip <= 21)
  ) {
    return "attention";
  }

  return "standard";
}

function priorityReasons({
  advisorySignals,
  daysToTrip,
  fixedByAgent,
  openBlockers,
  openWarnings,
  pendingReviewFiles,
  replacementFiles,
  status,
}: {
  advisorySignals: number;
  daysToTrip: number | null;
  fixedByAgent: number;
  openBlockers: number;
  openWarnings: number;
  pendingReviewFiles: number;
  replacementFiles: number;
  status: Submission["status"];
}): string[] {
  const reasons = [
    openBlockers
      ? `${openBlockers} ${word(openBlockers, "блокер требует", "блокера требуют", "блокеров требуют")} решения`
      : "",
    fixedByAgent
      ? `${fixedByAgent} ${word(fixedByAgent, "исправление ждёт", "исправления ждут", "исправлений ждут")} закрытия`
      : "",
    tripReason(daysToTrip),
    replacementFiles
      ? `${replacementFiles} ${word(replacementFiles, "файл требует", "файла требуют", "файлов требуют")} замены`
      : "",
    openWarnings
      ? `${openWarnings} ${word(openWarnings, "замечание требует", "замечания требуют", "замечаний требуют")} проверки`
      : "",
    status === "corrections_received" && fixedByAgent === 0
      ? "Получены исправления агента"
      : "",
    pendingReviewFiles
      ? `${pendingReviewFiles} ${word(pendingReviewFiles, "файл ждёт", "файла ждут", "файлов ждут")} ручной проверки`
      : "",
    advisorySignals
      ? `${advisorySignals} ${word(advisorySignals, "AI-сигнал требует", "AI-сигнала требуют", "AI-сигналов требуют")} сверки`
      : "",
  ].filter(Boolean);

  return reasons.length
    ? reasons.slice(0, 4)
    : ["Пакет готов к плановой ручной проверке"];
}

function comparePlanItems(
  left: AdminReviewQueuePlanItem,
  right: AdminReviewQueuePlanItem,
) {
  return (
    bandOrder[left.band] - bandOrder[right.band] ||
    right.score - left.score ||
    sortableDays(left.daysToTrip) - sortableDays(right.daysToTrip) ||
    left.submissionId.localeCompare(right.submissionId)
  );
}

function daysUntilTrip(value: string, now: Date): number | null {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (!match) {
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) return null;
    return dayDifference(new Date(parsed), now);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3] ?? now.getUTCFullYear());
  const tripDate = new Date(Date.UTC(year, month - 1, day));
  if (
    tripDate.getUTCFullYear() !== year ||
    tripDate.getUTCMonth() !== month - 1 ||
    tripDate.getUTCDate() !== day
  ) {
    return null;
  }

  return dayDifference(tripDate, now);
}

function dayDifference(target: Date, now: Date) {
  const targetDay = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  const currentDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.ceil((targetDay - currentDay) / millisecondsPerDay);
}

function tripUrgencyForDays(daysToTrip: number | null): AdminReviewTripUrgency {
  if (daysToTrip === null) return "unknown";
  if (daysToTrip < 0) return "overdue";
  if (daysToTrip <= 7) return "imminent";
  if (daysToTrip <= 21) return "soon";
  return "planned";
}

function tripPriorityBoost(daysToTrip: number | null) {
  if (daysToTrip === null) return 0;
  if (daysToTrip < 0) return 80;
  if (daysToTrip <= 3) return 70;
  if (daysToTrip <= 7) return 52;
  if (daysToTrip <= 14) return 32;
  if (daysToTrip <= 21) return 18;
  if (daysToTrip <= 30) return 8;
  return 0;
}

function tripReason(daysToTrip: number | null) {
  if (daysToTrip === null) return "";
  if (daysToTrip < 0) return "Дата поездки уже наступила";
  if (daysToTrip === 0) return "Вылет сегодня";
  if (daysToTrip === 1) return "До вылета 1 день";
  if (daysToTrip <= 21) return `До вылета ${daysToTrip} дней`;
  return "";
}

function readinessGap(submission: Submission) {
  return (
    Math.max(0, 100 - submission.completeness.questionnaire) +
    Math.max(0, 100 - submission.completeness.files)
  );
}

function sortableDays(value: number | null) {
  return value === null ? Number.MAX_SAFE_INTEGER : value;
}

function word(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
