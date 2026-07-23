import {
  buildMediaStoragePath,
  mediaStorageBucket,
} from "./mediaStoragePolicy";
import type {
  QuestionnaireStatus,
  Submission,
  SubmissionFile,
  SubmissionFileType,
} from "./types";

export type PersistablePrivateFileAsset = SubmissionFile & {
  generatedFileName: string;
  storageAdapter: "supabase-private";
  storageBucket: typeof mediaStorageBucket;
  storagePath: string;
  uploadStatus: "uploaded";
};

type PrivateFileAssetIdentityCandidate = {
  applicantId: string;
  generatedFileName?: string;
  status: string;
  storageAdapter?: string;
  storageBucket?: string;
  storagePath?: string;
  type: unknown;
  uploadStatus?: string;
};

export function isFileAssetUploadMissing(file: SubmissionFile): boolean {
  return file.status === "missing" || file.status === "needs_replacement";
}

export function isCompletedFileAsset(file: SubmissionFile): boolean {
  return !isFileAssetUploadMissing(file) && file.uploadStatus === "uploaded";
}

export function isPersistablePrivateFileAsset(
  file: SubmissionFile,
): file is PersistablePrivateFileAsset {
  return (
    isCompletedFileAsset(file) &&
    file.storageAdapter === "supabase-private" &&
    file.storageBucket === mediaStorageBucket &&
    Boolean(file.generatedFileName && file.storagePath)
  );
}

export function hasCanonicalPrivateStorageIdentityAtSubmissionTarget(
  file: PrivateFileAssetIdentityCandidate,
  input: {
    applicantId: string;
    fileType: SubmissionFileType;
    submissionId: string;
  },
): boolean {
  if (
    file.status === "missing" ||
    file.status === "needs_replacement" ||
    file.uploadStatus !== "uploaded" ||
    file.storageAdapter !== "supabase-private" ||
    file.storageBucket !== mediaStorageBucket ||
    !file.generatedFileName ||
    !file.storagePath ||
    file.applicantId !== input.applicantId ||
    file.type !== input.fileType
  ) {
    return false;
  }

  try {
    const expectedTarget = buildMediaStoragePath(
      input.submissionId,
      input.applicantId,
      input.fileType,
      file.generatedFileName,
    );
    return (
      file.storageBucket === expectedTarget.bucket &&
      file.storagePath === expectedTarget.path
    );
  } catch {
    return false;
  }
}

/**
 * An admin can review an asset only if the private storage object belongs to
 * the exact submission, applicant, and document slot currently on screen.
 */
export function isPersistablePrivateFileAssetAtSubmissionTarget(
  file: SubmissionFile,
  input: {
    applicantId: string;
    fileType: SubmissionFileType;
    submissionId: string;
  },
): file is PersistablePrivateFileAsset {
  return (
    isPersistablePrivateFileAsset(file) &&
    hasCanonicalPrivateStorageIdentityAtSubmissionTarget(file, input)
  );
}

export function fileCompletenessPercent(files: SubmissionFile[]): number {
  if (!files.length) return 0;
  const ready = files.filter(isCompletedFileAsset).length;
  return Math.round((ready / files.length) * 100);
}

export function applicantFileStatusForFiles(
  files: SubmissionFile[],
): QuestionnaireStatus {
  if (!files.length || files.every((file) => file.status === "missing")) {
    return "empty";
  }
  if (files.some((file) => file.status === "needs_replacement")) {
    return "needs_fix";
  }
  if (files.every(isCompletedFileAsset)) {
    return "complete";
  }
  return "partial";
}

export function withRecomputedFileCompletion(submission: Submission): Submission {
  const filePercent = fileCompletenessPercent(submission.files);

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      fileStatus: applicantFileStatusForFiles(
        submission.files.filter((file) => file.applicantId === applicant.id),
      ),
    })),
    completeness: {
      ...submission.completeness,
      files: filePercent,
      total: Math.round((submission.completeness.questionnaire + filePercent) / 2),
    },
  };
}
