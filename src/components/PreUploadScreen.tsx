import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Image as ImageIcon,
  Loader2,
  ScanText,
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
import type { PassportExtractionField } from '../modules/submissions/passportExtractionContract';

interface PreUploadScreenProps {
  onBack: () => void;
  onSaveDraft?: (draft: ProductIntakeDraft) => void;
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

function passportExtractionValues(fields: PassportExtractionField[]) {
  const values: Record<string, string> = {};

  for (const field of fields) {
    if (!field.value.trim()) continue;
    if (field.key === 'surname') values.surname = field.value;
    if (field.key === 'firstName') values.firstName = field.value;
    if (field.key === 'birthDate') values.birthDate = field.value;
    if (field.key === 'birthPlace') values.birthPlace = field.value;
    if (field.key === 'citizenship') values.nationality = field.value;
    if (field.key === 'gender') values.gender = field.value;
    if (field.key === 'passportType') values.passportType = field.value;
    if (field.key === 'passportNumber') values.passportNo = field.value;
    if (field.key === 'passportIssuedAt') values.passportIssuedAt = field.value;
    if (field.key === 'passportExpiresAt') values.passportExpiresAt = field.value;
    if (field.key === 'passportIssueCountry') values.passportIssueCountry = field.value;
    if (field.key === 'passportIssuePlace') values.passportIssuePlace = field.value;
  }

  return values;
}

export function PreUploadScreen({ onBack, onSaveDraft, onComplete, initialPackageType = 'family' }: PreUploadScreenProps) {
  const [packageType, setPackageType] = useState<ProductPackageType>(initialPackageType);
  const [phase, setPhase] = useState<ProductIntakePhase>('selecting');
  const [files, setFiles] = useState<ProductIntakeFile[]>([]);
  const [familyResidence, setFamilyResidence] = useState({
    russia: 'yes',
    spain: 'yes',
  });
  const [draftSeedIso, setDraftSeedIso] = useState(() => new Date().toISOString());
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [manualUpload, setManualUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pipelineRunRef = useRef(0);
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

  const extractPassportFile = async (file: ProductIntakeFile, applicantIndex: number, runId: number) => {
    const uploadFile = file.fileRef;
    if (!uploadFile) {
      patchFile(file.id, {
        status: 'needs_review',
        progress: 100,
        issue: 'Файл паспорта не доступен для локального OCR. Проверьте данные вручную.',
      });
      return;
    }

    try {
      const { invokePassportExtraction } = await import('../modules/submissions/passportExtractionService');
      const result = await invokePassportExtraction({
        applicantIndex,
        localFile: uploadFile,
        openAiFallbackAllowed: false,
      });
      if (pipelineRunRef.current !== runId) return;

      const extractedValues = passportExtractionValues(result.fields);
      const hasPassportIdentity = Boolean(
        extractedValues.passportNo || extractedValues.surname || extractedValues.firstName,
      );

      patchFile(file.id, {
        extractedFieldKeys: result.fields.map((field) => field.key),
        extractedValues,
        issue:
          result.status === 'extracted' && hasPassportIdentity
            ? result.summary
            : 'OCR не подтвердил паспортные поля. Проверьте данные вручную.',
        progress: 100,
        status:
          result.status === 'extracted' && hasPassportIdentity
            ? 'recognized'
            : 'needs_review',
      });
    } catch {
      if (pipelineRunRef.current !== runId) return;
      patchFile(file.id, {
        status: 'needs_review',
        progress: 100,
        issue: 'OCR паспорта не завершился. Проверьте данные вручную.',
      });
    }
  };

  const runPipeline = (sourceFiles = files, options: { extractPassports?: boolean } = {}) => {
    clearPipeline();
    const runId = pipelineRunRef.current + 1;
    pipelineRunRef.current = runId;
    const queued = resetFilesForPipeline(sourceFiles);
    setFiles(queued);
    setPhase('uploading');
    setActiveFileId(queued[0]?.id ?? null);

    queued.forEach((file, index) => {
      const offset = index * 520;
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        setPhase('uploading');
        setActiveFileId(file.id);
        patchFile(file.id, { status: 'uploading', progress: 34 });
      }, offset + 80);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        patchFile(file.id, { status: 'uploaded', progress: 62 });
      }, offset + 260);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        setPhase('extracting');
        setActiveFileId(file.id);
        patchFile(file.id, { status: 'extracting', progress: 86 });
        if (options.extractPassports && file.kind === 'passport') {
          void extractPassportFile(file, index, runId);
        }
      }, offset + 430);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        if (options.extractPassports && file.kind === 'passport') return;
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

    if (!options.extractPassports) {
      const tail = Math.max(queued.length * 520 + 900, 1200);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        setActiveFileId(null);
        setPhase('review');
      }, tail);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        setPhase('ready');
      }, tail + 620);
    }
  };

  const resetScenario = (nextType: ProductPackageType) => {
    clearPipeline();
    pipelineRunRef.current += 1;
    setPackageType(nextType);
    setManualUpload(false);
    setDraftSeedIso(new Date().toISOString());
    setFiles([]);
    setActiveFileId(null);
    setPhase('selecting');
  };

  const handleFiles = (fileList: FileList | File[]) => {
    const nextFiles = createBrowserIntakeFiles(Array.from(fileList), packageType);
    if (!nextFiles.length) return;

    setManualUpload(true);
    setDraftSeedIso(new Date().toISOString());
    runPipeline(nextFiles, { extractPassports: true });
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

  const saveDraft = () => {
    onSaveDraft?.(buildProductIntakeDraft(packageType, files, draftSeedIso));
  };

  useEffect(() => {
    return clearPipeline;
  }, []);

  useEffect(() => {
    if (!manualUpload || files.length === 0) return;
    if (!files.every((file) => finalStatuses.includes(file.status))) return;
    setActiveFileId(null);
    setPhase('ready');
  }, [files, manualUpload]);

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
          className="w-10 h-10 rounded-[6px] bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors"
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

              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-6 relative z-10">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#6f64ff]/25 bg-[#6f64ff]/15 text-[#b8baff]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="w-full space-y-3 lg:w-[420px]">
                  <div className="grid grid-cols-2 gap-2">
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

                  {packageType === 'family' ? (
                    <div className="space-y-2 rounded-2xl border border-[#242529] bg-[#141416]/70 p-3">
                      {[
                        ['russia', 'У вас одинаковый адрес проживания в России?'],
                        ['spain', 'В Испании?'],
                      ].map(([key, question]) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-medium text-white/70">{question}</span>
                          <div className="flex shrink-0 overflow-hidden rounded-[8px] border border-white/10 bg-white/[0.035]">
                            {[
                              ['yes', 'Да'],
                              ['no', 'Нет'],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setFamilyResidence((current) => ({ ...current, [key]: value }))}
                                className={`h-8 px-2.5 text-[11px] font-medium transition-colors ${familyResidence[key as keyof typeof familyResidence] === value ? 'bg-[#6f64ff]/25 text-[#d7d5ff]' : 'text-white/45 hover:text-white/70'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
                  className="mt-5 h-11 px-5 rounded-[8px] bg-white text-[#101011] text-[14px] font-semibold hover:bg-white/90 transition-colors"
                >
                  Выбрать файлы
                </button>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" className="hidden" onChange={handleFileInput} />
              </div>

              {files.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-[#242529] bg-[#161617]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#242529] px-4 py-3">
                    <div>
                      <h3 className="text-[14px] font-semibold text-white">Загруженные файлы</h3>
                      <p className="mt-0.5 text-[12px] text-white/40">Статус OCR и фактические поля из выбранных документов.</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[#b8baff]">
                      {completedCount}/{files.length} готово
                    </span>
                  </div>

                  <div className="divide-y divide-[#242529]">
                    <AnimatePresence initial={false}>
                      {files.map((file) => (
                        <motion.div
                          layout
                          key={file.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className={`flex items-center gap-3 px-4 py-3 ${activeFileId === file.id ? 'bg-[#6f64ff]/[0.07]' : ''}`}
                        >
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#242529] bg-[#1e1e21]">
                            {fileIcon(file)}
                            {['uploading', 'extracting'].includes(file.status) ? (
                              <motion.div
                                className="absolute inset-0 bg-[#6f64ff]/10"
                                animate={{ opacity: [0.1, 0.35, 0.1] }}
                                transition={{ duration: 0.9, repeat: Infinity }}
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="truncate text-[14px] font-medium text-white">{file.name}</div>
                              <span className="hidden rounded-md border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[10px] text-white/45 sm:inline">
                                {productFileKindLabels[file.kind]}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[12px] text-white/40">
                              {file.extractedFieldKeys.length} полей · {file.issue ?? 'Ошибок OCR не получено'}
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                              <motion.div
                                initial={false}
                                animate={{ width: `${file.progress}%` }}
                                transition={{ duration: 0.28 }}
                                className="h-full rounded-full bg-[#6f64ff]"
                              />
                            </div>
                          </div>
                          <div className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClass(file.status)}`}>
                            {file.status === 'recognized' && <CheckCircle2 className="h-3.5 w-3.5" />}
                            {file.status === 'needs_review' && <AlertCircle className="h-3.5 w-3.5" />}
                            {file.status === 'failed' && <X className="h-3.5 w-3.5" />}
                            {['uploading', 'extracting'].includes(file.status) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {file.status === 'queued' && <Database className="h-3.5 w-3.5" />}
                            {productFileStatusLabels[file.status]}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={saveDraft}
                  className="h-11 rounded-[8px] border border-[#242529] bg-[#1e1e21] px-3 text-[13px] font-medium text-white/75 transition-colors hover:bg-[#27272b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                >
                  Сохранить черновик
                </button>
                <button
                  type="button"
                  onClick={completeDraft}
                  disabled={phase !== 'ready'}
                  className="h-11 rounded-[8px] bg-[#6f64ff] px-3 text-[13px] font-semibold text-white shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors hover:bg-[#4855d4] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Далее
                </button>
              </div>
            </motion.div>
          </section>

          <aside className="space-y-5">
            <div className="hidden rounded-2xl bg-[#161617] border border-[#242529] p-5 sticky top-0 overflow-hidden xl:block">
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

              <button
                onClick={completeDraft}
                disabled={phase !== 'ready'}
                className="mt-5 w-full h-11 rounded-[8px] bg-[#6f64ff] hover:bg-[#4855d4] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-white text-[14px] font-semibold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
