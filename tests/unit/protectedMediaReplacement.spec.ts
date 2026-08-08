import { describe, expect, test, vi } from "vitest";

import { replaceProtectedMediaWithCanonicalReadback } from "../../src/modules/submissions/protectedMediaReplacement";
import {
  CANONICAL_MUTATION_OUTCOME_UNKNOWN,
  CANONICAL_MUTATION_RETRY_BLOCKED,
  CanonicalMutationOutcomeUnknownError,
} from "../../src/modules/submissions/canonicalMutationOutcome";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";

const oldTarget = buildMediaStoragePath(
  "ПД-TEST",
  "applicant-1",
  "selfie",
  "old_selfie.jpg",
);
const replacementTarget = buildMediaStoragePath(
  "ПД-TEST",
  "applicant-1",
  "selfie",
  "replacement_selfie.jpg",
);
const replacementFile = new File(["replacement"], "replacement.jpg", {
  type: "image/jpeg",
});

type CanonicalState = {
  path?: string;
};

function canonical(path?: string): CanonicalState {
  return { path };
}

function replacementInput(
  overrides: Partial<
    Parameters<typeof replaceProtectedMediaWithCanonicalReadback<CanonicalState>>[0]
  > = {},
) {
  return {
    file: replacementFile,
    lockKey: "ПД-TEST:applicant-1:selfie",
    persistCanonical: vi.fn(async () => undefined),
    readCanonical: vi.fn(async () => canonical(oldTarget.path)),
    referencesStoredPath: (state: CanonicalState, path: string) => state.path === path,
    storageTargetForCanonical: (state: CanonicalState) =>
      state.path ? { bucket: oldTarget.bucket, path: state.path } : undefined,
    target: replacementTarget,
    uploadMedia: vi.fn(async () => ({ path: replacementTarget.path })),
    ...overrides,
  };
}

describe("protected media replacement", () => {
  test("deletes a rejected replacement only after authoritative readback keeps the old object", async () => {
    const persistenceError = new Error("canonical write rejected");
    const deleteMedia = vi.fn(async () => undefined);
    const readCanonical = vi
      .fn<() => Promise<CanonicalState>>()
      .mockResolvedValueOnce(canonical(oldTarget.path))
      .mockResolvedValueOnce(canonical(oldTarget.path));

    await expect(
      replaceProtectedMediaWithCanonicalReadback(
        replacementInput({
          deleteMedia,
          persistCanonical: async () => {
            throw persistenceError;
          },
          readCanonical,
        }),
      ),
    ).rejects.toBe(persistenceError);

    expect(readCanonical).toHaveBeenCalledTimes(2);
    expect(deleteMedia).toHaveBeenCalledTimes(1);
    expect(deleteMedia).toHaveBeenCalledWith(replacementTarget);
    expect(deleteMedia).not.toHaveBeenCalledWith(oldTarget);
  });

  test("accepts a response-lost write only when canonical readback references the replacement", async () => {
    const deleteMedia = vi.fn(async () => undefined);
    const readCanonical = vi
      .fn<() => Promise<CanonicalState>>()
      .mockResolvedValueOnce(canonical(oldTarget.path))
      .mockResolvedValueOnce(canonical(replacementTarget.path));

    await expect(
      replaceProtectedMediaWithCanonicalReadback(
        replacementInput({
          deleteMedia,
          persistCanonical: async () => {
            throw new Error("connection closed after commit");
          },
          readCanonical,
        }),
      ),
    ).resolves.toEqual(canonical(replacementTarget.path));

    expect(deleteMedia).toHaveBeenCalledTimes(1);
    expect(deleteMedia).toHaveBeenCalledWith(oldTarget);
  });

  test("preserves both objects when post-write canonical readback is unavailable", async () => {
    const deleteMedia = vi.fn(async () => undefined);
    const readCanonical = vi
      .fn<() => Promise<CanonicalState>>()
      .mockResolvedValueOnce(canonical(oldTarget.path))
      .mockRejectedValueOnce(new Error("readback unavailable"));

    await expect(
      replaceProtectedMediaWithCanonicalReadback(
        replacementInput({
          deleteMedia,
          persistCanonical: async () => {
            throw new Error("network failed after canonical request");
          },
          readCanonical,
        }),
      ),
    ).rejects.toMatchObject({
      code: CANONICAL_MUTATION_OUTCOME_UNKNOWN,
      message: expect.stringContaining("Повторная загрузка отключена"),
      name: CanonicalMutationOutcomeUnknownError.name,
    });

    expect(deleteMedia).not.toHaveBeenCalled();
  });

  test("does not trust a successful mutation response without matching canonical readback", async () => {
    const deleteMedia = vi.fn(async () => undefined);
    const readCanonical = vi
      .fn<() => Promise<CanonicalState>>()
      .mockResolvedValueOnce(canonical(oldTarget.path))
      .mockResolvedValueOnce(canonical(oldTarget.path));

    await expect(
      replaceProtectedMediaWithCanonicalReadback(
        replacementInput({ deleteMedia, readCanonical }),
      ),
    ).rejects.toThrow("Сохранённая подача не ссылается на загруженный файл");

    expect(deleteMedia).toHaveBeenCalledTimes(1);
    expect(deleteMedia).toHaveBeenCalledWith(replacementTarget);
  });

  test("blocks retry when a rejected replacement cannot be cleaned up", async () => {
    const readCanonical = vi
      .fn<() => Promise<CanonicalState>>()
      .mockResolvedValueOnce(canonical(oldTarget.path))
      .mockResolvedValueOnce(canonical(oldTarget.path));

    await expect(
      replaceProtectedMediaWithCanonicalReadback(
        replacementInput({
          deleteMedia: async () => {
            throw new Error("cleanup unavailable");
          },
          readCanonical,
        }),
      ),
    ).rejects.toMatchObject({
      code: CANONICAL_MUTATION_RETRY_BLOCKED,
      message: expect.stringContaining("Повторная загрузка отключена"),
    });
  });

  test("keeps a confirmed replacement successful when old-object cleanup must be deferred", async () => {
    const cleanupError = new Error("old object cleanup unavailable");
    const onCleanupDeferred = vi.fn();

    await expect(
      replaceProtectedMediaWithCanonicalReadback(
        replacementInput({
          deleteMedia: async (target) => {
            if (target.path === oldTarget.path) throw cleanupError;
          },
          onCleanupDeferred,
          readCanonical: vi
            .fn<() => Promise<CanonicalState>>()
            .mockResolvedValueOnce(canonical(oldTarget.path))
            .mockResolvedValueOnce(canonical(replacementTarget.path)),
        }),
      ),
    ).resolves.toEqual(canonical(replacementTarget.path));

    expect(onCleanupDeferred).toHaveBeenCalledTimes(1);
    expect(onCleanupDeferred).toHaveBeenCalledWith(oldTarget, cleanupError);
  });

  test("serializes concurrent replacements for the same logical media slot", async () => {
    const secondTarget = buildMediaStoragePath(
      "ПД-TEST",
      "applicant-1",
      "selfie",
      "second_selfie.jpg",
    );
    let canonicalPath = oldTarget.path;
    let releaseFirstUpload!: () => void;
    const firstUploadMayFinish = new Promise<void>((resolve) => {
      releaseFirstUpload = resolve;
    });
    let markFirstUploadStarted!: () => void;
    const firstUploadStarted = new Promise<void>((resolve) => {
      markFirstUploadStarted = resolve;
    });
    const uploadOrder: string[] = [];
    const preflightPaths: Array<string | undefined> = [];
    const deletedPaths: string[] = [];

    const runReplacement = (
      target: typeof replacementTarget,
      waitForRelease: boolean,
    ) =>
      replaceProtectedMediaWithCanonicalReadback(
        replacementInput({
          deleteMedia: async (candidate) => {
            deletedPaths.push(candidate.path);
          },
          persistCanonical: async (path) => {
            canonicalPath = path;
          },
          readCanonical: async () => {
            preflightPaths.push(canonicalPath);
            return canonical(canonicalPath);
          },
          target,
          uploadMedia: async () => {
            uploadOrder.push(target.path);
            if (waitForRelease) {
              markFirstUploadStarted();
              await firstUploadMayFinish;
            }
            return { path: target.path };
          },
        }),
      );

    const first = runReplacement(replacementTarget, true);
    await firstUploadStarted;
    const second = runReplacement(secondTarget, false);
    await Promise.resolve();
    await Promise.resolve();

    expect(uploadOrder).toEqual([replacementTarget.path]);
    releaseFirstUpload();
    await expect(Promise.all([first, second])).resolves.toEqual([
      canonical(replacementTarget.path),
      canonical(secondTarget.path),
    ]);

    expect(preflightPaths).toEqual([
      oldTarget.path,
      replacementTarget.path,
      replacementTarget.path,
      secondTarget.path,
    ]);
    expect(deletedPaths).toEqual([oldTarget.path, replacementTarget.path]);
  });
});
