import { describe, expect, test } from "vitest";
import { buildMediaSlot } from "../../src/lib/workflow";
import {
  buildMediaStoragePath,
  mediaStorageBucket,
  storageTargetForSlot,
  uploadMediaToStorage,
  validateMediaStorageTarget,
} from "../../src/services/storageService";
import type { Applicant } from "../../src/types/domain";

const applicant: Applicant = {
  id: "applicant-1",
  name: "Ivan Petrov",
  role: "Заявитель",
  passport: "75 1234567",
  form: 100,
  media: 3,
  mediaRequired: 3,
};

describe("media storage contract", () => {
  test("builds stable generated-name storage paths", () => {
    const slot = buildMediaSlot(applicant, "photo_white", "uploaded");
    const target = storageTargetForSlot("VF-1044", "applicant-1", slot);

    expect(target).toEqual({
      bucket: mediaStorageBucket,
      path: "VF-1044/applicant-1/photo_white/751234567_photo_white.jpg",
    });
  });

  test("rejects unsafe path segments", () => {
    expect(() =>
      buildMediaStoragePath(
        "VF-1044/escape",
        "applicant-1",
        "photo_white",
        "751234567_photo_white.jpg",
      ),
    ).toThrow(/submissionId/);
  });

  test("accepts existing cockpit Cyrillic ids without allowing path escapes", () => {
    expect(
      buildMediaStoragePath(
        "ПД-1052",
        "з-1052-1",
        "photo_white",
        "v1900abcde_photo_white.jpg",
      ),
    ).toEqual({
      bucket: mediaStorageBucket,
      path: "ПД-1052/з-1052-1/photo_white/v1900abcde_photo_white.jpg",
    });
  });

  test("rejects wrong MIME type", () => {
    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "photo_white",
      "751234567_photo_white.jpg",
    );

    expect(() =>
      validateMediaStorageTarget({
        target,
        file: {
          name: "bad.mp4",
          size: 1024,
          type: "video/mp4",
        } as File,
      }),
    ).toThrow(/MIME type/);
  });

  test("rejects MIME types that do not match generated extension", () => {
    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "photo_white",
      "751234567_photo_white.jpg",
    );

    expect(() =>
      validateMediaStorageTarget({
        target,
        file: {
          name: "photo.png",
          size: 1024,
          type: "image/png",
        } as File,
      }),
    ).toThrow(/extension/);
  });

  test("accepts matching MIME and generated extension", () => {
    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "photo_white",
      "751234567_photo_white.jpg",
    );

    expect(
      validateMediaStorageTarget({
        target,
        file: {
          name: "photo.jpg",
          size: 1024,
          type: "image/jpeg",
        } as File,
      }),
    ).toBe(target);
  });

  test("rejects wrong extension for slot type", () => {
    expect(() =>
      buildMediaStoragePath("VF-1044", "applicant-1", "video", "751234567_video.mov"),
    ).toThrow(/extension/);
  });

  test("rejects oversize files", () => {
    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "selfie",
      "751234567_selfie.jpg",
    );

    expect(() =>
      validateMediaStorageTarget({
        target,
        file: {
          name: "selfie.jpg",
          size: 51 * 1024 * 1024,
          type: "image/jpeg",
        } as File,
      }),
    ).toThrow(/size/);
  });

  test("returns null in local-demo before validating upload target", async () => {
    await expect(
      uploadMediaToStorage(
        {
          bucket: mediaStorageBucket,
          path: "unsafe/path",
        },
        new File(["x"], "bad.mp4", { type: "video/mp4" }),
      ),
    ).resolves.toBeNull();
  });
});
