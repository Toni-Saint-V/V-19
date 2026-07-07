import { mediaStorageBucket } from "../submissions/mediaStoragePolicy";
import {
  DOCUMENT_TYPES,
  type DocumentAsset,
  type DocumentType,
  isRequiredDocumentStoragePathForAsset,
  parseDocumentStoragePath,
} from "./documentTypes";

export const REQUIRED_DOCUMENT_TYPES = DOCUMENT_TYPES;

export type DocumentValidationFailure = {
  code:
    | "bucket"
    | "duplicate"
    | "export_status"
    | "mime"
    | "missing"
    | "ownership"
    | "size"
    | "storage_path"
    | "upload_status"
    | "validation_status";
  message: string;
  type?: DocumentType;
};

export type DocumentValidationResult =
  | { ok: true; missing: DocumentType[]; failures: [] }
  | {
      ok: false;
      missing: DocumentType[];
      failures: DocumentValidationFailure[];
    };

const allowedPassportMime = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const allowedSelfieMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function validateOwnership(asset: DocumentAsset): boolean {
  const parsed = parseDocumentStoragePath(asset.storage.path);
  if (!parsed) return false;

  return (
    parsed.submissionId === asset.submissionId &&
    parsed.applicantId === asset.applicantId &&
    parsed.type === asset.type
  );
}

export function validateDocumentAsset(
  asset: DocumentAsset,
): DocumentValidationFailure[] {
  const failures: DocumentValidationFailure[] = [];

  if (asset.storage.bucket !== mediaStorageBucket) {
    failures.push({
      code: "bucket",
      message: "Document must use the private submission-media bucket.",
      type: asset.type,
    });
  }

  if (!isRequiredDocumentStoragePathForAsset(asset)) {
    failures.push({
      code: "storage_path",
      message:
        "Document storage path does not match submission/applicant/type.",
      type: asset.type,
    });
  }

  if (!validateOwnership(asset)) {
    failures.push({
      code: "ownership",
      message:
        "Document storage path belongs to a different applicant or submission.",
      type: asset.type,
    });
  }

  if (asset.uploadStatus !== "uploaded") {
    failures.push({
      code: "upload_status",
      message: "Document upload did not complete.",
      type: asset.type,
    });
  }

  if (asset.validationStatus !== "passed") {
    failures.push({
      code: "validation_status",
      message: "Document validation did not pass.",
      type: asset.type,
    });
  }

  if (asset.exportStatus !== "ready") {
    failures.push({
      code: "export_status",
      message: "Document is not marked ready for export.",
      type: asset.type,
    });
  }

  if (!Number.isFinite(asset.size ?? 0) || (asset.size ?? 0) <= 0) {
    failures.push({
      code: "size",
      message: "Document file is empty or size is unknown.",
      type: asset.type,
    });
  }

  if (asset.mime && !allowedMimeForDocument(asset.type).has(asset.mime)) {
    failures.push({
      code: "mime",
      message: "Document MIME type is not allowed for this document type.",
      type: asset.type,
    });
  }

  return failures;
}

export function validateDocuments(
  docs: DocumentAsset[],
): DocumentValidationResult {
  const failures: DocumentValidationFailure[] = [];
  const readyByType = new Map<DocumentType, DocumentAsset>();

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const typedDocs = docs.filter((doc) => doc.type === type);
    if (typedDocs.length > 1) {
      failures.push({
        code: "duplicate",
        message: `Duplicate ${type} document assets found for applicant.`,
        type,
      });
    }

    const ready = typedDocs.find(
      (doc) => validateDocumentAsset(doc).length === 0,
    );
    if (ready) readyByType.set(type, ready);
  }

  const missing = REQUIRED_DOCUMENT_TYPES.filter(
    (type) => !readyByType.has(type),
  );
  failures.push(
    ...missing.map((type) => ({
      code: "missing" as const,
      message: `Missing validated ${type}.`,
      type,
    })),
  );

  for (const doc of docs) {
    failures.push(...validateDocumentAsset(doc));
  }

  const uniqueFailures = dedupeFailures(failures);
  return uniqueFailures.length === 0
    ? { ok: true, missing, failures: [] }
    : { ok: false, missing, failures: uniqueFailures };
}

export function assertDocumentsReadyForExport(docs: DocumentAsset[]): void {
  const result = validateDocuments(docs);
  if (!result.ok) {
    const details = result.failures
      .slice(0, 3)
      .map((failure) => failure.message)
      .join(" ");
    throw new Error(details || "Documents are not ready for export.");
  }
}

function allowedMimeForDocument(type: DocumentType): Set<string> {
  return type === "passport_scan" ? allowedPassportMime : allowedSelfieMime;
}

function dedupeFailures(
  failures: DocumentValidationFailure[],
): DocumentValidationFailure[] {
  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = `${failure.code}:${failure.type ?? "*"}:${failure.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
