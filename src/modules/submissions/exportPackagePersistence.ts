import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  DocumentExportEventRow,
  ExportBatchRow,
  ExportPackageCommitPayload,
  ExportPackageCommitResult,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import type { ExportBatch } from "../../types/domain";
import type { ExportPackageDocumentCommit } from "./exportPackageDocumentCommit";
import { exportPackageIdentityMatches } from "./exportRules";
import type { ExportPackageIdentity } from "./types";

type ExportBatchWrite = ExportPackageCommitPayload["batch"];
type ExportDocumentWrite = ExportPackageCommitPayload["document_export"];
type DocumentExportEventReconciliationRow = Pick<
  DocumentExportEventRow,
  | "applicant_count"
  | "asset_ids"
  | "file_count"
  | "id"
  | "package_identity_key"
  | "submission_ids"
  | "workbook_file_name"
  | "zip_file_name"
>;

type DocumentAssetExportStateRow = {
  export_status: string;
  id: string;
};

export type ExportPackageCommitBatch = ExportBatch & {
  contentFingerprint: string;
  fileName: string;
  idempotencyKey: string;
};

export interface ExportPackageCommitOutcome {
  batch: ExportPackageCommitBatch;
  changedSubmissions: number;
  documentExport: ExportPackageDocumentCommit;
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
const documentExportEventReconciliationSelect =
  "id,submission_ids,asset_ids,zip_file_name,file_count,applicant_count,workbook_file_name,package_identity_key" as const;
const documentAssetExportStateSelect = "id,export_status" as const;
const rawPreTerminalExportStatuses = new Set(["accepted", "ready_for_excel"]);

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

function toExportDocumentWrite(
  documentExport: ExportPackageDocumentCommit,
): ExportDocumentWrite {
  return {
    applicant_count: documentExport.applicantCount,
    asset_ids: documentExport.assetIds,
    file_count: documentExport.fileCount,
    workbook_file_name: documentExport.workbookFileName,
    zip_file_name: documentExport.zipFileName,
  };
}

function toExportPackageCommitPayload(
  batch: ExportPackageCommitBatch,
  documentExport: ExportPackageDocumentCommit,
): ExportPackageCommitPayload {
  return {
    batch: toExportBatchWrite(batch),
    document_export: toExportDocumentWrite(documentExport),
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

function mapDocumentExportCommit(
  result: ExportPackageCommitResult["documentExport"],
): ExportPackageDocumentCommit {
  if (
    !result ||
    !Array.isArray(result.asset_ids) ||
    !result.zip_file_name ||
    !result.workbook_file_name ||
    !Number.isInteger(result.file_count) ||
    !Number.isInteger(result.applicant_count)
  ) {
    throw new Error("Committed export package is missing document audit proof.");
  }

  return {
    applicantCount: result.applicant_count,
    assetIds: result.asset_ids,
    fileCount: result.file_count,
    workbookFileName: result.workbook_file_name,
    zipFileName: result.zip_file_name,
  };
}

function mapExportPackageCommitResult(
  result: ExportPackageCommitResult,
): ExportPackageCommitOutcome {
  return {
    batch: mapExportBatchRow(result.exportBatch),
    changedSubmissions: result.submissions,
    documentExport: mapDocumentExportCommit(result.documentExport),
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

function documentExportEventMatches(
  row: DocumentExportEventReconciliationRow,
  identity: ExportPackageIdentity,
  documentExport: ExportPackageDocumentCommit,
): boolean {
  return (
    row.package_identity_key === identity.idempotencyKey &&
    row.zip_file_name === documentExport.zipFileName &&
    row.file_count === documentExport.fileCount &&
    row.applicant_count === documentExport.applicantCount &&
    row.workbook_file_name === documentExport.workbookFileName &&
    sameIds(row.asset_ids, documentExport.assetIds) &&
    sameIds(row.submission_ids, identity.submissionIds)
  );
}

function assetsHaveExactStatus(
  rows: readonly DocumentAssetExportStateRow[],
  assetIds: readonly string[],
  status: "exported" | "ready",
): boolean {
  return (
    sameIds(
      rows.map((row) => row.id),
      assetIds,
    ) && rows.every((row) => row.export_status === status)
  );
}

export async function reconcileSubmissionExportPackage(
  identity: ExportPackageIdentity,
  documentExport: ExportPackageDocumentCommit,
): Promise<ExportPackageCommitReconciliation> {
  const client = getSupabaseClient();
  if (!client) return { status: "unknown" };

  try {
    const [batchResult, submissionsResult, eventResult, assetsResult] =
      await Promise.all([
        client
          .from("export_batches")
          .select(exportBatchReconciliationSelect)
          .eq("idempotency_key", identity.idempotencyKey)
          .limit(2),
        client
          .from("submissions")
          .select("id,status")
          .in("id", identity.submissionIds),
        client
          .from("document_export_events")
          .select(documentExportEventReconciliationSelect)
          .eq("package_identity_key", identity.idempotencyKey)
          .limit(2),
        client
          .from("document_assets")
          .select(documentAssetExportStateSelect)
          .in("id", documentExport.assetIds),
      ]);

    if (
      batchResult.error ||
      submissionsResult.error ||
      eventResult.error ||
      assetsResult.error
    ) {
      return { status: "unknown" };
    }

    const submissionRows = submissionsResult.data ?? [];
    const exactSubmissionSet = sameIds(
      submissionRows.map((row) => row.id),
      identity.submissionIds,
    );
    if (!exactSubmissionSet) return { status: "unknown" };

    const batchRows = batchResult.data ?? [];
    const eventRows = (eventResult.data ?? []) as DocumentExportEventReconciliationRow[];
    const assetRows = (assetsResult.data ?? []) as DocumentAssetExportStateRow[];
    const exactDocumentEvent =
      eventRows.length === 1 &&
      documentExportEventMatches(eventRows[0], identity, documentExport);

    if (batchRows.length === 1) {
      const batch = mapExportBatchRow(batchRows[0]);
      const allExported = submissionRows.every((row) => row.status === "exported");
      return exportPackageIdentityMatches(identity, batch) &&
        allExported &&
        exactDocumentEvent &&
        assetsHaveExactStatus(assetRows, documentExport.assetIds, "exported")
        ? { batch, status: "committed" }
        : { status: "unknown" };
    }

    if (
      batchRows.length === 0 &&
      eventRows.length === 0 &&
      submissionRows.every((row) => rawPreTerminalExportStatuses.has(row.status)) &&
      assetsHaveExactStatus(assetRows, documentExport.assetIds, "ready")
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
  documentExport: ExportPackageDocumentCommit,
): Promise<ExportPackageCommitOutcome | null> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      batch,
      changedSubmissions: batch.submissionIds.length,
      documentExport,
      duplicate: false,
      statusHistory: batch.submissionIds.length,
    };
  }

  let response: { data: ExportPackageCommitResult | null; error: unknown };
  try {
    response = await client.rpc("complete_export_package", {
      payload: toExportPackageCommitPayload(batch, documentExport),
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
