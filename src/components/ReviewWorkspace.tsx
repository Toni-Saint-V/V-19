import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, CheckCircle2, AlertCircle, MessageSquarePlus,
  RotateCw, ScanText, FileText, User, ShieldCheck, Sparkles,
  ChevronDown, Eye, Download, Maximize2
} from 'lucide-react';

interface ReviewWorkspaceProps {
  submissionId: string;
  onBack: () => void;
  onAddRemark: (field?: string) => void;
}

type FieldState = 'match' | 'warning' | 'pending';

const fields: Array<{ label: string; value: string; source: string; confidence: string; state: FieldState }> = [
  { label: 'Фамилия', value: 'PETROV', source: 'MRZ line 2', confidence: '99%', state: 'match' },
  { label: 'Имя', value: 'IVAN', source: 'MRZ line 2', confidence: '99%', state: 'match' },
  { label: 'Дата рождения', value: '12.05.1985', source: 'Visual zone', confidence: '98%', state: 'match' },
  { label: 'Место рождения', value: 'MOSCOW', source: 'Visual zone', confidence: '74%', state: 'warning' },
  { label: 'Номер паспорта', value: '75 1234567', source: 'MRZ line 1', confidence: '96%', state: 'pending' },
  { label: 'Срок действия', value: '15.06.2030', source: 'MRZ line 2', confidence: '99%', state: 'match' },
];

const stateMeta: Record<FieldState, { label: string; className: string; icon: React.ReactNode }> = {
  match: {
    label: 'Совпадает',
    className: 'bg-white/[0.045] border-white/10 text-[#b8baff]',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  warning: {
    label: 'Нужно проверить',
    className: 'bg-white/[0.045] border-white/10 text-white/62',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  pending: {
    label: 'Ожидает',
    className: 'bg-[#6f64ff]/10 border-[#6f64ff]/20 text-[#b8baff]',
    icon: <ScanText className="w-3.5 h-3.5" />,
  },
};

function FieldReviewRow({ field, onAddRemark }: { field: (typeof fields)[number]; onAddRemark: (field?: string) => void }) {
  const meta = stateMeta[field.state];

  return (
    <div className={`p-4 rounded-2xl border transition-colors ${field.state === 'warning' ? 'bg-white/[0.035] border-white/10' : 'bg-[#161617] border-[#242529] hover:border-[#2e2f34]'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-white/40 uppercase tracking-wider font-medium">{field.label}</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${meta.className}`}>{meta.icon}{meta.label}</span>
          </div>
          <div className="text-[15px] font-semibold text-white truncate">{field.value}</div>
          <div className="text-[11px] text-white/35 mt-1">Источник: {field.source} · confidence {field.confidence}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddRemark(field.label)}
            className="h-9 px-3 rounded-xl bg-white/[0.045] hover:bg-[#24242a]/15 border border-white/10 text-white/62 text-[12px] font-medium flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
          >
            <MessageSquarePlus className="w-4 h-4" /> Замечание
          </button>
          <button className="h-9 px-3 rounded-xl bg-white/[0.045] hover:bg-[#202126]/15 border border-white/10 text-[#b8baff] text-[12px] font-medium flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60">
            <CheckCircle2 className="w-4 h-4" /> OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReviewWorkspace({ submissionId, onBack, onAddRemark }: ReviewWorkspaceProps) {
  const enterFullscreen = () => {
    const target = document.documentElement;
    if (document.fullscreenElement) return;
    void target.requestFullscreen?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      className="fixed inset-0 z-[60] bg-[#101011] text-white flex flex-col overflow-hidden"
    >
      <header className="h-[64px] shrink-0 border-b border-[#202124] bg-[#141416]/95 backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] flex items-center justify-center text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] text-white/62 uppercase tracking-wider font-medium">Admin document review</div>
          <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight leading-none mt-1 truncate">Сверка паспорта · {submissionId}</h1>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2">
          <button className="h-10 px-4 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-[13px] font-medium text-white/80 flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" /> Скачать оригинал
          </button>
          <button className="h-10 px-4 rounded-xl bg-[#202126] hover:bg-[#2a2b32] text-[13px] font-medium text-white flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.18)] transition-colors">
            <CheckCircle2 className="w-4 h-4" /> Завершить сверку
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(420px,1fr)_minmax(480px,0.9fr)] overflow-hidden">
        <section className="min-h-[420px] xl:min-h-0 bg-[#0e0e10] border-b xl:border-b-0 xl:border-r border-[#202124] flex flex-col">
          <div className="h-14 shrink-0 border-b border-[#202124] bg-[#141416] flex items-center px-4 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-white/40" />
              <span className="text-[13px] font-medium text-white truncate">Passport_Petrov_I.pdf</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/55 hover:text-white transition-colors"><RotateCw className="w-4 h-4" /></button>
              <button onClick={enterFullscreen} className="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/55 hover:text-white transition-colors"><Maximize2 className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 min-h-0 p-5 lg:p-8 overflow-auto scrollbar-thin scrollbar-thumb-white/10 flex items-center justify-center">
            <div className="relative w-full max-w-[560px] aspect-[0.72] rounded-[24px] bg-gradient-to-b from-[#f7f7f1] to-[#d8d8cd] shadow-[0_32px_120px_rgba(0,0,0,0.5)] overflow-hidden text-[#101011] p-8">
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-[#6f64ff]/10 via-white/[0.025] to-[#6f64ff]/8" />
              <div className="relative z-10 flex items-start justify-between border-b border-black/15 pb-5 mb-6">
                <div>
                  <div className="text-[11px] tracking-[0.3em] uppercase text-black/50 font-bold">Passport</div>
                  <div className="text-[22px] font-bold tracking-tight mt-1">Russian Federation</div>
                </div>
                <div className="w-14 h-14 rounded-full border border-black/15 flex items-center justify-center text-[10px] font-bold text-black/30">RF</div>
              </div>

              <div className="relative z-10 grid grid-cols-[150px_1fr] gap-6">
                <div className="aspect-[3/4] rounded-2xl bg-gradient-to-br from-slate-400 to-slate-600 shadow-inner flex items-center justify-center">
                  <User className="w-16 h-16 text-white/40" />
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-black/40 font-bold">Surname</div>
                    <div className="text-[18px] font-bold tracking-wider">PETROV</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-black/40 font-bold">Given names</div>
                    <div className="text-[18px] font-bold tracking-wider">IVAN</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-black/40 font-bold">DOB</div>
                      <div className="text-[14px] font-bold">12.05.1985</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-black/40 font-bold">Expiry</div>
                      <div className="text-[14px] font-bold">15.06.2030</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-black/40 font-bold">Birth place</div>
                    <div className="inline-flex items-center gap-2 text-[14px] font-bold px-2 py-1 rounded-md bg-white/[0.06] border border-white/15">MOSCOW <AlertCircle className="w-3.5 h-3.5 text-[#b8baff]" /></div>
                  </div>
                </div>
              </div>

              <div className="absolute left-8 right-8 bottom-8 font-mono text-[14px] leading-6 tracking-wider text-black/70 border-t border-black/15 pt-4">
                P&lt;RUSPETROV&lt;&lt;IVAN&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br />
                751234567RUS8505129M3006157&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;04
              </div>

              <div className="absolute left-[235px] top-[270px] w-[188px] h-[42px] rounded-xl border-2 border-[#6f64ff]/35 bg-white/[0.045] shadow-[0_0_0_4px_rgba(111,100,255,0.08)]" />
            </div>
          </div>
        </section>

        <section className="min-w-0 flex flex-col bg-[#141416] overflow-hidden">
          <div className="p-5 lg:p-6 border-b border-[#202124] shrink-0">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-white/62 text-[11px] font-medium uppercase tracking-wide mb-3">
                  <Sparkles className="w-3.5 h-3.5" /> Smart compare
                </div>
                <h2 className="text-[24px] lg:text-[30px] font-semibold tracking-tight text-white leading-tight">Сверка полей</h2>
                <p className="text-[13px] text-white/50 leading-relaxed mt-2 max-w-2xl">
                  Подтвердите совпадения между анкетой, OCR и визуальной зоной документа. Замечания попадут клиенту как точные задачи.
                </p>
              </div>
              <button className="h-10 px-3 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-[13px] font-medium text-white/80 flex items-center gap-2 transition-colors">
                <Eye className="w-4 h-4" /> OCR map <ChevronDown className="w-4 h-4 text-white/40" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 lg:p-6 scrollbar-thin scrollbar-thumb-white/10">
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="p-4 rounded-2xl bg-[#161617] border border-[#242529]">
                <CheckCircle2 className="w-5 h-5 text-[#b8baff] mb-3" />
                <div className="text-2xl font-semibold text-white">4</div>
                <div className="text-[11px] text-white/40 mt-1">совпало</div>
              </div>
              <div className="p-4 rounded-2xl bg-[#161617] border border-white/10">
                <AlertCircle className="w-5 h-5 text-white/62 mb-3" />
                <div className="text-2xl font-semibold text-white">1</div>
                <div className="text-[11px] text-white/40 mt-1">риск</div>
              </div>
              <div className="p-4 rounded-2xl bg-[#161617] border border-[#242529]">
                <ShieldCheck className="w-5 h-5 text-[#b8baff] mb-3" />
                <div className="text-2xl font-semibold text-white">96%</div>
                <div className="text-[11px] text-white/40 mt-1">confidence</div>
              </div>
            </div>

            <div className="space-y-3">
              {fields.map((field) => (
                <FieldReviewRow key={field.label} field={field} onAddRemark={onAddRemark} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </motion.div>
  );
}
