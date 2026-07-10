import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
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
const passportExtractionTimeoutMs = 30000;

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
  const activeFileName = useMemo(
    () => files.find((file) => file.id === activeFileId)?.name,
    [activeFileId, files],
  );

  const recognizedCount = files.filter((file) => file.status === 'recognized').length;
  const averageProgress = files.length
    ? Math.round(files.reduce((sum, file) => sum + file.progress, 0) / files.length)
    : 0;
  const previewFields = getPrefillPreviewFields(draft).filter((field) => {
    const sourceReady = files.some(
      (file) => file.kind === field.sourceKind && ['recognized', 'needs_review'].includes(file.status),
    );
    return phase === 'ready' || phase === 'review' || sourceReady;
  });
  const showExtractionStatus = files.length > 0 && packageType === 'family';
  const hasRecognizedFiles = recognizedCount > 0;
  const filesAreFinal = files.length > 0 && files.every((file) => finalStatuses.includes(file.status));
  const extractionIsDone = phase === 'ready' && filesAreFinal && hasRecognizedFiles && previewFields.length > 0;
  const canContinueToQuestionnaire = extractionIsDone;
  const extractionNeedsReview =
    filesAreFinal &&
    ['review', 'ready'].includes(phase) &&
    !canContinueToQuestionnaire;
  const extractionStatusText = extractionIsDone
    ? 'Успешно распознано'
    : extractionNeedsReview
      ? 'Нужна ручная сверка'
      : 'Идет распознавание документа';
  const completeBlocked = !canContinueToQuestionnaire;

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
      const result = await Promise.race([
        invokePassportExtraction({
          applicantIndex,
          localFile: uploadFile,
          openAiFallbackAllowed: false,
        }),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('Passport OCR timeout')), passportExtractionTimeoutMs),
        ),
      ]);
      if (pipelineRunRef.current !== runId) return;

      const extractedValues = passportExtractionValues(result.fields);
      const hasPassportIdentity = Boolean(
        extractedValues.passportNo || extractedValues.surname || extractedValues.firstName,
      );

      patchFile(file.id, {
        kind: result.status === 'extracted' && hasPassportIdentity ? 'passport' : file.kind,
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
        if (options.extractPassports && ['passport', 'unknown'].includes(file.kind)) {
          void extractPassportFile(file, index, runId);
        }
      }, offset + 430);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        if (options.extractPassports && ['passport', 'unknown'].includes(file.kind)) return;
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
    if (!canContinueToQuestionnaire) return;
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
    setPhase(files.some((file) => file.status === 'recognized') ? 'ready' : 'review');
  }, [files, manualUpload]);

  return (
    <motion.div
      aria-labelledby="create-submission-title"
      aria-modal="true"
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.992 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-[#101011] text-white flex flex-col overflow-hidden"
      role="dialog"
    >
      <header className="h-[64px] shrink-0 border-b border-[#202124] bg-[#141416]/95 backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
        <button
          aria-label="Назад"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#242529] bg-[#1e1e21] text-white/70 transition-colors hover:bg-[#27272b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>
        <div>
          <h1
            className="text-[19px] lg:text-[21px] font-semibold tracking-tight leading-none mt-1"
            id="create-submission-title"
          >
            Новая подача
          </h1>
        </div>
        <button
          aria-label="Закрыть создание"
          onClick={onBack}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-[9px] border border-transparent bg-transparent text-white/45 transition-colors hover:text-white/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <main className="h-[calc(100dvh-64px)] flex-1 min-h-0 overflow-hidden p-0">
        <div className="grid h-full min-h-full w-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] xl:gap-6 xl:p-6">
          <section className="flex h-full min-h-0 flex-col">
            <motion.div
              className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-gradient-to-br from-[#1a1a1d] to-[#141416] px-5 pb-0 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] lg:px-6 lg:pb-0 lg:pt-6 xl:rounded-3xl xl:border xl:border-[#242529]"
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#6f64ff]/10 blur-3xl"
                animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.8, 0.55] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="v19-preupload-progress-indicator">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8fa3ff] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8fa3ff]" />
                </span>
                {productIntakePhaseLabel(phase)} · {averageProgress}%
              </div>

              <div className="relative z-10 mb-4 shrink-0 flex justify-center">
                <div className="relative w-full max-w-[560px] space-y-3">
                  <div className="mx-auto flex w-fit rounded-full border border-[#242529] bg-[#141416]/76 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
                    {[
                      { icon: Users, label: 'Семья', type: 'family' as const },
                      { icon: UserPlus, label: 'Один', type: 'single' as const },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = packageType === item.type;

                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => resetScenario(item.type)}
                          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${
                            active
                              ? 'bg-[#6f64ff]/24 text-white shadow-[0_0_18px_rgba(111,100,255,0.18)]'
                              : 'text-white/46 hover:bg-white/[0.04] hover:text-white/70'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 text-[#b8baff]" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    {extractionIsDone ? (
                      <motion.div
                        key="recognized-fields-status"
                        initial={{ opacity: 0, y: 8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.985 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="flex h-[96px] items-center rounded-2xl border border-[#242529] bg-[#141416]/78 px-4 shadow-[0_18px_44px_rgba(0,0,0,0.24)]"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold text-white">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#34d399]" />
                          <span className="truncate">Успешно распознано</span>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/55">
                          {previewFields.length} полей справа
                        </span>
                      </motion.div>
                    ) : packageType === 'family' ? (
                      <motion.div
                        key="family-controls"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        className="h-[96px] space-y-2 rounded-2xl border border-[#242529] bg-[#141416]/70 p-3"
                      >
                        {showExtractionStatus ? (
                          <div className="min-h-[42px] overflow-hidden">
                            <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                              <motion.span
                                className="h-2 w-2 rounded-full bg-[#8fa3ff]"
                                animate={{ scale: [1, 1.45, 1], opacity: [0.55, 1, 0.55] }}
                                transition={{ duration: 1, repeat: Infinity }}
                              />
                              <span>
                                {extractionStatusText.split('').map((letter, index) => (
                                  <motion.span
                                    key={`${letter}-${index}`}
                                    initial={{ opacity: 0.25, y: 3 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.018, duration: 0.18 }}
                                  >
                                    {letter}
                                  </motion.span>
                                ))}
                              </span>
                            </div>
                          </div>
                        ) : (
                          [
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
                          ))
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="single-spacer"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-[96px]"
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={handleDrop}
                className={`relative mt-4 min-h-[180px] flex-1 rounded-3xl border border-dashed p-6 lg:p-8 flex flex-col items-center justify-center text-center group transition-colors cursor-pointer overflow-hidden ${dropActive ? 'border-[#8fa3ff] bg-[#6f64ff]/[0.14]' : 'border-[#6f64ff]/40 bg-[#6f64ff]/5 hover:bg-[#6f64ff]/10'}`}
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
                  {activeFileName ? ` Сейчас обрабатывается: ${activeFileName}.` : ''}
                </p>
                <button
                  type="button"
                  className="v19-file-picker-button mt-5"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Выбрать файлы
                </button>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" className="hidden" onChange={handleFileInput} />
              </div>

              <div className="sticky bottom-0 z-20 -mx-5 mt-4 grid shrink-0 grid-cols-2 gap-2 border-t border-white/[0.06] bg-gradient-to-t from-[#141416] via-[#141416]/95 to-[#141416]/70 px-5 pb-4 pt-3 lg:-mx-6 lg:px-6 xl:rounded-b-3xl">
                <button
                  type="button"
                  onClick={saveDraft}
                  className="h-11 rounded-[8px] border border-white/10 bg-transparent px-3 text-[13px] font-medium text-white/62 transition-colors hover:border-white/18 hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                >
                  Сохранить черновик
                </button>
                <button
                  type="button"
                  onClick={completeDraft}
                  aria-disabled={completeBlocked}
                  disabled={completeBlocked}
                  className="h-11 rounded-[8px] bg-[#3a45b4] px-3 text-[13px] font-semibold text-white shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors hover:bg-[#4855d4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:bg-[#25252a] disabled:text-white/35 disabled:shadow-none"
                >
                  Далее
                </button>
              </div>
            </motion.div>
          </section>

          <aside className="min-h-0 space-y-5">
            <div className="sticky top-0 hidden overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] p-5 xl:flex xl:h-[calc(100dvh-112px)] xl:max-h-[calc(100dvh-112px)] xl:flex-col">
              <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-white">Prefill-поля</h3>
                  <p className="text-[12px] text-white/40 mt-1">Значения, которые удалось взять из OCR.</p>
                </div>
                <span className="text-[11px] text-white/45">{recognizedCount} OCR</span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
                            <div className="mt-1 text-[13px] font-medium text-white break-words">{field.value}</div>
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

              <div className="mt-4 shrink-0 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
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

            </div>
          </aside>
        </div>
      </main>
    </motion.div>
  );
}
