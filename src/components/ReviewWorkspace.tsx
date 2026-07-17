import { useEffect, useState } from "react";
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
  onAcceptFile?: (input: {
    applicantId: string;
    fileType: SubmissionFileType;
  }) => boolean | Promise<boolean>;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
}

type ReviewMediaType = "passport_scan" | "selfie" | "selfie_2";

type ReviewField = {
  id: string;
  label: string;
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

const passportFieldDefinitions = [
  { id: "surname", fallbackLabel: "Фамилия" },
  { id: "first-name", fallbackLabel: "Имя" },
  { id: "birth-date", fallbackLabel: "Дата рождения" },
  { id: "birth-place", fallbackLabel: "Место рождения" },
  { id: "passport-no", fallbackLabel: "Номер паспорта" },
  {
    id: "passport-issue-place",
    fallbackLabel: "Место выдачи",
    displayLabel: "Кем / где выдан",
  },
  { id: "passport-issue-date", fallbackLabel: "Дата выдачи" },
  { id: "passport-expiry-date", fallbackLabel: "Действителен до" },
] as const;

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

function hasReviewValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return Boolean(normalized) && normalized !== "—" && normalized !== "не заполнено";
}

function reviewFieldsForApplicant(applicant?: Applicant): ReviewField[] {
  if (!applicant) return [];

  const fieldsById = new Map(
    applicant.sections
      .flatMap((section) => section.fields)
      .map((field) => [field.id, field] as const),
  );

  return passportFieldDefinitions.map((definition) => {
    const field = fieldsById.get(definition.id);
    const sourceLabel = field?.label ?? definition.fallbackLabel;

    return {
      id: definition.id,
      label: "displayLabel" in definition ? definition.displayLabel : sourceLabel,
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
  file,
  preview,
  target,
  onPreviewError,
  onRemark,
}: {
  applicantName?: string;
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
      className="v19-admin-passport-media-card overflow-hidden rounded-2xl border border-[#242529] bg-[#161617]"
      data-review-media={target.type}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#242529] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-white/70">
          {isPassport ? (
            <FileText className="w-4 shrink-0" />
          ) : (
            <UserRound className="w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">
              {target.label}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/45">
              {reviewFileName(target, file)}
            </p>
          </div>
        </div>
        <button
          aria-label={`Добавить замечание: ${target.label}`}
          className="admin-review-remark-action flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] transition-colors hover:bg-[#6f64ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
          onClick={() => onRemark(target.type, target.label)}
          type="button"
        >
          <MessageSquarePlus className="w-4" />
          Замечание
        </button>
      </header>

      {preview.status === "loading" ? (
        <div className="grid min-h-64 place-items-center p-5 text-center">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Загружаем защищённый оригинал
            </h2>
            <p className="mt-2 text-[12px] text-white/55">
              Получаем временный доступ к файлу подачи.
            </p>
          </div>
        </div>
      ) : readyUrl ? (
        <figure className="bg-[#0e0e10]">
          {isPdfFile(file) ? (
            <object
              aria-label={target.alt}
              className={isPassport ? "h-96 w-full" : "h-64 w-full"}
              data={readyUrl}
              type="application/pdf"
            >
              <a
                className="text-[#b8baff] underline"
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
                <p className="mt-2 text-[12px] text-white/55">
                  Формат открывается во внешнем просмотрщике.
                </p>
                <a
                  className="mt-4 inline-flex h-10 items-center rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-4 text-[12px] font-medium text-[#b8baff]"
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
          <figcaption className="border-t border-[#242529] px-3 py-2 text-[11px] text-white/50">
            Оригинал из защищённого хранилища. Доступ действует ограниченное время.
          </figcaption>
        </figure>
      ) : (
        <div className="grid min-h-64 place-items-center bg-[#221d13] p-5 text-center">
          <div>
            <AlertCircle className="mx-auto mb-3 w-6 text-[#f6c66b]" />
            <h2 className="text-sm font-semibold text-white">
              {file ? "Защищённый оригинал недоступен" : "Файл не загружен"}
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-white/60">
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
  onAcceptFile,
  onAddRemark,
}: ReviewWorkspaceProps) {
  const selectedApplicant = applicantId
    ? submission?.applicants.find((applicant) => applicant.id === applicantId)
    : submission?.applicants.length === 1
      ? submission.applicants[0]
      : undefined;
  const selectedApplicantId = selectedApplicant?.id;
  const primaryApplicant =
    submission?.applicants.find((applicant) => applicant.role === "main") ??
    submission?.applicants[0];
  const showSelfies = Boolean(
    selectedApplicant &&
    (submission?.type === "single" || selectedApplicant.id === primaryApplicant?.id),
  );
  const mediaTargets = showSelfies
    ? primaryApplicantMediaTargets
    : passportOnlyMediaTargets;
  const reviewFields = reviewFieldsForApplicant(selectedApplicant);
  const mediaEntries = mediaTargets.map((target) => ({
    file: submission?.files.find(
      (file) => file.applicantId === selectedApplicantId && file.type === target.type,
    ),
    target,
  }));
  const [mediaPreviews, setMediaPreviews] = useState<PreviewStateMap>({});
  const [pendingFileType, setPendingFileType] = useState<ReviewMediaType>();
  const [acceptedFileTypes, setAcceptedFileTypes] = useState<Set<ReviewMediaType>>(
    () => new Set(),
  );
  const [acceptanceError, setAcceptanceError] = useState("");

  useEffect(() => {
    setAcceptedFileTypes(new Set());
    setAcceptanceError("");
  }, [selectedApplicantId, submissionId]);

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
    reviewFields.every((field) => hasReviewValue(field.value));
  const allProtectedMediaReady = mediaTargets.every(
    (target) => mediaPreviews[target.type]?.status === "ready",
  );
  const sectionAlreadyAccepted = mediaEntries.every(
    ({ file, target }) =>
      file?.status === "accepted" || acceptedFileTypes.has(target.type),
  );
  const canConfirmSection = Boolean(
    selectedApplicantId &&
    onAcceptFile &&
    allFieldsFilled &&
    allProtectedMediaReady &&
    !sectionAlreadyAccepted &&
    !pendingFileType,
  );

  let completionReason =
    "Сверьте значения со сканом и добавьте замечание к каждому расхождению.";
  if (!selectedApplicantId) {
    completionReason = "Не выбран заявитель. Подтверждение недоступно.";
  } else if (!allFieldsFilled) {
    completionReason =
      "Заполнены не все паспортные поля. Добавьте замечание к отсутствующему значению.";
  } else if (!allProtectedMediaReady) {
    completionReason = showSelfies
      ? "Нужны защищённые оригиналы паспорта и двух селфи. Подтверждение недоступно."
      : "Нужен защищённый оригинал паспорта. Подтверждение недоступно.";
  } else if (!onAcceptFile) {
    completionReason =
      "Сохранение результата не подключено. Состояние подачи не изменится.";
  } else if (sectionAlreadyAccepted) {
    completionReason = "Паспортная секция уже подтверждена.";
  } else if (pendingFileType) {
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
    const acceptFile = onAcceptFile;
    if (!canConfirmSection || !selectedApplicantId || !acceptFile) return;

    setAcceptanceError("");
    const acceptedInThisRun = new Set(acceptedFileTypes);

    for (const { file, target } of mediaEntries) {
      if (file?.status === "accepted" || acceptedInThisRun.has(target.type)) continue;

      setPendingFileType(target.type);
      try {
        const accepted = await acceptFile({
          applicantId: selectedApplicantId,
          fileType: target.type,
        });
        if (accepted === false) {
          setAcceptanceError(
            `Не удалось подтвердить «${target.label}». Повторите попытку.`,
          );
          setPendingFileType(undefined);
          return;
        }
      } catch {
        setAcceptanceError(
          `Не удалось подтвердить «${target.label}». Повторите попытку.`,
        );
        setPendingFileType(undefined);
        return;
      }

      acceptedInThisRun.add(target.type);
      setAcceptedFileTypes(new Set(acceptedInThisRun));
    }

    setPendingFileType(undefined);
  }

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-label="Сверка паспорта"
      aria-modal="true"
      className="v19-admin-passport-workspace fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#101011] text-white"
      exit={{ opacity: 0, scale: 0.985 }}
      initial={{ opacity: 0, scale: 0.985 }}
      role="dialog"
    >
      <header className="v19-admin-passport-header flex h-[64px] shrink-0 items-center gap-4 border-b border-[#202124] bg-[#141416]/95 px-4 backdrop-blur-md lg:px-6">
        <button
          aria-label="Вернуться к подаче"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#242529] bg-[#1e1e21] text-white/70 transition-colors hover:bg-[#27272b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/62">
            Проверка документов
          </p>
          <h1 className="mt-1 truncate text-[19px] font-semibold leading-none tracking-tight lg:text-[21px]">
            Паспортная секция · {submissionId}
          </h1>
        </div>
      </header>

      <main className="v19-admin-passport-main grid min-h-0 flex-1 grid-cols-1 overflow-auto xl:grid-cols-[minmax(420px,1fr)_minmax(480px,0.9fr)] xl:overflow-hidden">
        <section className="v19-admin-passport-document-pane min-h-[320px] border-b border-[#202124] bg-[#0e0e10] p-5 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r lg:p-8">
          <div className="mb-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/62">
              Защищённые оригиналы
            </p>
            <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
              {selectedApplicant?.fullName ?? "Заявитель не выбран"}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/50">
              {showSelfies
                ? "Скан загранпаспорта и оба селфи открыты в одной секции."
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

          {showSelfies ? (
            <section className="mt-4" aria-labelledby="selfie-review-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  className="text-[14px] font-semibold text-white"
                  id="selfie-review-heading"
                >
                  Оба селфи
                </h3>
                <span className="text-[11px] text-white/45">
                  Только single / основной
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {selfieMediaTargets.map((target) => (
                  <ProtectedMediaCard
                    applicantName={selectedApplicant?.fullName}
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

        <section className="v19-admin-passport-form-pane min-w-0 bg-[#141416] p-5 xl:overflow-y-auto lg:p-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/62">
              Данные анкеты
            </p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-white lg:text-[30px]">
              Сверка со сканом
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/50">
              На экране только значения, которые можно проверить по загранпаспорту.
            </p>
          </div>

          <div className="v19-admin-passport-fields mt-6 space-y-3">
            {reviewFields.map((field) => (
              <article
                className="v19-admin-passport-field flex flex-col justify-between gap-4 rounded-2xl border border-[#242529] bg-[#161617] p-4 sm:flex-row sm:items-center"
                data-passport-field-id={field.id}
                key={field.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                    {field.label}
                  </p>
                  <p className="mt-1 break-words text-[15px] font-semibold text-white">
                    {hasReviewValue(field.value) ? field.value : "Не заполнено"}
                  </p>
                  <p
                    className={
                      hasReviewValue(field.value)
                        ? "mt-1 text-[11px] text-white/45"
                        : "mt-1 text-[11px] text-[var(--vf-warning)]"
                    }
                  >
                    {hasReviewValue(field.value)
                      ? "Сверьте значение с оригиналом"
                      : "Значение отсутствует — требуется замечание"}
                  </p>
                </div>
                <button
                  aria-label={`Добавить замечание: ${field.label}`}
                  className="v19-admin-passport-field-remark admin-review-remark-action flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] transition-colors hover:bg-[#6f64ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
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
            className="v19-admin-passport-completion mt-6 rounded-2xl border border-[#242529] bg-[#161617] p-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 w-5 shrink-0 text-[#b8baff]" />
              <div>
                <p className="text-[13px] font-semibold text-white">Итог всей секции</p>
                <p
                  className="mt-1 text-[12px] leading-relaxed text-white/55"
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
                  : pendingFileType
                    ? "Сохраняем…"
                    : "Подтвердить всю секцию"}
              </button>
              {acceptanceError ? (
                <span
                  className="text-[12px] text-[var(--v19b-status-danger-text)]"
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
