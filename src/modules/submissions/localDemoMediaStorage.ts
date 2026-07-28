import {
  validateMediaStorageTarget,
  type MediaStorageTarget,
} from "./mediaStoragePolicy";
import type { Submission } from "./types";

const databaseName = "visaflow-local-demo-media-v1";
const databaseVersion = 2;
const objectStoreName = "media";
const metadataStoreName = "media-metadata";
const mutationLockName = "visaflow-local-demo-media-mutation-v1";
const defaultOrphanGracePeriodMs = 5 * 60 * 1000;

type StoredMediaMetadata = {
  storedAtEpochMs: number;
};

export type LocalDemoMediaMutationLock = <T>(
  operation: () => Promise<T>,
) => Promise<T>;

let inProcessMutationTail: Promise<void> = Promise.resolve();

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
      if (!database.objectStoreNames.contains(metadataStoreName)) {
        database.createObjectStore(metadataStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openLocalDemoMediaDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
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

async function runMediaWriteTransaction(
  operation: (
    mediaStore: IDBObjectStore,
    metadataStore: IDBObjectStore,
  ) => void,
): Promise<void> {
  const database = await openLocalDemoMediaDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [objectStoreName, metadataStoreName],
        "readwrite",
      );
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Local demo media transaction failed."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Local demo media transaction aborted."));
      transaction.oncomplete = () => resolve();
      operation(
        transaction.objectStore(objectStoreName),
        transaction.objectStore(metadataStoreName),
      );
    });
  } finally {
    database.close();
  }
}

export async function withLocalDemoMediaMutationLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const lockManager =
    typeof globalThis.navigator === "undefined"
      ? undefined
      : globalThis.navigator.locks;
  if (lockManager) {
    return lockManager.request(mutationLockName, operation);
  }

  let release!: () => void;
  const previous = inProcessMutationTail;
  inProcessMutationTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
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

  await runMediaWriteTransaction((mediaStore, metadataStore) => {
    mediaStore.put(blob, target.path);
    metadataStore.put(
      { storedAtEpochMs: Date.now() } satisfies StoredMediaMetadata,
      target.path,
    );
  });
  return { path: target.path };
}

export async function loadLocalDemoMedia(path: string): Promise<Blob | null> {
  if (!path.trim()) return null;
  if (!indexedDbFactory()) return null;

  const stored = await runTransaction<Blob | undefined>(
    objectStoreName,
    "readonly",
    (store) => store.get(path),
  );
  return stored instanceof Blob ? stored : null;
}

export async function deleteLocalDemoMedia(path: string): Promise<void> {
  if (!path.trim()) return;
  if (!indexedDbFactory()) return;
  await runMediaWriteTransaction((mediaStore, metadataStore) => {
    mediaStore.delete(path);
    metadataStore.delete(path);
  });
}

async function listLocalDemoMediaPaths(): Promise<string[]> {
  if (!indexedDbFactory()) return [];
  const keys = await runTransaction<IDBValidKey[]>(
    objectStoreName,
    "readonly",
    (store) => store.getAllKeys(),
  );
  return keys.filter((key): key is string => typeof key === "string");
}

async function localDemoMediaStoredAtEpochMs(path: string): Promise<number | undefined> {
  const metadata = await runTransaction<StoredMediaMetadata | undefined>(
    metadataStoreName,
    "readonly",
    (store) => store.get(path),
  );
  return Number.isFinite(metadata?.storedAtEpochMs)
    ? metadata?.storedAtEpochMs
    : undefined;
}

async function backfillLocalDemoMediaStoredAtEpochMs(
  paths: readonly string[],
  storedAtEpochMs: number,
): Promise<void> {
  if (paths.length === 0 || !indexedDbFactory()) return;
  await runMediaWriteTransaction((_mediaStore, metadataStore) => {
    for (const path of paths) {
      metadataStore.put(
        { storedAtEpochMs } satisfies StoredMediaMetadata,
        path,
      );
    }
  });
}

type CanonicalSubmissionReadback =
  | Submission[]
  | (() => Submission[] | Promise<Submission[]>);

type PruneLocalDemoMediaOptions = {
  backfillMissingStoredAtEpochMs?: (
    paths: readonly string[],
    storedAtEpochMs: number,
  ) => Promise<void>;
  deleteStoredMedia?: typeof deleteLocalDemoMedia;
  nowEpochMs?: number;
  orphanGracePeriodMs?: number;
  storedAtEpochMsByPath?: ReadonlyMap<string, number>;
  storedPaths?: Iterable<string>;
  withMutationLock?: LocalDemoMediaMutationLock;
};

export async function pruneUnreferencedLocalDemoMedia(
  readCanonicalSubmissions: CanonicalSubmissionReadback,
  {
    backfillMissingStoredAtEpochMs = backfillLocalDemoMediaStoredAtEpochMs,
    deleteStoredMedia = deleteLocalDemoMedia,
    nowEpochMs = Date.now(),
    orphanGracePeriodMs = defaultOrphanGracePeriodMs,
    storedAtEpochMsByPath,
    storedPaths,
    withMutationLock = withLocalDemoMediaMutationLock,
  }: PruneLocalDemoMediaOptions = {},
): Promise<string[]> {
  return withMutationLock(async () => {
    const submissions =
      typeof readCanonicalSubmissions === "function"
        ? await readCanonicalSubmissions()
        : readCanonicalSubmissions;
    const referencedPaths = new Set(
      submissions.flatMap((submission) =>
        submission.files.flatMap((file) =>
          file.localDemoMediaStored === true && file.storagePath
            ? [file.storagePath]
            : [],
        ),
      ),
    );
    const existingPaths = [...(storedPaths ?? (await listLocalDemoMediaPaths()))];
    const storedAtByPath = new Map<string, number | undefined>(
      storedAtEpochMsByPath ??
        (storedPaths
          ? []
          : await Promise.all(
              existingPaths.map(
                async (path) =>
                  [
                    path,
                    await localDemoMediaStoredAtEpochMs(path),
                  ] as const,
              ),
            )),
    );
    const pathsMissingMetadata = existingPaths.filter(
      (path) => path.trim() && storedAtByPath.get(path) === undefined,
    );
    if (pathsMissingMetadata.length > 0) {
      await backfillMissingStoredAtEpochMs(pathsMissingMetadata, nowEpochMs);
      for (const path of pathsMissingMetadata) {
        storedAtByPath.set(path, nowEpochMs);
      }
    }
    const orphanedPaths = existingPaths.filter((path) => {
      if (!path.trim() || referencedPaths.has(path)) return false;
      const storedAtEpochMs = storedAtByPath.get(path);
      return (
        storedAtEpochMs !== undefined &&
        nowEpochMs - storedAtEpochMs >= orphanGracePeriodMs
      );
    });

    for (const path of orphanedPaths) {
      await deleteStoredMedia(path);
    }
    return orphanedPaths;
  });
}

type ReplaceLocalDemoMediaInput<TCanonical> = {
  deleteStoredMedia?: typeof deleteLocalDemoMedia;
  file: File;
  onCleanupError?: (error: unknown, path: string) => void;
  persistCanonical: (storedPath: string) => Promise<TCanonical>;
  previousPath?: string;
  readCanonical: () => Promise<TCanonical>;
  referencesStoredPath: (canonical: TCanonical, storedPath: string) => boolean;
  storeMedia?: typeof saveLocalDemoMedia;
  target: MediaStorageTarget;
  withMutationLock?: LocalDemoMediaMutationLock;
};

/**
 * Coordinates the IndexedDB blob and the canonical submission write as a
 * compensated saga. A failed/ambiguous canonical write is resolved by a fresh
 * canonical readback before either the new or previous blob is removed.
 */
export async function replaceLocalDemoMediaWithCanonicalReadback<TCanonical>({
  deleteStoredMedia = deleteLocalDemoMedia,
  file,
  onCleanupError,
  persistCanonical,
  previousPath,
  readCanonical,
  referencesStoredPath,
  storeMedia = saveLocalDemoMedia,
  target,
  withMutationLock = withLocalDemoMediaMutationLock,
}: ReplaceLocalDemoMediaInput<TCanonical>): Promise<TCanonical> {
  return withMutationLock(async () => {
    const stored = await storeMedia(target, file);
    let canonical: TCanonical | undefined;
    let persistenceError: unknown;

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
      } catch {
        // An unavailable readback is ambiguous. Preserve the new blob so a
        // canonical write that actually committed never points to deleted bytes.
      }
    }

    if (!canonical || !referencesStoredPath(canonical, stored.path)) {
      if (persistenceError) throw persistenceError;
      throw new Error(
        "Сохранённая подача не ссылается на загруженный файл. Изменения не применены.",
      );
    }

    if (previousPath && previousPath !== stored.path) {
      try {
        await deleteStoredMedia(previousPath);
      } catch (error) {
        onCleanupError?.(error, previousPath);
      }
    }

    return canonical;
  });
}
