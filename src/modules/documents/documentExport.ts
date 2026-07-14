// src/modules/documents/documentExport.ts
import JSZip from "jszip";
import type { Submission, Applicant } from "../submissions/types";
import { mediaStorageBucket } from "../submissions/mediaStoragePolicy";
import {
  documentExtension,
  DOCUMENT_TYPES,
  type DocumentAsset,
} from "./documentTypes";
import { validateDocumentAsset, validateDocuments } from "./documentValidation";
import { validateVisaApplicationFormData } from "../submissions/visaApplicationFormPdf";

export const GENERATED_DOCUMENT_TYPES = ["visa_form"] as const;
export const EXPORT_DOCUMENT_TYPES = [
  ...DOCUMENT_TYPES,
  ...GENERATED_DOCUMENT_TYPES,
] as const;

export type GeneratedDocumentType = (typeof GENERATED_DOCUMENT_TYPES)[number];
export type ExportDocumentType = (typeof EXPORT_DOCUMENT_TYPES)[number];

export type GeneratedDocumentAsset = Omit<
  DocumentAsset,
  "sourceMediaAssetId" | "type"
> & {
  generated: true;
  sourceMediaAssetId?: null;
  type: GeneratedDocumentType;
};

export type ExportDocumentAsset = DocumentAsset | GeneratedDocumentAsset;

export type DocumentZipBlockedReason =
  | "empty_file"
  | "media_not_ready"
  | "passport_number_missing"
  | "questionnaire_incomplete"
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
      const visaFormValidation = validateVisaApplicationFormData(
        submission,
        applicant,
      );
      if (!visaFormValidation.ok) {
        throw new DocumentZipBuilderError(
          "questionnaire_incomplete",
          "Required questionnaire values for the visa application form are missing.",
        );
      }

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

      for (const type of EXPORT_DOCUMENT_TYPES) {
        const asset =
          type === "visa_form"
            ? generatedVisaFormAsset(submission, applicant, applicantIndex)
            : applicantDocs.find((candidate) => candidate.type === type);
        if (!asset) {
          throw new DocumentZipBuilderError(
            "media_not_ready",
            `Missing validated ${type}.`,
          );
        }

        if (asset.type !== "visa_form") {
          const assetFailures = validateDocumentAsset(asset);
          if (assetFailures.length > 0) {
            throw new DocumentZipBuilderError(
              "media_not_ready",
              assetFailures[0]?.message ?? "Document is not ready for export.",
            );
          }
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
            asset,
            passportNumber: passportNumbers.get(applicant),
            type,
          }),
        ].join("/");

        zip.file(entryName, await blob.arrayBuffer());
        entries.push(entryName);
        if (asset.type !== "visa_form") documentAssetIds.push(asset.id);
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

function generatedVisaFormAsset(
  submission: Submission,
  applicant: Applicant,
  applicantIndex: number,
): GeneratedDocumentAsset {
  const now = "1970-01-01T00:00:00.000Z";
  const passportNumber = passportNumberForApplicant(applicant);
  if (!passportNumber) {
    throw new DocumentZipBuilderError(
      "passport_number_missing",
      "A verified passport number is required for every exported document.",
    );
  }
  const filename = `${passportNumber}_visa_form.pdf`;

  return {
    checksum: null,
    createdAt: now,
    exportStatus: "ready",
    generated: true,
    id: `${submission.id}-${applicant.id}-visa-form-${applicantIndex}`,
    applicantId: applicant.id,
    mime: "application/pdf",
    ownerUserId: submission.agentId,
    size: 1,
    sourceMediaAssetId: null,
    storage: {
      bucket: mediaStorageBucket,
      filename,
      path: [
        "generated",
        "submissions",
        safeFilenameSegment(submission.id, "submission"),
        "applicants",
        safeFilenameSegment(applicant.id, "applicant"),
        "visa_form",
        filename,
      ].join("/"),
    },
    submissionId: submission.id,
    type: "visa_form",
    updatedAt: now,
    uploadedAt: now,
    uploadStatus: "uploaded",
    validatedAt: now,
    validationStatus: "passed",
  };
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
    .map((character) =>
      /[\\/:*?"<>|]/.test(character) || character.charCodeAt(0) < 32
        ? "_"
        : character,
    )
    .join("")
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
