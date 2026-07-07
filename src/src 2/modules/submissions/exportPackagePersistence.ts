import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  ExportBatchRow,
  ExportPackageCommitPayload,
  ExportPackageCommitResult,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import type { ExportBatch } from "../../types/domain";

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

  const { data, error } = await client.rpc("complete_export_package", {
    payload: toExportPackageCommitPayload(batch),
  });

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "rpc.complete_export_package",
      fallbackKind: "rpc",
    });
  }

  return data ? mapExportPackageCommitResult(data) : null;
}
