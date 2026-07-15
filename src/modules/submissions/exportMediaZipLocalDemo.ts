import {
  buildDocumentStoragePath,
  tryNormalizeDocumentType,
  type DocumentAsset,
  type DocumentType,
} from "../documents/documentTypes";
import { createVisaApplicationFormPdfBlob } from "./visaApplicationFormPdf";
import { mediaStorageBucket } from "./mediaStorage";
import type { ExportMediaZipOptions } from "./exportMediaZip";
import type { Submission, SubmissionFile } from "./types";

export function buildLocalDemoExportMediaZipOptions(
  submissions: Submission[],
): Pick<ExportMediaZipOptions, "documentAssets" | "downloadDocument"> {
  return {
    documentAssets: localDemoDocumentAssetsFromSubmissionFiles(submissions),
    downloadDocument: async (asset, context) => {
      if (asset.type === "visa_form") {
        return createVisaApplicationFormPdfBlob(context.submission, context.applicant, {
          exportDate: context.exportDate,
        });
      }

      const lines = [
        "VisaFlow local export document placeholder",
        `Submission: ${context.submission.id} — ${context.submission.title}`,
        `Applicant: ${context.applicant.fullName}`,
        `Document type: ${context.type}`,
        `Storage path: ${asset.storage.path}`,
        "Supabase/private storage is inactive in this runtime, so the ZIP contains a deterministic non-empty local placeholder for demo export.",
      ];

      return new Blob([lines.join("\n")], {
        type: asset.mime ?? "application/octet-stream",
      });
    },
  };
}

function localDemoDocumentAssetsFromSubmissionFiles(
  submissions: Submission[],
): DocumentAsset[] {
  const now = new Date().toISOString();

  return submissions.flatMap((submission) =>
    submission.files.flatMap((file) => {
      const type = tryNormalizeDocumentType(file.type);
      if (!type || file.status !== "accepted") return [];

      const filename = localDemoDocumentFileName(file, type);
      const storagePath = buildDocumentStoragePath({
        applicantId: file.applicantId,
        filename,
        submissionId: submission.id,
        type,
      });

      return [
        {
          id: `${file.id}-${type}`,
          sourceMediaAssetId: file.id,
          submissionId: submission.id,
          applicantId: file.applicantId,
          ownerUserId: submission.agentId,
          type,
          storage: {
            bucket: mediaStorageBucket,
            path: storagePath,
            filename,
          },
          uploadStatus: "uploaded" as const,
          validationStatus: "passed" as const,
          exportStatus: "ready" as const,
          mime: file.mimeType ?? "image/jpeg",
          size: Math.max(1, file.sizeBytes ?? 1),
          checksum: null,
          uploadedAt: file.uploadedAtIso ?? now,
          validatedAt: file.reviewedAtIso ?? now,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }),
  );
}

function localDemoDocumentFileName(
  file: SubmissionFile,
  type: DocumentType,
): string {
  const extension = localDemoExtension(file.mimeType);
  const raw =
    file.generatedFileName ??
    file.originalFileName ??
    `${file.id}_${type}.${extension}`;
  const withExtension = /\.[a-z0-9]+$/i.test(raw) ? raw : `${raw}.${extension}`;
  const safe = withExtension
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_.-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);

  return safe || `${file.id}_${type}.${extension}`;
}

function localDemoExtension(mimeType: string | undefined): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  return "jpg";
}
