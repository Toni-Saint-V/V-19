import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, UploadCloud, FileText, Image as ImageIcon, CheckCircle2,
  AlertCircle, Sparkles, UserPlus, Users, Plane, Calendar, ShieldCheck,
  FolderOpen, ArrowRight, X, ScanText
} from 'lucide-react';

interface PreUploadScreenProps {
  onBack: () => void;
}

type PackageType = 'family' | 'single';

const uploaded = [
  { name: 'Passport_Petrov_I.pdf', type: 'pdf', status: 'recognized', owner: 'Иван Петров' },
  { name: 'Bank_Statement.pdf', type: 'pdf', status: 'processing', owner: 'Иван Петров' },
  { name: 'Hotel_Booking.pdf', type: 'pdf', status: 'recognized', owner: 'Семья Петровых' },
  { name: 'Selfie_Front.jpg', type: 'image', status: 'recognized', owner: 'Иван Петров' },
];

const steps = [
  { label: 'Тип пакета', done: true },
  { label: 'Файлы', done: true },
  { label: 'Распознавание', done: false },
  { label: 'Анкета', done: false },
];

export function PreUploadScreen({ onBack }: PreUploadScreenProps) {
  const [packageType, setPackageType] = useState<PackageType>('family');

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-50 bg-[#101011] text-white flex flex-col overflow-hidden"
    >
      <header className="h-[64px] shrink-0 border-b border-[#202124] bg-[#141416]/95 backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] flex items-center justify-center text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Новый пакет</div>
          <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight leading-none mt-1">Загрузка и первичная сборка</h1>
        </div>
        <button
          onClick={onBack}
          className="ml-auto w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 scrollbar-thin scrollbar-thumb-white/10">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 lg:gap-6">
          <section className="space-y-5">
            <div className="p-5 lg:p-6 rounded-3xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#242529] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#6f64ff]/15 border border-[#6f64ff]/25 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide mb-3">
                    <Sparkles className="w-3.5 h-3.5" /> AI-assisted intake
                  </div>
                  <h2 className="text-[28px] lg:text-[36px] font-semibold tracking-tight text-white leading-[1.05] max-w-2xl">
                    Собери визовый пакет без ручной рутины
                  </h2>
                  <p className="text-[14px] text-white/50 leading-relaxed mt-3 max-w-2xl">
                    Загрузите паспорта, фото, выписки и бронирования. Система распознает данные, разложит файлы по заявителям и подсветит риски до отправки на проверку.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full lg:w-[320px]">
                  <button
                    onClick={() => setPackageType('family')}
                    className={`p-4 rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${packageType === 'family' ? 'bg-[#6f64ff]/15 border-[#6f64ff]/35' : 'bg-[#161617] border-[#242529] hover:border-[#2e2f34]'}`}
                  >
                    <Users className="w-5 h-5 text-[#b8baff] mb-3" />
                    <div className="text-[13px] font-semibold text-white">Семья</div>
                    <div className="text-[11px] text-white/40 mt-1">2+ заявителя</div>
                  </button>
                  <button
                    onClick={() => setPackageType('single')}
                    className={`p-4 rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${packageType === 'single' ? 'bg-[#6f64ff]/15 border-[#6f64ff]/35' : 'bg-[#161617] border-[#242529] hover:border-[#2e2f34]'}`}
                  >
                    <UserPlus className="w-5 h-5 text-[#b8baff] mb-3" />
                    <div className="text-[13px] font-semibold text-white">Один</div>
                    <div className="text-[11px] text-white/40 mt-1">1 заявитель</div>
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-dashed border-[#6f64ff]/40 bg-[#6f64ff]/5 p-6 lg:p-10 flex flex-col items-center justify-center text-center min-h-[260px] group hover:bg-[#6f64ff]/10 transition-colors cursor-pointer">
                <div className="w-16 h-16 rounded-2xl bg-[#6f64ff]/15 border border-[#6f64ff]/25 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-8 h-8 text-[#b8baff]" />
                </div>
                <h3 className="text-[18px] font-semibold text-white">Перетащи документы сюда</h3>
                <p className="text-[13px] text-white/45 leading-relaxed mt-2 max-w-md">
                  PDF, JPG, PNG. Лучше загружать всё одним набором: паспорта, фото, выписки, бронирования, справки.
                </p>
                <button className="mt-5 h-11 px-5 rounded-xl bg-white text-[#101011] text-[14px] font-semibold hover:bg-white/90 transition-colors">
                  Выбрать файлы
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-[#161617] border border-[#242529] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#242529] flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-white">Загруженные файлы</h3>
                  <p className="text-[12px] text-white/40 mt-1">Файлы уже разложены по вероятным владельцам.</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide">4 файла</span>
              </div>
              <div className="divide-y divide-[#242529]">
                {uploaded.map((file) => (
                  <div key={file.name} className="px-5 py-4 flex items-center gap-4 hover:bg-white/[0.03] transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-[#1e1e21] border border-[#242529] flex items-center justify-center shrink-0">
                      {file.type === 'pdf' ? <FileText className="w-5 h-5 text-white/50" /> : <ImageIcon className="w-5 h-5 text-white/50" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-white truncate">{file.name}</div>
                      <div className="text-[12px] text-white/40 mt-0.5">{file.owner}</div>
                    </div>
                    <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${file.status === 'recognized' ? 'bg-white/[0.045] border-white/10 text-[#b8baff]' : 'bg-white/[0.045] border-white/10 text-[#b8baff]'}`}>
                      {file.status === 'recognized' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ScanText className="w-3.5 h-3.5" />}
                      {file.status === 'recognized' ? 'Распознано' : 'OCR'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl bg-[#161617] border border-[#242529] p-5 sticky top-0">
              <h3 className="text-[14px] font-semibold text-white mb-4">Прогресс сборки</h3>
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.label} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[12px] font-semibold ${step.done ? 'bg-white/[0.045] border-white/10 text-[#b8baff]' : 'bg-white/5 border-white/10 text-white/40'}`}>
                      {step.done ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-medium ${step.done ? 'text-white' : 'text-white/50'}`}>{step.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-white/[0.045] border border-white/10">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-white/62 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[13px] font-semibold text-white/70">Нужна банковская выписка</div>
                    <p className="text-[12px] text-white/45 leading-relaxed mt-1">
                      OCR нашёл выписку, но сумма и дата не подтверждены. Попросите клиента загрузить свежий файл.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <Plane className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Страна</div>
                  <div className="text-[13px] font-medium text-white">Франция</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <Calendar className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Даты</div>
                  <div className="text-[13px] font-medium text-white">18 авг</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <FolderOpen className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Пакет</div>
                  <div className="text-[13px] font-medium text-white">{packageType === 'family' ? 'Семья' : 'Один'}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <ShieldCheck className="w-4 h-4 text-[#b8baff] mb-2" />
                  <div className="text-[11px] text-white/40">Готовность</div>
                  <div className="text-[13px] font-medium text-white">78%</div>
                </div>
              </div>

              <button className="mt-5 w-full h-11 rounded-xl bg-[#6f64ff] hover:bg-[#4855d4] text-white text-[14px] font-semibold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                Создать анкету <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </aside>
        </div>
      </main>
    </motion.div>
  );
}
