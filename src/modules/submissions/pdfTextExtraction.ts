import {
  maxVisaApplicationOcrPages,
  maxVisaApplicationPdfBytes,
  visaApplicationPdfParserVersion,
  type VisaApplicationPdfExtractionSource,
} from "./visaApplicationPdfReviewTypes";

export type ExtractedPdfText = {
  extractedPageCount: number;
  fileName: string;
  mimeType: string;
  ocrPageLimit: number;
  pageCount: number;
  parserVersion: number;
  sha256: string;
  sizeBytes: number;
  source: VisaApplicationPdfExtractionSource;
  text: string;
};

type PdfTextItem = {
  str?: unknown;
};

type PdfTextContent = {
  items: PdfTextItem[];
};

type PdfViewport = {
  height: number;
  width: number;
};

type PdfPageProxy = {
  getTextContent: () => Promise<PdfTextContent>;
  getViewport: (input: { scale: number }) => PdfViewport;
  render: (input: {
    canvasContext: unknown;
    viewport: unknown;
  }) => { promise: Promise<unknown> };
};

type PdfDocumentProxy = {
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  numPages: number;
};

type TesseractRecognizeResponse = {
  data: {
    text?: string;
  };
};

type TesseractRecognize = (
  image: unknown,
  language: string,
  options: Record<string, string>,
) => Promise<TesseractRecognizeResponse>;

type BrowserCanvas = {
  getContext: (contextId: "2d") => unknown;
  height: number;
  width: number;
};

type BrowserDocument = {
  createElement: (tagName: "canvas") => BrowserCanvas;
};

const visaApplicationOcrScale = 2;
const visaApplicationOcrTimeoutMs = 35_000;
const localTesseractOptions = {
  corePath: "/tesseract/core",
  langPath: "/tesseract/lang",
  workerPath: "/tesseract/worker.min.js",
};

export function isVisaApplicationPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function normalizeVisaApplicationPdfUploadFile(file: File) {
  if (file.type === "application/pdf") return file;
  return new File([file], file.name, {
    lastModified: file.lastModified,
    type: "application/pdf",
  });
}

export async function extractPdfTextFromFile(file: File): Promise<ExtractedPdfText> {
  if (!isVisaApplicationPdfFile(file)) {
    throw new Error("Загрузите PDF анкеты.");
  }
  if (file.size > maxVisaApplicationPdfBytes) {
    throw new Error("PDF анкеты слишком большой. Максимальный размер: 25 МБ.");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const arrayBuffer = await file.arrayBuffer();
  const sha256 = await sha256Hex(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer.slice(0));

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
  });
  const document = (await loadingTask.promise) as unknown as PdfDocumentProxy;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as PdfTextItem[])
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    pages.push(pageText);
  }

  const textLayerText = pages.join("\n\n").trim();
  const source = textLayerText ? "text_layer" : "local_ocr";
  const ocrResult = textLayerText ? null : await extractPdfTextWithLocalOcr(document);
  const text = textLayerText || ocrResult?.text || "";

  return {
    extractedPageCount: textLayerText
      ? document.numPages
      : (ocrResult?.extractedPageCount ?? 0),
    fileName: file.name,
    mimeType: "application/pdf",
    ocrPageLimit: maxVisaApplicationOcrPages,
    pageCount: document.numPages,
    parserVersion: visaApplicationPdfParserVersion,
    sha256,
    sizeBytes: file.size,
    source,
    text,
  };
}

async function sha256Hex(arrayBuffer: ArrayBuffer) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function extractPdfTextWithLocalOcr(document: PdfDocumentProxy) {
  const browserDocument = getBrowserDocument();
  if (!browserDocument) {
    throw new Error(
      "В PDF нет текстового слоя. Загрузите сформированную анкету PDF или PDF-скан в браузере.",
    );
  }

  const recognize = await loadLocalTesseractRecognize();
  const recognizedPages: string[] = [];
  const pageLimit = Math.min(document.numPages, maxVisaApplicationOcrPages);

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: visaApplicationOcrScale });
    const canvas = browserDocument.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PDF OCR canvas context is unavailable.");

    await page.render({ canvasContext: context, viewport }).promise;
    const response = await withVisaApplicationOcrTimeout(
      recognize(canvas, "eng", localTesseractOptions),
    );
    if (response.data.text?.trim()) recognizedPages.push(response.data.text.trim());
  }

  const text = recognizedPages.join("\n\n").trim();
  if (!text) {
    throw new Error(
      "В PDF нет текстового слоя, а локальный OCR не смог прочитать анкету. Загрузите сформированную PDF-анкету.",
    );
  }
  return {
    extractedPageCount: pageLimit,
    text,
  };
}

function getBrowserDocument() {
  return (globalThis as typeof globalThis & { document?: BrowserDocument }).document;
}

async function loadLocalTesseractRecognize(): Promise<TesseractRecognize> {
  // tesseract.js does not publish declarations for this recognize-only subpath.
  // @ts-expect-error see note above
  const tesseract = await import("tesseract.js/src/Tesseract.js");
  const recognize = tesseract.recognize ?? tesseract.default?.recognize;
  if (!recognize) throw new Error("Локальный OCR PDF недоступен.");
  return recognize as TesseractRecognize;
}

function withVisaApplicationOcrTimeout<T>(task: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error("Локальный OCR PDF не успел обработать анкету.")),
      visaApplicationOcrTimeoutMs,
    );

    task.then(
      (result) => {
        globalThis.clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
