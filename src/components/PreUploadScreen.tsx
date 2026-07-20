import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BookUser,
  Plus,
  UploadCloud,
  UserRound,
  UsersRound,
  Wand2,
  X,
} from 'lucide-react';
import {
  buildProductIntakeDraft,
  createBrowserIntakeFiles,
  getPrefillPreviewFields,
  resetFilesForPipeline,
  type ProductFileStatus,
  type ProductIntakeDraft,
  type ProductIntakeFile,
  type ProductIntakePhase,
  type ProductPackageType,
} from '../modules/submissions/productIntakeFlow';
import type { PassportExtractionField } from '../modules/submissions/passportExtractionContract';
import type { PreliminaryIntakeDraft } from '../modules/submissions/types';

interface PreUploadScreenProps {
  onBack: () => void;
  onSaveDraft?: (
    draft: ProductIntakeDraft,
    preliminaryIntake: PreliminaryIntakeDraft,
  ) => Promise<void> | void;
  onComplete?: (
    draft: ProductIntakeDraft,
    preliminaryIntake: PreliminaryIntakeDraft,
  ) => Promise<void> | void;
  initialPackageType?: ProductPackageType;
}

const finalStatuses: ProductFileStatus[] = ['recognized', 'needs_review', 'failed'];
const defaultFamilyResidence = { russia: 'yes', spain: 'yes' };

function applicantRoleLabel(index: number) {
  if (index === 0) return 'Основной заявитель';
  if (index === 1) return 'Второй заявитель';
  return `Заявитель ${index + 1}`;
}

function applicantDisplayLabel(index: number, file?: ProductIntakeFile) {
  if (file?.status !== 'recognized') return applicantRoleLabel(index);
  const extractedName = [file.extractedValues?.firstName, file.extractedValues?.surname]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ');
  return extractedName || applicantRoleLabel(index);
}

function applicantCompactDetails(file?: ProductIntakeFile) {
  if (file?.status !== 'recognized') return '';
  const fieldCount = file.extractedFieldKeys.length;
  const fieldCountEnding = fieldCount % 100 >= 11 && fieldCount % 100 <= 14
    ? 'полей'
    : fieldCount % 10 === 1
      ? 'поле'
      : fieldCount % 10 >= 2 && fieldCount % 10 <= 4
        ? 'поля'
        : 'полей';
  return [
    file.extractedValues?.passportNo ? `№ ${file.extractedValues.passportNo}` : '',
    file.extractedValues?.birthDate,
    file.extractedValues?.passportExpiresAt
      ? `до ${file.extractedValues.passportExpiresAt}`
      : '',
    `${fieldCount} ${fieldCountEnding}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function phaseFromFiles(files: ProductIntakeFile[]): ProductIntakePhase {
  if (!files.length) return 'selecting';
  if (!files.every((file) => finalStatuses.includes(file.status))) return 'extracting';
  return files.some((file) => file.status === 'recognized') ? 'ready' : 'review';
}

function passportExtractionValues(fields: PassportExtractionField[]) {
  const values: Record<string, string> = {};

  for (const field of fields) {
    if (!field.value.trim()) continue;
    if (field.key === 'surname') values.surname = field.value;
    if (field.key === 'firstName') values.firstName = field.value;
    if (field.key === 'birthDate') values.birthDate = field.value;
    if (field.key === 'birthPlace') values.birthPlace = field.value;
    if (field.key === 'birthCountry') values.birthCountry = field.value;
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

type PrefillPreviewField = ReturnType<typeof getPrefillPreviewFields>[number];

function PrefillPreviewList({ fields }: { fields: PrefillPreviewField[] }) {
  return (
    <div className="v19-preupload-prefill-list">
      <AnimatePresence mode="popLayout">
        {fields.map((field, index) => (
          <motion.div
            layout
            key={`${field.key}-${field.sourceFileName ?? index}`}
            initial={{ opacity: 0, x: 16, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -12, scale: 0.98 }}
            transition={{ delay: index * 0.025 }}
            className={`v19-prefill-preview-field rounded-2xl border px-3 py-2 ${field.state === 'warning' ? 'border-[var(--v19-depth-accent-border)] bg-[var(--v19-depth-accent-soft)]' : 'border-[var(--v19-depth-border-strong)] bg-[var(--v19-depth-panel-strong)]'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10.5px] font-medium uppercase tracking-wider text-white/38">{field.label}</div>
                <div className="v19-prefill-preview-value mt-1 break-words text-[13px] font-medium">{field.value}</div>
              </div>
              <span className="v19-prefill-preview-confidence shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px]">
                {Math.round(field.confidence * 100)}%
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function PreUploadScreen({ onBack, onSaveDraft, onComplete, initialPackageType = 'family' }: PreUploadScreenProps) {
  const [packageType, setPackageType] = useState<ProductPackageType>(initialPackageType);
  const [familyApplicantCount, setFamilyApplicantCount] = useState(2);
  const [phase, setPhase] = useState<ProductIntakePhase>('selecting');
  const [files, setFiles] = useState<ProductIntakeFile[]>([]);
  const familyResidence = defaultFamilyResidence;
  const [draftSeedIso, setDraftSeedIso] = useState(() => new Date().toISOString());
  const [dropActive, setDropActive] = useState(false);
  const [manualUpload, setManualUpload] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [mobilePrefillOpen, setMobilePrefillOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingApplicantIndexRef = useRef<number | null>(null);
  const pipelineRunRef = useRef(0);
  const passportExtractionAbortControllerRef = useRef<AbortController | null>(null);
  const previousRecognizedCountRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const applicantCount = packageType === 'family' ? familyApplicantCount : 1;
  const assignedFiles = useMemo(() => {
    const byApplicant = new Map<number, ProductIntakeFile>();
    files.forEach((file, fallbackIndex) => {
      const applicantIndex = file.applicantIndex ?? fallbackIndex;
      if (!byApplicant.has(applicantIndex)) byApplicant.set(applicantIndex, file);
    });
    return byApplicant;
  }, [files]);
  const draft = useMemo(
    () => buildProductIntakeDraft(packageType, files, draftSeedIso, applicantCount),
    [applicantCount, draftSeedIso, files, packageType],
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

  const clearPipeline = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    passportExtractionAbortControllerRef.current?.abort();
    passportExtractionAbortControllerRef.current = null;
  };

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  };

  const patchFile = (fileId: string, patch: Partial<ProductIntakeFile>) => {
    setFiles((current) => current.map((file) => (file.id === fileId ? { ...file, ...patch } : file)));
  };

  const extractPassportFile = async (
    file: ProductIntakeFile,
    applicantIndex: number,
    runId: number,
    signal: AbortSignal,
  ) => {
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
        signal,
      });
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
            : result.summary || 'OCR не подтвердил паспортные поля. Проверьте данные вручную.',
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
    const passportExtractionAbortController = options.extractPassports
      ? new AbortController()
      : null;
    passportExtractionAbortControllerRef.current = passportExtractionAbortController;
    const queued = resetFilesForPipeline(sourceFiles);
    let passportExtractionQueue = Promise.resolve();
    setFiles(queued);
    setPhase('uploading');

    queued.forEach((file, index) => {
      const offset = index * 520;
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        setPhase('uploading');
        patchFile(file.id, { status: 'uploading', progress: 34 });
      }, offset + 80);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        patchFile(file.id, { status: 'uploaded', progress: 62 });
      }, offset + 260);
      schedule(() => {
        if (pipelineRunRef.current !== runId) return;
        if (options.extractPassports && ['passport', 'unknown'].includes(file.kind)) {
          passportExtractionQueue = passportExtractionQueue.then(async () => {
            if (pipelineRunRef.current !== runId) return;
            setPhase('extracting');
            patchFile(file.id, { status: 'extracting', progress: 86 });
            if (!passportExtractionAbortController) return;
            await extractPassportFile(
              file,
              file.applicantIndex ?? index,
              runId,
              passportExtractionAbortController.signal,
            );
          });
          return;
        }
        setPhase('extracting');
        patchFile(file.id, { status: 'extracting', progress: 86 });
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
        setPhase('review');
      }, tail);
    }
  };

  const resetScenario = (nextType: ProductPackageType) => {
    clearPipeline();
    pipelineRunRef.current += 1;
    pendingApplicantIndexRef.current = null;
    setPackageType(nextType);
    setManualUpload(false);
    setDraftSeedIso(new Date().toISOString());
    setFiles([]);
    setActionError('');
    setMobilePrefillOpen(false);
    setPhase('selecting');
    if (nextType === 'family') setFamilyApplicantCount(2);
  };

  const firstFreeApplicantIndex = (occupied: Set<number>, currentApplicantCount: number) => {
    for (let index = 0; index < currentApplicantCount; index += 1) {
      if (!occupied.has(index)) return index;
    }
    return currentApplicantCount;
  };

  const handleFiles = (fileList: FileList | File[]) => {
    if (actionPending) return;
    const browserFiles = createBrowserIntakeFiles(Array.from(fileList), packageType);
    if (!browserFiles.length) return;

    const preferredApplicantIndex = pendingApplicantIndexRef.current;
    pendingApplicantIndexRef.current = null;
    let nextApplicantCount = applicantCount;
    const occupied = new Set(
      files.map((file, fallbackIndex) => file.applicantIndex ?? fallbackIndex),
    );
    let nextFiles = preferredApplicantIndex === null
      ? [...files]
      : files.filter(
          (file, fallbackIndex) =>
            (file.applicantIndex ?? fallbackIndex) !== preferredApplicantIndex,
        );

    if (preferredApplicantIndex !== null) occupied.delete(preferredApplicantIndex);

    const assignedBrowserFiles = browserFiles.map((file, index) => {
      let targetApplicantIndex: number;
      if (packageType === 'single') {
        targetApplicantIndex = 0;
      } else if (index === 0 && preferredApplicantIndex !== null) {
        targetApplicantIndex = preferredApplicantIndex;
      } else {
        targetApplicantIndex = firstFreeApplicantIndex(occupied, nextApplicantCount);
      }
      occupied.add(targetApplicantIndex);
      nextApplicantCount = Math.max(nextApplicantCount, targetApplicantIndex + 1);
      return { ...file, applicantIndex: targetApplicantIndex };
    });

    if (packageType === 'single') nextFiles = [];
    nextFiles = [...nextFiles, ...assignedBrowserFiles];
    if (packageType === 'family') setFamilyApplicantCount(nextApplicantCount);

    setManualUpload(true);
    setActionError('');
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
    pendingApplicantIndexRef.current = null;
    if (event.dataTransfer.files?.length) handleFiles(event.dataTransfer.files);
  };

  const openFilePicker = (applicantIndex: number | null) => {
    if (actionPending) return;
    pendingApplicantIndexRef.current = applicantIndex;
    fileInputRef.current?.click();
  };

  const clearApplicantPassport = (applicantIndex: number) => {
    clearPipeline();
    pipelineRunRef.current += 1;
    const nextFiles = files.filter(
      (file, fallbackIndex) =>
        (file.applicantIndex ?? fallbackIndex) !== applicantIndex,
    );
    setFiles(nextFiles);
    setActionError('');
    setPhase(phaseFromFiles(nextFiles));
  };

  const removeApplicant = (applicantIndex: number) => {
    if (applicantIndex < 2 || familyApplicantCount <= 2) return;
    clearPipeline();
    pipelineRunRef.current += 1;
    const nextFiles = files.flatMap((file, fallbackIndex) => {
      const currentIndex = file.applicantIndex ?? fallbackIndex;
      if (currentIndex === applicantIndex) return [];
      return [{
        ...file,
        applicantIndex: currentIndex > applicantIndex ? currentIndex - 1 : currentIndex,
      }];
    });
    setFamilyApplicantCount((current) => Math.max(2, current - 1));
    setFiles(nextFiles);
    setPhase(phaseFromFiles(nextFiles));
  };

  const completeDraft = async () => {
    setActionError('');
    setActionPending(true);
    try {
      await onComplete?.(
        buildProductIntakeDraft(packageType, files, draftSeedIso, applicantCount),
        preliminaryIntakeFromFamilyResidence(familyResidence),
      );
    } catch {
      setActionError('Не удалось создать подачу. Повторите попытку.');
    } finally {
      setActionPending(false);
    }
  };

  const saveDraft = async () => {
    setActionError('');
    setActionPending(true);
    try {
      await onSaveDraft?.(
        buildProductIntakeDraft(packageType, files, draftSeedIso, applicantCount),
        preliminaryIntakeFromFamilyResidence(familyResidence),
      );
    } catch {
      setActionError('Не удалось сохранить черновик. Повторите попытку.');
    } finally {
      setActionPending(false);
    }
  };

  useEffect(() => {
    return clearPipeline;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const warmup = window.setTimeout(() => {
      void import('../modules/submissions/passportExtractionService').then(
        ({ prewarmLocalPassportOcr }) => {
          if (!cancelled) void prewarmLocalPassportOcr();
        },
        () => undefined,
      );
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(warmup);
    };
  }, []);

  useEffect(() => {
    if (!manualUpload || files.length === 0) return;
    if (!files.every((file) => finalStatuses.includes(file.status))) return;
    setPhase(files.some((file) => file.status === 'recognized') ? 'ready' : 'review');
  }, [files, manualUpload]);

  useEffect(() => {
    const previousRecognizedCount = previousRecognizedCountRef.current;
    previousRecognizedCountRef.current = recognizedCount;
    if (
      recognizedCount > previousRecognizedCount &&
      previewFields.length > 0 &&
      window.matchMedia?.('(max-width: 1279px)').matches
    ) {
      setMobilePrefillOpen(true);
    }
  }, [previewFields.length, recognizedCount]);

  useEffect(() => {
    if (!mobilePrefillOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobilePrefillOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobilePrefillOpen]);

  return (
    <motion.div
      aria-labelledby="create-submission-title"
      aria-modal="true"
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.992 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="v19-preupload-screen fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--v19-depth-canvas)] text-[var(--v19-depth-text)]"
      role="dialog"
    >
      <header className="h-[64px] shrink-0 border-b border-[var(--v19-depth-border)] bg-[var(--v19-depth-page)] backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
        <button
          aria-label="Назад"
          disabled={actionPending}
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--v19-depth-border-strong)] bg-[var(--v19-depth-control)] text-[var(--v19-depth-text-muted)] transition-colors hover:bg-[var(--v19-depth-control-hover)] hover:text-[var(--v19-depth-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
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
          disabled={actionPending}
          onClick={onBack}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-[9px] border border-transparent bg-transparent text-[var(--v19-depth-text-faint)] transition-colors hover:text-[var(--v19-depth-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <main className="h-[calc(100dvh-64px)] flex-1 min-h-0 overflow-hidden p-0">
        <div className="grid h-full min-h-full w-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] xl:gap-6 xl:p-6">
          <section className="flex h-full min-h-0 flex-col">
            <motion.div
              className="v19-preupload-card relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-gradient-to-br from-[var(--v19-depth-panel-strong)] to-[var(--v19-depth-page)] px-5 pb-0 pt-5 shadow-[var(--v19-depth-shadow-panel)] lg:px-6 lg:pb-0 lg:pt-6 xl:rounded-3xl xl:border xl:border-[var(--v19-depth-border-strong)]"
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--v19-depth-accent-soft)] blur-3xl"
                animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.8, 0.55] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="relative z-10 mb-4 shrink-0">
                <div className="relative w-full space-y-3">
                  <div className="flex w-fit rounded-full border border-[var(--v19-depth-border-strong)] bg-[var(--v19-depth-page)] p-1 shadow-[var(--v19-depth-inner-highlight)]">
                    {[
                      { icon: UsersRound, label: 'Семья', type: 'family' as const },
                      { icon: UserRound, label: 'Заявитель', type: 'single' as const },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = packageType === item.type;

                      return (
                          <button
                            key={item.type}
                            type="button"
                            disabled={actionPending}
                            onClick={() => resetScenario(item.type)}
                          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)] ${
                            active
                              ? 'bg-[var(--v19-depth-accent-soft)] text-[var(--v19-depth-text-strong)] shadow-[var(--v19-depth-inner-highlight)]'
                              : 'text-[var(--v19-depth-text-faint)] hover:bg-[var(--v19-depth-control-hover)] hover:text-[var(--v19-depth-text)]'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 text-[var(--v19-depth-accent-text)]" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={`applicant-controls-${packageType}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="v19-preupload-applicant-controls"
                    >
                      <div
                        className="v19-preupload-applicant-grid"
                        data-package-type={packageType}
                        data-testid={`preupload-${packageType}-grid`}
                        role="list"
                      >
                        {Array.from({ length: applicantCount }, (_, applicantIndex) => {
                          const file = assignedFiles.get(applicantIndex);
                          const applicantLabel = applicantDisplayLabel(applicantIndex, file);
                          const applicantDetails = packageType === 'single'
                            ? applicantCompactDetails(file)
                            : '';
                          const passportRecognized = file?.status === 'recognized';
                          const isRemovableApplicant = applicantIndex >= 2 && !file;
                          return (
                            <article className={[file ? 'has-file' : '', passportRecognized ? 'is-recognized' : '', packageType === 'single' ? 'is-single' : ''].filter(Boolean).join(' ')} key={applicantIndex} role="listitem">
                              <button
                                type="button"
                                className="v19-preupload-applicant-label"
                                disabled={actionPending}
                                onClick={() => openFilePicker(applicantIndex)}
                                aria-label={`${file ? 'Заменить' : 'Загрузить'} паспорт: ${applicantLabel}`}
                              >
                                <span aria-hidden="true" className="v19-preupload-applicant-order">
                                  {applicantIndex + 1}
                                </span>
                                <span className="v19-preupload-applicant-copy">
                                  <span className="v19-preupload-applicant-name">
                                    {applicantLabel}
                                  </span>
                                  {applicantDetails ? (
                                    <span className="v19-preupload-applicant-details">
                                      {applicantDetails}
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="v19-preupload-applicant-icon"
                                disabled={actionPending}
                                onClick={() => {
                                  if (file) {
                                    clearApplicantPassport(applicantIndex);
                                  } else if (isRemovableApplicant) {
                                    removeApplicant(applicantIndex);
                                  } else {
                                    openFilePicker(applicantIndex);
                                  }
                                }}
                                aria-label={
                                  file
                                    ? `Удалить паспорт: ${applicantLabel}`
                                    : isRemovableApplicant
                                      ? `Удалить заявителя ${applicantIndex + 1}`
                                      : `Открыть загрузку паспорта: ${applicantLabel}`
                                }
                              >
                                {isRemovableApplicant ? (
                                  <X aria-hidden="true" />
                                ) : (
                                  <>
                                    <BookUser className="v19-preupload-passport-icon" aria-hidden="true" />
                                    {file ? <X className="v19-preupload-remove-icon" aria-hidden="true" /> : null}
                                  </>
                                )}
                              </button>
                            </article>
                          );
                        })}
                        {packageType === 'family' ? (
                          <article className="v19-preupload-add-applicant" role="listitem">
                            <button
                              aria-label="Добавить следующего заявителя"
                              disabled={actionPending}
                              type="button"
                              onClick={() => setFamilyApplicantCount((current) => current + 1)}
                            >
                              <Plus aria-hidden="true" />
                              <span className="sr-only">Добавить заявителя</span>
                            </button>
                          </article>
                        ) : null}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="v19-preupload-upload-group">
                {phase === 'extracting' ? (
                  <div className="v19-preupload-progress-stack">
                    <div className="v19-preupload-progress-status">
                      <span>Извлечение данных</span>
                      <strong>{averageProgress}%</strong>
                    </div>
                    <div
                      className="v19-preupload-progress-line"
                      role="progressbar"
                      aria-label="Извлечение данных из паспорта"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={averageProgress}
                    >
                      <span style={{ width: `${averageProgress}%` }} />
                    </div>
                  </div>
                ) : null}

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropActive(true);
                  }}
                  onDragLeave={() => setDropActive(false)}
                  onDrop={handleDrop}
                  className={`v19-preupload-dropzone relative min-h-[180px] rounded-3xl border border-dashed p-6 flex flex-col items-center justify-center text-center group transition-colors cursor-pointer overflow-hidden ${dropActive ? 'border-[var(--v19-depth-border-selected)] bg-[var(--v19-depth-accent-soft)]' : 'border-[var(--v19-depth-accent-border)] bg-[var(--v19-depth-page)] hover:bg-[var(--v19-depth-accent-soft)]'}`}
                  onClick={() => openFilePicker(null)}
                >
                <motion.div
                  aria-hidden
                  className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[var(--v19-depth-accent-text)] to-transparent"
                  animate={{ y: [0, 250, 0], opacity: [0.1, 0.9, 0.1] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="w-12 h-12 rounded-2xl bg-[var(--v19-depth-accent-soft)] border border-[var(--v19-depth-accent-border)] flex items-center justify-center mb-3"
                  animate={{ scale: phase === 'extracting' ? [1, 1.06, 1] : 1, rotate: dropActive ? 2 : 0 }}
                  transition={{ duration: 1.2, repeat: phase === 'extracting' ? Infinity : 0 }}
                >
                  {phase === 'extracting' ? <Wand2 className="w-6 h-6 text-[var(--v19-depth-accent-text)]" /> : <UploadCloud className="w-6 h-6 text-[var(--v19-depth-accent-text)]" />}
                </motion.div>
                <h3 className="text-[18px] font-semibold text-white">
                  {files.length
                    ? packageType === 'single'
                      ? 'Заменить паспорт'
                      : 'Добавить ещё паспорт'
                    : 'Загрузить паспорт'}
                </h3>
                <p className="text-[13px] text-white/45 leading-relaxed mt-2 max-w-md">
                  Если вы загрузите паспорт, то вам меньше придется заполнять.
                </p>
                <button
                  type="button"
                  disabled={actionPending}
                  className="v19-file-picker-button mt-3"
                  onClick={(event) => {
                    event.stopPropagation();
                    openFilePicker(null);
                  }}
                >
                  Выбрать файл
                </button>
                  <input ref={fileInputRef} type="file" multiple={packageType === 'family'} accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" className="hidden" disabled={actionPending} onClick={(event) => event.stopPropagation()} onChange={handleFileInput} />
                </div>
              </div>

              <div className="sticky bottom-0 z-20 -mx-5 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--v19-depth-border)] bg-[var(--v19-depth-page)] px-5 pb-4 pt-3 lg:-mx-6 lg:px-6 xl:rounded-b-3xl">
                {actionError ? (
                  <p className="col-span-2 m-0 text-left text-[12px] text-[var(--v19b-status-danger-text)]" role="alert">
                    {actionError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => void saveDraft()}
                  className="h-11 rounded-[8px] border border-[var(--v19-depth-border-strong)] bg-transparent px-3 text-[13px] font-medium text-[var(--v19-depth-text-muted)] transition-colors hover:border-[var(--v19-depth-border-selected)] hover:text-[var(--v19-depth-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
                >
                  {actionPending ? 'Сохраняем…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => void completeDraft()}
                  aria-disabled={actionPending}
                  disabled={actionPending}
                  className="h-11 rounded-[8px] bg-[var(--v19-depth-accent)] px-3 text-[13px] font-semibold text-[var(--v19-depth-text-strong)] shadow-[var(--v19-depth-inner-highlight)] transition-colors hover:bg-[var(--v19-depth-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)] disabled:cursor-not-allowed disabled:bg-[var(--v19-depth-control)] disabled:text-[var(--v19-depth-text-faint)] disabled:shadow-none"
                >
                  {actionPending ? 'Сохраняем…' : 'Далее'}
                </button>
              </div>
            </motion.div>
          </section>

          <aside className="hidden min-h-0 space-y-5 xl:block">
            <div className="sticky top-0 hidden overflow-hidden rounded-2xl border border-[var(--v19-depth-border-strong)] bg-[var(--v19-depth-panel)] p-5 shadow-[var(--v19-depth-shadow-card)] xl:flex xl:h-[calc(100dvh-112px)] xl:max-h-[calc(100dvh-112px)] xl:flex-col">
              <div className="mb-4 flex h-[96px] shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[14px] font-semibold text-white">Prefill-поля</h3>
                  <span className="text-[11px] text-white/45">{recognizedCount} OCR</span>
                </div>
                <p className="text-[12px] leading-relaxed text-white/42">
                  Поля появляются здесь по мере распознавания паспорта.
                </p>
              </div>
              <PrefillPreviewList fields={previewFields} />
            </div>
          </aside>

          {previewFields.length > 0 && !mobilePrefillOpen ? (
            <button
              aria-label="Открыть распознанные OCR-поля"
              className="v19-preupload-prefill-trigger"
              type="button"
              onClick={() => setMobilePrefillOpen(true)}
            >
              <Wand2 aria-hidden="true" />
              <span>OCR</span>
              <strong>{recognizedCount}</strong>
            </button>
          ) : null}

          <AnimatePresence>
            {mobilePrefillOpen && previewFields.length > 0 ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="v19-preupload-prefill-overlay"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
              >
                <button
                  aria-label="Закрыть распознанные OCR-поля"
                  className="v19-preupload-prefill-backdrop"
                  type="button"
                  onClick={() => setMobilePrefillOpen(false)}
                />
                <motion.section
                  aria-label="Распознанные OCR-поля"
                  aria-modal="true"
                  className="v19-preupload-prefill-sheet"
                  role="dialog"
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 24 }}
                  initial={{ opacity: 0, y: 24 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="v19-preupload-prefill-sheet-handle" aria-hidden="true" />
                  <header className="v19-preupload-prefill-sheet-header">
                    <div>
                      <h3>Prefill-поля</h3>
                      <p>Распознанные данные паспорта</p>
                    </div>
                    <span>{recognizedCount} OCR</span>
                    <button
                      aria-label="Закрыть"
                      type="button"
                      onClick={() => setMobilePrefillOpen(false)}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </header>
                  <PrefillPreviewList fields={previewFields} />
                </motion.section>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>
    </motion.div>
  );
}

function preliminaryIntakeFromFamilyResidence(
  familyResidence: { russia: string; spain: string },
): PreliminaryIntakeDraft {
  return {
    arrivalPlace: '',
    homeAddress: '',
    sameArrivalPlace: false,
    sameHomeAddress: familyResidence.russia === 'yes',
    sameSpainStay: familyResidence.spain === 'yes',
    sameTripDates: false,
    spainStayAddress: '',
    spainStayCity: '',
    spainStayName: '',
    tripDateFrom: '',
    tripDateTo: '',
  };
}
