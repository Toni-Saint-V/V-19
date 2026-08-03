import { describe, expect, test, vi } from "vitest";

import {
  persistUploadedMediaWithRecovery,
  UploadedMediaCleanupError,
  UploadedMediaPersistenceUncertainError,
} from "../../src/modules/submissions/mediaUploadPersistence";
import type { Submission } from "../../src/modules/submissions/types";

const target = {
  bucket: "submission-media",
  path: "submissions/submission-1/applicants/applicant-1/passport_scan/file_passport_scan.jpg",
} as const;

function canonicalSubmission(referencesTarget: boolean): Submission {
  return {
    id: "submission-1",
    files: referencesTarget
      ? [
          {
            id: "file-1",
            storageBucket: target.bucket,
            storagePath: target.path,
          },
        ]
      : [],
  } as Submission;
}

describe("uploaded media persistence recovery", () => {
  test("deletes an unreferenced upload after canonical readback proves no commit", async () => {
    const conflict = new Error("revision conflict");
    const deleteUploadedMedia = vi.fn(async () => undefined);

    await expect(
      persistUploadedMediaWithRecovery({
        deleteUploadedMedia,
        persist: async () => Promise.reject(conflict),
        readCanonical: async () => canonicalSubmission(false),
        submissionId: "submission-1",
        target,
      }),
    ).rejects.toBe(conflict);
    expect(deleteUploadedMedia).toHaveBeenCalledWith(target);
  });

  test("treats a lost response as committed when canonical metadata references the upload", async () => {
    const canonical = canonicalSubmission(true);
    const deleteUploadedMedia = vi.fn(async () => undefined);

    await expect(
      persistUploadedMediaWithRecovery({
        deleteUploadedMedia,
        persist: async () => Promise.reject(new Error("Failed to fetch")),
        readCanonical: async () => canonical,
        submissionId: "submission-1",
        target,
      }),
    ).resolves.toBe(canonical);
    expect(deleteUploadedMedia).not.toHaveBeenCalled();
  });

  test("retains the object when canonical readback is unavailable", async () => {
    const deleteUploadedMedia = vi.fn(async () => undefined);

    await expect(
      persistUploadedMediaWithRecovery({
        deleteUploadedMedia,
        persist: async () => Promise.reject(new Error("Failed to fetch")),
        readCanonical: async () => Promise.reject(new Error("readback unavailable")),
        submissionId: "submission-1",
        target,
      }),
    ).rejects.toBeInstanceOf(UploadedMediaPersistenceUncertainError);
    expect(deleteUploadedMedia).not.toHaveBeenCalled();
  });

  test("surfaces cleanup failure without hiding the rejected save", async () => {
    await expect(
      persistUploadedMediaWithRecovery({
        deleteUploadedMedia: async () => Promise.reject(new Error("remove failed")),
        persist: async () => Promise.reject(new Error("revision conflict")),
        readCanonical: async () => canonicalSubmission(false),
        submissionId: "submission-1",
        target,
      }),
    ).rejects.toBeInstanceOf(UploadedMediaCleanupError);
  });

  test("retains an upload whose storage target belongs to another submission", async () => {
    const persist = vi.fn(async () => canonicalSubmission(true));
    const deleteUploadedMedia = vi.fn(async () => undefined);

    await expect(
      persistUploadedMediaWithRecovery({
        deleteUploadedMedia,
        persist,
        readCanonical: async () => canonicalSubmission(false),
        submissionId: "submission-2",
        target,
      }),
    ).rejects.toBeInstanceOf(UploadedMediaPersistenceUncertainError);
    expect(persist).not.toHaveBeenCalled();
    expect(deleteUploadedMedia).not.toHaveBeenCalled();
  });

  test("retains an upload when canonical readback returns another submission", async () => {
    const deleteUploadedMedia = vi.fn(async () => undefined);
    const wrongSubmission = {
      ...canonicalSubmission(false),
      id: "submission-2",
    } as Submission;

    await expect(
      persistUploadedMediaWithRecovery({
        deleteUploadedMedia,
        persist: async () => Promise.reject(new Error("revision conflict")),
        readCanonical: async () => wrongSubmission,
        submissionId: "submission-1",
        target,
      }),
    ).rejects.toBeInstanceOf(UploadedMediaPersistenceUncertainError);
    expect(deleteUploadedMedia).not.toHaveBeenCalled();
  });
});
