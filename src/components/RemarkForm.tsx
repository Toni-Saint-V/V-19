import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, MessageSquarePlus, AlertTriangle, User, FileText, Send } from 'lucide-react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import type { SubmissionFileType } from '../modules/submissions/types';

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
    severity: 'warning' | 'critical';
  }) => void | Promise<void>;
}

const templates = [
  'Значение в анкете не совпадает с документом. Проверьте и исправьте поле.',
  'Документ читается не полностью. Загрузите файл в лучшем качестве.',
  'Нужно добавить подтверждающий документ для этого поля.',
];

export function RemarkForm({ isOpen, onClose, submissionId, defaultField, defaultFileType, defaultApplicant, onSubmit }: RemarkFormProps) {
  const bridge = useVisaflowBusinessBridge();
  const [message, setMessage] = useState(defaultField ? `Проверьте поле «${defaultField}».` : templates[0]);
  const [severity, setSeverity] = useState<'warning' | 'critical'>('warning');

  useEffect(() => {
    if (!isOpen) return;
    setMessage(defaultField ? `Проверьте поле «${defaultField}».` : templates[0]);
    setSeverity('warning');
  }, [defaultField, isOpen]);

  const handleSubmit = () => {
    const payload = {
      submissionId: submissionId || null,
      field: defaultField,
      fileType: defaultFileType,
      applicant: defaultApplicant,
      severity,
      message,
    };
    void bridge.onRemarkSubmit?.(payload);
    emitVisaflowUiEvent(bridge, { type: 'remark.submit', payload });
    void onSubmit?.({
      field: defaultField,
      fileType: defaultFileType,
      applicant: defaultApplicant,
      severity,
      message,
    });
    onClose();
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
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.98 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="v19-remark-form-dialog fixed inset-x-3 bottom-3 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[560px] bg-[#111113] border border-white/10 rounded-3xl shadow-[0_24px_100px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            <header className="v19-remark-form-header px-5 py-4 border-b border-white/10 flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-white/[0.045] border border-white/10 flex items-center justify-center shrink-0">
                <MessageSquarePlus className="w-5 h-5 text-white/62" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-white/40 uppercase tracking-wider font-medium">{submissionId || 'SUB-0000'}</div>
                <h2 className="text-[18px] font-semibold text-white tracking-tight mt-1">Добавить замечание</h2>
              </div>
              <button
                aria-label="Закрыть форму замечания"
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
                  <div className="text-[13px] font-medium text-white truncate">{defaultField || 'Общее замечание'}</div>
                </div>
                <div className="p-3 rounded-2xl bg-[#161617] border border-[#242529]">
                  <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-2">
                    <User className="w-3.5 h-3.5" /> Заявитель
                  </div>
                  <div className="text-[13px] font-medium text-white truncate">{defaultApplicant || 'Иван Петров'}</div>
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-white/50 font-medium mb-2">Важность</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    aria-pressed={severity === 'warning'}
                    type="button"
                    onClick={() => setSeverity('warning')}
                    className={`h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors ${severity === 'warning' ? 'bg-white/[0.045] border-white/10 text-white/62' : 'bg-[#161617] border-[#242529] text-white/60 hover:text-white'}`}
                  >
                    <AlertTriangle className="w-4 h-4" /> Исправить
                  </button>
                  <button
                    aria-pressed={severity === 'critical'}
                    type="button"
                    onClick={() => setSeverity('critical')}
                    className={`h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors ${severity === 'critical' ? 'bg-[#24191b]/60 border-[#5b2b32]/45 text-[#d59aa3]' : 'bg-[#161617] border-[#242529] text-white/60 hover:text-white'}`}
                  >
                    <AlertTriangle className="w-4 h-4" /> Критично
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-white/50 font-medium mb-2" htmlFor="remark-message">Текст для клиента</label>
                <textarea
                  id="remark-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-[120px] w-full resize-none rounded-2xl bg-[#161617] border border-[#242529] px-4 py-3 text-[14px] text-white placeholder-white/35 outline-none focus:border-[#6f64ff]/55 focus:ring-1 focus:ring-[#6f64ff]/25"
                  placeholder="Опишите, что именно нужно исправить..."
                />
              </div>

              <div className="space-y-2">
                <div className="text-[12px] text-white/50 font-medium">Быстрые шаблоны</div>
                {templates.map((template) => (
                  <button
                    key={template}
                    type="button"
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
                onClick={onClose}
                className="h-11 px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[13px] font-medium text-white/70 hover:text-white transition-colors"
              >
                Отмена
              </button>
              <button
                aria-label="Отправить замечание"
                data-testid="remark-form-submit"
                onClick={handleSubmit}
                className="h-11 px-5 rounded-xl bg-[#24242a] hover:bg-[#2a2b32] text-[13px] font-semibold text-white flex items-center gap-2 shadow-[0_0_28px_rgba(111,100,255,0.14)] transition-colors"
              >
                <Send className="w-4 h-4" /> Отправить замечание
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
