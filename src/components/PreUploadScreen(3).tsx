import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  UserPlus,
  Users,
  Plane,
  Calendar,
  ShieldCheck,
  FolderOpen,
  ArrowRight,
  X,
  ScanText,
  Loader2,
  FileX2,
  AlertTriangle,
  Database,
  Wand2,
  Clock3,
  RefreshCw,
} from 'lucide-react';

interface PreUploadScreenProps {
  onBack: () => void;
}

type PackageType = 'family' | 'single';

type IntakeFileStatus =
  | 'queued'
  | 'uploading'
  | 'extracting'
  | 'recognized'
  | 'review'
  | 'fake'
  | 'unreadable';

type IntakeFile = {
  name: string;
  type: 'pdf' | 'image';
  status: IntakeFileStatus;
  owner: string;
  progress: number;
  note: string;
};

type ExtractedField = {
  label: string;
  value: string;
  confidence: number;
  state: 'passed' | 'review' | 'blocked';
};

const uploaded: IntakeFile[] = [
  {
    name: 'Passport_Petrov_I.pdf',
    type: 'pdf',
    status: 'recognized',
    owner: 'Иван Петров',
    progress: 100,
    note: 'MRZ прочитана, паспортные поля готовы к анкете.',
  },
  {
    name: 'Passport_fake_photo.jpg',
    type: 'image',
    status: 'fake',
    owner: 'Не определён',
    progress: 100,
    note: 'Фото похоже на экран/монтаж. Нужен оригинальный снимок паспорта.',
  },
  {
    name: 'Passport_blur_scan.png',
    type: 'image',
    status: 'unreadable',
    owner: 'Анна Петрова',
    progress: 100,
    note: 'MRZ не распознана: сильное размытие и низкий контраст.',
  },
  {
    name: 'Bank_Statement.pdf',
    type: 'pdf',
    status: 'extracting',
    owner: 'Иван Петров',
    progress: 64,
    note: 'Извлекаем сумму, дату и имя владельца.',
  },
  {
    name: 'Hotel_Booking.pdf',
    type: 'pdf',
    status: 'review',
    owner: 'Семья Петровых',
    progress: 100,
    note: 'Найдена бронь, но даты расходятся с поездкой.',
  },
  {
    name: 'Selfie_Front.jpg',
    type: 'image',
    status: 'queued',
    owner: 'Иван Петров',
    progress: 0,
    note: 'Ожидает проверки после паспортов.',
  },
];

const extractedFields: ExtractedField[] = [
  { label: 'Фамилия', value: 'PETROV', confidence: 99, state: 'passed' },
  { label: 'Имя', value: 'IVAN', confidence: 98, state: 'passed' },
  { label: 'Номер паспорта', value: '76 4589123', confidence: 96, state: 'passed' },
  { label: 'Дата рождения', value: '12.05.1985', confidence: 94, state: 'passed' },
  { label: 'Срок действия', value: '18.11.2031', confidence: 91, state: 'review' },
  { label: 'Фото паспорта', value: 'требуется новый файл', confidence: 18, state: 'blocked' },
];

const pipeline = [
  'Загрузка файлов',
  'Проверка качества',
  'Поиск MRZ и зон документа',
  'Извлечение данных',
  'Сверка с анкетой',
  'Передача полей дальше',
];

const statusCopy: Record<
  IntakeFileStatus,
  {
    label: string;
    title: string;
    description: string;
    badgeClass: string;
    icon: typeof CheckCircle2;
  }
> = {
  queued: {
    label: 'В очереди',
    title: 'Файл ждёт обработки',
    description: 'Система начнёт проверку после приоритетных документов.',
    badgeClass: 'bg-white/[0.045] border-white/10 text-white/55',
    icon: Clock3,
  },
  uploading: {
    label: 'Загрузка',
    title: 'Файл загружается',
    description: 'Проверяем формат и готовим документ к распознаванию.',
    badgeClass: 'bg-[#6f64ff]/12 border-[#6f64ff]/25 text-[#b8baff]',
    icon: UploadCloud,
  },
  extracting: {
    label: 'Извлечение',
    title: 'Извлекаем данные',
    description: 'OCR читает документ, нормализует поля и ищет совпадения.',
    badgeClass: 'bg-[#6f64ff]/12 border-[#6f64ff]/25 text-[#b8baff]',
    icon: Loader2,
  },
  recognized: {
    label: 'Распознано',
    title: 'Данные готовы',
    description: 'Поля можно передать дальше в анкету без ручного ввода.',
    badgeClass: 'bg-emerald-400/10 border-emerald-300/20 text-emerald-200',
    icon: CheckCircle2,
  },
  review: {
    label: 'Замечание',
    title: 'Нужна проверка',
    description: 'Есть расхождение или низкая уверенность по части полей.',
    badgeClass: 'bg-amber-300/10 border-amber-200/25 text-amber-100',
    icon: AlertTriangle,
  },
  fake: {
    label: 'Фейк/скрин',
    title: 'Документ отклонён',
    description: 'Похоже на фото экрана, монтаж или неоригинальный файл.',
    badgeClass: 'bg-[#a35f69]/12 border-[#d59aa3]/25 text-[#ffb5c1]',
    icon: FileX2,
  },
  unreadable: {
    label: 'Не распознано',
    title: 'OCR не прочитал паспорт',
    description: 'Попросите новый скан: без бликов, размытости и обрезки MRZ.',
    badgeClass: 'bg-[#a35f69]/12 border-[#d59aa3]/25 text-[#ffb5c1]',
    icon: AlertCircle,
  },
};

const steps = [
  { label: 'Тип пакета', done: true },
  { label: 'Файлы', done: true },
  { label: 'Распознавание', done: true },
  { label: 'Замечания', done: false },
  { label: 'Анкета', done: false },
];

const visibleStateFilters: Array<{ label: string; value: IntakeFileStatus | 'all' }> = [
  { label: 'Все состояния', value: 'all' },
  { label: 'Извлечение', value: 'extracting' },
  { label: 'Фейк/скрин', value: 'fake' },
  { label: 'Не распознано', value: 'unreadable' },
  { label: 'Замечания', value: 'review' },
];

function statusIcon(status: IntakeFileStatus) {
  const Icon = statusCopy[status].icon;

  if (status === 'extracting' || status === 'uploading') {
    return <Icon className="w-3.5 h-3.5 animate-spin" />;
  }

  return <Icon className="w-3.5 h-3.5" />;
}

function progressLabel(file: IntakeFile) {
  if (file.status === 'fake') return 'Отклонён';
  if (file.status === 'unreadable') return 'Новый файл';
  if (file.status === 'review') return 'Проверить';
  if (file.status === 'recognized') return 'Передано';
  if (file.status === 'extracting') return `${file.progress}%`;
  return 'Ожидает';
}

export function PreUploadScreen({ onBack }: PreUploadScreenProps) {
  const [packageType, setPackageType] = useState<PackageType>('family');
  const [filter, setFilter] = useState<IntakeFileStatus | 'all'>('all');
  const [selectedFile, setSelectedFile] = useState<IntakeFile>(uploaded[1] as IntakeFile);

  const visibleFiles = filter === 'all' ? uploaded : uploaded.filter((file) => file.status === filter);
  const blockingCount = uploaded.filter((file) => file.status === 'fake' || file.status === 'unreadable').length;
  const reviewCount = uploaded.filter((file) => file.status === 'review').length;
  const readyFields = extractedFields.filter((field) => field.state === 'passed').length;

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
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 lg:gap-6">
          <section className="space-y-5">
            <div className="p-5 lg:p-6 rounded-3xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#242529] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#6f64ff]/15 border border-[#6f64ff]/25 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide mb-3">
                    <Sparkles className="w-3.5 h-3.5" /> AI-assisted intake
                  </div>
                  <h2 className="text-[28px] lg:text-[36px] font-semibold tracking-tight text-white leading-[1.05] max-w-2xl">
                    Загрузка паспорта с понятными состояниями
                  </h2>
                  <p className="text-[14px] text-white/50 leading-relaxed mt-3 max-w-2xl">
                    Система показывает, что происходит с каждым файлом: загрузка, OCR, извлечение данных, замечания, фейк-фото, нераспознанный паспорт и передача готовых полей дальше в анкету.
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

              <div className="rounded-3xl border border-dashed border-[#6f64ff]/40 bg-[#6f64ff]/5 p-6 lg:p-10 flex flex-col items-center justify-center text-center min-h-[260px] group hover:bg-[#6f64ff]/10 transition-colors cursor-pointer relative overflow-hidden">
                <motion.div
                  className="absolute inset-x-10 top-8 h-px bg-gradient-to-r from-transparent via-[#b8baff]/50 to-transparent"
                  animate={{ y: [0, 170, 0], opacity: [0.2, 0.9, 0.2] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="w-16 h-16 rounded-2xl bg-[#6f64ff]/15 border border-[#6f64ff]/25 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-8 h-8 text-[#b8baff]" />
                </div>
                <h3 className="text-[18px] font-semibold text-white">Перетащи паспорт или пакет документов</h3>
                <p className="text-[13px] text-white/45 leading-relaxed mt-2 max-w-md">
                  PDF, JPG, PNG. При фейк-фото, скрине экрана, размытии или нераспознанной MRZ пользователь сразу увидит понятное замечание.
                </p>
                <button className="mt-5 h-11 px-5 rounded-xl bg-white text-[#101011] text-[14px] font-semibold hover:bg-white/90 transition-colors">
                  Выбрать файлы
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-[#161617] border border-[#242529] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#242529] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-white">Загруженные файлы</h3>
                  <p className="text-[12px] text-white/40 mt-1">Клик по файлу показывает причину замечания и следующий шаг.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {visibleStateFilters.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setFilter(item.value)}
                      className={`h-8 px-3 rounded-full border text-[11px] font-medium transition-colors ${filter === item.value ? 'bg-[#6f64ff]/15 border-[#6f64ff]/35 text-[#b8baff]' : 'bg-white/[0.035] border-white/10 text-white/45 hover:text-white/70'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[#242529]">
                <AnimatePresence initial={false}>
                  {visibleFiles.map((file) => {
                    const active = selectedFile.name === file.name;
                    return (
                      <motion.button
                        key={file.name}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        onClick={() => setSelectedFile(file)}
                        className={`w-full text-left px-5 py-4 flex items-center gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${active ? 'bg-[#6f64ff]/8' : 'hover:bg-white/[0.03]'}`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#1e1e21] border border-[#242529] flex items-center justify-center shrink-0">
                          {file.type === 'pdf' ? <FileText className="w-5 h-5 text-white/50" /> : <ImageIcon className="w-5 h-5 text-white/50" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-[14px] font-medium text-white truncate">{file.name}</div>
                            <span className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${statusCopy[file.status].badgeClass}`}>
                              {statusIcon(file.status)}
                              {statusCopy[file.status].label}
                            </span>
                          </div>
                          <div className="text-[12px] text-white/40 mt-0.5">{file.owner}</div>
                          <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${file.status === 'fake' || file.status === 'unreadable' ? 'bg-[#d59aa3]' : file.status === 'review' ? 'bg-amber-200' : 'bg-[#6f64ff]'}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${file.progress}%` }}
                              transition={{ duration: 0.65, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                        <div className="hidden sm:block text-[12px] font-medium text-white/55 min-w-[78px] text-right">
                          {progressLabel(file)}
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-2xl bg-[#161617] border border-[#242529] p-5 overflow-hidden">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-white">Анимация извлечения данных</h3>
                    <p className="text-[12px] text-white/40 mt-1">Показывает, как поля проходят пайплайн до анкеты.</p>
                  </div>
                  <Wand2 className="w-5 h-5 text-[#b8baff]" />
                </div>
                <div className="space-y-3">
                  {pipeline.map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0.35, x: -10 }}
                      animate={{ opacity: [0.45, 1, 0.65], x: [0, 6, 0] }}
                      transition={{ duration: 2.2, delay: index * 0.18, repeat: Infinity, repeatDelay: 1.2 }}
                      className="flex items-center gap-3"
                    >
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center ${index < 4 ? 'bg-[#6f64ff]/12 border-[#6f64ff]/25 text-[#b8baff]' : 'bg-white/[0.045] border-white/10 text-white/50'}`}>
                        {index < 4 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-white/80">{item}</div>
                        <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-[#6f64ff]"
                            animate={{ width: index < 4 ? ['18%', '100%', '18%'] : ['0%', '72%', '0%'] }}
                            transition={{ duration: 2.2, delay: index * 0.18, repeat: Infinity, repeatDelay: 1.2 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#161617] border border-[#242529] p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-white">Извлечённые поля</h3>
                    <p className="text-[12px] text-white/40 mt-1">{readyFields} поля уже готовы к передаче дальше.</p>
                  </div>
                  <ScanText className="w-5 h-5 text-[#b8baff]" />
                </div>
                <div className="space-y-2">
                  {extractedFields.map((field, index) => (
                    <motion.div
                      key={field.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06 }}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-white/40">{field.label}</div>
                        <div className="text-[13px] font-medium text-white truncate">{field.value}</div>
                      </div>
                      <div className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-medium ${
                        field.state === 'passed'
                          ? 'bg-emerald-400/10 border-emerald-300/20 text-emerald-200'
                          : field.state === 'review'
                            ? 'bg-amber-300/10 border-amber-200/25 text-amber-100'
                            : 'bg-[#a35f69]/12 border-[#d59aa3]/25 text-[#ffb5c1]'
                      }`}
                      >
                        {field.state === 'passed' ? 'в анкету' : field.state === 'review' ? 'проверить' : 'стоп'}
                      </div>
                    </motion.div>
                  ))}
                </div>
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

              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedFile.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-6 p-4 rounded-2xl bg-white/[0.045] border border-white/10"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${statusCopy[selectedFile.status].badgeClass}`}>
                      {statusIcon(selectedFile.status)}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-white/80">{statusCopy[selectedFile.status].title}</div>
                      <p className="text-[12px] text-white/45 leading-relaxed mt-1">{selectedFile.note}</p>
                      <p className="text-[12px] text-white/35 leading-relaxed mt-2">{statusCopy[selectedFile.status].description}</p>
                    </div>
                  </div>

                  {(selectedFile.status === 'fake' || selectedFile.status === 'unreadable') && (
                    <button className="mt-4 w-full h-10 rounded-xl bg-[#d59aa3]/12 hover:bg-[#d59aa3]/18 border border-[#d59aa3]/20 text-[#ffced6] text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors">
                      <RefreshCw className="w-4 h-4" />
                      Запросить новый паспорт
                    </button>
                  )}
                </motion.div>
              </AnimatePresence>

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
                  <AlertTriangle className="w-4 h-4 text-[#ffced6] mb-2" />
                  <div className="text-[11px] text-white/40">Блокеры</div>
                  <div className="text-[13px] font-medium text-white">{blockingCount}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <ShieldCheck className="w-4 h-4 text-[#b8baff] mb-2" />
                  <div className="text-[11px] text-white/40">Замечания</div>
                  <div className="text-[13px] font-medium text-white">{reviewCount}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <FolderOpen className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Пакет</div>
                  <div className="text-[13px] font-medium text-white">{packageType === 'family' ? 'Семья' : 'Один'}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <Database className="w-4 h-4 text-[#b8baff] mb-2" />
                  <div className="text-[11px] text-white/40">Поля</div>
                  <div className="text-[13px] font-medium text-white">{readyFields}/6</div>
                </div>
              </div>

              <button
                disabled={blockingCount > 0}
                className={`mt-5 w-full h-11 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  blockingCount > 0
                    ? 'bg-white/[0.06] text-white/35 cursor-not-allowed'
                    : 'bg-[#6f64ff] hover:bg-[#4855d4] text-white shadow-[0_0_20px_rgba(58,69,180,0.25)]'
                }`}
              >
                {blockingCount > 0 ? 'Сначала закрыть замечания' : 'Передать поля дальше'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </aside>
        </div>
      </main>
    </motion.div>
  );
}
