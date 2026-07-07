import { initialSubmissions } from "./mockData";
import { defaultLocalAgentOwnerId, ensureSubmissionOwner } from "./ownership";
import { normalizeSubmissionForCanonicalRuntime } from "./submissionActions";
import type { Submission } from "./types";

const storageKey = "visaflow.v19.submissions.v1";

interface PersistenceImportMeta {
  env: {
    readonly DEV?: boolean;
    readonly VITE_SUPABASE_BACKEND_TARGET?: string;
  };
}

type StorageLike = {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

type SaveSubmissionsResult = { ok: true } | { ok: false; message: string };

export function loadSubmissions(): Submission[] {
  const storage = getStorage();
  if (!storage) return normalizeLoadedSubmissions(initialSubmissions);

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return normalizeLoadedSubmissions(initialSubmissions);
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every(isSubmissionLike)
    ) {
      return normalizeLoadedSubmissions(initialSubmissions);
    }
    return normalizeLoadedSubmissions(parsed);
  } catch {
    return normalizeLoadedSubmissions(initialSubmissions);
  }
}

export function saveSubmissions(submissions: Submission[]): SaveSubmissionsResult {
  const storage = getStorage();
  if (!storage) {
    return {
      ok: false,
      message: "Локальное сохранение не прошло: localStorage недоступен.",
    };
  }

  try {
    storage.setItem(storageKey, JSON.stringify(submissions));
    return { ok: true };
  } catch (error) {
    // Persistence is helpful, but the cockpit must keep working if storage is unavailable.
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    return {
      ok: false,
      message: `Локальное сохранение не прошло.${detail}`,
    };
  }
}

export function clearSubmissions() {
  getStorage()?.removeItem(storageKey);
}

function getStorage() {
  return (globalThis as unknown as { localStorage?: StorageLike }).localStorage;
}

function normalizeLoadedSubmissions(submissions: Submission[]): Submission[] {
  const normalized = submissions.map((submission) =>
    normalizeSubmissionForCanonicalRuntime(
      ensureSubmissionOwner(submission, defaultLocalAgentOwnerId),
    ),
  );

  return seedLocalDemoStoredMedia(normalized);
}

function seedLocalDemoStoredMedia(submissions: Submission[]): Submission[] {
  if (!canSeedLocalDemoStoredMedia()) return submissions;

  const demoFilesBySubmissionId = new Map(
    initialSubmissions.map((submission) => [
      submission.id,
      new Map(submission.files.map((file) => [file.id, file])),
    ]),
  );

  return submissions.map((submission) => {
    const demoFilesById = demoFilesBySubmissionId.get(submission.id);
    if (!demoFilesById) return submission;

    return {
      ...submission,
      files: submission.files.map((file) => {
        const demoFile = demoFilesById.get(file.id);
        if (!demoFile || file.status !== "accepted") return file;

        return {
          ...file,
          generatedFileName: demoFile.generatedFileName,
          mimeType: demoFile.mimeType,
          originalFileName: demoFile.originalFileName,
          reviewStatus: demoFile.reviewStatus,
          sizeBytes: demoFile.sizeBytes,
          storageAdapter: demoFile.storageAdapter,
          storageBucket: demoFile.storageBucket,
          storagePath: demoFile.storagePath,
          uploadStatus: demoFile.uploadStatus,
        };
      }),
    };
  });
}

function canSeedLocalDemoStoredMedia(): boolean {
  const env = (import.meta as unknown as PersistenceImportMeta).env;
  return Boolean(env.DEV) && env.VITE_SUPABASE_BACKEND_TARGET !== "supabase";
}

function isSubmissionLike(value: unknown): value is Submission {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Submission>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    candidate.country === "Испания" &&
    Array.isArray(candidate.applicants) &&
    Array.isArray(candidate.issues) &&
    Array.isArray(candidate.files)
  );
}
