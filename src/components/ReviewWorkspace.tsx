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
import { AnimatePresence, motion } from "motion/react";
import "../shared/ui/review-workspace.css";
import {
  ArrowLeft,
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
  type PassportReviewMediaType,
} from "../modules/submissions/passportReviewContract";
import { buildPassportReviewInsights } from "../modules/submissions/passportReviewInsights";
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
import { ReviewQuestionnairePeek } from "./review/ReviewQuestionnairePeek";
import { ReviewReadinessPanel } from "./review/ReviewReadinessPanel";
import { useReviewWorkspaceShortcuts } from "./review/useReviewWorkspaceShortcuts";

interface ReviewWorkspaceProps {
  applicantId?: string;
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

const unavailablePreview: ReviewMediaPreviewState = { status: "unavailable" };

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
    target.type === "passport_scan" ? "Паспорт не загружен" : `${target.label} не загружен`;

  return (
    file?.originalFileName ?? file?.generatedFileName ?? missingFileLabel
  );
}

function sectionActionLabel(accepted: boolean, pending: boolean) {
  if (accepted) return "Секция подтверждена";
  if (pending) return "Сохраняем…";
  return "Подтвердить паспортную секцию";
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
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const mediaTabRefs = useRef<
    Partial<Record<ReviewMediaType, HTMLButtonElement | null>>
  >({});
  const mediaPanelId = useId();
  const onBackRef = useRef(onBack);
  const mountedRef = useRef(true);
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
        ? requiredPassportReviewMediaTypesForApplicant(
            submission,
            selectedApplicantId,
          )
        : (["passport_scan"] as const),
    [selectedApplicantId, submission],
  );
  const [activeMediaType, setActiveMediaType] =
    useState<ReviewMediaType>("passport_scan");
  const [visitedMediaTypes, setVisitedMediaTypes] = useState<Set<ReviewMediaType>>(
    () => new Set<ReviewMediaType>(["passport_scan"]),
  );
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [mediaPreviews, setMediaPreviews] = useState<PreviewStateMap>({});
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [sectionApprovalPending, setSectionApprovalPending] = useState(false);
  const [sectionApprovedLocally, setSectionApprovedLocally] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState("");
  const [reviewActionPending, setReviewActionPending] =
    useState<SubmissionAction | null>(null);
  const [reviewActionError, setReviewActionError] = useState("");

  const activeMediaTarget =
    mediaTargets.find((target) => target.type === activeMediaType) ?? mediaTargets[0];
  const activeMediaFile = submission?.files.find(
    (file) =>
      file.applicantId === selectedApplicantId && file.type === activeMediaTarget.type,
  );
  const activePreview = mediaPreviews[activeMediaTarget.type] ?? unavailablePreview;
  const activePreviewUrl =
    activePreview.status === "ready" ? activePreview.url : undefined;
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
  const approvedApplicantCount = applicantReviewStates.filter(
    (state) => state.completed,
  ).length;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    setActiveMediaType("passport_scan");
    setVisitedMediaTypes(new Set<ReviewMediaType>(["passport_scan"]));
    setQuestionnaireOpen(false);
    setZoom(100);
    setRotation(0);
    setSectionApprovedLocally(false);
    setAcceptanceError("");
    setReviewActionError("");
  }, [selectedApplicantId, submissionId]);

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
    let cancelled = false;
    const protectedMedia = mediaTargets.map((target) => {
      const file = submission?.files.find(
        (candidate) =>
          candidate.applicantId === selectedApplicantId &&
          candidate.type === target.type,
      );
      const protectedFile =
        file &&
        selectedApplicantId &&
        isPersistablePrivateFileAssetAtSubmissionTarget(file, {
          applicantId: selectedApplicantId,
          fileType: target.type,
          submissionId,
        })
          ? file
          : undefined;
      return { protectedFile, target };
    });

    setMediaPreviews(
      Object.fromEntries(
        protectedMedia.map(({ protectedFile, target }) => [
          target.type,
          { status: protectedFile ? "loading" : "unavailable" },
        ]),
      ) as PreviewStateMap,
    );

    const loadProtectedMedia = async () => {
      const loaded = await Promise.all(
        protectedMedia.map(async ({ protectedFile, target }) => {
          if (!protectedFile) {
            return [target.type, unavailablePreview] as const;
          }
          try {
            const url = await createMediaSignedUrl({
              bucket: mediaStorageBucket,
              path: protectedFile.storagePath,
            });
            return [
              target.type,
              url
                ? ({ status: "ready", url } satisfies ReviewMediaPreviewState)
                : unavailablePreview,
            ] as const;
          } catch {
            return [target.type, unavailablePreview] as const;
          }
        }),
      );
      if (!cancelled) {
        setMediaPreviews(Object.fromEntries(loaded) as PreviewStateMap);
      }
    };

    void loadProtectedMedia();
    return () => {
      cancelled = true;
    };
  }, [mediaTargets, selectedApplicantId, submission, submissionId]);

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
  const allProtectedMediaReady = requiredMediaTypes.every(
    (type) => mediaPreviews[type]?.status === "ready",
  );
  const requiredMediaVisitedCount = requiredMediaTypes.filter((type) =>
    visitedMediaTypes.has(type),
  ).length;
  const allRequiredMediaVisited =
    requiredMediaVisitedCount === requiredMediaTypes.length;
  const requiredMediaFiles = requiredMediaTypes.map((type) =>
    submission?.files.find(
      (file) => file.applicantId === selectedApplicantId && file.type === type,
    ),
  );
  const sectionAlreadyAccepted =
    sectionApprovedLocally ||
    (reviewFields.every((field) => field.alreadyApproved) &&
      requiredMediaFiles.every((file) => file?.status === "accepted") &&
      !hasFixedPassportIssue);
  const canConfirmSection = Boolean(
    selectedApplicantId &&
    submission &&
    hasUnambiguousPrimaryApplicant &&
    onApproveSection &&
    allFieldsFilled &&
    allProtectedMediaReady &&
    allRequiredMediaVisited &&
    !hasOpenPassportIssue &&
    !sectionAlreadyAccepted &&
    !sectionApprovalPending,
  );
  const filledFieldCount = reviewFields.filter(
    (field) => hasAdminPassportReviewValue(field.value) && !field.hasError,
  ).length;
  const unavailableMediaCount = requiredMediaTypes.filter(
    (type) => mediaPreviews[type]?.status !== "ready",
  ).length;
  const readyMediaCount = requiredMediaTypes.length - unavailableMediaCount;
  const requiredMediaLabel = requiredMediaTypes.includes("selfie")
    ? "паспорт и оба селфи"
    : "паспорт";
  let completionReason =
    `Сверьте все ${ADMIN_PASSPORT_REVIEW_FIELD_IDS.length} паспортных полей и ${requiredMediaLabel}. ` +
    "Анкета не участвует в решении.";
  if (!selectedApplicantId) {
    completionReason = "Не выбран заявитель. Подтверждение недоступно.";
  } else if (!hasUnambiguousPrimaryApplicant) {
    completionReason =
      "У подачи должен быть ровно один основной заявитель. Подтверждение недоступно.";
  } else if (!allFieldsFilled) {
    completionReason =
      "Заполнены не все паспортные поля или в данных есть ошибка.";
  } else if (!allProtectedMediaReady) {
    completionReason = requiredMediaTypes.includes("selfie")
      ? "Для подтверждения нужны защищённые оригиналы паспорта и двух селфи."
      : "Для подтверждения нужен защищённый оригинал паспорта.";
  } else if (!allRequiredMediaVisited) {
    completionReason = requiredMediaTypes.includes("selfie")
      ? "Откройте паспорт, селфи 1 и селфи 2 хотя бы один раз."
      : "Откройте паспорт хотя бы один раз.";
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

  const passportReviewInsights = buildPassportReviewInsights({
    fields: reviewFields.map((field) => ({
      hasError: field.hasError,
      id: field.id,
      value: field.value,
    })),
    media: requiredMediaTypes.map((type) => ({
      ready: mediaPreviews[type]?.status === "ready",
      type,
      visited: visitedMediaTypes.has(type),
    })),
    openIssueCount: openPassportIssueCount,
  });

  const returnDecision = adminReviewActions?.returnForCorrection;
  const acceptDecision = adminReviewActions?.acceptForExport;
  let reviewDecisionReason = "Проверка готова к решению.";
  if (!onReviewAction) {
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
    if (!canConfirmSection || !selectedApplicantId || !onApproveSection) return;
    setAcceptanceError("");
    setSectionApprovalPending(true);
    try {
      const approved = await onApproveSection({ applicantId: selectedApplicantId });
      if (approved === false) throw new Error("Approval rejected");
      setSectionApprovedLocally(true);
    } catch {
      setAcceptanceError(
        "Не удалось подтвердить паспортную секцию. Повторите попытку.",
      );
    } finally {
      setSectionApprovalPending(false);
    }
  };

  const handleReviewDecision = async (decision?: ActionDecision) => {
    if (!decision || decision.disabled || reviewActionPending || !onReviewAction) {
      return;
    }

    setReviewActionError("");
    setReviewActionPending(decision.action);
    try {
      const persisted = await onReviewAction(decision.action);
      if (persisted === false) throw new Error("Review action rejected");
    } catch {
      if (mountedRef.current) {
        setReviewActionError(
          decision.action === "accept" || decision.action === "close_issues_accept"
            ? "Не удалось принять подачу. Состояние не изменено."
            : "Не удалось вернуть подачу. Состояние не изменено.",
        );
      }
    } finally {
      if (mountedRef.current) setReviewActionPending(null);
    }
  };

  const handlePreviewError = (mediaType: ReviewMediaType) => {
    setMediaPreviews((current) => ({
      ...current,
      [mediaType]: unavailablePreview,
    }));
  };

  const handleFullscreen = () => {
    void previewPaneRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const handleMediaSelect = useCallback((mediaType: ReviewMediaType) => {
    setActiveMediaType(mediaType);
    setVisitedMediaTypes((current) => {
      if (current.has(mediaType)) return current;
      const next = new Set(current);
      next.add(mediaType);
      return next;
    });
    setZoom(100);
    setRotation(0);
  }, []);

  const handleToggleQuestionnaire = useCallback(() => {
    setQuestionnaireOpen((current) => !current);
  }, []);

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

  const handleNextReviewStep = useCallback(() => {
    const nextMediaType = requiredMediaTypes.find(
      (type) =>
        mediaPreviews[type]?.status !== "ready" || !visitedMediaTypes.has(type),
    );
    if (nextMediaType) {
      handleMediaSelect(nextMediaType);
      mediaTabRefs.current[nextMediaType]?.focus({ preventScroll: true });
      return;
    }

    const nextField = reviewFields.find(
      (field) =>
        !field.sectionId ||
        !hasAdminPassportReviewValue(field.value) ||
        field.hasError,
    );
    if (nextField) {
      const fieldElement = workspaceRef.current?.querySelector<HTMLElement>(
        `[data-passport-field-id="${nextField.id}"]`,
      );
      fieldElement?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      fieldElement
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
      return;
    }

    workspaceRef.current
      ?.querySelector<HTMLButtonElement>("#passport-review-confirm-button")
      ?.focus({ preventScroll: true });
  }, [
    handleMediaSelect,
    mediaPreviews,
    requiredMediaTypes,
    reviewFields,
    visitedMediaTypes,
  ]);

  const shortcutMediaTypes = useMemo(
    () => mediaTargets.map((target) => target.type),
    [mediaTargets],
  );
  useReviewWorkspaceShortcuts({
    disabled: nestedDialogOpen,
    mediaTypes: shortcutMediaTypes,
    onMedia: handleMediaSelect,
    onToggleQuestionnaire: handleToggleQuestionnaire,
  });

  const activeMediaTabId = `${mediaPanelId}-${activeMediaTarget.type}`;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-hidden={nestedDialogOpen ? "true" : undefined}
      aria-label="Сверка паспорта"
      aria-modal="true"
      className="v19-review-workspace"
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
        </button>
        <div className="v19-review-heading">
          <span>{selectedApplicant?.fullName ?? "Проверка документов"}</span>
          <div>
            <h1 aria-label={`Сверка паспорта · ${submissionId}`}>Сверка паспорта</h1>
            <code title={submissionId}>{submissionId}</code>
          </div>
        </div>
        <a
          aria-disabled={!activePreviewUrl}
          className={`v19-review-download${activePreviewUrl ? "" : " is-disabled"}`}
          download={
            activeMediaFile
              ? reviewFileName(activeMediaTarget, activeMediaFile)
              : undefined
          }
          href={activePreviewUrl}
          tabIndex={activePreviewUrl ? undefined : -1}
        >
          <Download aria-hidden="true" />
          <span>Скачать</span>
        </a>
      </header>

      <main className="v19-review-main">
        <section aria-label="Оригиналы документов" className="v19-review-media-pane">
          <div className="v19-review-media-toolbar">
            <div className="v19-review-filebar">
              {activeMediaTarget.type === "passport_scan" ? (
                <FileText aria-hidden="true" />
              ) : (
                <UserRound aria-hidden="true" />
              )}
              <span>{reviewFileName(activeMediaTarget, activeMediaFile)}</span>
              <div className="v19-review-media-controls">
                <button
                  aria-label="Уменьшить изображение"
                  disabled={!activePreviewUrl || zoom <= 60}
                  onClick={() => setZoom((value) => Math.max(60, value - 10))}
                  type="button"
                >
                  <ZoomOut aria-hidden="true" />
                </button>
                <output aria-label="Масштаб изображения">{zoom}%</output>
                <button
                  aria-label="Увеличить изображение"
                  disabled={!activePreviewUrl || zoom >= 180}
                  onClick={() => setZoom((value) => Math.min(180, value + 10))}
                  type="button"
                >
                  <ZoomIn aria-hidden="true" />
                </button>
                <button
                  aria-label="Повернуть изображение"
                  disabled={!activePreviewUrl}
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
                />
              </div>
            ) : (
              <ReviewMediaPreview
                alt={activeMediaTarget.alt}
                file={activeMediaFile}
                label={activeMediaTarget.shortLabel}
                preview={activePreview}
                testId={`protected-media-preview-${activeMediaTarget.type}`}
                transform={activeMediaTransform}
                variant="single"
                onError={() => handlePreviewError(activeMediaTarget.type)}
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
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      />
                    ) : null}
                    <span className="v19-review-media-tab-label">
                      {target.shortLabel}
                    </span>
                    {visitedMediaTypes.has(target.type) ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="v19-review-media-tab-visited"
                      />
                    ) : null}
                    <kbd aria-hidden="true">{index + 1}</kbd>
                  </button>
                ))}
              </div>
              <button
                aria-label={`Добавить замечание: ${activeMediaTarget.label}`}
                className="v19-review-file-remark"
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
            </div>
          </div>
        </section>

        <section className="v19-review-details-pane">
          {submission && submission.applicants.length > 1 ? (
            <header className="v19-review-details-header is-applicant-only">
              <label className="v19-review-applicant-select">
                <span>Заявитель</span>
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
            <ReviewReadinessPanel
              filledFieldCount={filledFieldCount}
              mediaReadyCount={readyMediaCount}
              mediaTotal={requiredMediaTypes.length}
              mediaVisitedCount={requiredMediaVisitedCount}
              model={passportReviewInsights}
              onNextStep={handleNextReviewStep}
              onToggleQuestionnaire={handleToggleQuestionnaire}
              openIssueCount={openPassportIssueCount}
              questionnaireOpen={questionnaireOpen}
              totalFieldCount={ADMIN_PASSPORT_REVIEW_FIELD_IDS.length}
            />

            <AnimatePresence initial={false}>
              {questionnaireOpen ? (
                <ReviewQuestionnairePeek
                  applicant={selectedApplicant}
                  onClose={() => setQuestionnaireOpen(false)}
                />
              ) : null}
            </AnimatePresence>

            <header className="v19-review-section-heading">
              <div>
                <span>Источник решения</span>
                <h2>Все поля паспорта</h2>
              </div>
              <strong>
                {filledFieldCount}/{ADMIN_PASSPORT_REVIEW_FIELD_IDS.length}
              </strong>
            </header>

            <div className="v19-review-field-grid">
              {reviewFields.map((field) => (
                <ReviewPassportFieldRow
                  applicant={selectedApplicant}
                  field={field}
                  key={field.id}
                  onAddRemark={onAddRemark}
                />
              ))}
            </div>

            <section aria-live="polite" className="v19-review-confirmation">
              <div>
                <strong>Паспортная секция</strong>
                <p id="passport-review-completion-reason">{completionReason}</p>
              </div>
              <button
                aria-describedby="passport-review-completion-reason"
                disabled={!canConfirmSection}
                id="passport-review-confirm-button"
                onClick={() => void handleConfirmSection()}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" />
                {sectionActionLabel(sectionAlreadyAccepted, sectionApprovalPending)}
              </button>
              {acceptanceError ? (
                <p className="v19-review-inline-error" role="alert">
                  {acceptanceError}
                </p>
              ) : null}
            </section>
          </div>

          <footer className="v19-review-decision">
            <div className="v19-review-decision-context">
              <div className="v19-review-decision-title">
                <strong>Решение</strong>
                <span>
                  {approvedApplicantCount}/{applicantReviewStates.length} секций
                </span>
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

            <div className="v19-review-decision-actions">
              <button
                aria-describedby="admin-review-decision-reason"
                className="v19-review-return"
                disabled={Boolean(
                  !returnDecision ||
                  returnDecision.disabled ||
                  !onReviewAction ||
                  reviewActionPending,
                )}
                onClick={() => void handleReviewDecision(returnDecision)}
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
                aria-describedby="admin-review-decision-reason"
                className="v19-review-accept"
                disabled={Boolean(
                  !acceptDecision ||
                  acceptDecision.disabled ||
                  !onReviewAction ||
                  reviewActionPending,
                )}
                onClick={() => void handleReviewDecision(acceptDecision)}
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

            {reviewActionError ? (
              <p className="v19-review-decision-error" role="alert">
                {reviewActionError}
              </p>
            ) : null}
          </footer>
        </section>
      </main>
    </motion.div>
  );
}
