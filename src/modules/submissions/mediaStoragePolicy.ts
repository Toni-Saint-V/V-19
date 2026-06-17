import type { MediaSlot, MediaSlotType } from "../../types/domain";

export const mediaStorageBucket = "submission-media";

const mediaSlotTypes = new Set<MediaSlotType>([
  "photo_white",
  "selfie",
  "selfie_2",
  "passport_scan",
  "video",
]);

export interface MediaStorageTarget {
  bucket: typeof mediaStorageBucket;
  path: string;
}

export interface MediaStorageValidationInput {
  target: MediaStorageTarget;
  file?: Pick<File, "name" | "size" | "type">;
}

export class MediaStorageValidationError extends Error {
  readonly code = "MEDIA_STORAGE_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "MediaStorageValidationError";
  }
}

function safePathSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MediaStorageValidationError(`${label} is required.`);
  }

  if (!/^[\p{L}\p{N}_.-]+$/u.test(trimmed)) {
    throw new MediaStorageValidationError(
      `${label} may contain only letters, numbers, dots, dashes and underscores.`,
    );
  }

  return trimmed;
}

function extensionForFileName(fileName: string): string {
  return fileName.split(".").at(-1)?.toLowerCase() ?? "";
}

function allowedExtensions(type: MediaSlotType): Set<string> {
  if (type === "passport_scan") return new Set(["jpg", "jpeg", "png", "pdf"]);
  return type === "video" ? new Set(["mp4"]) : new Set(["jpg", "jpeg", "png"]);
}

function allowedMimeTypes(type: MediaSlotType): Set<string> {
  if (type === "passport_scan")
    return new Set(["image/jpeg", "image/png", "application/pdf"]);
  return type === "video"
    ? new Set(["video/mp4"])
    : new Set(["image/jpeg", "image/png"]);
}

function mimeTypeForExtension(extension: string): string | null {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "mp4") return "video/mp4";
  if (extension === "pdf") return "application/pdf";
  return null;
}

function maxSizeBytes(type: MediaSlotType): number {
  return type === "video" ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
}

function parseStoragePath(path: string): {
  submissionId: string;
  applicantId: string;
  type: MediaSlotType;
  fileName: string;
} {
  const parts = path.split("/");
  if (parts.length !== 4) {
    throw new MediaStorageValidationError(
      "Media storage path must be <submissionId>/<applicantId>/<slotType>/<generatedFileName>.",
    );
  }

  const [submissionId, applicantId, type, fileName] = parts;
  if (!mediaSlotTypes.has(type as MediaSlotType)) {
    throw new MediaStorageValidationError(
      "Media storage path contains an invalid slot type.",
    );
  }

  return {
    submissionId: safePathSegment(submissionId, "submissionId"),
    applicantId: safePathSegment(applicantId, "applicantId"),
    type: type as MediaSlotType,
    fileName: safePathSegment(fileName, "generatedFileName"),
  };
}

function hasExpectedGeneratedSuffix(type: MediaSlotType, fileName: string): boolean {
  if (type === "photo_white")
    return /^[a-zA-Z0-9]+_photo_white\.(jpg|jpeg|png)$/.test(fileName);
  if (type === "selfie") return /^[a-zA-Z0-9]+_selfie\.(jpg|jpeg|png)$/.test(fileName);
  if (type === "selfie_2")
    return /^[a-zA-Z0-9]+_selfie_2\.(jpg|jpeg|png)$/.test(fileName);
  if (type === "passport_scan")
    return /^[a-zA-Z0-9]+_passport_scan\.(jpg|jpeg|png|pdf)$/.test(fileName);
  return /^[a-zA-Z0-9]+_video\.mp4$/.test(fileName);
}

export function validateMediaStorageTarget({
  target,
  file,
}: MediaStorageValidationInput): MediaStorageTarget {
  if (target.bucket !== mediaStorageBucket) {
    throw new MediaStorageValidationError(
      "Media uploads must use the private submission-media bucket.",
    );
  }

  const parsed = parseStoragePath(target.path);
  const extension = extensionForFileName(parsed.fileName);
  if (!allowedExtensions(parsed.type).has(extension)) {
    throw new MediaStorageValidationError(
      `File extension is not allowed for ${parsed.type}.`,
    );
  }

  const expectedPath = `${parsed.submissionId}/${parsed.applicantId}/${parsed.type}/${parsed.fileName}`;
  if (target.path !== expectedPath) {
    throw new MediaStorageValidationError(
      "Media storage path contains unsafe normalization differences.",
    );
  }

  if (!hasExpectedGeneratedSuffix(parsed.type, parsed.fileName)) {
    throw new MediaStorageValidationError(
      "Generated file name must use generated slot naming and must not include user supplied names.",
    );
  }

  if (file) {
    if (!allowedMimeTypes(parsed.type).has(file.type)) {
      throw new MediaStorageValidationError(
        `MIME type is not allowed for ${parsed.type}.`,
      );
    }

    if (mimeTypeForExtension(extension) !== file.type) {
      throw new MediaStorageValidationError(
        "File MIME type must match the generated file extension.",
      );
    }

    if (
      !Number.isInteger(file.size) ||
      file.size <= 0 ||
      file.size > maxSizeBytes(parsed.type)
    ) {
      throw new MediaStorageValidationError(
        `File size is outside the allowed ${parsed.type} limit.`,
      );
    }
  }

  return target;
}

export function buildMediaStoragePath(
  submissionId: string,
  applicantId: string,
  type: MediaSlotType,
  generatedFileName: string,
): MediaStorageTarget {
  const target: MediaStorageTarget = {
    bucket: mediaStorageBucket,
    path: `${safePathSegment(submissionId, "submissionId")}/${safePathSegment(
      applicantId,
      "applicantId",
    )}/${type}/${safePathSegment(generatedFileName, "generatedFileName")}`,
  };

  return validateMediaStorageTarget({ target });
}

export function storageTargetForSlot(
  submissionId: string,
  applicantId: string,
  slot: MediaSlot,
): MediaStorageTarget {
  if (!slot.generatedFileName) {
    throw new MediaStorageValidationError(
      "Media slot must have a generated file name before Supabase upload.",
    );
  }

  return buildMediaStoragePath(
    submissionId,
    applicantId,
    slot.type,
    slot.generatedFileName,
  );
}
