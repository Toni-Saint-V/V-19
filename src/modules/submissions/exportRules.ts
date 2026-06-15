import type { ExportBlocker, ExportRow, ExportState, Submission } from "./types";
import { tripDates } from "./selectors";
import { typeLabels } from "./status";

export type ExportSelectionState = ExportState | "mixed";
export type ExportSummary = {
  rows: ExportRow[];
  blockers: ExportBlocker[];
  rowCount: number;
  ready: boolean;
  exportState: ExportSelectionState;
  canGenerate: boolean;
  canDownload: boolean;
  canMarkExported: boolean;
};

export function getExportBlockers(submissions: Submission[]): ExportBlocker[] {
  if (submissions.length === 0) return [{ reason: "Выберите хотя бы одну подачу" }];

  const blockers: ExportBlocker[] = [];
  const notReady = submissions.filter(
    (submission) => submission.status !== "ready_for_export",
  );
  const alreadyExported = submissions.filter(
    (submission) =>
      submission.status === "exported" || submission.exportState === "marked_exported",
  );
  const cities = new Set(submissions.map((submission) => submission.city));
  const dates = new Set(submissions.map(tripDates));
  const types = new Set(submissions.map((submission) => submission.type));
  const exportState = getExportSelectionState(submissions);

  if (notReady.length > 0) {
    blockers.push({ reason: "В выборке есть подачи не готовые к выгрузке" });
  }

  if (alreadyExported.length > 0) {
    blockers.push({ reason: "В выборке есть уже выгруженные подачи" });
  }

  if (cities.size > 1) blockers.push({ reason: "Нельзя смешивать разные города" });
  if (dates.size > 1) blockers.push({ reason: "Нельзя смешивать разные даты поездки" });
  if (types.size > 1)
    blockers.push({ reason: "Нельзя смешивать одинарные и семейные подачи" });
  if (exportState === "mixed")
    blockers.push({ reason: "В выборке разные состояния выгрузки" });

  return blockers;
}

export function canGenerateExport(submissions: Submission[]) {
  return getExportBlockers(submissions).length === 0;
}

export function buildExportRows(submissions: Submission[]): ExportRow[] {
  return submissions.flatMap((submission) =>
    submission.applicants.map((applicant, index) => ({
      submissionCode:
        submission.type === "family" ? `${submission.id}-${index + 1}` : submission.id,
      submissionId: submission.id,
      submissionTitle: submission.title,
      applicantName: applicant.fullName,
      city: submission.city,
      tripDates: tripDates(submission),
      type: typeLabels[submission.type],
      groupKey: submission.id,
      groupLabel: submission.type === "family" ? "Семья" : "Один заявитель",
      applicantIndex: index + 1,
      applicantCount: submission.applicants.length,
    })),
  );
}

export function exportSummary(submissions: Submission[]): ExportSummary {
  const rows = buildExportRows(submissions);
  const blockers = getExportBlockers(submissions);
  const exportState = getExportSelectionState(submissions);
  const ready = blockers.length === 0;

  return {
    rows,
    blockers,
    rowCount: rows.length,
    ready,
    exportState,
    canGenerate: ready && exportState === "ready",
    canDownload: ready && exportState === "file_generated",
    canMarkExported: ready && exportState === "file_downloaded",
  };
}

export function getExportSelectionState(
  submissions: Submission[],
): ExportSelectionState {
  if (submissions.length === 0) return "not_ready";

  const states = new Set(
    submissions.map(
      (submission) => submission.exportState ?? inferExportState(submission),
    ),
  );

  if (states.size > 1) return "mixed";
  return [...states][0] ?? "not_ready";
}

function inferExportState(submission: Submission): ExportState {
  if (submission.status === "exported") return "marked_exported";
  if (submission.status === "ready_for_export") return "ready";
  return "not_ready";
}
