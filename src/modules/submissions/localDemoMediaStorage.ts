import {
  validateMediaStorageTarget,
  type MediaStorageTarget,
} from "./mediaStoragePolicy";
import { CanonicalMutationOutcomeUnknownError } from "./canonicalMutationOutcome";
import type { Submission } from "./types";

const databaseName = "visaflow-local-demo-media-v1";
const databaseVersion = 1;
const objectStoreName = "media";

function indexedDbFactory(): IDBFactory | null {
  return typeof globalThis.indexedDB === "undefined" ? null : globalThis.indexedDB;
}

function openLocalDemoMediaDatabase(): Promise<IDBDatabase> {
  const factory = indexedDbFactory();
  if (!factory) {
    return Promise.reject(
      new Error("Локальное хранилище документов недоступно. Файл не был сохранён."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, databaseVersion);
    request.onerror = () =>
      reject(request.error ?? new Error("Local demo media database is unavailable."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(objectStoreName)) {
        database.createObjectStore(objectStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openLocalDemoMediaDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, mode);
      const request = operation(transaction.objectStore(objectStoreName));
      let result: T | undefined;

      request.onerror = () =>
        reject(request.error ?? new Error("Local demo media request failed."));
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Local demo media transaction failed."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Local demo media transaction aborted."));
      transaction.oncomplete = () => resolve(result as T);
    });
  } finally {
    database.close();
  }
}

export async function saveLocalDemoMedia(
  target: MediaStorageTarget,
  file: File,
): Promise<{ path: string }> {
  validateMediaStorageTarget({ target, file });

  const blob = new Blob([await file.arrayBuffer()], {
    type: file.type || "application/octet-stream",
  });

  await runTransaction("readwrite", (store) => store.put(blob, target.path));
  return { path: target.path };
}

export async function loadLocalDemoMedia(path: string): Promise<Blob | null> {
  if (!path.trim()) return null;
  if (!indexedDbFactory()) return null;

  const stored = await runTransaction<Blob | undefined>("readonly", (store) =>
    store.get(path),
  );
  return stored instanceof Blob ? stored : null;
}

export async function deleteLocalDemoMedia(path: string): Promise<void> {
  if (!path.trim()) return;
  if (!indexedDbFactory()) return;
  await runTransaction("readwrite", (store) => store.delete(path));
}

async function listLocalDemoMediaPaths(): Promise<string[]> {
  if (!indexedDbFactory()) return [];
  const keys = await runTransaction<IDBValidKey[]>("readonly", (store) =>
    store.getAllKeys(),
  );
  return keys.filter((key): key is string => typeof key === "string");
}

type PruneLocalDemoMediaOptions = {
  deleteStoredMedia?: typeof deleteLocalDemoMedia;
  storedPaths?: Iterable<string>;
};

export async function pruneUnreferencedLocalDemoMedia(
  submissions: Submission[],
  {
    deleteStoredMedia = deleteLocalDemoMedia,
    storedPaths,
  }: PruneLocalDemoMediaOptions = {},
): Promise<string[]> {
  const referencedPaths = new Set(
    submissions.flatMap((submission) =>
      submission.files.flatMap((file) =>
        file.localDemoMediaStored === true && file.storagePath
          ? [file.storagePath]
          : [],
      ),
    ),
  );
  const existingPaths = storedPaths ?? (await listLocalDemoMediaPaths());
  const orphanedPaths = [...existingPaths].filter(
    (path) => path.trim() && !referencedPaths.has(path),
  );

  for (const path of orphanedPaths) {
    await deleteStoredMedia(path);
  }
  return orphanedPaths;
}

type ReplaceLocalDemoMediaInput<TCanonical> = {
  deleteStoredMedia?: typeof deleteLocalDemoMedia;
  file: File;
  onCleanupDeferred?: (storedPath: string, error: unknown) => void;
  persistCanonical: (storedPath: string) => Promise<TCanonical>;
  previousPath?: string;
  readCanonical: () => Promise<TCanonical>;
  referencesStoredPath: (canonical: TCanonical, storedPath: string) => boolean;
  storeMedia?: typeof saveLocalDemoMedia;
  target: MediaStorageTarget;
};

/**
 * Coordinates the IndexedDB blob and the canonical submission write as a
 * compensated saga. A failed/ambiguous canonical write is resolved by a fresh
 * canonical readback before either the new or previous blob is removed.
 */
export async function replaceLocalDemoMediaWithCanonicalReadback<TCanonical>({
  deleteStoredMedia = deleteLocalDemoMedia,
  file,
  onCleanupDeferred,
  persistCanonical,
  previousPath,
  readCanonical,
  referencesStoredPath,
  storeMedia = saveLocalDemoMedia,
  target,
}: ReplaceLocalDemoMediaInput<TCanonical>): Promise<TCanonical> {
  const stored = await storeMedia(target, file);
  let canonical: TCanonical | undefined;
  let persistenceError: unknown;
  let readbackError: unknown;

  try {
    canonical = await persistCanonical(stored.path);
  } catch (error) {
    persistenceError = error;
  }

  if (!canonical || !referencesStoredPath(canonical, stored.path)) {
    try {
      const readback = await readCanonical();
      if (referencesStoredPath(readback, stored.path)) {
        canonical = readback;
      } else {
        await deleteStoredMedia(stored.path);
      }
    } catch (error) {
      // An unavailable readback is ambiguous. Preserve the new blob so a
      // canonical write that actually committed never points to deleted bytes.
      readbackError = error;
    }
  }

  if (!canonical || !referencesStoredPath(canonical, stored.path)) {
    if (readbackError) {
      throw new CanonicalMutationOutcomeUnknownError(readbackError);
    }
    if (persistenceError) throw persistenceError;
    throw new Error(
      "Сохранённая подача не ссылается на загруженный файл. Изменения не применены.",
    );
  }

  if (previousPath && previousPath !== stored.path) {
    try {
      await deleteStoredMedia(previousPath);
    } catch (cleanupError) {
      try {
        onCleanupDeferred?.(previousPath, cleanupError);
      } catch {
        // Cleanup observability cannot turn a confirmed canonical commit into
        // a user-visible failed upload.
      }
    }
  }

  return canonical;
}
