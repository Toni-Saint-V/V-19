// src/modules/documents/documentExport.ts
import JSZip from "jszip";
import type { Submission, Applicant } from "../submissions/types";
import { requiredPassportReviewMediaTypesForApplicant } from "../submissions/passportReviewContract";
import {
  documentExtension,
  DOCUMENT_TYPES,
  normalizeDocumentType,
  type DocumentAsset,
  type DocumentType,
} from "./documentTypes";
import { validateDocumentAsset } from "./documentValidation";

export const EXPORT_DOCUMENT_TYPES = DOCUMENT_TYPES;

export type ExportDocumentType = (typeof EXPORT_DOCUMENT_TYPES)[number];

export function requiredDocumentTypesForApplicant(
  submission: Submission,
  applicantId: string,
): readonly DocumentType[] {
  return requiredPassportReviewMediaTypesForApplicant(submission, applicantId).map(
    normalizeDocumentType,
  );
}

export type ExportDocumentAsset = DocumentAsset;

export type DocumentZipBlockedReason =
  | "empty_file"
  | "media_not_ready"
  | "passport_number_missing"
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
  asset: ExportDocumentAsset,
  context: {
    applicant: Applicant;
    applicantIndex: number;
    /** ISO calendar date used by this ZIP root folder. */
    exportDate: string;
    submission: Submission;
    type: ExportDocumentType;
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
  const passportNumbers = passportNumbersForExport(input.submissions);
  const zip = input.zip ?? new JSZip();
  const exportDate = exportDateLabel(input.exportDate);
  const rootFolder = `VisaFlow_Export_${exportDate}`;
  const entries: string[] = [];
  const documentAssetIds: string[] = [];
  let applicantCount = 0;
  let fileCount = 0;

  for (const submission of input.submissions) {
    for (const applicant of submission.applicants) {
      const applicantDocs = input.assets.filter(
        (asset) =>
          asset.submissionId === submission.id && asset.applicantId === applicant.id,
      );
      for (const type of requiredDocumentTypesForApplicant(
        submission,
        applicant.id,
      )) {
        const asset = applicantDocs.find((candidate) => candidate.type === type);
        if (!asset) {
          throw new DocumentZipBuilderError(
            "media_not_ready",
            `Missing validated ${type}.`,
          );
        }
        const failures = validateDocumentAsset(asset);
        if (failures.length > 0) {
          throw new DocumentZipBuilderError(
            "media_not_ready",
            failures[0]?.message ?? "Document is not ready for export.",
          );
        }
      }
    }
  }

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
          asset.submissionId === submission.id && asset.applicantId === applicant.id,
      );
      const requiredTypes = requiredDocumentTypesForApplicant(
        submission,
        applicant.id,
      );

      for (const type of requiredTypes) {
        const asset = applicantDocs.find((candidate) => candidate.type === type);
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
            exportDate,
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
          throw new DocumentZipBuilderError("empty_file", "Document file is empty.");
        }

        const entryName = [
          rootFolder,
          cityFolder,
          submissionFolder,
          archiveDocumentFileName({
            applicant,
            asset,
            passportNumber: passportNumbers.get(applicant),
            type,
          }),
        ].join("/");

        zip.file(entryName, await blob.arrayBuffer());
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
  asset: ExportDocumentAsset;
  passportNumber?: string;
  type: ExportDocumentType;
}): string {
  const extension = sanitizeExtension(documentExtension(input.asset));
  const passportNumber =
    normalizePassportNumberForExport(input.passportNumber ?? "") ??
    passportNumberForApplicant(input.applicant);
  if (!passportNumber) {
    throw new DocumentZipBuilderError(
      "passport_number_missing",
      "A verified passport number is required for every exported document.",
    );
  }
  return `${passportNumber}_${input.type}.${extension}`;
}

function passportNumberForApplicant(applicant: Applicant): string | null {
  for (const section of applicant.sections) {
    const field = section.fields.find((candidate) => candidate.id === "passport-no");
    const value = normalizePassportNumberForExport(field?.value ?? "");
    if (value) return value;
  }

  return null;
}

export function normalizePassportNumberForExport(value: string): string | null {
  const normalized = value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 32);
  return normalized || null;
}

function passportNumbersForExport(
  submissions: readonly Submission[],
): ReadonlyMap<Applicant, string> {
  const passportNumbers = new Map<Applicant, string>();
  for (const submission of submissions) {
    for (const applicant of submission.applicants) {
      const passportNumber = passportNumberForApplicant(applicant);
      if (!passportNumber) {
        throw new DocumentZipBuilderError(
          "passport_number_missing",
          "A verified passport number is required for every exported document.",
        );
      }
      passportNumbers.set(applicant, passportNumber);
    }
  }
  return passportNumbers;
}

export function exportDateLabel(value: Date | string | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function safeArchiveName(value: string, fallback: string): string {
  const safe = value
    .normalize("NFKC")
    .split("")
    .map((character) =>
      /[\\/:*?"<>|]/.test(character) || character.charCodeAt(0) < 32 ? "_" : character,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);

  return safe || fallback;
}

function sanitizeExtension(value: string): string {
  return (
    value
      .replace(/^\./, "")
      .replace(/[^a-z0-9]+/gi, "")
      .toLowerCase() || "bin"
  );
}
