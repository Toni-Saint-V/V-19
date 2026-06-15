import { initialSubmissions } from "./mockData";
import { normalizeSubmissionQuestionnaire } from "./questionnaire";
import type { Submission } from "./types";

const storageKey = "visaflow.v19.submissions.v1";

type StorageLike = {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

export function loadSubmissions(): Submission[] {
  const storage = getStorage();
  if (!storage) return initialSubmissions;

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return initialSubmissions;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every(isSubmissionLike)
    ) {
      return initialSubmissions;
    }
    return parsed.map(normalizeSubmissionQuestionnaire);
  } catch {
    return initialSubmissions;
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
