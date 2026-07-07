import type { Submission } from "./types";
import { applicantHasPassportNumber } from "./filenamePolicy";

export type ProductionGateLevel = "blocked" | "attention" | "ready";

export type ProductionGateCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: "blocker" | "warning" | "info";
  detail: string;
};

export type ProductionReadinessGate = {
  level: ProductionGateLevel;
  score: number;
  checks: ProductionGateCheck[];
  nextAction: string;
};

/**
 * Deterministic pre-production gate.
 * Purpose: one source of truth before handing cases to humans/export.
 * Does not replace admin review.
 */
export function buildProductionReadinessGate(
  submission: Submission,
): ProductionReadinessGate {
  const checks: ProductionGateCheck[] = [];

  const blockers = openBlockerCount(submission);
  checks.push({
    id: "issues",
    label: "Критические замечания",
    passed: blockers === 0,
    severity: "blocker",
    detail: blockers ? `Открыто блокеров: ${blockers}` : "Блокеров нет",
  });

  const passportReady =
    submission.applicants.length > 0 &&
    submission.applicants.every((applicant) =>
      hasPassportEvidence(submission, applicant.id),
    );

  checks.push({
    id: "passport",
    label: "Паспортные данные",
    passed: passportReady,
    severity: "blocker",
    detail: passportReady
      ? "У заявителей есть паспортные данные"
      : "Нужно завершить извлечение/проверку паспорта",
  });

  const exportContextReady =
    Boolean(submission.city) &&
    submission.applicants.length > 0 &&
    hasUsableTripDateRange(submission);
  checks.push({
    id: "export-context",
    label: "Контекст выгрузки",
    passed: exportContextReady,
    severity: "warning",
    detail: exportContextReady
      ? "Пакет экспорта определён"
      : "Не хватает параметров пакета",
  });

  const openIssues = openIssueCount(submission);
  checks.push({
    id: "open-issues",
    label: "Открытые задачи",
    passed: openIssues === 0,
    severity: "warning",
    detail: openIssues
      ? `Осталось задач: ${openIssues}`
      : "Все задачи закрыты",
  });

  const score = Math.round(
    (checks.filter((c) => c.passed).length / checks.length) * 100,
  );
  const failedBlockers = productionReadinessBlockingChecks({ checks });
  const failedWarnings = checks.filter(
    (check) => !check.passed && check.severity === "warning",
  );

  return {
    score,
    checks,
    level: failedBlockers.length
      ? "blocked"
      : failedWarnings.length
        ? "attention"
        : "ready",
    nextAction: failedBlockers[0]?.detail ?? "Готово к следующему шагу",
  };
}

export function productionReadinessBlockingChecks(
  gate: Pick<ProductionReadinessGate, "checks">,
): ProductionGateCheck[] {
  return gate.checks.filter(
    (check) => !check.passed && check.severity === "blocker",
  );
}

export function firstProductionReadinessBlocker(
  submission: Submission,
): ProductionGateCheck | null {
  return (
    productionReadinessBlockingChecks(buildProductionReadinessGate(submission))[0] ??
    null
  );
}

export function productionReadinessBlockerReasons(
  submissions: Submission[],
): string[] {
  const reasons = submissions.flatMap((submission) =>
    productionReadinessBlockingChecks(buildProductionReadinessGate(submission)).map(
      (check) => check.detail,
    ),
  );

  return [...new Set(reasons)];
}

function openBlockerCount(submission: Submission): number {
  return submission.issues.filter(
    (issue) => issue.status === "open" && issue.severity === "blocker",
  ).length;
}

function hasPassportEvidence(submission: Submission, applicantId: string): boolean {
  const applicant = submission.applicants.find((item) => item.id === applicantId);
  if (!applicant) return false;
  if (applicantHasPassportNumber(applicant)) return true;

  return submission.files.some(
    (file) =>
      file.applicantId === applicantId &&
      file.type === "passport_scan" &&
      (file.status === "uploaded" ||
        file.status === "pending_review" ||
        file.status === "accepted"),
  );
}

function openIssueCount(submission: Submission): number {
  return submission.issues.filter((issue) => issue.status === "open").length;
}

function hasUsableTripDateRange(submission: Submission): boolean {
  const from = submission.tripDateFrom.trim();
  const to = submission.tripDateTo.trim();

  return Boolean(from && to && from !== "не указано" && to !== "не указано");
}
