import {
  isRejectedLegacyMediaType,
  toCanonicalStorageMediaType,
} from "./canonicalMediaContract";
import type { CanonicalFrontendMediaType } from "./canonicalMediaContract";
import type { MediaSlot } from "../../types/domain";
import { maxVisaApplicationPdfBytes } from "./visaApplicationPdfReviewTypes";

export const mediaStorageBucket = "submission-media";
export type MediaStorageObjectType =
  | "application_pdf"
  | CanonicalFrontendMediaType
  | "appointment_pdf"
  | "visa_application_pdf";

const mediaStorageObjectTypes = new Set<MediaStorageObjectType>([
  "application_pdf",
  "appointment_pdf",
  "passport_scan",
  "selfie",
  "selfie_2",
  "visa_application_pdf",
]);
const legacyArchiveMediaStorageObjectTypes = new Set(["photo_white", "video"]);
const appointmentPdfApplicantId = "common";
const submissionStoragePrefix = "submissions";
const applicantStoragePrefix = "applicants";
export const selfieUploadMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
] as const;
export const selfieUploadAccept = selfieUploadMimeTypes.join(",");
export const selfieUploadFormatLabel = "JPEG, PNG, HEIC или HEIF";
export const passportScanUploadMimeTypes = [
  ...selfieUploadMimeTypes,
  "application/pdf",
] as const;
export const passportScanUploadAccept = passportScanUploadMimeTypes.join(",");
export const passportScanUploadFormatLabel = "JPEG, PNG, HEIC, HEIF или PDF";
export const passportScanUploadMaxBytes = 50 * 1024 * 1024;
const passportScanUploadExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "heic",
  "heif",
  "pdf",
]);

export interface MediaStorageTarget {
  bucket: typeof mediaStorageBucket;
  path: string;
}

export interface MediaStorageValidationInput {
  allowLegacyArchive?: boolean;
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

  if (trimmed === "." || trimmed === "..") {
    throw new MediaStorageValidationError(`${label} cannot be a traversal segment.`);
  }

  if (!/^[\p{L}\p{N}_.-]+$/u.test(trimmed)) {
    throw new MediaStorageValidationError(
      `${label} may contain only letters, numbers, dots, dashes and underscores.`,
    );
  }

  return trimmed;
}

function extensionForFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === trimmed.length - 1) return "";
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

function allowedExtensions(type: MediaStorageObjectType): Set<string> {
  if (type === "application_pdf") return new Set(["pdf"]);
  if (type === "appointment_pdf") return new Set(["pdf"]);
  if (type === "visa_application_pdf") return new Set(["pdf"]);
  if (type === "passport_scan")
    return new Set(["jpg", "jpeg", "png", "heic", "heif", "pdf"]);
  return new Set(["jpg", "jpeg", "png", "heic", "heif"]);
}

function allowedLegacyArchiveExtensions(type: string): Set<string> {
  return type === "video" ? new Set(["mp4"]) : new Set(["jpg", "jpeg", "png"]);
}

function allowedMimeTypes(type: MediaStorageObjectType): Set<string> {
  if (type === "application_pdf") return new Set(["application/pdf"]);
  if (type === "appointment_pdf") return new Set(["application/pdf"]);
  if (type === "visa_application_pdf") return new Set(["application/pdf"]);
  if (type === "passport_scan") return new Set(passportScanUploadMimeTypes);
  return new Set(selfieUploadMimeTypes);
}

function allowedLegacyArchiveMimeTypes(type: string): Set<string> {
  return type === "video"
    ? new Set(["video/mp4"])
    : new Set(["image/jpeg", "image/png"]);
}

function mimeTypeForExtension(extension: string): string | null {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "mp4") return "video/mp4";
  if (extension === "pdf") return "application/pdf";
  return null;
}

export function mediaMimeTypeForFile(file: Pick<File, "name" | "type">): string | null {
  const explicitMimeType = file.type.trim();
  return explicitMimeType || mimeTypeForExtension(extensionForFileName(file.name));
}

function maxSizeBytes(type: MediaStorageObjectType): number {
  if (type === "application_pdf") return maxVisaApplicationPdfBytes;
  if (type === "appointment_pdf") return maxVisaApplicationPdfBytes;
  if (type === "visa_application_pdf") return maxVisaApplicationPdfBytes;
  return passportScanUploadMaxBytes;
}

function maxLegacyArchiveSizeBytes(type: string): number {
  return type === "video" ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
}

function parseStoragePath(
  path: string,
  options: { allowLegacyArchive?: boolean } = {},
): {
  submissionId: string;
  applicantId: string;
  type: string;
  fileName: string;
  normalizedPath: string;
} {
  const parts = path.split("/");
  let submissionId: string;
  let applicantId: string;
  let type: string;
  let fileName: string;

  if (
    parts.length === 6 &&
    parts[0] === submissionStoragePrefix &&
    parts[2] === applicantStoragePrefix
  ) {
    [, submissionId, , applicantId, type, fileName] = parts;
  } else if (
    parts.length === 5 &&
    parts[0] === submissionStoragePrefix &&
    parts[2] === appointmentPdfApplicantId
  ) {
    [, submissionId, applicantId, type, fileName] = parts;
  } else {
    throw new MediaStorageValidationError(
      "Media storage path must be submissions/<submissionId>/applicants/<applicantId>/<slotType>/<generatedFileName>.",
    );
  }

  if (
    !mediaStorageObjectTypes.has(type as MediaStorageObjectType) &&
    !(options.allowLegacyArchive && legacyArchiveMediaStorageObjectTypes.has(type))
  ) {
    throw new MediaStorageValidationError(
      "Media storage path contains an invalid slot type.",
    );
  }

  if (
    applicantId === appointmentPdfApplicantId &&
    type !== "application_pdf" &&
    type !== "appointment_pdf"
  ) {
    throw new MediaStorageValidationError(
      "Common storage paths are allowed only for admin PDF artifacts.",
    );
  }
  if (
    applicantId !== appointmentPdfApplicantId &&
    (type === "application_pdf" || type === "appointment_pdf")
  ) {
    throw new MediaStorageValidationError(
      "Admin PDF artifacts must use the common storage path.",
    );
  }

  return {
    submissionId: safePathSegment(submissionId ?? "", "submissionId"),
    applicantId: safePathSegment(applicantId ?? "", "applicantId"),
    type,
    fileName: safePathSegment(fileName ?? "", "generatedFileName"),
    normalizedPath:
      applicantId === appointmentPdfApplicantId
        ? `${submissionStoragePrefix}/${safePathSegment(
            submissionId ?? "",
            "submissionId",
          )}/${appointmentPdfApplicantId}/${type}/${safePathSegment(
            fileName ?? "",
            "generatedFileName",
          )}`
        : `${submissionStoragePrefix}/${safePathSegment(
            submissionId ?? "",
            "submissionId",
          )}/${applicantStoragePrefix}/${safePathSegment(
            applicantId ?? "",
            "applicantId",
          )}/${type}/${safePathSegment(fileName ?? "", "generatedFileName")}`,
  };
}

function hasExpectedGeneratedSuffix(
  type: MediaStorageObjectType,
  fileName: string,
): boolean {
  if (type === "selfie")
    return /^[a-zA-Z0-9]+_selfie\.(jpg|jpeg|png|heic|heif)$/.test(fileName);
  if (type === "selfie_2")
    return /^[a-zA-Z0-9]+_selfie_2\.(jpg|jpeg|png|heic|heif)$/.test(fileName);
  if (type === "passport_scan")
    return /^[a-zA-Z0-9]+_passport_scan\.(jpg|jpeg|png|heic|heif|pdf)$/.test(fileName);
  if (type === "application_pdf")
    return /^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)?_application_pdf\.pdf$/.test(fileName);
  if (type === "appointment_pdf")
    return /^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)?_appointment_pdf\.pdf$/.test(fileName);
  if (type === "visa_application_pdf")
    return /^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)?_visa_application_pdf\.pdf$/.test(fileName);
  return false;
}

function hasExpectedLegacyArchiveSuffix(type: string, fileName: string): boolean {
  if (type === "photo_white")
    return /^[a-zA-Z0-9]+_photo_white\.(jpg|jpeg|png)$/.test(fileName);
  if (type === "video") return /^[a-zA-Z0-9]+_video\.mp4$/.test(fileName);
  return false;
}

export function validateMediaStorageTarget({
  allowLegacyArchive = false,
  target,
  file,
}: MediaStorageValidationInput): MediaStorageTarget {
  if (target.bucket !== mediaStorageBucket) {
    throw new MediaStorageValidationError(
      "Media uploads must use the private submission-media bucket.",
    );
  }

  const parsed = parseStoragePath(target.path, { allowLegacyArchive });
  const extension = extensionForFileName(parsed.fileName);
  const isLegacyArchive =
    allowLegacyArchive && legacyArchiveMediaStorageObjectTypes.has(parsed.type);
  const extensionAllowed = isLegacyArchive
    ? allowedLegacyArchiveExtensions(parsed.type).has(extension)
    : allowedExtensions(parsed.type as MediaStorageObjectType).has(extension);
  if (!extensionAllowed) {
    throw new MediaStorageValidationError(
      `File extension is not allowed for ${parsed.type}.`,
    );
  }

  if (target.path !== parsed.normalizedPath) {
    throw new MediaStorageValidationError(
      "Media storage path contains unsafe normalization differences.",
    );
  }

  const generatedSuffixValid = isLegacyArchive
    ? hasExpectedLegacyArchiveSuffix(parsed.type, parsed.fileName)
    : hasExpectedGeneratedSuffix(
        parsed.type as MediaStorageObjectType,
        parsed.fileName,
      );
  if (!generatedSuffixValid) {
    throw new MediaStorageValidationError(
      "Generated file name must use generated slot naming and must not include user supplied names.",
    );
  }

  if (file) {
    const fileType = file.type.trim();
    const mimeAllowed = isLegacyArchive
      ? allowedLegacyArchiveMimeTypes(parsed.type).has(fileType)
      : allowedMimeTypes(parsed.type as MediaStorageObjectType).has(fileType);
    if (fileType && !mimeAllowed) {
      throw new MediaStorageValidationError(
        `MIME type is not allowed for ${parsed.type}.`,
      );
    }

    if (fileType && mimeTypeForExtension(extension) !== fileType) {
      throw new MediaStorageValidationError(
        "File MIME type must match the generated file extension.",
      );
    }

    if (
      !Number.isInteger(file.size) ||
      file.size <= 0 ||
      file.size >
        (isLegacyArchive
          ? maxLegacyArchiveSizeBytes(parsed.type)
          : maxSizeBytes(parsed.type as MediaStorageObjectType))
    ) {
      throw new MediaStorageValidationError(
        `File size is outside the allowed ${parsed.type} limit.`,
      );
    }
  }

  return target;
}

export function mediaStorageTargetSubmissionId(target: MediaStorageTarget): string {
  validateMediaStorageTarget({ target });
  return parseStoragePath(target.path).submissionId;
}

export function isPassportScanUploadFileAccepted(
  file: Pick<File, "name" | "type">,
): boolean {
  const fileType = file.type.trim();
  if (fileType) {
    return allowedMimeTypes("passport_scan").has(fileType);
  }

  return passportScanUploadExtensions.has(extensionForFileName(file.name));
}

export type PassportScanUploadFileValidation =
  | {
      ok: true;
      mimeType: (typeof passportScanUploadMimeTypes)[number];
      ocrMode: "manual_review" | "supported";
    }
  | {
      code: "empty_file" | "file_too_large" | "unsupported_format";
      message: string;
      ok: false;
    };

export function validatePassportScanUploadFile(
  file: Pick<File, "name" | "size" | "type">,
): PassportScanUploadFileValidation {
  if (!isPassportScanUploadFileAccepted(file)) {
    return {
      code: "unsupported_format",
      message: `Выберите паспорт в формате ${passportScanUploadFormatLabel}.`,
      ok: false,
    };
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    return {
      code: "empty_file",
      message: "Файл паспорта пуст. Выберите другой файл.",
      ok: false,
    };
  }
  if (file.size > passportScanUploadMaxBytes) {
    return {
      code: "file_too_large",
      message: "Файл паспорта больше 50 МБ. Уменьшите его и повторите загрузку.",
      ok: false,
    };
  }

  const mimeType = mediaMimeTypeForFile(file);
  if (
    !mimeType ||
    !passportScanUploadMimeTypes.includes(
      mimeType as (typeof passportScanUploadMimeTypes)[number],
    )
  ) {
    return {
      code: "unsupported_format",
      message: `Выберите паспорт в формате ${passportScanUploadFormatLabel}.`,
      ok: false,
    };
  }

  return {
    mimeType: mimeType as (typeof passportScanUploadMimeTypes)[number],
    ocrMode:
      mimeType === "image/heic" || mimeType === "image/heif"
        ? "manual_review"
        : "supported",
    ok: true,
  };
}

export function buildMediaStoragePath(
  submissionId: string,
  applicantId: string,
  type: string,
  generatedFileName: string,
  options: { allowLegacyArchive?: boolean } = {},
): MediaStorageTarget {
  const safeSubmissionId = safePathSegment(submissionId, "submissionId");
  const safeApplicantId = safePathSegment(applicantId, "applicantId");
  const safeGeneratedFileName = safePathSegment(generatedFileName, "generatedFileName");
  const target: MediaStorageTarget = {
    bucket: mediaStorageBucket,
    path:
      safeApplicantId === appointmentPdfApplicantId
        ? `${submissionStoragePrefix}/${safeSubmissionId}/${appointmentPdfApplicantId}/${type}/${safeGeneratedFileName}`
        : `${submissionStoragePrefix}/${safeSubmissionId}/${applicantStoragePrefix}/${safeApplicantId}/${type}/${safeGeneratedFileName}`,
  };

  return validateMediaStorageTarget({ ...options, target });
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

  const mediaType = toCanonicalStorageMediaType(slot.type);
  if (mediaType.ok) {
    return buildMediaStoragePath(
      submissionId,
      applicantId,
      mediaType.data,
      slot.generatedFileName,
    );
  }
  if (!isRejectedLegacyMediaType(slot.type)) {
    throw new MediaStorageValidationError(mediaType.reason);
  }

  return buildMediaStoragePath(
    submissionId,
    applicantId,
    slot.type,
    slot.generatedFileName,
    { allowLegacyArchive: true },
  );
}

export function buildVisaApplicationPdfStorageTarget(input: {
  applicantId: string;
  nonce?: string;
  sha256: string;
  submissionId: string;
}): MediaStorageTarget {
  const checksumPrefix = assertVisaApplicationPdfSha256(input.sha256).slice(0, 16);
  const nonceSegment = safeVisaApplicationPdfStorageNonce(input.nonce);
  return buildMediaStoragePath(
    input.submissionId,
    input.applicantId,
    "visa_application_pdf",
    `${safePathSegment(checksumPrefix, "sha256")}${nonceSegment}_visa_application_pdf.pdf`,
  );
}

export function buildApplicationPdfStorageTarget(input: {
  nonce?: string;
  sha256: string;
  submissionId: string;
}): MediaStorageTarget {
  const checksumPrefix = assertVisaApplicationPdfSha256(input.sha256).slice(0, 16);
  const nonceSegment = safeVisaApplicationPdfStorageNonce(input.nonce);
  return buildMediaStoragePath(
    input.submissionId,
    appointmentPdfApplicantId,
    "application_pdf",
    `${safePathSegment(checksumPrefix, "sha256")}${nonceSegment}_application_pdf.pdf`,
  );
}

export function buildAppointmentPdfStorageTarget(input: {
  nonce?: string;
  sha256: string;
  submissionId: string;
}): MediaStorageTarget {
  const checksumPrefix = assertVisaApplicationPdfSha256(input.sha256).slice(0, 16);
  const nonceSegment = safeVisaApplicationPdfStorageNonce(input.nonce);
  return buildMediaStoragePath(
    input.submissionId,
    appointmentPdfApplicantId,
    "appointment_pdf",
    `${safePathSegment(checksumPrefix, "sha256")}${nonceSegment}_appointment_pdf.pdf`,
  );
}

export function validateApplicationPdfStorageTarget({
  file,
  sha256,
  submissionId,
  target,
}: MediaStorageValidationInput & {
  sha256: string;
  submissionId: string;
}): MediaStorageTarget {
  const validated = validateMediaStorageTarget({ file, target });
  const parsed = parseStoragePath(validated.path);
  const checksumPrefix = assertVisaApplicationPdfSha256(sha256).slice(0, 16);

  if (
    parsed.submissionId !== safePathSegment(submissionId, "submissionId") ||
    parsed.applicantId !== appointmentPdfApplicantId ||
    parsed.type !== "application_pdf" ||
    !parsed.fileName.startsWith(checksumPrefix)
  ) {
    throw new MediaStorageValidationError(
      "Application PDF storage identity must match the current submission and checksum.",
    );
  }

  return validated;
}

export function validateAppointmentPdfStorageTarget({
  file,
  sha256,
  submissionId,
  target,
}: MediaStorageValidationInput & {
  sha256: string;
  submissionId: string;
}): MediaStorageTarget {
  const validated = validateMediaStorageTarget({ file, target });
  const parsed = parseStoragePath(validated.path);
  const checksumPrefix = assertVisaApplicationPdfSha256(sha256).slice(0, 16);

  if (
    parsed.submissionId !== safePathSegment(submissionId, "submissionId") ||
    parsed.applicantId !== appointmentPdfApplicantId ||
    parsed.type !== "appointment_pdf" ||
    !parsed.fileName.startsWith(checksumPrefix)
  ) {
    throw new MediaStorageValidationError(
      "Appointment PDF storage identity must match the current submission and checksum.",
    );
  }

  return validated;
}

export function validateVisaApplicationPdfStorageTarget({
  applicantId,
  file,
  sha256,
  submissionId,
  target,
}: MediaStorageValidationInput & {
  applicantId: string;
  sha256: string;
  submissionId: string;
}): MediaStorageTarget {
  const validated = validateMediaStorageTarget({ file, target });
  const parsed = parseStoragePath(validated.path);
  const checksumPrefix = assertVisaApplicationPdfSha256(sha256).slice(0, 16);

  if (
    parsed.submissionId !== safePathSegment(submissionId, "submissionId") ||
    parsed.applicantId !== safePathSegment(applicantId, "applicantId") ||
    parsed.type !== "visa_application_pdf" ||
    !parsed.fileName.startsWith(checksumPrefix)
  ) {
    throw new MediaStorageValidationError(
      "Visa application PDF storage identity must match the current submission, applicant and checksum.",
    );
  }

  return validated;
}

export function assertVisaApplicationPdfSha256(sha256: string) {
  const normalized = sha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new MediaStorageValidationError(
      "Visa application PDF artifact must include a full SHA-256 checksum.",
    );
  }
  return normalized;
}

function safeVisaApplicationPdfStorageNonce(nonce: string | undefined) {
  if (!nonce) return "";
  const normalized = nonce.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  if (!normalized) {
    throw new MediaStorageValidationError(
      "visaApplicationPdf upload nonce is invalid.",
    );
  }
  return `_${normalized}`;
}
