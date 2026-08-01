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
import "../shared/ui/admin-review-composition.css";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Maximize2,
  MessageSquarePlus,
  RotateCw,
  UserRound,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  createMediaSignedUrl,
  mediaStorageBucket,
} from "../modules/submissions/mediaStorage";
import { supabaseRuntimeConfig } from "../lib/supabase/config";
import { isPersistablePrivateFileAssetAtSubmissionTarget } from "../modules/submissions/fileAsset";
import { getAdminReviewActions, statusLabelFor } from "../modules/submissions/status";
import { questionnaireIssueFieldDisplayLabel } from "../modules/submissions/questionnaire";
import {
  ADMIN_PASSPORT_REVIEW_FIELD_IDS,
  ADMIN_PASSPORT_REVIEW_FIELD_LABELS,
  hasAdminPassportReviewValue,
  hasUnambiguousPrimaryApplicantForPassportReview,
  isAdminPassportReviewIssueInScope,
  passportReviewMediaTypesVisibleForApplicant,
  requiredPassportReviewMediaTypesForApplicant,
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
import { linearDrawerMotion } from "../shared/ui/drawer/linearDrawerMotion";
import { useExperienceReducedMotion } from "../shared/ui/experiencePreferences";
import { persistenceFailureMessage } from "./review/persistenceFailureMessage";
import { useReviewWorkspaceShortcuts } from "./review/useReviewWorkspaceShortcuts";

interface ReviewWorkspaceProps {
  applicantId?: string;
  nestedDialogOpen?: boolean;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
    fieldLabel?: string,
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

const initialVisitedMediaTypes = new Set<ReviewMediaType>(["passport_scan"]);

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

function reviewFileName(target: ReviewMediaTarget, file?: SubmissionFile) {
  const missingFileLabel =
    target.type === "passport_scan"
      ? "Паспорт не загружен"
      : `${target.label} не загружен`;

  return file?.originalFileName ?? file?.generatedFileName ?? missingFileLabel;
}

function sectionActionLabel(accepted: boolean, pending: boolean, canConfirm: boolean) {
  if (accepted) return "Секция подтверждена";
  if (pending) return "Сохраняем…";
  return canConfirm ? "Подтвердить паспортную секцию" : "Перейти к следующему шагу";
}

function sectionActionAccessibleLabel(
  accepted: boolean,
  pending: boolean,
  canConfirm: boolean,
  completedActionLabel?: string,
) {
  if (accepted) {
    return completedActionLabel ?? "Перейти к решению по подаче: секция подтверждена";
  }
  if (pending) return "Сохраняется подтверждение паспортной секции";
  return canConfirm
    ? "Подтвердить паспортную секцию"
    : "Перейти к следующему шагу в паспортной секции";
}

function reviewActionLabel(
  decision: ActionDecision | undefined,
  pendingAction: SubmissionAction | null,
  fallback: string,
  pendingLabel: string,
) {
  if (decision && pendingAction === decision.action) return pendingLabel;
  return decision?.label ?? fallback;
}

export function ReviewWorkspace({
  applicantId,
  nestedDialogOpen = false,
  onAddRemark,
  onApplicantChange,
  onApproveSection,
  onReviewAction,
  onBack,
  submission,
  submissionId,
}: ReviewWorkspaceProps) {
  const prefersReducedMotion = useExperienceReducedMotion();
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const decisionFooterRef = useRef<HTMLElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const mediaTabRefs = useRef<
    Partial<Record<ReviewMediaType, HTMLButtonElement | null>>
  >({});
  const mediaPanelId = useId();
  const onBackRef = useRef(onBack);
  const mountedRef = useRef(true);
  const localDemoObjectUrlsRef = useRef(new Set<string>());
  const localDemoObjectUrlByTypeRef = useRef(new Map<ReviewMediaType, string>());
  const reviewActionPendingRef = useRef(false);
  const reviewActionRunRef = useRef(0);
  const sectionApprovalPendingRef = useRef(false);
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
      ].join(":"),
    )
    .join("|");
  const mediaOwnerKey = `${submissionId}:${selectedApplicantId ?? "unselected"}:${mediaGenerationKey}`;
  const activeMediaOwnerKeyRef = useRef(mediaOwnerKey);
  activeMediaOwnerKeyRef.current = mediaOwnerKey;
  const [activeMediaType, setActiveMediaType] =
    useState<ReviewMediaType>("passport_scan");
  const [ownedVisitedMedia, setOwnedVisitedMedia] = useState<OwnedVisitedMediaState>({
    ownerKey: mediaOwnerKey,
    types: initialVisitedMediaTypes,
  });
  const visitedMediaTypes =
    ownedVisitedMedia.ownerKey === mediaOwnerKey
      ? ownedVisitedMedia.types
      : initialVisitedMediaTypes;
  const [mediaRequestRevision, setMediaRequestRevision] = useState(0);
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
    // The owner key fingerprints every value consumed by this async generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mediaOwnerKey],
  );
  const [ownedMediaPreviews, setOwnedMediaPreviews] = useState<OwnedPreviewState>({
    ownerKey: mediaOwnerKey,
    previews: initialMediaPreviews,
  });
  const mediaPreviews =
    ownedMediaPreviews.ownerKey === mediaOwnerKey
      ? ownedMediaPreviews.previews
      : initialMediaPreviews;
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
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
  const activePreviewUrl =
    activePreview.status === "ready" ? activePreview.url : undefined;
  const activeMediaIsPdf = Boolean(
    activeMediaFile?.mimeType === "application/pdf" ||
    activeMediaFile?.originalFileName?.toLocaleLowerCase().endsWith(".pdf") ||
    activeMediaFile?.generatedFileName?.toLocaleLowerCase().endsWith(".pdf"),
  );
  const activeMediaSupportsTransform = Boolean(activePreviewUrl && !activeMediaIsPdf);
  const passportMediaTarget = mediaTargetsByType.passport_scan;
  const passportMediaFile = submission?.files.find(
    (file) => file.applicantId === selectedApplicantId && file.type === "passport_scan",
  );
  const passportPreview = mediaPreviews.passport_scan ?? unavailablePreview;
  const isIdentityComparison = activeMediaTarget.type !== "passport_scan";
  const activeMediaTransform = `scale(${zoom / 100}) rotate(${rotation}deg)`;
  const adminReviewActions = submission
    ? getAdminReviewActions(submission, "admin")
    : null;
  const applicantReviewStates = useMemo(() => {
    if (!submission) return [];

    return submission.applicants.map((applicant) => {
      const fields = reviewFieldsForApplicant(applicant);
      const mediaTypes = requiredPassportReviewMediaTypesForApplicant(
        submission,
        applicant.id,
      );
      const completed =
        fields.length === ADMIN_PASSPORT_REVIEW_FIELD_IDS.length &&
        fields.every(
          (field) =>
            field.alreadyApproved &&
            hasAdminPassportReviewValue(field.value) &&
            !field.hasError,
        ) &&
        mediaTypes.every((type) =>
          submission.files.some(
            (file) =>
              file.applicantId === applicant.id &&
              file.type === type &&
              file.status === "accepted",
          ),
        );

      return {
        completed,
        id: applicant.id,
        name: applicant.fullName,
      };
    });
  }, [submission]);

  useEffect(() => {
    mountedRef.current = true;
    const localDemoObjectUrls = localDemoObjectUrlsRef.current;
    const localDemoObjectUrlsByType = localDemoObjectUrlByTypeRef.current;
    return () => {
      mountedRef.current = false;
      for (const url of localDemoObjectUrls) {
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(url);
        }
      }
      localDemoObjectUrls.clear();
      localDemoObjectUrlsByType.clear();
      reviewActionPendingRef.current = false;
      reviewActionRunRef.current += 1;
      sectionApprovalPendingRef.current = false;
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
    for (const url of localDemoObjectUrlsRef.current) {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    }
    localDemoObjectUrlsRef.current.clear();
    localDemoObjectUrlByTypeRef.current.clear();
    reviewActionPendingRef.current = false;
    reviewActionRunRef.current += 1;
    sectionApprovalPendingRef.current = false;
    sectionApprovalRunRef.current += 1;
    setActiveMediaType("passport_scan");
    setOwnedVisitedMedia({
      ownerKey: mediaOwnerKey,
      types: initialVisitedMediaTypes,
    });
    setZoom(100);
    setRotation(0);
    setSectionApprovalPending(false);
    setSectionApprovedLocally(false);
    setAcceptanceError("");
    setReviewActionPending(null);
    setReviewActionError("");
    setReviewActionSaved("");
  }, [mediaOwnerKey, selectedApplicantId, submissionId]);

  useEffect(() => {
    const footer = decisionFooterRef.current;
    const workspace = workspaceRef.current;
    if (!footer || !workspace) return;

    const updateDecisionHeight = () => {
      const height = Math.ceil(footer.getBoundingClientRect().height);
      if (height > 0) {
        workspace.style.setProperty("--v19-review-decision-height", `${height}px`);
      }
    };

    updateDecisionHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateDecisionHeight);
      return () => {
        window.removeEventListener("resize", updateDecisionHeight);
        workspace.style.removeProperty("--v19-review-decision-height");
      };
    }

    const observer = new ResizeObserver(updateDecisionHeight);
    observer.observe(footer);
    return () => {
      observer.disconnect();
      workspace.style.removeProperty("--v19-review-decision-height");
    };
  }, []);

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
                ).localDemoReviewMediaUrl(target.type, protectedFile, submissionId)
              : await createMediaSignedUrl({
                  bucket: mediaStorageBucket,
                  path: protectedFile.storagePath,
                });
          const resolvedUrl = await url;
          if (!mountedRef.current || activeMediaOwnerKeyRef.current !== mediaOwnerKey) {
            if (
              resolvedUrl?.startsWith("blob:") &&
              typeof URL.revokeObjectURL === "function"
            ) {
              URL.revokeObjectURL(resolvedUrl);
            }
            return;
          }

          const previousObjectUrl = localDemoObjectUrlByTypeRef.current.get(
            target.type,
          );
          if (
            previousObjectUrl &&
            previousObjectUrl !== resolvedUrl &&
            typeof URL.revokeObjectURL === "function"
          ) {
            URL.revokeObjectURL(previousObjectUrl);
            localDemoObjectUrlsRef.current.delete(previousObjectUrl);
          }
          localDemoObjectUrlByTypeRef.current.delete(target.type);
          if (resolvedUrl?.startsWith("blob:")) {
            localDemoObjectUrlsRef.current.add(resolvedUrl);
            localDemoObjectUrlByTypeRef.current.set(target.type, resolvedUrl);
          }
          preview = resolvedUrl
            ? { status: "ready", url: resolvedUrl }
            : unavailablePreview;
        } catch {
          preview = unavailablePreview;
        }

        if (!mountedRef.current || activeMediaOwnerKeyRef.current !== mediaOwnerKey) {
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
    mediaRequestRevision,
    submissionId,
    visitedMediaTypes,
  ]);

  const passportIssueInScope = (issue: Submission["issues"][number]) =>
    Boolean(
      selectedApplicantId &&
      isAdminPassportReviewIssueInScope(issue, {
        applicantId: selectedApplicantId,
        fields: reviewFields.map((field) => ({
          id: field.id,
          label: field.sourceLabel,
        })),
        mediaTypes: mediaTargets.map((target) => target.type),
      }),
    );
  const openPassportIssueCount =
    submission?.issues.filter(
      (issue) => issue.status === "open" && passportIssueInScope(issue),
    ).length ?? 0;
  const fixedPassportIssueCount =
    submission?.issues.filter(
      (issue) => issue.status === "fixed_by_agent" && passportIssueInScope(issue),
    ).length ?? 0;
  const correctedIssuesAwaitingClosure =
    submission?.issues.filter((issue) => issue.status === "fixed_by_agent") ?? [];
  const openSubmissionIssueCount =
    submission?.issues.filter((issue) => issue.status === "open").length ?? 0;
  const fixedSubmissionIssueCount = correctedIssuesAwaitingClosure.length;
  const reviewDecisionIssueLabel =
    [
      openSubmissionIssueCount > 0 ? `Открыто ${openSubmissionIssueCount}` : "",
      fixedSubmissionIssueCount > 0 ? `К закрытию ${fixedSubmissionIssueCount}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Без замечаний";
  const hasOpenPassportIssue = openPassportIssueCount > 0;
  const hasUnambiguousPrimaryApplicant = Boolean(
    submission && hasUnambiguousPrimaryApplicantForPassportReview(submission),
  );
  const hasFixedPassportIssue = Boolean(
    submission?.issues.some(
      (issue) => issue.status === "fixed_by_agent" && passportIssueInScope(issue),
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
  const pendingMediaReviewCount = confirmationMediaTypes.filter(
    (type) => !visitedMediaTypes.has(type),
  ).length;
  const allProtectedMediaReviewed = pendingMediaReviewCount === 0;
  const sectionAlreadyAccepted =
    sectionApprovedLocally ||
    (reviewFields.every((field) => field.alreadyApproved) &&
      requiredMediaFiles.every((file) => file?.status === "accepted") &&
      !hasFixedPassportIssue);
  const canConfirmSection = Boolean(
    selectedApplicantId &&
    submission &&
    isEditableReviewStatus &&
    hasUnambiguousPrimaryApplicant &&
    onApproveSection &&
    allFieldsFilled &&
    allProtectedMediaReady &&
    allProtectedMediaReviewed &&
    !hasOpenPassportIssue &&
    !sectionAlreadyAccepted &&
    !sectionApprovalPending,
  );
  const filledFieldCount = reviewFields.filter(
    (field) => hasAdminPassportReviewValue(field.value) && !field.hasError,
  ).length;
  const loadingMediaCount = confirmationMediaStates.filter(
    (status) => status === "loading",
  ).length;
  const unavailableMediaCount = confirmationMediaStates.filter(
    (status) => status === "unavailable",
  ).length;
  const readyMediaCount = confirmationMediaStates.filter(
    (status) => status === "ready",
  ).length;
  const mediaStatusLabel = [
    unavailableMediaCount > 0 ? `недоступно ${unavailableMediaCount}` : "",
    loadingMediaCount > 0 ? `загружается ${loadingMediaCount}` : "",
    pendingMediaReviewCount > 0 ? `не просмотрено ${pendingMediaReviewCount}` : "",
    `доступно ${readyMediaCount} из ${confirmationMediaTypes.length}`,
  ]
    .filter(Boolean)
    .join("; ");
  const requiredMediaLabel = requiredMediaTypes.includes("selfie")
    ? "паспорт и оба селфи"
    : confirmationMediaTypes.length > requiredMediaTypes.length
      ? "паспорт и файлы исправлений"
      : "паспорт";
  let completionReason = `Сверьте все ${ADMIN_PASSPORT_REVIEW_FIELD_IDS.length} паспортных полей и ${requiredMediaLabel} перед подтверждением секции.`;
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
  } else if (pendingMediaReviewCount > 0) {
    completionReason =
      "Откройте и проверьте каждый обязательный оригинал перед подтверждением.";
  } else if (hasOpenPassportIssue) {
    completionReason =
      "Есть открытое замечание. Сначала агент должен отправить исправление.";
  } else if (!onApproveSection) {
    completionReason = "Сохранение подтверждения не подключено.";
  } else if (sectionAlreadyAccepted) {
    completionReason = "Паспортная секция уже подтверждена.";
  } else if (sectionApprovalPending) {
    completionReason = "Сохраняем подтверждение паспортной секции…";
  }
  const sectionReviewHeadline = !isEditableReviewStatus
    ? "Просмотр без изменений"
    : sectionAlreadyAccepted
      ? "Паспортная секция принята"
      : canConfirmSection
        ? "Секция готова к принятию"
        : "Завершите сверку паспорта";

  const returnDecision = adminReviewActions?.returnForCorrection;
  const acceptDecision = adminReviewActions?.acceptForExport;
  const nextIncompleteApplicant = applicantReviewStates.find(
    (state) => state.id !== selectedApplicantId && !state.completed,
  );
  const completedSectionDecisionSelector =
    acceptDecision && !acceptDecision.disabled
      ? ".v19-review-accept:not([disabled])"
      : returnDecision && !returnDecision.disabled
        ? ".v19-review-return:not([disabled])"
        : "";
  const completedSectionNextApplicant =
    !completedSectionDecisionSelector && onApplicantChange
      ? nextIncompleteApplicant
      : undefined;
  const completedSectionActionLabel = completedSectionNextApplicant
    ? `Перейти к следующему заявителю: ${completedSectionNextApplicant.name}`
    : "Перейти к решению по подаче: секция подтверждена";
  let reviewDecisionReason = "Проверка готова к решению.";
  if (!isEditableReviewStatus) {
    reviewDecisionReason = `Статус «${submission?.status ?? "неизвестно"}» доступен только для чтения.`;
  } else if (!onReviewAction) {
    reviewDecisionReason = "Сохранение решения не подключено.";
  } else {
    const availableDecision =
      acceptDecision && !acceptDecision.disabled
        ? acceptDecision
        : returnDecision && !returnDecision.disabled
          ? returnDecision
          : undefined;
    reviewDecisionReason = availableDecision
      ? (availableDecision.reason ?? reviewDecisionReason)
      : (acceptDecision?.reason ?? returnDecision?.reason ?? reviewDecisionReason);
  }

  const handleConfirmSection = async () => {
    if (
      sectionApprovalPendingRef.current ||
      !selectedApplicantId ||
      !onApproveSection
    ) {
      return;
    }
    if (!canConfirmSection) {
      handleNextReviewStep();
      return;
    }
    const approvalRun = sectionApprovalRunRef.current + 1;
    sectionApprovalRunRef.current = approvalRun;
    sectionApprovalPendingRef.current = true;
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
        sectionApprovalPendingRef.current = false;
        setSectionApprovalPending(false);
      }
    }
  };

  const handleReviewDecision = async (decision?: ActionDecision) => {
    if (
      reviewActionPendingRef.current ||
      !decision ||
      decision.disabled ||
      reviewActionPending ||
      !onReviewAction
    ) {
      return;
    }

    const actionRun = reviewActionRunRef.current + 1;
    reviewActionRunRef.current = actionRun;
    reviewActionPendingRef.current = true;
    setReviewActionError("");
    setReviewActionSaved("");
    setReviewActionPending(decision.action);
    try {
      const persisted = await onReviewAction(decision.action);
      if (!mountedRef.current || reviewActionRunRef.current !== actionRun) return;
      if (persisted === false) throw new Error("Review action rejected");
      setReviewActionSaved(
        decision.action === "accept" || decision.action === "close_issues_accept"
          ? "Подача принята и сохранена."
          : "Возврат на исправление сохранён.",
      );
      onBack();
    } catch (error) {
      if (!mountedRef.current || reviewActionRunRef.current !== actionRun) return;
      setReviewActionError(
        persistenceFailureMessage(
          error,
          decision.action === "accept" || decision.action === "close_issues_accept"
            ? "Не удалось принять подачу. Состояние не изменено."
            : "Не удалось вернуть подачу. Состояние не изменено.",
        ),
      );
    } finally {
      if (mountedRef.current && reviewActionRunRef.current === actionRun) {
        reviewActionPendingRef.current = false;
        setReviewActionPending(null);
      }
    }
  };

  const handlePreviewError = (mediaType: ReviewMediaType) => {
    const objectUrl = localDemoObjectUrlByTypeRef.current.get(mediaType);
    if (objectUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(objectUrl);
      localDemoObjectUrlsRef.current.delete(objectUrl);
      localDemoObjectUrlByTypeRef.current.delete(mediaType);
    }
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

  const handlePreviewRetry = (mediaType: ReviewMediaType) => {
    const objectUrl = localDemoObjectUrlByTypeRef.current.get(mediaType);
    if (objectUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(objectUrl);
      localDemoObjectUrlsRef.current.delete(objectUrl);
      localDemoObjectUrlByTypeRef.current.delete(mediaType);
    }
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
    setMediaRequestRevision((revision) => revision + 1);
  };

  const handleFullscreen = () => {
    void previewPaneRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const handleMediaSelect = useCallback(
    (mediaType: ReviewMediaType) => {
      setActiveMediaType(mediaType);
      setOwnedVisitedMedia((current) => {
        const currentTypes =
          current.ownerKey === mediaOwnerKey ? current.types : initialVisitedMediaTypes;
        if (currentTypes.has(mediaType) && current.ownerKey === mediaOwnerKey) {
          return current;
        }
        const next = new Set(currentTypes);
        next.add(mediaType);
        return { ownerKey: mediaOwnerKey, types: next };
      });
      setZoom(100);
      setRotation(0);
    },
    [mediaOwnerKey],
  );

  const handleNextReviewStep = useCallback(() => {
    if (sectionAlreadyAccepted) {
      const decision = completedSectionDecisionSelector
        ? decisionFooterRef.current?.querySelector<HTMLButtonElement>(
            completedSectionDecisionSelector,
          )
        : undefined;
      if (decision) {
        decision.scrollIntoView?.({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "nearest",
        });
        decision.focus({ preventScroll: true });
        return;
      }
      if (completedSectionNextApplicant && onApplicantChange) {
        onApplicantChange(completedSectionNextApplicant.id);
        return;
      }
      decisionFooterRef.current?.scrollIntoView?.({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
      decisionFooterRef.current?.focus({ preventScroll: true });
      return;
    }

    const nextMediaType =
      confirmationMediaTypes.find((type) => !visitedMediaTypes.has(type)) ??
      confirmationMediaTypes.find((type) => mediaPreviews[type]?.status !== "ready");
    if (nextMediaType) {
      handleMediaSelect(nextMediaType);
      window.requestAnimationFrame(() => {
        const tab = mediaTabRefs.current[nextMediaType];
        tab?.scrollIntoView?.({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "nearest",
          inline: "center",
        });
        tab?.focus({ preventScroll: true });
      });
      return;
    }

    const nextField = reviewFields.find(
      (field) => !hasAdminPassportReviewValue(field.value) || Boolean(field.hasError),
    );
    if (nextField) {
      const fieldCard = workspaceRef.current?.querySelector<HTMLElement>(
        `[data-passport-field-id="${nextField.id}"]`,
      );
      fieldCard?.scrollIntoView?.({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      fieldCard
        ?.querySelector<HTMLButtonElement>("button:not([disabled])")
        ?.focus({ preventScroll: true });
      return;
    }

    const sectionConfirm = workspaceRef.current?.querySelector<HTMLButtonElement>(
      "#passport-review-confirm-button:not([disabled])",
    );
    if (sectionConfirm) {
      sectionConfirm.scrollIntoView?.({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
      sectionConfirm.focus({ preventScroll: true });
      return;
    }

    const decision = decisionFooterRef.current?.querySelector<HTMLButtonElement>(
      ".v19-review-accept:not([disabled]), .v19-review-return:not([disabled])",
    );
    decision?.scrollIntoView?.({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
    decision?.focus({ preventScroll: true });
  }, [
    confirmationMediaTypes,
    completedSectionDecisionSelector,
    completedSectionNextApplicant,
    handleMediaSelect,
    mediaPreviews,
    onApplicantChange,
    prefersReducedMotion,
    reviewFields,
    sectionAlreadyAccepted,
    visitedMediaTypes,
  ]);

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
      className="v19-review-workspace"
      data-reduced-motion={prefersReducedMotion ? "true" : "false"}
      exit={
        prefersReducedMotion ? { opacity: 0, scale: 1 } : { opacity: 0, scale: 0.985 }
      }
      inert={nestedDialogOpen ? true : undefined}
      initial={false}
      ref={workspaceRef}
      role="dialog"
      tabIndex={-1}
      transition={prefersReducedMotion ? linearDrawerMotion.reduced : undefined}
    >
      <main className="v19-review-main">
        <section aria-label="Оригиналы документов" className="v19-review-media-pane">
          <div className="v19-review-media-toolbar">
            <div className="v19-review-filebar">
              <div className="v19-review-file-leading">
                <button
                  aria-label="Вернуться к очереди"
                  className="v19-review-back v19-review-toolbar-back"
                  onClick={onBack}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
                {activeMediaTarget.type === "passport_scan" ? (
                  <FileText aria-hidden="true" />
                ) : (
                  <UserRound aria-hidden="true" />
                )}
                <span title={reviewFileName(activeMediaTarget, activeMediaFile)}>
                  {activeMediaTarget.shortLabel}
                </span>
              </div>
              {selectedApplicant || submission ? (
                <div
                  aria-label="Контекст проверки подачи"
                  className="v19-review-file-identity"
                >
                  <span>{selectedApplicant?.fullName ?? "Заявитель"}</span>
                  <code>{submissionId}</code>
                  {submission ? (
                    <em>{statusLabelFor(submission.status, "full")}</em>
                  ) : null}
                </div>
              ) : null}
              <div className="v19-review-media-controls">
                <button
                  aria-label="Уменьшить изображение"
                  disabled={!activeMediaSupportsTransform || zoom <= 60}
                  onClick={() => setZoom((value) => Math.max(60, value - 10))}
                  type="button"
                >
                  <ZoomOut aria-hidden="true" />
                </button>
                <output aria-label="Масштаб изображения">{zoom}%</output>
                <button
                  aria-label="Увеличить изображение"
                  disabled={!activeMediaSupportsTransform || zoom >= 180}
                  onClick={() => setZoom((value) => Math.min(180, value + 10))}
                  type="button"
                >
                  <ZoomIn aria-hidden="true" />
                </button>
                <button
                  aria-label="Повернуть изображение"
                  disabled={!activeMediaSupportsTransform}
                  onClick={() => setRotation((value) => (value + 90) % 360)}
                  type="button"
                >
                  <RotateCw aria-hidden="true" />
                </button>
                <button
                  aria-label="Открыть на весь экран"
                  className="v19-review-fullscreen"
                  disabled={!activePreviewUrl}
                  onClick={handleFullscreen}
                  type="button"
                >
                  <Maximize2 aria-hidden="true" />
                </button>
                <a
                  aria-disabled={!activePreviewUrl}
                  aria-label="Скачать файл"
                  className={`v19-review-download v19-review-toolbar-download${activePreviewUrl ? "" : " is-disabled"}`}
                  download={
                    activeMediaFile
                      ? reviewFileName(activeMediaTarget, activeMediaFile)
                      : undefined
                  }
                  href={activePreviewUrl}
                  tabIndex={activePreviewUrl ? undefined : -1}
                >
                  <Download aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>

          <div
            aria-labelledby={activeMediaTabId}
            className={`v19-review-media-stage${isIdentityComparison ? " is-comparison" : ""}`}
            id={mediaPanelId}
            ref={previewPaneRef}
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
                  label="Паспорт"
                  preview={passportPreview}
                  testId="protected-media-preview-passport_scan"
                  variant="reference"
                  onError={() => handlePreviewError("passport_scan")}
                  onRetry={() => handlePreviewRetry("passport_scan")}
                />
                <ReviewMediaPreview
                  alt={activeMediaTarget.alt}
                  file={activeMediaFile}
                  label={activeMediaTarget.shortLabel}
                  preview={activePreview}
                  testId={`protected-media-preview-${activeMediaTarget.type}`}
                  transform={activeMediaTransform}
                  variant="active"
                  onError={() => handlePreviewError(activeMediaTarget.type)}
                  onRetry={() => handlePreviewRetry(activeMediaTarget.type)}
                />
              </div>
            ) : (
              <ReviewMediaPreview
                alt={activeMediaTarget.alt}
                file={activeMediaFile}
                focus="identity"
                label={activeMediaTarget.shortLabel}
                preview={activePreview}
                testId={`protected-media-preview-${activeMediaTarget.type}`}
                transform={activeMediaTransform}
                variant="single"
                onError={() => handlePreviewError(activeMediaTarget.type)}
                onRetry={() => handlePreviewRetry(activeMediaTarget.type)}
              />
            )}
          </div>

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
                        transition={
                          prefersReducedMotion
                            ? linearDrawerMotion.reduced
                            : { duration: 0.18, ease: "easeOut" }
                        }
                      />
                    ) : null}
                    <span className="v19-review-media-tab-label">
                      {target.shortLabel}
                    </span>
                    {visitedMediaTypes.has(target.type) &&
                    mediaPreviews[target.type]?.status === "ready" ? (
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
                <button
                  aria-label={`Добавить замечание: ${activeMediaTarget.label}`}
                  className="linear-product-action linear-product-action--warning v19-review-file-remark"
                  onClick={() =>
                    onAddRemark(
                      `${activeMediaTarget.label}: требуется проверка`,
                      selectedApplicant?.fullName,
                      activeMediaTarget.type,
                      selectedApplicantId,
                    )
                  }
                  type="button"
                >
                  <MessageSquarePlus aria-hidden="true" />
                  <span>Замечание</span>
                </button>
              ) : null}
              <a
                aria-disabled={!activePreviewUrl}
                aria-label="Скачать текущий файл"
                className={`v19-review-mobile-download${activePreviewUrl ? "" : " is-disabled"}`}
                download={
                  activeMediaFile
                    ? reviewFileName(activeMediaTarget, activeMediaFile)
                    : undefined
                }
                href={activePreviewUrl}
                tabIndex={activePreviewUrl ? undefined : -1}
              >
                <Download aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="v19-review-details-pane">
          {submission && submission.applicants.length > 1 ? (
            <header className="v19-review-details-header is-applicant-only">
              <label className="v19-review-applicant-select">
                <span className="sr-only">Заявитель</span>
                <select
                  aria-label="Заявитель для проверки"
                  onChange={(event) => onApplicantChange?.(event.target.value)}
                  value={selectedApplicantId}
                >
                  {submission.applicants.map((applicant) => (
                    <option key={applicant.id} value={applicant.id}>
                      {applicant.fullName}
                    </option>
                  ))}
                </select>
              </label>
            </header>
          ) : null}

          <div className="v19-review-details-scroll">
            <section
              aria-label="Готовность паспортной проверки"
              className="v19-review-summary"
            >
              <div className="v19-review-summary-copy">
                <span>Сверка документа</span>
                <strong>{sectionReviewHeadline}</strong>
                <p id="passport-review-completion-reason">{completionReason}</p>
                {isEditableReviewStatus ? (
                  <button
                    aria-label="Перейти к следующему незавершённому шагу"
                    className="v19-review-next-step"
                    onClick={handleNextReviewStep}
                    type="button"
                  >
                    Следующий шаг
                    <ArrowRight aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div
                aria-label="Состояние проверки"
                className="v19-review-status-strip"
                role="status"
              >
                <span>
                  Поля{" "}
                  <strong>
                    {filledFieldCount}/{ADMIN_PASSPORT_REVIEW_FIELD_IDS.length}
                  </strong>
                </span>
                <span className={openPassportIssueCount ? "has-warning" : undefined}>
                  Замечания{" "}
                  <strong>{openPassportIssueCount + fixedPassportIssueCount}</strong>
                </span>
                <span
                  aria-label={`Оригиналы: ${mediaStatusLabel}`}
                  className={
                    unavailableMediaCount > 0
                      ? "has-warning"
                      : loadingMediaCount > 0
                        ? "is-loading"
                        : pendingMediaReviewCount > 0
                          ? "is-pending"
                          : undefined
                  }
                >
                  Оригиналы{" "}
                  <strong>
                    {readyMediaCount}/{confirmationMediaTypes.length}
                  </strong>
                </span>
              </div>
            </section>

            {correctedIssuesAwaitingClosure.length > 0 ? (
              <section
                aria-label="Исправления к закрытию"
                className="v19-review-corrected-issues"
              >
                <header>
                  <div>
                    <span>Решение администратора</span>
                    <h2>Исправления к закрытию</h2>
                  </div>
                  <strong>{correctedIssuesAwaitingClosure.length}</strong>
                </header>
                <p>
                  Сверьте исправленные значения. Команда «Закрыть исправления и принять»
                  закроет перечисленные замечания и передаст пакет на выгрузку.
                </p>
                <div className="v19-review-corrected-issue-list">
                  {correctedIssuesAwaitingClosure.map((issue) => {
                    const fieldLabel = submission
                      ? questionnaireIssueFieldDisplayLabel(submission, issue)
                      : issue.target.field;
                    const target = [
                      issue.target.applicantName,
                      issue.target.section,
                      fieldLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <article key={issue.id}>
                        <div>
                          <strong>{issue.reason}</strong>
                          {target ? <span>{target}</span> : null}
                        </div>
                        <p>{issue.comment}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <header className="v19-review-section-heading is-controls-only">
              <div
                aria-busy={sectionApprovalPending}
                aria-live="polite"
                className={`v19-review-section-controls${sectionApprovalPending ? " is-pending" : ""}${sectionAlreadyAccepted ? " is-complete" : ""}${acceptanceError ? " is-error" : ""}${canConfirmSection ? " is-ready" : ""}`}
              >
                <strong
                  aria-label={`Заполнено ${filledFieldCount} из ${ADMIN_PASSPORT_REVIEW_FIELD_IDS.length} паспортных полей`}
                >
                  {filledFieldCount}/{ADMIN_PASSPORT_REVIEW_FIELD_IDS.length}
                </strong>
                {isEditableReviewStatus ? (
                  <button
                    aria-label={sectionActionAccessibleLabel(
                      sectionAlreadyAccepted,
                      sectionApprovalPending,
                      canConfirmSection,
                      completedSectionActionLabel,
                    )}
                    aria-busy={sectionApprovalPending}
                    aria-describedby="passport-review-completion-reason"
                    id="passport-review-confirm-button"
                    onClick={() => void handleConfirmSection()}
                    title={!canConfirmSection ? completionReason : undefined}
                    type="button"
                  >
                    <CheckCircle2 aria-hidden="true" />
                    {sectionActionLabel(
                      sectionAlreadyAccepted,
                      sectionApprovalPending,
                      canConfirmSection,
                    )}
                  </button>
                ) : (
                  <span className="v19-review-read-only-badge">Только просмотр</span>
                )}
              </div>
            </header>

            <div className="v19-review-field-grid">
              {reviewFields.map((field) => (
                <ReviewPassportFieldRow
                  applicant={selectedApplicant}
                  field={field}
                  key={field.id}
                  readOnly={!isEditableReviewStatus}
                  onAddRemark={onAddRemark}
                />
              ))}
            </div>

            {acceptanceError ? (
              <p className="v19-review-inline-error" role="alert">
                {acceptanceError}
              </p>
            ) : null}
          </div>

          <footer
            aria-busy={Boolean(reviewActionPending)}
            aria-live="polite"
            className={`v19-review-decision${reviewActionPending ? " is-pending" : ""}${reviewActionError ? " is-error" : ""}`}
            ref={decisionFooterRef}
            tabIndex={-1}
          >
            <div className="v19-review-decision-context">
              <div className="v19-review-decision-title">
                <strong>Решение по подаче</strong>
                <span>{reviewDecisionIssueLabel}</span>
              </div>
              {applicantReviewStates.length > 1 ? (
                <div
                  aria-label="Готовность паспортных секций заявителей"
                  className="v19-review-applicant-progress"
                  role="group"
                >
                  {applicantReviewStates.map((state) => (
                    <button
                      aria-label={`Открыть проверку: ${state.name}`}
                      className={
                        state.id === selectedApplicantId ? "is-active" : undefined
                      }
                      key={state.id}
                      onClick={() => onApplicantChange?.(state.id)}
                      type="button"
                    >
                      {state.completed ? (
                        <CheckCircle2 aria-hidden="true" />
                      ) : (
                        <UserRound aria-hidden="true" />
                      )}
                      <span>{state.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <p id="admin-review-decision-reason">{reviewDecisionReason}</p>
            </div>

            {isEditableReviewStatus ? (
              <div className="v19-review-decision-actions">
                <button
                  aria-busy={Boolean(reviewActionPending)}
                  aria-describedby="admin-review-decision-reason"
                  className="v19-review-return"
                  disabled={Boolean(
                    !returnDecision ||
                    returnDecision.disabled ||
                    !onReviewAction ||
                    reviewActionPending,
                  )}
                  onClick={() => void handleReviewDecision(returnDecision)}
                  title={returnDecision?.reason ?? reviewDecisionReason}
                  type="button"
                >
                  <MessageSquarePlus aria-hidden="true" />
                  {reviewActionLabel(
                    returnDecision,
                    reviewActionPending,
                    "На исправление",
                    "Возвращаем…",
                  )}
                </button>
                <button
                  aria-busy={Boolean(reviewActionPending)}
                  aria-describedby="admin-review-decision-reason"
                  className="v19-review-accept"
                  disabled={Boolean(
                    !acceptDecision ||
                    acceptDecision.disabled ||
                    !onReviewAction ||
                    reviewActionPending,
                  )}
                  onClick={() => void handleReviewDecision(acceptDecision)}
                  title={acceptDecision?.reason ?? reviewDecisionReason}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" />
                  {reviewActionLabel(
                    acceptDecision,
                    reviewActionPending,
                    "Принять",
                    "Принимаем…",
                  )}
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
