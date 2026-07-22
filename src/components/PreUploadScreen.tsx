import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  BookUser,
  Plus,
  UploadCloud,
  UserRound,
  UsersRound,
  Wand2,
  X,
} from "lucide-react";
import { agentInteractionProps } from "../modules/submissions/agentInteractionContract";
import type { PassportExtractionField } from "../modules/submissions/passportExtractionContract";
import {
  passportIntakeApplicantName,
  passportIntakePreviewFields,
  passportScanUploadAccept,
  passportScanUploadFormatLabel,
  passportUploadFromIntakeItem,
  submissionIntakeApplicantCount,
  submissionIntakeFamilyMax,
  validatePassportIntakeFile,
  type PassportIntakeItem,
  type PassportIntakePreviewField,
  type SubmissionIntakeProgress,
  type SubmissionIntakeSubmit,
} from "../modules/submissions/submissionIntake";
import {
  CANONICAL_CITIES,
  type City,
  type Submission,
} from "../modules/submissions/types";
import "./PreUploadScreen.css";

interface PreUploadScreenProps {
  initialCity?: City;
  initialPackageType?: Submission["type"];
  onBack: () => void;
  onSubmit?: SubmissionIntakeSubmit;
}

type PendingAssignment = {
  applicantIndex: number | "";
  file: File;
  id: string;
};

type ConfirmationAction =
  | { kind: "close" }
  | { kind: "remove_applicant"; applicantIndex: number }
  | { kind: "switch_type"; type: Submission["type"] };

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

let passportExtractionServicePromise: Promise<
  typeof import("../modules/submissions/passportExtractionService")
> | null = null;

function loadPassportExtractionService() {
  passportExtractionServicePromise ??=
    import("../modules/submissions/passportExtractionService").catch(
      (error: unknown) => {
        passportExtractionServicePromise = null;
        throw error;
      },
    );
  return passportExtractionServicePromise;
}

function uniqueToken(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `${prefix}-${uuid}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function applicantRoleLabel(index: number, type: Submission["type"]) {
  if (type === "single") return "Основной заявитель";
  if (index === 0) return "Основной заявитель";
  if (index === 1) return "Супруг/супруга";
  return `Ребёнок ${index - 1}`;
}

function applicantDisplayLabel(
  index: number,
  type: Submission["type"],
  item?: PassportIntakeItem,
) {
  return passportIntakeApplicantName(item) || applicantRoleLabel(index, type);
}

function extractedValue(item: PassportIntakeItem | undefined, key: string) {
  return item?.extractedFields.find((field) => field.key === key)?.value.trim() ?? "";
}

function applicantCompactDetails(item?: PassportIntakeItem) {
  if (!item) return "Паспорт не добавлен";
  if (item.status === "extracting") return "Локальный OCR обрабатывает файл";
  if (item.status === "selected") return "Файл готовится";
  const fieldCount = item.extractedFields.filter((field) => field.value.trim()).length;
  const details = [
    extractedValue(item, "passportNumber")
      ? `№ ${extractedValue(item, "passportNumber")}`
      : "",
    extractedValue(item, "birthDate"),
    extractedValue(item, "passportExpiresAt")
      ? `до ${extractedValue(item, "passportExpiresAt")}`
      : "",
    fieldCount ? `${fieldCount} полей` : "ручное заполнение",
  ].filter(Boolean);
  return details.join(" · ");
}

function statusLabel(item?: PassportIntakeItem) {
  if (!item) return "Паспорт не добавлен";
  if (item.status === "extracting" || item.status === "selected")
    return "OCR обрабатывает";
  if (item.status === "ready") return "Распознано — проверьте поля";
  if (item.status === "failed") return "OCR не завершился — заполните вручную";
  return "Нужна ручная проверка";
}

function persistenceLabel(progress: SubmissionIntakeProgress | null) {
  if (!progress) return "Сохраняем…";
  if (progress.stage === "saving_submission") return "Создаём черновик…";
  if (progress.stage === "uploading_passport") {
    return `Загружаем паспорт ${progress.current} из ${progress.total}…`;
  }
  if (progress.stage === "saving_passport_metadata") {
    return `Сохраняем паспорт ${progress.current} из ${progress.total}…`;
  }
  return "Готово";
}

function trapFocus(
  event: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
) {
  if (event.key !== "Tab" || !container) return;
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(
    (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function PrefillPreviewList({
  fields,
  reduceMotion,
}: {
  fields: PassportIntakePreviewField[];
  reduceMotion: boolean;
}) {
  if (!fields.length) {
    return (
      <p className="v19-preupload-prefill-empty">
        Поля выбранного заявителя появятся после локального OCR.
      </p>
    );
  }

  return (
    <div className="v19-preupload-prefill-list">
      <AnimatePresence mode="popLayout">
        {fields.map((field, index) => (
          <motion.div
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className={`v19-prefill-preview-field rounded-2xl border px-3 py-2 ${
              field.confidenceLabel === "Проверьте"
                ? "border-[var(--v19-depth-accent-border)] bg-[var(--v19-depth-accent-soft)]"
                : "border-[var(--v19-depth-border-strong)] bg-[var(--v19-depth-panel-strong)]"
            }`}
            exit={reduceMotion ? undefined : { opacity: 0, x: -12, scale: 0.98 }}
            initial={reduceMotion ? false : { opacity: 0, x: 16, scale: 0.98 }}
            key={field.key}
            layout={!reduceMotion}
            transition={reduceMotion ? { duration: 0 } : { delay: index * 0.025 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="v19-preupload-field-label">{field.label}</div>
                <div className="v19-prefill-preview-value mt-1 break-words text-[13px] font-medium">
                  {field.value}
                </div>
              </div>
              <span className="v19-prefill-preview-confidence shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px]">
                {field.confidenceLabel}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function PreUploadScreen({
  initialCity,
  initialPackageType = "family",
  onBack,
  onSubmit,
}: PreUploadScreenProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const [packageType, setPackageType] =
    useState<Submission["type"]>(initialPackageType);
  const [city, setCity] = useState<City | "">(initialCity ?? "");
  const [familyApplicantCount, setFamilyApplicantCount] = useState(2);
  const [activeApplicantIndex, setActiveApplicantIndex] = useState(0);
  const [items, setItems] = useState<PassportIntakeItem[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [persistenceProgress, setPersistenceProgress] =
    useState<SubmissionIntakeProgress | null>(null);
  const [mobilePrefillOpen, setMobilePrefillOpen] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingApplicantIndexRef = useRef<number | null>(null);
  const actionPendingRef = useRef(false);
  const itemsRef = useRef(items);
  const ocrQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ocrControllersRef = useRef(new Map<string, AbortController>());
  const skippedOcrIdsRef = useRef(new Set<string>());
  const prewarmRequestedRef = useRef(false);
  const focusOriginRef = useRef<HTMLElement | null>(null);
  const prefillTriggerRef = useRef<HTMLButtonElement | null>(null);
  const prefillSheetRef = useRef<HTMLElement | null>(null);
  const assignmentDialogRef = useRef<HTMLElement | null>(null);
  const confirmationDialogRef = useRef<HTMLElement | null>(null);

  const applicantCount = submissionIntakeApplicantCount(
    packageType,
    familyApplicantCount,
  );
  const assignedItems = useMemo(
    () => new Map(items.map((item) => [item.applicantIndex, item])),
    [items],
  );
  const activeItem = assignedItems.get(activeApplicantIndex);
  const previewFields = passportIntakePreviewFields(activeItem);
  const busyItems = items.filter(
    (item) => item.status === "extracting" || item.status === "selected",
  );
  const completedOcrCount = items.length - busyItems.length;
  const isDirty = Boolean(city || items.length || packageType !== initialPackageType);
  const submissionDisabledReason = actionPending
    ? persistenceLabel(persistenceProgress)
    : !city
      ? "Выберите город подачи."
      : pendingAssignments.length
        ? "Сначала назначьте каждый паспорт заявителю."
        : busyItems.length
          ? "Дождитесь OCR или выберите «Пропустить OCR»."
          : "";
  const submitDisabled = Boolean(submissionDisabledReason);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const ocrControllers = ocrControllersRef.current;
    focusOriginRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() =>
      headingRef.current?.focus({ preventScroll: true }),
    );
    return () => {
      for (const controller of ocrControllers.values()) controller.abort();
      const origin = focusOriginRef.current;
      window.requestAnimationFrame(() => {
        if (origin?.isConnected) origin.focus({ preventScroll: true });
      });
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (mobilePrefillOpen) {
      window.requestAnimationFrame(() => {
        prefillSheetRef.current
          ?.querySelector<HTMLElement>(focusableSelector)
          ?.focus({ preventScroll: true });
      });
    }
  }, [mobilePrefillOpen]);

  useEffect(() => {
    if (pendingAssignments.length) {
      window.requestAnimationFrame(() => {
        assignmentDialogRef.current
          ?.querySelector<HTMLElement>(focusableSelector)
          ?.focus({ preventScroll: true });
      });
    }
  }, [pendingAssignments.length]);

  useEffect(() => {
    if (confirmation) {
      window.requestAnimationFrame(() => {
        confirmationDialogRef.current
          ?.querySelector<HTMLElement>(focusableSelector)
          ?.focus({ preventScroll: true });
      });
    }
  }, [confirmation]);

  const patchItem = (itemId: string, patch: Partial<PassportIntakeItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  };

  const primeOcr = () => {
    if (prewarmRequestedRef.current) return;
    prewarmRequestedRef.current = true;
    void loadPassportExtractionService().then(
      ({ prewarmLocalPassportOcr }) => prewarmLocalPassportOcr(),
      () => undefined,
    );
  };

  const queuePassportOcr = (item: PassportIntakeItem) => {
    const controller = new AbortController();
    ocrControllersRef.current.set(item.id, controller);
    patchItem(item.id, {
      status: "extracting",
      summary: "Локальный OCR обрабатывает паспорт.",
    });

    ocrQueueRef.current = ocrQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (skippedOcrIdsRef.current.has(item.id)) return;
        try {
          const { invokePassportExtraction } = await loadPassportExtractionService();
          const result = await invokePassportExtraction({
            applicantIndex: item.applicantIndex,
            localFile: item.file,
            openAiFallbackAllowed: false,
            signal: controller.signal,
          });
          if (
            controller.signal.aborted ||
            skippedOcrIdsRef.current.has(item.id) ||
            !itemsRef.current.some((current) => current.id === item.id)
          ) {
            return;
          }
          const extractedFields = result.fields
            .filter((field) => field.value.trim())
            .map((field: PassportExtractionField) => ({
              ...field,
              source: "passport_scan" as const,
            }));
          const hasIdentity = extractedFields.some((field) =>
            ["firstName", "passportNumber", "surname"].includes(field.key),
          );
          patchItem(item.id, {
            extractedFields,
            status:
              result.status === "extracted" && hasIdentity ? "ready" : "unavailable",
            summary:
              result.summary ||
              "OCR не подтвердил паспортные поля. Заполните данные вручную.",
          });
        } catch {
          if (controller.signal.aborted || skippedOcrIdsRef.current.has(item.id))
            return;
          patchItem(item.id, {
            extractedFields: [],
            status: "failed",
            summary: "OCR не завершился. Паспорт можно сохранить и заполнить вручную.",
          });
        } finally {
          ocrControllersRef.current.delete(item.id);
        }
      });
  };

  const addPassport = (file: File, applicantIndex: number) => {
    const validation = validatePassportIntakeFile(file);
    if (!validation.ok) {
      setActionError(validation.message);
      return false;
    }
    const item: PassportIntakeItem = {
      applicantIndex,
      extractedFields: [],
      file,
      fileName: file.name,
      id: uniqueToken(`passport-${applicantIndex + 1}`),
      status: validation.ocrMode === "supported" ? "selected" : "unavailable",
      summary:
        validation.ocrMode === "supported"
          ? "Паспорт выбран. Запускаем локальный OCR."
          : "Формат можно безопасно сохранить, но OCR для него недоступен.",
    };
    const previous = itemsRef.current.find(
      (current) => current.applicantIndex === applicantIndex,
    );
    if (previous) {
      skippedOcrIdsRef.current.add(previous.id);
      ocrControllersRef.current.get(previous.id)?.abort();
    }
    setItems((current) => [
      ...current.filter((candidate) => candidate.applicantIndex !== applicantIndex),
      item,
    ]);
    setActiveApplicantIndex(applicantIndex);
    setActionError("");
    if (validation.ocrMode === "supported") {
      primeOcr();
      queuePassportOcr(item);
    }
    return true;
  };

  const beginBatchAssignment = (files: File[]) => {
    if (files.length > submissionIntakeFamilyMax) {
      setActionError(
        `За один раз можно назначить не больше ${submissionIntakeFamilyMax} паспортов.`,
      );
      return;
    }
    const validations = files.map((file) => validatePassportIntakeFile(file));
    const invalid = validations.find((validation) => !validation.ok);
    if (invalid && !invalid.ok) {
      setActionError(invalid.message);
      return;
    }
    const requiredCount = Math.min(
      submissionIntakeFamilyMax,
      Math.max(applicantCount, items.length + files.length, 2),
    );
    setFamilyApplicantCount(requiredCount);
    setPendingAssignments(
      files.map((file) => ({
        applicantIndex: "",
        file,
        id: uniqueToken("assignment"),
      })),
    );
    setActionError("");
  };

  const handleFiles = (files: File[], preferredApplicantIndex: number | null) => {
    if (actionPendingRef.current || !files.length) return;
    if (packageType === "single" && files.length > 1) {
      setActionError("Для одиночной подачи выберите один паспорт.");
      return;
    }
    if (
      packageType === "family" &&
      preferredApplicantIndex === null &&
      files.length > 1
    ) {
      beginBatchAssignment(files);
      return;
    }
    const targetIndex =
      packageType === "single" ? 0 : (preferredApplicantIndex ?? activeApplicantIndex);
    addPassport(files[0] as File, targetIndex);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const preferredApplicantIndex = pendingApplicantIndexRef.current;
    pendingApplicantIndexRef.current = null;
    handleFiles(Array.from(event.currentTarget.files ?? []), preferredApplicantIndex);
    event.currentTarget.value = "";
  };

  const openFilePicker = (applicantIndex: number | null) => {
    if (actionPendingRef.current) return;
    pendingApplicantIndexRef.current = applicantIndex;
    primeOcr();
    fileInputRef.current?.click();
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDropActive(false);
    handleFiles(Array.from(event.dataTransfer.files ?? []), null);
  };

  const clearApplicantPassport = (applicantIndex: number) => {
    const item = itemsRef.current.find(
      (candidate) => candidate.applicantIndex === applicantIndex,
    );
    if (item) {
      skippedOcrIdsRef.current.add(item.id);
      ocrControllersRef.current.get(item.id)?.abort();
    }
    setItems((current) =>
      current.filter((candidate) => candidate.applicantIndex !== applicantIndex),
    );
    setActionError("");
  };

  const removeApplicantNow = (applicantIndex: number) => {
    clearApplicantPassport(applicantIndex);
    setItems((current) =>
      current.map((item) => ({
        ...item,
        applicantIndex:
          item.applicantIndex > applicantIndex
            ? item.applicantIndex - 1
            : item.applicantIndex,
      })),
    );
    setFamilyApplicantCount((current) => Math.max(2, current - 1));
    setActiveApplicantIndex((current) =>
      Math.min(current, Math.max(0, applicantCount - 2)),
    );
  };

  const requestRemoveApplicant = (applicantIndex: number) => {
    if (itemsRef.current.some((item) => item.applicantIndex === applicantIndex)) {
      setConfirmation({ applicantIndex, kind: "remove_applicant" });
    } else {
      removeApplicantNow(applicantIndex);
    }
  };

  const skipOcr = (item: PassportIntakeItem) => {
    skippedOcrIdsRef.current.add(item.id);
    ocrControllersRef.current.get(item.id)?.abort();
    patchItem(item.id, {
      extractedFields: [],
      status: "unavailable",
      summary: "OCR пропущен. Паспорт сохранится для ручного заполнения.",
    });
  };

  const retryOcr = (item: PassportIntakeItem) => {
    skippedOcrIdsRef.current.delete(item.id);
    queuePassportOcr({ ...item, status: "selected" });
  };

  const requestSwitchType = (type: Submission["type"]) => {
    if (type === packageType) return;
    if (items.length) {
      setConfirmation({ kind: "switch_type", type });
      return;
    }
    setPackageType(type);
    setFamilyApplicantCount(2);
    setActiveApplicantIndex(0);
  };

  const requestClose = () => {
    if (actionPendingRef.current) return;
    if (isDirty) {
      setConfirmation({ kind: "close" });
    } else {
      onBack();
    }
  };

  const confirmAction = () => {
    if (!confirmation) return;
    if (confirmation.kind === "close") {
      setConfirmation(null);
      onBack();
      return;
    }
    if (confirmation.kind === "switch_type") {
      for (const controller of ocrControllersRef.current.values()) controller.abort();
      skippedOcrIdsRef.current = new Set(itemsRef.current.map((item) => item.id));
      setItems([]);
      setPackageType(confirmation.type);
      setFamilyApplicantCount(2);
      setActiveApplicantIndex(0);
    } else {
      removeApplicantNow(confirmation.applicantIndex);
    }
    setConfirmation(null);
  };

  const submit = async (destination: "list" | "questionnaire") => {
    if (submitDisabled || actionPendingRef.current || !city) return;
    actionPendingRef.current = true;
    setActionPending(true);
    setActionError("");
    setPersistenceProgress({ stage: "saving_submission" });
    try {
      await onSubmit?.(
        {
          city,
          destination,
          familyCount: applicantCount,
          passportUploads: [...items]
            .sort((left, right) => left.applicantIndex - right.applicantIndex)
            .map(passportUploadFromIntakeItem),
          type: packageType,
        },
        setPersistenceProgress,
      );
    } catch {
      setActionError(
        "Не удалось сохранить подачу. Уже сохранённые паспорта не дублируются — повторите попытку.",
      );
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
      setPersistenceProgress(null);
    }
  };

  const assignmentIndices = pendingAssignments.map(
    (assignment) => assignment.applicantIndex,
  );
  const assignmentsComplete =
    pendingAssignments.length > 0 &&
    assignmentIndices.every((index): index is number => typeof index === "number") &&
    new Set(assignmentIndices).size === assignmentIndices.length;

  const confirmAssignments = () => {
    if (!assignmentsComplete) return;
    const assignments = pendingAssignments as Array<
      PendingAssignment & { applicantIndex: number }
    >;
    setPendingAssignments([]);
    for (const assignment of assignments)
      addPassport(assignment.file, assignment.applicantIndex);
  };

  const closePrefill = () => {
    setMobilePrefillOpen(false);
    window.requestAnimationFrame(() =>
      prefillTriggerRef.current?.focus({ preventScroll: true }),
    );
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (confirmation) setConfirmation(null);
      else if (pendingAssignments.length) setPendingAssignments([]);
      else if (mobilePrefillOpen) closePrefill();
      else requestClose();
      return;
    }
    trapFocus(event, dialogRef.current);
  };

  const activeApplicantLabel = applicantDisplayLabel(
    activeApplicantIndex,
    packageType,
    activeItem,
  );

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      aria-labelledby="create-submission-title"
      aria-modal="true"
      className="v19-preupload-screen fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--v19-depth-canvas)] text-[var(--v19-depth-text)]"
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.992, y: 18 }}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      onKeyDown={handleDialogKeyDown}
      ref={dialogRef}
      role="dialog"
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <header className="v19-preupload-header flex h-[64px] shrink-0 items-center gap-4 border-b border-[var(--v19-depth-border)] bg-[var(--v19-depth-page)] px-4 backdrop-blur-md lg:px-6">
        <button
          {...agentInteractionProps("new-submission.back")}
          aria-label="Назад"
          className="v19-preupload-icon-button"
          disabled={actionPending}
          onClick={requestClose}
        >
          <ArrowLeft aria-hidden="true" className="h-4.5 w-4.5" />
        </button>
        <div>
          <h1
            className="mt-1 text-[19px] font-semibold leading-none tracking-tight lg:text-[21px]"
            id="create-submission-title"
            ref={headingRef}
            tabIndex={-1}
          >
            Новая подача
          </h1>
          <p className="v19-preupload-header-hint">
            Паспорт обрабатывается локально и требует проверки
          </p>
        </div>
        <button
          {...agentInteractionProps("new-submission.back")}
          aria-label="Закрыть создание"
          className="v19-preupload-close-button"
          disabled={actionPending}
          onClick={requestClose}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </header>

      <main className="v19-preupload-main h-[calc(100dvh-64px)] min-h-0 flex-1 overflow-hidden p-0">
        <div className="v19-preupload-layout grid h-full min-h-full w-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] xl:gap-6 xl:p-6">
          <section className="v19-preupload-primary flex h-full min-h-0 flex-col">
            <motion.div className="v19-preupload-card relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-gradient-to-br from-[var(--v19-depth-panel-strong)] to-[var(--v19-depth-page)] px-5 pb-0 pt-5 shadow-[var(--v19-depth-shadow-panel)] lg:px-6 lg:pt-6 xl:rounded-3xl xl:border xl:border-[var(--v19-depth-border-strong)]">
              <motion.div
                animate={
                  reduceMotion
                    ? undefined
                    : { opacity: [0.55, 0.8, 0.55], scale: [1, 1.12, 1] }
                }
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--v19-depth-accent-soft)] blur-3xl"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 4, ease: "easeInOut", repeat: Infinity }
                }
              />

              <div className="relative z-10 mb-4 shrink-0 space-y-3">
                <div className="v19-preupload-setup-row">
                  <div
                    aria-label="Тип подачи"
                    className="v19-preupload-package-toggle flex rounded-full border border-[var(--v19-depth-border-strong)] bg-[var(--v19-depth-page)] p-1 shadow-[var(--v19-depth-inner-highlight)]"
                    role="radiogroup"
                  >
                    {[
                      { icon: UsersRound, label: "Семья", type: "family" as const },
                      { icon: UserRound, label: "Заявитель", type: "single" as const },
                    ].map((option) => {
                      const Icon = option.icon;
                      const active = packageType === option.type;
                      return (
                        <button
                          {...agentInteractionProps("new-submission.configure")}
                          aria-checked={active}
                          className={`v19-preupload-package-option ${active ? "is-active" : ""}`}
                          disabled={actionPending}
                          key={option.type}
                          onClick={() => requestSwitchType(option.type)}
                          role="radio"
                          type="button"
                        >
                          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  <label className="v19-preupload-city-field">
                    <span>Город подачи</span>
                    <select
                      {...agentInteractionProps("new-submission.configure")}
                      aria-invalid={!city}
                      disabled={actionPending}
                      onChange={(event) =>
                        setCity(event.currentTarget.value as City | "")
                      }
                      value={city}
                    >
                      <option value="">Выберите город</option>
                      {CANONICAL_CITIES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="v19-preupload-applicant-controls">
                  <div
                    className="v19-preupload-applicant-grid"
                    data-package-type={packageType}
                    data-testid={`preupload-${packageType}-grid`}
                    role="list"
                  >
                    {Array.from({ length: applicantCount }, (_, applicantIndex) => {
                      const item = assignedItems.get(applicantIndex);
                      const applicantLabel = applicantDisplayLabel(
                        applicantIndex,
                        packageType,
                        item,
                      );
                      const removable = packageType === "family" && applicantIndex >= 2;
                      const active = activeApplicantIndex === applicantIndex;
                      return (
                        <article
                          aria-current={active ? "true" : undefined}
                          className={[
                            item ? "has-file" : "",
                            item?.status === "ready" ? "is-recognized" : "",
                            active ? "is-active" : "",
                            packageType === "single" ? "is-single" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={applicantIndex}
                          role="listitem"
                        >
                          <button
                            {...agentInteractionProps("new-submission.choose-files")}
                            aria-label={`${item ? "Заменить" : "Загрузить"} паспорт: ${applicantLabel}`}
                            className="v19-preupload-applicant-label"
                            disabled={actionPending || busyItems.length > 0}
                            onClick={() => {
                              setActiveApplicantIndex(applicantIndex);
                              openFilePicker(applicantIndex);
                            }}
                            onFocus={primeOcr}
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className="v19-preupload-applicant-order"
                            >
                              {applicantIndex + 1}
                            </span>
                            <span className="v19-preupload-applicant-copy">
                              <span className="v19-preupload-applicant-name">
                                {applicantLabel}
                              </span>
                              <span className="v19-preupload-applicant-details">
                                {applicantCompactDetails(item)}
                              </span>
                              <span className="v19-preupload-applicant-state">
                                {statusLabel(item)}
                              </span>
                            </span>
                          </button>
                          <button
                            {...agentInteractionProps(
                              item || removable
                                ? "new-submission.manage-file"
                                : "new-submission.choose-files",
                            )}
                            aria-label={
                              item
                                ? `Удалить паспорт: ${applicantLabel}`
                                : removable
                                  ? `Удалить заявителя ${applicantIndex + 1}`
                                  : `Открыть загрузку паспорта: ${applicantLabel}`
                            }
                            className="v19-preupload-applicant-icon"
                            disabled={actionPending || busyItems.length > 0}
                            onClick={() => {
                              setActiveApplicantIndex(applicantIndex);
                              if (item) clearApplicantPassport(applicantIndex);
                              else if (removable)
                                requestRemoveApplicant(applicantIndex);
                              else openFilePicker(applicantIndex);
                            }}
                            type="button"
                          >
                            {removable && !item ? (
                              <X aria-hidden="true" />
                            ) : (
                              <>
                                <BookUser
                                  aria-hidden="true"
                                  className="v19-preupload-passport-icon"
                                />
                                {item ? (
                                  <X
                                    aria-hidden="true"
                                    className="v19-preupload-remove-icon"
                                  />
                                ) : null}
                              </>
                            )}
                          </button>
                        </article>
                      );
                    })}
                    {packageType === "family" ? (
                      <article className="v19-preupload-add-applicant" role="listitem">
                        <button
                          {...agentInteractionProps("new-submission.configure")}
                          aria-label={
                            applicantCount >= submissionIntakeFamilyMax
                              ? `Максимум ${submissionIntakeFamilyMax} заявителей`
                              : "Добавить следующего заявителя"
                          }
                          disabled={
                            actionPending ||
                            busyItems.length > 0 ||
                            applicantCount >= submissionIntakeFamilyMax
                          }
                          onClick={() =>
                            setFamilyApplicantCount((current) =>
                              Math.min(submissionIntakeFamilyMax, current + 1),
                            )
                          }
                          type="button"
                        >
                          <Plus aria-hidden="true" />
                          <span className="sr-only">Добавить заявителя</span>
                        </button>
                      </article>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="v19-preupload-upload-group">
                {busyItems.length ? (
                  <div
                    aria-live="polite"
                    className="v19-preupload-progress-stack"
                    role="status"
                  >
                    <div className="v19-preupload-progress-status">
                      <span>Локальный OCR</span>
                      <strong>
                        {completedOcrCount} из {items.length}
                      </strong>
                    </div>
                    <div
                      aria-label="Извлечение данных из паспорта"
                      className="v19-preupload-progress-line is-indeterminate"
                      role="progressbar"
                    >
                      <span />
                    </div>
                    {activeItem &&
                    (activeItem.status === "extracting" ||
                      activeItem.status === "selected") ? (
                      <button
                        className="v19-preupload-inline-action"
                        onClick={() => skipOcr(activeItem)}
                        type="button"
                      >
                        Пропустить OCR
                      </button>
                    ) : null}
                  </div>
                ) : activeItem &&
                  (activeItem.status === "failed" ||
                    activeItem.status === "unavailable") ? (
                  <div className="v19-preupload-manual-state" role="status">
                    <span>{activeItem.summary}</span>
                    <button onClick={() => retryOcr(activeItem)} type="button">
                      Повторить OCR
                    </button>
                  </div>
                ) : null}

                <button
                  {...agentInteractionProps("new-submission.choose-files")}
                  aria-label="Выбрать файлы"
                  className={`v19-preupload-dropzone relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed p-6 text-center transition-colors ${dropActive ? "is-drag-active" : ""}`}
                  disabled={actionPending || busyItems.length > 0}
                  onClick={() => openFilePicker(null)}
                  onDragEnter={primeOcr}
                  onDragLeave={() => setDropActive(false)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropActive(true);
                    primeOcr();
                  }}
                  onDrop={handleDrop}
                  onFocus={primeOcr}
                  onPointerEnter={primeOcr}
                  type="button"
                >
                  {!reduceMotion ? (
                    <motion.div
                      aria-hidden="true"
                      animate={{ opacity: [0.1, 0.9, 0.1], y: [0, 250, 0] }}
                      className="v19-preupload-scan-line"
                      transition={{
                        duration: 2.8,
                        ease: "easeInOut",
                        repeat: Infinity,
                      }}
                    />
                  ) : null}
                  <motion.div
                    animate={
                      reduceMotion
                        ? undefined
                        : {
                            rotate: dropActive ? 2 : 0,
                            scale: busyItems.length ? [1, 1.06, 1] : 1,
                          }
                    }
                    className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--v19-depth-accent-border)] bg-[var(--v19-depth-accent-soft)]"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 1.2, repeat: busyItems.length ? Infinity : 0 }
                    }
                  >
                    {busyItems.length ? (
                      <Wand2
                        aria-hidden="true"
                        className="h-6 w-6 text-[var(--v19-depth-accent-text)]"
                      />
                    ) : (
                      <UploadCloud
                        aria-hidden="true"
                        className="h-6 w-6 text-[var(--v19-depth-accent-text)]"
                      />
                    )}
                  </motion.div>
                  <h3 className="text-[18px] font-semibold text-white">
                    {activeItem
                      ? `Заменить паспорт: ${activeApplicantLabel}`
                      : `Паспорт: ${activeApplicantLabel}`}
                  </h3>
                  <p className="v19-preupload-dropzone-copy">
                    {passportScanUploadFormatLabel}, до 50 МБ. OCR выполняется локально;
                    файл загрузится только после сохранения.
                  </p>
                  <span className="v19-file-picker-button mt-3">Выбрать файл</span>
                </button>
                <input
                  {...agentInteractionProps("new-submission.choose-files")}
                  accept={passportScanUploadAccept}
                  className="hidden"
                  disabled={actionPending}
                  multiple={packageType === "family"}
                  onChange={handleFileInput}
                  ref={fileInputRef}
                  type="file"
                />
              </div>

              <div className="v19-preupload-footer sticky bottom-0 z-20 -mx-5 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--v19-depth-border)] bg-[var(--v19-depth-page)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:-mx-6 lg:px-6 xl:rounded-b-3xl">
                {actionError ? (
                  <p className="v19-preupload-action-error" role="alert">
                    {actionError}
                  </p>
                ) : null}
                {submissionDisabledReason && !actionPending ? (
                  <p
                    className="v19-preupload-disabled-reason"
                    id="preupload-disabled-reason"
                  >
                    {submissionDisabledReason}
                  </p>
                ) : null}
                <button
                  {...agentInteractionProps("new-submission.save-draft")}
                  aria-describedby={
                    submitDisabled ? "preupload-disabled-reason" : undefined
                  }
                  className="v19-preupload-secondary-action"
                  disabled={submitDisabled}
                  onClick={() => void submit("list")}
                  type="button"
                >
                  {actionPending
                    ? persistenceLabel(persistenceProgress)
                    : "Сохранить черновик"}
                </button>
                <button
                  {...agentInteractionProps("new-submission.continue")}
                  aria-describedby={
                    submitDisabled ? "preupload-disabled-reason" : undefined
                  }
                  className="v19-preupload-primary-action"
                  disabled={submitDisabled}
                  onClick={() => void submit("questionnaire")}
                  type="button"
                >
                  {actionPending
                    ? persistenceLabel(persistenceProgress)
                    : items.length
                      ? "Создать и открыть анкету"
                      : "Продолжить без паспорта"}
                </button>
              </div>
            </motion.div>
          </section>

          <aside className="v19-preupload-rail hidden min-h-0 space-y-5 xl:block">
            <div className="sticky top-0 hidden overflow-hidden rounded-2xl border border-[var(--v19-depth-border-strong)] bg-[var(--v19-depth-panel)] p-5 shadow-[var(--v19-depth-shadow-card)] xl:flex xl:h-[calc(100dvh-112px)] xl:max-h-[calc(100dvh-112px)] xl:flex-col">
              <div className="v19-preupload-prefill-heading">
                <div className="flex items-center justify-between gap-3">
                  <h3>Prefill-поля</h3>
                  <span>
                    {activeApplicantIndex + 1}/{applicantCount}
                  </span>
                </div>
                <p>{activeApplicantLabel}. Все OCR-поля потребуют проверки в анкете.</p>
              </div>
              <PrefillPreviewList fields={previewFields} reduceMotion={reduceMotion} />
            </div>
          </aside>

          {!mobilePrefillOpen ? (
            <button
              {...agentInteractionProps("new-submission.toggle-prefill")}
              aria-label="Открыть распознанные OCR-поля"
              className="v19-preupload-prefill-trigger"
              onClick={() => setMobilePrefillOpen(true)}
              ref={prefillTriggerRef}
              type="button"
            >
              <Wand2 aria-hidden="true" />
              <span>OCR</span>
              <strong>{previewFields.length}</strong>
            </button>
          ) : null}

          <AnimatePresence>
            {mobilePrefillOpen ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="v19-preupload-prefill-overlay"
                exit={{ opacity: 0 }}
                initial={reduceMotion ? false : { opacity: 0 }}
              >
                <button
                  aria-label="Закрыть распознанные OCR-поля"
                  className="v19-preupload-prefill-backdrop"
                  onClick={closePrefill}
                  type="button"
                />
                <motion.section
                  animate={{ opacity: 1, y: 0 }}
                  aria-label="Распознанные OCR-поля"
                  aria-modal="true"
                  className="v19-preupload-prefill-sheet"
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
                  initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closePrefill();
                    } else trapFocus(event, prefillSheetRef.current);
                  }}
                  ref={prefillSheetRef}
                  role="dialog"
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
                >
                  <div
                    aria-hidden="true"
                    className="v19-preupload-prefill-sheet-handle"
                  />
                  <header className="v19-preupload-prefill-sheet-header">
                    <div>
                      <h3>Prefill-поля</h3>
                      <p>{activeApplicantLabel}</p>
                    </div>
                    <span>{previewFields.length} полей</span>
                    <button aria-label="Закрыть" onClick={closePrefill} type="button">
                      <X aria-hidden="true" />
                    </button>
                  </header>
                  <PrefillPreviewList
                    fields={previewFields}
                    reduceMotion={reduceMotion}
                  />
                </motion.section>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {pendingAssignments.length ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="v19-preupload-modal-overlay"
                exit={{ opacity: 0 }}
                initial={false}
              >
                <motion.section
                  aria-labelledby="passport-assignment-title"
                  aria-modal="true"
                  className="v19-preupload-assignment-dialog"
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setPendingAssignments([]);
                    } else trapFocus(event, assignmentDialogRef.current);
                  }}
                  ref={assignmentDialogRef}
                  role="dialog"
                >
                  <header>
                    <div>
                      <h2 id="passport-assignment-title">Назначьте паспорта</h2>
                      <p>Для каждого файла явно выберите владельца.</p>
                    </div>
                    <button
                      aria-label="Закрыть назначение"
                      onClick={() => setPendingAssignments([])}
                      type="button"
                    >
                      <X aria-hidden="true" />
                    </button>
                  </header>
                  <div className="v19-preupload-assignment-list">
                    {pendingAssignments.map((assignment) => (
                      <label key={assignment.id}>
                        <span title={assignment.file.name}>{assignment.file.name}</span>
                        <select
                          aria-label={`Заявитель для ${assignment.file.name}`}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setPendingAssignments((current) =>
                              current.map((candidate) =>
                                candidate.id === assignment.id
                                  ? {
                                      ...candidate,
                                      applicantIndex: value === "" ? "" : Number(value),
                                    }
                                  : candidate,
                              ),
                            );
                          }}
                          value={assignment.applicantIndex}
                        >
                          <option value="">Выберите заявителя</option>
                          {Array.from({ length: applicantCount }, (_, index) => {
                            const usedElsewhere = pendingAssignments.some(
                              (candidate) =>
                                candidate.id !== assignment.id &&
                                candidate.applicantIndex === index,
                            );
                            const occupied = items.some(
                              (item) => item.applicantIndex === index,
                            );
                            return (
                              <option
                                disabled={usedElsewhere || occupied}
                                key={index}
                                value={index}
                              >
                                {applicantRoleLabel(index, packageType)}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ))}
                  </div>
                  <footer>
                    <button onClick={() => setPendingAssignments([])} type="button">
                      Отмена
                    </button>
                    <button
                      disabled={!assignmentsComplete}
                      onClick={confirmAssignments}
                      type="button"
                    >
                      Запустить OCR
                    </button>
                  </footer>
                </motion.section>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {confirmation ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="v19-preupload-modal-overlay"
                exit={{ opacity: 0 }}
                initial={false}
              >
                <motion.section
                  aria-labelledby="preupload-confirmation-title"
                  aria-modal="true"
                  className="v19-preupload-confirmation-dialog"
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setConfirmation(null);
                    } else trapFocus(event, confirmationDialogRef.current);
                  }}
                  ref={confirmationDialogRef}
                  role="alertdialog"
                >
                  <h2 id="preupload-confirmation-title">
                    {confirmation.kind === "close"
                      ? "Закрыть без сохранения?"
                      : "Удалить выбранные паспорта?"}
                  </h2>
                  <p>
                    {confirmation.kind === "close"
                      ? "Несохранённые файлы и результаты OCR будут потеряны."
                      : "Файлы не загружались в хранилище и будут удалены только из текущего черновика."}
                  </p>
                  <footer>
                    <button onClick={() => setConfirmation(null)} type="button">
                      Остаться
                    </button>
                    <button className="is-danger" onClick={confirmAction} type="button">
                      Продолжить
                    </button>
                  </footer>
                </motion.section>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>
    </motion.div>
  );
}
