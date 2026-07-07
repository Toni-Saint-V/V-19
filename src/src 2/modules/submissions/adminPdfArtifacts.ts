import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  AdminPdfArtifactKind,
  AdminPdfArtifactRow,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import {
  buildApplicationPdfStorageTarget,
  buildAppointmentPdfStorageTarget,
  deleteMediaFromStorage,
  mediaStorageBucket,
  uploadMediaToStorage,
  validateApplicationPdfStorageTarget,
  validateAppointmentPdfStorageTarget,
  type MediaStorageTarget,
} from "./mediaStorage";

export type AdminPdfArtifact = {
  id: string;
  artifactKind: AdminPdfArtifactKind;
  fileName: string;
  sha256: string;
  storageBucket: typeof mediaStorageBucket;
  storagePath: string;
  submissionId: string;
  uploadedAt: string;
  uploadedBy: string;
};

type UploadAdminPdfInput = {
  actorId: string;
  artifactKind: AdminPdfArtifactKind;
  file: File;
  nonce?: string;
  submissionId: string;
};

function mapAdminPdfArtifact(row: AdminPdfArtifactRow): AdminPdfArtifact {
  return {
    artifactKind: row.artifact_kind,
    fileName: row.file_name,
    id: row.id,
    sha256: row.sha256,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    submissionId: row.submission_id,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
  };
}

function storageTargetForAdminPdf(input: {
  artifactKind: AdminPdfArtifactKind;
  nonce?: string;
  sha256: string;
  submissionId: string;
}): MediaStorageTarget {
  if (input.artifactKind === "appointment_pdf") {
    return buildAppointmentPdfStorageTarget(input);
  }

  return buildApplicationPdfStorageTarget(input);
}

function validateAdminPdfTarget(input: {
  artifactKind: AdminPdfArtifactKind;
  file: File;
  sha256: string;
  submissionId: string;
  target: MediaStorageTarget;
}): MediaStorageTarget {
  if (input.artifactKind === "appointment_pdf") {
    return validateAppointmentPdfStorageTarget(input);
  }

  return validateApplicationPdfStorageTarget(input);
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function listAdminPdfArtifacts(
  submissionId: string,
): Promise<AdminPdfArtifact[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("admin_pdf_artifacts")
    .select(
      "id,submission_id,artifact_kind,storage_bucket,storage_path,file_name,sha256,uploaded_by,uploaded_at",
    )
    .eq("submission_id", submissionId)
    .order("artifact_kind", { ascending: true });
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "admin_pdf_artifacts.list",
      fallbackKind: "database",
    });
  }

  return (data ?? []).map(mapAdminPdfArtifact);
}

export async function uploadAdminPdfArtifact(
  input: UploadAdminPdfInput,
): Promise<AdminPdfArtifact | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const sha256 = await sha256Hex(input.file);
  const target = validateAdminPdfTarget({
    artifactKind: input.artifactKind,
    file: input.file,
    sha256,
    submissionId: input.submissionId,
    target: storageTargetForAdminPdf({
      artifactKind: input.artifactKind,
      nonce: input.nonce,
      sha256,
      submissionId: input.submissionId,
    }),
  });

  const uploaded = await uploadMediaToStorage(target, input.file);

  const { data, error } = await client
    .from("admin_pdf_artifacts")
    .upsert(
      {
        artifact_kind: input.artifactKind,
        file_name: input.file.name,
        sha256,
        storage_bucket: mediaStorageBucket,
        storage_path: target.path,
        submission_id: input.submissionId,
        uploaded_by: input.actorId,
      },
      { onConflict: "submission_id,artifact_kind" },
    )
    .select(
      "id,submission_id,artifact_kind,storage_bucket,storage_path,file_name,sha256,uploaded_by,uploaded_at",
    )
    .single();
  if (error) {
    if (uploaded) {
      await deleteMediaFromStorage(target);
    }
    throw mapSupabasePersistenceError(error, {
      operation: "admin_pdf_artifacts.upsert",
      fallbackKind: "database",
    });
  }

  return mapAdminPdfArtifact(data);
}
