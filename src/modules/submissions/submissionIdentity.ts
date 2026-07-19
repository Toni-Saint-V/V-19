import type { Submission } from "./types";

export const submissionPublicNumberMin = 1;
export const submissionPublicNumberMax = 9_999;

type SubmissionIdentity = Pick<Submission, "id" | "publicNumber">;

function validPublicNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= submissionPublicNumberMin &&
    value <= submissionPublicNumberMax
  );
}

function legacyPublicNumber(id: string): number | null {
  const match = id.trim().match(/^(?:VF|ПД)-(\d{1,4})(?:-|$)/);
  if (!match) return null;

  const value = Number(match[1]);
  return validPublicNumber(value) ? value : null;
}

export function submissionPublicNumber(submission: SubmissionIdentity): number | null {
  if (validPublicNumber(submission.publicNumber)) return submission.publicNumber;
  if (Object.hasOwn(submission, "publicNumber")) return null;
  return legacyPublicNumber(submission.id);
}

export function submissionPublicId(submission: SubmissionIdentity): string {
  const publicNumber = submissionPublicNumber(submission);
  return publicNumber === null ? "VF-—" : `VF-${publicNumber}`;
}
