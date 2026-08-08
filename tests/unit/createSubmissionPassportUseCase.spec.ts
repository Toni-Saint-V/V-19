import { describe, expect, test, vi } from "vitest";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";
import { persistCreatedSubmissionWithPassports } from "../../src/modules/submissions/createSubmissionPassportUseCase";
import {
  buildLocalDemoExportMediaZipOptions,
  localDemoReviewMediaUrl,
} from "../../src/modules/submissions/exportMediaZipLocalDemo";
import { saveLocalDemoMedia } from "../../src/modules/submissions/localDemoMediaStorage";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import {
  loadSubmissions,
  saveSubmissions,
} from "../../src/modules/submissions/persistence";
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
  test("uses the same canonical pipeline for local demo without claiming private storage", async () => {
    const progress: string[] = [];
    const persisted: Submission[] = [];
    const uploadMedia = vi.fn();
    const initial = draft(1);

    const result = await persistCreatedSubmissionWithPassports({
      onPendingSubmission: () => undefined,
      onProgress: (event) => progress.push(event.stage),
      passportUploads: [passportUpload(0)],
      persistSubmission: async (submission) => {
        persisted.push(submission);
      },
      storageAdapter: "local-dev",
      submission: initial,
      uploadMedia,
    });

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(progress).toEqual([
      "saving_submission",
      "uploading_passport",
      "saving_passport_metadata",
      "complete",
    ]);
    expect(persisted).toHaveLength(2);
    expect(result.files.find((file) => file.type === "passport_scan")).toMatchObject({
      originalFileName: "audit-1.png",
      storageAdapter: "local-dev",
      uploadStatus: "uploaded",
    });
    expect(result.applicants[0]?.passportExtraction?.status).toBe("ready");
  });

  test("stores exact local-demo bytes before publishing the simulated private identity", async () => {
    const persisted: Submission[] = [];
    const uploadMedia = vi.fn();
    const initial = draft(1);
    const storedMedia = new Map<string, Blob>();
    const storeLocalDemoMedia = vi.fn(async (target, file: File) => {
      storedMedia.set(
        target.path,
        new Blob([await file.arrayBuffer()], {
          type: file.type || "application/octet-stream",
        }),
      );
      return { path: target.path };
    });
    const loadStoredMedia = async (path: string) => storedMedia.get(path) ?? null;

    const result = await persistCreatedSubmissionWithPassports({
      onPendingSubmission: () => undefined,
      passportUploads: [passportUpload(0)],
      persistSubmission: async (submission) => {
        persisted.push(submission);
      },
      simulatePrivateStorage: true,
      storageAdapter: "local-dev",
      storeLocalDemoMedia,
      submission: initial,
      uploadMedia,
    });

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(storeLocalDemoMedia).toHaveBeenCalledTimes(1);
    expect(persisted).toHaveLength(2);
    expect(result.files.find((file) => file.type === "passport_scan")).toMatchObject({
      localDemoMediaStored: true,
      originalFileName: "audit-1.png",
      storageAdapter: "supabase-private",
      storageBucket: "submission-media",
      storagePath: expect.stringContaining(
        `/${initial.applicants[0]?.id}/passport_scan/`,
      ),
      uploadStatus: "uploaded",
    });

    const exportSubmission: Submission = {
      ...result,
      files: result.files.map((file) =>
        file.type === "passport_scan" ? { ...file, status: "accepted" } : file,
      ),
    };
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    let reloadedSubmission: Submission | undefined;
    try {
      expect(saveSubmissions([exportSubmission])).toEqual({ ok: true });
      reloadedSubmission = loadSubmissions().find(
        (submission) => submission.id === exportSubmission.id,
      );
    } finally {
      if (previousStorage) {
        Object.defineProperty(globalThis, "localStorage", previousStorage);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
    expect(reloadedSubmission).toBeDefined();
    const reloadedPassport = reloadedSubmission?.files.find(
      (file) => file.type === "passport_scan",
    );
    expect(reloadedPassport).toMatchObject({
      localDemoMediaStored: true,
      storageAdapter: "supabase-private",
      storagePath: expect.stringContaining("/passport_scan/"),
    });

    const previousCreateObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const createObjectUrl = vi.fn((blob: Blob) => {
      void blob;
      return "blob:reloaded-passport";
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    try {
      await expect(
        localDemoReviewMediaUrl("passport_scan", reloadedPassport, loadStoredMedia),
      ).resolves.toBe("blob:reloaded-passport");
      const previewBlob = createObjectUrl.mock.calls[0]?.[0] as Blob | undefined;
      expect(previewBlob).toBeInstanceOf(Blob);
      expect(Array.from(new Uint8Array(await previewBlob!.arrayBuffer()))).toEqual([
        0x89, 0x50, 0x4e, 0x47,
      ]);
    } finally {
      if (previousCreateObjectUrl) {
        Object.defineProperty(URL, "createObjectURL", previousCreateObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
    }

    const options = buildLocalDemoExportMediaZipOptions(
      [reloadedSubmission!],
      loadStoredMedia,
    );
    const asset = options.documentAssets?.[0];
    expect(asset).toBeDefined();
    const exported = asset
      ? await options.downloadDocument?.(asset, {
          applicant: reloadedSubmission!.applicants[0]!,
          applicantIndex: 0,
          exportDate: "2026-07-28",
          submission: reloadedSubmission!,
          type: asset.type,
        })
      : null;
    expect(exported).not.toBeNull();
    expect(Array.from(new Uint8Array(await exported!.arrayBuffer()))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);

    const applicant = exportSubmission.applicants[0]!;
    const selfieFile = new File(
      [new Uint8Array([0xff, 0xd8, 0x01, 0xff, 0xd9])],
      "selfie-source.jpg",
      { type: "image/jpeg" },
    );
    const selfieTarget = buildMediaStoragePath(
      exportSubmission.id,
      applicant.id,
      "selfie",
      "123_selfie.jpg",
    );
    storedMedia.set(
      selfieTarget.path,
      new Blob([await selfieFile.arrayBuffer()], { type: selfieFile.type }),
    );
    const exportWithSelfie: Submission = {
      ...exportSubmission,
      files: [
        ...exportSubmission.files,
        {
          applicantId: applicant.id,
          generatedFileName: "123_selfie.jpg",
          id: "selfie-source",
          localDemoMediaStored: true,
          mimeType: selfieFile.type,
          originalFileName: selfieFile.name,
          sizeBytes: selfieFile.size,
          status: "accepted",
          storageAdapter: "supabase-private",
          storageBucket: selfieTarget.bucket,
          storagePath: selfieTarget.path,
          type: "selfie",
          uploadStatus: "uploaded",
        },
      ],
    };
    const selfieOptions = buildLocalDemoExportMediaZipOptions(
      [exportWithSelfie],
      loadStoredMedia,
    );
    const selfieAsset = selfieOptions.documentAssets?.find(
      (candidate) => candidate.type === "selfie_1",
    );
    expect(selfieAsset?.storage.path).toContain("/selfie_1/");
    const exportedSelfie = selfieAsset
      ? await selfieOptions.downloadDocument?.(selfieAsset, {
          applicant,
          applicantIndex: 0,
          exportDate: "2026-07-28",
          submission: exportWithSelfie,
          type: selfieAsset.type,
        })
      : null;
    expect(Array.from(new Uint8Array(await exportedSelfie!.arrayBuffer()))).toEqual([
      0xff, 0xd8, 0x01, 0xff, 0xd9,
    ]);

    const wrongMimeOptions = buildLocalDemoExportMediaZipOptions(
      [exportWithSelfie],
      async (path) => {
        const stored = storedMedia.get(path);
        return stored
          ? new Blob([await stored.arrayBuffer()], { type: "text/plain" })
          : null;
      },
    );
    const wrongMimeAsset = wrongMimeOptions.documentAssets?.find(
      (candidate) => candidate.type === "selfie_1",
    );
    await expect(
      wrongMimeAsset
        ? wrongMimeOptions.downloadDocument?.(wrongMimeAsset, {
            applicant,
            applicantIndex: 0,
            exportDate: "2026-07-28",
            submission: exportWithSelfie,
            type: wrongMimeAsset.type,
          })
        : null,
    ).resolves.toBeNull();
    await expect(
      localDemoReviewMediaUrl(
        "selfie",
        exportWithSelfie.files.find((file) => file.id === "selfie-source"),
        async (path) => {
          const stored = storedMedia.get(path);
          return stored
            ? new Blob([await stored.arrayBuffer()], { type: "text/plain" })
            : null;
        },
      ),
    ).resolves.toBeNull();

    const originalPassport = exportSubmission.files.find(
      (file) => file.type === "passport_scan",
    );
    if (!originalPassport?.storagePath) throw new Error("expected stored passport");
    const collisionSubmissionId = "collision-submission";
    const collisionPath = originalPassport.storagePath.replace(
      exportSubmission.id,
      collisionSubmissionId,
    );
    storedMedia.set(
      collisionPath,
      new Blob([new Uint8Array([0x11, 0x22, 0x33, 0x44])], {
        type: "image/png",
      }),
    );
    const collisionSubmission: Submission = {
      ...exportSubmission,
      id: collisionSubmissionId,
      files: exportSubmission.files.map((file) =>
        file.id === originalPassport.id
          ? { ...file, storagePath: collisionPath }
          : file,
      ),
    };
    const collisionOptions = buildLocalDemoExportMediaZipOptions(
      [exportSubmission, collisionSubmission],
      loadStoredMedia,
    );
    const passportAssets = collisionOptions.documentAssets?.filter(
      (candidate) => candidate.type === "passport_scan",
    );
    expect(passportAssets).toHaveLength(2);
    for (const asset of passportAssets ?? []) {
      const sourceSubmission =
        asset.submissionId === exportSubmission.id
          ? exportSubmission
          : collisionSubmission;
      const downloaded = await collisionOptions.downloadDocument?.(asset, {
        applicant: sourceSubmission.applicants[0]!,
        applicantIndex: 0,
        exportDate: "2026-07-28",
        submission: sourceSubmission,
        type: asset.type,
      });
      expect(Array.from(new Uint8Array(await downloaded!.arrayBuffer()))).toEqual(
        asset.submissionId === exportSubmission.id
          ? [0x89, 0x50, 0x4e, 0x47]
          : [0x11, 0x22, 0x33, 0x44],
      );
    }
  });

  test("fails closed when durable IndexedDB storage is unavailable", async () => {
    const previousIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });
    try {
      await expect(
        saveLocalDemoMedia(
          buildMediaStoragePath(
            "submission-no-indexed-db",
            "applicant-no-indexed-db",
            "passport_scan",
            "abc_passport_scan.png",
          ),
          passportUpload(0).file!,
        ),
      ).rejects.toThrow("Локальное хранилище документов недоступно");
    } finally {
      if (previousIndexedDb) {
        Object.defineProperty(globalThis, "indexedDB", previousIndexedDb);
      } else {
        Reflect.deleteProperty(globalThis, "indexedDB");
      }
    }
  });

  test("rejects private-storage simulation with the production adapter", async () => {
    const persistSubmission = vi.fn(async () => undefined);
    const uploadMedia = vi.fn();

    await expect(
      persistCreatedSubmissionWithPassports({
        onPendingSubmission: () => undefined,
        passportUploads: [passportUpload(0)],
        persistSubmission,
        simulatePrivateStorage: true,
        storageAdapter: "supabase-private",
        submission: draft(1),
        uploadMedia,
      }),
    ).rejects.toThrow(
      "Private Storage simulation is available only with the local-dev adapter.",
    );

    expect(persistSubmission).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  test("reloads a locally persisted family with passport metadata", async () => {
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    try {
      const family = createDraftSubmission({
        agentId: "agent-family",
        applicantNames: ["V19 QA Main", "V19 QA Spouse"],
        city: "Санкт-Петербург",
        familyCount: 2,
        submissions: [],
        type: "family",
      });
      let persistedFamily = family;

      await persistCreatedSubmissionWithPassports({
        onPendingSubmission: () => undefined,
        passportUploads: [passportUpload(0), passportUpload(1)],
        persistSubmission: async (submission) => {
          persistedFamily = submission;
          expect(saveSubmissions([submission])).toEqual({ ok: true });
        },
        storageAdapter: "local-dev",
        submission: family,
      });

      const reloadedFamily = loadSubmissions().find(
        (submission) => submission.id === family.id,
      );
      expect(reloadedFamily).toMatchObject({
        agentId: "agent-family",
        type: "family",
      });
      expect(reloadedFamily?.applicants).toHaveLength(
        persistedFamily.applicants.length,
      );
    } finally {
      if (previousStorage) {
        Object.defineProperty(globalThis, "localStorage", previousStorage);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });

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
