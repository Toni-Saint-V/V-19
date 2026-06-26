import { initialSubmissions } from "./mockData";
import { defaultLocalAgentOwnerId, ensureSubmissionOwner } from "./ownership";
import { normalizeSubmissionForCanonicalRuntime } from "./submissionActions";
import type { Submission } from "./types";

const storageKey = "visaflow.v19.submissions.v1";

type StorageLike = {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

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

export function saveSubmissions(submissions: Submission[]) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey, JSON.stringify(submissions));
  } catch {
    // Persistence is helpful, but the cockpit must keep working if storage is unavailable.
  }
}

export function clearSubmissions() {
  getStorage()?.removeItem(storageKey);
}

function getStorage() {
  return (globalThis as unknown as { localStorage?: StorageLike }).localStorage;
}

function normalizeLoadedSubmissions(submissions: Submission[]): Submission[] {
  return submissions.map((submission) =>
    normalizeSubmissionForCanonicalRuntime(
      ensureSubmissionOwner(submission, defaultLocalAgentOwnerId),
    ),
  );
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
