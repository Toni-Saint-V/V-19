import { afterEach, describe, expect, test, vi } from "vitest";
import {
  extractPdfTextFromFile,
  isVisaApplicationPdfFile,
  normalizeVisaApplicationPdfUploadFile,
} from "../../src/modules/submissions/pdfTextExtraction";

describe("pdfTextExtraction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
    vi.doUnmock("tesseract.js/src/Tesseract.js");
  });

  test("accepts only PDF files for visa application review", async () => {
    const pdfByMime = new File(["x"], "form.bin", { type: "application/pdf" });
    const pdfByName = new File(["x"], "form.pdf", { type: "" });
    const image = new File(["x"], "passport.jpg", { type: "image/jpeg" });

    expect(isVisaApplicationPdfFile(pdfByMime)).toBe(true);
    expect(isVisaApplicationPdfFile(pdfByName)).toBe(true);
    expect(isVisaApplicationPdfFile(image)).toBe(false);
    await expect(extractPdfTextFromFile(image)).rejects.toThrow(
      "Загрузите PDF анкеты.",
    );
  });

  test("rejects oversized PDF files before parser and OCR work", async () => {
    const oversizedPdf = new File(["x"], "huge.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversizedPdf, "size", {
      value: 25 * 1024 * 1024 + 1,
    });

    await expect(extractPdfTextFromFile(oversizedPdf)).rejects.toThrow(
      "PDF анкеты слишком большой.",
    );
  });

  test("normalizes extension-only PDF files before Supabase storage upload", () => {
    const pdfByName = new File(["%PDF"], "returned.pdf", { type: "" });
    const normalized = normalizeVisaApplicationPdfUploadFile(pdfByName);

    expect(normalized.type).toBe("application/pdf");
    expect(normalized.name).toBe("returned.pdf");
    expect(normalized.size).toBe(pdfByName.size);
  });

  test("extracts text-layer PDF text with checksum calculated before PDF.js can mutate bytes", async () => {
    const originalBytes = new Uint8Array([1, 2, 3, 4]);
    const expectedSha256 = await sha256HexForTest(originalBytes);
    vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
      GlobalWorkerOptions: {},
      getDocument: ({ data }: { data: Uint8Array }) => {
        data.fill(0);
        return {
          promise: Promise.resolve({
            getPage: async () => ({
              getTextContent: async () => ({
                items: [{ str: "1. Apellido(s)" }, { str: "VOLKOV" }],
              }),
            }),
            numPages: 1,
          }),
        };
      },
    }));

    const result = await extractPdfTextFromFile(
      new File([originalBytes], "form.pdf", { type: "application/pdf" }),
    );

    expect(result).toMatchObject({
      extractedPageCount: 1,
      mimeType: "application/pdf",
      ocrPageLimit: 4,
      pageCount: 1,
      parserVersion: 1,
      sha256: expectedSha256,
      source: "text_layer",
      text: "1. Apellido(s)\nVOLKOV",
    });
  });

  test("falls back to bounded local OCR when a PDF has no text layer", async () => {
    const recognize = vi.fn(async () => ({
      data: { text: "1. Apellido(s)\nVOLKOV" },
    }));
    vi.doMock("tesseract.js/src/Tesseract.js", () => ({ recognize }));
    vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
            getViewport: () => ({ height: 200, width: 100 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
          numPages: 6,
        }),
      }),
    }));
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({}),
        height: 0,
        width: 0,
      }),
    });

    const result = await extractPdfTextFromFile(
      new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
    );

    expect(result).toMatchObject({
      extractedPageCount: 4,
      ocrPageLimit: 4,
      pageCount: 6,
      source: "local_ocr",
      text: "1. Apellido(s)\nVOLKOV\n\n1. Apellido(s)\nVOLKOV\n\n1. Apellido(s)\nVOLKOV\n\n1. Apellido(s)\nVOLKOV",
    });
    expect(recognize).toHaveBeenCalledTimes(4);
  });
});

async function sha256HexForTest(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
