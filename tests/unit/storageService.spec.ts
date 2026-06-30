import { describe, expect, test } from "vitest";
import { buildMediaSlot } from "../../src/lib/workflow";
import {
  buildAppointmentPdfStorageTarget,
  buildApplicationPdfStorageTarget,
  buildMediaStoragePath,
  buildVisaApplicationPdfStorageTarget,
  createMediaSignedUrl,
  deleteMediaFromStorage,
  mediaStorageBucket,
  storageTargetForSlot,
  uploadMediaToStorage,
  validateAppointmentPdfStorageTarget,
  validateApplicationPdfStorageTarget,
  validateMediaStorageTarget,
  validateVisaApplicationPdfStorageTarget,
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
    const slot = buildMediaSlot(applicant, "selfie", "uploaded");
    const target = storageTargetForSlot("VF-1044", "applicant-1", slot);

    expect(target).toEqual({
      bucket: mediaStorageBucket,
      path: "VF-1044/applicant-1/selfie/751234567_selfie.jpg",
    });
  });

  test("accepts passport scans and second selfie slot with generated names only", () => {
    expect(() =>
      validateMediaStorageTarget({
        file: new File(["x"], "passport.pdf", { type: "application/pdf" }),
        target: buildMediaStoragePath(
          "VF-1044",
          "applicant-1",
          "passport_scan",
          "v19passport_passport_scan.pdf",
        ),
      }),
    ).not.toThrow();

    expect(() =>
      validateMediaStorageTarget({
        file: new File(["x"], "selfie-2.jpg", { type: "image/jpeg" }),
        target: buildMediaStoragePath(
          "VF-1044",
          "applicant-1",
          "selfie_2",
          "v19selfie2_selfie_2.jpg",
        ),
      }),
    ).not.toThrow();
  });

  test("accepts returned visa application PDFs as private generated artifacts", () => {
    const sha256 = "a".repeat(64);
    const target = buildVisaApplicationPdfStorageTarget({
      applicantId: "applicant-1",
      nonce: "2026-06-23T10:11:12.000Z:upload",
      sha256,
      submissionId: "VF-1044",
    });

    expect(target).toEqual({
      bucket: mediaStorageBucket,
      path: "VF-1044/applicant-1/visa_application_pdf/aaaaaaaaaaaaaaaa_20260623T101112000Zuploa_visa_application_pdf.pdf",
    });
    expect(() =>
      validateMediaStorageTarget({
        file: new File(["%PDF"], "returned.pdf", { type: "application/pdf" }),
        target,
      }),
    ).not.toThrow();
    expect(() =>
      validateMediaStorageTarget({
        file: new File(["x"], "returned.jpg", { type: "image/jpeg" }),
        target,
      }),
    ).toThrow(/MIME type/);
    expect(() =>
      validateVisaApplicationPdfStorageTarget({
        applicantId: "applicant-1",
        file: new File(["%PDF"], "returned.pdf", { type: "application/pdf" }),
        sha256,
        submissionId: "VF-1044",
        target,
      }),
    ).not.toThrow();
    expect(() =>
      validateVisaApplicationPdfStorageTarget({
        applicantId: "applicant-2",
        sha256,
        submissionId: "VF-1044",
        target,
      }),
    ).toThrow(/current submission/);
    expect(() =>
      validateVisaApplicationPdfStorageTarget({
        applicantId: "applicant-1",
        sha256: "b".repeat(64),
        submissionId: "VF-1044",
        target,
      }),
    ).toThrow(/current submission/);
  });

  test("scopes returned appointment PDFs to one submission and checksum", () => {
    const sha256 = "c".repeat(64);
    const target = buildAppointmentPdfStorageTarget({
      nonce: "2026-06-27T10:11:12.000Z",
      sha256,
      submissionId: "VF-1044",
    });

    expect(target).toEqual({
      bucket: mediaStorageBucket,
      path: "VF-1044/common/appointment_pdf/cccccccccccccccc_20260627T101112000Z_appointment_pdf.pdf",
    });
    expect(() =>
      validateAppointmentPdfStorageTarget({
        file: new File(["%PDF"], "appointment-list.pdf", {
          type: "application/pdf",
        }),
        sha256,
        submissionId: "VF-1044",
        target,
      }),
    ).not.toThrow();
    expect(() =>
      validateAppointmentPdfStorageTarget({
        sha256,
        submissionId: "VF-9999",
        target,
      }),
    ).toThrow(/current submission/);
  });

  test("scopes admin application PDFs to one submission and checksum", () => {
    const sha256 = "d".repeat(64);
    const target = buildApplicationPdfStorageTarget({
      nonce: "2026-06-29T10:11:12.000Z",
      sha256,
      submissionId: "VF-1044",
    });

    expect(target).toEqual({
      bucket: mediaStorageBucket,
      path: "VF-1044/common/application_pdf/dddddddddddddddd_20260629T101112000Z_application_pdf.pdf",
    });
    expect(() =>
      validateApplicationPdfStorageTarget({
        file: new File(["%PDF"], "application.pdf", {
          type: "application/pdf",
        }),
        sha256,
        submissionId: "VF-1044",
        target,
      }),
    ).not.toThrow();
    expect(() =>
      validateApplicationPdfStorageTarget({
        sha256,
        submissionId: "VF-9999",
        target,
      }),
    ).toThrow(/current submission/);
  });

  test("rejects returned visa application PDF storage targets without full SHA-256", () => {
    expect(() =>
      buildVisaApplicationPdfStorageTarget({
        applicantId: "applicant-1",
        sha256: "abc123",
        submissionId: "VF-1044",
      }),
    ).toThrow(/SHA-256/);
  });

  test("rejects unsafe path segments", () => {
    expect(() =>
      buildMediaStoragePath(
        "VF-1044/escape",
        "applicant-1",
        "selfie",
        "751234567_selfie.jpg",
      ),
    ).toThrow(/submissionId/);
  });

  test("accepts existing cockpit Cyrillic ids without allowing path escapes", () => {
    expect(
      buildMediaStoragePath("ПД-1052", "з-1052-1", "selfie", "v1900abcde_selfie.jpg"),
    ).toEqual({
      bucket: mediaStorageBucket,
      path: "ПД-1052/з-1052-1/selfie/v1900abcde_selfie.jpg",
    });
  });

  test("rejects wrong MIME type", () => {
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
      "selfie",
      "751234567_selfie.jpg",
    );

    expect(() =>
      validateMediaStorageTarget({
        target,
        file: {
          name: "selfie.png",
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
      "selfie",
      "751234567_selfie.jpg",
    );

    expect(
      validateMediaStorageTarget({
        target,
        file: {
          name: "selfie.jpg",
          size: 1024,
          type: "image/jpeg",
        } as File,
      }),
    ).toBe(target);
  });

  test("rejects legacy video slot type", () => {
    expect(() =>
      buildMediaStoragePath("VF-1044", "applicant-1", "video", "751234567_video.mov"),
    ).toThrow(/invalid slot type/);
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

  test("validates upload targets before returning local-demo null", async () => {
    await expect(
      uploadMediaToStorage(
        {
          bucket: mediaStorageBucket,
          path: "unsafe/path",
        },
        new File(["x"], "bad.mp4", { type: "video/mp4" }),
      ),
    ).rejects.toThrow(/storage path/);

    await expect(
      uploadMediaToStorage(
        buildMediaStoragePath(
          "VF-1044",
          "applicant-1",
          "selfie",
          "751234567_selfie.jpg",
        ),
        new File(["x"], "selfie.jpg", { type: "image/jpeg" }),
      ),
    ).resolves.toBeNull();
  });

  test("validates delete and signed-url targets before returning local-demo null", async () => {
    await expect(
      deleteMediaFromStorage({
        bucket: mediaStorageBucket,
        path: "unsafe/path",
      }),
    ).rejects.toThrow(/storage path/);

    await expect(
      createMediaSignedUrl({
        bucket: mediaStorageBucket,
        path: "unsafe/path",
      }),
    ).rejects.toThrow(/storage path/);

    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "selfie",
      "751234567_selfie.jpg",
    );

    await expect(deleteMediaFromStorage(target)).resolves.toBeUndefined();
    await expect(createMediaSignedUrl(target)).resolves.toBeNull();
  });
});
