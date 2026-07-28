import { describe, expect, test, vi } from "vitest";

import {
  pruneUnreferencedLocalDemoMedia,
  replaceLocalDemoMediaWithCanonicalReadback,
  type LocalDemoMediaMutationLock,
} from "../../src/modules/submissions/localDemoMediaStorage";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import type { Submission } from "../../src/modules/submissions/types";

const previousPath =
  "submissions/ПД-TEST/applicant-1/passport_scan/previous_passport_scan.jpg";

function replacementTarget() {
  return buildMediaStoragePath(
    "ПД-TEST",
    "applicant-1",
    "passport_scan",
    "next_passport_scan.jpg",
  );
}

function replacementFile() {
  return new File(["next-passport"], "next-passport.jpg", {
    type: "image/jpeg",
  });
}

function canonical(paths: string[]) {
  return { paths };
}

function exclusiveMutationLock(): LocalDemoMediaMutationLock {
  let tail: Promise<void> = Promise.resolve();
  return async <T>(operation: () => Promise<T>) => {
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

describe("local demo media replacement", () => {
  test("deletes the previous blob only after the canonical write references the replacement", async () => {
    const target = replacementTarget();
    const deleteStoredMedia = vi.fn(async () => undefined);
    const readCanonical = vi.fn(async () => canonical([previousPath]));

    const result = await replaceLocalDemoMediaWithCanonicalReadback({
      deleteStoredMedia,
      file: replacementFile(),
      persistCanonical: async (storedPath) => canonical([storedPath]),
      previousPath,
      readCanonical,
      referencesStoredPath: (state, storedPath) => state.paths.includes(storedPath),
      storeMedia: async () => ({ path: target.path }),
      target,
    });

    expect(result).toEqual(canonical([target.path]));
    expect(readCanonical).not.toHaveBeenCalled();
    expect(deleteStoredMedia).toHaveBeenCalledTimes(1);
    expect(deleteStoredMedia).toHaveBeenCalledWith(previousPath);
  });

  test("treats an ambiguous write as saved when canonical readback references the replacement", async () => {
    const target = replacementTarget();
    const deleteStoredMedia = vi.fn(async () => undefined);

    const result = await replaceLocalDemoMediaWithCanonicalReadback({
      deleteStoredMedia,
      file: replacementFile(),
      persistCanonical: async () => {
        throw new Error("connection closed after commit");
      },
      previousPath,
      readCanonical: async () => canonical([target.path]),
      referencesStoredPath: (state, storedPath) => state.paths.includes(storedPath),
      storeMedia: async () => ({ path: target.path }),
      target,
    });

    expect(result).toEqual(canonical([target.path]));
    expect(deleteStoredMedia).toHaveBeenCalledTimes(1);
    expect(deleteStoredMedia).toHaveBeenCalledWith(previousPath);
  });

  test("removes a rejected replacement and preserves the previous blob", async () => {
    const target = replacementTarget();
    const deleteStoredMedia = vi.fn(async () => undefined);
    const persistenceError = new Error("canonical write rejected");

    await expect(
      replaceLocalDemoMediaWithCanonicalReadback<ReturnType<typeof canonical>>({
        deleteStoredMedia,
        file: replacementFile(),
        persistCanonical: async () => {
          throw persistenceError;
        },
        previousPath,
        readCanonical: async () => canonical([previousPath]),
        referencesStoredPath: (state, storedPath) => state.paths.includes(storedPath),
        storeMedia: async () => ({ path: target.path }),
        target,
      }),
    ).rejects.toBe(persistenceError);

    expect(deleteStoredMedia).toHaveBeenCalledTimes(1);
    expect(deleteStoredMedia).toHaveBeenCalledWith(target.path);
    expect(deleteStoredMedia).not.toHaveBeenCalledWith(previousPath);
  });

  test("preserves both blobs when canonical readback is unavailable", async () => {
    const target = replacementTarget();
    const deleteStoredMedia = vi.fn(async () => undefined);
    const persistenceError = new Error("canonical write outcome is unknown");

    await expect(
      replaceLocalDemoMediaWithCanonicalReadback<ReturnType<typeof canonical>>({
        deleteStoredMedia,
        file: replacementFile(),
        persistCanonical: async () => {
          throw persistenceError;
        },
        previousPath,
        readCanonical: async () => {
          throw new Error("readback unavailable");
        },
        referencesStoredPath: (state, storedPath) => state.paths.includes(storedPath),
        storeMedia: async () => ({ path: target.path }),
        target,
      }),
    ).rejects.toBe(persistenceError);

    expect(deleteStoredMedia).not.toHaveBeenCalled();
  });

  test("prunes abandoned blobs only after canonical submission readback", async () => {
    const deleteStoredMedia = vi.fn(async () => undefined);
    const nowEpochMs = 1_800_000_000_000;
    const currentPath =
      "submissions/ПД-TEST/applicant-1/passport_scan/current_passport_scan.jpg";
    const submission = {
      files: [
        {
          localDemoMediaStored: true,
          storagePath: currentPath,
        },
        {
          storagePath: "submissions/ПД-TEST/applicant-1/selfie/untracked.jpg",
        },
      ],
    } as Submission;

    await expect(
      pruneUnreferencedLocalDemoMedia([submission], {
        deleteStoredMedia,
        nowEpochMs,
        storedAtEpochMsByPath: new Map([
          [previousPath, nowEpochMs - 10 * 60_000],
        ]),
        storedPaths: [currentPath, previousPath, "  "],
      }),
    ).resolves.toEqual([previousPath]);
    expect(deleteStoredMedia).toHaveBeenCalledTimes(1);
    expect(deleteStoredMedia).toHaveBeenCalledWith(previousPath);
  });

  test("backfills missing v1 metadata before starting the orphan grace period", async () => {
    const target = replacementTarget();
    const deleteStoredMedia = vi.fn(async () => undefined);
    const backfillMissingStoredAtEpochMs = vi.fn(async () => undefined);
    const nowEpochMs = 1_800_000_000_000;

    await expect(
      pruneUnreferencedLocalDemoMedia([], {
        backfillMissingStoredAtEpochMs,
        deleteStoredMedia,
        nowEpochMs,
        orphanGracePeriodMs: 60_000,
        storedAtEpochMsByPath: new Map(),
        storedPaths: [target.path],
      }),
    ).resolves.toEqual([]);
    expect(backfillMissingStoredAtEpochMs).toHaveBeenCalledWith(
      [target.path],
      nowEpochMs,
    );
    expect(deleteStoredMedia).not.toHaveBeenCalled();

    await expect(
      pruneUnreferencedLocalDemoMedia([], {
        backfillMissingStoredAtEpochMs,
        deleteStoredMedia,
        nowEpochMs: nowEpochMs + 60_000,
        orphanGracePeriodMs: 60_000,
        storedAtEpochMsByPath: new Map([[target.path, nowEpochMs]]),
        storedPaths: [target.path],
      }),
    ).resolves.toEqual([target.path]);
    expect(deleteStoredMedia).toHaveBeenCalledWith(target.path);
  });

  test("does not prune a replacement while its canonical write holds the cross-tab lock", async () => {
    const target = replacementTarget();
    const withMutationLock = exclusiveMutationLock();
    let canonicalPaths = [previousPath];
    let releasePersistence!: () => void;
    const persistenceBlocked = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    let persistenceStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      persistenceStarted = resolve;
    });
    const deleteStoredMedia = vi.fn(async () => undefined);

    const replacement = replaceLocalDemoMediaWithCanonicalReadback({
      deleteStoredMedia,
      file: replacementFile(),
      persistCanonical: async (storedPath) => {
        persistenceStarted();
        await persistenceBlocked;
        canonicalPaths = [storedPath];
        return canonical(canonicalPaths);
      },
      readCanonical: async () => canonical(canonicalPaths),
      referencesStoredPath: (state, storedPath) => state.paths.includes(storedPath),
      storeMedia: async () => ({ path: target.path }),
      target,
      withMutationLock,
    });
    await started;

    const pruning = pruneUnreferencedLocalDemoMedia(
      () =>
        [
          {
            files: canonicalPaths.map((storagePath) => ({
              localDemoMediaStored: true,
              storagePath,
            })),
          },
        ] as Submission[],
      {
        deleteStoredMedia,
        storedPaths: [target.path],
        withMutationLock,
      },
    );
    await Promise.resolve();
    expect(deleteStoredMedia).not.toHaveBeenCalledWith(target.path);

    releasePersistence();
    await expect(replacement).resolves.toEqual(canonical([target.path]));
    await expect(pruning).resolves.toEqual([]);
    expect(deleteStoredMedia).not.toHaveBeenCalledWith(target.path);
  });

  test("keeps recently staged orphan candidates during the grace period", async () => {
    const target = replacementTarget();
    const deleteStoredMedia = vi.fn(async () => undefined);
    const nowEpochMs = 1_800_000_000_000;

    await expect(
      pruneUnreferencedLocalDemoMedia([], {
        deleteStoredMedia,
        nowEpochMs,
        orphanGracePeriodMs: 60_000,
        storedAtEpochMsByPath: new Map([[target.path, nowEpochMs - 1_000]]),
        storedPaths: [target.path],
      }),
    ).resolves.toEqual([]);
    expect(deleteStoredMedia).not.toHaveBeenCalled();
  });

  test("reports previous-blob cleanup separately after canonical success", async () => {
    const target = replacementTarget();
    const cleanupError = new Error("cleanup unavailable");
    const onCleanupError = vi.fn();

    await expect(
      replaceLocalDemoMediaWithCanonicalReadback({
        deleteStoredMedia: async (path) => {
          if (path === previousPath) throw cleanupError;
        },
        file: replacementFile(),
        onCleanupError,
        persistCanonical: async (storedPath) => canonical([storedPath]),
        previousPath,
        readCanonical: async () => canonical([previousPath]),
        referencesStoredPath: (state, storedPath) => state.paths.includes(storedPath),
        storeMedia: async () => ({ path: target.path }),
        target,
      }),
    ).resolves.toEqual(canonical([target.path]));
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, previousPath);
  });
});
