import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  MessageSquarePlus,
  UserRound,
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
  submissionId: string;
  submission?: Submission | null;
  onBack: () => void;
  nestedDialogOpen?: boolean;
  onApproveSection?: (input: { applicantId: string }) => boolean | Promise<boolean>;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
}

type ReviewMediaType = "passport_scan" | "selfie" | "selfie_2";

type ReviewField = {
  alreadyApproved: boolean;
  hasError: boolean;
  id: string;
  label: string;
  sectionId: string;
  sourceLabel: string;
  value: string;
};

type ReviewMediaTarget = {
  alt: string;
  label: string;
  type: ReviewMediaType;
};

type PreviewState = {
  status: "loading" | "ready" | "unavailable";
  url?: string;
};

type PreviewStateMap = Partial<Record<ReviewMediaType, PreviewState>>;

const passportFieldLabels: Record<
  AdminPassportReviewFieldId,
  { displayLabel?: string; fallbackLabel: string }
> = {
  surname: { fallbackLabel: "Фамилия" },
  "first-name": { fallbackLabel: "Имя" },
  "birth-date": { fallbackLabel: "Дата рождения" },
  "birth-place": { fallbackLabel: "Место рождения" },
  "passport-no": { fallbackLabel: "Номер паспорта" },
  "passport-issue-place": {
    displayLabel: "Кем / где выдан",
    fallbackLabel: "Место выдачи",
  },
  "passport-issue-date": { fallbackLabel: "Дата выдачи" },
  "passport-expiry-date": { fallbackLabel: "Действителен до" },
};

const passportFieldDefinitions = ADMIN_PASSPORT_REVIEW_FIELD_IDS.map((id) => ({
  id,
  ...passportFieldLabels[id],
}));

const passportMediaTarget: ReviewMediaTarget = {
  alt: "Оригинал загранпаспорта",
  label: "Скан загранпаспорта",
  type: "passport_scan",
};

const selfieMediaTargets: readonly ReviewMediaTarget[] = [
  { alt: "Первое селфи заявителя", label: "Селфи 1", type: "selfie" },
  { alt: "Второе селфи заявителя", label: "Селфи 2", type: "selfie_2" },
];

const passportOnlyMediaTargets: readonly ReviewMediaTarget[] = [passportMediaTarget];
const primaryApplicantMediaTargets: readonly ReviewMediaTarget[] = [
  passportMediaTarget,
  ...selfieMediaTargets,
];
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

  return passportFieldDefinitions.map((definition) => {
    const fieldEntry = fieldsById.get(definition.id);
    const field = fieldEntry?.field;
    const sourceLabel = field?.label ?? definition.fallbackLabel;

    return {
      alreadyApproved: Boolean(
        field?.adminReviewApprovedAtIso && field.adminReviewApprovedBy,
      ),
      hasError: Boolean(field?.error),
      id: definition.id,
      label: definition.displayLabel ?? sourceLabel,
      sectionId: fieldEntry?.sectionId ?? "",
      sourceLabel,
      value: field?.value ?? "",
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

function ProtectedMediaCard({
  applicantName,
  canRemark = true,
  file,
  preview,
  target,
  onPreviewError,
  onRemark,
}: {
  applicantName?: string;
  canRemark?: boolean;
  file?: SubmissionFile;
  preview: PreviewState;
  target: ReviewMediaTarget;
  onPreviewError: (fileType: ReviewMediaType) => void;
  onRemark: (fileType: ReviewMediaType, label: string) => void;
}) {
  const readyUrl = preview.status === "ready" ? preview.url : undefined;
  const isPassport = target.type === "passport_scan";

  return (
    <article
      aria-label={`${target.label}: ${applicantName ?? "заявитель"}`}
      className="v19-admin-passport-media-card overflow-hidden rounded-2xl border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-panel)]"
      data-review-media={target.type}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--v19b-color-border-strong)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-white/70">
          {isPassport ? (
            <FileText className="w-4 shrink-0" />
          ) : (
            <UserRound className="w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[length:var(--v19b-size-13)] font-semibold text-white">
              {target.label}
            </p>
            <p className="mt-0.5 truncate text-[length:var(--v19b-size-11)] text-white/45">
              {reviewFileName(target, file)}
            </p>
          </div>
        </div>
        {canRemark ? (
          <button
            aria-label={`Добавить замечание: ${target.label}`}
            className="admin-review-remark-action flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--v19b-color-primary-soft-20)] bg-[var(--v19b-color-primary-soft-10)] px-3 text-[length:var(--v19b-size-12)] font-medium text-[var(--v19b-color-primary-text)] transition-colors hover:bg-[var(--v19b-color-primary-soft-20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)]"
            onClick={() => onRemark(target.type, target.label)}
            type="button"
          >
            <MessageSquarePlus className="w-4" />
            Замечание
          </button>
        ) : (
          <span className="text-[length:var(--v19b-size-11)] text-white/45">
            Только просмотр
          </span>
        )}
      </header>

      {preview.status === "loading" ? (
        <div className="grid min-h-64 place-items-center p-5 text-center">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Загружаем защищённый оригинал
            </h2>
            <p className="mt-2 text-[length:var(--v19b-size-12)] text-white/55">
              Получаем временный доступ к файлу подачи.
            </p>
          </div>
        </div>
      ) : readyUrl ? (
        <figure className="bg-[var(--v19b-color-app)]">
          {isPdfFile(file) ? (
            <object
              aria-label={target.alt}
              className={isPassport ? "h-96 w-full" : "h-64 w-full"}
              data={readyUrl}
              type="application/pdf"
            >
              <a
                className="text-[var(--v19b-color-primary-text)] underline"
                href={readyUrl}
                rel="noreferrer"
                target="_blank"
              >
                Открыть защищённый оригинал
              </a>
            </object>
          ) : needsExternalViewer(file) ? (
            <div className="grid min-h-64 place-items-center p-5 text-center">
              <div>
                <p className="text-sm font-semibold text-white">
                  Оригинал готов к просмотру
                </p>
                <p className="mt-2 text-[length:var(--v19b-size-12)] text-white/55">
                  Формат открывается во внешнем просмотрщике.
                </p>
                <a
                  className="mt-4 inline-flex h-10 items-center rounded-xl border border-[var(--v19b-color-primary-soft-20)] bg-[var(--v19b-color-primary-soft-10)] px-4 text-[length:var(--v19b-size-12)] font-medium text-[var(--v19b-color-primary-text)]"
                  href={readyUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Открыть оригинал
                </a>
              </div>
            </div>
          ) : (
            <img
              alt={target.alt}
              className={
                isPassport
                  ? "block max-h-96 w-full object-contain"
                  : "block h-64 w-full object-cover"
              }
              data-testid={`protected-media-preview-${target.type}`}
              onError={() => onPreviewError(target.type)}
              src={readyUrl}
            />
          )}
          <figcaption className="border-t border-[var(--v19b-color-border-strong)] px-3 py-2 text-[length:var(--v19b-size-11)] text-white/50">
            Оригинал из защищённого хранилища. Доступ действует ограниченное время.
          </figcaption>
        </figure>
      ) : (
        <div className="grid min-h-64 place-items-center bg-[var(--v19b-admin-drawer-orange-bg)] p-5 text-center">
          <div>
            <AlertCircle className="mx-auto mb-3 w-6 text-[var(--vf-warning)]" />
            <h2 className="text-sm font-semibold text-white">
              {file ? "Защищённый оригинал недоступен" : "Файл не загружен"}
            </h2>
            <p className="mt-2 text-[length:var(--v19b-size-12)] leading-relaxed text-white/60">
              Подтверждение секции заблокировано. Добавьте точное замечание к этому
              файлу.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

export function ReviewWorkspace({
  applicantId,
  submissionId,
  submission,
  onBack,
  nestedDialogOpen = false,
  onApproveSection,
  onAddRemark,
}: ReviewWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const initialFocusAppliedRef = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const selectedApplicant = applicantId
    ? submission?.applicants.find((applicant) => applicant.id === applicantId)
    : submission?.applicants.length === 1
      ? submission.applicants[0]
      : undefined;
  const selectedApplicantId = selectedApplicant?.id;
  const hasUnambiguousPrimaryApplicant = Boolean(
    submission && hasUnambiguousPrimaryApplicantForPassportReview(submission),
  );
  const showSelfies = Boolean(
    submission &&
      selectedApplicantId &&
      requiredPassportReviewMediaTypesForApplicant(
        submission,
        selectedApplicantId,
      ).includes("selfie"),
  );
  const requiredMediaTargets = showSelfies
    ? primaryApplicantMediaTargets
    : passportOnlyMediaTargets;
  const mediaTargets = useMemo(
    () =>
      submission && selectedApplicantId
        ? passportReviewMediaTypesVisibleForApplicant(
            submission,
            selectedApplicantId,
          ).map((fileType) =>
            fileType === "passport_scan"
              ? passportMediaTarget
              : selfieMediaTargets.find((target) => target.type === fileType)!,
          )
        : requiredMediaTargets,
    [requiredMediaTargets, selectedApplicantId, submission],
  );
  const visibleSelfieTargets = mediaTargets.filter(
    (target) => target.type !== "passport_scan",
  );
  const hasLegacyCorrectionMedia =
    mediaTargets.length > requiredMediaTargets.length;
  const reviewFields = reviewFieldsForApplicant(selectedApplicant);
  const mediaEntries = mediaTargets.map((target) => ({
    file: submission?.files.find(
      (file) => file.applicantId === selectedApplicantId && file.type === target.type,
    ),
    target,
  }));
  const requiredMediaEntries = requiredMediaTargets.map((target) => ({
    file: submission?.files.find(
      (file) => file.applicantId === selectedApplicantId && file.type === target.type,
    ),
    target,
  }));
  const passportIssueInScope = (issue: Submission["issues"][number]) => {
    if (!selectedApplicantId) return false;
    return isAdminPassportReviewIssueInScope(issue, {
      applicantId: selectedApplicantId,
      fields: reviewFields.map((field) => ({
        id: field.id,
        label: field.sourceLabel,
      })),
      mediaTypes: mediaTargets.map((target) => target.type),
    });
  };
  const hasOpenPassportIssue = Boolean(
    submission?.issues.some(
      (issue) => issue.status === "open" && passportIssueInScope(issue),
    ),
  );
  const hasFixedPassportIssue = Boolean(
    submission?.issues.some(
      (issue) => issue.status === "fixed_by_agent" && passportIssueInScope(issue),
    ),
  );
  const [mediaPreviews, setMediaPreviews] = useState<PreviewStateMap>({});
  const [sectionApprovalPending, setSectionApprovalPending] = useState(false);
  const [sectionApprovedLocally, setSectionApprovedLocally] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState("");

  useEffect(() => {
    setSectionApprovedLocally(false);
    setAcceptanceError("");
  }, [selectedApplicantId, submissionId]);

  useEffect(() => {
    if (nestedDialogOpen) return;
    const focusFrame = initialFocusAppliedRef.current
      ? undefined
      : window.requestAnimationFrame(() => {
          initialFocusAppliedRef.current = true;
          workspaceRef.current
            ?.querySelector<HTMLButtonElement>('button:not([disabled])')
            ?.focus({ preventScroll: true });
        });

    function handleWorkspaceKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onBackRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        workspaceRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), object, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) {
        event.preventDefault();
        workspaceRef.current?.focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      } else if (!workspaceRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleWorkspaceKeyDown);
    return () => {
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleWorkspaceKeyDown);
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
    const initialPreviews: PreviewStateMap = {};
    for (const item of protectedMedia) {
      initialPreviews[item.target.type] = {
        status: item.protectedFile ? "loading" : "unavailable",
      };
    }
    setMediaPreviews(initialPreviews);

    const loadProtectedMedia = async () => {
      const loadedMedia = await Promise.all(
        protectedMedia.map(async (item) => {
          if (!item.protectedFile) {
            return { state: unavailablePreview, type: item.target.type };
          }

          try {
            const signedUrl = await createMediaSignedUrl({
              bucket: mediaStorageBucket,
              path: item.protectedFile.storagePath,
            });
            return {
              state: signedUrl
                ? { status: "ready" as const, url: signedUrl }
                : unavailablePreview,
              type: item.target.type,
            };
          } catch {
            return { state: unavailablePreview, type: item.target.type };
          }
        }),
      );

      if (cancelled) return;
      const nextPreviews: PreviewStateMap = {};
      for (const item of loadedMedia) nextPreviews[item.type] = item.state;
      setMediaPreviews(nextPreviews);
    };

    void loadProtectedMedia();

    return () => {
      cancelled = true;
    };
  }, [mediaTargets, selectedApplicantId, submission, submissionId]);

  const allFieldsFilled =
    reviewFields.length === passportFieldDefinitions.length &&
    reviewFields.every(
      (field) =>
        Boolean(field.sectionId) &&
        hasAdminPassportReviewValue(field.value) &&
        !field.hasError,
    );
  const allProtectedMediaReady = mediaTargets.every(
    (target) => mediaPreviews[target.type]?.status === "ready",
  );
  const allFieldsApproved = reviewFields.every((field) => field.alreadyApproved);
  const allMediaAccepted = requiredMediaEntries.every(
    ({ file }) => file?.status === "accepted",
  );
  const sectionAlreadyAccepted =
    sectionApprovedLocally ||
    (allFieldsApproved && allMediaAccepted && !hasFixedPassportIssue);
  const canConfirmSection = Boolean(
    selectedApplicantId &&
    hasUnambiguousPrimaryApplicant &&
    onApproveSection &&
    allFieldsFilled &&
    allProtectedMediaReady &&
    !hasOpenPassportIssue &&
    !sectionAlreadyAccepted &&
    !sectionApprovalPending,
  );

  let completionReason =
    "Сверьте значения со сканом и добавьте замечание к каждому расхождению.";
  if (!selectedApplicantId) {
    completionReason = "Не выбран заявитель. Подтверждение недоступно.";
  } else if (!hasUnambiguousPrimaryApplicant) {
    completionReason =
      "У подачи должен быть ровно один основной заявитель. Подтверждение недоступно.";
  } else if (!allFieldsFilled) {
    completionReason =
      "Заполнены не все паспортные поля или в данных есть ошибка. Добавьте точное замечание.";
  } else if (!allProtectedMediaReady) {
    completionReason = hasLegacyCorrectionMedia
      ? "Нужны защищённые оригиналы паспорта и файлов по активным замечаниям. Подтверждение недоступно."
      : showSelfies
        ? "Нужны защищённые оригиналы паспорта и двух селфи. Подтверждение недоступно."
        : "Нужен защищённый оригинал паспорта. Подтверждение недоступно.";
  } else if (hasOpenPassportIssue) {
    completionReason =
      "Есть открытое замечание паспортной секции. Сначала агент должен отправить исправление.";
  } else if (!onApproveSection) {
    completionReason =
      "Сохранение результата не подключено. Состояние подачи не изменится.";
  } else if (sectionAlreadyAccepted) {
    completionReason = "Паспортная секция уже подтверждена.";
  } else if (sectionApprovalPending) {
    completionReason = "Сохраняем подтверждение паспортной секции.";
  }

  function handlePreviewError(fileType: ReviewMediaType) {
    setMediaPreviews((current) => ({
      ...current,
      [fileType]: unavailablePreview,
    }));
  }

  function handleMediaRemark(fileType: ReviewMediaType, label: string) {
    onAddRemark(
      `${label}: требуется проверка`,
      selectedApplicant?.fullName,
      fileType,
      selectedApplicantId,
    );
  }

  async function handleConfirmSection() {
    if (!canConfirmSection || !selectedApplicantId || !onApproveSection) return;

    setAcceptanceError("");
    setSectionApprovalPending(true);
    try {
      const approved = await onApproveSection({ applicantId: selectedApplicantId });
      if (approved === false) {
        setAcceptanceError(
          "Не удалось подтвердить паспортную секцию. Повторите попытку.",
        );
        return;
      }
      setSectionApprovedLocally(true);
    } catch {
      setAcceptanceError(
        "Не удалось подтвердить паспортную секцию. Повторите попытку.",
      );
    } finally {
      setSectionApprovalPending(false);
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-label="Сверка паспорта"
      aria-modal="true"
      aria-hidden={nestedDialogOpen ? "true" : undefined}
      className="v19-admin-passport-workspace fixed inset-0 z-[var(--v19b-z-modal)] flex flex-col overflow-hidden bg-[var(--v19b-color-app)] text-white"
      exit={{ opacity: 0, scale: 0.985 }}
      initial={{ opacity: 0, scale: 0.985 }}
      ref={workspaceRef}
      role="dialog"
      inert={nestedDialogOpen ? true : undefined}
      tabIndex={-1}
    >
      <header className="v19-admin-passport-header flex h-[var(--v19b-size-64)] shrink-0 items-center gap-4 border-b border-[var(--v19b-color-border)] bg-[var(--v19b-color-page)] px-4 backdrop-blur-md lg:px-6">
        <button
          aria-label="Вернуться к подаче"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-control)] text-white/70 transition-colors hover:bg-[var(--v19b-color-control-hover)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[length:var(--v19b-size-11)] font-medium uppercase tracking-wider text-white/62">
            Проверка документов
          </p>
          <h1 className="mt-1 truncate text-[length:var(--v19b-size-19)] font-semibold leading-none tracking-tight lg:text-[length:var(--v19b-size-21)]">
            Паспортная секция · {submissionId}
          </h1>
        </div>
      </header>

      <main className="v19-admin-passport-main grid min-h-0 flex-1 grid-cols-1 overflow-auto xl:overflow-hidden">
        <section className="v19-admin-passport-document-pane min-h-[var(--v19b-size-320)] border-b border-[var(--v19b-color-border)] bg-[var(--v19b-color-app)] p-5 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r lg:p-8">
          <div className="mb-4">
            <p className="text-[length:var(--v19b-size-11)] font-medium uppercase tracking-wider text-white/62">
              Защищённые оригиналы
            </p>
            <h2 className="mt-2 text-[length:var(--v19b-size-20)] font-semibold tracking-tight text-white">
              {selectedApplicant?.fullName ?? "Заявитель не выбран"}
            </h2>
            <p className="mt-2 text-[length:var(--v19b-size-13)] leading-relaxed text-white/50">
              {showSelfies
                ? "Скан загранпаспорта и оба селфи открыты в одной секции."
                : hasLegacyCorrectionMedia
                  ? "Для этого члена семьи обязателен только паспорт. Дополнительно показано селфи по активному замечанию."
                  : "Для этого члена семьи проверяется только скан загранпаспорта."}
            </p>
          </div>

          <ProtectedMediaCard
            applicantName={selectedApplicant?.fullName}
            file={
              mediaEntries.find((item) => item.target.type === "passport_scan")?.file
            }
            preview={mediaPreviews.passport_scan ?? unavailablePreview}
            target={passportMediaTarget}
            onPreviewError={handlePreviewError}
            onRemark={handleMediaRemark}
          />

          {visibleSelfieTargets.length ? (
            <section className="mt-4" aria-labelledby="selfie-review-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  className="text-[length:var(--v19b-size-14)] font-semibold text-white"
                  id="selfie-review-heading"
                >
                  {showSelfies ? "Оба селфи" : "Селфи по замечанию"}
                </h3>
                <span className="text-[length:var(--v19b-size-11)] text-white/45">
                  {showSelfies ? "Только single / основной" : "Legacy correction"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleSelfieTargets.map((target) => (
                  <ProtectedMediaCard
                    applicantName={selectedApplicant?.fullName}
                    canRemark={requiredMediaTargets.some(
                      (requiredTarget) => requiredTarget.type === target.type,
                    )}
                    file={
                      mediaEntries.find((item) => item.target.type === target.type)
                        ?.file
                    }
                    key={target.type}
                    preview={mediaPreviews[target.type] ?? unavailablePreview}
                    target={target}
                    onPreviewError={handlePreviewError}
                    onRemark={handleMediaRemark}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <section className="v19-admin-passport-form-pane min-w-0 bg-[var(--v19b-color-page)] p-5 xl:overflow-y-auto lg:p-6">
          <div>
            <p className="text-[length:var(--v19b-size-11)] font-medium uppercase tracking-wider text-white/62">
              Данные анкеты
            </p>
            <h2 className="mt-2 text-[length:var(--v19b-size-24)] font-semibold tracking-tight text-white lg:text-[length:var(--v19b-size-30)]">
              Сверка со сканом
            </h2>
            <p className="mt-2 max-w-2xl text-[length:var(--v19b-size-13)] leading-relaxed text-white/50">
              На экране только значения, которые можно проверить по загранпаспорту.
            </p>
          </div>

          <div className="v19-admin-passport-fields mt-6 space-y-3">
            {reviewFields.map((field) => (
              <article
                className="v19-admin-passport-field flex flex-col justify-between gap-4 rounded-2xl border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-panel)] p-4 sm:flex-row sm:items-center"
                data-passport-field-id={field.id}
                key={field.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--v19b-size-11)] font-medium uppercase tracking-wider text-white/40">
                    {field.label}
                  </p>
                  <p className="mt-1 break-words text-[length:var(--v19b-size-15)] font-semibold text-white">
                    {hasAdminPassportReviewValue(field.value)
                      ? field.value
                      : "Не заполнено"}
                  </p>
                  <p
                    className={
                      hasAdminPassportReviewValue(field.value) && !field.hasError
                        ? "mt-1 text-[length:var(--v19b-size-11)] text-white/45"
                        : "mt-1 text-[length:var(--v19b-size-11)] text-[var(--vf-warning)]"
                    }
                  >
                    {hasAdminPassportReviewValue(field.value) && !field.hasError
                      ? "Сверьте значение с оригиналом"
                      : "Значение отсутствует или содержит ошибку — требуется замечание"}
                  </p>
                </div>
                <button
                  aria-label={`Добавить замечание: ${field.label}`}
                  className="v19-admin-passport-field-remark admin-review-remark-action flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--v19b-color-primary-soft-20)] bg-[var(--v19b-color-primary-soft-10)] px-3 text-[length:var(--v19b-size-12)] font-medium text-[var(--v19b-color-primary-text)] transition-colors hover:bg-[var(--v19b-color-primary-soft-20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)]"
                  onClick={() =>
                    onAddRemark(
                      field.sourceLabel,
                      selectedApplicant?.fullName,
                      undefined,
                      selectedApplicantId,
                    )
                  }
                  type="button"
                >
                  <MessageSquarePlus className="w-4" />
                  Замечание
                </button>
              </article>
            ))}
          </div>

          <section
            aria-live="polite"
            className="v19-admin-passport-completion mt-6 rounded-2xl border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-panel)] p-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 w-5 shrink-0 text-[var(--v19b-color-primary-text)]" />
              <div>
                <p className="text-[length:var(--v19b-size-13)] font-semibold text-white">
                  Итог всей секции
                </p>
                <p
                  className="mt-1 text-[length:var(--v19b-size-12)] leading-relaxed text-white/55"
                  id="passport-review-completion-reason"
                >
                  {completionReason}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                aria-describedby="passport-review-completion-reason"
                aria-label="Подтвердить паспортную секцию"
                className="v19-admin-passport-complete"
                disabled={!canConfirmSection}
                onClick={() => void handleConfirmSection()}
                type="button"
              >
                {sectionAlreadyAccepted
                  ? "Секция подтверждена"
                  : sectionApprovalPending
                    ? "Сохраняем…"
                    : "Подтвердить всю секцию"}
              </button>
              {acceptanceError ? (
                <span
                  className="text-[length:var(--v19b-size-12)] text-[var(--v19b-status-danger-text)]"
                  role="alert"
                >
                  {acceptanceError}
                </span>
              ) : null}
            </div>
          </section>
        </section>
      </main>
    </motion.div>
  );
}
