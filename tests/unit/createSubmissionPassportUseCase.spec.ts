import { describe, expect, test, vi } from "vitest";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";
import { persistCreatedSubmissionWithPassports } from "../../src/modules/submissions/createSubmissionPassportUseCase";
import type {
  PassportUploadDraft,
  Submission,
} from "../../src/modules/submissions/types";

function draft(applicantCount: number): Submission {
  return createDraftSubmission({
    agentId: "00000000-0000-4000-8000-000000000001",
    applicantNames: Array.from(
      { length: applicantCount },
      (_, index) => `V19 QA Applicant ${index + 1}`,
    ),
    city: "Москва",
    familyCount: applicantCount,
    idScheme: "supabase",
    submissions: [],
    type: applicantCount === 1 ? "single" : "family",
  });
}

function passportUpload(index: number): PassportUploadDraft {
  return {
    applicantIndex: index,
    extractedFields: [
      {
        confidence: "high",
        key: "surname",
        needsManualReview: false,
        source: "passport_scan",
        value: `AUDIT${index + 1}`,
      },
    ],
    file: new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
      `audit-${index + 1}.png`,
      {
        type: "image/png",
      },
    ),
    fileName: `audit-${index + 1}.png`,
    id: `upload-${index + 1}`,
    status: "ready",
  };
}

function uploadedPassportCount(submission: Submission): number {
  return submission.files.filter(
    (file) => file.type === "passport_scan" && Boolean(file.storagePath),
  ).length;
}

describe("persistCreatedSubmissionWithPassports", () => {
  test("persists parent rows before Storage and records every passport immediately", async () => {
    const events: string[] = [];
    let pending: Submission | null = null;
    const initial = draft(2);

    const result = await persistCreatedSubmissionWithPassports({
      onPendingSubmission: (submission) => {
        pending = submission;
      },
      passportUploads: [passportUpload(0), passportUpload(1)],
      persistSubmission: async (submission) => {
        events.push(`persist:${uploadedPassportCount(submission)}`);
      },
      submission: initial,
      uploadMedia: vi.fn(async (target) => {
        events.push(`upload:${target.path.split("/")[3]}`);
        return { path: target.path };
      }),
    });

    expect(events).toEqual([
      "persist:0",
      `upload:${initial.applicants[0]?.id}`,
      "persist:1",
      `upload:${initial.applicants[1]?.id}`,
      "persist:2",
    ]);
    expect(initial.files[0]?.originalFileName).toBeUndefined();
    expect(result.id).toBe(initial.id);
    expect(uploadedPassportCount(result)).toBe(2);
    expect(pending).toBe(result);
  });

  test("persists marker-bearing passport upload intents before the first Storage call", async () => {
    const initial = draft(1);
    const upload = passportUpload(0);
    const persisted: Submission[] = [];
    const uploadMedia = vi.fn(async (target) => ({ path: target.path }));

    await persistCreatedSubmissionWithPassports({
      onPendingSubmission: () => undefined,
      passportUploads: [upload],
      persistSubmission: async (submission) => {
        persisted.push(submission);
      },
      submission: initial,
      uploadMedia,
    });

    expect(persisted[0]?.files[0]).toMatchObject({
      mimeType: "image/png",
      originalFileName: upload.fileName,
      sizeBytes: upload.file?.size,
      status: "missing",
    });
    expect(persisted[0]?.files[0]?.storagePath).toBeUndefined();
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });

  test("retries an ambiguous draft-save response with the same id and without re-upload", async () => {
    const initial = draft(1);
    const upload = passportUpload(0);
    const attemptedStoragePaths = new Set<string>();
    let pending = initial;
    let persistCalls = 0;
    const uploadMedia = vi.fn(async (target) => ({ path: target.path }));
    const persistSubmission = vi.fn(async () => {
      persistCalls += 1;
      if (persistCalls === 2) {
        throw new Error("response lost after save_submission_draft");
      }
    });

    await expect(
      persistCreatedSubmissionWithPassports({
        attemptedStoragePaths,
        onPendingSubmission: (submission) => {
          pending = submission;
        },
        passportUploads: [upload],
        persistSubmission,
        submission: initial,
        uploadMedia,
      }),
    ).rejects.toThrow("response lost");

    expect(pending.id).toBe(initial.id);
    expect(uploadedPassportCount(pending)).toBe(1);
    expect(uploadMedia).toHaveBeenCalledTimes(1);

    const recovered = await persistCreatedSubmissionWithPassports({
      attemptedStoragePaths,
      onPendingSubmission: (submission) => {
        pending = submission;
      },
      passportUploads: [upload],
      persistSubmission,
      submission: pending,
      uploadMedia,
    });

    expect(recovered.id).toBe(initial.id);
    expect(uploadedPassportCount(recovered)).toBe(1);
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(attemptedStoragePaths.size).toBe(0);
  });

  test("clears an upload with an ambiguous response before retrying the same object path", async () => {
    const initial = draft(1);
    const upload = passportUpload(0);
    const attemptedStoragePaths = new Set<string>();
    const events: string[] = [];
    let pending = initial;
    let uploadCalls = 0;
    const uploadMedia = vi.fn(async (target) => {
      uploadCalls += 1;
      events.push(`upload:${uploadCalls}`);
      if (uploadCalls === 1) throw new Error("upload response lost");
      return { path: target.path };
    });
    const deleteMedia = vi.fn(async () => {
      events.push("delete-ambiguous");
    });

    await expect(
      persistCreatedSubmissionWithPassports({
        attemptedStoragePaths,
        deleteMedia,
        onPendingSubmission: (submission) => {
          pending = submission;
        },
        passportUploads: [upload],
        persistSubmission: async () => {
          events.push("persist");
        },
        submission: initial,
        uploadMedia,
      }),
    ).rejects.toThrow("upload response lost");

    const recovered = await persistCreatedSubmissionWithPassports({
      attemptedStoragePaths,
      deleteMedia,
      onPendingSubmission: (submission) => {
        pending = submission;
      },
      passportUploads: [upload],
      persistSubmission: async () => {
        events.push("persist");
      },
      submission: pending,
      uploadMedia,
    });

    expect(events).toEqual([
      "persist",
      "upload:1",
      "persist",
      "delete-ambiguous",
      "upload:2",
      "persist",
    ]);
    expect(recovered.id).toBe(initial.id);
    expect(uploadedPassportCount(recovered)).toBe(1);
    expect(deleteMedia).toHaveBeenCalledTimes(1);
    expect(attemptedStoragePaths.size).toBe(0);
  });
});
