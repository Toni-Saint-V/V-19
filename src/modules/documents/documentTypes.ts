import { mediaStorageBucket } from "../submissions/mediaStoragePolicy";
import type { Applicant, Submission } from "../submissions/types";

export const DOCUMENT_TYPES = [
  "passport_scan",
  "selfie_1",
  "selfie_2",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type LegacyDocumentType = DocumentType | "selfie";

export type DocumentUploadStatus = "pending" | "uploaded" | "failed";
export type DocumentValidationStatus = "pending" | "passed" | "failed";
export type DocumentExportStatus = "not_ready" | "ready" | "exported";

export type DocumentStorageIdentity = {
  bucket: typeof mediaStorageBucket;
  path: string;
  filename: string | null;
};

export type DocumentAsset = {
  id: string;
  sourceMediaAssetId?: string | null;
  submissionId: string;
  applicantId: string;
  ownerUserId: string | null;
  type: DocumentType;
  storage: DocumentStorageIdentity;
  uploadStatus: DocumentUploadStatus;
  validationStatus: DocumentValidationStatus;
  exportStatus: DocumentExportStatus;
  mime: string | null;
  size: number | null;
  checksum: string | null;
  uploadedAt: string | null;
  validatedAt: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type DocumentAssetRow = {
  id: string;
  source_media_asset_id: string | null;
  submission_id: string;
  applicant_id: string;
  owner_user_id: string | null;
  type: DocumentType;
  bucket: typeof mediaStorageBucket;
  storage_path: string;
  filename: string | null;
  upload_status: DocumentUploadStatus;
  validation_status: DocumentValidationStatus;
  export_status: DocumentExportStatus;
  mime: string | null;
  size: number | null;
  checksum: string | null;
  uploaded_at: string | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type DocumentAssetInsert = Omit<
  DocumentAssetRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string | null;
};

export type ParsedDocumentStoragePath = {
  applicantId: string;
  filename: string;
  pathTypeSegment: string;
  submissionId: string;
  type: DocumentType;
};

export type DocumentArchiveContext = {
  applicant: Applicant;
  applicantIndex: number;
  submission: Submission;
};

const documentTypeSet = new Set<string>(DOCUMENT_TYPES);

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && documentTypeSet.has(value);
}

export function normalizeDocumentType(type: string): DocumentType {
  const normalized = type.trim();
  if (normalized === "selfie") return "selfie_1";
  if (isDocumentType(normalized)) return normalized;
  throw new Error(`Unsupported document type: ${type}`);
}

export function tryNormalizeDocumentType(value: unknown): DocumentType | null {
  if (typeof value !== "string") return null;
  try {
    return normalizeDocumentType(value);
  } catch {
    return null;
  }
}

export function documentTypeToFrontendMediaType(
  type: DocumentType,
): "passport_scan" | "selfie" | "selfie_2" {
  if (type === "selfie_1") return "selfie";
  return type;
}

export function storagePathSegmentForDocumentType(type: DocumentType): string {
  return type;
}

export function archiveDocumentName(
  type: DocumentType,
): "passport" | "selfie_1" | "selfie_2" {
  if (type === "passport_scan") return "passport";
  return type;
}

export function parseDocumentStoragePath(
  path: string,
): ParsedDocumentStoragePath | null {
  const parts = path.split("/");
  if (
    parts.length !== 6 ||
    parts[0] !== "submissions" ||
    parts[2] !== "applicants"
  ) {
    return null;
  }

  const [, submissionId, , applicantId, rawType, filename] = parts;
  if (!submissionId || !applicantId || !rawType || !filename) return null;

  const type = tryNormalizeDocumentType(rawType);
  if (!type) return null;

  return {
    applicantId,
    filename,
    pathTypeSegment: rawType,
    submissionId,
    type,
  };
}

export function buildDocumentStoragePath(input: {
  applicantId: string;
  filename: string;
  submissionId: string;
  type: DocumentType;
}): string {
  return [
    "submissions",
    safeStorageSegment(input.submissionId, "submissionId"),
    "applicants",
    safeStorageSegment(input.applicantId, "applicantId"),
    storagePathSegmentForDocumentType(input.type),
    safeStorageSegment(input.filename, "filename"),
  ].join("/");
}

export function mapDocumentAssetRow(row: DocumentAssetRow): DocumentAsset {
  return {
    id: row.id,
    sourceMediaAssetId: row.source_media_asset_id,
    submissionId: row.submission_id,
    applicantId: row.applicant_id,
    ownerUserId: row.owner_user_id,
    type: normalizeDocumentType(row.type),
    storage: {
      bucket: row.bucket,
      path: row.storage_path,
      filename: row.filename,
    },
    uploadStatus: row.upload_status,
    validationStatus: row.validation_status,
    exportStatus: row.export_status,
    mime: row.mime,
    size: row.size,
    checksum: row.checksum,
    uploadedAt: row.uploaded_at,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function documentAssetToRow(asset: DocumentAsset): DocumentAssetRow {
  return {
    id: asset.id,
    source_media_asset_id: asset.sourceMediaAssetId ?? null,
    submission_id: asset.submissionId,
    applicant_id: asset.applicantId,
    owner_user_id: asset.ownerUserId,
    type: asset.type,
    bucket: asset.storage.bucket,
    storage_path: asset.storage.path,
    filename: asset.storage.filename,
    upload_status: asset.uploadStatus,
    validation_status: asset.validationStatus,
    export_status: asset.exportStatus,
    mime: asset.mime,
    size: asset.size,
    checksum: asset.checksum,
    uploaded_at: asset.uploadedAt,
    validated_at: asset.validatedAt,
    created_at: asset.createdAt,
    updated_at: asset.updatedAt ?? null,
  };
}

export function documentExtension(
  asset: Pick<DocumentAsset, "mime" | "storage">,
): string {
  const filename =
    asset.storage.filename ?? asset.storage.path.split("/").pop() ?? "";
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension) return extension;
  if (asset.mime === "application/pdf") return "pdf";
  if (asset.mime === "image/png") return "png";
  if (asset.mime === "image/webp") return "webp";
  if (asset.mime === "image/heic") return "heic";
  if (asset.mime === "image/heif") return "heif";
  return "jpg";
}

export function isRequiredDocumentStoragePathForAsset(
  asset: DocumentAsset,
): boolean {
  const parsed = parseDocumentStoragePath(asset.storage.path);
  if (!parsed) return false;

  return (
    parsed.submissionId === asset.submissionId &&
    parsed.applicantId === asset.applicantId &&
    parsed.type === asset.type &&
    parsed.filename === (asset.storage.filename ?? parsed.filename)
  );
}

function safeStorageSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed === "." || trimmed === ".." || trimmed.includes("/")) {
    throw new Error(`${label} is not a safe storage segment.`);
  }
  if (!/^[\p{L}\p{N}_.-]+$/u.test(trimmed)) {
    throw new Error(`${label} contains unsafe storage characters.`);
  }
  return trimmed;
}
