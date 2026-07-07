import "@testing-library/jest-dom/vitest";

type MemoryStorageLike = {
  readonly length: number;
  clear: () => void;
  getItem: (key: string) => string | null;
  key: (index: number) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
};

function createMemoryStorage(): MemoryStorageLike {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  const host = globalThis as unknown as Record<
    "localStorage" | "sessionStorage",
    MemoryStorageLike | undefined
  >;

  try {
    if (host[name] && typeof host[name]?.clear === "function") {
      return;
    }
  } catch {
    // Node can expose storage behind an unavailable experimental getter.
  }

  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: createMemoryStorage(),
    writable: true,
  });
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
