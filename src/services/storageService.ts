import type { MediaSlot, MediaSlotType } from "../types/domain";
import { getSupabaseClient } from "../lib/supabase/client";

export const mediaStorageBucket = "submission-media";

export interface MediaStorageTarget {
  bucket: typeof mediaStorageBucket;
  path: string;
}

export function buildMediaStoragePath(
  submissionId: string,
  applicantId: string,
  type: MediaSlotType,
  fileName: string,
): MediaStorageTarget {
  return {
    bucket: mediaStorageBucket,
    path: `${submissionId}/${applicantId}/${type}/${fileName}`,
  };
}

export function storageTargetForSlot(
  submissionId: string,
  applicantId: string,
  slot: MediaSlot,
): MediaStorageTarget {
  const fileName =
    slot.generatedFileName ?? slot.originalFileName ?? `${slot.type}.upload`;
  return buildMediaStoragePath(submissionId, applicantId, slot.type, fileName);
}

export async function uploadMediaToStorage(
  target: MediaStorageTarget,
  file: File,
): Promise<{ path: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(target.bucket)
    .upload(target.path, file, {
      upsert: true,
    });

  if (error) throw error;
  return { path: data.path };
}

export async function createMediaSignedUrl(
  target: MediaStorageTarget,
  expiresInSeconds = 60 * 10,
): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(target.bucket)
    .createSignedUrl(target.path, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
