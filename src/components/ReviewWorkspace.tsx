import { useState } from "react";
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
import type { Submission } from "../modules/submissions/types";

interface ReviewWorkspaceProps {
  submissionId: string;
  submission?: Submission | null;
  onBack: () => void;
  onAddRemark: (field?: string) => void;
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

function reviewFieldsForSubmission(submission?: Submission | null): ReviewField[] {
  return (
    submission?.applicants
      .flatMap((applicant) => applicant.sections.flatMap((section) => section.fields))
      .filter((field) => passportComparableFieldIds.has(field.id))
      .filter((field) => hasReviewValue(field.value))
      .map((field) => ({ label: field.label, value: field.value })) ?? []
  );
}

function passportFileName(submission?: Submission | null): string {
  const passportFile = submission?.files.find((file) => file.type === "passport_scan");

  return (
    passportFile?.originalFileName ??
    passportFile?.generatedFileName ??
    "Паспорт не загружен"
  );
}

export function ReviewWorkspace({
  submissionId,
  submission,
  onBack,
  onAddRemark,
}: ReviewWorkspaceProps) {
  const reviewFields = reviewFieldsForSubmission(submission);
  const hasPassportSource = Boolean(
    submission?.files.some(
      (file) => file.type === "passport_scan" && file.status === "accepted",
    ),
  );
  const [verifiedFieldLabels, setVerifiedFieldLabels] = useState<Set<string>>(
    () => new Set(),
  );
  const [verifiedSelfieTypes, setVerifiedSelfieTypes] = useState<Set<string>>(
    () => new Set(),
  );
  const [testPassportPreviewAvailable, setTestPassportPreviewAvailable] = useState(
    import.meta.env.DEV,
  );

  function toggleFieldVerification(label: string) {
    setVerifiedFieldLabels((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function toggleSelfieVerification(type: string) {
    setVerifiedSelfieTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
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
              {passportFileName(submission)}
            </span>
          </div>

          {testPassportPreviewAvailable && hasPassportSource ? (
            <figure className="my-auto overflow-hidden rounded-2xl border border-[#242529] bg-[#161617]">
              <img
                alt="Тестовый предпросмотр паспорта"
                className="block max-h-[calc(100dvh-180px)] w-full object-contain"
                onError={() => setTestPassportPreviewAvailable(false)}
                src="/docs/Для теста/passport.jpeg"
              />
              <figcaption className="border-t border-[#242529] px-3 py-2 text-[11px] text-white/50">
                Тестовый предпросмотр: в рабочем контуре здесь будет защищённый файл подачи.
              </figcaption>
            </figure>
          ) : (
            <div className="v19-admin-passport-preview-state my-auto rounded-2xl border border-[#3b321d] bg-[#221d13] p-5 text-center">
              <AlertCircle className="mx-auto mb-3 w-6 text-[#f6c66b]" />
              <h2 className="text-base font-semibold text-white">
                Предпросмотр оригинала недоступен
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-white/65">
                Этот контур не получил защищённый файл и проверяемые OCR-данные.
                Сверка и принятие документа заблокированы до подключения реального
                источника.
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
                        className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${
                          isVerified
                            ? "border-[var(--vf-success-border)] bg-[var(--vf-success-soft)] text-[var(--vf-success)]"
                            : "border-white/10 bg-white/[0.045] text-white/70 hover:bg-white/[0.07]"
                        }`}
                        onClick={() => toggleFieldVerification(field.label)}
                        type="button"
                      >
                        {isVerified ? <Check className="w-4" /> : <Circle className="w-4" />}
                        {isVerified ? "Проверено" : "Подтвердить"}
                      </button>
                      <button
                        aria-label={`Добавить замечание: ${field.label}`}
                        className="v19-admin-passport-field-remark admin-review-remark-action flex h-9 items-center gap-1.5 rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] transition-colors hover:bg-[#6f64ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                        onClick={() => onAddRemark(field.label)}
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
                const file = submission?.files.find((item) => item.type === target.type);
                const isVerified = verifiedSelfieTypes.has(target.type);
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
                        <p
                          className={`mt-1 text-[11px] ${
                            isVerified
                              ? "text-[var(--vf-success)]"
                              : "text-[var(--vf-warning)]"
                          }`}
                        >
                          {isVerified
                            ? "Проверено"
                            : file
                              ? "Ожидает проверки"
                              : "Не загружено"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        aria-label={`${isVerified ? "Проверено" : "Подтвердить"}: ${target.label}`}
                        aria-pressed={isVerified}
                        className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${
                          isVerified
                            ? "border-[var(--vf-success-border)] bg-[var(--vf-success-soft)] text-[var(--vf-success)]"
                            : "border-white/10 bg-white/[0.045] text-white/70 hover:bg-white/[0.07]"
                        }`}
                        onClick={() => toggleSelfieVerification(target.type)}
                        type="button"
                      >
                        {isVerified ? <Check className="w-4" /> : <Circle className="w-4" />}
                        {isVerified ? "Проверено" : "Подтвердить"}
                      </button>
                      <button
                        aria-label={`Добавить замечание: ${target.label}`}
                        className="admin-review-remark-action flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] transition-colors hover:bg-[#6f64ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                        onClick={() => onAddRemark(`${target.label}: требуется проверка`)}
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
