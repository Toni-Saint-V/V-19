import JSZip from "jszip";
import { DocumentRepository } from "../documents/documentRepository";
import {
  buildDocumentsZip,
  DocumentZipBuilderError,
  EXPORT_DOCUMENT_TYPES,
  type DocumentZipDownloader,
} from "../documents/documentExport";
import {
  documentTypeToFrontendMediaType,
  tryNormalizeDocumentType,
  type DocumentAsset,
} from "../documents/documentTypes";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  orderSubmissionsForExportPackage,
  exportSummary,
} from "./exportRules";
import type { ExportPackageDocumentCommit } from "./exportPackageDocumentCommit";
import { createExportWorkbookArtifact } from "./exportWorkbook";
import { createVisaApplicationFormPdfBlob } from "./visaApplicationFormPdf";
import {
  downloadMediaFromStorage,
  mediaStorageBucket,
  type MediaStorageTarget,
} from "./mediaStorage";
import type {
  Applicant,
  ExportPackageIdentity,
  Submission,
  SubmissionFile,
} from "./types";

export type ExportMediaZipBlockedReason =
  | "audit_failed"
  | "download_failed"
  | "empty_file"
  | "export_not_ready"
  | "media_not_ready"
  | "passport_number_missing"
  | "questionnaire_incomplete"
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
  documentAssetIds: string[];
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
    type: "passport_scan" | "selfie" | "selfie_2";
  },
) => Promise<Blob | null>;

export type ExportMediaZipDocumentDownloader = DocumentZipDownloader;

type DocumentExportRepository = Pick<DocumentRepository, "getReadyForExport">;

export type ExportMediaZipOptions = {
  documentAssets?: DocumentAsset[];
  documentRepository?: DocumentExportRepository;
  downloadDocument?: ExportMediaZipDocumentDownloader;
  downloadMedia?: ExportMediaZipDownloader;
  expectedIdentity?: ExportPackageIdentity | null;
  exportDate?: Date | string;
};

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
  options: Omit<ExportMediaZipOptions, "expectedIdentity"> = {},
): Promise<ExportMediaZipArtifactResult> {
  return createExportMediaZipArtifact(submissions, {
    ...options,
    expectedIdentity,
  });
}

export async function createExportMediaZipArtifact(
  submissions: Submission[],
  options: ExportMediaZipOptions = {},
): Promise<ExportMediaZipArtifactResult> {
  const identityResult = validateExportMediaZipIdentity(
    submissions,
    options.expectedIdentity,
  );
  if (!identityResult.ok) return identityResult;

  const orderedSubmissions = orderSubmissionsForExportPackage(submissions);
  const documentAssetsResult = await resolveDocumentAssetsForZip(
    orderedSubmissions,
    options,
  );
  if (!documentAssetsResult.ok) return documentAssetsResult;

  const downloadAsset = documentDownloaderForOptions(
    orderedSubmissions,
    options,
  );
  const outerZip = new JSZip();

  try {
    const summary = exportSummary(submissions);
    const workbookArtifact = createExportWorkbookArtifact(
      summary.rows,
      identityResult.identity,
    );

    const documents = await buildDocumentsZip({
      assets: documentAssetsResult.assets,
      downloadAsset,
      exportDate: options.exportDate,
      submissions: orderedSubmissions,
      zip: outerZip,
    });

    outerZip.file(
      `${documents.rootFolder}/${workbookArtifact.fileName}`,
      await workbookArtifact.blob.arrayBuffer(),
    );
    outerZip.file(
      `${documents.rootFolder}/manifest.json`,
      JSON.stringify(
        buildArchiveManifest(orderedSubmissions, identityResult.identity, {
          applicantCount: documents.applicantCount,
          documentEntries: documents.entries,
          fileCount: documents.fileCount,
          rootFolder: documents.rootFolder,
          workbookFileName: workbookArtifact.fileName,
        }),
        null,
        2,
      ),
    );
    outerZip.file(
      `${documents.rootFolder}/README_ПАКЕТ.txt`,
      [
        "VisaFlow export package",
        `Submissions: ${orderedSubmissions.length}`,
        `Applicants: ${documents.applicantCount}`,
        `Document files: ${documents.fileCount}`,
        `Workbook: ${workbookArtifact.fileName}`,
        "Required files per applicant: passport_scan, selfie_1, selfie_2",
        "Archive structure: VisaFlow_Export_YYYY-MM-DD / city / family-or-applicant / documents.",
      ].join("\n"),
    );

    const blob = await outerZip.generateAsync({
      compression: "DEFLATE",
      type: "blob",
    });

    const artifact: ExportMediaZipArtifact = {
      applicantCount: documents.applicantCount,
      blob,
      contentType: "application/zip",
      documentAssetIds: documents.documentAssetIds,
      fileCount: documents.fileCount,
      fileName: `visaflow-export-${identityResult.identity.idempotencyKey}_documents.zip`,
      packageIdentity: identityResult.identity,
      submissionCount: orderedSubmissions.length,
      workbookFileName: workbookArtifact.fileName,
    };

    return { ok: true, artifact };
  } catch (error) {
    if (error instanceof DocumentZipBuilderError) {
      return blocked(
        error.reason,
        safeMessageForDocumentZipError(error.reason),
      );
    }
    return blocked("zip_failed", "Не удалось сформировать ZIP-файл.");
  }
}

export function toExportPackageDocumentCommit(
  artifact: ExportMediaZipArtifact,
): ExportPackageDocumentCommit {
  return {
    applicantCount: artifact.applicantCount,
    assetIds: [...artifact.documentAssetIds],
    fileCount: artifact.fileCount,
    workbookFileName: artifact.workbookFileName,
    zipFileName: artifact.fileName,
  };
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
    return blocked(
      "download_failed",
      "Не удалось скачать ZIP-файл. Повторите попытку.",
    );
  }
}

export default async function downloadExportMediaZip(
  submissions: Submission[],
  expectedIdentity: ExportPackageIdentity | null,
  options: Omit<ExportMediaZipOptions, "expectedIdentity"> = {},
): Promise<ExportMediaZipResult> {
  const artifactResult = await prepareExportMediaZip(
    submissions,
    expectedIdentity,
    options,
  );
  if (!artifactResult.ok) return artifactResult;
  const downloadResult = downloadPreparedExportMediaZip(artifactResult.artifact);
  if (!downloadResult.ok) return downloadResult;
  return downloadResult;
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

async function resolveDocumentAssetsForZip(
  submissions: Submission[],
  options: ExportMediaZipOptions,
): Promise<
  | {
      ok: true;
      assets: DocumentAsset[];
    }
  | { ok: false; reason: ExportMediaZipBlockedReason; safeMessage: string }
> {
  const submissionIds = submissions.map((submission) => submission.id);
  const submissionIdSet = new Set(submissionIds);

  if (options.documentAssets) {
    return {
      ok: true,
      assets: options.documentAssets.filter((asset) =>
        submissionIdSet.has(asset.submissionId),
      ),
    };
  }

  if (options.downloadMedia) {
    return {
      ok: true,
      assets: documentAssetsFromSubmissionFiles(submissions),
    };
  }

  const repository =
    options.documentRepository ?? DocumentRepository.optional();
  if (!repository) {
    return blocked(
      "storage_unavailable",
      "Приватное хранилище недоступно. ZIP можно собрать только из реальных файлов Supabase.",
    );
  }

  try {
    const assets = await repository.getReadyForExport(submissionIds);
    return { ok: true, assets };
  } catch {
    return blocked(
      "storage_unavailable",
      "Не удалось получить проверенные документы из базы. ZIP не сформирован.",
    );
  }
}

function documentDownloaderForOptions(
  submissions: Submission[],
  options: ExportMediaZipOptions,
): DocumentZipDownloader {
  if (options.downloadDocument) return options.downloadDocument;

  if (options.downloadMedia) {
    const legacyDownload = options.downloadMedia;
    return async (asset, context) => {
      if (asset.type === "visa_form") {
        return createVisaApplicationFormPdfBlob(
          context.submission,
          context.applicant,
        );
      }

      const frontendType = documentTypeToFrontendMediaType(asset.type);
      const file = submissions
        .find((submission) => submission.id === asset.submissionId)
        ?.files.find(
          (candidate) =>
            candidate.applicantId === asset.applicantId &&
            candidate.type === frontendType &&
            candidate.storagePath === asset.storage.path,
        );

      if (!file) {
        throw new Error("Document asset has no matching legacy media file.");
      }

      return legacyDownload(
        { bucket: mediaStorageBucket, path: asset.storage.path },
        file,
        {
          applicant: context.applicant,
          submission: context.submission,
          type: frontendType,
        },
      );
    };
  }

  return async (asset, context) => {
    if (asset.type === "visa_form") {
      return createVisaApplicationFormPdfBlob(
        context.submission,
        context.applicant,
      );
    }

    return downloadMediaFromStorage({
      bucket: mediaStorageBucket,
      path: asset.storage.path,
    });
  };
}

function documentAssetsFromSubmissionFiles(
  submissions: Submission[],
): DocumentAsset[] {
  const now = "1970-01-01T00:00:00.000Z";
  return submissions.flatMap((submission) =>
    submission.files.flatMap((file) => {
      const type = tryNormalizeDocumentType(file.type);
      if (
        !type ||
        file.storageBucket !== mediaStorageBucket ||
        !file.storagePath
      ) {
        return [];
      }

      const filename =
        file.generatedFileName ??
        file.storagePath.split("/").filter(Boolean).at(-1) ??
        null;

      return [
        {
          id: file.id,
          sourceMediaAssetId: file.id,
          submissionId: submission.id,
          applicantId: file.applicantId,
          ownerUserId: submission.agentId,
          type,
          storage: {
            bucket: mediaStorageBucket,
            path: file.storagePath,
            filename,
          },
          uploadStatus: "uploaded" as const,
          validationStatus:
            file.status === "accepted"
              ? ("passed" as const)
              : ("pending" as const),
          exportStatus:
            file.status === "accepted"
              ? ("ready" as const)
              : ("not_ready" as const),
          mime:
            file.mimeType ??
            (type === "passport_scan" ? "application/pdf" : "image/jpeg"),
          size: file.sizeBytes ?? 1,
          checksum: null,
          uploadedAt: file.uploadedAtIso ?? now,
          validatedAt: file.reviewedAtIso ?? null,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }),
  );
}

function buildArchiveManifest(
  submissions: Submission[],
  identity: ExportPackageIdentity,
  counts: {
    applicantCount: number;
    documentEntries: string[];
    fileCount: number;
    rootFolder: string;
    workbookFileName: string;
  },
) {
  return {
    applicantCount: counts.applicantCount,
    documentEntries: counts.documentEntries,
    fileCount: counts.fileCount,
    package: identity,
    requiredDocumentTypes: EXPORT_DOCUMENT_TYPES,
    rootFolder: counts.rootFolder,
    workbookFileName: counts.workbookFileName,
    submissions: submissions.map((submission) => ({
      applicants: submission.applicants.map((applicant) => ({
        id: applicant.id,
        documentTypes: EXPORT_DOCUMENT_TYPES,
        name: applicant.fullName,
      })),
      city: submission.city,
      id: submission.id,
      title: submission.title,
      type: submission.type,
    })),
  };
}

function safeMessageForDocumentZipError(
  reason: ExportMediaZipBlockedReason,
): string {
  if (reason === "empty_file") {
    return "В приватном хранилище найден пустой файл. ZIP не сформирован.";
  }
  if (reason === "storage_download_failed") {
    return "Не удалось скачать файлы из приватного хранилища. Повторите после синхронизации.";
  }
  if (reason === "storage_unavailable") {
    return "Приватное хранилище недоступно. ZIP можно собрать только из реальных файлов Supabase.";
  }
  if (reason === "passport_number_missing") {
    return "У каждого заявителя должен быть проверенный номер паспорта. ZIP не сформирован.";
  }
  if (reason === "questionnaire_incomplete") {
    return "В анкете не заполнены обязательные данные для PDF. ZIP не сформирован.";
  }
  return "В выбранном пакете не все обязательные документы прошли проверку.";
}

function blocked(reason: ExportMediaZipBlockedReason, safeMessage: string) {
  return { ok: false as const, reason, safeMessage };
}
