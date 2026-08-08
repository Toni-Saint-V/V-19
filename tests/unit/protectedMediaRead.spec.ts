import { describe, expect, test, vi } from "vitest";

import { readProtectedSubmissionMedia } from "../../src/modules/submissions/protectedMediaRead";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import type { Submission, SubmissionFile } from "../../src/modules/submissions/types";

const submissionId = "ПД-READ";
const applicantId = "applicant-1";
const target = buildMediaStoragePath(
  submissionId,
  applicantId,
  "selfie",
  "canonical_selfie.png",
);

function canonicalFile(overrides: Partial<SubmissionFile> = {}): SubmissionFile {
  return {
    applicantId,
    generatedFileName: "canonical_selfie.png",
    id: "file-1",
    mimeType: "image/png",
    originalFileName: "synthetic.png",
    reviewStatus: "not_reviewed",
    sizeBytes: 7,
    status: "pending_review",
    storageAdapter: "supabase-private",
    storageBucket: target.bucket,
    storagePath: target.path,
    type: "selfie",
    uploadStatus: "uploaded",
    ...overrides,
  };
}

function canonicalSubmission(file = canonicalFile()): Submission {
  return {
    files: [file],
    id: submissionId,
  } as Submission;
}

describe("protected media read", () => {
  test("returns bytes only for the exact canonical storage identity", async () => {
    const blob = new Blob(["1234567"], { type: "image/png" });
    const loadMedia = vi.fn(async () => blob);

    await expect(
      readProtectedSubmissionMedia({
        applicantId,
        fileType: "selfie",
        loadMedia,
        submission: canonicalSubmission(),
      }),
    ).resolves.toEqual({ blob, file: canonicalFile() });

    expect(loadMedia).toHaveBeenCalledTimes(1);
    expect(loadMedia).toHaveBeenCalledWith(target);
  });

  test("rejects a foreign storage path before any object read", async () => {
    const loadMedia = vi.fn(async () => new Blob(["1234567"]));
    const foreignFile = canonicalFile({
      storagePath:
        "submissions/ПД-OTHER/applicants/applicant-1/selfie/canonical_selfie.png",
    });

    await expect(
      readProtectedSubmissionMedia({
        applicantId,
        fileType: "selfie",
        loadMedia,
        submission: canonicalSubmission(foreignFile),
      }),
    ).rejects.toThrow("Защищённый файл не принадлежит выбранной подаче");

    expect(loadMedia).not.toHaveBeenCalled();
  });

  test("fails closed when canonical metadata points to a missing object", async () => {
    await expect(
      readProtectedSubmissionMedia({
        applicantId,
        fileType: "selfie",
        loadMedia: async () => null,
        submission: canonicalSubmission(),
      }),
    ).rejects.toThrow("Защищённый объект отсутствует");
  });

  test("rejects bytes that do not match canonical size or MIME metadata", async () => {
    await expect(
      readProtectedSubmissionMedia({
        applicantId,
        fileType: "selfie",
        loadMedia: async () => new Blob(["different-size"], { type: "image/jpeg" }),
        submission: canonicalSubmission(),
      }),
    ).rejects.toThrow("Защищённый объект не совпадает с canonical metadata");
  });
});
