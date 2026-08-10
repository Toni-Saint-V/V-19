import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlertTriangle,
  FileUp,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { agentInteractionProps } from "../agentInteractionContract";
import {
  buildSmartImportReview,
  mergeSmartImportParsedResults,
  smartImportDocumentKindLabel,
  type SmartImportParsedResult,
  type SmartImportReview,
  type SmartImportReviewItem,
} from "../smartImport";
import {
  SmartImportExtractionError,
  extractSmartImportFromFile,
  extractSmartImportFromFiles,
  extractSmartImportFromText,
} from "../smartImportFileExtraction";
import "./smart-import.css";

export type SmartImportDialogExtraction = {
  fromFile: (
    file: File,
    options: { signal: AbortSignal },
  ) => Promise<SmartImportParsedResult>;
  fromFiles?: (
    files: readonly File[],
    options: { signal: AbortSignal },
  ) => Promise<SmartImportParsedResult>;
  fromText: (text: string) => Promise<SmartImportParsedResult>;
};

type SmartImportDialogProps = {
  applicantKey: string;
  currentValues: Readonly<Record<string, string | undefined>>;
  extraction?: SmartImportDialogExtraction;
  open: boolean;
  onApply: (items: SmartImportReviewItem[]) => void;
  onClose: () => void;
};

type ProcessingKind = "file" | "text" | null;

const defaultExtraction: SmartImportDialogExtraction = {
  fromFile: extractSmartImportFromFile,
  fromFiles: extractSmartImportFromFiles,
  fromText: extractSmartImportFromText,
};

async function sequentiallyExtractFiles(
  files: readonly File[],
  fromFile: SmartImportDialogExtraction["fromFile"],
  signal: AbortSignal,
) {
  const results: SmartImportParsedResult[] = [];
  for (const file of files) {
    if (signal.aborted) {
      throw new SmartImportExtractionError("cancelled", "Распознавание отменено.");
    }
    results.push(await fromFile(file, { signal }));
  }
  return results;
}

const statusCopy: Record<
  SmartImportReviewItem["status"],
  { label: string; tone: string }
> = {
  new: { label: "Новое значение", tone: "new" },
  same: { label: "Уже совпадает", tone: "same" },
  conflict: { label: "Конфликт с анкетой", tone: "conflict" },
  source_conflict: { label: "Расхождение источников", tone: "conflict" },
  low_confidence: { label: "Низкая уверенность", tone: "uncertain" },
};

const sectionCopy: Record<string, string> = {
  contacts: "Контакты",
  employment: "Работа",
  hotel: "Проживание",
  payment: "Поездка",
  personal: "Личные данные",
  trip: "Поездка",
};

function smartImportSectionLabel(sectionId: string) {
  return sectionCopy[sectionId] ?? "Анкета";
}

function smartImportSummarySegments(summary: string) {
  return summary
    .split(". ")
    .map((segment, index, segments) =>
      index < segments.length - 1 ? `${segment}.` : segment,
    )
    .filter(Boolean);
}

export function SmartImportDialog({
  applicantKey,
  currentValues,
  extraction = defaultExtraction,
  open,
  onApply,
  onClose,
}: SmartImportDialogProps) {
  const titleId = useId();
  const copyId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const operationRevisionRef = useRef(0);
  const previousApplicantRef = useRef(applicantKey);
  const reviewSectionRef = useRef<HTMLElement>(null);
  const [textInput, setTextInput] = useState("");
  const [processingKind, setProcessingKind] = useState<ProcessingKind>(null);
  const [processingFileCount, setProcessingFileCount] = useState(0);
  const [review, setReview] = useState<SmartImportReview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState("");

  const resetEphemeralState = useCallback(() => {
    operationRevisionRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setTextInput("");
    setProcessingKind(null);
    setProcessingFileCount(0);
    setReview(null);
    setSelectedIds(new Set());
    setErrorMessage("");
  }, []);

  const close = useCallback(() => {
    resetEphemeralState();
    onClose();
  }, [onClose, resetEphemeralState]);

  useEffect(() => {
    if (!open) {
      resetEphemeralState();
      return;
    }

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const target = returnFocusRef.current;
      if (!target || !document.contains(target)) return;
      window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
    };
  }, [open, resetEphemeralState]);

  useEffect(() => {
    if (previousApplicantRef.current === applicantKey) return;
    previousApplicantRef.current = applicantKey;
    resetEphemeralState();
  }, [applicantKey, resetEphemeralState]);

  useEffect(
    () => () => {
      operationRevisionRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!review?.items.length) return;

    const frame = window.requestAnimationFrame(() => {
      const reviewSection = reviewSectionRef.current;
      if (!reviewSection) return;
      reviewSection.scrollIntoView({ block: "start" });
      reviewSection.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [review]);

  const installReview = useCallback(
    (parsed: SmartImportParsedResult) => {
      const next = buildSmartImportReview({ currentValues, parsed });
      setReview(next);
      setSelectedIds(
        new Set(
          next.items.filter((item) => item.selectedByDefault).map((item) => item.id),
        ),
      );
      setErrorMessage(
        next.items.length
          ? ""
          : "Подходящие поля не найдены. Можно вставить более структурированный текст или заполнить вручную.",
      );
    },
    [currentValues],
  );

  const processFiles = useCallback(
    async (files: readonly File[]) => {
      if (!files.length) return;
      abortControllerRef.current?.abort();
      const operationRevision = operationRevisionRef.current + 1;
      operationRevisionRef.current = operationRevision;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setReview(null);
      setSelectedIds(new Set());
      setErrorMessage("");
      setProcessingKind("file");
      setProcessingFileCount(files.length);
      try {
        const parsed = extraction.fromFiles
          ? await extraction.fromFiles(files, { signal: controller.signal })
          : mergeSmartImportParsedResults(
              await sequentiallyExtractFiles(
                files,
                extraction.fromFile,
                controller.signal,
              ),
            );
        if (
          controller.signal.aborted ||
          operationRevisionRef.current !== operationRevision
        ) {
          return;
        }
        installReview(parsed);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof SmartImportExtractionError && error.code === "cancelled")
          return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось распознать источник. Попробуйте другой файл.",
        );
      } finally {
        if (
          abortControllerRef.current === controller &&
          operationRevisionRef.current === operationRevision
        ) {
          abortControllerRef.current = null;
          setProcessingKind(null);
          setProcessingFileCount(0);
        }
      }
    },
    [extraction, installReview],
  );

  const processText = useCallback(async () => {
    const source = textInput.trim();
    if (!source) {
      setErrorMessage("Вставьте текст, который нужно разобрать.");
      return;
    }
    setTextInput("");
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const operationRevision = operationRevisionRef.current + 1;
    operationRevisionRef.current = operationRevision;
    setReview(null);
    setSelectedIds(new Set());
    setErrorMessage("");
    setProcessingKind("text");
    try {
      const parsed = await extraction.fromText(source);
      if (operationRevisionRef.current !== operationRevision) return;
      installReview(parsed);
    } catch (error) {
      if (operationRevisionRef.current !== operationRevision) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось разобрать текст. Проверьте формат и повторите.",
      );
    } finally {
      if (operationRevisionRef.current === operationRevision) {
        setProcessingKind(null);
      }
    }
  }, [extraction, installReview, textInput]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) void processFiles(files);
  }

  function toggleItem(itemId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        const item = review?.items.find((candidate) => candidate.id === itemId);
        if (item) {
          for (const candidate of review?.items ?? []) {
            if (candidate.fieldId === item.fieldId) next.delete(candidate.id);
          }
        }
        next.add(itemId);
      }
      return next;
    });
  }

  const selectedItems = useMemo(
    () => review?.items.filter((item) => selectedIds.has(item.id)) ?? [],
    [review, selectedIds],
  );

  function applySelected() {
    if (!selectedItems.length) return;
    const safeSelection = selectedItems.map((item) => ({ ...item }));
    resetEphemeralState();
    onApply(safeSelection);
    onClose();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : (event.target as HTMLElement);
    const activeIndex = focusable.indexOf(active);
    if (event.shiftKey && (activeIndex === 0 || activeIndex === -1)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (
      !event.shiftKey &&
      (activeIndex === focusable.length - 1 || activeIndex === -1)
    ) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  if (!open) return null;

  const isProcessing = processingKind !== null;

  return (
    <div className="v19-smart-import-backdrop" data-testid="smart-import-backdrop">
      <div
        aria-describedby={copyId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="v19-smart-import-dialog"
        data-has-review={review?.items.length ? "true" : undefined}
        ref={dialogRef}
        role="dialog"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="v19-smart-import-header">
          <div className="v19-smart-import-title-lockup">
            <span aria-hidden="true" className="v19-smart-import-title-icon">
              <Sparkles size={18} strokeWidth={1.9} />
            </span>
            <div>
              <p className="v19-smart-import-eyebrow">Локальное распознавание</p>
              <h2 id={titleId}>Умный импорт</h2>
            </div>
          </div>
          <button
            {...agentInteractionProps("questionnaire.smart-import-cancel")}
            ref={closeButtonRef}
            aria-label="Закрыть умный импорт"
            className="v19-smart-import-icon-button"
            type="button"
            onClick={close}
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <p className="v19-smart-import-intro" id={copyId}>
          Добавьте фото, PDF или текст. VisaFlow найдёт данные и предложит заполнить
          анкету — без автоматической перезаписи.
        </p>

        <div className="v19-smart-import-privacy" role="note">
          <ShieldCheck aria-hidden="true" size={18} />
          <div>
            <strong>Фото, PDF и исходный текст не сохраняются.</strong>
            <span>
              Они обрабатываются только локально и очищаются после распознавания.
              Сохранятся только выбранные поля после подтверждения.
            </span>
          </div>
        </div>

        <section aria-label="Источник данных" className="v19-smart-import-source-grid">
          <label className="v19-smart-import-file-card">
            <input
              {...agentInteractionProps("questionnaire.smart-import-source")}
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-label="Выбрать фото или PDF"
              capture="environment"
              disabled={isProcessing}
              multiple
              type="file"
              onChange={handleFileChange}
            />
            <FileUp aria-hidden="true" size={22} />
            <span>
              <strong>Фото или PDF</strong>
              <small>
                До 10 файлов: анкеты, прописки, брони, билеты, справки или записки
              </small>
              <small>Русский текст — из PDF с текстовым слоем или вставкой.</small>
            </span>
          </label>

          <div className="v19-smart-import-text-card">
            <label htmlFor={`${titleId}-text`}>Вставить текст</label>
            <textarea
              {...agentInteractionProps("questionnaire.smart-import-source")}
              id={`${titleId}-text`}
              disabled={isProcessing}
              placeholder="Например: адрес, телефон, место работы, данные отеля…"
              rows={4}
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
            />
            <button
              {...agentInteractionProps("questionnaire.smart-import-run")}
              className="v19-smart-import-secondary-button"
              disabled={isProcessing || !textInput.trim()}
              type="button"
              onClick={() => void processText()}
            >
              Распознать текст
            </button>
          </div>
        </section>

        {isProcessing ? (
          <div aria-live="polite" className="v19-smart-import-processing" role="status">
            <LoaderCircle
              aria-hidden="true"
              className="v19-smart-import-spinner"
              size={20}
            />
            <div>
              <strong>Распознаём локально</strong>
              <span>
                {processingKind === "file"
                  ? processingFileCount > 1
                    ? `${processingFileCount} файлов обрабатываются по очереди и не загружаются на сервер.`
                    : "Файл не загружается на сервер."
                  : "Исходный текст очищен из формы."}
              </span>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="v19-smart-import-error" role="alert">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {review?.items.length ? (
          <section
            aria-label="Проверка распознанных полей"
            className="v19-smart-import-review"
            ref={reviewSectionRef}
            tabIndex={-1}
          >
            <div className="v19-smart-import-review-heading">
              <div className="v19-smart-import-review-heading-copy">
                <p>Проверьте перед применением</p>
                <div className="v19-smart-import-review-summary">
                  {smartImportSummarySegments(review.summary).map((segment) => (
                    <span key={segment}>{segment}</span>
                  ))}
                </div>
                <span
                  className="v19-smart-import-review-privacy"
                  data-testid="smart-import-review-privacy"
                  role="note"
                >
                  Файл обработан локально и очищается; сохраняются только выбранные
                  поля.
                </span>
              </div>
              <strong className="v19-smart-import-review-selection">
                <span>{selectedItems.length}</span> выбрано
              </strong>
            </div>

            <div className="v19-smart-import-review-list">
              {review.items.map((item) => {
                const status = statusCopy[item.status];
                return (
                  <label className="v19-smart-import-review-row" key={item.id}>
                    <input
                      {...agentInteractionProps("questionnaire.smart-import-review")}
                      aria-label={`Применить ${item.label}`}
                      checked={selectedIds.has(item.id)}
                      disabled={item.status === "same"}
                      name={
                        item.hasSourceAlternatives
                          ? `smart-import-${item.fieldId}`
                          : undefined
                      }
                      type={item.hasSourceAlternatives ? "radio" : "checkbox"}
                      onChange={() => toggleItem(item.id)}
                    />
                    <span className="v19-smart-import-review-copy">
                      <span className="v19-smart-import-review-meta">
                        <span className="v19-smart-import-review-heading-copy">
                          <strong>{item.label}</strong>
                          <small>
                            Раздел: {smartImportSectionLabel(item.sectionId)}
                          </small>
                        </span>
                        <em data-tone={status.tone}>{status.label}</em>
                      </span>
                      <span className="v19-smart-import-review-value">
                        {item.value}
                      </span>
                      {item.status === "conflict" && item.currentValue ? (
                        <small>Сейчас в анкете: {item.currentValue}</small>
                      ) : null}
                      {review.documentKind === "mixed_package" && item.sourceKind ? (
                        <small>
                          Источник: {smartImportDocumentKindLabel(item.sourceKind)}
                        </small>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ) : null}

        <footer className="v19-smart-import-footer">
          <button
            {...agentInteractionProps("questionnaire.smart-import-cancel")}
            className="linear-product-action linear-product-action--secondary v19-smart-import-ghost-button v19-smart-import-action--dark"
            type="button"
            onClick={close}
          >
            Отменить
          </button>
          <button
            {...agentInteractionProps("questionnaire.smart-import-apply")}
            className="linear-product-action linear-product-action--secondary v19-smart-import-primary-button v19-smart-import-action--dark"
            disabled={!selectedItems.length || isProcessing}
            type="button"
            onClick={applySelected}
          >
            Применить выбранное
          </button>
        </footer>
      </div>
    </div>
  );
}
