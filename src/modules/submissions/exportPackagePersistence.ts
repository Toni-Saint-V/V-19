import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  ExportBatchRow,
  ExportPackageCommitPayload,
  ExportPackageCommitResult,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import type { ExportBatch } from "../../types/domain";

type ExportBatchWrite = ExportPackageCommitPayload["batch"];

function toNullableUuid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : undefined;
}

function toExportBatchWrite(batch: ExportBatch): ExportBatchWrite {
  return {
    ...(toNullableUuid(batch.id) ? { id: batch.id } : {}),
    file_name: batch.fileName ?? null,
    format: batch.format,
    idempotency_key: batch.idempotencyKey ?? null,
    row_count: batch.rowCount,
    submission_ids: batch.submissionIds,
  };
}

function toExportPackageCommitPayload(
  batch: ExportBatch,
): ExportPackageCommitPayload {
  return {
    batch: toExportBatchWrite(batch),
  };
}

function mapExportBatchRow(row: ExportBatchRow): ExportBatch {
  return {
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    format: row.format,
    idempotencyKey: row.idempotency_key ?? undefined,
    fileName: row.file_name ?? undefined,
    rowCount: row.row_count,
    submissionIds: row.submission_ids,
  };
}

function mapExportPackageCommitResult(
  result: ExportPackageCommitResult,
): ExportBatch {
  return mapExportBatchRow(result.exportBatch);
}

export async function commitSubmissionExportPackage(
  batch: ExportBatch,
): Promise<ExportBatch | null> {
  const client = getSupabaseClient();
  if (!client) return batch;

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
