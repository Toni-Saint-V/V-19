import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Circle,
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

type ReviewField = {
  label: string;
  value: string;
};

const selfieReviewTargets = [
  { label: "Селфи 1", type: "selfie" },
  { label: "Селфи 2", type: "selfie_2" },
] as const;

const passportComparableFieldIds = new Set([
  "surname",
  "first-name",
  "birth-date",
  "birth-place",
  "nationality",
  "gender",
  "passport-type",
  "passport-no",
  "passport-issue-date",
  "passport-expiry-date",
  "passport-issue-country",
  "passport-issue-place",
]);

function hasReviewValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return Boolean(normalized) && normalized !== "—" && normalized !== "не заполнено";
}

function reviewFieldsForSubmission(
  submission?: Submission | null,
  applicantId?: string,
): ReviewField[] {
  return (
    submission?.applicants
      .filter((applicant) => !applicantId || applicant.id === applicantId)
      .flatMap((applicant) => applicant.sections.flatMap((section) => section.fields))
      .filter((field) => passportComparableFieldIds.has(field.id))
      .filter((field) => hasReviewValue(field.value))
      .map((field) => ({ label: field.label, value: field.value })) ?? []
  );
}

function passportFileName(passportFile?: SubmissionFile): string {
  if (!passportFile) return "Паспорт не загружен";
  return (
    passportFile.originalFileName ??
    passportFile.generatedFileName ??
    "Скан паспорта"
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
  const passportFile = submission?.files.find(
    (file) =>
      file.applicantId === selectedApplicantId && file.type === "passport_scan",
  );
  const protectedPassportFile =
    passportFile &&
    selectedApplicantId &&
    isPersistablePrivateFileAssetAtSubmissionTarget(passportFile, {
      applicantId: selectedApplicantId,
      fileType: "passport_scan",
      submissionId,
    })
      ? passportFile
      : undefined;
  const protectedPassportPath = protectedPassportFile?.storagePath;
  const reviewFields = reviewFieldsForSubmission(submission, selectedApplicantId);
  const [verifiedFieldLabels, setVerifiedFieldLabels] = useState<Set<string>>(
    () => new Set(),
  );
  const [passportPreviewUrl, setPassportPreviewUrl] = useState<string>();
  const [passportPreviewStatus, setPassportPreviewStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("unavailable");
  const [pendingFileType, setPendingFileType] = useState<SubmissionFileType>();
  const [acceptedFileTypes, setAcceptedFileTypes] = useState<Set<SubmissionFileType>>(
    () => new Set(),
  );
  const [acceptanceError, setAcceptanceError] = useState("");

  useEffect(() => {
    setVerifiedFieldLabels(new Set());
    setAcceptedFileTypes(new Set());
    setAcceptanceError("");
  }, [selectedApplicantId, submissionId]);

  useEffect(() => {
    let cancelled = false;
    setPassportPreviewUrl(undefined);
    if (!protectedPassportPath) {
      setPassportPreviewStatus("unavailable");
      return () => {
        cancelled = true;
      };
    }

    setPassportPreviewStatus("loading");
    void createMediaSignedUrl({
      bucket: mediaStorageBucket,
      path: protectedPassportPath,
    })
      .then((signedUrl) => {
        if (cancelled) return;
        if (!signedUrl) {
          setPassportPreviewStatus("unavailable");
          return;
        }
        setPassportPreviewUrl(signedUrl);
        setPassportPreviewStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setPassportPreviewStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [protectedPassportPath, selectedApplicantId, submissionId]);

  const canReviewPassport = passportPreviewStatus === "ready";
  const passportAlreadyAccepted =
    passportFile?.status === "accepted" || acceptedFileTypes.has("passport_scan");
  const allPassportFieldsVerified =
    reviewFields.length > 0 && reviewFields.every((field) => verifiedFieldLabels.has(field.label));
  const canCompletePassport =
    Boolean(selectedApplicantId && onAcceptFile) &&
    canReviewPassport &&
    !passportAlreadyAccepted &&
    allPassportFieldsVerified &&
    pendingFileType === undefined;

  function toggleFieldVerification(label: string) {
    setVerifiedFieldLabels((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function acceptFile(fileType: SubmissionFileType) {
    if (!selectedApplicantId || !onAcceptFile || !canReviewPassport) return;
    setAcceptanceError("");
    setPendingFileType(fileType);
    try {
      const accepted = await onAcceptFile({
        applicantId: selectedApplicantId,
        fileType,
      });
      if (accepted === false) {
        setAcceptanceError("Не удалось сохранить результат сверки. Повторите попытку.");
      } else {
        setAcceptedFileTypes((current) => new Set(current).add(fileType));
      }
    } catch {
      setAcceptanceError("Не удалось сохранить результат сверки. Повторите попытку.");
    } finally {
      setPendingFileType(undefined);
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="v19-admin-passport-workspace fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#101011] text-white"
      exit={{ opacity: 0, scale: 0.985 }}
      initial={{ opacity: 0, scale: 0.985 }}
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
            Проверка документа
          </p>
          <h1 className="mt-1 truncate text-[19px] font-semibold leading-none tracking-tight lg:text-[21px]">
            Паспорт · {submissionId}
          </h1>
        </div>
      </header>

      <main className="v19-admin-passport-main grid min-h-0 flex-1 grid-cols-1 overflow-auto xl:grid-cols-[minmax(420px,1fr)_minmax(480px,0.9fr)] xl:overflow-hidden">
        <section className="v19-admin-passport-document-pane flex min-h-[320px] flex-col border-b border-[#202124] bg-[#0e0e10] p-5 xl:min-h-0 xl:border-b-0 xl:border-r lg:p-8">
          <div className="flex items-center gap-2 text-white/70">
            <FileText className="w-4" />
            <span className="truncate text-[13px] font-medium">
              {passportFileName(passportFile)}
            </span>
          </div>

          {passportPreviewStatus === "loading" ? (
            <div className="v19-admin-passport-preview-state my-auto rounded-2xl border border-[#242529] bg-[#161617] p-5 text-center">
              <h2 className="text-base font-semibold text-white">Загружаем оригинал паспорта</h2>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-white/65">
                Получаем временный защищённый доступ к файлу подачи.
              </p>
            </div>
          ) : passportPreviewUrl ? (
            <figure className="my-auto overflow-hidden rounded-2xl border border-[#242529] bg-[#161617]">
              <img
                alt="Оригинал паспорта"
                className="block max-h-[calc(100dvh-180px)] w-full object-contain"
                onError={() => {
                  setPassportPreviewUrl(undefined);
                  setPassportPreviewStatus("unavailable");
                }}
                src={passportPreviewUrl}
              />
              <figcaption className="border-t border-[#242529] px-3 py-2 text-[11px] text-white/50">
                Оригинал из защищённого хранилища подачи. Доступ действует ограниченное время.
              </figcaption>
            </figure>
          ) : (
            <div className="v19-admin-passport-preview-state my-auto rounded-2xl border border-[#3b321d] bg-[#221d13] p-5 text-center">
              <AlertCircle className="mx-auto mb-3 w-6 text-[#f6c66b]" />
              <h2 className="text-base font-semibold text-white">
                Предпросмотр оригинала недоступен
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-white/65">
                Не удалось получить защищённый оригинал. Подтверждение документа
                заблокировано: добавьте точное замечание или вернитесь к файлам.
              </p>
            </div>
          )}
        </section>

        <section className="v19-admin-passport-form-pane min-w-0 bg-[#141416] p-5 lg:p-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/62">
              Данные анкеты
            </p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-white lg:text-[30px]">
              Сверка паспорта
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/50">
              Сверьте значения анкеты с документом. При расхождении добавьте замечание.
            </p>
          </div>

          <div className="v19-admin-passport-fields mt-6 space-y-3">
            {reviewFields.length ? (
              reviewFields.map((field) => {
                const isVerified = verifiedFieldLabels.has(field.label);

                return (
                  <article
                    className="v19-admin-passport-field flex flex-col justify-between gap-4 rounded-2xl border border-[#242529] bg-[#161617] p-4 md:flex-row md:items-center"
                    key={field.label}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                        {field.label}
                      </p>
                      <p className="mt-1 truncate text-[15px] font-semibold text-white">
                        {field.value}
                      </p>
                      <p
                        className={`mt-1 text-[11px] ${
                          isVerified
                            ? "text-[var(--vf-success)]"
                            : "text-[var(--vf-warning)]"
                        }`}
                      >
                        {isVerified
                          ? "Проверено"
                          : "Не подтверждено документом"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        aria-label={`${isVerified ? "Проверено" : "Подтвердить"}: ${field.label}`}
                        aria-pressed={isVerified}
                        disabled={!canReviewPassport}
                        className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${
                          isVerified
                            ? "border-[var(--vf-success-border)] bg-[var(--vf-success-soft)] text-[var(--vf-success)]"
                            : "border-white/10 bg-white/[0.045] text-white/70 hover:bg-white/[0.07]"
                        }`}
                        onClick={() => toggleFieldVerification(field.label)}
                        title={
                          canReviewPassport
                            ? undefined
                            : "Сначала нужен защищённый оригинал паспорта"
                        }
                        type="button"
                      >
                        {isVerified ? <Check className="w-4" /> : <Circle className="w-4" />}
                        {isVerified ? "Проверено" : "Подтвердить"}
                      </button>
                      <button
                        aria-label={`Добавить замечание: ${field.label}`}
                        className="v19-admin-passport-field-remark admin-review-remark-action flex h-9 items-center gap-1.5 rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] transition-colors hover:bg-[#6f64ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                        onClick={() =>
                          onAddRemark(
                            field.label,
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
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-[13px] text-white/55">
                В анкете нет значений для точного замечания.
              </div>
            )}
          </div>

          <section
            aria-live="polite"
            className="v19-admin-passport-completion mt-6 rounded-2xl border border-[#242529] bg-[#161617] p-4"
          >
            <div>
              <p className="text-[13px] font-semibold text-white">Итог сверки паспорта</p>
              <p
                className="mt-1 text-[12px] leading-relaxed text-white/55"
                id="passport-review-completion-reason"
              >
                {!canReviewPassport
                  ? "Нужен защищённый оригинал паспорта. Подтверждение недоступно."
                  : passportAlreadyAccepted
                    ? "Паспорт уже принят. Повторное подтверждение не требуется."
                  : !onAcceptFile
                    ? "Сохранение результата не подключено. Состояние подачи не изменится."
                    : !allPassportFieldsVerified
                      ? `Подтвердите все поля паспорта: осталось ${Math.max(
                          reviewFields.length - verifiedFieldLabels.size,
                          0,
                        )}.`
                      : "Все поля сверены. Результат будет сохранён в подаче."}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                aria-describedby="passport-review-completion-reason"
                className="v19-admin-passport-complete"
                disabled={!canCompletePassport}
                type="button"
                onClick={() => void acceptFile("passport_scan")}
              >
                {passportAlreadyAccepted
                  ? "Паспорт уже принят"
                  : pendingFileType === "passport_scan"
                  ? "Сохраняем…"
                  : "Завершить сверку паспорта"}
              </button>
              {acceptanceError ? (
                <span className="text-[12px] text-[var(--v19b-status-danger-text)]" role="alert">
                  {acceptanceError}
                </span>
              ) : null}
            </div>
          </section>

          <section className="mt-8 border-t border-[#202124] pt-6" aria-labelledby="selfie-review-heading">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/62">
                Фото заявителя
              </p>
              <h3
                className="mt-2 text-[18px] font-semibold tracking-tight text-white"
                id="selfie-review-heading"
              >
                Проверка селфи
              </h3>
              <p className="mt-1 text-[13px] text-white/50">
                Проверьте оба селфи отдельно: лицо, качество и соответствие заявителю.
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {selfieReviewTargets.map((target) => {
                const file = submission?.files.find(
                  (item) =>
                    item.applicantId === selectedApplicantId && item.type === target.type,
                );
                const fileName =
                  file?.originalFileName ?? file?.generatedFileName ?? "Не загружено";

                return (
                  <article
                    className="rounded-2xl border border-[#242529] bg-[#161617] p-4"
                    key={target.type}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-white/60">
                        <UserRound className="w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-white">{target.label}</p>
                        <p className="mt-1 truncate text-[11px] text-white/45">{fileName}</p>
                        <p className="mt-1 text-[11px] text-[var(--vf-warning)]">
                          {file
                            ? "Подтверждение доступно только после открытия защищённого оригинала."
                            : "Не загружено"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        aria-label={`Добавить замечание: ${target.label}`}
                        className="admin-review-remark-action flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] transition-colors hover:bg-[#6f64ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                        onClick={() =>
                          onAddRemark(
                            `${target.label}: требуется проверка`,
                            selectedApplicant?.fullName,
                            target.type,
                            selectedApplicantId,
                          )
                        }
                        title="Добавить замечание"
                        type="button"
                      >
                        <MessageSquarePlus className="w-4" />
                        Замечание
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </main>
    </motion.div>
  );
}
