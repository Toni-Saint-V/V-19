import {
  mediaStorageTargetSubmissionId,
  type MediaStorageTarget,
} from "./mediaStoragePolicy";
import type { Submission } from "./types";

export class UploadedMediaPersistenceUncertainError extends Error {
  constructor(options: ErrorOptions) {
    super(
      "Не удалось подтвердить сохранение файла. Объект оставлен в защищённом хранилище до канонической сверки.",
      options,
    );
    this.name = "UploadedMediaPersistenceUncertainError";
  }
}

export class UploadedMediaCleanupError extends Error {
  constructor(options: ErrorOptions) {
    super(
      "Изменение подачи не сохранено, но загруженный объект не удалось удалить. Требуется операторская очистка.",
      options,
    );
    this.name = "UploadedMediaCleanupError";
  }
}

export function submissionReferencesMediaTarget(
  submission: Submission | null,
  target: MediaStorageTarget,
): boolean {
  return Boolean(
    submission?.files.some(
      (file) =>
        file.storageBucket === target.bucket && file.storagePath === target.path,
    ),
  );
}

export async function persistUploadedMediaWithRecovery(options: {
  deleteUploadedMedia: (target: MediaStorageTarget) => Promise<void>;
  persist: () => Promise<Submission>;
  readCanonical: () => Promise<Submission | null>;
  submissionId: string;
  target: MediaStorageTarget;
}): Promise<Submission> {
  try {
    if (mediaStorageTargetSubmissionId(options.target) !== options.submissionId) {
      throw new Error("Uploaded media target belongs to a different submission.");
    }
  } catch (error) {
    throw new UploadedMediaPersistenceUncertainError({ cause: error });
  }

  try {
    return await options.persist();
  } catch (saveError) {
    let canonical: Submission | null;
    try {
      canonical = await options.readCanonical();
    } catch (readbackError) {
      throw new UploadedMediaPersistenceUncertainError({
        cause: new AggregateError(
          [saveError, readbackError],
          "Uploaded media save and canonical readback both failed.",
        ),
      });
    }

    if (canonical && canonical.id !== options.submissionId) {
      throw new UploadedMediaPersistenceUncertainError({
        cause: new AggregateError(
          [saveError, new Error("Canonical readback returned a different submission.")],
          "Uploaded media save and canonical ownership verification failed.",
        ),
      });
    }

    if (submissionReferencesMediaTarget(canonical, options.target)) {
      return canonical as Submission;
    }

    try {
      await options.deleteUploadedMedia(options.target);
    } catch (cleanupError) {
      throw new UploadedMediaCleanupError({
        cause: new AggregateError(
          [saveError, cleanupError],
          "Uploaded media save and cleanup both failed.",
        ),
      });
    }
    throw saveError;
  }
}
