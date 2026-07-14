import type { ExportBatch } from "../../types/domain";
import { safeDiagnosticsForPersistenceError } from "../../services/persistenceObservability";
import {
  commitSubmissionExportPackage,
  reconcileSubmissionExportPackage,
  type ExportPackageCommitBatch,
  type ExportPackageCommitOutcome,
  type ExportPackageCommitReconciliation,
} from "./exportPackagePersistence";
import {
  exportPackageDocumentCommitMatches,
  type ExportPackageDocumentCommit,
} from "./exportPackageDocumentCommit";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
} from "./exportRules";
import { tripDates } from "./selectors";
import { typeLabels } from "./status";
import type { Submission } from "./types";

export type ExportPackageCommitter = (
  batch: ExportPackageCommitBatch,
  documentExport: ExportPackageDocumentCommit,
) => Promise<ExportPackageCommitOutcome | null>;
export type ExportedSubmissionPersister = (submissions: Submission[]) => Promise<void>;

export interface CompleteExportPackageOptions {
  batchId?: string;
  createdAt: string;
  createdBy: string;
  documentExport: ExportPackageDocumentCommit;
  format: ExportBatch["format"];
  commitPackage?: ExportPackageCommitter;
  persistExportedSubmissions?: ExportedSubmissionPersister;
}

export interface CompleteExportPackageBlocked {
  status: "blocked";
  blockers: string[];
  submissions: Submission[];
}

export interface CompleteExportPackageExported {
  status: "exported";
  batch: ExportPackageCommitBatch;
  commit: ExportPackageCommitOutcome;
  submissions: Submission[];
}

export type CompleteExportPackageResult =
  | CompleteExportPackageBlocked
  | CompleteExportPackageExported;

export class ExportPackageCompletionUncertainError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExportPackageCompletionUncertainError";
  }
}

export async function reconcileExportPackageCompletion(
  submissions: Submission[],
  options: CompleteExportPackageOptions,
  failure: unknown,
): Promise<ExportPackageCommitReconciliation> {
  const identity = buildExportPackageIdentity(submissions, options.format);
  if (!identity) return { status: "unknown" };

  const diagnostics = safeDiagnosticsForPersistenceError(failure);
  if (diagnostics?.retryable) {
    try {
      const retried = await completeExportPackage(submissions, options);
      if (retried.status === "exported") {
        return { batch: retried.batch, status: "committed" };
      }
    } catch {
      // The canonical read below is the final authority after an idempotent retry.
    }
  }

  const canonical = await reconcileSubmissionExportPackage(
    identity,
    options.documentExport,
  );
  if (canonical.status === "committed") return canonical;
  if (
    canonical.status === "not_committed" &&
    diagnostics &&
    !diagnostics.retryable
  ) {
    return canonical;
  }
  return { status: "unknown" };
}

export async function completeExportPackage(
  submissions: Submission[],
  options: CompleteExportPackageOptions,
): Promise<CompleteExportPackageResult> {
  const plan = exportSummary(submissions, options.format);
  if (!plan.canMarkExported) {
    return {
      status: "blocked",
      blockers: plan.blockers.length
        ? plan.blockers.map((blocker) => blocker.reason)
        : ["Сначала сформируйте и скачайте файл выгрузки."],
      submissions,
    };
  }

  const packageIdentity = buildExportPackageIdentity(submissions, options.format);
  if (!packageIdentity) {
    return {
      status: "blocked",
      blockers: ["Пакет выгрузки пуст."],
      submissions,
    };
  }

  const batch: ExportPackageCommitBatch = {
    id: options.batchId ?? crypto.randomUUID(),
    createdAt: options.createdAt,
    createdBy: options.createdBy,
    ...packageIdentity,
  };
  const committer = options.commitPackage ?? commitSubmissionExportPackage;
  const commit = await committer(batch, options.documentExport);
  if (!commit) {
    throw new Error("Export package persistence did not return a commit result.");
  }
  if (!exportPackageIdentityMatches(packageIdentity, commit.batch)) {
    throw new Error("Committed export package identity does not match selection.");
  }
  if (
    !exportPackageDocumentCommitMatches(
      options.documentExport,
      commit.documentExport,
    )
  ) {
    throw new Error("Committed export package document proof does not match ZIP artifact.");
  }

  const exportedSubmissions = markSubmissionsExported(submissions, commit.batch);
  if (!allSubmissionsContainRecordedBatch(exportedSubmissions, commit.batch)) {
    throw new Error(
      "Export package was recorded, but exported submissions no longer match the batch.",
    );
  }

  await options.persistExportedSubmissions?.(exportedSubmissions);

  return {
    status: "exported",
    batch: commit.batch,
    commit,
    submissions: exportedSubmissions,
  };
}

function markSubmissionsExported(
  submissions: Submission[],
  batch: ExportBatch,
): Submission[] {
  const ids = new Set(batch.submissionIds);

  return submissions.map((submission) =>
    ids.has(submission.id) ? markSubmissionExported(submission, batch) : submission,
  );
}

function markSubmissionExported(
  submission: Submission,
  batch: ExportBatch,
): Submission {
  const historyId = `и-${submission.id}-выгружено-${batch.id}`;
  const existingHistory = submission.history.some((item) => item.id === historyId);

  return {
    ...submission,
    status: "exported",
    exportState: "marked_exported",
    updatedAt: batch.createdAt,
    history: existingHistory
      ? submission.history
      : [
          {
            id: historyId,
            text: `Подача включена в выгрузку ${batch.fileName ?? batch.id}`,
            at: batch.createdAt,
            source: "admin",
          },
          ...submission.history,
        ],
  };
}

function allSubmissionsContainRecordedBatch(
  submissions: Submission[],
  batch: ExportBatch,
): boolean {
  const expectedIds = new Set(batch.submissionIds);
  const matchingSubmissions = submissions.filter((submission) =>
    expectedIds.has(submission.id),
  );

  return (
    matchingSubmissions.length === expectedIds.size &&
    matchingSubmissions.every(
      (submission) =>
        submission.status === "exported" &&
        submission.exportState === "marked_exported" &&
        submission.history.some((item) =>
          item.text.includes(batch.fileName ?? batch.id),
        ),
    )
  );
}

export function exportPackagePreviewName(
  submissions: Submission[],
  format: ExportBatch["format"],
): string | null {
  return buildExportPackageIdentity(submissions, format)?.fileName ?? null;
}

export function exportPackageLabel(submission: Submission): string {
  return [
    submission.id,
    typeLabels[submission.type],
    submission.city,
    tripDates(submission),
  ].join(" · ");
}
