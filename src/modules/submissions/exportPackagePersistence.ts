import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  ExportBatchRow,
  ExportPackageCommitPayload,
  ExportPackageCommitResult,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import type { ExportBatch } from "../../types/domain";
import { exportPackageIdentityMatches } from "./exportRules";
import type { ExportPackageIdentity } from "./types";

type ExportBatchWrite = ExportPackageCommitPayload["batch"];

export type ExportPackageCommitBatch = ExportBatch & {
  contentFingerprint: string;
  fileName: string;
  idempotencyKey: string;
};

export interface ExportPackageCommitOutcome {
  batch: ExportPackageCommitBatch;
  changedSubmissions: number;
  duplicate: boolean;
  statusHistory: number;
}

export type ExportPackageCommitReconciliation =
  | {
      batch: ExportPackageCommitBatch;
      status: "committed";
    }
  | { status: "not_committed" }
  | { status: "unknown" };

const exportBatchReconciliationSelect =
  "id,created_by,created_at,file_name,format,content_fingerprint,idempotency_key,row_count,submission_ids" as const;

function toNullableUuid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : undefined;
}

function toExportBatchWrite(batch: ExportPackageCommitBatch): ExportBatchWrite {
  return {
    ...(toNullableUuid(batch.id) ? { id: batch.id } : {}),
    content_fingerprint: batch.contentFingerprint,
    file_name: batch.fileName,
    format: batch.format,
    idempotency_key: batch.idempotencyKey,
    row_count: batch.rowCount,
    submission_ids: batch.submissionIds,
  };
}

function toExportPackageCommitPayload(
  batch: ExportPackageCommitBatch,
): ExportPackageCommitPayload {
  return {
    batch: toExportBatchWrite(batch),
  };
}

function mapExportBatchRow(row: ExportBatchRow): ExportPackageCommitBatch {
  if (!row.content_fingerprint || !row.idempotency_key || !row.file_name) {
    throw new Error("Committed export package is missing durable identity fields.");
  }

  return {
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    contentFingerprint: row.content_fingerprint,
    fileName: row.file_name,
    format: row.format,
    idempotencyKey: row.idempotency_key,
    rowCount: row.row_count,
    submissionIds: row.submission_ids,
  };
}

function mapExportPackageCommitResult(
  result: ExportPackageCommitResult,
): ExportPackageCommitOutcome {
  return {
    batch: mapExportBatchRow(result.exportBatch),
    changedSubmissions: result.submissions,
    duplicate: result.duplicate,
    statusHistory: result.statusHistory,
  };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const orderedLeft = [...left].sort();
  const orderedRight = [...right].sort();
  return (
    orderedLeft.length === orderedRight.length &&
    orderedLeft.every((value, index) => value === orderedRight[index])
  );
}

export async function reconcileSubmissionExportPackage(
  identity: ExportPackageIdentity,
): Promise<ExportPackageCommitReconciliation> {
  const client = getSupabaseClient();
  if (!client) return { status: "unknown" };

  try {
    const [batchResult, submissionsResult] = await Promise.all([
      client
        .from("export_batches")
        .select(exportBatchReconciliationSelect)
        .eq("idempotency_key", identity.idempotencyKey)
        .limit(2),
      client
        .from("submissions")
        .select("id,status")
        .in("id", identity.submissionIds),
    ]);

    if (batchResult.error || submissionsResult.error) {
      return { status: "unknown" };
    }

    const submissionRows = submissionsResult.data ?? [];
    const exactSubmissionSet = sameIds(
      submissionRows.map((row) => row.id),
      identity.submissionIds,
    );
    if (!exactSubmissionSet) return { status: "unknown" };

    const batchRows = batchResult.data ?? [];
    if (batchRows.length === 1) {
      const batch = mapExportBatchRow(batchRows[0]);
      const allExported = submissionRows.every((row) => row.status === "exported");
      return exportPackageIdentityMatches(identity, batch) && allExported
        ? { batch, status: "committed" }
        : { status: "unknown" };
    }

    if (
      batchRows.length === 0 &&
      submissionRows.every((row) => row.status === "ready_for_excel")
    ) {
      return { status: "not_committed" };
    }

    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

export async function commitSubmissionExportPackage(
  batch: ExportPackageCommitBatch,
): Promise<ExportPackageCommitOutcome | null> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      batch,
      changedSubmissions: batch.submissionIds.length,
      duplicate: false,
      statusHistory: batch.submissionIds.length,
    };
  }

  let response: { data: ExportPackageCommitResult | null; error: unknown };
  try {
    response = await client.rpc("complete_export_package", {
      payload: toExportPackageCommitPayload(batch),
    });
  } catch (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "rpc.complete_export_package",
      fallbackKind: "rpc",
    });
  }

  const { data, error } = response;

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "rpc.complete_export_package",
      fallbackKind: "rpc",
    });
  }

  return data ? mapExportPackageCommitResult(data) : null;
}
