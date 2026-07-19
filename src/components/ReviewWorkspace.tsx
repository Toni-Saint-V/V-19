import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Maximize2,
  MessageSquarePlus,
  RotateCw,
  ShieldCheck,
  UserRound,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  createMediaSignedUrl,
  mediaStorageBucket,
} from "../modules/submissions/mediaStorage";
import { isPersistablePrivateFileAssetAtSubmissionTarget } from "../modules/submissions/fileAsset";
import {
  ADMIN_PASSPORT_REVIEW_FIELD_IDS,
  hasAdminPassportReviewValue,
  hasUnambiguousPrimaryApplicantForPassportReview,
  isAdminPassportReviewIssueInScope,
  passportReviewMediaTypesVisibleForApplicant,
  requiredPassportReviewMediaTypesForApplicant,
  type AdminPassportReviewFieldId,
} from "../modules/submissions/passportReviewContract";
import type {
  Applicant,
  Submission,
  SubmissionFile,
  SubmissionFileType,
} from "../modules/submissions/types";

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
  onApproveSection?: (input: {
    applicantId: string;
  }) => boolean | Promise<boolean>;
  onBack: () => void;
  submission?: Submission | null;
  submissionId: string;
}

type ReviewMediaType = "passport_scan" | "selfie" | "selfie_2";

type ReviewMediaTarget = {
  alt: string;
  label: string;
  shortLabel: string;
  type: ReviewMediaType;
};

type ReviewField = {
  alreadyApproved: boolean;
  hasError: boolean;
  id: AdminPassportReviewFieldId;
  label: string;
  sectionId: string;
  sourceLabel: string;
  value: string;
};

type PreviewState = {
  status: "loading" | "ready" | "unavailable";
  url?: string;
};

type PreviewStateMap = Partial<Record<ReviewMediaType, PreviewState>>;

const passportFieldLabels: Record<AdminPassportReviewFieldId, string> = {
  "first-name": "Имя",
  surname: "Фамилия",
  "passport-no": "Номер паспорта",
  "birth-date": "Дата рождения",
  "passport-issue-place": "Кем / где выдан",
  "passport-expiry-date": "Срок действия",
  "birth-place": "Город рождения",
  "birth-country": "Страна рождения",
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

const unavailablePreview: PreviewState = { status: "unavailable" };

function reviewFieldsForApplicant(applicant?: Applicant): ReviewField[] {
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
    const sourceLabel = entry?.field.label ?? passportFieldLabels[id];
    return {
      alreadyApproved: Boolean(
        entry?.field.adminReviewApprovedAtIso &&
          entry.field.adminReviewApprovedBy,
      ),
      hasError: Boolean(entry?.field.error),
      id,
      label: passportFieldLabels[id],
      sectionId: entry?.sectionId ?? "",
      sourceLabel,
      value: entry?.field.value ?? "",
    };
  });
}

function reviewFileName(target: ReviewMediaTarget, file?: SubmissionFile) {
  return (
    file?.originalFileName ?? file?.generatedFileName ?? `${target.label} не загружен`
  );
}

function isPdfFile(file?: SubmissionFile) {
  const fileName = file?.originalFileName ?? file?.generatedFileName ?? "";
  return (
    file?.mimeType === "application/pdf" ||
    fileName.toLocaleLowerCase().endsWith(".pdf")
  );
}

function needsExternalViewer(file?: SubmissionFile) {
  const fileName = file?.originalFileName ?? file?.generatedFileName ?? "";
  const normalizedName = fileName.toLocaleLowerCase();
  return (
    file?.mimeType === "image/heic" ||
    file?.mimeType === "image/heif" ||
    normalizedName.endsWith(".heic") ||
    normalizedName.endsWith(".heif")
  );
}

function FieldReviewRow({
  applicant,
  field,
  onAddRemark,
}: {
  applicant?: Applicant;
  field: ReviewField;
  onAddRemark: ReviewWorkspaceProps["onAddRemark"];
}) {
  const valid = hasAdminPassportReviewValue(field.value) && !field.hasError;
  const statusLabel = field.alreadyApproved
    ? "Подтверждено"
    : valid
      ? "Проверить"
      : "Нужно замечание";
  const statusClassName = field.alreadyApproved
    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
    : valid
      ? "bg-[#3a45b4]/10 border-[#3a45b4]/20 text-[#8fa3ff]"
      : "bg-orange-500/10 border-orange-500/20 text-orange-400";

  return (
    <article
      className={`p-4 rounded-2xl border transition-colors ${valid ? "bg-[#161617] border-[#242529] hover:border-[#2e2f34]" : "bg-orange-500/5 border-orange-500/30"}`}
      data-passport-field-id={field.id}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[11px] text-white/40 uppercase tracking-wider font-medium">
              {field.label}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${statusClassName}`}
            >
              {field.alreadyApproved ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {statusLabel}
            </span>
          </div>
          <div className="text-[15px] font-semibold text-white break-words">
            {hasAdminPassportReviewValue(field.value) ? field.value : "Не заполнено"}
          </div>
          <div
            className={`text-[11px] mt-1 ${valid ? "text-white/35" : "text-orange-300/75"}`}
          >
            {valid
              ? "Сверьте значение с оригиналом паспорта"
              : "Поле отсутствует или содержит ошибку"}
          </div>
        </div>
        <button
          aria-label={`Добавить замечание: ${field.label}`}
          className="v19-admin-passport-field-remark h-10 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/20 text-orange-400 text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          onClick={() =>
            onAddRemark(
              field.sourceLabel,
              applicant?.fullName,
              undefined,
              applicant?.id,
            )
          }
          type="button"
        >
          <MessageSquarePlus className="w-4 h-4" />
          Замечание
        </button>
      </div>
    </article>
  );
}

export function ReviewWorkspace({
  applicantId,
  nestedDialogOpen = false,
  onAddRemark,
  onApplicantChange,
  onApproveSection,
  onBack,
  submission,
  submissionId,
}: ReviewWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const onBackRef = useRef(onBack);
  const wasNestedDialogOpenRef = useRef(nestedDialogOpen);
  onBackRef.current = onBack;

  const selectedApplicant = applicantId
    ? submission?.applicants.find((applicant) => applicant.id === applicantId)
    : submission?.applicants[0];
  const selectedApplicantId = selectedApplicant?.id;
  const reviewFields = reviewFieldsForApplicant(selectedApplicant);
  const mediaTargets = useMemo(() => {
    if (!submission || !selectedApplicantId) {
      return [mediaTargetsByType.passport_scan];
    }
    return passportReviewMediaTypesVisibleForApplicant(
      submission,
      selectedApplicantId,
    ).map((type) => mediaTargetsByType[type]);
  }, [selectedApplicantId, submission]);
  const requiredMediaTypes =
    submission && selectedApplicantId
      ? requiredPassportReviewMediaTypesForApplicant(
          submission,
          selectedApplicantId,
        )
      : (["passport_scan"] as const);
  const [activeMediaType, setActiveMediaType] =
    useState<ReviewMediaType>("passport_scan");
  const [mediaPreviews, setMediaPreviews] = useState<PreviewStateMap>({});
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [sectionApprovalPending, setSectionApprovalPending] = useState(false);
  const [sectionApprovedLocally, setSectionApprovedLocally] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState("");

  const activeMediaTarget =
    mediaTargets.find((target) => target.type === activeMediaType) ??
    mediaTargets[0];
  const activeMediaFile = submission?.files.find(
    (file) =>
      file.applicantId === selectedApplicantId &&
      file.type === activeMediaTarget.type,
  );
  const activePreview =
    mediaPreviews[activeMediaTarget.type] ?? unavailablePreview;
  const activePreviewUrl =
    activePreview.status === "ready" ? activePreview.url : undefined;

  useEffect(() => {
    if (mediaTargets.some((target) => target.type === activeMediaType)) return;
    setActiveMediaType(mediaTargets[0]?.type ?? "passport_scan");
  }, [activeMediaType, mediaTargets]);

  useEffect(() => {
    setZoom(100);
    setRotation(0);
    setSectionApprovedLocally(false);
    setAcceptanceError("");
  }, [selectedApplicantId, submissionId]);

  useEffect(() => {
    const wasNestedDialogOpen = wasNestedDialogOpenRef.current;
    wasNestedDialogOpenRef.current = nestedDialogOpen;
    if (nestedDialogOpen) return;
    const frame = wasNestedDialogOpen
      ? undefined
      : window.requestAnimationFrame(() => {
          workspaceRef.current
            ?.querySelector<HTMLButtonElement>('button:not([disabled])')
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
                ? ({ status: "ready", url } satisfies PreviewState)
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
  const hasOpenPassportIssue = Boolean(
    submission?.issues.some(
      (issue) => issue.status === "open" && passportIssueInScope(issue),
    ),
  );
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

  let completionReason =
    "Сверьте все восемь полей с паспортом и подтвердите секцию.";
  if (!selectedApplicantId) {
    completionReason = "Не выбран заявитель. Подтверждение недоступно.";
  } else if (!hasUnambiguousPrimaryApplicant) {
    completionReason =
      "У подачи должен быть ровно один основной заявитель. Подтверждение недоступно.";
  } else if (!allFieldsFilled) {
    completionReason =
      "Заполнены не все восемь паспортных полей или в данных есть ошибка.";
  } else if (!allProtectedMediaReady) {
    completionReason = requiredMediaTypes.includes("selfie")
      ? "Для подтверждения нужны защищённые оригиналы паспорта и двух селфи."
      : "Для подтверждения нужен защищённый оригинал паспорта.";
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

  const handlePreviewError = () => {
    setMediaPreviews((current) => ({
      ...current,
      [activeMediaTarget.type]: unavailablePreview,
    }));
  };

  const handleFullscreen = () => {
    void previewPaneRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-hidden={nestedDialogOpen ? "true" : undefined}
      aria-label="Сверка паспорта"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-[#101011] text-white flex flex-col overflow-hidden"
      exit={{ opacity: 0, scale: 0.985 }}
      inert={nestedDialogOpen ? true : undefined}
      initial={false}
      ref={workspaceRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="h-[64px] shrink-0 border-b border-[#202124] bg-[#141416]/95 backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
        <button
          aria-label="Вернуться к очереди"
          className="w-10 h-10 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] flex items-center justify-center text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] text-orange-400 uppercase tracking-wider font-medium">
            Проверка документов
          </div>
          <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight leading-none mt-1 truncate">
            Сверка паспорта · {submissionId}
          </h1>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2">
          <a
            aria-disabled={!activePreviewUrl}
            className={`h-10 px-4 rounded-xl border border-[#242529] text-[13px] font-medium flex items-center gap-2 transition-colors ${activePreviewUrl ? "bg-[#1e1e21] hover:bg-[#27272b] text-white/80" : "bg-[#1e1e21] text-white/30 pointer-events-none"}`}
            download={activeMediaFile ? reviewFileName(activeMediaTarget, activeMediaFile) : undefined}
            href={activePreviewUrl}
          >
            <Download className="w-4 h-4" />
            Скачать оригинал
          </a>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(420px,1fr)_minmax(480px,0.9fr)] overflow-y-auto xl:overflow-hidden">
        <section className="min-h-[420px] xl:min-h-0 bg-[#0e0e10] border-b xl:border-b-0 xl:border-r border-[#202124] flex flex-col">
          <div className="shrink-0 border-b border-[#202124] bg-[#141416] px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <div
                aria-label="Выбор файла для проверки"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl border border-[#242529] bg-[#101011] p-1"
                role="tablist"
              >
                {mediaTargets.map((target) => (
                  <button
                    aria-selected={activeMediaTarget.type === target.type}
                    className={`h-9 shrink-0 rounded-lg px-3 text-[12px] font-medium transition-colors ${activeMediaTarget.type === target.type ? "bg-[#27272b] text-white border border-[#2e2f34]" : "text-white/55 hover:text-white hover:bg-white/5 border border-transparent"}`}
                    key={target.type}
                    data-review-media={target.type}
                    onClick={() => {
                      setActiveMediaType(target.type);
                      setZoom(100);
                      setRotation(0);
                    }}
                    role="tab"
                    type="button"
                  >
                    {target.shortLabel}
                  </button>
                ))}
              </div>
              <button
                aria-label={`Добавить замечание: ${activeMediaTarget.label}`}
                className="h-9 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/20 text-orange-400 text-[12px] font-medium flex items-center gap-1.5 transition-colors"
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
                <MessageSquarePlus className="w-4 h-4" />
                Замечание
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {activeMediaTarget.type === "passport_scan" ? (
                <FileText className="w-4 h-4 shrink-0 text-white/40" />
              ) : (
                <UserRound className="w-4 h-4 shrink-0 text-white/40" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">
                {reviewFileName(activeMediaTarget, activeMediaFile)}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  aria-label="Уменьшить изображение"
                  className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/55 hover:text-white transition-colors"
                  onClick={() => setZoom((value) => Math.max(60, value - 10))}
                  type="button"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="h-9 px-2 rounded-lg bg-white/5 border border-white/5 flex items-center text-[12px] font-mono text-white/60 min-w-[54px] justify-center">
                  {zoom}%
                </div>
                <button
                  aria-label="Увеличить изображение"
                  className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/55 hover:text-white transition-colors"
                  onClick={() => setZoom((value) => Math.min(180, value + 10))}
                  type="button"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  aria-label="Повернуть изображение"
                  className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/55 hover:text-white transition-colors"
                  onClick={() => setRotation((value) => (value + 90) % 360)}
                  type="button"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  aria-label="Открыть на весь экран"
                  className="hidden sm:flex w-9 h-9 rounded-lg hover:bg-white/5 items-center justify-center text-white/55 hover:text-white transition-colors"
                  onClick={handleFullscreen}
                  type="button"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div
            className="flex-1 min-h-[320px] p-5 lg:p-8 overflow-auto scrollbar-thin scrollbar-thumb-white/10 flex items-center justify-center"
            ref={previewPaneRef}
          >
            {activePreview.status === "loading" ? (
              <div className="max-w-sm text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-[#8fa3ff]" />
                <h2 className="mt-4 text-[15px] font-semibold">
                  Загружаем защищённый оригинал
                </h2>
                <p className="mt-2 text-[12px] text-white/50">
                  Получаем временный доступ к файлу подачи.
                </p>
              </div>
            ) : activePreviewUrl ? (
              <div
                className="flex h-full min-h-[280px] w-full items-center justify-center"
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                  transition: "transform 160ms ease",
                }}
              >
                {isPdfFile(activeMediaFile) ? (
                  <object
                    aria-label={activeMediaTarget.alt}
                    className="h-[min(70vh,720px)] w-full max-w-[760px] rounded-2xl bg-white"
                    data={activePreviewUrl}
                    type="application/pdf"
                  >
                    <a href={activePreviewUrl} rel="noreferrer" target="_blank">
                      Открыть защищённый оригинал
                    </a>
                  </object>
                ) : needsExternalViewer(activeMediaFile) ? (
                  <div className="max-w-sm rounded-2xl border border-[#242529] bg-[#161617] p-6 text-center">
                    <p className="text-sm font-semibold">Оригинал готов</p>
                    <p className="mt-2 text-[12px] text-white/50">
                      Этот формат открывается во внешнем просмотрщике.
                    </p>
                    <a
                      className="mt-4 inline-flex h-10 items-center rounded-xl border border-[#242529] bg-[#1e1e21] px-4 text-[12px] font-medium"
                      href={activePreviewUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Открыть оригинал
                    </a>
                  </div>
                ) : (
                  <img
                    alt={activeMediaTarget.alt}
                    className="block max-h-[min(70vh,720px)] max-w-full rounded-2xl object-contain shadow-[0_32px_120px_rgba(0,0,0,0.5)]"
                    data-testid={`protected-media-preview-${activeMediaTarget.type}`}
                    onError={handlePreviewError}
                    src={activePreviewUrl}
                  />
                )}
              </div>
            ) : (
              <div className="max-w-sm rounded-2xl border border-orange-500/25 bg-orange-500/5 p-6 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-orange-400" />
                <h2 className="mt-4 text-[15px] font-semibold">
                  {activeMediaFile
                    ? "Защищённый оригинал недоступен"
                    : `${activeMediaTarget.label} не загружен`}
                </h2>
                <p className="mt-2 text-[12px] leading-5 text-white/50">
                  Подтверждение заблокировано. Добавьте замечание к этому файлу.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 flex flex-col bg-[#141416] xl:overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-[#202124] shrink-0">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[11px] font-medium uppercase tracking-wide mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Только паспорт
                </div>
                <h2 className="text-[24px] lg:text-[30px] font-semibold tracking-tight text-white leading-tight">
                  Проверка паспортных полей
                </h2>
                <p className="text-[13px] text-white/50 leading-relaxed mt-2 max-w-2xl">
                  Сверьте восемь значений с оригиналом. Другие поля анкеты здесь не показываются.
                </p>
              </div>
              {submission && submission.applicants.length > 1 ? (
                <label className="grid gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
                  Заявитель
                  <select
                    aria-label="Заявитель для проверки"
                    className="h-10 min-w-[220px] rounded-xl border border-[#242529] bg-[#1e1e21] px-3 text-[13px] normal-case tracking-normal text-white"
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
              ) : null}
            </div>
          </div>

          <div className="flex-1 xl:overflow-y-auto p-5 lg:p-6 scrollbar-thin scrollbar-thumb-white/10">
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="p-4 rounded-2xl bg-[#161617] border border-[#242529]">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mb-3" />
                <div className="text-2xl font-semibold text-white">
                  {filledFieldCount}/8
                </div>
                <div className="text-[11px] text-white/40 mt-1">заполнено</div>
              </div>
              <div className="p-4 rounded-2xl bg-[#161617] border border-orange-500/25">
                <AlertCircle className="w-5 h-5 text-orange-400 mb-3" />
                <div className="text-2xl font-semibold text-white">
                  {submission?.issues.filter(
                    (issue) => issue.status === "open" && passportIssueInScope(issue),
                  ).length ?? 0}
                </div>
                <div className="text-[11px] text-white/40 mt-1">замечаний</div>
              </div>
              <div className="p-4 rounded-2xl bg-[#161617] border border-[#242529]">
                <ShieldCheck className="w-5 h-5 text-[#8fa3ff] mb-3" />
                <div className="text-2xl font-semibold text-white">
                  {unavailableMediaCount}
                </div>
                <div className="text-[11px] text-white/40 mt-1">файлов недоступно</div>
              </div>
            </div>

            <div className="space-y-3">
              {reviewFields.map((field) => (
                <FieldReviewRow
                  applicant={selectedApplicant}
                  field={field}
                  key={field.id}
                  onAddRemark={onAddRemark}
                />
              ))}
            </div>

            <section
              aria-live="polite"
              className="mt-5 rounded-2xl border border-[#242529] bg-[#161617] p-4"
            >
              <p className="text-[13px] font-semibold text-white">Итог проверки</p>
              <p
                className="mt-1 text-[12px] leading-5 text-white/50"
                id="passport-review-completion-reason"
              >
                {completionReason}
              </p>
              <button
                aria-describedby="passport-review-completion-reason"
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:border disabled:border-[#242529] disabled:bg-[#1e1e21] disabled:text-white/35"
                disabled={!canConfirmSection}
                onClick={() => void handleConfirmSection()}
                type="button"
              >
                <CheckCircle2 className="w-4 h-4" />
                {sectionAlreadyAccepted
                  ? "Секция подтверждена"
                  : sectionApprovalPending
                    ? "Сохраняем…"
                    : "Подтвердить паспортную секцию"}
              </button>
              {acceptanceError ? (
                <p className="mt-2 text-[12px] text-red-300" role="alert">
                  {acceptanceError}
                </p>
              ) : null}
            </section>
          </div>
        </section>
      </main>
    </motion.div>
  );
}
