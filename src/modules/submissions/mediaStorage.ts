import { getSupabaseClient } from "../../lib/supabase/client";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import type { MediaSlotType } from "../../types/domain";
import {
  validateMediaStorageTarget,
  type MediaStorageTarget,
} from "./mediaStoragePolicy";

export {
  assertVisaApplicationPdfSha256,
  buildApplicationPdfStorageTarget,
  buildAppointmentPdfStorageTarget,
  buildMediaStoragePath,
  buildVisaApplicationPdfStorageTarget,
  isPassportScanUploadFileAccepted,
  mediaMimeTypeForFile,
  mediaStorageBucket,
  MediaStorageValidationError,
  passportScanUploadAccept,
  passportScanUploadFormatLabel,
  passportScanUploadMaxBytes,
  passportScanUploadMimeTypes,
  selfieUploadAccept,
  selfieUploadFormatLabel,
  selfieUploadMimeTypes,
  storageTargetForSlot,
  validateApplicationPdfStorageTarget,
  validateAppointmentPdfStorageTarget,
  validateMediaStorageTarget,
  validatePassportScanUploadFile,
  validateVisaApplicationPdfStorageTarget,
  type MediaStorageTarget,
  type MediaStorageObjectType,
  type MediaStorageValidationInput,
  type PassportScanUploadFileValidation,
} from "./mediaStoragePolicy";

export async function uploadMediaToStorage(
  target: MediaStorageTarget,
  file: File,
  options: { contentType?: string } = {},
): Promise<{ path: string } | null> {
  validateMediaStorageTarget({ target, file });

  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(target.bucket)
    .upload(target.path, file, {
      upsert: false,
      contentType: options.contentType ?? file.type,
    });

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.upload_media",
      fallbackKind: "upload",
    });
  }

  return { path: data.path };
}

export async function deleteMediaFromStorage(
  target: MediaStorageTarget,
): Promise<void> {
  validateMediaStorageTarget({ target });

  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client.storage
    .from(target.bucket)
    .remove([target.path]);
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.delete_media",
      fallbackKind: "storage",
    });
  }
}

export type MediaPersistenceReadback = "committed" | "unknown";

export async function readMediaPersistenceState({
  applicantId,
  mediaType,
  submissionId,
  target,
}: {
  applicantId: string;
  mediaType: MediaSlotType;
  submissionId: string;
  target: MediaStorageTarget;
}): Promise<MediaPersistenceReadback> {
  const client = getSupabaseClient();
  if (!client) return "unknown";

  try {
    const { data, error } = await client
      .from("media_assets")
      .select("storage_bucket,storage_path")
      .eq("submission_id", submissionId)
      .eq("applicant_id", applicantId)
      .eq("type", mediaType)
      .maybeSingle();
    if (error) return "unknown";
    return data?.storage_bucket === target.bucket &&
      data.storage_path === target.path
      ? "committed"
      : "unknown";
  } catch {
    return "unknown";
  }
}

export async function downloadMediaFromStorage(
  target: MediaStorageTarget,
): Promise<Blob | null> {
  validateMediaStorageTarget({ target });

  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Production storage unavailable");
  }

  const { data, error } = await client.storage
    .from(target.bucket)
    .download(target.path);
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.download_media",
      fallbackKind: "storage",
    });
  }
  return data;
}

export async function createMediaSignedUrl(
  target: MediaStorageTarget,
  expiresInSeconds = 60 * 10,
): Promise<string | null> {
  validateMediaStorageTarget({ target });

  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(target.bucket)
    .createSignedUrl(target.path, expiresInSeconds);

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.create_signed_url",
      fallbackKind: "storage",
    });
  }
  return data.signedUrl;
}
