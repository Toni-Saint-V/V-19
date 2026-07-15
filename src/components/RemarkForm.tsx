import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  X,
  MessageSquarePlus,
  AlertTriangle,
  User,
  FileText,
  Send,
} from "lucide-react";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import type { SubmissionFileType } from "../modules/submissions/types";

interface RemarkFormProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  defaultField?: string;
  defaultFileType?: SubmissionFileType;
  defaultApplicant?: string;
  onSubmit?: (input: {
    field?: string;
    fileType?: SubmissionFileType;
    applicant?: string;
    message: string;
    severity: "warning" | "critical";
  }) => boolean | void | Promise<boolean | void>;
}

const templates = [
  "Значение в анкете не совпадает с документом. Проверьте и исправьте поле.",
  "Документ читается не полностью. Загрузите файл в лучшем качестве.",
  "Нужно добавить подтверждающий документ для этого поля.",
];

const remarkFormHeadingId = "remark-form-heading";
const focusableControlSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function RemarkForm({
  isOpen,
  onClose,
  submissionId,
  defaultField,
  defaultFileType,
  defaultApplicant,
  onSubmit,
}: RemarkFormProps) {
  const bridge = useVisaflowBusinessBridge();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState(
    defaultField ? `Проверьте поле «${defaultField}».` : templates[0],
  );
  const [severity, setSeverity] = useState<"warning" | "critical">("warning");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(defaultField ? `Проверьте поле «${defaultField}».` : templates[0]);
    setSeverity("warning");
    setSubmitError("");
    setIsSubmitting(false);
  }, [defaultField, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLTextAreaElement>("#remark-message")?.focus({
        preventScroll: true,
      });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isSubmitting) onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableControlSelector) ??
          [],
      ).filter((control) => control.getClientRects().length > 0);
      if (!controls.length) return;

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  useEffect(() => {
    if (isOpen) return;

    const trigger = returnFocusRef.current;
    if (!trigger || !document.contains(trigger)) return;
    const animationFrame = window.requestAnimationFrame(() => {
      trigger.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen]);

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setSubmitError(
        "Введите текст замечания, чтобы агент понимал, что нужно исправить.",
      );
      return;
    }
    if (!onSubmit) {
      setSubmitError(
        "Добавление замечаний сейчас недоступно. Подача не была изменена.",
      );
      return;
    }
    if (isSubmitting) return;

    setSubmitError("");
    setIsSubmitting(true);
    const payload = {
      submissionId: submissionId || null,
      field: defaultField,
      fileType: defaultFileType,
      applicant: defaultApplicant,
      severity,
      message: trimmedMessage,
    };

    try {
      const submitted = await onSubmit({
        field: defaultField,
        fileType: defaultFileType,
        applicant: defaultApplicant,
        severity,
        message: trimmedMessage,
      });
      if (submitted === false) {
        throw new Error("Remark submission was rejected.");
      }

      void Promise.resolve(bridge.onRemarkSubmit?.(payload)).catch(() => undefined);
      emitVisaflowUiEvent(bridge, { type: "remark.submit", payload });
      onClose();
    } catch {
      setSubmitError(
        "Не удалось сохранить замечание. Подача не была изменена. Повторите попытку.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="v19-remark-form-backdrop fixed inset-0 bg-black/65 backdrop-blur-sm"
            aria-hidden="true"
            onClick={isSubmitting ? undefined : onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-labelledby={remarkFormHeadingId}
            aria-modal="true"
            aria-busy={isSubmitting}
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.98 }}
            transition={{ type: "spring", damping: 24, stiffness: 260 }}
            className="v19-remark-form-dialog fixed inset-x-3 bottom-3 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[560px] bg-[#111113] border border-white/10 rounded-3xl shadow-[0_24px_100px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            <header className="v19-remark-form-header px-5 py-4 border-b border-white/10 flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-white/[0.045] border border-white/10 flex items-center justify-center shrink-0">
                <MessageSquarePlus className="w-5 h-5 text-white/62" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-white/40 uppercase tracking-wider font-medium">
                  {submissionId || "SUB-0000"}
                </div>
                <h2
                  id={remarkFormHeadingId}
                  className="text-[18px] font-semibold text-white tracking-tight mt-1"
                >
                  Добавить замечание
                </h2>
              </div>
              <button
                aria-label="Закрыть форму замечания"
                disabled={isSubmitting}
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="v19-remark-form-body p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-[#161617] border border-[#242529]">
                  <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-2">
                    <FileText className="w-3.5 h-3.5" /> Поле
                  </div>
                  <div className="text-[13px] font-medium text-white truncate">
                    {defaultField || "Общее замечание"}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-[#161617] border border-[#242529]">
                  <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-2">
                    <User className="w-3.5 h-3.5" /> Заявитель
                  </div>
                  <div className="text-[13px] font-medium text-white truncate">
                    {defaultApplicant || "Иван Петров"}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-white/50 font-medium mb-2">
                  Важность
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    aria-pressed={severity === "warning"}
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => setSeverity("warning")}
                    className={`h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors ${severity === "warning" ? "bg-white/[0.045] border-white/10 text-white/62" : "bg-[#161617] border-[#242529] text-white/60 hover:text-white"}`}
                  >
                    <AlertTriangle className="w-4 h-4" /> Исправить
                  </button>
                  <button
                    aria-pressed={severity === "critical"}
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => setSeverity("critical")}
                    className={`h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors ${severity === "critical" ? "bg-[#24191b]/60 border-[#5b2b32]/45 text-[#d59aa3]" : "bg-[#161617] border-[#242529] text-white/60 hover:text-white"}`}
                  >
                    <AlertTriangle className="w-4 h-4" /> Критично
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="block text-[12px] text-white/50 font-medium mb-2"
                  htmlFor="remark-message"
                >
                  Текст для клиента
                </label>
                <textarea
                  id="remark-message"
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    if (submitError) setSubmitError("");
                  }}
                  aria-describedby={submitError ? "remark-message-error" : undefined}
                  aria-invalid={submitError ? true : undefined}
                  disabled={isSubmitting}
                  className="min-h-[120px] w-full resize-none rounded-2xl bg-[#161617] border border-[#242529] px-4 py-3 text-[14px] text-white placeholder-white/35 outline-none focus:border-[#6f64ff]/55 focus:ring-1 focus:ring-[#6f64ff]/25"
                  placeholder="Опишите, что именно нужно исправить..."
                />
              </div>
              {submitError && (
                <p
                  id="remark-message-error"
                  role="alert"
                  className="v19-remark-form-error m-0 text-[13px] leading-5"
                >
                  {submitError}
                </p>
              )}

              <div className="space-y-2">
                <div className="text-[12px] text-white/50 font-medium">
                  Быстрые шаблоны
                </div>
                {templates.map((template) => (
                  <button
                    key={template}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setMessage(template)}
                    className="w-full text-left p-3 rounded-xl bg-[#161617] hover:bg-[#1e1e21] border border-[#242529] text-[12px] text-white/65 hover:text-white transition-colors"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>

            <footer className="v19-remark-form-footer p-4 border-t border-white/10 bg-[#111113]/95 flex justify-end gap-3">
              <button
                disabled={isSubmitting}
                onClick={onClose}
                className="h-11 px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[13px] font-medium text-white/70 hover:text-white transition-colors"
              >
                Отмена
              </button>
              <button
                aria-label="Отправить замечание"
                data-testid="remark-form-submit"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="h-11 px-5 rounded-xl bg-[#24242a] hover:bg-[#2a2b32] text-[13px] font-semibold text-white flex items-center gap-2 shadow-[0_0_28px_rgba(111,100,255,0.14)] transition-colors"
              >
                <Send className="w-4 h-4" />{" "}
                {isSubmitting ? "Сохраняем…" : "Отправить замечание"}
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
