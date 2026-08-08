import { isPersistablePrivateFileAssetAtSubmissionTarget } from "./fileAsset";
import type { MediaStorageTarget } from "./mediaStorage";
import type { Submission, SubmissionFileType } from "./types";

type LoadProtectedMedia = (target: MediaStorageTarget) => Promise<Blob | null>;

type ReadProtectedSubmissionMediaInput = {
  applicantId: string;
  fileType: SubmissionFileType;
  loadMedia: LoadProtectedMedia;
  submission: Submission;
};

function normalizedMimeType(value: string | undefined) {
  return value?.split(";")[0]?.trim().toLocaleLowerCase() ?? "";
}

/**
 * Resolves bytes only after the canonical submission proves exact ownership of
 * the private storage identity currently requested by the UI.
 */
export async function readProtectedSubmissionMedia({
  applicantId,
  fileType,
  loadMedia,
  submission,
}: ReadProtectedSubmissionMediaInput) {
  const file = submission.files.find(
    (candidate) => candidate.applicantId === applicantId && candidate.type === fileType,
  );
  if (
    !file ||
    !isPersistablePrivateFileAssetAtSubmissionTarget(file, {
      applicantId,
      fileType,
      submissionId: submission.id,
    })
  ) {
    throw new Error(
      "Защищённый файл не принадлежит выбранной подаче или больше недоступен.",
    );
  }

  const target: MediaStorageTarget = {
    bucket: file.storageBucket,
    path: file.storagePath,
  };
  const blob = await loadMedia(target);
  if (!blob) {
    throw new Error("Защищённый объект отсутствует. Метаданные подачи не изменены.");
  }

  const canonicalMimeType = normalizedMimeType(file.mimeType);
  const objectMimeType = normalizedMimeType(blob.type);
  const sizeMismatch =
    typeof file.sizeBytes === "number" && file.sizeBytes !== blob.size;
  const mimeMismatch = Boolean(
    canonicalMimeType && objectMimeType && canonicalMimeType !== objectMimeType,
  );
  if (sizeMismatch || mimeMismatch) {
    throw new Error(
      "Защищённый объект не совпадает с canonical metadata. Файл не открыт.",
    );
  }

  return { blob, file };
}
