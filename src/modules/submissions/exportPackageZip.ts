import { exportContractFingerprint, type ExportContractRow } from "../../lib/export/exportContractCore";
import { createExportWorkbookArtifact } from "./exportWorkbook";
import { createMediaSignedUrl, mediaStorageBucket } from "./mediaStorage";
import {
  optionalTrackedDocumentTypes,
  requiredExportDocumentTypes,
  summarizeSubmissionDocumentReadiness,
} from "./documentIntake";
import { fileTypeLabels } from "./status";
import type { ExportPackageIdentity, Submission, SubmissionFile } from "./types";

export type ExportPackageZipDownloadResult =
  | { ok: true; fileName: string; includedFiles: number; manifestFiles: number; missingFiles: number }
  | { ok: false; reason: "download_failed" | "export_not_ready" | "row_mismatch"; safeMessage: string };

type ExportPackageZipInput = {
  identity: ExportPackageIdentity | null;
  localFilesById?: ReadonlyMap<string, File>;
  rows: ExportContractRow[];
  submissions: Submission[];
};

type ZipEntryInput = {
  data: Blob | Uint8Array | ArrayBuffer | string;
  name: string;
};

type PreparedZipEntry = {
  crc32: number;
  data: Uint8Array;
  modDate: number;
  modTime: number;
  name: string;
  nameBytes: Uint8Array;
  offset: number;
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

const textEncoder = new TextEncoder();

export async function downloadExportPackageZip({
  identity,
  localFilesById = new Map(),
  rows,
  submissions,
}: ExportPackageZipInput): Promise<ExportPackageZipDownloadResult> {
  if (!identity || identity.rowCount < 1 || submissions.length < 1) {
    return {
      ok: false,
      reason: "export_not_ready",
      safeMessage: "Сначала выберите подачи и сформируйте пакет выгрузки.",
    };
  }

  if (
    identity.rowCount !== rows.length ||
    identity.contentFingerprint !== exportContractFingerprint(rows, identity.format)
  ) {
    return {
      ok: false,
      reason: "row_mismatch",
      safeMessage: "Состав пакета изменился. Сформируйте Excel заново.",
    };
  }

  try {
    const artifact = createExportWorkbookArtifact(rows, identity);
    const createdAtIso = new Date().toISOString();
    const selectedIds = new Set(identity.submissionIds);
    const selectedSubmissions = submissions.filter((submission) =>
      selectedIds.has(submission.id),
    );
    const packageIssues = selectedSubmissions.flatMap((submission) =>
      submission.issues.map((issue) => ({ ...issue, submissionId: submission.id })),
    );
    const excelPath = `00_Excel/${sanitizeZipPath(artifact.fileName)}`;
    const manifest: string[] = [];
    const packageManifest = {
      schema: "visaflow.export_package.v2",
      packageId: identity.idempotencyKey,
      createdAtIso,
      excel: {
        fileName: artifact.fileName,
        format: identity.format,
        path: excelPath,
        rows: rows.length,
      },
      rules: {
        cityGrouping: true,
        familyGroupedBySubmissionId: true,
        manifestAlwaysGenerated: true,
        missingFilesFolder: "__MISSING__",
        oneSubmissionOneFolder: true,
      },
      totals: {
        applicants: selectedSubmissions.reduce(
          (sum, submission) => sum + submission.applicants.length,
          0,
        ),
        documentsAvailable: 0,
        documentsExpected: selectedSubmissions.reduce(
          (sum, submission) =>
            sum + summarizeSubmissionDocumentReadiness(submission).requiredSlots,
          0,
        ),
        includedFiles: 1,
        issues: packageIssues.length,
        manifestFiles: 0,
        missingFiles: 0,
        submissions: selectedSubmissions.length,
      },
      submissions: [] as Array<ReturnType<typeof buildSubmissionManifest> & { folder: string }>,
    };
    const entries: ZipEntryInput[] = [
      {
        name: excelPath,
        data: artifact.blob,
      },
    ];
    let includedFiles = 1;
    let manifestFiles = 0;
    let missingFiles = 0;
    let documentsAvailable = 0;

    manifest.push("VisaFlow export package");
    manifest.push(`Schema: ${packageManifest.schema}`);
    manifest.push(`Excel: ${excelPath}`);
    manifest.push(`Packs: ${selectedSubmissions.length}`);
    manifest.push(`Rows: ${rows.length}`);
    manifest.push("");

    for (const [submissionIndex, submission] of selectedSubmissions.entries()) {
      const submissionFolder = `${String(submissionIndex + 1).padStart(2, "0")}_${safeSegment(
        submission.id,
      )}_${safeSegment(submission.title)}`;
      const cityPrefix = safeSegment(submission.city);
      const typePrefix = submission.type === "family" ? "family" : "single";
      const folderRoot = `${cityPrefix}/${typePrefix}/${submissionFolder}`;
      const submissionManifest = buildSubmissionManifest(submission);
      const submissionIssues = buildSubmissionIssuesManifest(submission);
      packageManifest.submissions.push({ ...submissionManifest, folder: folderRoot });

      entries.push({
        name: `${folderRoot}/submission.json`,
        data: JSON.stringify(submissionManifest, null, 2),
      });
      entries.push({
        name: `${folderRoot}/manifest.json`,
        data: JSON.stringify({ ...submissionManifest, folder: folderRoot }, null, 2),
      });
      entries.push({
        name: `${folderRoot}/issues.json`,
        data: JSON.stringify(submissionIssues, null, 2),
      });
      includedFiles += 3;

      manifest.push(`${submission.id} · ${submission.title}`);
      manifest.push(`  City: ${submission.city}`);
      manifest.push(`  Type: ${submission.type}`);
      manifest.push(`  Folder: ${folderRoot}`);
      manifest.push(`  Applicants: ${submission.applicants.length}`);

      for (const [applicantIndex, applicant] of submission.applicants.entries()) {
        const applicantFolder = `${folderRoot}/applicant_${String(
          applicantIndex + 1,
        ).padStart(2, "0")}_${safeSegment(applicant.fullName)}`;
        const applicantFiles = submission.files.filter(
          (file) => file.applicantId === applicant.id,
        );
        const handledFileIds = new Set<string>();
        const applicantManifest: string[] = [];
        const applicantJsonManifest = {
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          required: requiredExportDocumentTypes.map((type) => ({
            type,
            present: applicantFiles.some((file) => file.type === type),
          })),
          optionalTracked: optionalTrackedDocumentTypes.map((type) => ({
            type,
            present: applicantFiles.some((file) => file.type === type),
          })),
          files: [] as Array<{
            id: string;
            path: string;
            status: SubmissionFile["status"];
            type: SubmissionFile["type"];
          }>,
          missing: [] as Array<{ path: string; type: SubmissionFile["type"] }>,
        };
        applicantManifest.push(`Applicant: ${applicant.fullName}`);
        applicantManifest.push(`Submission: ${submission.id}`);
        applicantManifest.push("");

        for (const requiredType of requiredExportDocumentTypes) {
          const typedFiles = applicantFiles.filter((file) => file.type === requiredType);

          if (!typedFiles.length) {
            const missingPath = `${applicantFolder}/__MISSING__/${safeSegment(
              fileTypeLabels[requiredType] ?? requiredType,
            )}_missing.txt`;
            entries.push({
              name: missingPath,
              data: missingSourceFileNote({
                applicantName: applicant.fullName,
                displayName: `${fileTypeLabels[requiredType] ?? requiredType}.missing`,
                fileType: requiredType,
                reason: "required media slot is absent in submission.files",
                status: "missing",
                submissionId: submission.id,
              }),
            });
            missingFiles += 1;
            manifestFiles += 1;
            includedFiles += 1;
            applicantJsonManifest.missing.push({ path: missingPath, type: requiredType });
            applicantManifest.push(`MISSING_SLOT: ${fileTypeLabels[requiredType] ?? requiredType} · see ${missingPath}`);
            continue;
          }

          for (const file of typedFiles) {
            handledFileIds.add(file.id);
            const result = await addSubmissionFileEntry({
              applicantFolder,
              applicantName: applicant.fullName,
              applicantManifest,
              entries,
              file,
              localFilesById,
              submissionId: submission.id,
            });
            includedFiles += result.includedFiles;
            manifestFiles += result.manifestFiles;
            missingFiles += result.missingFiles;
            documentsAvailable += result.documentsAvailable;
            if (result.path) {
              applicantJsonManifest.files.push({
                id: file.id,
                path: result.path,
                status: file.status,
                type: file.type,
              });
            }
            if (result.missingPath) {
              applicantJsonManifest.missing.push({ path: result.missingPath, type: file.type });
            }
          }
        }

        for (const file of applicantFiles) {
          if (handledFileIds.has(file.id)) continue;
          const result = await addSubmissionFileEntry({
            applicantFolder,
            applicantName: applicant.fullName,
            applicantManifest,
            entries,
            file,
            localFilesById,
            submissionId: submission.id,
          });
          includedFiles += result.includedFiles;
          manifestFiles += result.manifestFiles;
          missingFiles += result.missingFiles;
          documentsAvailable += result.documentsAvailable;
          if (result.path) {
            applicantJsonManifest.files.push({
              id: file.id,
              path: result.path,
              status: file.status,
              type: file.type,
            });
          }
          if (result.missingPath) {
            applicantJsonManifest.missing.push({ path: result.missingPath, type: file.type });
          }
        }

        const review = submission.visaApplicationPdfReviews?.find(
          (item) => item.applicantId === applicant.id,
        );
        if (review?.artifact?.fileName) {
          applicantManifest.push(
            `VISA_PDF_METADATA: ${review.artifact.fileName} · ${review.status}`,
          );
        }

        entries.push({
          name: `${applicantFolder}/manifest.txt`,
          data: applicantManifest.join("\n"),
        });
        entries.push({
          name: `${applicantFolder}/manifest.json`,
          data: JSON.stringify(applicantJsonManifest, null, 2),
        });
        includedFiles += 2;
      }

      if (submission.returnedPdfPackage?.commonAppointmentPdf?.fileName) {
        entries.push({
          name: `${folderRoot}/appointment-list.metadata.txt`,
          data: [
            `File: ${submission.returnedPdfPackage.commonAppointmentPdf.fileName}`,
            `Status: ${submission.returnedPdfPackage.commonAppointmentPdf.uploadStatus ?? "metadata"}`,
            `Bucket: ${submission.returnedPdfPackage.commonAppointmentPdf.storageBucket ?? ""}`,
            `Path: ${submission.returnedPdfPackage.commonAppointmentPdf.storagePath ?? ""}`,
          ].join("\n"),
        });
        includedFiles += 1;
      }

      manifest.push("");
    }

    packageManifest.totals.documentsAvailable = documentsAvailable;
    packageManifest.totals.includedFiles = includedFiles + 4;
    packageManifest.totals.manifestFiles = manifestFiles;
    packageManifest.totals.missingFiles = missingFiles;

    entries.push({ name: "manifest.txt", data: manifest.join("\n") });
    entries.push({ name: "manifest.json", data: JSON.stringify(packageManifest, null, 2) });
    entries.push({
      name: "issues.json",
      data: JSON.stringify(
        {
          createdAtIso,
          issues: packageIssues,
          schema: "visaflow.export_issues.v1",
          total: packageIssues.length,
        },
        null,
        2,
      ),
    });
    entries.push({
      name: "README_ПАКЕТ.txt",
      data: [
        "В этом ZIP лежит Excel для программистов и документы выбранных подач.",
        "Excel хранится в 00_Excel/.",
        "Каноническая структура: Город/family/Подача/applicant_01_Имя и Город/single/Подача/applicant_01_Имя.",
        "manifest.json всегда создаётся на корне, в каждой подаче и у каждого заявителя.",
        "issues.json всегда создаётся на корне и внутри каждой подачи.",
        "Если исходный Blob недоступен в текущей браузерной сессии, диагностика лежит в __MISSING__ рядом с заявителем.",
        "После обработки программисты возвращают PDF анкет и список записи. Это импортируется отдельно в админском экране загрузки.",
      ].join("\n"),
    });

    const blob = await createZipBlob(entries);
    const zipFileName = exportZipFileName(identity.fileName);
    downloadBlob(blob, zipFileName);

    return {
      ok: true,
      fileName: zipFileName,
      includedFiles: packageManifest.totals.includedFiles,
      manifestFiles,
      missingFiles,
    };
  } catch {
    return {
      ok: false,
      reason: "download_failed",
      safeMessage: "Не удалось подготовить ZIP с Excel и документами. Повторите формирование.",
    };
  }
}

type AddSubmissionFileEntryInput = {
  applicantFolder: string;
  applicantManifest: string[];
  applicantName: string;
  entries: ZipEntryInput[];
  file: SubmissionFile;
  localFilesById: ReadonlyMap<string, File>;
  submissionId: string;
};

async function addSubmissionFileEntry({
  applicantFolder,
  applicantManifest,
  applicantName,
  entries,
  file,
  localFilesById,
  submissionId,
}: AddSubmissionFileEntryInput) {
  const localFile = localFilesById.get(file.id);
  const displayName = zipDocumentFileName(file, localFile?.name);
  const path = `${applicantFolder}/${displayName}`;

  if (localFile) {
    entries.push({
      name: path,
      data: localFile,
    });
    applicantManifest.push(`OK_LOCAL: ${displayName}`);
    return {
      documentsAvailable: 1,
      includedFiles: 1,
      manifestFiles: 0,
      missingFiles: 0,
      path,
    };
  }

  const storageBlob = await fetchStoredSubmissionFile(file);
  if (storageBlob) {
    entries.push({
      name: path,
      data: storageBlob,
    });
    applicantManifest.push(`OK_STORAGE: ${displayName}`);
    return {
      documentsAvailable: 1,
      includedFiles: 1,
      manifestFiles: 0,
      missingFiles: 0,
      path,
    };
  }

  const missingPath = `${applicantFolder}/__MISSING__/${displayName}.txt`;
  entries.push({
    name: missingPath,
    data: missingSourceFileNote({
      applicantName,
      displayName,
      fileType: file.type,
      reason: "actual Blob and signed storage download were not available",
      status: file.status,
      storageBucket: file.storageBucket,
      storagePath: file.storagePath,
      submissionId,
    }),
  });
  applicantManifest.push(
    `NEEDS_SOURCE: ${displayName} · ${fileTypeLabels[file.type] ?? file.type} · ${file.status} · see ${missingPath}`,
  );

  return {
    documentsAvailable: 0,
    includedFiles: 1,
    manifestFiles: 1,
    missingFiles: 1,
    missingPath,
  };
}

async function fetchStoredSubmissionFile(file: SubmissionFile) {
  if (!file.storagePath) return null;
  if (file.storageBucket && file.storageBucket !== mediaStorageBucket) return null;

  try {
    const signedUrl = await createMediaSignedUrl(
      { bucket: mediaStorageBucket, path: file.storagePath },
      60 * 5,
    );
    if (!signedUrl) return null;

    const response = await fetch(signedUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

function missingSourceFileNote({
  applicantName,
  displayName,
  fileType,
  reason,
  status,
  storageBucket = "",
  storagePath = "",
  submissionId,
}: {
  applicantName: string;
  displayName: string;
  fileType: SubmissionFile["type"];
  reason: string;
  status: string;
  storageBucket?: string;
  storagePath?: string;
  submissionId: string;
}) {
  return [
    `Missing source file: ${displayName}`,
    `Submission: ${submissionId}`,
    `Applicant: ${applicantName}`,
    `Type: ${fileTypeLabels[fileType] ?? fileType}`,
    `Status: ${status}`,
    `Storage bucket: ${storageBucket}`,
    `Storage path: ${storagePath}`,
    `Reason: ${reason}.`,
  ].join("\n");
}

function buildSubmissionIssuesManifest(submission: Submission) {
  return {
    schema: "visaflow.submission_issues.v1",
    submissionId: submission.id,
    total: submission.issues.length,
    open: submission.issues.filter((issue) => issue.status === "open").length,
    fixedByAgent: submission.issues.filter((issue) => issue.status === "fixed_by_agent").length,
    closedByAdmin: submission.issues.filter((issue) => issue.status === "closed_by_admin").length,
    issues: submission.issues.map((issue) => ({
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      status: issue.status,
      reason: issue.reason,
      comment: issue.comment,
      createdAt: issue.createdAt,
      createdBy: issue.createdBy,
      target: issue.target,
    })),
  };
}

function buildSubmissionManifest(submission: Submission) {
  const readiness = summarizeSubmissionDocumentReadiness(submission);
  const issues = buildSubmissionIssuesManifest(submission);

  return {
    id: submission.id,
    title: submission.title,
    type: submission.type,
    city: submission.city,
    country: submission.country,
    countryCode: submission.countryCode,
    tripDateFrom: submission.tripDateFrom,
    tripDateTo: submission.tripDateTo,
    status: submission.status,
    exportState: submission.exportState ?? "not_ready",
    readinessScore: submission.completeness.total,
    documentsBundle: {
      acceptedSlots: readiness.acceptedSlots,
      applicants: submission.applicants.map((applicant) => ({
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        required: requiredExportDocumentTypes.map((type) => ({
          type,
          status:
            submission.files.find(
              (file) => file.applicantId === applicant.id && file.type === type,
            )?.status ?? "missing",
        })),
        optionalTracked: optionalTrackedDocumentTypes.map((type) => ({
          type,
          status:
            submission.files.find(
              (file) => file.applicantId === applicant.id && file.type === type,
            )?.status ?? "missing",
        })),
      })),
      missingRequiredSlots: readiness.missingRequiredSlots,
      ready: readiness.ready,
      replacementRequiredSlots: readiness.replacementRequiredSlots,
      requiredSlots: readiness.requiredSlots,
      trackedOptionalSlots: readiness.trackedOptionalSlots,
      uploadedSlots: readiness.uploadedSlots,
    },
    issuesSummary: {
      closedByAdmin: issues.closedByAdmin,
      fixedByAgent: issues.fixedByAgent,
      open: issues.open,
      total: issues.total,
    },
    applicants: submission.applicants.map((applicant) => ({
      id: applicant.id,
      fullName: applicant.fullName,
      role: applicant.role,
      questionnaireStatus: applicant.questionnaireStatus,
      fileStatus: applicant.fileStatus,
    })),
    files: submission.files.map((file) => ({
      id: file.id,
      applicantId: file.applicantId,
      type: file.type,
      status: file.status,
      generatedFileName: file.generatedFileName,
      originalFileName: file.originalFileName,
      uploadStatus: file.uploadStatus,
      storageAdapter: file.storageAdapter,
      storageBucket: file.storageBucket,
      storagePath: file.storagePath,
    })),
  };
}

function zipDocumentFileName(file: SubmissionFile, fallbackName = "") {
  const sourceName = file.generatedFileName || file.originalFileName || fallbackName;
  const extension = extensionForName(sourceName) || extensionForMime(file.mimeType);
  const base = safeSegment(fileTypeLabels[file.type] ?? file.type);
  const status = safeSegment(file.status);
  const raw = sourceName ? safeSegment(sourceName.replace(/\.[^.]+$/, "")) : base;

  return `${base}_${status}_${raw}${extension}`;
}

function extensionForName(name: string) {
  const match = /\.[a-z0-9]{2,8}$/i.exec(name.trim());
  return match?.[0] ?? "";
}

function extensionForMime(mimeType = "") {
  if (mimeType.includes("pdf")) return ".pdf";
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  return ".bin";
}

function exportZipFileName(excelFileName: string) {
  return excelFileName.replace(/\.xlsx$/i, "") + "_with_documents.zip";
}

function safeSegment(value: string) {
  return stripZipControlCharacters(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 96) || "item";
}

function stripZipControlCharacters(value: string) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 ? "-" : character;
  }).join("");
}

function sanitizeZipPath(path: string) {
  return path
    .split("/")
    .map((segment) => safeSegment(segment))
    .filter((segment) => segment !== "." && segment !== "..")
    .join("/");
}
async function createZipBlob(entries: ZipEntryInput[]): Promise<Blob> {
  const preparedEntries: PreparedZipEntry[] = [];
  const localParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = sanitizeZipPath(entry.name);
    const nameBytes = textEncoder.encode(name);
    const data = await normalizeZipData(entry.data);
    const crc32Value = crc32(data);
    const { modDate, modTime } = dosDateTime(new Date());
    const prepared: PreparedZipEntry = {
      crc32: crc32Value,
      data,
      modDate,
      modTime,
      name,
      nameBytes,
      offset,
    };
    const localHeader = localFileHeader(prepared);
    preparedEntries.push(prepared);
    localParts.push(localHeader, data);
    offset += localHeader.byteLength + data.byteLength;
  }

  const centralParts = preparedEntries.map(centralDirectoryHeader);
  const centralDirectorySize = centralParts.reduce(
    (sum, part) => sum + part.byteLength,
    0,
  );
  const end = endOfCentralDirectory(
    preparedEntries.length,
    centralDirectorySize,
    offset,
  );

  return new Blob(
    [...localParts, ...centralParts, end].map((part) => zipBlobPart(part)),
    { type: "application/zip" },
  );
}

async function normalizeZipData(data: ZipEntryInput["data"]): Promise<Uint8Array> {
  if (typeof data === "string") return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

function zipBlobPart(part: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(part.byteLength);
  copy.set(part);
  return copy.buffer;
}

function localFileHeader(entry: PreparedZipEntry) {
  const header = new Uint8Array(30 + entry.nameBytes.byteLength);
  writeUInt32LE(header, 0, 0x04034b50);
  writeUInt16LE(header, 4, 20);
  writeUInt16LE(header, 6, 0x0800);
  writeUInt16LE(header, 8, 0);
  writeUInt16LE(header, 10, entry.modTime);
  writeUInt16LE(header, 12, entry.modDate);
  writeUInt32LE(header, 14, entry.crc32);
  writeUInt32LE(header, 18, entry.data.byteLength);
  writeUInt32LE(header, 22, entry.data.byteLength);
  writeUInt16LE(header, 26, entry.nameBytes.byteLength);
  writeUInt16LE(header, 28, 0);
  header.set(entry.nameBytes, 30);
  return header;
}

function centralDirectoryHeader(entry: PreparedZipEntry) {
  const header = new Uint8Array(46 + entry.nameBytes.byteLength);
  writeUInt32LE(header, 0, 0x02014b50);
  writeUInt16LE(header, 4, 20);
  writeUInt16LE(header, 6, 20);
  writeUInt16LE(header, 8, 0x0800);
  writeUInt16LE(header, 10, 0);
  writeUInt16LE(header, 12, entry.modTime);
  writeUInt16LE(header, 14, entry.modDate);
  writeUInt32LE(header, 16, entry.crc32);
  writeUInt32LE(header, 20, entry.data.byteLength);
  writeUInt32LE(header, 24, entry.data.byteLength);
  writeUInt16LE(header, 28, entry.nameBytes.byteLength);
  writeUInt16LE(header, 30, 0);
  writeUInt16LE(header, 32, 0);
  writeUInt16LE(header, 34, 0);
  writeUInt16LE(header, 36, 0);
  writeUInt32LE(header, 38, 0);
  writeUInt32LE(header, 42, entry.offset);
  header.set(entry.nameBytes, 46);
  return header;
}

function endOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
) {
  const header = new Uint8Array(22);
  writeUInt32LE(header, 0, 0x06054b50);
  writeUInt16LE(header, 4, 0);
  writeUInt16LE(header, 6, 0);
  writeUInt16LE(header, 8, entryCount);
  writeUInt16LE(header, 10, entryCount);
  writeUInt32LE(header, 12, centralDirectorySize);
  writeUInt32LE(header, 16, centralDirectoryOffset);
  writeUInt16LE(header, 20, 0);
  return header;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const modTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const modDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { modDate, modTime };
}

function writeUInt16LE(view: Uint8Array, offset: number, value: number) {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(view: Uint8Array, offset: number, value: number) {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
  view[offset + 2] = (value >>> 16) & 0xff;
  view[offset + 3] = (value >>> 24) & 0xff;
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function downloadBlob(blob: Blob, fileName: string) {
  const runtime = globalThis as BrowserDownloadRuntime;
  const url = runtime.URL.createObjectURL(blob);
  const link = runtime.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  runtime.document.body.append(link);
  link.click();
  link.remove();
  runtime.setTimeout(() => runtime.URL.revokeObjectURL(url), 0);
}
