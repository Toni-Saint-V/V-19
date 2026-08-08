import {
  deleteMediaFromStorage,
  uploadMediaToStorage,
  type MediaStorageTarget,
} from "./mediaStorage";
import {
  CanonicalMutationOutcomeUnknownError,
  CanonicalMutationRetryBlockedError,
} from "./canonicalMutationOutcome";

type DeleteMedia = typeof deleteMediaFromStorage;
type UploadMedia = typeof uploadMediaToStorage;

type ReplaceProtectedMediaInput<TCanonical> = {
  deleteMedia?: DeleteMedia;
  file: File;
  lockKey: string;
  onCleanupDeferred?: (target: MediaStorageTarget, error: unknown) => void;
  persistCanonical: (storedPath: string) => Promise<unknown>;
  readCanonical: () => Promise<TCanonical>;
  referencesStoredPath: (canonical: TCanonical, storedPath: string) => boolean;
  storageTargetForCanonical: (canonical: TCanonical) => MediaStorageTarget | undefined;
  target: MediaStorageTarget;
  uploadMedia?: UploadMedia;
};

const replacementQueues = new Map<string, Promise<void>>();

async function runInProcessExclusive<T>(
  lockKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = replacementQueues.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
  replacementQueues.set(lockKey, current);
  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    release();
    if (replacementQueues.get(lockKey) === current) {
      replacementQueues.delete(lockKey);
    }
  }
}

async function runMediaReplacementExclusive<T>(
  lockKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks) {
    return locks.request(
      `v19:protected-media-replacement:${lockKey}`,
      { mode: "exclusive" },
      operation,
    );
  }
  return runInProcessExclusive(lockKey, operation);
}

function sameStorageTarget(
  left: MediaStorageTarget | undefined,
  right: MediaStorageTarget,
) {
  return left?.bucket === right.bucket && left.path === right.path;
}

/**
 * Replaces one protected object as a serialized, compensated saga.
 *
 * The mutation response is never treated as proof. A fresh canonical read
 * before upload identifies the object being replaced, while the post-write
 * readback decides which object is safe to delete.
 */
export async function replaceProtectedMediaWithCanonicalReadback<TCanonical>({
  deleteMedia = deleteMediaFromStorage,
  file,
  lockKey,
  onCleanupDeferred,
  persistCanonical,
  readCanonical,
  referencesStoredPath,
  storageTargetForCanonical,
  target,
  uploadMedia = uploadMediaToStorage,
}: ReplaceProtectedMediaInput<TCanonical>): Promise<TCanonical> {
  return runMediaReplacementExclusive(lockKey, async () => {
    const beforeWrite = await readCanonical();
    const previousTarget = storageTargetForCanonical(beforeWrite);
    const uploaded = await uploadMedia(target, file);
    if (!uploaded) {
      throw new Error("Supabase Storage недоступен для загрузки файла.");
    }
    const uploadedTarget = {
      bucket: target.bucket,
      path: uploaded.path,
    } satisfies MediaStorageTarget;

    let persistenceError: unknown;
    try {
      await persistCanonical(uploaded.path);
    } catch (error) {
      persistenceError = error;
    }

    let readback: TCanonical;
    try {
      readback = await readCanonical();
    } catch (readbackError) {
      throw new CanonicalMutationOutcomeUnknownError(readbackError);
    }

    if (!referencesStoredPath(readback, uploaded.path)) {
      try {
        await deleteMedia(uploadedTarget);
      } catch (cleanupError) {
        throw new CanonicalMutationRetryBlockedError(
          "Canonical readback отклонил замену, но новый защищённый объект не удалось удалить. Повторная загрузка отключена до очистки объекта.",
          cleanupError,
        );
      }
      if (persistenceError) throw persistenceError;
      throw new Error(
        "Сохранённая подача не ссылается на загруженный файл. Изменения не применены.",
      );
    }

    if (previousTarget && !sameStorageTarget(previousTarget, uploadedTarget)) {
      try {
        await deleteMedia(previousTarget);
      } catch (cleanupError) {
        // The canonical state already references the new object. Retrying the
        // upload would create another replacement, so old-object cleanup is
        // deliberately non-fatal and may be reported for deferred cleanup.
        try {
          onCleanupDeferred?.(previousTarget, cleanupError);
        } catch {
          // Observability must not turn a confirmed canonical commit into a
          // user-visible failed upload.
        }
      }
    }

    return readback;
  });
}
