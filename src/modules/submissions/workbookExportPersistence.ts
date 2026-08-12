import type {
  WorkbookExportCommitResult,
  WorkbookExportPayload,
  WorkbookExportReconciliationResult,
  WorkbookExportReconciliationPayload,
  WorkbookExportReceiptResult,
} from "../../lib/supabase/database.types";
import { getSupabaseClient } from "../../lib/supabase/client";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import type {
  ExportWorkbookCompletionRequest,
  ExportWorkbookDownloadRequest,
  WorkbookExportReconciliationStage,
} from "./exportPackageDocumentCommit";

type WorkbookExportRequest =
  | ExportWorkbookCompletionRequest
  | ExportWorkbookDownloadRequest;

type WorkbookLifecyclePayload = WorkbookExportPayload & {
  archive_input_signature: string;
  expected_case_revisions: Record<string, number>;
};

type WorkbookLifecycleReconciliationPayload = WorkbookLifecyclePayload & {
  stage: WorkbookExportReconciliationStage;
};

function toBatchPayload(request: WorkbookExportRequest) {
  const identity = request.packageIdentity;
  if (identity.format !== "xlsx") {
    throw new Error("Workbook lifecycle accepts only xlsx artifacts.");
  }
  return {
    content_fingerprint: identity.contentFingerprint,
    file_name: identity.fileName,
    format: "xlsx" as const,
    idempotency_key: identity.idempotencyKey,
    row_count: identity.rowCount,
    submission_ids: [...request.submissionIds],
  };
}

function toExpectedCaseRevisions(request: WorkbookExportRequest) {
  const submissionIds = [...request.submissionIds].sort();
  const revisionIds = Object.keys(request.expectedCaseRevisions).sort();
  if (
    revisionIds.length !== submissionIds.length ||
    revisionIds.some((id, index) => id !== submissionIds[index]) ||
    revisionIds.some((id) => {
      const revision = request.expectedCaseRevisions[id];
      return !Number.isSafeInteger(revision) || Number(revision) < 0;
    })
  ) {
    throw new Error("Workbook lifecycle requires exact preparation revisions.");
  }
  return Object.fromEntries(
    revisionIds.map((id) => [id, request.expectedCaseRevisions[id]]),
  );
}

function toWorkbookPayload(request: WorkbookExportRequest) {
  if (!request.archiveInputSignature.trim()) {
    throw new Error("Workbook lifecycle requires its preparation signature.");
  }
  return {
    archive_input_signature: request.archiveInputSignature,
    batch: toBatchPayload(request),
    expected_case_revisions: toExpectedCaseRevisions(request),
  };
}

async function callWorkbookRpc(
  operation: "record_export_workbook_download_acknowledgement",
  payload: WorkbookLifecyclePayload,
): Promise<WorkbookExportReceiptResult>;
async function callWorkbookRpc(
  operation: "complete_workbook_export",
  payload: WorkbookLifecyclePayload,
): Promise<WorkbookExportCommitResult>;
async function callWorkbookRpc(
  operation: "reconcile_workbook_export",
  payload: WorkbookLifecycleReconciliationPayload,
): Promise<WorkbookExportReconciliationResult>;
async function callWorkbookRpc(
  operation:
    | "complete_workbook_export"
    | "reconcile_workbook_export"
    | "record_export_workbook_download_acknowledgement",
  payload:
    | WorkbookLifecyclePayload
    | WorkbookLifecycleReconciliationPayload,
): Promise<
  | WorkbookExportCommitResult
  | WorkbookExportReceiptResult
  | WorkbookExportReconciliationResult
> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase workbook persistence is unavailable.");
  }

  let response: {
    data:
      | WorkbookExportCommitResult
      | WorkbookExportReceiptResult
      | WorkbookExportReconciliationResult
      | null;
    error: unknown;
  };
  try {
    if (operation === "reconcile_workbook_export") {
      response = await client.rpc(operation, {
        payload: payload as WorkbookExportReconciliationPayload,
      });
    } else if (operation === "complete_workbook_export") {
      response = await client.rpc(operation, {
        payload: payload as WorkbookExportPayload,
      });
    } else {
      response = await client.rpc(operation, {
        payload: payload as WorkbookExportPayload,
      });
    }
  } catch (error) {
    throw mapSupabasePersistenceError(error, {
      operation: `rpc.${operation}`,
      fallbackKind: "rpc",
    });
  }

  if (response.error) {
    throw mapSupabasePersistenceError(response.error, {
      operation: `rpc.${operation}`,
      fallbackKind: "rpc",
    });
  }
  if (!response.data) {
    throw new Error(`Workbook RPC ${operation} returned no canonical result.`);
  }
  return response.data;
}

export async function recordWorkbookDownloadAcknowledgement(
  request: ExportWorkbookDownloadRequest,
): Promise<WorkbookExportReceiptResult> {
  return callWorkbookRpc("record_export_workbook_download_acknowledgement", {
    ...toWorkbookPayload(request),
  });
}

export async function completeWorkbookExport(
  request: ExportWorkbookCompletionRequest,
): Promise<WorkbookExportCommitResult> {
  return callWorkbookRpc("complete_workbook_export", {
    ...toWorkbookPayload(request),
  });
}

export async function reconcileWorkbookExport(
  stage: WorkbookExportReconciliationStage,
  request: WorkbookExportRequest,
): Promise<WorkbookExportReconciliationResult> {
  return callWorkbookRpc("reconcile_workbook_export", {
    ...toWorkbookPayload(request),
    stage,
  });
}
