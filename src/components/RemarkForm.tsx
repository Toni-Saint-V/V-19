import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  FileText,
  MessageSquarePlus,
  Send,
  User,
  X,
} from "lucide-react";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import type { SubmissionFileType } from "../modules/submissions/types";
import { persistenceFailureMessage } from "./review/persistenceFailureMessage";

interface RemarkFormProps {
  defaultApplicant?: string;
  defaultApplicantId?: string;
  defaultField?: string;
  defaultFileType?: SubmissionFileType;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (input: {
    applicant?: string;
    applicantId?: string;
    field?: string;
    fileType?: SubmissionFileType;
    message: string;
    severity: "warning" | "critical";
  }) => boolean | void | Promise<boolean | void>;
  submissionId: string;
}

const templates = [
  "Значение не совпадает с паспортом. Проверьте и исправьте поле.",
  "Файл читается не полностью. Загрузите оригинал в лучшем качестве.",
  "Нужно повторно загрузить этот файл для проверки.",
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
  defaultApplicant,
  defaultApplicantId,
  defaultField,
  defaultFileType,
  isOpen,
  onClose,
  onSubmit,
  submissionId,
}: RemarkFormProps) {
  const bridge = useVisaflowBusinessBridge();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submitRunRef = useRef(false);
  const initialMessage = defaultField ? `Проверьте «${defaultField}».` : templates[0];
  const [message, setMessage] = useState(initialMessage);
  const [severity, setSeverity] = useState<"warning" | "critical">("warning");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const isDirty = message !== initialMessage || severity !== "warning";

  const handleRequestClose = useCallback(() => {
    if (isSubmitting) return;
    if (isDirty) {
      setDiscardConfirmationOpen(true);
      return;
    }
    onClose();
  }, [isDirty, isSubmitting, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(initialMessage);
    setSeverity("warning");
    setSubmitError("");
    setIsSubmitting(false);
    setDiscardConfirmationOpen(false);
    submitRunRef.current = false;
  }, [initialMessage, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLTextAreaElement>("#remark-message")
        ?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleRequestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          focusableControlSelector,
        ) ?? [],
      ).filter((control) => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
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
  }, [handleRequestClose, isOpen]);

  const restoreReturnFocus = () => {
    const trigger = returnFocusRef.current;
    if (!trigger || !document.contains(trigger)) return;
    window.requestAnimationFrame(() => {
      trigger.focus({ preventScroll: true });
    });
  };

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
    if (isSubmitting || submitRunRef.current) return;

    const payload = {
      applicant: defaultApplicant,
      applicantId: defaultApplicantId,
      field: defaultField,
      fileType: defaultFileType,
      message: trimmedMessage,
      severity,
      submissionId: submissionId || null,
    };
    setSubmitError("");
    setDiscardConfirmationOpen(false);
    submitRunRef.current = true;
    setIsSubmitting(true);
    try {
      const submitted = await onSubmit({
        applicant: defaultApplicant,
        applicantId: defaultApplicantId,
        field: defaultField,
        fileType: defaultFileType,
        message: trimmedMessage,
        severity,
      });
      if (submitted === false) throw new Error("Remark submission rejected");

      void Promise.resolve(bridge.onRemarkSubmit?.(payload)).catch(() => undefined);
      emitVisaflowUiEvent(bridge, { type: "remark.submit", payload });
      onClose();
    } catch (error) {
      setSubmitError(
        persistenceFailureMessage(
          error,
          "Не удалось сохранить замечание. Подача не была изменена. Повторите попытку.",
        ),
      );
    } finally {
      submitRunRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence onExitComplete={restoreReturnFocus}>
      {isOpen ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden="true"
            className="v19-remark-form-backdrop fixed inset-0 bg-black/65 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={isSubmitting ? undefined : handleRequestClose}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-busy={isSubmitting}
            aria-labelledby={remarkFormHeadingId}
            aria-modal="true"
            className="v19-remark-form-dialog fixed inset-x-3 bottom-3 max-h-[calc(100dvh-24px)] overflow-x-hidden overflow-y-auto overscroll-contain bg-[#111113] border border-white/10 rounded-3xl shadow-[0_24px_100px_rgba(0,0,0,0.65)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[560px] sm:-translate-x-1/2 sm:-translate-y-1/2"
            exit={{ opacity: 0, scale: 0.98, y: 22 }}
            initial={{ opacity: 0, scale: 0.98, y: 22 }}
            ref={dialogRef}
            role="dialog"
            transition={{ damping: 24, stiffness: 260, type: "spring" }}
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
                  className="text-[18px] font-semibold text-white tracking-tight mt-1"
                  id={remarkFormHeadingId}
                >
                  Добавить замечание
                </h2>
                <span
                  aria-live="polite"
                  className="v19-remark-form-dirty"
                  role="status"
                >
                  {isDirty ? "Есть несохранённые изменения" : "Изменений нет"}
                </span>
              </div>
              <button
                aria-label="Закрыть форму замечания"
                className="v19-remark-form-close w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors disabled:opacity-40"
                disabled={isSubmitting}
                onClick={handleRequestClose}
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="v19-remark-form-body p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-[#161617] border border-[#242529]">
                  <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-2">
                    <FileText className="w-3.5 h-3.5" />
                    Поле или файл
                  </div>
                  <div className="text-[13px] font-medium text-white truncate">
                    {defaultField || defaultFileType || "Паспортная секция"}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-[#161617] border border-[#242529]">
                  <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-2">
                    <User className="w-3.5 h-3.5" />
                    Заявитель
                  </div>
                  <div className="text-[13px] font-medium text-white truncate">
                    {defaultApplicant || "Заявитель"}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-[12px] text-white/50 font-medium mb-2">
                  Важность
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    aria-pressed={severity === "warning"}
                    className={`h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors ${severity === "warning" ? "bg-white/[0.045] border-white/10 text-white/62" : "bg-[#161617] border-[#242529] text-white/60 hover:text-white"}`}
                    disabled={isSubmitting}
                    onClick={() => {
                      setSeverity("warning");
                      setDiscardConfirmationOpen(false);
                    }}
                    type="button"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Исправить
                  </button>
                  <button
                    aria-pressed={severity === "critical"}
                    className={`h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors ${severity === "critical" ? "bg-[#24191b]/60 border-[#5b2b32]/45 text-[#d59aa3]" : "bg-[#161617] border-[#242529] text-white/60 hover:text-white"}`}
                    disabled={isSubmitting}
                    onClick={() => {
                      setSeverity("critical");
                      setDiscardConfirmationOpen(false);
                    }}
                    type="button"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Критично
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
                  aria-describedby={submitError ? "remark-message-error" : undefined}
                  aria-invalid={submitError ? true : undefined}
                  className="min-h-[120px] w-full resize-none rounded-2xl bg-[#161617] border border-[#242529] px-4 py-3 text-[14px] text-white placeholder-white/35 outline-none focus:border-[#6f64ff]/55 focus:ring-1 focus:ring-[#6f64ff]/25"
                  disabled={isSubmitting}
                  id="remark-message"
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setDiscardConfirmationOpen(false);
                    if (submitError) setSubmitError("");
                  }}
                  placeholder="Опишите, что именно нужно исправить..."
                  value={message}
                />
              </div>
              {submitError ? (
                <p
                  className="v19-remark-form-error m-0 text-[13px] leading-5 text-red-300"
                  id="remark-message-error"
                  role="alert"
                >
                  {submitError}
                </p>
              ) : null}

              <div className="space-y-2">
                <div className="text-[12px] text-white/50 font-medium">
                  Быстрые шаблоны
                </div>
                {templates.map((template) => (
                  <button
                    className="w-full text-left p-3 rounded-xl bg-[#161617] hover:bg-[#1e1e21] border border-[#242529] text-[12px] text-white/65 hover:text-white transition-colors"
                    disabled={isSubmitting}
                    key={template}
                    onClick={() => {
                      setMessage(template);
                      setDiscardConfirmationOpen(false);
                    }}
                    type="button"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>

            <footer className="v19-remark-form-footer sticky bottom-0 p-4 border-t border-white/10 bg-[#111113]/95 flex justify-end gap-3">
              {discardConfirmationOpen ? (
                <div
                  aria-label="Несохранённое замечание"
                  className="v19-remark-form-discard"
                  role="group"
                >
                  <p>Текст не сохранён. Закрыть форму и потерять изменения?</p>
                  <button
                    onClick={() => setDiscardConfirmationOpen(false)}
                    type="button"
                  >
                    Продолжить редактирование
                  </button>
                  <button onClick={onClose} type="button">
                    Закрыть без сохранения
                  </button>
                </div>
              ) : null}
              <button
                className="h-11 px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[13px] font-medium text-white/70 hover:text-white transition-colors disabled:opacity-40"
                disabled={isSubmitting}
                onClick={handleRequestClose}
                type="button"
              >
                Отмена
              </button>
              <button
                aria-label="Отправить замечание"
                className="h-11 px-5 rounded-xl bg-[#24242a] hover:bg-[#2a2b32] text-[13px] font-semibold text-white flex items-center gap-2 shadow-[0_0_28px_rgba(111,100,255,0.14)] transition-colors disabled:opacity-55"
                data-testid="remark-form-submit"
                disabled={isSubmitting}
                onClick={() => void handleSubmit()}
                type="button"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? "Сохраняем…" : "Отправить замечание"}
              </button>
            </footer>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
