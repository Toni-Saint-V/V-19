import JSZip from "jszip";
import { DocumentRepository } from "../documents/documentRepository";
import {
  buildDocumentsZip,
  DocumentZipBuilderError,
  EXPORT_DOCUMENT_TYPES,
  type DocumentZipDownloader,
} from "../documents/documentExport";
import {
  DOCUMENT_TYPES,
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
import {
  createVisaApplicationFormPdfBlob,
  validateVisaApplicationFormData,
  visaApplicationFormValidationMessage,
} from "./visaApplicationFormPdf";
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

export type ExportMediaZipAuditResult =
  | { ok: true }
  | {
      ok: false;
      reason: "audit_failed";
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

  const downloadAsset = documentDownloaderForOptions(orderedSubmissions, options);
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
          documentAssetIds: documents.documentAssetIds,
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

    const audit = await auditExportMediaZipArtifact(artifact);
    if (!audit.ok) return audit;

    return { ok: true, artifact };
  } catch (error) {
    if (error instanceof DocumentZipBuilderError) {
      return blocked(error.reason, safeMessageForDocumentZipError(error));
    }
    return blocked("zip_failed", "Не удалось сформировать ZIP-файл.");
  }
}

export async function auditExportMediaZipArtifact(
  artifact: ExportMediaZipArtifact,
): Promise<ExportMediaZipAuditResult> {
  try {
    if (artifact.blob.size <= 0) return failedArchiveAudit();

    const archive = await JSZip.loadAsync(await artifact.blob.arrayBuffer());
    const fileNames = Object.keys(archive.files).filter(
      (name) => !archive.files[name]?.dir,
    );
    const manifestNames = fileNames.filter((name) =>
      name.endsWith("/manifest.json"),
    );
    if (manifestNames.length !== 1) return failedArchiveAudit();

    const manifestName = manifestNames[0];
    if (!manifestName) return failedArchiveAudit();
    const manifestEntry = archive.file(manifestName);
    if (!manifestEntry) return failedArchiveAudit();
    const manifest = JSON.parse(await manifestEntry.async("string")) as unknown;
    if (!isArchiveManifest(manifest)) return failedArchiveAudit();

    if (
      artifact.applicantCount < 1 ||
      artifact.submissionCount < 1 ||
      manifest.applicantCount !== artifact.applicantCount ||
      manifest.fileCount !== artifact.fileCount ||
      manifest.workbookFileName !== artifact.workbookFileName ||
      artifact.workbookFileName !== artifact.packageIdentity.fileName ||
      artifact.fileName !==
        `visaflow-export-${artifact.packageIdentity.idempotencyKey}_documents.zip` ||
      artifact.submissionCount !== artifact.packageIdentity.submissionIds.length ||
      artifact.applicantCount !== artifact.packageIdentity.rowCount ||
      artifact.fileCount !== artifact.applicantCount * EXPORT_DOCUMENT_TYPES.length ||
      artifact.documentAssetIds.length !==
        artifact.applicantCount * DOCUMENT_TYPES.length ||
      new Set(artifact.documentAssetIds).size !== artifact.documentAssetIds.length ||
      !exportPackageIdentityMatches(artifact.packageIdentity, manifest.package) ||
      !sameStringArray(manifest.requiredDocumentTypes, EXPORT_DOCUMENT_TYPES)
    ) {
      return failedArchiveAudit();
    }

    const documentEntries = manifest.documentEntries;
    if (
      documentEntries.length !== artifact.fileCount ||
      new Set(documentEntries).size !== documentEntries.length ||
      documentEntries.some(
        (name) => !name.startsWith(`${manifest.rootFolder}/`),
      )
    ) {
      return failedArchiveAudit();
    }

    if (
      manifest.submissions.length !== artifact.submissionCount ||
      !sameStringSet(
        manifest.submissions.map((submission) => submission.id),
        artifact.packageIdentity.submissionIds,
      )
    ) {
      return failedArchiveAudit();
    }

    const manifestApplicants = manifest.submissions.flatMap(
      (submission) => submission.applicants,
    );
    if (manifestApplicants.length !== artifact.applicantCount) {
      return failedArchiveAudit();
    }

    const applicantEntries = manifestApplicants.flatMap(
      (applicant) => applicant.documentEntries,
    );
    const applicantAssetIds = manifestApplicants.flatMap(
      (applicant) => applicant.documentAssetIds,
    );
    if (
      !sameStringArray(applicantEntries, documentEntries) ||
      !sameStringArray(applicantAssetIds, artifact.documentAssetIds)
    ) {
      return failedArchiveAudit();
    }

    for (const applicant of manifestApplicants) {
      if (
        !sameStringArray(applicant.documentTypes, EXPORT_DOCUMENT_TYPES) ||
        applicant.documentEntries.length !== EXPORT_DOCUMENT_TYPES.length ||
        new Set(applicant.documentEntries).size !==
          applicant.documentEntries.length ||
        applicant.documentAssetIds.length !== DOCUMENT_TYPES.length ||
        new Set(applicant.documentAssetIds).size !==
          applicant.documentAssetIds.length
      ) {
        return failedArchiveAudit();
      }

      const observedTypes = applicant.documentEntries.map(
        archiveDocumentTypeForEntry,
      );
      if (
        observedTypes.some((type) => type === null) ||
        !sameStringArray(
          observedTypes as (typeof EXPORT_DOCUMENT_TYPES)[number][],
          EXPORT_DOCUMENT_TYPES,
        )
      ) {
        return failedArchiveAudit();
      }
    }

    const workbookName = `${manifest.rootFolder}/${artifact.workbookFileName}`;
    const readmeName = `${manifest.rootFolder}/README_ПАКЕТ.txt`;
    const expectedNames = new Set([
      ...documentEntries,
      manifestName,
      readmeName,
      workbookName,
    ]);
    if (
      expectedNames.size !== fileNames.length ||
      fileNames.some((name) => !expectedNames.has(name))
    ) {
      return failedArchiveAudit();
    }

    for (const name of expectedNames) {
      const entry = archive.file(name);
      if (!entry || (await entry.async("uint8array")).byteLength <= 0) {
        return failedArchiveAudit();
      }
    }

    return { ok: true };
  } catch {
    return failedArchiveAudit();
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
    runtime.setTimeout(() => runtime.URL.revokeObjectURL(url), 60_000);
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
  const incompleteVisaForms = submissions.flatMap((submission) =>
    submission.applicants.flatMap((applicant) => {
      const validation = validateVisaApplicationFormData(submission, applicant);
      return validation.ok ? [] : validation.missingFields;
    }),
  );
  if (incompleteVisaForms.length > 0) {
    return blocked(
      "questionnaire_incomplete",
      visaApplicationFormValidationMessage(incompleteVisaForms),
    );
  }

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

  const repository = options.documentRepository ?? DocumentRepository.optional();
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
        return createVisaApplicationFormPdfBlob(context.submission, context.applicant, {
          exportDate: context.exportDate,
        });
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
      return createVisaApplicationFormPdfBlob(context.submission, context.applicant, {
        exportDate: context.exportDate,
      });
    }

    return downloadMediaFromStorage({
      bucket: mediaStorageBucket,
      path: asset.storage.path,
    });
  };
}

function documentAssetsFromSubmissionFiles(submissions: Submission[]): DocumentAsset[] {
  const now = "1970-01-01T00:00:00.000Z";
  return submissions.flatMap((submission) =>
    submission.files.flatMap((file) => {
      const type = tryNormalizeDocumentType(file.type);
      if (!type || file.storageBucket !== mediaStorageBucket || !file.storagePath) {
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
            file.status === "accepted" ? ("passed" as const) : ("pending" as const),
          exportStatus:
            file.status === "accepted" ? ("ready" as const) : ("not_ready" as const),
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
    documentAssetIds: string[];
    documentEntries: string[];
    fileCount: number;
    rootFolder: string;
    workbookFileName: string;
  },
) {
  let documentEntryIndex = 0;
  let documentAssetIndex = 0;

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
        documentAssetIds: counts.documentAssetIds.slice(
          documentAssetIndex,
          (documentAssetIndex += DOCUMENT_TYPES.length),
        ),
        documentEntries: counts.documentEntries.slice(
          documentEntryIndex,
          (documentEntryIndex += EXPORT_DOCUMENT_TYPES.length),
        ),
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

function isArchiveManifest(value: unknown): value is {
  applicantCount: number;
  documentEntries: string[];
  fileCount: number;
  package: ExportPackageIdentity;
  requiredDocumentTypes: string[];
  rootFolder: string;
  submissions: Array<{
    applicants: Array<{
      documentAssetIds: string[];
      documentEntries: string[];
      documentTypes: string[];
      id: string;
      name: string;
    }>;
    id: string;
  }>;
  workbookFileName: string;
} {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.applicantCount) &&
    Number.isInteger(value.fileCount) &&
    isStringArray(value.documentEntries) &&
    isExportPackageIdentity(value.package) &&
    isStringArray(value.requiredDocumentTypes) &&
    typeof value.rootFolder === "string" &&
    value.rootFolder.length > 0 &&
    isArchiveManifestSubmissions(value.submissions) &&
    typeof value.workbookFileName === "string" &&
    value.workbookFileName.length > 0
  );
}

function isArchiveManifestSubmissions(
  value: unknown,
): value is Array<{
  applicants: Array<{
    documentAssetIds: string[];
    documentEntries: string[];
    documentTypes: string[];
    id: string;
    name: string;
  }>;
  id: string;
}> {
  return (
    Array.isArray(value) &&
    value.every(
      (submission) =>
        isRecord(submission) &&
        typeof submission.id === "string" &&
        Array.isArray(submission.applicants) &&
        submission.applicants.every(
          (applicant) =>
            isRecord(applicant) &&
            typeof applicant.id === "string" &&
            typeof applicant.name === "string" &&
            isStringArray(applicant.documentTypes) &&
            isStringArray(applicant.documentEntries) &&
            isStringArray(applicant.documentAssetIds),
        ),
    )
  );
}

function archiveDocumentTypeForEntry(
  entryName: string,
): (typeof EXPORT_DOCUMENT_TYPES)[number] | null {
  const fileName = entryName.split("/").at(-1) ?? "";
  return (
    EXPORT_DOCUMENT_TYPES.find((type) => fileName.includes(`_${type}.`)) ?? null
  );
}

function isExportPackageIdentity(value: unknown): value is ExportPackageIdentity {
  if (!isRecord(value)) return false;
  return (
    typeof value.contentFingerprint === "string" &&
    typeof value.fileName === "string" &&
    (value.format === "csv" || value.format === "xlsx") &&
    typeof value.idempotencyKey === "string" &&
    Number.isInteger(value.rowCount) &&
    isStringArray(value.submissionIds)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((item) => right.includes(item))
  );
}

function failedArchiveAudit(): ExportMediaZipAuditResult {
  return {
    ok: false,
    reason: "audit_failed",
    safeMessage: "ZIP не прошёл проверку состава. Скачивание и фиксация отменены.",
  };
}

function safeMessageForDocumentZipError(error: DocumentZipBuilderError): string {
  const { reason } = error;
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
    return error.message;
  }
  return "В выбранном пакете не все обязательные документы прошли проверку.";
}

function blocked(reason: ExportMediaZipBlockedReason, safeMessage: string) {
  return { ok: false as const, reason, safeMessage };
}
