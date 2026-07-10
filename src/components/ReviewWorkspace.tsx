import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  MessageSquarePlus,
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

function reviewFieldsForSubmission(submission?: Submission | null): ReviewField[] {
  return (
    submission?.applicants
      .flatMap((applicant) => applicant.sections.flatMap((section) => section.fields))
      .filter((field) => field.value.trim())
      .slice(0, 6)
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

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#101011] text-white"
      exit={{ opacity: 0, scale: 0.985 }}
      initial={{ opacity: 0, scale: 0.985 }}
    >
      <header className="flex h-[64px] shrink-0 items-center gap-4 border-b border-[#202124] bg-[#141416]/95 px-4 backdrop-blur-md lg:px-6">
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

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-auto xl:grid-cols-[minmax(420px,1fr)_minmax(480px,0.9fr)] xl:overflow-hidden">
        <section className="flex min-h-[320px] flex-col border-b border-[#202124] bg-[#0e0e10] p-5 xl:min-h-0 xl:border-b-0 xl:border-r lg:p-8">
          <div className="flex items-center gap-2 text-white/70">
            <FileText className="w-4" />
            <span className="truncate text-[13px] font-medium">
              {passportFileName(submission)}
            </span>
          </div>

          <div className="my-auto rounded-2xl border border-[#3b321d] bg-[#221d13] p-5 text-center">
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
        </section>

        <section className="min-w-0 bg-[#141416] p-5 lg:p-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/62">
              Данные анкеты
            </p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-white lg:text-[30px]">
              Уточните замечания для агента
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/50">
              Значения ниже взяты только из анкеты и не подтверждены паспортом.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {reviewFields.length ? (
              reviewFields.map((field) => (
                <article
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-[#242529] bg-[#161617] p-4 md:flex-row md:items-center"
                  key={field.label}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                      {field.label}
                    </p>
                    <p className="mt-1 truncate text-[15px] font-semibold text-white">
                      {field.value}
                    </p>
                    <p className="mt-1 text-[11px] text-white/35">
                      Не подтверждено документом
                    </p>
                  </div>
                  <button
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                    onClick={() => onAddRemark(field.label)}
                    type="button"
                  >
                    <MessageSquarePlus className="w-4" />
                    Добавить замечание
                  </button>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-[13px] text-white/55">
                В анкете нет значений для точного замечания.
              </div>
            )}
          </div>
        </section>
      </main>
    </motion.div>
  );
}
