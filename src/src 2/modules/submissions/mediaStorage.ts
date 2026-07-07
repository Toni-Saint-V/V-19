import { getSupabaseClient } from "../../lib/supabase/client";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import {
  validateMediaStorageTarget,
  type MediaStorageTarget,
} from "./mediaStoragePolicy";

interface MediaStorageImportMeta {
  env: {
    readonly DEV?: boolean;
    readonly VITE_SUPABASE_BACKEND_TARGET?: string;
  };
}

export {
  assertVisaApplicationPdfSha256,
  buildApplicationPdfStorageTarget,
  buildAppointmentPdfStorageTarget,
  buildMediaStoragePath,
  buildVisaApplicationPdfStorageTarget,
  isPassportScanUploadFileAccepted,
  mediaStorageBucket,
  MediaStorageValidationError,
  passportScanUploadAccept,
  passportScanUploadFormatLabel,
  passportScanUploadMimeTypes,
  storageTargetForSlot,
  validateApplicationPdfStorageTarget,
  validateAppointmentPdfStorageTarget,
  validateMediaStorageTarget,
  validateVisaApplicationPdfStorageTarget,
  type MediaStorageTarget,
  type MediaStorageObjectType,
  type MediaStorageValidationInput,
} from "./mediaStoragePolicy";

export async function uploadMediaToStorage(
  target: MediaStorageTarget,
  file: File,
): Promise<{ path: string } | null> {
  validateMediaStorageTarget({ target, file });

  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(target.bucket)
    .upload(target.path, file, {
      upsert: false,
      contentType: file.type,
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

  const { error } = await client.storage.from(target.bucket).remove([target.path]);
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.delete_media",
      fallbackKind: "storage",
    });
  }
}

export async function downloadMediaFromStorage(
  target: MediaStorageTarget,
): Promise<Blob | null> {
  validateMediaStorageTarget({ target });

  const client = getSupabaseClient();
  if (!client) return localDemoMediaBlob(target);

  const { data, error } = await client.storage.from(target.bucket).download(target.path);
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.download_media",
      fallbackKind: "storage",
    });
  }
  return data;
}

function localDemoMediaBlob(target: MediaStorageTarget): Blob | null {
  if (!canUseLocalDemoMediaBlob() || !isLocalDemoMediaPath(target.path)) {
    return null;
  }

  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
    type: "image/jpeg",
  });
}

function canUseLocalDemoMediaBlob(): boolean {
  const env = (import.meta as unknown as MediaStorageImportMeta).env;
  return Boolean(env.DEV) && env.VITE_SUPABASE_BACKEND_TARGET !== "supabase";
}

function isLocalDemoMediaPath(path: string): boolean {
  return /^submissions\/SUB-1102\/applicants\/з-1102-[1-3]\/(passport_scan|selfie|selfie_2)\/demo1102[1-3]_(passport_scan|selfie|selfie_2)\.jpg$/.test(
    path,
  );
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
