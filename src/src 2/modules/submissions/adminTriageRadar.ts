import {
  buildIdentityConsistencyReport,
  firstActionableIdentityFinding,
  type IdentityConsistencyReport,
} from "./identityConsistency";
import {
  blockerCount,
  fixedIssueCount,
  openIssueCount,
  statusLabels,
  unresolvedOpenIssueCount,
} from "./status";
import { targetForIssue, type WorkspaceTarget } from "./workspaceModel";
import type { Role, Submission } from "./types";

export type AdminTriageBand =
  | "critical"
  | "attention"
  | "ready"
  | "waiting"
  | "done";

export type AdminTriageRadarItem = {
  applicantCount: number;
  band: AdminTriageBand;
  identityStatus: IdentityConsistencyReport["status"];
  nextAction: string;
  owner: Role | "system";
  reasons: string[];
  score: number;
  status: Submission["status"];
  submissionId: string;
  target?: WorkspaceTarget;
  title: string;
  updatedAt: string;
};

export type AdminTriageRadar = {
  items: AdminTriageRadarItem[];
  summaries: string[];
  totals: Record<AdminTriageBand, number>;
};

const bandOrder = {
  critical: 0,
  attention: 1,
  ready: 2,
  waiting: 3,
  done: 4,
} satisfies Record<AdminTriageBand, number>;

export function buildAdminTriageRadar(submissions: Submission[]): AdminTriageRadar {
  const items = submissions.map(adminTriageRadarItem).sort(triageSort);
  const totals = items.reduce(
    (accumulator, item) => ({
      ...accumulator,
      [item.band]: accumulator[item.band] + 1,
    }),
    {
      attention: 0,
      critical: 0,
      done: 0,
      ready: 0,
      waiting: 0,
    } satisfies Record<AdminTriageBand, number>,
  );

  return {
    items,
    summaries: [
      `Критично: ${totals.critical}`,
      `Внимание: ${totals.attention}`,
      `Готово: ${totals.ready}`,
      `Ждет агента/систему: ${totals.waiting}`,
    ],
    totals,
  };
}

export function adminTriageRadarItem(submission: Submission): AdminTriageRadarItem {
  const identityReport = buildIdentityConsistencyReport(submission);
  const firstIdentityFinding = firstActionableIdentityFinding(identityReport);
  const open = openIssueCount(submission);
  const blockers = blockerCount(submission);
  const unresolved = unresolvedOpenIssueCount(submission);
  const fixed = fixedIssueCount(submission);
  const fileCounts = submissionFileCounts(submission);
  const passportSignals = passportSignalCount(submission);
  const score = triageScore({
    blockers,
    fileCounts,
    fixed,
    identityReport,
    open,
    passportSignals,
    submission,
    unresolved,
  });
  const owner = triageOwner(submission);
  const band = triageBand(submission, score, owner);
  const reasons = triageReasons({
    blockers,
    fileCounts,
    fixed,
    identityReport,
    open,
    passportSignals,
    submission,
    unresolved,
  });
  const firstOpenIssue = submission.issues.find((issue) => issue.status === "open");
  const firstFixedIssue = submission.issues.find(
    (issue) => issue.status === "fixed_by_agent",
  );

  return {
    applicantCount: submission.applicants.length,
    band,
    identityStatus: identityReport.status,
    nextAction: triageNextAction({
      band,
      firstIdentityFinding,
      fixed,
      open,
      submission,
    }),
    owner,
    reasons,
    score,
    status: submission.status,
    submissionId: submission.id,
    target:
      firstIdentityFinding?.target ??
      (firstOpenIssue ? targetForIssue(firstOpenIssue) : undefined) ??
      (firstFixedIssue ? targetForIssue(firstFixedIssue) : undefined),
    title: submission.listTitle ?? submission.title,
    updatedAt: submission.updatedAt,
  };
}

function triageScore({
  blockers,
  fileCounts,
  fixed,
  identityReport,
  open,
  passportSignals,
  submission,
  unresolved,
}: {
  blockers: number;
  fileCounts: ReturnType<typeof submissionFileCounts>;
  fixed: number;
  identityReport: IdentityConsistencyReport;
  open: number;
  passportSignals: number;
  submission: Submission;
  unresolved: number;
}) {
  if (submission.status === "exported") return -100;

  const statusScore =
    submission.status === "corrections_received"
      ? 74
      : submission.status === "submitted_for_review"
        ? 66
        : submission.status === "ready_for_export"
          ? 48
          : submission.status === "returned" || submission.status === "requires_action"
            ? 34
            : submission.status === "in_progress"
              ? 18
              : 8;

  return Math.round(
    statusScore +
      identityReport.totals.blocked * 45 +
      identityReport.totals.needsReview * 14 +
      blockers * 32 +
      Math.max(0, open - blockers) * 18 +
      unresolved * 12 +
      fixed * 28 +
      fileCounts.needs_replacement * 18 +
      fileCounts.missing * 16 +
      fileCounts.pending_review * 10 +
      passportSignals * 12 +
      readinessGap(submission) * 0.25,
  );
}

function triageBand(
  submission: Submission,
  score: number,
  owner: Role | "system",
): AdminTriageBand {
  if (submission.status === "exported") return "done";
  if (owner !== "admin") return "waiting";
  if (score >= 95) return "critical";
  if (submission.status === "ready_for_export") return "ready";
  if (score >= 50) return "attention";
  return "waiting";
}

function triageOwner(submission: Submission): Role | "system" {
  if (submission.status === "exported") return "system";
  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received" ||
    submission.status === "ready_for_export"
  ) {
    return "admin";
  }
  return "agent";
}

function triageReasons({
  blockers,
  fileCounts,
  fixed,
  identityReport,
  open,
  passportSignals,
  submission,
  unresolved,
}: {
  blockers: number;
  fileCounts: ReturnType<typeof submissionFileCounts>;
  fixed: number;
  identityReport: IdentityConsistencyReport;
  open: number;
  passportSignals: number;
  submission: Submission;
  unresolved: number;
}) {
  const reasons = [
    identityReport.totals.blocked
      ? `${identityReport.totals.blocked} критичных расхождения личности`
      : "",
    identityReport.totals.needsReview
      ? `${identityReport.totals.needsReview} предупреждений по паспорту/PDF/анкете`
      : "",
    blockers ? `${blockers} открытых блокера` : "",
    fixed ? `${fixed} исправлений ждут закрытия` : "",
    unresolved > blockers
      ? `${unresolved - blockers} замечаний требуют действия агента`
      : "",
    open > blockers && unresolved <= blockers
      ? `${open - blockers} замечаний ждут закрытия админом`
      : "",
    fileCounts.needs_replacement ? `${fileCounts.needs_replacement} файлов заменить` : "",
    fileCounts.missing ? `${fileCounts.missing} файлов не загружено` : "",
    fileCounts.pending_review ? `${fileCounts.pending_review} файлов проверить` : "",
    passportSignals ? `${passportSignals} паспортных OCR-сигналов` : "",
    submission.status === "ready_for_export" ? "Пакет готов к контролю выгрузки" : "",
    submission.status === "exported" ? "Пакет уже выгружен" : "",
  ].filter(Boolean);

  return reasons.length ? reasons.slice(0, 4) : [`${statusLabels[submission.status]} без активного AI-сигнала`];
}

function triageNextAction({
  band,
  firstIdentityFinding,
  fixed,
  open,
  submission,
}: {
  band: AdminTriageBand;
  firstIdentityFinding: ReturnType<typeof firstActionableIdentityFinding>;
  fixed: number;
  open: number;
  submission: Submission;
}) {
  if (firstIdentityFinding) {
    return `Сверить: ${firstIdentityFinding.applicantName} → ${firstIdentityFinding.label}`;
  }
  if (fixed) return "Проверить исправления агента";
  if (open) return "Разобрать открытые замечания";
  if (submission.status === "ready_for_export") return "Проверить выгрузку";
  if (submission.status === "submitted_for_review") return "Ручная проверка заявки";
  if (submission.status === "corrections_received") return "Закрыть исправления или вернуть снова";
  if (band === "waiting") return "Ждать действия агента или системы";
  if (submission.status === "exported") return "Открыть историю";
  return "Открыть подачу";
}

function triageSort(left: AdminTriageRadarItem, right: AdminTriageRadarItem) {
  return (
    bandOrder[left.band] - bandOrder[right.band] ||
    right.score - left.score ||
    sortableDateValue(right.updatedAt) - sortableDateValue(left.updatedAt) ||
    left.submissionId.localeCompare(right.submissionId)
  );
}

function submissionFileCounts(submission: Submission) {
  return {
    accepted: submission.files.filter((file) => file.status === "accepted").length,
    missing: submission.files.filter((file) => file.status === "missing").length,
    needs_replacement: submission.files.filter(
      (file) => file.status === "needs_replacement",
    ).length,
    pending_review: submission.files.filter((file) => file.status === "pending_review")
      .length,
    uploaded: submission.files.filter((file) => file.status === "uploaded").length,
  };
}

function passportSignalCount(submission: Submission) {
  return submission.applicants.filter((applicant) => {
    const extraction = applicant.passportExtraction;
    if (!extraction) return false;
    if (extraction.status === "failed" || extraction.status === "unavailable") {
      return true;
    }
    return extraction.status === "ready" && !extraction.verifiedAtIso;
  }).length;
}

function readinessGap(submission: Submission) {
  return Math.max(0, 100 - submission.completeness.questionnaire) +
    Math.max(0, 100 - submission.completeness.files);
}

function sortableDateValue(value: string) {
  const trimmed = value.trim();
  const dotted = trimmed.match(/^(\d{2})\.(\d{2})(?:\.(\d{4}))?$/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const year = Number(dotted[3] ?? "2026");
    return year * 10_000 + month * 100 + day;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}
