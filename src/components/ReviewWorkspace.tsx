// src/components/ReviewWorkspace.tsx
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import "../shared/ui/review-workspace.css";
import { ArrowLeft, CheckCircle2, MessageSquarePlus } from "lucide-react";
import {
  createMediaSignedUrl,
  mediaStorageBucket,
} from "../modules/submissions/mediaStorage";
import { supabaseRuntimeConfig } from "../lib/supabase/config";
import { hasCanonicalAcceptedMediaReview } from "../modules/submissions/domainContract";
import { isPersistablePrivateFileAssetAtSubmissionTarget } from "../modules/submissions/fileAsset";
import { getAdminReviewActions } from "../modules/submissions/status";
import {
  ADMIN_PASSPORT_REVIEW_FIELD_IDS,
  ADMIN_PASSPORT_REVIEW_FIELD_LABELS,
  hasAdminPassportReviewValue,
  hasUnambiguousPrimaryApplicantForPassportReview,
  isAdminPassportReviewIssueInScope,
  passportReviewMediaTypesVisibleForApplicant,
  requiredPassportReviewMediaTypesForApplicant,
  type AdminPassportReviewFieldId,
  type PassportReviewMediaType,
} from "../modules/submissions/passportReviewContract";
import type {
  ActionDecision,
  Applicant,
  Submission,
  SubmissionAction,
  SubmissionFile,
  SubmissionFileType,
} from "../modules/submissions/types";
import { ReviewMediaPreview, type ReviewMediaPreviewState } from "./ReviewMediaPreview";
import {
  ReviewPassportFieldRow,
  type PassportReviewField,
} from "./ReviewPassportFieldRow";
import { persistenceFailureMessage } from "./review/persistenceFailureMessage";
import { useReviewWorkspaceShortcuts } from "./review/useReviewWorkspaceShortcuts";

interface ReviewWorkspaceProps {
  applicantId?: string;
  initialMediaType?: PassportReviewMediaType;
  nestedDialogOpen?: boolean;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
  onApplicantChange?: (applicantId: string) => void;
  onApproveSection?: (input: { applicantId: string }) => boolean | Promise<boolean>;
  onReviewAction?: (action: SubmissionAction) => boolean | Promise<boolean>;
  onBack: () => void;
  submission?: Submission | null;
  submissionId: string;
}

type ReviewMediaType = PassportReviewMediaType;

type ReviewMediaTarget = {
  alt: string;
  label: string;
  shortLabel: string;
  type: ReviewMediaType;
};

type PreviewStateMap = Partial<Record<ReviewMediaType, ReviewMediaPreviewState>>;

type OwnedPreviewState = {
  ownerKey: string;
  previews: PreviewStateMap;
};

type OwnedVisitedMediaState = {
  ownerKey: string;
  types: Set<ReviewMediaType>;
};

type OwnedApprovedMediaState = {
  ownerKey: string;
  types: Set<ReviewMediaType>;
};

type OwnedRenderedMediaState = {
  ownerKey: string;
  urls: Partial<Record<ReviewMediaType, string>>;
};

type OwnedApprovedFieldState = {
  ids: Set<AdminPassportReviewFieldId>;
  ownerKey: string;
};

const mediaTargetsByType: Record<ReviewMediaType, ReviewMediaTarget> = {
  passport_scan: {
    alt: "Оригинал загранпаспорта",
    label: "Скан загранпаспорта",
    shortLabel: "Паспорт",
    type: "passport_scan",
  },
  selfie: {
    alt: "Первое селфи заявителя",
    label: "Селфи 1",
    shortLabel: "Селфи 1",
    type: "selfie",
  },
  selfie_2: {
    alt: "Второе селфи заявителя",
    label: "Селфи 2",
    shortLabel: "Селфи 2",
    type: "selfie_2",
  },
};

const unavailablePreview: ReviewMediaPreviewState = {
  reason: "expired_or_error",
  retryable: true,
  status: "unavailable",
};
const noRenderedMediaUrls: Partial<Record<ReviewMediaType, string>> = Object.freeze({});

function unavailablePreviewForFile(
  file: SubmissionFile | undefined,
): ReviewMediaPreviewState {
  if (!file) {
    return { reason: "missing", retryable: false, status: "unavailable" };
  }
  if (
    file.status === "missing" ||
    file.status === "needs_replacement" ||
    file.uploadStatus !== "uploaded" ||
    file.reviewStatus === "replace_required" ||
    file.reviewStatus === "poor_quality"
  ) {
    return { reason: "rejected", retryable: false, status: "unavailable" };
  }
  // This branch is reached only when the file cannot be used as the exact
  // canonical private-storage object for the applicant slot on screen. A
  // retry cannot repair identity, adapter, or path mismatches.
  return { reason: "rejected", retryable: false, status: "unavailable" };
}

function reviewFieldsForApplicant(applicant?: Applicant): PassportReviewField[] {
  if (!applicant) return [];

  const fieldsById = new Map(
    applicant.sections.flatMap((section) =>
      section.fields.map(
        (field) => [field.id, { field, sectionId: section.id }] as const,
      ),
    ),
  );

  return ADMIN_PASSPORT_REVIEW_FIELD_IDS.map((id) => {
    const entry = fieldsById.get(id);
    const sourceLabel = entry?.field.label ?? ADMIN_PASSPORT_REVIEW_FIELD_LABELS[id];
    return {
      alreadyApproved: Boolean(
        entry?.field.adminReviewApprovedAtIso && entry.field.adminReviewApprovedBy,
      ),
      hasError: Boolean(entry?.field.error),
      id,
      label: ADMIN_PASSPORT_REVIEW_FIELD_LABELS[id],
      sectionId: entry?.sectionId ?? "",
      sourceLabel,
      value: entry?.field.value ?? "",
    };
  });
}

function passportIssueInApplicantScope(
  submission: Submission,
  applicant: Applicant,
  issue: Submission["issues"][number],
) {
  const fields = reviewFieldsForApplicant(applicant);
  return isAdminPassportReviewIssueInScope(issue, {
    applicantId: applicant.id,
    fields: fields.map((field) => ({
      id: field.id,
      label: field.sourceLabel,
    })),
    mediaTypes: passportReviewMediaTypesVisibleForApplicant(submission, applicant.id),
  });
}

function passportCorrectionWasReviewed(
  submission: Submission,
  applicant: Applicant,
  issue: Submission["issues"][number],
) {
  const correctedAt = Date.parse(issue.fixedAtIso ?? issue.createdAt);
  if (!Number.isFinite(correctedAt)) return false;

  return submission.history.some((entry) => {
    if (
      entry.source !== "admin" ||
      !entry.actorId?.trim() ||
      !entry.id.includes(`-${applicant.id}-passport-section-approved-`)
    ) {
      return false;
    }
    const reviewedAt = Date.parse(entry.createdAt ?? entry.at);
    return Number.isFinite(reviewedAt) && reviewedAt >= correctedAt;
  });
}

function sectionActionLabel(accepted: boolean, pending: boolean) {
  if (accepted) return "Сохранено";
  if (pending) return "Сохраняем…";
  return "Сохранить";
}

function applicantPassportReviewCompleted(
  submission: Submission,
  applicant: Applicant,
): boolean {
  const fields = reviewFieldsForApplicant(applicant);
  const mediaTypes = requiredPassportReviewMediaTypesForApplicant(
    submission,
    applicant.id,
  );
  const mediaFiles = mediaTypes.map((type) =>
    submission.files.find(
      (file) => file.applicantId === applicant.id && file.type === type,
    ),
  );
  const issueInScope = (issue: Submission["issues"][number]) =>
    passportIssueInApplicantScope(submission, applicant, issue);

  return (
    fields.every((field) => field.alreadyApproved && !field.hasError) &&
    mediaFiles.every((file) =>
      Boolean(file && hasCanonicalAcceptedMediaReview(file)),
    ) &&
    !submission.issues.some(
      (issue) =>
        issueInScope(issue) &&
        (issue.status === "open" ||
          (issue.status === "fixed_by_agent" &&
            !passportCorrectionWasReviewed(submission, applicant, issue))),
    )
  );
}

export function ReviewWorkspace({
  applicantId,
  initialMediaType = "passport_scan",
  nestedDialogOpen = false,
  onAddRemark,
  onApplicantChange,
  onApproveSection,
  onReviewAction,
  onBack,
  submission,
  submissionId,
}: ReviewWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const mediaTabRefs = useRef<
    Partial<Record<ReviewMediaType, HTMLButtonElement | null>>
  >({});
  const mediaPanelId = useId();
  const onBackRef = useRef(onBack);
  const mountedRef = useRef(true);
  const sectionApprovalRunRef = useRef(0);
  const wasNestedDialogOpenRef = useRef(nestedDialogOpen);
  onBackRef.current = onBack;

  const selectedApplicant =
    submission?.applicants.find((applicant) => applicant.id === applicantId) ??
    submission?.applicants[0];
  const selectedApplicantId = selectedApplicant?.id;
  const reviewFields = useMemo(
    () => reviewFieldsForApplicant(selectedApplicant),
    [selectedApplicant],
  );
  const mediaTargets = useMemo(() => {
    if (!submission || !selectedApplicantId) {
      return [mediaTargetsByType.passport_scan];
    }
    return passportReviewMediaTypesVisibleForApplicant(
      submission,
      selectedApplicantId,
    ).map((type) => mediaTargetsByType[type]);
  }, [selectedApplicantId, submission]);
  const requiredMediaTypes = useMemo(
    () =>
      submission && selectedApplicantId
        ? requiredPassportReviewMediaTypesForApplicant(submission, selectedApplicantId)
        : (["passport_scan"] as const),
    [selectedApplicantId, submission],
  );
  const protectedMedia = useMemo(
    () =>
      mediaTargets.map((target) => {
        const file = submission?.files.find(
          (candidate) =>
            candidate.applicantId === selectedApplicantId &&
            candidate.type === target.type,
        );
        const protectedFile =
          file &&
          selectedApplicantId &&
          (file.status === "pending_review" || file.status === "accepted") &&
          file.uploadStatus === "uploaded" &&
          file.reviewStatus !== "replace_required" &&
          file.reviewStatus !== "poor_quality" &&
          isPersistablePrivateFileAssetAtSubmissionTarget(file, {
            applicantId: selectedApplicantId,
            fileType: target.type,
            submissionId,
          })
            ? file
            : undefined;
        return { file, protectedFile, target };
      }),
    [mediaTargets, selectedApplicantId, submission, submissionId],
  );
  const mediaGenerationKey = protectedMedia
    .map(({ file, target }) =>
      [
        target.type,
        file?.id ?? "missing",
        file?.generatedFileName ?? "no-generated-name",
        file?.storageAdapter ?? "no-adapter",
        file?.storageBucket ?? "no-bucket",
        file?.storagePath ?? "no-path",
        file?.uploadStatus ?? "no-upload-status",
        file?.uploadedAtIso ?? file?.uploadedAt ?? "no-upload-time",
        file?.status ?? "no-status",
        file?.reviewStatus ?? "no-review-status",
        file?.reviewedAtIso ?? "no-reviewed-at",
        file?.reviewedBy ?? "no-reviewer",
      ].join(":"),
    )
    .join("|");
  const mediaOwnerKey = `${submissionId}:${selectedApplicantId ?? "unselected"}:${mediaGenerationKey}`;
  const initialActiveMediaType = mediaTargets.some(
    (target) => target.type === initialMediaType,
  )
    ? initialMediaType
    : (mediaTargets[0]?.type ?? "passport_scan");
  const [activeMediaType, setActiveMediaType] =
    useState<ReviewMediaType>(initialActiveMediaType);
  const [ownedVisitedMedia, setOwnedVisitedMedia] = useState<OwnedVisitedMediaState>({
    ownerKey: mediaOwnerKey,
    types: new Set([initialActiveMediaType]),
  });
  const visitedMediaTypes = useMemo(
    () =>
      ownedVisitedMedia.ownerKey === mediaOwnerKey
        ? ownedVisitedMedia.types
        : new Set<ReviewMediaType>([initialActiveMediaType]),
    [initialActiveMediaType, mediaOwnerKey, ownedVisitedMedia],
  );
  const persistedApprovedMediaKey = protectedMedia
    .filter(
      ({ protectedFile }) =>
        protectedFile && hasCanonicalAcceptedMediaReview(protectedFile),
    )
    .map(({ target }) => target.type)
    .join("|");
  const initialApprovedMediaTypes = useMemo(
    () =>
      new Set<ReviewMediaType>(
        persistedApprovedMediaKey
          ? (persistedApprovedMediaKey.split("|") as ReviewMediaType[])
          : [],
      ),
    [persistedApprovedMediaKey],
  );
  const [ownedApprovedMedia, setOwnedApprovedMedia] = useState<OwnedApprovedMediaState>(
    {
      ownerKey: mediaOwnerKey,
      types: initialApprovedMediaTypes,
    },
  );
  const approvedMediaTypes =
    ownedApprovedMedia.ownerKey === mediaOwnerKey
      ? ownedApprovedMedia.types
      : initialApprovedMediaTypes;
  const [ownedRenderedMedia, setOwnedRenderedMedia] = useState<OwnedRenderedMediaState>(
    {
      ownerKey: mediaOwnerKey,
      urls: {},
    },
  );
  const renderedMediaUrls =
    ownedRenderedMedia.ownerKey === mediaOwnerKey
      ? ownedRenderedMedia.urls
      : noRenderedMediaUrls;
  const fieldGenerationKey = reviewFields
    .map((field) =>
      [
        field.id,
        field.sectionId,
        field.value,
        field.hasError ? "error" : "valid",
        field.alreadyApproved ? "approved" : "pending",
      ].join(":"),
    )
    .join("|");
  const fieldOwnerKey = `${submissionId}:${selectedApplicantId ?? "unselected"}:${fieldGenerationKey}`;
  const persistedApprovedFieldKey = reviewFields
    .filter((field) => field.alreadyApproved && !field.hasError)
    .map((field) => field.id)
    .join("|");
  const initialApprovedFieldIds = useMemo(
    () =>
      new Set<AdminPassportReviewFieldId>(
        persistedApprovedFieldKey
          ? (persistedApprovedFieldKey.split("|") as AdminPassportReviewFieldId[])
          : [],
      ),
    [persistedApprovedFieldKey],
  );
  const [ownedApprovedFields, setOwnedApprovedFields] =
    useState<OwnedApprovedFieldState>({
      ids: initialApprovedFieldIds,
      ownerKey: fieldOwnerKey,
    });
  const approvedFieldIds =
    ownedApprovedFields.ownerKey === fieldOwnerKey
      ? ownedApprovedFields.ids
      : initialApprovedFieldIds;
  const [mediaRequestRevisions, setMediaRequestRevisions] = useState<
    Record<ReviewMediaType, number>
  >({
    passport_scan: 0,
    selfie: 0,
    selfie_2: 0,
  });
  const mediaRequestKeys = useMemo<Record<ReviewMediaType, string>>(
    () => ({
      passport_scan: `${mediaOwnerKey}:passport_scan:request-${mediaRequestRevisions.passport_scan}`,
      selfie: `${mediaOwnerKey}:selfie:request-${mediaRequestRevisions.selfie}`,
      selfie_2: `${mediaOwnerKey}:selfie_2:request-${mediaRequestRevisions.selfie_2}`,
    }),
    [
      mediaOwnerKey,
      mediaRequestRevisions.passport_scan,
      mediaRequestRevisions.selfie,
      mediaRequestRevisions.selfie_2,
    ],
  );
  const latestMediaRequestKeysRef = useRef(mediaRequestKeys);
  latestMediaRequestKeysRef.current = mediaRequestKeys;
  const initialMediaPreviews = useMemo(
    () =>
      Object.fromEntries(
        protectedMedia.map(({ file, protectedFile, target }) => [
          target.type,
          protectedFile ? { status: "idle" } : unavailablePreviewForFile(file),
        ]),
      ) as PreviewStateMap,
    [protectedMedia],
  );
  const mediaGeneration = useMemo(
    () => ({ initialMediaPreviews, protectedMedia }),
    [initialMediaPreviews, protectedMedia],
  );
  const [ownedMediaPreviews, setOwnedMediaPreviews] = useState<OwnedPreviewState>({
    ownerKey: mediaOwnerKey,
    previews: initialMediaPreviews,
  });
  const mediaPreviews =
    ownedMediaPreviews.ownerKey === mediaOwnerKey
      ? ownedMediaPreviews.previews
      : initialMediaPreviews;
  const [sectionApprovalPending, setSectionApprovalPending] = useState(false);
  const [sectionApprovedLocally, setSectionApprovedLocally] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState("");
  const [reviewActionPending, setReviewActionPending] =
    useState<SubmissionAction | null>(null);
  const [reviewActionError, setReviewActionError] = useState("");
  const [reviewActionSaved, setReviewActionSaved] = useState("");
  const isEditableReviewStatus =
    submission?.status === "submitted_for_review" ||
    submission?.status === "corrections_received";

  const activeMediaTarget =
    mediaTargets.find((target) => target.type === activeMediaType) ?? mediaTargets[0];
  const activeMediaFile = submission?.files.find(
    (file) =>
      file.applicantId === selectedApplicantId && file.type === activeMediaTarget.type,
  );
  const activePreview = mediaPreviews[activeMediaTarget.type] ?? unavailablePreview;
  const activeMediaRendered = Boolean(
    activePreview.status === "ready" &&
    activePreview.url &&
    renderedMediaUrls[activeMediaTarget.type] === activePreview.url,
  );
  const passportMediaTarget = mediaTargetsByType.passport_scan;
  const passportMediaFile = submission?.files.find(
    (file) => file.applicantId === selectedApplicantId && file.type === "passport_scan",
  );
  const passportPreview = mediaPreviews.passport_scan ?? unavailablePreview;
  const isIdentityComparison = activeMediaTarget.type !== "passport_scan";
  const adminReviewActions = submission
    ? getAdminReviewActions(submission, "admin")
    : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sectionApprovalRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!submission) return;
    if (!selectedApplicantId) {
      onBackRef.current();
      return;
    }
    if (applicantId !== selectedApplicantId) {
      onApplicantChange?.(selectedApplicantId);
    }
  }, [applicantId, onApplicantChange, selectedApplicantId, submission]);

  useEffect(() => {
    if (mediaTargets.some((target) => target.type === activeMediaType)) return;
    setActiveMediaType(mediaTargets[0]?.type ?? "passport_scan");
  }, [activeMediaType, mediaTargets]);

  useEffect(() => {
    sectionApprovalRunRef.current += 1;
    setActiveMediaType(initialActiveMediaType);
    setOwnedVisitedMedia({
      ownerKey: mediaOwnerKey,
      types: new Set([initialActiveMediaType]),
    });
    setOwnedApprovedMedia({
      ownerKey: mediaOwnerKey,
      types: initialApprovedMediaTypes,
    });
    setOwnedRenderedMedia({
      ownerKey: mediaOwnerKey,
      urls: {},
    });
    setSectionApprovalPending(false);
    setSectionApprovedLocally(false);
    setAcceptanceError("");
    setReviewActionError("");
    setReviewActionSaved("");
  }, [
    initialActiveMediaType,
    initialApprovedMediaTypes,
    mediaOwnerKey,
    selectedApplicantId,
    submissionId,
  ]);

  useEffect(() => {
    sectionApprovalRunRef.current += 1;
    setOwnedApprovedFields({
      ids: initialApprovedFieldIds,
      ownerKey: fieldOwnerKey,
    });
    setSectionApprovalPending(false);
    setSectionApprovedLocally(false);
    setAcceptanceError("");
    setReviewActionError("");
    setReviewActionSaved("");
  }, [fieldOwnerKey, initialApprovedFieldIds]);

  useEffect(() => {
    const wasNestedDialogOpen = wasNestedDialogOpenRef.current;
    wasNestedDialogOpenRef.current = nestedDialogOpen;
    if (nestedDialogOpen) return;
    const frame = wasNestedDialogOpen
      ? undefined
      : window.requestAnimationFrame(() => {
          workspaceRef.current
            ?.querySelector<HTMLButtonElement>("button:not([disabled])")
            ?.focus({ preventScroll: true });
        });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onBackRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = Array.from(
        workspaceRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), object, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [nestedDialogOpen]);

  useEffect(() => {
    setOwnedMediaPreviews((current) =>
      current.ownerKey === mediaOwnerKey
        ? current
        : {
            ownerKey: mediaOwnerKey,
            previews: mediaGeneration.initialMediaPreviews,
          },
    );

    mediaGeneration.protectedMedia.forEach(({ protectedFile, target }) => {
      const requestKey = mediaRequestKeys[target.type];
      if (
        !protectedFile ||
        !visitedMediaTypes.has(target.type) ||
        mediaPreviews[target.type]?.status !== "idle"
      ) {
        return;
      }

      setOwnedMediaPreviews((current) =>
        current.ownerKey === mediaOwnerKey
          ? {
              ...current,
              previews: {
                ...current.previews,
                [target.type]: { status: "loading" },
              },
            }
          : current,
      );

      void (async () => {
        let preview: ReviewMediaPreviewState = unavailablePreview;
        try {
          const url =
            __V19_LOCAL_DEMO_BUILD__ && supabaseRuntimeConfig.target === "local-demo"
              ? (
                  await import("../modules/submissions/exportMediaZipLocalDemo")
                ).localDemoReviewMediaUrl(target.type)
              : await createMediaSignedUrl({
                  bucket: mediaStorageBucket,
                  path: protectedFile.storagePath,
                });
          preview = url ? { status: "ready", url } : unavailablePreview;
        } catch {
          preview = unavailablePreview;
        }

        if (
          !mountedRef.current ||
          latestMediaRequestKeysRef.current[target.type] !== requestKey
        ) {
          return;
        }
        setOwnedMediaPreviews((current) =>
          current.ownerKey === mediaOwnerKey
            ? {
                ...current,
                previews: {
                  ...current.previews,
                  [target.type]: preview,
                },
              }
            : current,
        );
      })();
    });
  }, [
    mediaGeneration,
    mediaOwnerKey,
    mediaPreviews,
    mediaRequestKeys,
    visitedMediaTypes,
  ]);

  const passportIssueInScope = (issue: Submission["issues"][number]) =>
    Boolean(
      submission &&
      selectedApplicant &&
      passportIssueInApplicantScope(submission, selectedApplicant, issue),
    );
  const openPassportIssueCount =
    submission?.issues.filter(
      (issue) => issue.status === "open" && passportIssueInScope(issue),
    ).length ?? 0;
  const hasOpenPassportIssue = openPassportIssueCount > 0;
  const hasUnambiguousPrimaryApplicant = Boolean(
    submission && hasUnambiguousPrimaryApplicantForPassportReview(submission),
  );
  const fixedPassportIssues =
    submission?.issues.filter(
      (issue) => issue.status === "fixed_by_agent" && passportIssueInScope(issue),
    ) ?? [];
  const fixedIssues =
    submission?.issues.filter((issue) => issue.status === "fixed_by_agent") ?? [];
  const fixedPassportIssuesAcrossSubmission =
    submission?.applicants.flatMap((applicant) =>
      fixedIssues
        .filter((issue) => passportIssueInApplicantScope(submission, applicant, issue))
        .map((issue) => ({ applicant, issue })),
    ) ?? [];
  const hasFixedIssueOutsidePassport =
    fixedPassportIssuesAcrossSubmission.length !== fixedIssues.length;
  const selectedPassportCorrectionsReviewed = Boolean(
    submission &&
    selectedApplicant &&
    fixedPassportIssues.every((issue) =>
      passportCorrectionWasReviewed(submission, selectedApplicant, issue),
    ),
  );
  const allFixedPassportCorrectionsReviewed = Boolean(
    submission &&
    fixedPassportIssuesAcrossSubmission.every(({ applicant, issue }) =>
      passportCorrectionWasReviewed(submission, applicant, issue),
    ),
  );
  const allFieldsFilled =
    reviewFields.length === ADMIN_PASSPORT_REVIEW_FIELD_IDS.length &&
    reviewFields.every(
      (field) =>
        Boolean(field.sectionId) &&
        hasAdminPassportReviewValue(field.value) &&
        !field.hasError,
    );
  const pendingFieldApprovalCount = reviewFields.filter(
    (field) => !approvedFieldIds.has(field.id),
  ).length;
  const allFieldsApproved = allFieldsFilled && pendingFieldApprovalCount === 0;
  const confirmationMediaTypes = mediaTargets.map((target) => target.type);
  const requiredMediaFiles = requiredMediaTypes.map((type) =>
    submission?.files.find(
      (file) => file.applicantId === selectedApplicantId && file.type === type,
    ),
  );
  const confirmationMediaFiles = confirmationMediaTypes.map((type) =>
    submission?.files.find(
      (file) => file.applicantId === selectedApplicantId && file.type === type,
    ),
  );
  const confirmationMediaStates = confirmationMediaTypes.map((type, index) => {
    const status = mediaPreviews[type]?.status;
    if (status) return status;
    return confirmationMediaFiles[index] ? "loading" : "unavailable";
  });
  const allProtectedMediaReady = confirmationMediaStates.every(
    (status) => status === "ready",
  );
  const allProtectedMediaRendered = confirmationMediaTypes.every((type) => {
    const preview = mediaPreviews[type];
    return Boolean(
      preview?.status === "ready" &&
      preview.url &&
      renderedMediaUrls[type] === preview.url,
    );
  });
  const pendingMediaApprovalCount = confirmationMediaTypes.filter(
    (type) => !approvedMediaTypes.has(type),
  ).length;
  const allProtectedMediaApproved = pendingMediaApprovalCount === 0;
  const persistedSectionEvidenceAccepted =
    reviewFields.every((field) => field.alreadyApproved && !field.hasError) &&
    requiredMediaFiles.every((file) =>
      Boolean(file && hasCanonicalAcceptedMediaReview(file)),
    );
  const sectionAlreadyAccepted =
    sectionApprovedLocally ||
    (persistedSectionEvidenceAccepted && selectedPassportCorrectionsReviewed);
  const canConfirmSection = Boolean(
    selectedApplicantId &&
    submission &&
    isEditableReviewStatus &&
    hasUnambiguousPrimaryApplicant &&
    onApproveSection &&
    allFieldsFilled &&
    allFieldsApproved &&
    allProtectedMediaReady &&
    allProtectedMediaRendered &&
    allProtectedMediaApproved &&
    !hasOpenPassportIssue &&
    !sectionAlreadyAccepted &&
    !sectionApprovalPending,
  );
  const loadingMediaCount = confirmationMediaStates.filter(
    (status) => status === "loading",
  ).length;
  const unavailableMediaCount = confirmationMediaStates.filter(
    (status) => status === "unavailable",
  ).length;
  const requiredMediaLabel = requiredMediaTypes.includes("selfie")
    ? "паспорт и оба селфи"
    : confirmationMediaTypes.length > requiredMediaTypes.length
      ? "паспорт и файлы исправлений"
      : "паспорт";
  let completionReason = `Подтвердите ${requiredMediaLabel}, затем сохраните проверку.`;
  if (!selectedApplicantId) {
    completionReason = "Не выбран заявитель. Подтверждение недоступно.";
  } else if (!hasUnambiguousPrimaryApplicant) {
    completionReason =
      "У подачи должен быть ровно один основной заявитель. Подтверждение недоступно.";
  } else if (!isEditableReviewStatus) {
    completionReason = `Статус «${submission?.status ?? "неизвестно"}» доступен только для чтения.`;
  } else if (!allFieldsFilled) {
    completionReason = "Заполнены не все паспортные поля или в данных есть ошибка.";
  } else if (unavailableMediaCount > 0) {
    completionReason = requiredMediaTypes.includes("selfie")
      ? "Для подтверждения нужны защищённые оригиналы паспорта и двух селфи."
      : confirmationMediaTypes.length > requiredMediaTypes.length
        ? "Для подтверждения нужны защищённые оригиналы паспорта и файлов исправлений."
        : "Для подтверждения нужен защищённый оригинал паспорта.";
  } else if (loadingMediaCount > 0) {
    completionReason = "Загружаем защищённые оригиналы для сверки…";
  } else if (!allProtectedMediaRendered) {
    completionReason = "Дождитесь отображения каждого оригинала.";
  } else if (pendingMediaApprovalCount > 0) {
    completionReason = "Подтвердите каждый оригинал перед сохранением проверки.";
  } else if (hasOpenPassportIssue) {
    completionReason =
      "Есть открытое замечание. Сначала агент должен отправить исправление.";
  } else if (pendingFieldApprovalCount > 0) {
    completionReason = "Сверьте с паспортом и подтвердите каждое поле.";
  } else if (!onApproveSection) {
    completionReason = "Сохранение подтверждения не подключено.";
  } else if (sectionAlreadyAccepted) {
    completionReason = "Проверка паспорта и селфи уже сохранена.";
  } else if (sectionApprovalPending) {
    completionReason = "Сохраняем проверку паспорта и селфи…";
  }

  const returnDecision = adminReviewActions?.returnForCorrection;
  const rawAcceptDecision = adminReviewActions?.acceptForExport;
  const scopedCloseBlockedReason =
    rawAcceptDecision?.action !== "close_issues_accept"
      ? undefined
      : hasFixedIssueOutsidePassport
        ? "Есть исправления вне паспортной проверки. Их нельзя закрыть с этого экрана."
        : !allFixedPassportCorrectionsReviewed || !sectionAlreadyAccepted
          ? "Сначала сохраните проверку паспорта для каждого заявителя, затем примите подачу."
          : undefined;
  const acceptDecision =
    scopedCloseBlockedReason && rawAcceptDecision
      ? {
          ...rawAcceptDecision,
          disabled: true,
          reason: scopedCloseBlockedReason,
        }
      : rawAcceptDecision;
  const returnDecisionReason = !isEditableReviewStatus
    ? `Статус «${submission?.status ?? "неизвестно"}» доступен только для чтения.`
    : !onReviewAction
      ? "Сохранение решения не подключено."
      : (returnDecision?.reason ?? "Возврат доступен.");
  const acceptDecisionReason = !isEditableReviewStatus
    ? `Статус «${submission?.status ?? "неизвестно"}» доступен только для чтения.`
    : !onReviewAction
      ? "Сохранение решения не подключено."
      : (acceptDecision?.reason ?? "Проверка готова к решению.");
  const returnDecisionDisabled = Boolean(
    !returnDecision ||
    returnDecision.disabled ||
    !onReviewAction ||
    reviewActionPending,
  );
  const acceptDecisionDisabled = Boolean(
    !acceptDecision ||
    acceptDecision.disabled ||
    !onReviewAction ||
    reviewActionPending,
  );

  const handleConfirmSection = async () => {
    if (!canConfirmSection || !selectedApplicantId || !onApproveSection) return;
    const approvalRun = sectionApprovalRunRef.current + 1;
    sectionApprovalRunRef.current = approvalRun;
    setAcceptanceError("");
    setSectionApprovalPending(true);
    try {
      const approved = await onApproveSection({ applicantId: selectedApplicantId });
      if (!mountedRef.current || sectionApprovalRunRef.current !== approvalRun) return;
      if (approved === false) throw new Error("Approval rejected");
      setSectionApprovedLocally(true);
    } catch (error) {
      if (!mountedRef.current || sectionApprovalRunRef.current !== approvalRun) return;
      setAcceptanceError(
        persistenceFailureMessage(
          error,
          "Не удалось подтвердить паспортную секцию. Подача не была изменена. Повторите попытку.",
        ),
      );
    } finally {
      if (mountedRef.current && sectionApprovalRunRef.current === approvalRun) {
        setSectionApprovalPending(false);
      }
    }
  };

  const handleReviewDecision = async (decision?: ActionDecision) => {
    if (!decision || decision.disabled || reviewActionPending || !onReviewAction) {
      return;
    }

    setReviewActionError("");
    setReviewActionSaved("");
    setReviewActionPending(decision.action);
    try {
      const persisted = await onReviewAction(decision.action);
      if (persisted === false) throw new Error("Review action rejected");
      if (mountedRef.current) {
        setReviewActionSaved(
          decision.action === "accept" || decision.action === "close_issues_accept"
            ? "Подача принята"
            : "Подача возвращена",
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        setReviewActionError(
          persistenceFailureMessage(
            error,
            decision.action === "accept" || decision.action === "close_issues_accept"
              ? "Не удалось принять подачу. Состояние не изменено."
              : "Не удалось вернуть подачу. Состояние не изменено.",
          ),
        );
      }
    } finally {
      if (mountedRef.current) setReviewActionPending(null);
    }
  };

  const clearTransientMediaReview = (mediaType: ReviewMediaType) => {
    setOwnedRenderedMedia((current) => {
      if (current.ownerKey !== mediaOwnerKey || !current.urls[mediaType]) {
        return current;
      }
      const nextUrls = { ...current.urls };
      delete nextUrls[mediaType];
      return { ownerKey: mediaOwnerKey, urls: nextUrls };
    });
    setOwnedApprovedMedia((current) => {
      const currentTypes =
        current.ownerKey === mediaOwnerKey ? current.types : initialApprovedMediaTypes;
      if (initialApprovedMediaTypes.has(mediaType) || !currentTypes.has(mediaType)) {
        return current;
      }
      const nextTypes = new Set(currentTypes);
      nextTypes.delete(mediaType);
      return { ownerKey: mediaOwnerKey, types: nextTypes };
    });
  };

  const handleMediaReady = (
    mediaType: ReviewMediaType,
    renderedUrl: string | undefined,
    requestKey: string,
  ) => {
    if (latestMediaRequestKeysRef.current[mediaType] !== requestKey) return;
    const preview = mediaPreviews[mediaType];
    if (!renderedUrl || preview?.status !== "ready" || preview.url !== renderedUrl) {
      return;
    }
    setOwnedRenderedMedia((current) => {
      if (current.ownerKey !== mediaOwnerKey) return current;
      const currentUrls = current.urls;
      if (currentUrls[mediaType] === renderedUrl) return current;
      return {
        ownerKey: mediaOwnerKey,
        urls: { ...currentUrls, [mediaType]: renderedUrl },
      };
    });
  };

  const handlePreviewError = (mediaType: ReviewMediaType, requestKey: string) => {
    if (latestMediaRequestKeysRef.current[mediaType] !== requestKey) return;
    clearTransientMediaReview(mediaType);
    setOwnedMediaPreviews((current) =>
      current.ownerKey === mediaOwnerKey
        ? {
            ...current,
            previews: {
              ...current.previews,
              [mediaType]: unavailablePreview,
            },
          }
        : current,
    );
  };

  const handlePreviewRetry = (mediaType: ReviewMediaType, requestKey: string) => {
    if (latestMediaRequestKeysRef.current[mediaType] !== requestKey) return;
    clearTransientMediaReview(mediaType);
    setOwnedMediaPreviews((current) =>
      current.ownerKey === mediaOwnerKey
        ? {
            ...current,
            previews: {
              ...current.previews,
              [mediaType]: { status: "idle" },
            },
          }
        : current,
    );
    setMediaRequestRevisions((revisions) => ({
      ...revisions,
      [mediaType]: revisions[mediaType] + 1,
    }));
  };

  const handleMediaSelect = useCallback(
    (mediaType: ReviewMediaType) => {
      setActiveMediaType(mediaType);
      setOwnedVisitedMedia((current) => {
        const currentTypes =
          current.ownerKey === mediaOwnerKey
            ? current.types
            : new Set<ReviewMediaType>([initialActiveMediaType]);
        if (currentTypes.has(mediaType) && current.ownerKey === mediaOwnerKey) {
          return current;
        }
        const next = new Set(currentTypes);
        next.add(mediaType);
        return { ownerKey: mediaOwnerKey, types: next };
      });
    },
    [initialActiveMediaType, mediaOwnerKey],
  );

  const handleMediaApprove = useCallback(
    (mediaType: ReviewMediaType) => {
      const mediaEntry = protectedMedia.find(
        (entry) => entry.target.type === mediaType,
      );
      if (
        !isEditableReviewStatus ||
        mediaPreviews[mediaType]?.status !== "ready" ||
        !mediaPreviews[mediaType]?.url ||
        renderedMediaUrls[mediaType] !== mediaPreviews[mediaType]?.url ||
        !mediaEntry?.protectedFile
      ) {
        return;
      }

      setOwnedApprovedMedia((current) => {
        const currentTypes =
          current.ownerKey === mediaOwnerKey
            ? current.types
            : initialApprovedMediaTypes;
        if (current.ownerKey === mediaOwnerKey && currentTypes.has(mediaType)) {
          return current;
        }
        const next = new Set(currentTypes);
        next.add(mediaType);
        return { ownerKey: mediaOwnerKey, types: next };
      });
    },
    [
      initialApprovedMediaTypes,
      isEditableReviewStatus,
      mediaOwnerKey,
      mediaPreviews,
      protectedMedia,
      renderedMediaUrls,
    ],
  );

  const handleFieldApprove = (field: PassportReviewField) => {
    if (
      !isEditableReviewStatus ||
      !field.sectionId ||
      !hasAdminPassportReviewValue(field.value) ||
      field.hasError
    ) {
      return;
    }
    setOwnedApprovedFields((current) => {
      const currentIds =
        current.ownerKey === fieldOwnerKey ? current.ids : initialApprovedFieldIds;
      if (currentIds.has(field.id)) return current;
      const nextIds = new Set(currentIds);
      nextIds.add(field.id);
      return { ids: nextIds, ownerKey: fieldOwnerKey };
    });
  };

  const handleFieldRemark = (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    fieldApplicantId?: string,
  ) => {
    onAddRemark(field, applicant, fileType, fieldApplicantId);
  };

  const handleMediaTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % mediaTargets.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + mediaTargets.length) % mediaTargets.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = mediaTargets.length - 1;
    }

    if (nextIndex === undefined) return;

    const nextTarget = mediaTargets[nextIndex];
    if (!nextTarget) return;

    event.preventDefault();
    handleMediaSelect(nextTarget.type);
    mediaTabRefs.current[nextTarget.type]?.focus({ preventScroll: true });
  };

  const shortcutMediaTypes = useMemo(
    () => mediaTargets.map((target) => target.type),
    [mediaTargets],
  );
  useReviewWorkspaceShortcuts({
    disabled: nestedDialogOpen,
    mediaTypes: shortcutMediaTypes,
    onMedia: handleMediaSelect,
  });

  const activeMediaTabId = `${mediaPanelId}-${activeMediaTarget.type}`;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-hidden={nestedDialogOpen ? "true" : undefined}
      aria-label="Сверка паспорта"
      aria-modal="true"
      className="v19-review-workspace is-media-focus"
      exit={{ opacity: 0, scale: 0.985 }}
      inert={nestedDialogOpen ? true : undefined}
      initial={false}
      ref={workspaceRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="v19-review-header">
        <button
          aria-label="Вернуться к очереди"
          className="v19-review-back"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" />
          <span>Назад</span>
        </button>
        <div className="v19-review-heading">
          {submission && submission.applicants.length > 1 ? (
            <select
              aria-label="Заявитель для проверки"
              className="v19-review-header-applicant"
              onChange={(event) => onApplicantChange?.(event.target.value)}
              value={selectedApplicantId}
            >
              {submission.applicants.map((applicant) => (
                <option key={applicant.id} value={applicant.id}>
                  {applicant.fullName} —{" "}
                  {applicantPassportReviewCompleted(submission, applicant)
                    ? "проверено"
                    : "проверить"}
                </option>
              ))}
            </select>
          ) : (
            <span>{selectedApplicant?.fullName ?? "Проверка документов"}</span>
          )}
          <div>
            <h1 aria-label={`Сверка паспорта · ${submissionId}`}>Сверка паспорта</h1>
            <code title={submissionId}>{submissionId}</code>
          </div>
        </div>
      </header>

      <main className="v19-review-main">
        <section aria-label="Оригиналы документов" className="v19-review-media-pane">
          <div
            aria-labelledby={activeMediaTabId}
            className={`v19-review-media-stage${isIdentityComparison ? " is-comparison" : ""}`}
            id={mediaPanelId}
            role="tabpanel"
          >
            {isIdentityComparison ? (
              <div
                aria-label={`Сравнение паспорта и ${activeMediaTarget.shortLabel.toLocaleLowerCase()}`}
                className="v19-review-compare"
                role="group"
              >
                <ReviewMediaPreview
                  alt={passportMediaTarget.alt}
                  file={passportMediaFile}
                  generationKey={mediaRequestKeys.passport_scan}
                  label="Паспорт"
                  preview={passportPreview}
                  testId="protected-media-preview-passport_scan"
                  variant="reference"
                  onError={() =>
                    handlePreviewError("passport_scan", mediaRequestKeys.passport_scan)
                  }
                  onReady={() =>
                    handleMediaReady(
                      "passport_scan",
                      passportPreview.url,
                      mediaRequestKeys.passport_scan,
                    )
                  }
                  onRetry={() =>
                    handlePreviewRetry("passport_scan", mediaRequestKeys.passport_scan)
                  }
                />
                <ReviewMediaPreview
                  alt={activeMediaTarget.alt}
                  file={activeMediaFile}
                  generationKey={mediaRequestKeys[activeMediaTarget.type]}
                  label={activeMediaTarget.shortLabel}
                  preview={activePreview}
                  testId={`protected-media-preview-${activeMediaTarget.type}`}
                  variant="active"
                  onError={() =>
                    handlePreviewError(
                      activeMediaTarget.type,
                      mediaRequestKeys[activeMediaTarget.type],
                    )
                  }
                  onReady={() =>
                    handleMediaReady(
                      activeMediaTarget.type,
                      activePreview.url,
                      mediaRequestKeys[activeMediaTarget.type],
                    )
                  }
                  onRetry={() =>
                    handlePreviewRetry(
                      activeMediaTarget.type,
                      mediaRequestKeys[activeMediaTarget.type],
                    )
                  }
                />
              </div>
            ) : (
              <ReviewMediaPreview
                alt={activeMediaTarget.alt}
                file={activeMediaFile}
                generationKey={mediaRequestKeys[activeMediaTarget.type]}
                label={activeMediaTarget.shortLabel}
                preview={activePreview}
                testId={`protected-media-preview-${activeMediaTarget.type}`}
                variant="single"
                onError={() =>
                  handlePreviewError(
                    activeMediaTarget.type,
                    mediaRequestKeys[activeMediaTarget.type],
                  )
                }
                onReady={() =>
                  handleMediaReady(
                    activeMediaTarget.type,
                    activePreview.url,
                    mediaRequestKeys[activeMediaTarget.type],
                  )
                }
                onRetry={() =>
                  handlePreviewRetry(
                    activeMediaTarget.type,
                    mediaRequestKeys[activeMediaTarget.type],
                  )
                }
              />
            )}
          </div>

          <section aria-label="Поля паспорта" className="v19-review-field-strip">
            <header>
              <strong>Поля паспорта</strong>
              <span>
                {approvedFieldIds.size}/{ADMIN_PASSPORT_REVIEW_FIELD_IDS.length}
              </span>
            </header>
            <div
              aria-label="Лента полей для сверки с паспортом"
              className="v19-review-field-carousel"
              tabIndex={0}
            >
              {reviewFields.map((field) => (
                <ReviewPassportFieldRow
                  applicant={selectedApplicant}
                  approved={approvedFieldIds.has(field.id)}
                  field={field}
                  key={field.id}
                  onAddRemark={handleFieldRemark}
                  onApprove={() => handleFieldApprove(field)}
                  readOnly={!isEditableReviewStatus}
                />
              ))}
            </div>
          </section>

          <div className="v19-review-media-switcher">
            <div className="v19-review-media-actions">
              <div
                aria-label="Выбор файла для проверки"
                className="v19-review-media-tabs"
                role="tablist"
              >
                {mediaTargets.map((target, index) => (
                  <button
                    aria-controls={mediaPanelId}
                    aria-keyshortcuts={`${index + 1}`}
                    aria-selected={activeMediaTarget.type === target.type}
                    className={
                      activeMediaTarget.type === target.type ? "is-active" : undefined
                    }
                    key={target.type}
                    data-review-media={target.type}
                    id={`${mediaPanelId}-${target.type}`}
                    onClick={() => handleMediaSelect(target.type)}
                    onKeyDown={(event) => handleMediaTabKeyDown(event, index)}
                    ref={(element) => {
                      mediaTabRefs.current[target.type] = element;
                    }}
                    role="tab"
                    tabIndex={activeMediaTarget.type === target.type ? 0 : -1}
                    type="button"
                    aria-label={target.shortLabel}
                  >
                    {activeMediaTarget.type === target.type ? (
                      <motion.span
                        aria-hidden="true"
                        className="v19-review-media-tab-active"
                        layoutId="v19-review-media-tab-active"
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      />
                    ) : null}
                    <span className="v19-review-media-tab-label">
                      {target.shortLabel}
                    </span>
                    {approvedMediaTypes.has(target.type) ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="v19-review-media-tab-visited"
                      />
                    ) : null}
                    <kbd aria-hidden="true">{index + 1}</kbd>
                  </button>
                ))}
              </div>
              {isEditableReviewStatus ? (
                <div
                  aria-label={`Решение по документу: ${activeMediaTarget.shortLabel}`}
                  className="v19-review-file-actions"
                  role="group"
                >
                  <button
                    aria-label={`Добавить замечание: ${activeMediaTarget.label}`}
                    className="v19-review-file-remark"
                    onClick={() => {
                      onAddRemark(
                        `${activeMediaTarget.label}: требуется проверка`,
                        selectedApplicant?.fullName,
                        activeMediaTarget.type,
                        selectedApplicantId,
                      );
                    }}
                    type="button"
                  >
                    <MessageSquarePlus aria-hidden="true" />
                    <span>Замечание</span>
                  </button>
                  <button
                    aria-label={
                      approvedMediaTypes.has(activeMediaTarget.type)
                        ? `Оригинал проверен: ${activeMediaTarget.shortLabel}`
                        : `Подтвердить оригинал: ${activeMediaTarget.shortLabel}`
                    }
                    className={`v19-review-file-approve${approvedMediaTypes.has(activeMediaTarget.type) ? " is-approved" : ""}`}
                    disabled={
                      approvedMediaTypes.has(activeMediaTarget.type) ||
                      activePreview.status !== "ready" ||
                      !activeMediaRendered ||
                      !protectedMedia.find(
                        (entry) => entry.target.type === activeMediaTarget.type,
                      )?.protectedFile
                    }
                    onClick={() => handleMediaApprove(activeMediaTarget.type)}
                    type="button"
                  >
                    <CheckCircle2 aria-hidden="true" />
                    <span>
                      {approvedMediaTypes.has(activeMediaTarget.type)
                        ? "Проверено"
                        : "Подтвердить"}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="v19-review-details-pane">
          <div className="v19-review-details-scroll">
            <section
              aria-busy={sectionApprovalPending}
              aria-live="polite"
              className={`v19-review-confirmation${sectionApprovalPending ? " is-pending" : ""}${sectionAlreadyAccepted ? " is-complete" : ""}${acceptanceError ? " is-error" : ""}${canConfirmSection ? " is-ready" : ""}`}
            >
              <div>
                <strong>Паспорт и селфи</strong>
                <p id="passport-review-completion-reason">{completionReason}</p>
              </div>
              {isEditableReviewStatus ? (
                <button
                  aria-busy={sectionApprovalPending}
                  aria-describedby="passport-review-completion-reason"
                  aria-description={completionReason}
                  disabled={!canConfirmSection}
                  id="passport-review-confirm-button"
                  onClick={() => void handleConfirmSection()}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" />
                  {sectionActionLabel(sectionAlreadyAccepted, sectionApprovalPending)}
                </button>
              ) : (
                <span className="v19-review-read-only-badge">Только просмотр</span>
              )}
              {acceptanceError ? (
                <p className="v19-review-inline-error" role="alert">
                  {acceptanceError}
                </p>
              ) : null}
            </section>
          </div>

          <footer
            aria-busy={Boolean(reviewActionPending)}
            aria-live="polite"
            className={`v19-review-decision${reviewActionPending ? " is-pending" : ""}${reviewActionError ? " is-error" : ""}`}
          >
            {isEditableReviewStatus ? (
              <div className="v19-review-decision-actions">
                <button
                  aria-busy={Boolean(reviewActionPending)}
                  aria-description={returnDecisionReason}
                  className="v19-review-return"
                  disabled={returnDecisionDisabled}
                  onClick={() => void handleReviewDecision(returnDecision)}
                  type="button"
                >
                  <MessageSquarePlus aria-hidden="true" />
                  {returnDecision && reviewActionPending === returnDecision.action
                    ? "Возвращаем…"
                    : "Вернуть"}
                </button>
                <button
                  aria-busy={Boolean(reviewActionPending)}
                  aria-description={acceptDecisionReason}
                  className="v19-review-accept"
                  disabled={acceptDecisionDisabled}
                  onClick={() => void handleReviewDecision(acceptDecision)}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" />
                  {acceptDecision && reviewActionPending === acceptDecision.action
                    ? "Принимаем…"
                    : "Принять"}
                </button>
              </div>
            ) : (
              <span className="v19-review-read-only-badge">Мутации недоступны</span>
            )}

            {reviewActionError ? (
              <p className="v19-review-decision-error" role="alert">
                {reviewActionError}
              </p>
            ) : null}
            {reviewActionPending ? (
              <p className="v19-review-decision-saving" role="status">
                {reviewActionPending === "accept" ||
                reviewActionPending === "close_issues_accept"
                  ? "Сохраняем принятие подачи…"
                  : "Сохраняем возврат подачи…"}
              </p>
            ) : null}
            {reviewActionSaved ? (
              <p className="v19-review-decision-saved" role="status">
                {reviewActionSaved}
              </p>
            ) : null}
          </footer>
        </section>
      </main>
    </motion.div>
  );
}
