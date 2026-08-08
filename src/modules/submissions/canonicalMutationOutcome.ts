export const CANONICAL_MUTATION_OUTCOME_UNKNOWN =
  "V19_CANONICAL_MUTATION_OUTCOME_UNKNOWN" as const;
export const CANONICAL_MUTATION_RETRY_BLOCKED =
  "V19_CANONICAL_MUTATION_RETRY_BLOCKED" as const;

const canonicalMutationOutcomeUnknownMessage =
  "Не удалось подтвердить сохранение файла через canonical readback. Повторная загрузка отключена до обновления данных.";

export class CanonicalMutationOutcomeUnknownError extends Error {
  readonly code = CANONICAL_MUTATION_OUTCOME_UNKNOWN;

  constructor(cause?: unknown) {
    super(canonicalMutationOutcomeUnknownMessage, { cause });
    this.name = "CanonicalMutationOutcomeUnknownError";
  }
}

export class CanonicalMutationRetryBlockedError extends Error {
  readonly code = CANONICAL_MUTATION_RETRY_BLOCKED;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CanonicalMutationRetryBlockedError";
  }
}

export function isCanonicalMutationOutcomeUnknownError(
  error: unknown,
): error is CanonicalMutationOutcomeUnknownError {
  return (
    error instanceof CanonicalMutationOutcomeUnknownError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === CANONICAL_MUTATION_OUTCOME_UNKNOWN)
  );
}

export function isCanonicalMutationRetryBlockedError(
  error: unknown,
): error is CanonicalMutationRetryBlockedError {
  return (
    error instanceof CanonicalMutationRetryBlockedError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === CANONICAL_MUTATION_RETRY_BLOCKED)
  );
}
