import { describe, expect, test, vi } from "vitest";

import {
  pruneUnreferencedLocalDemoMedia,
  replaceLocalDemoMediaWithCanonicalReadback,
} from "../../src/modules/submissions/localDemoMediaStorage";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import type { Submission } from "../../src/modules/submissions/types";
import { CANONICAL_MUTATION_OUTCOME_UNKNOWN } from "../../src/modules/submissions/canonicalMutationOutcome";

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
    ).rejects.toMatchObject({
      code: CANONICAL_MUTATION_OUTCOME_UNKNOWN,
      message: expect.stringContaining("Повторная загрузка отключена"),
    });

    expect(deleteStoredMedia).not.toHaveBeenCalled();
  });

  test("keeps a confirmed replacement successful when old-blob cleanup is deferred", async () => {
    const target = replacementTarget();
    const cleanupError = new Error("old blob cleanup unavailable");
    const onCleanupDeferred = vi.fn();

    await expect(
      replaceLocalDemoMediaWithCanonicalReadback({
        deleteStoredMedia: async (storedPath) => {
          if (storedPath === previousPath) throw cleanupError;
        },
        file: replacementFile(),
        onCleanupDeferred,
        persistCanonical: async (storedPath) => canonical([storedPath]),
        previousPath,
        readCanonical: async () => canonical([previousPath]),
        referencesStoredPath: (state, storedPath) => state.paths.includes(storedPath),
        storeMedia: async () => ({ path: target.path }),
        target,
      }),
    ).resolves.toEqual(canonical([target.path]));

    expect(onCleanupDeferred).toHaveBeenCalledWith(previousPath, cleanupError);
  });

  test("prunes abandoned blobs only after canonical submission readback", async () => {
    const deleteStoredMedia = vi.fn(async () => undefined);
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
        storedPaths: [currentPath, previousPath, "  "],
      }),
    ).resolves.toEqual([previousPath]);
    expect(deleteStoredMedia).toHaveBeenCalledTimes(1);
    expect(deleteStoredMedia).toHaveBeenCalledWith(previousPath);
  });
});
