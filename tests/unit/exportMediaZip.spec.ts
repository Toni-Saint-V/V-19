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

function generatedSelection(submission: Submission): Submission[] {
  return applyExportStateToSelection([submission], [submission.id], "file_generated");
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

async function nestedZipNames(blob: Blob): Promise<{
  applicantFiles: string[];
  outerNames: string[];
  submissionNames: string[];
}> {
  const outer = await JSZip.loadAsync(blob);
  const outerNames = Object.keys(outer.files).filter((name) => !outer.files[name]?.dir);
  const submissionZipBytes = await outer.file(outerNames[0] ?? "")?.async("uint8array");
  if (!submissionZipBytes) throw new Error("Missing nested submission ZIP");

  const submissionZip = await JSZip.loadAsync(submissionZipBytes);
  const submissionNames = Object.keys(submissionZip.files).filter(
    (name) => !submissionZip.files[name]?.dir,
  );
  const applicantZipBytes = await submissionZip
    .file(submissionNames[0] ?? "")
    ?.async("uint8array");
  if (!applicantZipBytes) throw new Error("Missing nested applicant ZIP");

  const applicantZip = await JSZip.loadAsync(applicantZipBytes);
  const applicantFiles = Object.keys(applicantZip.files).filter(
    (name) => !applicantZip.files[name]?.dir,
  );

  return { applicantFiles, outerNames, submissionNames };
}

describe("export media mega ZIP", () => {
  test("builds one submission ZIP with one tourist ZIP for a single applicant", async () => {
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

    const names = await nestedZipNames(result.artifact.blob);
    expect(names.outerNames).toHaveLength(1);
    expect(names.submissionNames).toHaveLength(1);
    expect(names.applicantFiles.sort()).toEqual([
      "01_passport_scan.pdf",
      "02_selfie.jpg",
      "03_selfie_2.jpg",
    ]);
  });

  test("keeps a family together as one submission ZIP with tourist ZIPs inside", async () => {
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

    const names = await nestedZipNames(result.artifact.blob);
    expect(names.outerNames).toHaveLength(1);
    expect(names.submissionNames).toHaveLength(3);
    expect(names.submissionNames.every((name) => name.endsWith(".zip"))).toBe(true);
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
