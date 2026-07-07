import JSZip from "jszip";
import {
  CANONICAL_FRONTEND_MEDIA_TYPES,
  type CanonicalFrontendMediaType,
} from "./domainContract";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  orderSubmissionsForExportPackage,
  exportSummary,
} from "./exportRules";
import { createExportWorkbookArtifact } from "./exportWorkbook";
import { buildApplicantDocumentFileName } from "./filenamePolicy";
import {
  downloadMediaFromStorage,
  mediaStorageBucket,
  validateMediaStorageTarget,
  type MediaStorageTarget,
} from "./mediaStorage";
import type { Applicant, ExportPackageIdentity, Submission, SubmissionFile } from "./types";

export type ExportMediaZipBlockedReason =
  | "download_failed"
  | "empty_file"
  | "export_not_ready"
  | "media_not_ready"
  | "row_mismatch"
  | "storage_download_failed"
  | "storage_unavailable"
  | "zip_failed";

export type ExportMediaZipResult =
  | {
      ok: true;
      applicantCount: number;
      fileCount: number;
      fileName: string;
      submissionCount: number;
    }
  | {
      ok: false;
      reason: ExportMediaZipBlockedReason;
      safeMessage: string;
    };

export type ExportMediaZipArtifact = {
  applicantCount: number;
  blob: Blob;
  contentType: "application/zip";
  fileCount: number;
  fileName: string;
  packageIdentity: ExportPackageIdentity;
  submissionCount: number;
  workbookFileName: string;
};

export type ExportMediaZipArtifactResult =
  | { ok: true; artifact: ExportMediaZipArtifact }
  | {
      ok: false;
      reason: ExportMediaZipBlockedReason;
      safeMessage: string;
    };

export type ExportMediaZipDownloader = (
  target: MediaStorageTarget,
  file: SubmissionFile,
  context: {
    applicant: Applicant;
    submission: Submission;
    type: CanonicalFrontendMediaType;
  },
) => Promise<Blob | null>;

type BrowserDownloadRuntime = typeof globalThis & {
  URL: {
    createObjectURL(blob: Blob): string;
    revokeObjectURL(url: string): void;
  };
  document: {
    body: { append(node: unknown): void };
    createElement(tagName: "a"): {
      click(): void;
      download: string;
      href: string;
      rel: string;
      remove(): void;
    };
  };
  setTimeout(callback: () => void, timeout: number): unknown;
};

type ArchiveGroup = "family" | "single";

const archiveSectionFolders: Record<ArchiveGroup, string> = {
  family: "01_Семьи",
  single: "02_Заявители",
};

export function canDownloadExportMediaZip(submissions: Submission[]): boolean {
  const summary = exportSummary(submissions);
  return (
    summary.ready &&
    (summary.exportState === "file_generated" ||
      summary.exportState === "file_downloaded")
  );
}

export async function prepareExportMediaZip(
  submissions: Submission[],
  expectedIdentity: ExportPackageIdentity | null,
  options: { downloadMedia?: ExportMediaZipDownloader } = {},
): Promise<ExportMediaZipArtifactResult> {
  return createExportMediaZipArtifact(submissions, {
    downloadMedia: options.downloadMedia,
    expectedIdentity,
  });
}

export async function createExportMediaZipArtifact(
  submissions: Submission[],
  options: {
    downloadMedia?: ExportMediaZipDownloader;
    expectedIdentity?: ExportPackageIdentity | null;
  } = {},
): Promise<ExportMediaZipArtifactResult> {
  const identityResult = validateExportMediaZipIdentity(
    submissions,
    options.expectedIdentity,
  );
  if (!identityResult.ok) return identityResult;

  const downloadMedia = options.downloadMedia ?? defaultDownloadMedia;
  const orderedSubmissions = orderSubmissionsForExportPackage(submissions);
  const outerZip = new JSZip();
  const cityIndexes = new Map<string, Record<ArchiveGroup, number>>();
  let applicantCount = 0;
  let fileCount = 0;

  try {
    const summary = exportSummary(submissions);
    const workbookArtifact = createExportWorkbookArtifact(
      summary.rows,
      identityResult.identity,
    );
    outerZip.file(workbookArtifact.fileName, workbookArtifact.blob);

    for (const submission of orderedSubmissions) {
      const cityFolder = safeArchiveName(submission.city, "city");
      const group = archiveGroupForSubmission(submission);
      const counters = ensureCityCounters(cityIndexes, cityFolder);
      counters[group] += 1;

      outerZip.folder(`${cityFolder}/${archiveSectionFolders.family}`);
      outerZip.folder(`${cityFolder}/${archiveSectionFolders.single}`);

      const submissionFolder = `${cityFolder}/${archiveSectionFolders[group]}/${numberPrefix(
        counters[group],
      )}_${safeArchiveName(`${submission.id}_${submission.title}`, "submission")}`;

      for (const [applicantIndex, applicant] of submission.applicants.entries()) {
        const applicantFolder = `${submissionFolder}/${numberPrefix(
          applicantIndex + 1,
        )}_${safeArchiveName(applicant.fullName, "applicant")}`;

        for (const type of CANONICAL_FRONTEND_MEDIA_TYPES) {
          const prepared = prepareMediaFile(submission, applicant, type);
          if (!prepared.ok) return prepared;

          let blob: Blob | null;
          try {
            blob = await downloadMedia(prepared.target, prepared.file, {
              applicant,
              submission,
              type,
            });
          } catch {
            return blocked(
              "storage_download_failed",
              "Не удалось скачать файлы из приватного хранилища. Повторите после синхронизации.",
            );
          }

          if (!blob) {
            return blocked(
              "storage_unavailable",
              "Приватное хранилище недоступно. ZIP можно собрать только из реальных файлов Supabase.",
            );
          }
          if (blob.size <= 0) {
            return blocked(
              "empty_file",
              "В приватном хранилище найден пустой файл. ZIP не сформирован.",
            );
          }

          outerZip.file(
            `${applicantFolder}/${archiveMediaFileName(type, prepared.file, applicant)}`,
            blob,
          );
          fileCount += 1;
        }
        applicantCount += 1;
      }
    }

    outerZip.file(
      "manifest.json",
      JSON.stringify(
        buildArchiveManifest(orderedSubmissions, identityResult.identity, {
          applicantCount,
          fileCount,
          workbookFileName: workbookArtifact.fileName,
        }),
        null,
        2,
      ),
    );
    outerZip.file(
      "README_ПАКЕТ.txt",
      [
        "Visaflow export package",
        `Submissions: ${orderedSubmissions.length}`,
        `Applicants: ${applicantCount}`,
        `Media files: ${fileCount}`,
        `Workbook: ${workbookArtifact.fileName}`,
        "Required files per applicant: passport_scan, selfie, selfie_2",
        "Archive structure: city / families first / single applicants second.",
      ].join("\n"),
    );

    const blob = await outerZip.generateAsync({
      compression: "DEFLATE",
      type: "blob",
    });

    return {
      ok: true,
      artifact: {
        applicantCount,
        blob,
        contentType: "application/zip",
        fileCount,
        fileName: `visaflow-export-${identityResult.identity.idempotencyKey}.zip`,
        packageIdentity: identityResult.identity,
        submissionCount: orderedSubmissions.length,
        workbookFileName: workbookArtifact.fileName,
      },
    };
  } catch {
    return blocked("zip_failed", "Не удалось сформировать ZIP-файл.");
  }
}

export function downloadPreparedExportMediaZip(
  artifact: ExportMediaZipArtifact,
): ExportMediaZipResult {
  const runtime = globalThis as BrowserDownloadRuntime;
  let url = "";

  try {
    url = runtime.URL.createObjectURL(artifact.blob);
    const link = runtime.document.createElement("a");
    link.href = url;
    link.download = artifact.fileName;
    link.rel = "noopener";
    runtime.document.body.append(link);
    link.click();
    link.remove();
    runtime.setTimeout(() => runtime.URL.revokeObjectURL(url), 0);
    return {
      ok: true,
      applicantCount: artifact.applicantCount,
      fileCount: artifact.fileCount,
      fileName: artifact.fileName,
      submissionCount: artifact.submissionCount,
    };
  } catch {
    if (url) runtime.URL.revokeObjectURL(url);
    return blocked("download_failed", "Не удалось скачать ZIP-файл. Повторите попытку.");
  }
}

export default async function downloadExportMediaZip(
  submissions: Submission[],
  expectedIdentity: ExportPackageIdentity | null,
  options: { downloadMedia?: ExportMediaZipDownloader } = {},
): Promise<ExportMediaZipResult> {
  const artifactResult = await prepareExportMediaZip(submissions, expectedIdentity, {
    downloadMedia: options.downloadMedia,
  });
  if (!artifactResult.ok) return artifactResult;

  return downloadPreparedExportMediaZip(artifactResult.artifact);
}

function validateExportMediaZipIdentity(
  submissions: Submission[],
  expectedIdentity: ExportPackageIdentity | null = null,
):
  | { ok: true; identity: ExportPackageIdentity }
  | {
      ok: false;
      reason: ExportMediaZipBlockedReason;
      safeMessage: string;
    } {
  if (!canDownloadExportMediaZip(submissions)) {
    return blocked(
      "export_not_ready",
      "Сначала сформируйте Excel для текущей выборки, затем скачайте ZIP файлов.",
    );
  }

  const identity = buildExportPackageIdentity(submissions);
  if (!identity || !expectedIdentity) {
    return blocked(
      "export_not_ready",
      "Пакет выгрузки не зафиксирован. Сформируйте Excel заново.",
    );
  }
  if (!exportPackageIdentityMatches(identity, expectedIdentity)) {
    return blocked(
      "row_mismatch",
      "Выбор изменился. Сформируйте Excel заново перед скачиванием ZIP.",
    );
  }
  if (
    !submissions.every(
      (submission) =>
        submission.exportPackage &&
        exportPackageIdentityMatches(identity, submission.exportPackage),
    )
  ) {
    return blocked(
      "row_mismatch",
      "Состав пакета изменился. Сформируйте Excel заново перед скачиванием ZIP.",
    );
  }

  return { ok: true, identity };
}

function prepareMediaFile(
  submission: Submission,
  applicant: Applicant,
  type: CanonicalFrontendMediaType,
):
  | { ok: true; file: SubmissionFile; target: MediaStorageTarget }
  | {
      ok: false;
      reason: ExportMediaZipBlockedReason;
      safeMessage: string;
    } {
  const file = submission.files.find(
    (candidate) => candidate.applicantId === applicant.id && candidate.type === type,
  );
  if (!file || file.status !== "accepted") {
    return blocked(
      "media_not_ready",
      "В выбранном пакете не все обязательные файлы приняты администратором.",
    );
  }
  if (
    file.storageBucket !== mediaStorageBucket ||
    !file.storagePath ||
    !file.generatedFileName
  ) {
    return blocked(
      "media_not_ready",
      "В выбранном пакете есть файлы без канонического private storage identity.",
    );
  }

  const expectedPath = `submissions/${submission.id}/applicants/${applicant.id}/${type}/${file.generatedFileName}`;
  if (file.storagePath !== expectedPath) {
    return blocked(
      "media_not_ready",
      "В выбранном пакете есть файлы с устаревшим storage path.",
    );
  }

  const target: MediaStorageTarget = {
    bucket: mediaStorageBucket,
    path: file.storagePath,
  };
  try {
    validateMediaStorageTarget({ target });
  } catch {
    return blocked(
      "media_not_ready",
      "В выбранном пакете есть файлы с невалидным private storage path.",
    );
  }

  return { ok: true, file, target };
}

async function defaultDownloadMedia(target: MediaStorageTarget): Promise<Blob | null> {
  return downloadMediaFromStorage(target);
}

function archiveGroupForSubmission(submission: Submission): ArchiveGroup {
  return submission.type === "family" ? "family" : "single";
}

function ensureCityCounters(
  cityIndexes: Map<string, Record<ArchiveGroup, number>>,
  cityFolder: string,
): Record<ArchiveGroup, number> {
  const existing = cityIndexes.get(cityFolder);
  if (existing) return existing;

  const counters = { family: 0, single: 0 };
  cityIndexes.set(cityFolder, counters);
  return counters;
}

function archiveMediaFileName(
  type: CanonicalFrontendMediaType,
  file: SubmissionFile,
  applicant: Applicant,
): string {
  return buildApplicantDocumentFileName({
    applicant,
    documentType: type,
    extension: fileExtension(file),
  });
}

function fileExtension(file: SubmissionFile): string {
  const fileName = file.generatedFileName ?? file.originalFileName ?? "";
  const extension = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension) return extension;
  if (file.mimeType === "application/pdf") return "pdf";
  if (file.mimeType === "image/png") return "png";
  if (file.mimeType === "image/heic") return "heic";
  if (file.mimeType === "image/heif") return "heif";
  return "jpg";
}

function safeArchiveName(value: string, fallback: string): string {
  const safe = value
    .normalize("NFKC")
    .split("")
    .map(replaceUnsafeArchiveCharacter)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
  return safe || fallback;
}

function replaceUnsafeArchiveCharacter(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint < 32) return "_";
  return /[\\/:*?"<>|]/.test(character) ? "_" : character;
}

function numberPrefix(value: number): string {
  return String(value).padStart(2, "0");
}

function buildArchiveManifest(
  submissions: Submission[],
  identity: ExportPackageIdentity,
  counts: { applicantCount: number; fileCount: number; workbookFileName: string },
) {
  return {
    applicantCount: counts.applicantCount,
    fileCount: counts.fileCount,
    package: identity,
    requiredMediaTypes: CANONICAL_FRONTEND_MEDIA_TYPES,
    workbookFileName: counts.workbookFileName,
    submissions: submissions.map((submission) => ({
      applicants: submission.applicants.map((applicant) => ({
        id: applicant.id,
        mediaTypes: CANONICAL_FRONTEND_MEDIA_TYPES,
        name: applicant.fullName,
      })),
      city: submission.city,
      id: submission.id,
      title: submission.title,
      type: submission.type,
    })),
  };
}

function blocked(reason: ExportMediaZipBlockedReason, safeMessage: string) {
  return { ok: false as const, reason, safeMessage };
}
