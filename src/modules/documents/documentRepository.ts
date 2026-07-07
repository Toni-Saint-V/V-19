import {
  getSupabaseClient,
  requireSupabaseClient,
  type VisaFlowSupabaseClient,
} from "../../lib/supabase/client";
import type {
  DocumentAssetInsert as DbDocumentAssetInsert,
  DocumentExportEventInsert,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import {
  mediaStorageBucket,
  type MediaStorageTarget,
} from "../submissions/mediaStoragePolicy";
import {
  type DocumentAsset,
  type DocumentAssetInsert,
  type DocumentAssetRow,
  mapDocumentAssetRow,
  parseDocumentStoragePath,
} from "./documentTypes";

const documentAssetSelect =
  "id,source_media_asset_id,submission_id,applicant_id,owner_user_id,type,bucket,storage_path,filename,upload_status,validation_status,export_status,mime,size,checksum,uploaded_at,validated_at,created_at,updated_at" as const;

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

  async save(asset: DocumentAssetInsert): Promise<DocumentAsset> {
    const { data, error } = await this.client
      .from("document_assets")
      .upsert(asset as DbDocumentAssetInsert, {
        onConflict: "submission_id,applicant_id,type",
      })
      .select(documentAssetSelect)
      .single();

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "document_assets.save",
        fallbackKind: "database",
      });
    }

    return mapDocumentAssetRow(data as DocumentAssetRow);
  }

  async saveUploadedStorageAsset(
    target: MediaStorageTarget,
    file: Pick<File, "name" | "size" | "type">,
    options: {
      checksum?: string | null;
      ownerUserId?: string | null;
      sourceMediaAssetId?: string | null;
    } = {},
  ): Promise<DocumentAsset | null> {
    const parsed = parseDocumentStoragePath(target.path);
    if (!parsed) return null;

    const ownerUserId = options.ownerUserId ?? (await this.currentUserId());
    return this.save({
      source_media_asset_id: options.sourceMediaAssetId ?? null,
      submission_id: parsed.submissionId,
      applicant_id: parsed.applicantId,
      owner_user_id: ownerUserId,
      type: parsed.type,
      bucket: mediaStorageBucket,
      storage_path: target.path,
      filename: parsed.filename,
      upload_status: "uploaded",
      validation_status: "pending",
      export_status: "not_ready",
      mime: file.type || null,
      size: file.size || null,
      checksum: options.checksum ?? null,
      uploaded_at: new Date().toISOString(),
      validated_at: null,
    });
  }

  async markExported(ids: string[]): Promise<void> {
    if (!ids.length) return;

    const { error } = await this.client
      .from("document_assets")
      .update({ export_status: "exported" })
      .in("id", ids);

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "document_assets.mark_exported",
        fallbackKind: "database",
      });
    }
  }

  async recordExportAudit(input: DocumentExportAuditInput): Promise<void> {
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

    const { error } = await this.client
      .from("document_export_events")
      .insert(payload);

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "document_export_events.insert",
        fallbackKind: "database",
      });
    }
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
