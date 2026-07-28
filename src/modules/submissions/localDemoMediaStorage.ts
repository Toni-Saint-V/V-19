import {
  validateMediaStorageTarget,
  type MediaStorageTarget,
} from "./mediaStoragePolicy";

const databaseName = "visaflow-local-demo-media-v1";
const databaseVersion = 1;
const objectStoreName = "media";
const inMemoryMedia = new Map<string, Blob>();

function indexedDbFactory(): IDBFactory | null {
  return typeof globalThis.indexedDB === "undefined" ? null : globalThis.indexedDB;
}

function openLocalDemoMediaDatabase(): Promise<IDBDatabase | null> {
  const factory = indexedDbFactory();
  if (!factory) return Promise.resolve(null);

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
): Promise<T | null> {
  const database = await openLocalDemoMediaDatabase();
  if (!database) return null;

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
  const factory = indexedDbFactory();
  if (!factory) {
    inMemoryMedia.set(target.path, blob);
    return { path: target.path };
  }

  await runTransaction("readwrite", (store) => store.put(blob, target.path));
  return { path: target.path };
}

export async function loadLocalDemoMedia(path: string): Promise<Blob | null> {
  if (!path.trim()) return null;

  const memoryBlob = inMemoryMedia.get(path);
  if (memoryBlob) return memoryBlob;
  if (!indexedDbFactory()) return null;

  const stored = await runTransaction<Blob | undefined>("readonly", (store) =>
    store.get(path),
  );
  return stored instanceof Blob ? stored : null;
}

export async function deleteLocalDemoMedia(path: string): Promise<void> {
  if (!path.trim()) return;
  inMemoryMedia.delete(path);
  if (!indexedDbFactory()) return;
  await runTransaction("readwrite", (store) => store.delete(path));
}
