import JSZip from "jszip";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildExportPackageIdentity,
} from "../../src/modules/submissions/exportRules";
import {
  createExportMediaZipArtifact,
  default as downloadExportMediaZip,
  type ExportMediaZipDownloader,
} from "../../src/modules/submissions/exportMediaZip";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  clearSubmissions,
  loadSubmissions,
  saveSubmissions,
} from "../../src/modules/submissions/persistence";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import { mediaStorageBucket } from "../../src/modules/submissions/mediaStorage";
import type {
  Submission,
  SubmissionFile,
} from "../../src/modules/submissions/types";

const canonicalTypes = ["passport_scan", "selfie", "selfie_2"] as const;
let storageMap: Map<string, string> | null = null;

function installLocalStorage() {
  storageMap = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storageMap?.get(key) ?? null,
      removeItem: (key: string) => storageMap?.delete(key),
      setItem: (key: string, value: string) => storageMap?.set(key, value),
    },
  });
}

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

function withApplicantPassport(
  submission: Submission,
  passportNumber: string,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant, applicantIndex) =>
      applicantIndex === 0
        ? {
            ...applicant,
            sections: applicant.sections.map((section) => ({
              ...section,
              fields: section.fields.map((field) =>
                field.id === "passport-no"
                  ? { ...field, value: passportNumber }
                  : field,
              ),
            })),
          }
        : applicant,
    ),
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

async function zipTextEntry(blob: Blob, name: string): Promise<string> {
  const zip = await JSZip.loadAsync(blob);
  const entry = zip.file(name);
  if (!entry) throw new Error(`Missing ZIP entry ${name}`);
  return entry.async("string");
}

function mediaEntryNames(fileNames: string[]): string[] {
  return fileNames.filter(
    (name) =>
      name !== "manifest.json" &&
      name !== "README_ПАКЕТ.txt" &&
      !name.endsWith(".xlsx"),
  );
}

describe("export media mega ZIP", () => {
  afterEach(() => {
    if (storageMap) {
      clearSubmissions();
      storageMap = null;
    }
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test("puts a single applicant under the applicants folder", async () => {
    const selection = generatedSelection(withCanonicalStorage(byId("ПД-1056")));
    const result = await createExportMediaZipArtifact(selection, {
      downloadMedia: downloader(),
      expectedIdentity: identityFor(selection),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);
    expect(result.artifact.fileName).toMatch(/^visaflow-export-.+\.zip$/);
    expect(result.artifact.workbookFileName).toMatch(/^visaflow-export-.+\.xlsx$/);
    expect(result.artifact).toMatchObject({
      applicantCount: 1,
      fileCount: 3,
      submissionCount: 1,
    });

    const names = await zipEntryNames(result.artifact.blob);
    const mediaNames = mediaEntryNames(names.fileNames);
    expect(names.fileNames).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "README_ПАКЕТ.txt",
        result.artifact.workbookFileName,
      ]),
    );
    expect(names.directoryNames).toEqual(
      expect.arrayContaining(["Москва/01_Семьи/", "Москва/02_Заявители/"]),
    );
    expect(mediaNames).toHaveLength(3);
    expect(mediaNames).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^Москва\/02_Заявители\/01_ПД-1056_.+\/01_.+\/missing-passport_passport_scan_.+\.pdf$/,
        ),
        expect.stringMatching(/^Москва\/02_Заявители\/01_ПД-1056_.+\/01_.+\/missing-passport_selfie_.+\.jpg$/),
        expect.stringMatching(
          /^Москва\/02_Заявители\/01_ПД-1056_.+\/01_.+\/missing-passport_selfie_2_.+\.jpg$/,
        ),
      ]),
    );
  });

  test("uses passport number in applicant media filenames when available", async () => {
    const selection = generatedSelection(
      withCanonicalStorage(withApplicantPassport(byId("ПД-1056"), "669308614")),
    );
    const result = await createExportMediaZipArtifact(selection, {
      downloadMedia: downloader(),
      expectedIdentity: identityFor(selection),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);

    const names = await zipEntryNames(result.artifact.blob);
    const mediaNames = mediaEntryNames(names.fileNames);

    expect(mediaNames).toHaveLength(3);
    expect(mediaNames.every((name) => name.includes("/669308614_"))).toBe(true);
    expect(mediaNames).toEqual(
      expect.arrayContaining([
        expect.stringContaining("669308614_passport_scan_"),
        expect.stringContaining("669308614_selfie_"),
        expect.stringContaining("669308614_selfie_2_"),
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
      expect.arrayContaining(["Москва/01_Семьи/", "Москва/02_Заявители/"]),
    );
    const mediaNames = mediaEntryNames(names.fileNames);
    expect(names.fileNames).toContain(result.artifact.workbookFileName);
    expect(mediaNames).toHaveLength(9);
    expect(
      mediaNames.every((name) => name.startsWith("Москва/01_Семьи/01_SUB-1102_")),
    ).toBe(true);
    expect(new Set(mediaNames.map((name) => name.split("/")[3])).size).toBe(3);
    expect(
      mediaNames.filter((name) => /\/(?:\d+|missing-passport)_selfie_2_.+\.jpg$/.test(name)),
    ).toHaveLength(3);
  });

  test("downloads the local demo family package for three different applicants", async () => {
    const selection = generatedSelection(byId("SUB-1102"));
    const result = await createExportMediaZipArtifact(selection, {
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
    const mediaNames = mediaEntryNames(names.fileNames);
    expect(names.fileNames).toContain(result.artifact.workbookFileName);
    expect(mediaNames).toHaveLength(9);
    expect(
      mediaNames.every((name) => name.startsWith("Москва/01_Семьи/01_SUB-1102_")),
    ).toBe(true);
    expect(new Set(mediaNames.map((name) => name.split("/")[3])).size).toBe(3);
  });

  test("migrates saved local demo family media identity for browser rechecks", async () => {
    installLocalStorage();
    const staleFamily = {
      ...byId("SUB-1102"),
      files: byId("SUB-1102").files.map((file) => ({
        ...file,
        generatedFileName: undefined,
        storageBucket: undefined,
        storagePath: undefined,
      })),
    };
    saveSubmissions([staleFamily]);

    const loadedFamily = loadSubmissions()[0] as Submission;
    const selection = generatedSelection(loadedFamily);
    const result = await createExportMediaZipArtifact(selection, {
      expectedIdentity: identityFor(selection),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.safeMessage);
    expect(result.artifact).toMatchObject({
      applicantCount: 3,
      fileCount: 9,
      submissionCount: 1,
    });
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
    const mediaNames = mediaEntryNames(names.fileNames);
    expect(names.fileNames).toContain(result.artifact.workbookFileName);
    expect(mediaNames).toHaveLength(12);
    expect(mediaNames.some((name) => name.startsWith("Москва/02_Заявители/"))).toBe(true);
    expect(mediaNames.some((name) => name.startsWith("Москва/01_Семьи/"))).toBe(true);
    expect(
      mediaNames.filter((name) => name.startsWith("Москва/02_Заявители/")),
    ).toHaveLength(3);
    expect(mediaNames.filter((name) => name.startsWith("Москва/01_Семьи/"))).toHaveLength(
      9,
    );
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
      downloadMedia: downloader(),
      expectedIdentity: firstIdentity,
    });
    const secondResult = await createExportMediaZipArtifact(secondSelection, {
      downloadMedia: downloader(),
      expectedIdentity: secondIdentity,
    });

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (!firstResult.ok) throw new Error(firstResult.safeMessage);
    if (!secondResult.ok) throw new Error(secondResult.safeMessage);

    const firstNames = await zipEntryNames(firstResult.artifact.blob);
    const secondNames = await zipEntryNames(secondResult.artifact.blob);

    expect(secondNames.fileNames).toEqual(firstNames.fileNames);
    expect(secondNames.directoryNames).toEqual(firstNames.directoryNames);
    expect(await zipTextEntry(secondResult.artifact.blob, "manifest.json")).toEqual(
      await zipTextEntry(firstResult.artifact.blob, "manifest.json"),
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
