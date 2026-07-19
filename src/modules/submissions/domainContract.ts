import {
  hasUnambiguousPrimaryApplicantForPassportReview,
  requiredPassportReviewMediaSlots,
} from "./passportReviewContract";

export const CANONICAL_SUBMISSION_STATUSES = [
  "draft",
  "in_progress",
  "submitted_for_review",
  "returned",
  "corrections_received",
  "ready_for_export",
  "exported",
] as const;

export type CanonicalSubmissionStatus =
  (typeof CANONICAL_SUBMISSION_STATUSES)[number];

export const LEGACY_SUBMISSION_STATUSES = [
  "requires_action",
  "filling",
  "ready_for_review",
  "waiting_review",
  "in_review",
  "accepted",
  "ready_for_excel",
  "attention_required",
  "sent_to_appointment",
  "appointment_scheduled",
  "completed",
] as const;

export type LegacySubmissionStatus = (typeof LEGACY_SUBMISSION_STATUSES)[number];

export const CANONICAL_FRONTEND_MEDIA_TYPES = [
  "passport_scan",
  "selfie",
  "selfie_2",
] as const;

export type CanonicalFrontendMediaType =
  (typeof CANONICAL_FRONTEND_MEDIA_TYPES)[number];

export const REJECTED_LEGACY_MEDIA_TYPES = [
  "photo",
  "photo_white",
  "video",
] as const;

export type RejectedLegacyMediaType = (typeof REJECTED_LEGACY_MEDIA_TYPES)[number];

export const CANONICAL_STORAGE_MEDIA_TYPES = {
  passport_scan: "passport_scan",
  selfie: "selfie",
  selfie_2: "selfie_2",
} as const satisfies Record<CanonicalFrontendMediaType, CanonicalFrontendMediaType>;

export const CANONICAL_ISSUE_STATUSES = [
  "open",
  "fixed_by_agent",
  "closed_by_admin",
] as const;

export type CanonicalIssueStatus = (typeof CANONICAL_ISSUE_STATUSES)[number];

export type ContractActorRole = "agent" | "admin" | "system";

export type ContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

export type StatusTransition = {
  from: CanonicalSubmissionStatus;
  to: CanonicalSubmissionStatus;
};

export const ALLOWED_STATUS_TRANSITIONS = [
  { from: "draft", to: "in_progress" },
  { from: "in_progress", to: "submitted_for_review" },
  { from: "submitted_for_review", to: "returned" },
  { from: "submitted_for_review", to: "ready_for_export" },
  { from: "returned", to: "corrections_received" },
  { from: "corrections_received", to: "ready_for_export" },
  { from: "corrections_received", to: "returned" },
  { from: "ready_for_export", to: "ready_for_export" },
  { from: "ready_for_export", to: "exported" },
] as const satisfies readonly StatusTransition[];

export const FORBIDDEN_STATUS_TRANSITIONS = {
  draft: [
    "submitted_for_review",
    "returned",
    "corrections_received",
    "ready_for_export",
    "exported",
  ],
  in_progress: [
    "draft",
    "returned",
    "corrections_received",
    "ready_for_export",
    "exported",
  ],
  submitted_for_review: ["draft", "in_progress", "corrections_received", "exported"],
  returned: [
    "draft",
    "in_progress",
    "submitted_for_review",
    "ready_for_export",
    "exported",
  ],
  corrections_received: ["draft", "in_progress", "submitted_for_review", "exported"],
  ready_for_export: [
    "draft",
    "in_progress",
    "submitted_for_review",
    "returned",
    "corrections_received",
  ],
  exported: [
    "draft",
    "in_progress",
    "submitted_for_review",
    "returned",
    "corrections_received",
    "ready_for_export",
  ],
} as const satisfies Record<
  CanonicalSubmissionStatus,
  readonly CanonicalSubmissionStatus[]
>;

export const FORBIDDEN_ISSUE_TRANSITIONS = [
  { from: "open", to: "closed_by_admin" },
  { from: "closed_by_admin", to: "open" },
  { from: "fixed_by_agent", to: "open" },
  { from: "closed_by_admin", to: "fixed_by_agent" },
] as const satisfies ReadonlyArray<{
  from: CanonicalIssueStatus;
  to: CanonicalIssueStatus;
}>;

export function isCanonicalSubmissionStatus(
  value: unknown,
): value is CanonicalSubmissionStatus {
  return CANONICAL_SUBMISSION_STATUSES.includes(value as CanonicalSubmissionStatus);
}

export function isLegacySubmissionStatus(
  value: unknown,
): value is LegacySubmissionStatus {
  return LEGACY_SUBMISSION_STATUSES.includes(value as LegacySubmissionStatus);
}

export function normalizeLegacySubmissionStatus(
  value: unknown,
  options: { exportedAt?: unknown } = {},
): ContractResult<CanonicalSubmissionStatus> {
  if (isCanonicalSubmissionStatus(value)) return { ok: true, data: value };
  if (!isLegacySubmissionStatus(value)) {
    return { ok: false, reason: "Unknown submission status." };
  }

  if (value === "requires_action" || value === "attention_required") {
    return { ok: true, data: "returned" };
  }
  if (value === "filling") return { ok: true, data: "in_progress" };
  if (
    value === "ready_for_review" ||
    value === "waiting_review" ||
    value === "in_review"
  ) {
    return { ok: true, data: "submitted_for_review" };
  }
  if (value === "accepted" || value === "ready_for_excel") {
    return { ok: true, data: "ready_for_export" };
  }
  if (
    value === "sent_to_appointment" ||
    value === "appointment_scheduled" ||
    value === "completed"
  ) {
    return {
      ok: true,
      data: hasValidPersistedTimestamp(options.exportedAt)
        ? "exported"
        : "ready_for_export",
    };
  }

  return { ok: false, reason: "Unmapped legacy submission status." };
}

export function isCanonicalFrontendMediaType(
  value: unknown,
): value is CanonicalFrontendMediaType {
  return CANONICAL_FRONTEND_MEDIA_TYPES.includes(value as CanonicalFrontendMediaType);
}

export function isRejectedLegacyMediaType(
  value: unknown,
): value is RejectedLegacyMediaType {
  return REJECTED_LEGACY_MEDIA_TYPES.includes(value as RejectedLegacyMediaType);
}

export function toCanonicalStorageMediaType(
  value: unknown,
): ContractResult<CanonicalFrontendMediaType> {
  if (!isCanonicalFrontendMediaType(value)) {
    return { ok: false, reason: "Media type is not canonical for Package 1." };
  }

  return { ok: true, data: CANONICAL_STORAGE_MEDIA_TYPES[value] };
}

export function rejectLegacyMediaType(value: unknown): ContractResult<never> {
  if (isRejectedLegacyMediaType(value)) {
    return { ok: false, reason: `${value} is rejected by Package 1.` };
  }

  return { ok: false, reason: "Unknown media type is rejected by Package 1." };
}

export function isKnownContractRole(value: unknown): value is ContractActorRole {
  return value === "agent" || value === "admin" || value === "system";
}

export function isExportedTerminal(status: unknown): boolean {
  return status === "exported";
}

export function isStatusTransitionAllowed(
  from: unknown,
  to: unknown,
  options: { mutating?: boolean } = {},
): boolean {
  if (!isCanonicalSubmissionStatus(from) || !isCanonicalSubmissionStatus(to)) {
    return false;
  }
  if (from === "exported") return false;
  if (options.mutating && from === "ready_for_export" && to === "ready_for_export") {
    return true;
  }

  return ALLOWED_STATUS_TRANSITIONS.some(
    (transition) => transition.from === from && transition.to === to,
  );
}

export function isForbiddenStatusTransition(from: unknown, to: unknown): boolean {
  if (!isCanonicalSubmissionStatus(from) || !isCanonicalSubmissionStatus(to)) {
    return true;
  }
  if (from === "exported") return true;
  return (
    FORBIDDEN_STATUS_TRANSITIONS[from] as readonly CanonicalSubmissionStatus[]
  ).includes(to);
}

export function isIssueTransitionAllowed(
  from: CanonicalIssueStatus | null,
  to: unknown,
): to is CanonicalIssueStatus {
  if (!isCanonicalIssueStatus(to)) return false;
  if (from === null) return to === "open";
  if (from === "open") return to === "fixed_by_agent";
  if (from === "fixed_by_agent") return to === "closed_by_admin";
  return false;
}

export function isForbiddenIssueTransition(
  from: unknown,
  to: unknown,
): boolean {
  if (!isCanonicalIssueStatus(from) || !isCanonicalIssueStatus(to)) return true;
  return FORBIDDEN_ISSUE_TRANSITIONS.some(
    (transition) => transition.from === from && transition.to === to,
  );
}

export function isCanonicalIssueStatus(
  value: unknown,
): value is CanonicalIssueStatus {
  return CANONICAL_ISSUE_STATUSES.includes(value as CanonicalIssueStatus);
}

export type MediaReadinessFile = {
  applicantId: string;
  generatedFileName?: string;
  status: string;
  storageBucket?: string;
  storagePath?: string;
  type: unknown;
};

export type MediaReadinessSubmission = {
  applicants: Array<{ id: string; role?: string }>;
  files: MediaReadinessFile[];
};

export function canonicalRequiredMediaTypesForApplicant(
  submission: Pick<MediaReadinessSubmission, "applicants">,
  applicantId: string,
): readonly CanonicalFrontendMediaType[] {
  const applicantIndex = submission.applicants.findIndex(
    (applicant) => applicant.id === applicantId,
  );
  if (applicantIndex < 0) return [];

  const applicant = submission.applicants[applicantIndex];
  const isPrimaryApplicant =
    applicant.role === "main" ||
    (!submission.applicants.some((candidate) => candidate.role === "main") &&
      applicantIndex === 0);

  return isPrimaryApplicant
    ? CANONICAL_FRONTEND_MEDIA_TYPES
    : (["passport_scan"] as const);
}

export function canonicalRequiredMediaReadiness(
  submission: MediaReadinessSubmission,
  options: { requireAccepted?: boolean; requireStorageIdentity?: boolean } = {},
): ContractResult<true> {
  if (!hasUnambiguousPrimaryApplicantForPassportReview(submission)) {
    return {
      ok: false,
      reason: "Submission must have one unambiguous primary applicant.",
    };
  }

  for (const file of submission.files) {
    if (!isCanonicalFrontendMediaType(file.type)) {
      return { ok: false, reason: "Canonical package contains rejected media." };
    }
  }

  for (const slot of requiredPassportReviewMediaSlots(submission)) {
    const file = submission.files.find(
      (item) => item.applicantId === slot.applicantId && item.type === slot.type,
    );
    if (!file) return { ok: false, reason: `Missing ${slot.type}.` };
    if (file.status === "missing" || file.status === "needs_replacement") {
      return { ok: false, reason: `Required ${slot.type} is not ready.` };
    }
    if (options.requireAccepted && file.status !== "accepted") {
      return { ok: false, reason: `Required ${slot.type} is not accepted.` };
    }
    if (
      options.requireStorageIdentity &&
      (!file.storageBucket || !file.storagePath || !file.generatedFileName)
    ) {
      return { ok: false, reason: `Required ${slot.type} has no storage identity.` };
    }
  }

  return { ok: true, data: true };
}

function hasValidPersistedTimestamp(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(new Date(value).getTime());
}
