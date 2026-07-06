import JSZip from "jszip";
import { describe, expect, test, vi } from "vitest";
import {
  buildExportPackageIdentity,
} from "../../src/modules/submissions/exportRules";
import {
  createExportMediaZipArtifact,
  default as downloadExportMediaZip,
  type ExportMediaZipDownloader,
} from "../../src/modules/submissions/exportMediaZip";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import { mediaStorageBucket } from "../../src/modules/submissions/mediaStorage";
import type {
  Submission,
  SubmissionFile,
} from "../../src/modules/submissions/types";

const canonicalTypes = ["passport_scan", "selfie", "selfie_2"] as const;

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
}

function withCanonicalStorage(submission: Submission): Submission {
  return {
    ...submission,
    files: submission.files
      .filter((file) => canonicalTypes.some((type) => type === file.type))
      .map((file, index) => {
        const generatedFileName = generatedName(file, index + 1);
        return {
          ...file,
          generatedFileName,
          mimeType: file.type === "passport_scan" ? "application/pdf" : "image/jpeg",
          originalFileName:
            file.type === "passport_scan" ? "passport.pdf" : `${file.type}.jpg`,
          sizeBytes: 16,
          storageBucket: mediaStorageBucket,
          storagePath: `submissions/${submission.id}/applicants/${file.applicantId}/${file.type}/${generatedFileName}`,
        };
      }),
  };
}

function generatedName(file: SubmissionFile, index: number): string {
  const prefix = `v19${String(index).padStart(4, "0")}`;
  return file.type === "passport_scan"
    ? `${prefix}_passport_scan.pdf`
    : `${prefix}_${file.type}.jpg`;
}

function generatedSelection(...submissions: Submission[]): Submission[] {
  return applyExportStateToSelection(
    submissions,
    submissions.map((submission) => submission.id),
    "file_generated",
  );
}

function identityFor(selection: Submission[]) {
  const identity = buildExportPackageIdentity(selection);
  if (!identity) throw new Error("Missing export package identity");
  return identity;
}

function downloader(bytes = "private-media-bytes"): ExportMediaZipDownloader {
  return vi.fn(async (target, file) => {
    const type = file.mimeType ?? "application/octet-stream";
    return new Blob([`${bytes}:${target.path}`], { type });
  });
}

async function zipEntryNames(blob: Blob): Promise<{
  directoryNames: string[];
  fileNames: string[];
}> {
  const zip = await JSZip.loadAsync(blob);
  const names = Object.keys(zip.files);
  return {
    directoryNames: names.filter((name) => zip.files[name]?.dir).sort(),
    fileNames: names.filter((name) => !zip.files[name]?.dir).sort(),
  };
}

describe("export media mega ZIP", () => {
  test("puts a single applicant under the applicants folder", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const result = await createExportMediaZipArtifact(selection, {
      downloadMedia: downloader(),
      expectedIdentity: identityFor(selection),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);
    expect(result.artifact.fileName).toMatch(/^visaflow-media-.+\.zip$/);
    expect(result.artifact).toMatchObject({
      applicantCount: 1,
      fileCount: 3,
      submissionCount: 1,
    });

    const names = await zipEntryNames(result.artifact.blob);
    expect(names.directoryNames).toEqual(
      expect.arrayContaining(["Заявители/", "Семьи/"]),
    );
    expect(names.fileNames).toHaveLength(3);
    expect(names.fileNames).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^Заявители\/01_ПД-1056_.+\/01_.+\/01_passport_scan\.pdf$/,
        ),
        expect.stringMatching(/^Заявители\/01_ПД-1056_.+\/01_.+\/02_selfie\.jpg$/),
        expect.stringMatching(
          /^Заявители\/01_ПД-1056_.+\/01_.+\/03_selfie_2\.jpg$/,
        ),
      ]),
    );
  });

  test("keeps a family together under one family folder with tourist folders", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("SUB-1102")));
    const result = await createExportMediaZipArtifact(selection, {
      downloadMedia: downloader(),
      expectedIdentity: identityFor(selection),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);
    expect(result.artifact).toMatchObject({
      applicantCount: 3,
      fileCount: 9,
      submissionCount: 1,
    });

    const names = await zipEntryNames(result.artifact.blob);
    expect(names.directoryNames).toEqual(
      expect.arrayContaining(["Заявители/", "Семьи/"]),
    );
    expect(names.fileNames).toHaveLength(9);
    expect(
      names.fileNames.every((name) => name.startsWith("Семьи/01_SUB-1102_")),
    ).toBe(true);
    expect(new Set(names.fileNames.map((name) => name.split("/")[2])).size).toBe(3);
    expect(
      names.fileNames.filter((name) => name.endsWith("/03_selfie_2.jpg")),
    ).toHaveLength(3);
  });

  test("groups mixed export packages into families and applicants folders", async () => {
    const selection = generatedSelection(
      withCanonicalStorage(byId("SUB-1101")),
      withCanonicalStorage(byId("SUB-1102")),
    );
    const result = await createExportMediaZipArtifact(selection, {
      downloadMedia: downloader(),
      expectedIdentity: identityFor(selection),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);

    const names = await zipEntryNames(result.artifact.blob);
    expect(names.fileNames).toHaveLength(12);
    expect(names.fileNames.some((name) => name.startsWith("Заявители/"))).toBe(true);
    expect(names.fileNames.some((name) => name.startsWith("Семьи/"))).toBe(true);
    expect(
      names.fileNames.filter((name) => name.startsWith("Заявители/")),
    ).toHaveLength(3);
    expect(names.fileNames.filter((name) => name.startsWith("Семьи/"))).toHaveLength(
      9,
    );
  });

  test("blocks packages with missing required media before touching storage", async () => {
    const submission = withCanonicalStorage(byId("ПД-1056"));
    const broken = {
      ...submission,
      files: submission.files.filter((file) => file.type !== "selfie_2"),
    };
    const selection = generatedSelection(broken);
    const downloadMedia = downloader();

    const result = await createExportMediaZipArtifact(selection, {
      downloadMedia,
      expectedIdentity: identityFor(selection),
    });

    expect(result).toMatchObject({ ok: false, reason: "export_not_ready" });
    expect(downloadMedia).not.toHaveBeenCalled();
  });

  test("blocks non-accepted media before touching storage", async () => {
    const submission = withCanonicalStorage(byId("ПД-1056"));
    const broken = {
      ...submission,
      files: submission.files.map((file, index) =>
        index === 0 ? { ...file, status: "pending_review" as const } : file,
      ),
    };
    const selection = generatedSelection(broken);
    const downloadMedia = downloader();

    const result = await createExportMediaZipArtifact(selection, {
      downloadMedia,
      expectedIdentity: identityFor(selection),
    });

    expect(result).toMatchObject({ ok: false, reason: "export_not_ready" });
    expect(downloadMedia).not.toHaveBeenCalled();
  });

  test("blocks wrong storage identity before starting browser download", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const broken = selection.map((submission) => ({
      ...submission,
      files: submission.files.map((file, index) =>
        index === 0 ? { ...file, storageBucket: "public" } : file,
      ),
    }));
    const createObjectURL = vi.fn();
    const originalUrl = globalThis.URL;

    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
    });

    try {
      const result = await downloadExportMediaZip(broken, identityFor(selection), {
        downloadMedia: downloader(),
      });

      expect(result).toMatchObject({ ok: false, reason: "media_not_ready" });
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "URL", {
        configurable: true,
        value: originalUrl,
      });
    }
  });

  test("blocks wrong storage path before starting browser download", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const broken = selection.map((submission) => ({
      ...submission,
      files: submission.files.map((file, index) =>
        index === 0
          ? { ...file, storagePath: `${file.storagePath ?? ""}.stale` }
          : file,
      ),
    }));
    const createObjectURL = vi.fn();
    const originalUrl = globalThis.URL;

    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
    });

    try {
      const result = await downloadExportMediaZip(broken, identityFor(selection), {
        downloadMedia: downloader(),
      });

      expect(result).toMatchObject({ ok: false, reason: "media_not_ready" });
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "URL", {
        configurable: true,
        value: originalUrl,
      });
    }
  });

  test("blocks empty storage bytes without starting browser download", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const createObjectURL = vi.fn();
    const originalUrl = globalThis.URL;

    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
    });

    try {
      const result = await downloadExportMediaZip(selection, identityFor(selection), {
        downloadMedia: vi.fn(async () => new Blob([])),
      });

      expect(result).toMatchObject({ ok: false, reason: "empty_file" });
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "URL", {
        configurable: true,
        value: originalUrl,
      });
    }
  });

  test("blocks stale package identity before touching storage", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const stale = selection.map((submission) => ({
      ...submission,
      title: `${submission.title} stale`,
    }));
    const downloadMedia = downloader();

    const result = await createExportMediaZipArtifact(stale, {
      downloadMedia,
      expectedIdentity: identityFor(selection),
    });

    expect(result).toMatchObject({ ok: false, reason: "export_not_ready" });
    expect(downloadMedia).not.toHaveBeenCalled();
  });
});
