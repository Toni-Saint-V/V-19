import {
  buildDocumentStoragePath,
  tryNormalizeDocumentType,
  type DocumentAsset,
  type DocumentType,
} from "../documents/documentTypes";
import { mediaStorageBucket } from "./mediaStorage";
import type { ExportMediaZipOptions } from "./exportMediaZip";
import type { Submission, SubmissionFile } from "./types";
import { loadLocalDemoMedia } from "./localDemoMediaStorage";

type LocalDemoMediaLoader = (path: string) => Promise<Blob | null>;

export function buildLocalDemoExportMediaZipOptions(
  submissions: Submission[],
  loadMedia: LocalDemoMediaLoader = loadLocalDemoMedia,
): Pick<ExportMediaZipOptions, "documentAssets" | "downloadDocument"> {
  const sourceFiles = new Map(
    submissions.flatMap((submission) =>
      submission.files.map(
        (file) => [localDemoSourceFileKey(submission.id, file.id), file] as const,
      ),
    ),
  );
  return {
    documentAssets: localDemoDocumentAssetsFromSubmissionFiles(submissions),
    downloadDocument: async (asset) => {
      const sourceFile = asset.sourceMediaAssetId
        ? sourceFiles.get(
            localDemoSourceFileKey(asset.submissionId, asset.sourceMediaAssetId),
          )
        : undefined;
      if (!sourceFile || !localDemoSourceFileMatchesAsset(sourceFile, asset)) {
        return null;
      }
      if (!sourceFile.localDemoMediaStored) {
        return isBundledLocalDemoSeed(sourceFile, asset.type)
          ? loadLocalDemoJpeg(asset.type)
          : null;
      }

      if (!sourceFile.storagePath) return null;
      const stored = await loadMedia(sourceFile.storagePath);
      if (
        !isExactStoredLocalDemoMedia(stored, sourceFile) ||
        normalizeMimeType(asset.mime) !== normalizeMimeType(sourceFile.mimeType)
      ) {
        return null;
      }
      return stored;
    },
  };
}

type LocalDemoJpegType = DocumentType;

const localDemoJpegUrls: Partial<Record<LocalDemoJpegType, string>> = {
  passport_scan: new URL("../../assets/export-demo/passport_scan.jpeg", import.meta.url)
    .href,
  selfie_1: new URL("../../assets/export-demo/selfie_1.jpg", import.meta.url).href,
  selfie_2: new URL("../../assets/export-demo/selfie_2.jpg", import.meta.url).href,
};

export async function localDemoReviewMediaUrl(
  type: "passport_scan" | "selfie" | "selfie_2",
  file?: SubmissionFile,
  loadMedia: LocalDemoMediaLoader = loadLocalDemoMedia,
): Promise<string | null> {
  if (file?.localDemoMediaStored) {
    if (!file.storagePath) return null;
    const expectedDocumentType = type === "selfie" ? "selfie_1" : type;
    if (tryNormalizeDocumentType(file.type) !== expectedDocumentType) return null;
    const stored = await loadMedia(file.storagePath);
    if (!isExactStoredLocalDemoMedia(stored, file)) return null;
    if (typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(stored);
  }

  const documentType = type === "selfie" ? "selfie_1" : type;
  return file && isBundledLocalDemoSeed(file, documentType)
    ? (localDemoJpegUrls[documentType] ?? null)
    : null;
}

const localDemoJpegFallbackBase64 =
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+SvhF+zv4P8AFHhnSPE/jrxImlprayyQxKBuRI5fKUHJALPtYjsBiu6+NX7LvgfRvhfffEr4W6i95baAYzdFyWFxDIwUvj+F0ZsHHDAdM1h/CD9pvSfC/wAJ7bwHr+jn7d4cnd9P1OGLeqwXMnmMk+OQ8cnMT4IIJUgcE9B8af2vtO8V/B6b4TeFtOZZtXaM3960fkxiBGDiOJfvMXIG5mAHHGc5GEeb2jT2O+oqf1dOPxX+fqf/2Q==";

async function loadLocalDemoJpeg(type: LocalDemoJpegType): Promise<Blob | null> {
  const assetUrl = localDemoJpegUrls[type];
  if (!assetUrl) return null;

  try {
    const response = await fetch(assetUrl);
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (hasJpegSignature(bytes)) {
        return new Blob([toArrayBuffer(bytes)], { type: "image/jpeg" });
      }
    }
  } catch {
    // Node-based package verification cannot fetch file: URLs.
  }

  const fallback = decodeBase64Bytes(localDemoJpegFallbackBase64);
  return hasJpegSignature(fallback)
    ? new Blob([toArrayBuffer(fallback)], { type: "image/jpeg" })
    : null;
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

function localDemoSourceFileKey(submissionId: string, fileId: string): string {
  return JSON.stringify([submissionId, fileId]);
}

function localDemoSourceFileMatchesAsset(
  file: SubmissionFile,
  asset: DocumentAsset,
): boolean {
  return (
    file.applicantId === asset.applicantId &&
    tryNormalizeDocumentType(file.type) === asset.type
  );
}

function normalizeMimeType(value: string | null | undefined): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isBundledLocalDemoSeed(
  file: SubmissionFile,
  expectedType: DocumentType,
): boolean {
  const sourceNames = [file.generatedFileName, file.originalFileName].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return Boolean(
    file.localDemoSeedMedia === true &&
    file.localDemoMediaStored !== true &&
    tryNormalizeDocumentType(file.type) === expectedType &&
    normalizeMimeType(file.mimeType) === "image/jpeg" &&
    sourceNames.length > 0 &&
    sourceNames.every((name) => /\.jpe?g$/i.test(name)),
  );
}

function isExactStoredLocalDemoMedia(
  stored: Blob | null,
  file: SubmissionFile,
): stored is Blob {
  const expectedMimeType = normalizeMimeType(file.mimeType);
  return Boolean(
    stored &&
    Number.isSafeInteger(file.sizeBytes) &&
    (file.sizeBytes ?? 0) > 0 &&
    stored.size === file.sizeBytes &&
    expectedMimeType &&
    normalizeMimeType(stored.type) === expectedMimeType,
  );
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

function localDemoDocumentFileName(file: SubmissionFile, type: DocumentType): string {
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
