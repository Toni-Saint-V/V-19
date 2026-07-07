import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Database,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Plane,
  ScanText,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import {
  buildProductIntakeDraft,
  createBrowserIntakeFiles,
  createDemoIntakeFiles,
  getPrefillPreviewFields,
  productFileKindLabels,
  productFileStatusLabels,
  productIntakePhaseLabel,
  resetFilesForPipeline,
  type ProductFileStatus,
  type ProductIntakeDraft,
  type ProductIntakeFile,
  type ProductIntakePhase,
  type ProductPackageType,
} from '../modules/submissions/productIntakeFlow';

interface PreUploadScreenProps {
  onBack: () => void;
  onComplete?: (draft: ProductIntakeDraft) => void;
  initialPackageType?: ProductPackageType;
}

const finalStatuses: ProductFileStatus[] = ['recognized', 'needs_review', 'failed'];

const stepCopy: Array<{ key: ProductIntakePhase; label: string }> = [
  { key: 'selecting', label: 'Тип пакета' },
  { key: 'uploading', label: 'Файлы' },
  { key: 'extracting', label: 'Распознавание' },
  { key: 'review', label: 'Сверка' },
  { key: 'ready', label: 'Анкета' },
];

function statusClass(status: ProductFileStatus) {
  switch (status) {
    case 'recognized':
      return 'bg-white/[0.045] border-white/10 text-[#b8baff]';
    case 'needs_review':
      return 'bg-[#6f64ff]/10 border-[#6f64ff]/20 text-white/70';
    case 'failed':
      return 'bg-[#2a1d20]/70 border-[#4e2c33] text-[#d59aa3]';
    case 'uploading':
    case 'extracting':
      return 'bg-[#6f64ff]/15 border-[#6f64ff]/25 text-[#b8baff]';
    default:
      return 'bg-white/[0.035] border-white/10 text-white/52';
  }
}

function fileIcon(file: ProductIntakeFile) {
  if (file.kind === 'photo') return <ImageIcon className="w-5 h-5 text-white/55" />;
  if (file.status === 'extracting') return <ScanText className="w-5 h-5 text-[#b8baff]" />;
  return <FileText className="w-5 h-5 text-white/55" />;
}

function visibleStepIndex(phase: ProductIntakePhase) {
  switch (phase) {
    case 'uploading':
      return 1;
    case 'extracting':
      return 2;
    case 'review':
      return 3;
    case 'ready':
      return 4;
    default:
      return 0;
  }
}

export function PreUploadScreen({ onBack, onComplete, initialPackageType = 'family' }: PreUploadScreenProps) {
  const [packageType, setPackageType] = useState<ProductPackageType>(initialPackageType);
  const [phase, setPhase] = useState<ProductIntakePhase>('selecting');
  const [files, setFiles] = useState<ProductIntakeFile[]>(() => createDemoIntakeFiles(initialPackageType));
  const [draftSeedIso, setDraftSeedIso] = useState(() => new Date().toISOString());
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [manualUpload, setManualUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<number[]>([]);

  const draft = useMemo(
    () => buildProductIntakeDraft(packageType, files, draftSeedIso),
    [draftSeedIso, files, packageType],
  );

  const completedCount = files.filter((file) => finalStatuses.includes(file.status)).length;
  const recognizedCount = files.filter((file) => file.status === 'recognized').length;
  const averageProgress = files.length
    ? Math.round(files.reduce((sum, file) => sum + file.progress, 0) / files.length)
    : 0;
  const activeStepIndex = visibleStepIndex(phase);
  const previewFields = getPrefillPreviewFields(draft).filter((field) => {
    const sourceReady = files.some(
      (file) => file.kind === field.sourceKind && ['recognized', 'needs_review'].includes(file.status),
    );
    return phase === 'ready' || phase === 'review' || sourceReady;
  });

  const clearPipeline = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  };

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  };

  const patchFile = (fileId: string, patch: Partial<ProductIntakeFile>) => {
    setFiles((current) => current.map((file) => (file.id === fileId ? { ...file, ...patch } : file)));
  };

  const runPipeline = (sourceFiles = files) => {
    clearPipeline();
    const queued = resetFilesForPipeline(sourceFiles);
    setFiles(queued);
    setPhase('uploading');
    setActiveFileId(queued[0]?.id ?? null);

    queued.forEach((file, index) => {
      const offset = index * 520;
      schedule(() => {
        setPhase('uploading');
        setActiveFileId(file.id);
        patchFile(file.id, { status: 'uploading', progress: 34 });
      }, offset + 80);
      schedule(() => patchFile(file.id, { status: 'uploaded', progress: 62 }), offset + 260);
      schedule(() => {
        setPhase('extracting');
        setActiveFileId(file.id);
        patchFile(file.id, { status: 'extracting', progress: 86 });
      }, offset + 430);
      schedule(() => {
        const finalStatus: ProductFileStatus = file.kind === 'unknown' ? 'failed' : file.kind === 'bank' ? 'needs_review' : 'recognized';
        patchFile(file.id, {
          status: finalStatus,
          progress: 100,
          issue:
            finalStatus === 'needs_review'
              ? file.issue ?? 'Проверьте дату и сумму по выписке'
              : finalStatus === 'failed'
                ? file.issue ?? 'Файл не классифицирован'
                : undefined,
        });
      }, offset + 760);
    });

    const tail = Math.max(queued.length * 520 + 900, 1200);
    schedule(() => {
      setActiveFileId(null);
      setPhase('review');
    }, tail);
    schedule(() => setPhase('ready'), tail + 620);
  };

  const resetScenario = (nextType: ProductPackageType) => {
    const nextFiles = createDemoIntakeFiles(nextType);
    setPackageType(nextType);
    setManualUpload(false);
    setDraftSeedIso(new Date().toISOString());
    runPipeline(nextFiles);
  };

  const handleFiles = (fileList: FileList | File[]) => {
    const nextFiles = createBrowserIntakeFiles(Array.from(fileList), packageType);
    if (!nextFiles.length) return;

    setManualUpload(true);
    setDraftSeedIso(new Date().toISOString());
    runPipeline(nextFiles);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) handleFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    if (event.dataTransfer.files?.length) handleFiles(event.dataTransfer.files);
  };

  const completeDraft = () => {
    if (phase !== 'ready') return;
    onComplete?.(buildProductIntakeDraft(packageType, files, draftSeedIso));
  };

  useEffect(() => {
    schedule(() => runPipeline(createDemoIntakeFiles(initialPackageType)), 360);
    return clearPipeline;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.992 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
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
          <div className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Новый пакет · live intake</div>
          <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight leading-none mt-1">Загрузка и первичная сборка</h1>
        </div>
        <div className="ml-auto hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[12px] text-white/55">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8fa3ff] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8fa3ff]" />
          </span>
          {productIntakePhaseLabel(phase)} · {averageProgress}%
        </div>
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 scrollbar-thin scrollbar-thumb-white/10">
        <div className="max-w-[1320px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-5 lg:gap-6">
          <section className="space-y-5">
            <motion.div
              layout
              className="relative overflow-hidden p-5 lg:p-6 rounded-3xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#242529] shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#6f64ff]/10 blur-3xl"
                animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.8, 0.55] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />

              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6 relative z-10">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#6f64ff]/15 border border-[#6f64ff]/25 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide mb-3">
                    <Sparkles className="w-3.5 h-3.5" /> AI-assisted intake
                  </div>
                  <h2 className="text-[28px] lg:text-[36px] font-semibold tracking-tight text-white leading-[1.05] max-w-2xl">
                    Система собирает пакет, извлекает поля и готовит анкету
                  </h2>
                  <p className="text-[14px] text-white/50 leading-relaxed mt-3 max-w-2xl">
                    Поток теперь живой: файлы проходят загрузку, OCR, классификацию, риск-сверку и передают извлечённые значения в следующий экран анкеты.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full lg:w-[320px]">
                  <button
                    onClick={() => resetScenario('family')}
                    className={`p-4 rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${packageType === 'family' ? 'bg-[#6f64ff]/15 border-[#6f64ff]/35 shadow-[0_0_24px_rgba(111,100,255,0.12)]' : 'bg-[#161617] border-[#242529] hover:border-[#2e2f34]'}`}
                  >
                    <Users className="w-5 h-5 text-[#b8baff] mb-3" />
                    <div className="text-[13px] font-semibold text-white">Семья</div>
                    <div className="text-[11px] text-white/40 mt-1">2+ заявителя</div>
                  </button>
                  <button
                    onClick={() => resetScenario('single')}
                    className={`p-4 rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${packageType === 'single' ? 'bg-[#6f64ff]/15 border-[#6f64ff]/35 shadow-[0_0_24px_rgba(111,100,255,0.12)]' : 'bg-[#161617] border-[#242529] hover:border-[#2e2f34]'}`}
                  >
                    <UserPlus className="w-5 h-5 text-[#b8baff] mb-3" />
                    <div className="text-[13px] font-semibold text-white">Один</div>
                    <div className="text-[11px] text-white/40 mt-1">1 заявитель</div>
                  </button>
                </div>
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={handleDrop}
                className={`relative rounded-3xl border border-dashed p-6 lg:p-10 flex flex-col items-center justify-center text-center min-h-[258px] group transition-colors cursor-pointer overflow-hidden ${dropActive ? 'border-[#8fa3ff] bg-[#6f64ff]/[0.14]' : 'border-[#6f64ff]/40 bg-[#6f64ff]/5 hover:bg-[#6f64ff]/10'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <motion.div
                  aria-hidden
                  className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#b8baff]/70 to-transparent"
                  animate={{ y: [0, 250, 0], opacity: [0.1, 0.9, 0.1] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="w-16 h-16 rounded-2xl bg-[#6f64ff]/15 border border-[#6f64ff]/25 flex items-center justify-center mb-5"
                  animate={{ scale: phase === 'extracting' ? [1, 1.06, 1] : 1, rotate: dropActive ? 2 : 0 }}
                  transition={{ duration: 1.2, repeat: phase === 'extracting' ? Infinity : 0 }}
                >
                  {phase === 'extracting' ? <Wand2 className="w-8 h-8 text-[#b8baff]" /> : <UploadCloud className="w-8 h-8 text-[#b8baff]" />}
                </motion.div>
                <h3 className="text-[18px] font-semibold text-white">
                  {manualUpload ? 'Заменить набор файлов' : 'Перетащи документы сюда'}
                </h3>
                <p className="text-[13px] text-white/45 leading-relaxed mt-2 max-w-md">
                  PDF, JPG, PNG. После выбора файлы автоматически пройдут upload → OCR → prefill mapping.
                </p>
                <button
                  type="button"
                  className="mt-5 h-11 px-5 rounded-xl bg-white text-[#101011] text-[14px] font-semibold hover:bg-white/90 transition-colors"
                >
                  Выбрать файлы
                </button>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" className="hidden" onChange={handleFileInput} />
              </div>
            </motion.div>

            <motion.div layout className="rounded-2xl bg-[#161617] border border-[#242529] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#242529] flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-white">Загруженные файлы</h3>
                  <p className="text-[12px] text-white/40 mt-1">Каждый файл проходит отдельную машинную ветку и отдаёт поля в prefill.</p>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide">
                  {completedCount}/{files.length} готово
                </span>
              </div>

              <div className="divide-y divide-[#242529]">
                <AnimatePresence initial={false}>
                  {files.map((file, index) => (
                    <motion.div
                      layout
                      key={file.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ delay: index * 0.025, duration: 0.2 }}
                      className={`px-5 py-4 flex items-center gap-4 transition-colors ${activeFileId === file.id ? 'bg-[#6f64ff]/[0.07]' : 'hover:bg-white/[0.03]'}`}
                    >
                      <div className="relative w-10 h-10 rounded-xl bg-[#1e1e21] border border-[#242529] flex items-center justify-center shrink-0 overflow-hidden">
                        {fileIcon(file)}
                        {['uploading', 'extracting'].includes(file.status) && (
                          <motion.div
                            className="absolute inset-0 bg-[#6f64ff]/10"
                            animate={{ opacity: [0.1, 0.35, 0.1] }}
                            transition={{ duration: 0.9, repeat: Infinity }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-[14px] font-medium text-white truncate">{file.name}</div>
                          <span className="hidden md:inline px-1.5 py-0.5 rounded-md bg-white/[0.035] border border-white/10 text-[10px] text-white/45">
                            {productFileKindLabels[file.kind]}
                          </span>
                        </div>
                        <div className="text-[12px] text-white/40 mt-0.5 truncate">{file.ownerName ?? 'Владелец будет определён'} · {file.extractedFieldKeys.length} полей</div>
                        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={false}
                            animate={{ width: `${file.progress}%` }}
                            transition={{ duration: 0.28 }}
                            className="h-full rounded-full bg-[#6f64ff]"
                          />
                        </div>
                      </div>
                      <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${statusClass(file.status)}`}>
                        {file.status === 'recognized' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {file.status === 'needs_review' && <AlertCircle className="w-3.5 h-3.5" />}
                        {file.status === 'failed' && <X className="w-3.5 h-3.5" />}
                        {['uploading', 'extracting'].includes(file.status) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {file.status === 'queued' && <Database className="w-3.5 h-3.5" />}
                        {productFileStatusLabels[file.status]}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl bg-[#161617] border border-[#242529] p-5 sticky top-0 overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-[14px] font-semibold text-white">Прогресс сборки</h3>
                <span className="text-[12px] text-white/45">{averageProgress}%</span>
              </div>
              <div className="space-y-4">
                {stepCopy.map((step, index) => {
                  const done = index < activeStepIndex || phase === 'ready';
                  const active = index === activeStepIndex && phase !== 'ready';
                  return (
                    <motion.div key={step.key} className="flex items-center gap-3" animate={{ opacity: done || active ? 1 : 0.55 }}>
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[12px] font-semibold ${done ? 'bg-white/[0.045] border-white/10 text-[#b8baff]' : active ? 'bg-[#6f64ff]/15 border-[#6f64ff]/25 text-[#b8baff]' : 'bg-white/5 border-white/10 text-white/40'}`}>
                        {done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Loader2 className="w-4 h-4 animate-spin" /> : index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-medium ${done || active ? 'text-white' : 'text-white/50'}`}>{step.label}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-white/[0.045] border border-white/10">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-white/62 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[13px] font-semibold text-white/75">{draft.statusLabel}</div>
                    <p className="text-[12px] text-white/45 leading-relaxed mt-1">
                      {draft.issues[0]?.description ?? 'Критичных расхождений нет. Можно переходить к автозаполненной анкете.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <Plane className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Страна</div>
                  <div className="text-[13px] font-medium text-white">{draft.country}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <Calendar className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Даты</div>
                  <div className="text-[13px] font-medium text-white truncate">{draft.tripDates.split('–')[0]?.trim() ?? draft.tripDates}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <FolderOpen className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Пакет</div>
                  <div className="text-[13px] font-medium text-white">{packageType === 'family' ? 'Семья' : 'Один'}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1d] border border-[#242529]">
                  <ShieldCheck className="w-4 h-4 text-[#b8baff] mb-2" />
                  <div className="text-[11px] text-white/40">Готовность</div>
                  <motion.div initial={false} animate={{ opacity: [0.6, 1] }} className="text-[13px] font-medium text-white">{draft.readyPercent}%</motion.div>
                </div>
              </div>

              <button
                onClick={completeDraft}
                disabled={phase !== 'ready'}
                className="mt-5 w-full h-11 rounded-xl bg-[#6f64ff] hover:bg-[#4855d4] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-white text-[14px] font-semibold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {phase === 'ready' ? 'Перейти в анкету' : 'Идёт извлечение'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#161617] border border-[#242529] p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-[14px] font-semibold text-white">Prefill-поля</h3>
                  <p className="text-[12px] text-white/40 mt-1">Данные, которые уйдут в анкету.</p>
                </div>
                <span className="text-[11px] text-white/45">{recognizedCount} OCR</span>
              </div>

              <div className="space-y-2 min-h-[120px]">
                <AnimatePresence mode="popLayout">
                  {previewFields.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-[12px] leading-relaxed text-white/42"
                    >
                      Поля появятся здесь по мере распознавания паспорта, брони и финансовых документов.
                    </motion.div>
                  ) : (
                    previewFields.map((field, index) => (
                      <motion.div
                        layout
                        key={`${field.key}-${field.sourceFileName ?? index}`}
                        initial={{ opacity: 0, x: 16, scale: 0.98 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -12, scale: 0.98 }}
                        transition={{ delay: index * 0.025 }}
                        className={`rounded-2xl border p-3 ${field.state === 'warning' ? 'border-[#6f64ff]/25 bg-[#6f64ff]/[0.08]' : 'border-[#242529] bg-[#1a1a1d]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10.5px] uppercase tracking-wider text-white/38 font-medium">{field.label}</div>
                            <div className="mt-1 text-[13px] font-medium text-white truncate">{field.value}</div>
                            <div className="mt-1 text-[11px] text-white/35 truncate">{field.sourceFileName ?? productFileKindLabels[field.sourceKind]}</div>
                          </div>
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-[#b8baff]">
                            {Math.round(field.confidence * 100)}%
                          </span>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </motion.div>
  );
}
