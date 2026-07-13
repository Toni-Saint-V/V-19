import {
  getSupabaseClient,
  requireSupabaseClient,
  type VisaFlowSupabaseClient,
} from "../../lib/supabase/client";
import type {
  DocumentExportEventInsert,
  DocumentExportEventRow,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import {
  type DocumentAsset,
  type DocumentExportStatus,
  type DocumentAssetRow,
  mapDocumentAssetRow,
} from "./documentTypes";

const documentAssetSelect =
  "id,source_media_asset_id,submission_id,applicant_id,owner_user_id,type,bucket,storage_path,filename,upload_status,validation_status,export_status,mime,size,checksum,uploaded_at,validated_at,created_at,updated_at" as const;
const documentAssetExportStateSelect = "id,export_status" as const;
const documentExportEventIdentitySelect =
  "id,submission_ids,asset_ids,zip_file_name,file_count,package_identity_key" as const;

type DocumentExportEventIdentityRow = Pick<
  DocumentExportEventRow,
  | "asset_ids"
  | "file_count"
  | "id"
  | "package_identity_key"
  | "submission_ids"
  | "zip_file_name"
>;

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const orderedLeft = [...left].sort();
  const orderedRight = [...right].sort();
  return (
    orderedLeft.length === orderedRight.length &&
    orderedLeft.every((value, index) => value === orderedRight[index])
  );
}

function exportEventMatches(
  row: DocumentExportEventIdentityRow,
  input: DocumentExportAuditInput,
): boolean {
  return (
    row.package_identity_key === input.packageId &&
    row.zip_file_name === input.fileName &&
    row.file_count === input.fileCount &&
    sameIds(row.asset_ids, input.documentAssetIds) &&
    sameIds(row.submission_ids, input.submissionIds)
  );
}

export type DocumentExportAuditInput = {
  documentAssetIds: string[];
  fileCount: number;
  fileName: string;
  metadata?: Record<string, unknown>;
  packageId: string;
  submissionIds: string[];
};

export class DocumentRepository {
  constructor(
    private readonly client: VisaFlowSupabaseClient = requireSupabaseClient(),
  ) {}

  static optional(): DocumentRepository | null {
    const client = getSupabaseClient();
    return client ? new DocumentRepository(client) : null;
  }

  async getApplicantDocuments(
    submissionId: string,
    applicantId: string,
  ): Promise<DocumentAsset[]> {
    const { data, error } = await this.client
      .from("document_assets")
      .select(documentAssetSelect)
      .eq("submission_id", submissionId)
      .eq("applicant_id", applicantId)
      .order("type", { ascending: true });

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "document_assets.get_applicant_documents",
        fallbackKind: "database",
      });
    }

    return (data ?? []).map((row) =>
      mapDocumentAssetRow(row as DocumentAssetRow),
    );
  }

  async getReadyForExport(
    submissionIds: string | readonly string[],
  ): Promise<DocumentAsset[]> {
    const ids = Array.isArray(submissionIds)
      ? [...submissionIds]
      : [submissionIds];
    if (ids.length === 0) return [];

    const { data, error } = await this.client
      .from("document_assets")
      .select(documentAssetSelect)
      .in("submission_id", ids)
      .eq("upload_status", "uploaded")
      .eq("validation_status", "passed")
      .eq("export_status", "ready")
      .order("submission_id", { ascending: true })
      .order("applicant_id", { ascending: true })
      .order("type", { ascending: true });

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "document_assets.get_ready_for_export",
        fallbackKind: "database",
      });
    }

    return (data ?? []).map((row) =>
      mapDocumentAssetRow(row as DocumentAssetRow),
    );
  }

  async markExported(ids: string[]): Promise<void> {
    await this.setExportStatus(ids, "exported", "document_assets.mark_exported");
  }

  async restoreReadyForExport(ids: string[]): Promise<void> {
    await this.setExportStatus(
      ids,
      "ready",
      "document_assets.restore_ready_for_export",
    );
  }

  async recordExportAudit(input: DocumentExportAuditInput): Promise<void> {
    const existingEvents = await this.findExportEvents(input.packageId);
    if (
      existingEvents.length &&
      existingEvents.every((row) => exportEventMatches(row, input))
    ) {
      return;
    }
    if (existingEvents.length) {
      throw new Error("Existing document export audit identity does not match package.");
    }

    const actorId = await this.currentUserId();
    const payload: DocumentExportEventInsert = {
      event_type: "DOCUMENT_EXPORT_CREATED",
      submission_ids: input.submissionIds,
      asset_ids: input.documentAssetIds,
      zip_file_name: input.fileName,
      file_count: input.fileCount,
      package_identity_key: input.packageId,
      created_by: actorId,
    };

    let insertFailure: unknown = null;
    try {
      const { error } = await this.client
        .from("document_export_events")
        .insert(payload);
      insertFailure = error;
    } catch (error) {
      insertFailure = error;
    }

    if (insertFailure) {
      try {
        const reconciledEvents = await this.findExportEvents(input.packageId);
        if (
          reconciledEvents.length &&
          reconciledEvents.every((row) => exportEventMatches(row, input))
        ) {
          return;
        }
      } catch {
        // Preserve the original insert failure; reconciliation remains inconclusive.
      }
      throw mapSupabasePersistenceError(insertFailure, {
        operation: "document_export_events.insert",
        fallbackKind: "database",
      });
    }
  }

  private async setExportStatus(
    ids: string[],
    status: "exported" | "ready",
    operation:
      | "document_assets.mark_exported"
      | "document_assets.restore_ready_for_export",
  ): Promise<void> {
    const exactIds = [...new Set(ids)];
    if (!exactIds.length) return;

    let lastMutationFailure: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let mutationData: Array<{
        export_status: DocumentExportStatus;
        id: string;
      }> | null = null;
      let mutationFailure: unknown = null;
      try {
        const { data, error } = await this.client
          .from("document_assets")
          .update({ export_status: status })
          .in("id", exactIds)
          .select(documentAssetExportStateSelect);
        mutationData = data;
        mutationFailure = error;
      } catch (error) {
        mutationFailure = error;
      }

      if (!mutationFailure) {
        if (this.hasExactAssetStatus(mutationData, exactIds, status)) return;
        throw new Error(
          `Document export status did not update every requested asset to ${status}.`,
        );
      }

      lastMutationFailure = mutationFailure;
      try {
        const reconciled = await this.readAssetExportStatuses(exactIds);
        if (this.hasExactAssetStatus(reconciled, exactIds, status)) return;
      } catch {
        // Retry the same idempotent exact-ID mutation once before failing closed.
      }
    }

    throw mapSupabasePersistenceError(lastMutationFailure, {
      operation,
      fallbackKind: "database",
    });
  }

  private async readAssetExportStatuses(
    ids: string[],
  ): Promise<Array<{ export_status: DocumentExportStatus; id: string }>> {
    const { data, error } = await this.client
      .from("document_assets")
      .select(documentAssetExportStateSelect)
      .in("id", ids);
    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "document_assets.get_ready_for_export",
        fallbackKind: "database",
      });
    }
    return data ?? [];
  }

  private hasExactAssetStatus(
    rows: Array<{ export_status: string; id: string }> | null,
    ids: string[],
    status: "exported" | "ready",
  ): boolean {
    return Boolean(
      rows &&
        sameIds(
          rows.map((row) => row.id),
          ids,
        ) &&
        rows.every((row) => row.export_status === status),
    );
  }

  private async findExportEvents(
    packageId: string,
  ): Promise<DocumentExportEventIdentityRow[]> {
    const { data, error } = await this.client
      .from("document_export_events")
      .select(documentExportEventIdentitySelect)
      .eq("package_identity_key", packageId)
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "document_export_events.find_existing",
        fallbackKind: "database",
      });
    }
    return data ?? [];
  }

  private async currentUserId(): Promise<string | null> {
    const auth = (this.client as {
      auth?: {
        getUser?: () => Promise<{
          data?: { user?: { id?: string | null } | null } | null;
          error?: unknown;
        }>;
      };
    }).auth;

    if (typeof auth?.getUser !== "function") return null;
    const { data, error } = await auth.getUser();
    if (error) return null;
    return data?.user?.id ?? null;
  }

}
