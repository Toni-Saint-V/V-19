import { mediaStorageBucket } from "./mediaStoragePolicy";
import type {
  QuestionnaireStatus,
  Submission,
  SubmissionFile,
} from "./types";

export type PersistablePrivateFileAsset = SubmissionFile & {
  generatedFileName: string;
  storageAdapter: "supabase-private";
  storageBucket: typeof mediaStorageBucket;
  storagePath: string;
  uploadStatus: "uploaded";
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
