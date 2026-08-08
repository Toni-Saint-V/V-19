import {
  mergeSmartImportParsedResults,
  parseSmartImportText,
  type SmartImportParsedResult,
} from "./smartImport";

export type SmartImportExtractionErrorCode =
  | "cancelled"
  | "empty_source"
  | "file_too_large"
  | "ocr_failed"
  | "source_too_large"
  | "too_many_files"
  | "unsupported_type";

export class SmartImportExtractionError extends Error {
  readonly code: SmartImportExtractionErrorCode;

  constructor(code: SmartImportExtractionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SmartImportExtractionError";
    this.code = code;
  }
}

export type SmartImportFileExtractionAdapters = {
  extractPdfText: (file: File, signal: AbortSignal) => Promise<string>;
  recognizeImage: (
    image: unknown,
    language: "eng" | "rus+eng",
    signal: AbortSignal,
  ) => Promise<string>;
};

export type SmartImportFileExtractionOptions = {
  adapters?: SmartImportFileExtractionAdapters;
  signal?: AbortSignal;
};

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 12 * 1024 * 1024;
const maxPdfBytes = 25 * 1024 * 1024;
const maxPastedTextCharacters = 100_000;
const maxExtractedTextCharacters = 200_000;
const maxPackageFiles = 10;
const maxPackageBytes = 60 * 1024 * 1024;
const maxPdfOcrPages = 8;
const imageOcrTimeoutMs = 45_000;
const pdfExtractionTimeoutMs = 75_000;
const pdfOcrScale = 2;

const localTesseractWorkerOptions = {
  cacheMethod: "none",
  corePath: "/tesseract/core",
  gzip: true,
  langPath: "/tesseract/lang",
  workerBlobURL: false,
  workerPath: "/tesseract/worker.min.js",
};

const localTesseractParameters = {
  preserve_interword_spaces: "1",
  tessedit_pageseg_mode: "4",
};

const localTesseractRecognitionOptions = {
  rotateAuto: true,
};

const defaultAdapters: SmartImportFileExtractionAdapters = {
  extractPdfText: extractPdfTextLocally,
  recognizeImage: recognizeImageLocally,
};

export async function extractSmartImportFromText(
  text: string,
): Promise<SmartImportParsedResult> {
  if (text.length > maxPastedTextCharacters) {
    throw new SmartImportExtractionError(
      "source_too_large",
      "Текст слишком большой. Оставьте только данные, которые нужно перенести в анкету.",
    );
  }
  return parseSmartImportText(text);
}

export async function extractSmartImportFromFile(
  file: File,
  options: SmartImportFileExtractionOptions = {},
): Promise<SmartImportParsedResult> {
  const signal = options.signal ?? new AbortController().signal;
  throwIfCancelled(signal);

  const sourceType = validateSmartImportFile(file);

  const adapters = options.adapters ?? defaultAdapters;
  let sourceText = "";
  try {
    sourceText =
      sourceType === "pdf"
        ? await runWithDeadline(
            (deadlineSignal) => adapters.extractPdfText(file, deadlineSignal),
            signal,
            pdfExtractionTimeoutMs,
          )
        : await recognizeWithLanguageFallback(file, adapters, signal);
    throwIfCancelled(signal);

    if (sourceText.length > maxExtractedTextCharacters) {
      sourceText = sourceText.slice(0, maxExtractedTextCharacters);
    }
    return parseSmartImportText(sourceText);
  } catch (error) {
    if (error instanceof SmartImportExtractionError) throw error;
    if (isAbortError(error) || signal.aborted) {
      throw cancelledError(error);
    }
    throw new SmartImportExtractionError(
      "ocr_failed",
      "Не удалось прочитать источник. Попробуйте более чёткое фото, PDF с текстом или вставьте данные вручную.",
      { cause: error },
    );
  } finally {
    sourceText = "";
  }
}

export async function extractSmartImportFromFiles(
  files: readonly File[],
  options: SmartImportFileExtractionOptions = {},
): Promise<SmartImportParsedResult> {
  const signal = options.signal ?? new AbortController().signal;
  throwIfCancelled(signal);
  if (!files.length) {
    throw new SmartImportExtractionError(
      "empty_source",
      "Выберите хотя бы один файл.",
    );
  }
  if (files.length > maxPackageFiles) {
    throw new SmartImportExtractionError(
      "too_many_files",
      "За один раз можно обработать не больше 10 файлов.",
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    validateSmartImportFile(file);
    totalBytes += file.size;
    if (totalBytes > maxPackageBytes) {
      throw new SmartImportExtractionError(
        "source_too_large",
        "Пакет слишком большой. Максимальный общий размер: 60 МБ.",
      );
    }
  }

  const results: SmartImportParsedResult[] = [];
  for (const file of files) {
    throwIfCancelled(signal);
    results.push(await extractSmartImportFromFile(file, options));
  }
  throwIfCancelled(signal);
  return mergeSmartImportParsedResults(results);
}

function validateSmartImportFile(file: File): "image" | "pdf" {
  const sourceType = smartImportSourceType(file);
  if (!sourceType) {
    throw new SmartImportExtractionError(
      "unsupported_type",
      "Можно загрузить JPG, PNG, WEBP или PDF.",
    );
  }

  const byteLimit = sourceType === "pdf" ? maxPdfBytes : maxImageBytes;
  if (file.size > byteLimit) {
    throw new SmartImportExtractionError(
      "file_too_large",
      sourceType === "pdf"
        ? "PDF слишком большой. Максимальный размер: 25 МБ."
        : "Изображение слишком большое. Максимальный размер: 12 МБ.",
    );
  }
  return sourceType;
}

function smartImportSourceType(file: File): "image" | "pdf" | undefined {
  const mimeType = file.type.trim().toLowerCase();
  if (supportedImageTypes.has(mimeType)) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (!mimeType && file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return undefined;
}

async function recognizeWithLanguageFallback(
  image: unknown,
  adapters: SmartImportFileExtractionAdapters,
  signal: AbortSignal,
) {
  try {
    const bilingualText = await runWithDeadline(
      (deadlineSignal) => adapters.recognizeImage(image, "rus+eng", deadlineSignal),
      signal,
      imageOcrTimeoutMs,
    );
    if (bilingualText.trim()) return bilingualText;
  } catch (error) {
    if (isCancellation(error) || signal.aborted) {
      throw cancellationForSignal(signal, error);
    }
  }

  return runWithDeadline(
    (deadlineSignal) => adapters.recognizeImage(image, "eng", deadlineSignal),
    signal,
    imageOcrTimeoutMs,
  );
}

type TesseractRecognizeResponse = {
  data: {
    text?: string;
  };
};

export type SmartImportOcrWorker = {
  recognize: (
    image: unknown,
    options?: { rotateAuto?: boolean },
  ) => Promise<TesseractRecognizeResponse>;
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

export type SmartImportOcrWorkerFactory = (
  language: string,
  oem: number,
  options: typeof localTesseractWorkerOptions,
) => Promise<SmartImportOcrWorker>;

type SmartImportTesseractModule = {
  createWorker?: SmartImportOcrWorkerFactory;
  default?: {
    createWorker?: SmartImportOcrWorkerFactory;
  };
};

async function loadSmartImportOcrWorkerFactory() {
  // tesseract.js does not publish declarations for this runtime subpath.
  const tesseract = (await import(
    // @ts-expect-error runtime subpath is already used by the production passport OCR flow.
    "tesseract.js/src/index.js"
  )) as unknown as SmartImportTesseractModule;
  const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
  if (!createWorker) throw new Error("Local OCR runtime is unavailable.");
  return createWorker;
}

export async function recognizeSmartImportImageLocally(
  image: unknown,
  language: "eng" | "rus+eng",
  signal: AbortSignal,
  workerFactory?: SmartImportOcrWorkerFactory,
) {
  throwIfCancelled(signal);
  const createWorker = workerFactory ?? (await loadSmartImportOcrWorkerFactory());
  throwIfCancelled(signal);

  let worker: SmartImportOcrWorker | undefined;
  let termination: Promise<void> | undefined;
  const terminate = () => {
    if (!worker) return Promise.resolve();
    termination ??= Promise.resolve(worker.terminate()).then(
      () => undefined,
      () => undefined,
    );
    return termination;
  };
  const onAbort = () => {
    void terminate();
  };

  try {
    worker = await createWorker(language, 1, localTesseractWorkerOptions);
    if (signal.aborted) {
      await terminate();
      throw cancellationForSignal(signal);
    }
    signal.addEventListener("abort", onAbort, { once: true });
    await worker.setParameters?.(localTesseractParameters);
    throwIfCancelled(signal);
    const response = await raceTaskWithSignal(
      worker.recognize(image, localTesseractRecognitionOptions),
      signal,
    );
    throwIfCancelled(signal);
    return response.data.text?.trim() ?? "";
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw cancellationForSignal(signal, error);
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    await terminate();
  }
}

async function recognizeImageLocally(
  image: unknown,
  language: "eng" | "rus+eng",
  signal: AbortSignal,
) {
  return recognizeSmartImportImageLocally(image, language, signal);
}

type PdfTextItem = { str?: string };
type PdfViewport = { height: number; width: number };
type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  getViewport: (input: { scale: number }) => PdfViewport;
  render: (input: { canvasContext: unknown; viewport: PdfViewport }) => {
    promise: Promise<void>;
  };
};
type PdfDocument = {
  destroy?: () => Promise<void> | void;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  numPages: number;
};
type PdfLoadingTask = {
  destroy?: () => Promise<void> | void;
  promise: Promise<PdfDocument>;
};
type BrowserCanvas = {
  getContext: (contextId: "2d") => unknown;
  height: number;
  width: number;
};
type BrowserDocument = {
  createElement: (tagName: "canvas") => BrowserCanvas;
};

async function extractPdfTextLocally(file: File, signal: AbortSignal) {
  throwIfCancelled(signal);
  const browserDocument = (
    globalThis as typeof globalThis & { document?: BrowserDocument }
  ).document;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const bytes = new Uint8Array(await file.arrayBuffer());
  throwIfCancelled(signal);
  let loadingTask: PdfLoadingTask | undefined;
  let pdfDocument: PdfDocument | undefined;
  const abortPdfLoading = () => {
    void loadingTask?.destroy?.();
  };
  signal.addEventListener("abort", abortPdfLoading, { once: true });
  try {
    loadingTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false }) as PdfLoadingTask;
    pdfDocument = await raceTaskWithSignal(loadingTask.promise, signal);

    const pageText: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      throwIfCancelled(signal);
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => (typeof item.str === "string" ? item.str : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text) pageText.push(text);
    }
    const textLayer = pageText.join("\n\n").trim();
    if (textLayer) return textLayer;

    if (!browserDocument) {
      throw new Error("A browser canvas is required for scanned PDF OCR.");
    }

    const recognizedPages: string[] = [];
    const pageLimit = Math.min(pdfDocument.numPages, maxPdfOcrPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      throwIfCancelled(signal);
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: pdfOcrScale });
      const canvas = browserDocument.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PDF OCR canvas context is unavailable.");
        await page.render({ canvasContext: context, viewport }).promise;
        const text = await recognizeWithLanguageFallback(
          canvas,
          defaultAdapters,
          signal,
        );
        if (text.trim()) recognizedPages.push(text.trim());
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
    return recognizedPages.join("\n\n").trim();
  } finally {
    signal.removeEventListener("abort", abortPdfLoading);
    try {
      bytes.fill(0);
    } catch {
      // PDF.js may detach the transferred ArrayBuffer before cleanup.
    }
    await pdfDocument?.destroy?.();
    await loadingTask?.destroy?.();
  }
}

function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) throw cancellationForSignal(signal);
}

function cancelledError(cause?: unknown) {
  return new SmartImportExtractionError(
    "cancelled",
    "Распознавание отменено.",
    cause === undefined ? undefined : { cause },
  );
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}

function isCancellation(error: unknown) {
  return (
    (error instanceof SmartImportExtractionError && error.code === "cancelled") ||
    isAbortError(error)
  );
}

function cancellationForSignal(signal: AbortSignal, cause?: unknown) {
  if (signal.reason instanceof SmartImportExtractionError) return signal.reason;
  return cancelledError(cause ?? signal.reason);
}

function raceTaskWithSignal<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(cancellationForSignal(signal));
      return;
    }

    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => settle(() => reject(cancellationForSignal(signal)));
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    );
  });
}

async function runWithDeadline<T>(
  task: (signal: AbortSignal) => Promise<T>,
  externalSignal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  throwIfCancelled(externalSignal);
  const controller = new AbortController();
  const timeoutError = new SmartImportExtractionError(
    "ocr_failed",
    "Локальное распознавание не успело завершиться.",
  );
  const onExternalAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(cancelledError(externalSignal.reason));
    }
  };
  externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  const timeout = globalThis.setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(timeoutError);
  }, timeoutMs);

  try {
    return await raceTaskWithSignal(
      Promise.resolve().then(() => task(controller.signal)),
      controller.signal,
    );
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal.removeEventListener("abort", onExternalAbort);
  }
}
