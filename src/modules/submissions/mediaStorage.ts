import { getSupabaseClient } from "../../lib/supabase/client";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import {
  validateMediaStorageTarget,
  type MediaStorageTarget,
} from "./mediaStoragePolicy";

export {
  buildMediaStoragePath,
  mediaStorageBucket,
  MediaStorageValidationError,
  storageTargetForSlot,
  validateMediaStorageTarget,
  type MediaStorageTarget,
  type MediaStorageValidationInput,
} from "./mediaStoragePolicy";

export async function uploadMediaToStorage(
  target: MediaStorageTarget,
  file: File,
): Promise<{ path: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  validateMediaStorageTarget({ target, file });

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
  const client = getSupabaseClient();
  if (!client) return;

  validateMediaStorageTarget({ target });

  const { error } = await client.storage.from(target.bucket).remove([target.path]);
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.delete_media",
      fallbackKind: "storage",
    });
  }
}

export async function createMediaSignedUrl(
  target: MediaStorageTarget,
  expiresInSeconds = 60 * 10,
): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  validateMediaStorageTarget({ target });

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
