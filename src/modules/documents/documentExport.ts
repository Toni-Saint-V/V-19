import JSZip from "jszip";
import type { Submission, Applicant } from "../submissions/types";
import {
  archiveDocumentName,
  documentExtension,
  DOCUMENT_TYPES,
  type DocumentAsset,
  type DocumentType,
} from "./documentTypes";
import { validateDocumentAsset, validateDocuments } from "./documentValidation";

export type DocumentZipBlockedReason =
  | "empty_file"
  | "media_not_ready"
  | "storage_download_failed"
  | "storage_unavailable";

export class DocumentZipBuilderError extends Error {
  constructor(
    readonly reason: DocumentZipBlockedReason,
    message: string,
  ) {
    super(message);
    this.name = "DocumentZipBuilderError";
  }
}

export type DocumentZipDownloader = (
  asset: DocumentAsset,
  context: {
    applicant: Applicant;
    applicantIndex: number;
    submission: Submission;
    type: DocumentType;
  },
) => Promise<Blob | null>;

export type BuildDocumentsZipInput = {
  assets: DocumentAsset[];
  downloadAsset: DocumentZipDownloader;
  exportDate?: Date | string;
  submissions: Submission[];
  zip?: JSZip;
};

export type BuildDocumentsZipResult = {
  applicantCount: number;
  documentAssetIds: string[];
  entries: string[];
  fileCount: number;
  rootFolder: string;
  zip: JSZip;
};

export async function buildDocumentsZip(
  input: BuildDocumentsZipInput,
): Promise<BuildDocumentsZipResult> {
  const zip = input.zip ?? new JSZip();
  const rootFolder = `VisaFlow_Export_${exportDateLabel(input.exportDate)}`;
  const entries: string[] = [];
  const documentAssetIds: string[] = [];
  let applicantCount = 0;
  let fileCount = 0;

  for (const submission of input.submissions) {
    const cityFolder = safeArchiveName(submission.city, "city");
    const submissionFolder = safeArchiveName(
      submission.type === "family"
        ? submission.title
        : (submission.applicants[0]?.fullName ?? submission.title),
      submission.id,
    );

    for (const [applicantIndex, applicant] of submission.applicants.entries()) {
      const applicantDocs = input.assets.filter(
        (asset) =>
          asset.submissionId === submission.id &&
          asset.applicantId === applicant.id,
      );
      const readiness = validateDocuments(applicantDocs);
      if (!readiness.ok) {
        throw new DocumentZipBuilderError(
          "media_not_ready",
          readiness.failures[0]?.message ??
            "Applicant documents are not ready.",
        );
      }

      for (const type of DOCUMENT_TYPES) {
        const asset = applicantDocs.find(
          (candidate) => candidate.type === type,
        );
        if (!asset) {
          throw new DocumentZipBuilderError(
            "media_not_ready",
            `Missing validated ${type}.`,
          );
        }

        const assetFailures = validateDocumentAsset(asset);
        if (assetFailures.length > 0) {
          throw new DocumentZipBuilderError(
            "media_not_ready",
            assetFailures[0]?.message ?? "Document is not ready for export.",
          );
        }

        let blob: Blob | null;
        try {
          blob = await input.downloadAsset(asset, {
            applicant,
            applicantIndex,
            submission,
            type,
          });
        } catch (error) {
          throw new DocumentZipBuilderError(
            "storage_download_failed",
            error instanceof Error ? error.message : "Storage download failed.",
          );
        }

        if (!blob) {
          throw new DocumentZipBuilderError(
            "storage_unavailable",
            "Storage returned no document bytes.",
          );
        }
        if (blob.size <= 0) {
          throw new DocumentZipBuilderError(
            "empty_file",
            "Document file is empty.",
          );
        }

        const entryName = [
          rootFolder,
          cityFolder,
          submissionFolder,
          archiveDocumentFileName({
            applicant,
            applicantCount: submission.applicants.length,
            applicantIndex,
            asset,
            type,
          }),
        ].join("/");

        zip.file(entryName, blob);
        entries.push(entryName);
        documentAssetIds.push(asset.id);
        fileCount += 1;
      }

      applicantCount += 1;
    }
  }

  return {
    applicantCount,
    documentAssetIds,
    entries,
    fileCount,
    rootFolder,
    zip,
  };
}

export function archiveDocumentFileName(input: {
  applicant: Applicant;
  applicantCount: number;
  applicantIndex: number;
  asset: DocumentAsset;
  type: DocumentType;
}): string {
  const extension = sanitizeExtension(documentExtension(input.asset));
  const documentName = archiveDocumentName(input.type);

  if (input.applicantCount === 1) {
    return `${documentName}.${extension}`;
  }

  const applicantName = safeFilenameSegment(
    input.applicant.fullName,
    input.applicant.id,
  );
  return `${numberPrefix(input.applicantIndex + 1)}_${applicantName}_${documentName}.${extension}`;
}

export function exportDateLabel(value: Date | string | undefined): string {
  const date =
    value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime()))
    return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function safeArchiveName(value: string, fallback: string): string {
  const safe = value
    .normalize("NFKC")
    .split("")
    .map((character) => (/[\\/:*?"<>|]/.test(character) ? "_" : character))
    .join("")
    .replace(/[\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);

  return safe || fallback;
}

function safeFilenameSegment(value: string, fallback: string): string {
  const safe = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);

  return safe || safeFilenameSegment(fallback, "applicant");
}

function sanitizeExtension(value: string): string {
  return (
    value
      .replace(/^\./, "")
      .replace(/[^a-z0-9]+/gi, "")
      .toLowerCase() || "bin"
  );
}

function numberPrefix(value: number): string {
  return String(value).padStart(2, "0");
}
