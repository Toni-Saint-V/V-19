import { getSupabaseClient } from "../../lib/supabase/client";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import { DocumentRepository } from "../documents/documentRepository";
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
  passportScanUploadMimeTypes,
  selfieUploadAccept,
  selfieUploadFormatLabel,
  selfieUploadMimeTypes,
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

  await persistUploadedDocumentAsset({
    bucket: target.bucket,
    client,
    file,
    path: data.path,
  });

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

async function persistUploadedDocumentAsset(input: {
  bucket: typeof import("./mediaStoragePolicy").mediaStorageBucket;
  client: NonNullable<ReturnType<typeof getSupabaseClient>>;
  file: File;
  path: string;
}): Promise<void> {
  const hasDatabaseClient =
    typeof (input.client as { from?: unknown }).from === "function";

  if (!hasDatabaseClient) {
    return;
  }

  await new DocumentRepository(input.client).saveUploadedStorageAsset(
    { bucket: input.bucket, path: input.path },
    input.file,
    { checksum: await sha256Hex(input.file) },
  );
}

async function sha256Hex(file: File): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;

  try {
    const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
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
