import JSZip from "jszip";
import { describe, expect, test, vi } from "vitest";
import { buildExportPackageIdentity } from "../../src/modules/submissions/exportRules";
import {
  createExportMediaZipArtifact,
  default as downloadExportMediaZip,
  toExportPackageDocumentCommit,
  type ExportMediaZipDocumentDownloader,
} from "../../src/modules/submissions/exportMediaZip";
import {
  normalizeDocumentType,
  type DocumentAsset,
} from "../../src/modules/documents/documentTypes";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { mediaStorageBucket } from "../../src/modules/submissions/mediaStoragePolicy";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import type {
  Submission,
  SubmissionFile,
} from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

const canonicalTypes = ["passport_scan", "selfie", "selfie_2"] as const;
const exportDate = "2026-07-07";
const rootFolder = `VisaFlow_Export_${exportDate}`;

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return fillRequiredQuestionnaireForTest(submission);
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
          reviewStatus: "accepted" as const,
          sizeBytes: 16,
          storageBucket: mediaStorageBucket,
          storagePath: `submissions/${submission.id}/applicants/${file.applicantId}/${file.type}/${generatedFileName}`,
          uploadStatus: "uploaded" as const,
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

function documentAssetsFor(submissions: Submission[]): DocumentAsset[] {
  const now = "2026-07-07T00:00:00.000Z";

  return submissions.flatMap((submission) =>
    submission.files.flatMap((file) => {
      if (!canonicalTypes.some((type) => type === file.type)) return [];
      if (!file.storagePath || file.storageBucket !== mediaStorageBucket) return [];

      const type = normalizeDocumentType(file.type);
      const filename =
        file.generatedFileName ??
        file.storagePath.split("/").filter(Boolean).at(-1) ??
        null;

      return [
        {
          applicantId: file.applicantId,
          checksum: null,
          createdAt: now,
          exportStatus: "ready" as const,
          id: `asset-${submission.id}-${file.applicantId}-${type}`,
          mime:
            file.mimeType ??
            (type === "passport_scan" ? "application/pdf" : "image/jpeg"),
          ownerUserId: submission.agentId,
          size: file.sizeBytes ?? 16,
          sourceMediaAssetId: file.id,
          storage: {
            bucket: mediaStorageBucket,
            filename,
            path: file.storagePath,
          },
          submissionId: submission.id,
          type,
          updatedAt: now,
          uploadedAt: file.uploadedAtIso ?? now,
          uploadStatus: "uploaded" as const,
          validatedAt: file.reviewedAtIso ?? now,
          validationStatus: "passed" as const,
        },
      ];
    }),
  );
}

function documentDownloader(
  bytes = "private-media-bytes",
): ExportMediaZipDocumentDownloader {
  return vi.fn(async (asset) => {
    const type = asset.mime ?? "application/octet-stream";
    return new Blob([`${bytes}:${asset.storage.path}`], { type });
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

async function zipTextEntry(blob: Blob, name: string): Promise<string> {
  const zip = await JSZip.loadAsync(blob);
  const entry = zip.file(name);
  if (!entry) throw new Error(`Missing ZIP entry ${name}`);
  return entry.async("string");
}

function mediaEntryNames(fileNames: string[]): string[] {
  return fileNames.filter(
    (name) =>
      !name.endsWith("/manifest.json") &&
      !name.endsWith("/README_ПАКЕТ.txt") &&
      !name.endsWith(".xlsx"),
  );
}

function manifestName(fileNames: string[]): string {
  const name = fileNames.find((candidate) => candidate.endsWith("/manifest.json"));
  if (!name) throw new Error("Missing archive manifest");
  return name;
}

describe("export media mega ZIP", () => {
  test("exports a single applicant from validated document assets", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const result = await createExportMediaZipArtifact(selection, {
      documentAssets: documentAssetsFor(selection),
      downloadDocument: documentDownloader(),
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);
    expect(result.artifact.fileName).toMatch(/^visaflow-export-.+_documents\.zip$/);
    expect(result.artifact.workbookFileName).toMatch(/^visaflow-export-.+\.xlsx$/);
    expect(result.artifact).toMatchObject({
      applicantCount: 1,
      fileCount: 3,
      submissionCount: 1,
    });

    const names = await zipEntryNames(result.artifact.blob);
    expect(names.fileNames).toEqual(
      expect.arrayContaining([
        `${rootFolder}/manifest.json`,
        `${rootFolder}/README_ПАКЕТ.txt`,
        `${rootFolder}/${result.artifact.workbookFileName}`,
      ]),
    );

    expect(mediaEntryNames(names.fileNames)).toEqual(
      expect.arrayContaining([
        `${rootFolder}/Москва/Дмитрий Орлов/660010561_passport_scan.pdf`,
        `${rootFolder}/Москва/Дмитрий Орлов/660010561_selfie_1.jpg`,
        `${rootFolder}/Москва/Дмитрий Орлов/660010561_selfie_2.jpg`,
      ]),
    );
    expect(mediaEntryNames(names.fileNames)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/_visa_form\.pdf$/)]),
    );
  });

  test("normalizes legacy selfie storage rows to selfie_1 in the archive", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const result = await createExportMediaZipArtifact(selection, {
      documentAssets: documentAssetsFor(selection),
      downloadDocument: documentDownloader(),
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);

    const names = await zipEntryNames(result.artifact.blob);
    const mediaNames = mediaEntryNames(names.fileNames);
    expect(mediaNames).toContain(
      `${rootFolder}/Москва/Дмитрий Орлов/660010561_selfie_1.jpg`,
    );
    expect(mediaNames).not.toContain(
      `${rootFolder}/Москва/Дмитрий Орлов/660010561_selfie.jpg`,
    );
  });

  test("keeps a family together with applicant prefixes", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("SUB-1102")));
    const result = await createExportMediaZipArtifact(selection, {
      documentAssets: documentAssetsFor(selection),
      downloadDocument: documentDownloader(),
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);
    expect(result.artifact).toMatchObject({
      applicantCount: 3,
      fileCount: 5,
      submissionCount: 1,
    });

    const names = await zipEntryNames(result.artifact.blob);
    const mediaNames = mediaEntryNames(names.fileNames);
    expect(mediaNames).toHaveLength(5);
    expect(
      mediaNames.every((name) =>
        name.startsWith(`${rootFolder}/Москва/Семья Волковых/`),
      ),
    ).toBe(true);
    expect(mediaNames).toEqual(
      expect.arrayContaining([
        `${rootFolder}/Москва/Семья Волковых/660011021_passport_scan.pdf`,
        `${rootFolder}/Москва/Семья Волковых/660011021_selfie_1.jpg`,
        `${rootFolder}/Москва/Семья Волковых/660011021_selfie_2.jpg`,
        `${rootFolder}/Москва/Семья Волковых/660011022_passport_scan.pdf`,
        `${rootFolder}/Москва/Семья Волковых/660011023_passport_scan.pdf`,
      ]),
    );
    expect(
      mediaNames.some(
        (name) =>
          /(660011022|660011023)_selfie_[12]\.jpg$/.test(name),
      ),
    ).toBe(false);
  });

  test("groups mixed packages by city and submission folder", async () => {
    const selection = generatedSelection(
      withCanonicalStorage(byId("SUB-1101")),
      withCanonicalStorage(byId("SUB-1102")),
    );
    const result = await createExportMediaZipArtifact(selection, {
      documentAssets: documentAssetsFor(selection),
      downloadDocument: documentDownloader(),
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);

    const names = await zipEntryNames(result.artifact.blob);
    const mediaNames = mediaEntryNames(names.fileNames);
    expect(mediaNames).toHaveLength(8);
    expect(mediaNames.some((name) => name.includes("/Ольга Фролова/"))).toBe(true);
    expect(mediaNames.some((name) => name.includes("/Семья Волковых/"))).toBe(true);
  });

  test("keeps ZIP entries and manifest deterministic for reversed input order", async () => {
    const firstSelection = generatedSelection(
      withCanonicalStorage(byId("SUB-1101")),
      withCanonicalStorage(byId("SUB-1102")),
    );
    const secondSelection = generatedSelection(
      withCanonicalStorage(byId("SUB-1102")),
      withCanonicalStorage(byId("SUB-1101")),
    );
    const firstIdentity = identityFor(firstSelection);
    const secondIdentity = identityFor(secondSelection);

    expect(secondIdentity).toEqual(firstIdentity);

    const firstResult = await createExportMediaZipArtifact(firstSelection, {
      documentAssets: documentAssetsFor(firstSelection),
      downloadDocument: documentDownloader(),
      expectedIdentity: firstIdentity,
      exportDate,
    });
    const secondResult = await createExportMediaZipArtifact(secondSelection, {
      documentAssets: documentAssetsFor(secondSelection),
      downloadDocument: documentDownloader(),
      expectedIdentity: secondIdentity,
      exportDate,
    });

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (!firstResult.ok) throw new Error(firstResult.safeMessage);
    if (!secondResult.ok) throw new Error(secondResult.safeMessage);

    const firstNames = await zipEntryNames(firstResult.artifact.blob);
    const secondNames = await zipEntryNames(secondResult.artifact.blob);

    expect(secondNames.fileNames).toEqual(firstNames.fileNames);
    expect(secondNames.directoryNames).toEqual(firstNames.directoryNames);
    expect(
      await zipTextEntry(
        secondResult.artifact.blob,
        manifestName(secondNames.fileNames),
      ),
    ).toEqual(
      await zipTextEntry(firstResult.artifact.blob, manifestName(firstNames.fileNames)),
    );
  });

  test("blocks export when there is no Supabase-backed document source", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const result = await createExportMediaZipArtifact(selection, {
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result).toMatchObject({ ok: false, reason: "storage_unavailable" });
  });

  test("uses document repository assets and maps ZIP facts into the terminal RPC contract", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const assets = documentAssetsFor(selection);
    const repository = {
      getReadyForExport: vi.fn(async () => assets),
    };

    const result = await createExportMediaZipArtifact(selection, {
      documentRepository: repository,
      downloadDocument: documentDownloader(),
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);
    expect(repository.getReadyForExport).toHaveBeenCalledWith([selection[0]!.id]);
    expect(toExportPackageDocumentCommit(result.artifact)).toEqual({
      applicantCount: 1,
      assetIds: result.artifact.documentAssetIds,
      fileCount: 3,
      workbookFileName: result.artifact.workbookFileName,
      zipFileName: result.artifact.fileName,
    });
  });

  test("blocks packages with missing required documents before touching storage", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const downloadDocument = documentDownloader();
    const assets = documentAssetsFor(selection).filter(
      (asset) => asset.type !== "selfie_2",
    );

    const result = await createExportMediaZipArtifact(selection, {
      documentAssets: assets,
      downloadDocument,
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result).toMatchObject({ ok: false, reason: "media_not_ready" });
    expect(downloadDocument).not.toHaveBeenCalled();
  });

  test("blocks non-validated documents before touching storage", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const downloadDocument = documentDownloader();
    const assets = documentAssetsFor(selection).map((asset, index) =>
      index === 0 ? { ...asset, validationStatus: "pending" as const } : asset,
    );

    const result = await createExportMediaZipArtifact(selection, {
      documentAssets: assets,
      downloadDocument,
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result).toMatchObject({ ok: false, reason: "media_not_ready" });
    expect(downloadDocument).not.toHaveBeenCalled();
  });

  test("blocks wrong storage identity before starting browser download", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const brokenAssets = documentAssetsFor(selection).map((asset, index) =>
      index === 0
        ? { ...asset, storage: { ...asset.storage, bucket: "public" as never } }
        : asset,
    );
    const createObjectURL = vi.fn();
    const originalUrl = globalThis.URL;

    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
    });

    try {
      const result = await downloadExportMediaZip(selection, identityFor(selection), {
        documentAssets: brokenAssets,
        downloadDocument: documentDownloader(),
        exportDate,
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
    const brokenAssets = documentAssetsFor(selection).map((asset, index) =>
      index === 0
        ? {
            ...asset,
            storage: {
              ...asset.storage,
              path: asset.storage.path.replace(
                `/applicants/${asset.applicantId}/`,
                "/applicants/other-applicant/",
              ),
            },
          }
        : asset,
    );
    const createObjectURL = vi.fn();
    const originalUrl = globalThis.URL;

    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
    });

    try {
      const result = await downloadExportMediaZip(selection, identityFor(selection), {
        documentAssets: brokenAssets,
        downloadDocument: documentDownloader(),
        exportDate,
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
        documentAssets: documentAssetsFor(selection),
        downloadDocument: vi.fn(async () => new Blob([])),
        exportDate,
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
    const downloadDocument = documentDownloader();

    const result = await createExportMediaZipArtifact(stale, {
      documentAssets: documentAssetsFor(selection),
      downloadDocument,
      expectedIdentity: identityFor(selection),
      exportDate,
    });

    expect(result).toMatchObject({ ok: false, reason: "export_not_ready" });
    expect(downloadDocument).not.toHaveBeenCalled();
  });
});
