import { updateQuestionnaireField } from "./questionnaire";
import {
  generatedCockpitMediaFileName,
  mediaSlotTypeForSubmissionFileType,
  uploadRequiredFile,
} from "./submissionActions";
import {
  buildMediaStoragePath,
  deleteMediaFromStorage,
  mediaMimeTypeForFile,
  uploadMediaToStorage,
  type MediaStorageTarget,
} from "./mediaStorage";
import type { FileAssetStorageAdapter, PassportUploadDraft, Submission } from "./types";
import type { SubmissionIntakeProgressListener } from "./submissionIntake";
import {
  saveLocalDemoMedia,
  withLocalDemoMediaMutationLock,
  type LocalDemoMediaMutationLock,
} from "./localDemoMediaStorage";

const passportFieldIds: Record<string, string> = {
  birthCountry: "birth-country",
  birthDate: "birth-date",
  birthPlace: "birth-place",
  citizenship: "nationality",
  firstName: "first-name",
  gender: "gender",
  passportExpiresAt: "passport-expiry-date",
  passportIssueCountry: "passport-issue-country",
  passportIssuePlace: "passport-issue-place",
  passportIssuedAt: "passport-issue-date",
  passportNumber: "passport-no",
  passportType: "passport-type",
  surname: "surname",
};

type UploadMedia = typeof uploadMediaToStorage;
type DeleteMedia = typeof deleteMediaFromStorage;
type StoreLocalDemoMedia = typeof saveLocalDemoMedia;

export type PersistCreatedSubmissionWithPassportsInput = {
  attemptedStoragePaths?: Set<string>;
  deleteMedia?: DeleteMedia;
  nowIso?: () => string;
  onPendingSubmission: (submission: Submission) => void;
  onProgress?: SubmissionIntakeProgressListener;
  passportUploads: PassportUploadDraft[];
  persistSubmission: (submission: Submission) => Promise<void>;
  simulatePrivateStorage?: boolean;
  storageAdapter?: FileAssetStorageAdapter;
  storeLocalDemoMedia?: StoreLocalDemoMedia;
  submission: Submission;
  uploadMedia?: UploadMedia;
  withLocalDemoMutationLock?: LocalDemoMediaMutationLock;
};

function hasPersistablePrivateUpload(file: Submission["files"][number]): boolean {
  return Boolean(
    file.storageAdapter === "supabase-private" &&
    file.storageBucket &&
    file.storagePath &&
    file.generatedFileName,
  );
}

function hasPersistableLocalUpload(file: Submission["files"][number]): boolean {
  return Boolean(
    file.storageAdapter === "local-dev" &&
    file.generatedFileName &&
    file.uploadStatus === "uploaded",
  );
}

function applyPassportUploadIntents(
  submission: Submission,
  passportUploads: PassportUploadDraft[],
): Submission {
  const intentByFileId = new Map<string, PassportUploadDraft>();
  for (const upload of passportUploads) {
    const applicant = submission.applicants[upload.applicantIndex];
    const file = submission.files.find(
      (candidate) =>
        candidate.applicantId === applicant?.id && candidate.type === "passport_scan",
    );
    if (file && upload.file) intentByFileId.set(file.id, upload);
  }
  if (!intentByFileId.size) return submission;

  return {
    ...submission,
    files: submission.files.map((file) => {
      const upload = intentByFileId.get(file.id);
      if (!upload?.file || hasPersistablePrivateUpload(file)) return file;
      return {
        ...file,
        mimeType: mediaMimeTypeForFile(upload.file) ?? upload.file.type,
        originalFileName: upload.file.name,
        sizeBytes: upload.file.size,
      };
    }),
  };
}

function applyPassportExtraction(
  submission: Submission,
  upload: PassportUploadDraft,
  sourceFileId: string,
  nowIso: string,
): Submission {
  const applicant = submission.applicants[upload.applicantIndex];
  if (!applicant) return submission;

  let nextSubmission: Submission = {
    ...submission,
    applicants: submission.applicants.map((candidate) =>
      candidate.id === applicant.id
        ? {
            ...candidate,
            passportExtraction: {
              appliedFieldKeys: upload.extractedFields.map((field) => field.key),
              attemptCount: 1,
              extractedFields: upload.extractedFields,
              lastAttemptAtIso: nowIso,
              sourceFileId,
              sourceFileName: upload.fileName,
              status: upload.status,
              summary:
                upload.status === "ready"
                  ? "Паспортные данные перенесены в анкету."
                  : "Паспорт принят, понадобится ручная проверка.",
            },
          }
        : candidate,
    ),
  };

  for (const field of upload.extractedFields) {
    const fieldId = passportFieldIds[field.key];
    if (!fieldId || !field.value.trim()) continue;
    const currentApplicant = nextSubmission.applicants.find(
      (candidate) => candidate.id === applicant.id,
    );
    const section = currentApplicant?.sections.find((candidate) =>
      candidate.fields.some((candidateField) => candidateField.id === fieldId),
    );
    if (!section) continue;
    nextSubmission = updateQuestionnaireField(nextSubmission, {
      applicantId: applicant.id,
      fieldId,
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
      sectionId: section.id,
      value: field.value,
    });
  }

  return nextSubmission;
}

async function clearAmbiguousUpload(
  target: MediaStorageTarget,
  attemptedStoragePaths: Set<string>,
  deleteMedia: DeleteMedia,
): Promise<void> {
  if (!attemptedStoragePaths.has(target.path)) return;
  await deleteMedia(target);
  attemptedStoragePaths.delete(target.path);
}

/**
 * Persists the parent submission/applicant rows before Storage and then records
 * each uploaded passport immediately. Re-running with the last pending
 * submission is idempotent: a response-lost draft save is retried before any
 * additional upload, and an ambiguous Storage upload is removed before retry.
 */
export async function persistCreatedSubmissionWithPassports({
  attemptedStoragePaths = new Set<string>(),
  deleteMedia = deleteMediaFromStorage,
  nowIso = () => new Date().toISOString(),
  onPendingSubmission,
  onProgress,
  passportUploads,
  persistSubmission,
  simulatePrivateStorage = false,
  storageAdapter = "supabase-private",
  storeLocalDemoMedia = saveLocalDemoMedia,
  submission,
  uploadMedia = uploadMediaToStorage,
  withLocalDemoMutationLock = withLocalDemoMediaMutationLock,
}: PersistCreatedSubmissionWithPassportsInput): Promise<Submission> {
  if (simulatePrivateStorage && storageAdapter !== "local-dev") {
    throw new Error(
      "Private Storage simulation is available only with the local-dev adapter.",
    );
  }

  let nextSubmission = applyPassportUploadIntents(submission, passportUploads);

  // Persist the upload intent inside the canonical snapshot before Storage.
  // This makes a parent-only crash recoverable by the original file identity,
  // while media_assets remain absent until an object is actually uploaded.
  onPendingSubmission(nextSubmission);
  onProgress?.({ stage: "saving_submission" });
  await persistSubmission(nextSubmission);

  for (const [uploadIndex, upload] of passportUploads.entries()) {
    const applicant = nextSubmission.applicants[upload.applicantIndex];
    if (!applicant) continue;
    const passportFile = nextSubmission.files.find(
      (file) => file.applicantId === applicant.id && file.type === "passport_scan",
    );
    if (!passportFile || !upload.file) {
      throw new Error(
        `Не удалось подготовить файл паспорта заявителя ${upload.applicantIndex + 1}.`,
      );
    }
    const uploadFile = upload.file;

    // A retry starts by persisting the pending candidate above. Once the file
    // metadata is present, uploading the same object again would only create a
    // duplicate or a Storage conflict.
    if (
      ((storageAdapter === "supabase-private" || simulatePrivateStorage) &&
        hasPersistablePrivateUpload(passportFile)) ||
      (storageAdapter === "local-dev" &&
        !simulatePrivateStorage &&
        hasPersistableLocalUpload(passportFile))
    ) {
      if (passportFile.storagePath) {
        attemptedStoragePaths.delete(passportFile.storagePath);
      }
      continue;
    }

    const mimeType = mediaMimeTypeForFile(uploadFile);
    if (!mimeType) {
      throw new Error(
        `Не удалось определить формат паспорта заявителя ${upload.applicantIndex + 1}.`,
      );
    }

    const generatedFileName = generatedCockpitMediaFileName({
      applicantId: applicant.id,
      fileType: passportFile.type,
      mimeType,
      submissionId: nextSubmission.id,
      uploadNonce: upload.id,
    });

    onProgress?.({
      applicantIndex: upload.applicantIndex,
      current: uploadIndex + 1,
      stage: "uploading_passport",
      total: passportUploads.length,
    });

    const persistUploadedPassport = async (): Promise<Submission> => {
      let uploadedSubmission: Submission;
      if (storageAdapter === "local-dev" && !simulatePrivateStorage) {
        uploadedSubmission = uploadRequiredFile(nextSubmission, passportFile.id, {
          generatedFileName,
          mimeType,
          originalFileName: uploadFile.name,
          sizeBytes: uploadFile.size,
          storageAdapter: "local-dev",
          uploadedAtIso: nowIso(),
        });
      } else {
        const storageTarget = buildMediaStoragePath(
          nextSubmission.id,
          applicant.id,
          mediaSlotTypeForSubmissionFileType(passportFile.type),
          generatedFileName,
        );

        let storedPath = storageTarget.path;
        if (simulatePrivateStorage) {
          const storedFile = await storeLocalDemoMedia(storageTarget, uploadFile);
          storedPath = storedFile.path;
        } else {
          // A timed-out upload may have committed remotely without returning a path.
          // Since no media metadata was constructed in that branch, the deterministic
          // object is an orphan and can be removed safely before retry.
          await clearAmbiguousUpload(storageTarget, attemptedStoragePaths, deleteMedia);
          attemptedStoragePaths.add(storageTarget.path);

          const storedFile = await uploadMedia(storageTarget, uploadFile);
          if (!storedFile) {
            throw new Error("Supabase Storage недоступен для сохранения паспорта.");
          }
          storedPath = storedFile.path;
        }

        uploadedSubmission = uploadRequiredFile(nextSubmission, passportFile.id, {
          generatedFileName,
          mimeType,
          originalFileName: uploadFile.name,
          sizeBytes: uploadFile.size,
          storageAdapter: "supabase-private",
          storageBucket: storageTarget.bucket,
          storagePath: storedPath,
          uploadedAtIso: nowIso(),
          ...(simulatePrivateStorage ? { localDemoMediaStored: true as const } : {}),
        });
      }

      const candidate = applyPassportExtraction(
        uploadedSubmission,
        upload,
        passportFile.id,
        nowIso(),
      );

      // Publish the candidate before the save so a caller can retry the exact
      // same idempotent RPC payload if the response is lost after commit.
      onPendingSubmission(candidate);
      onProgress?.({
        applicantIndex: upload.applicantIndex,
        current: uploadIndex + 1,
        stage: "saving_passport_metadata",
        total: passportUploads.length,
      });
      await persistSubmission(candidate);
      if (storageAdapter === "supabase-private" || simulatePrivateStorage) {
        const storedPath = candidate.files.find(
          (file) => file.id === passportFile.id,
        )?.storagePath;
        if (storedPath) attemptedStoragePaths.delete(storedPath);
      }
      return candidate;
    };

    nextSubmission = simulatePrivateStorage
      ? await withLocalDemoMutationLock(persistUploadedPassport)
      : await persistUploadedPassport();
  }

  onProgress?.({ stage: "complete" });
  return nextSubmission;
}
