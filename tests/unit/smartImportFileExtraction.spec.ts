import { describe, expect, it, vi } from "vitest";

import {
  SmartImportExtractionError,
  extractSmartImportFromFile,
  extractSmartImportFromFiles,
  extractSmartImportFromText,
  recognizeSmartImportImageLocally,
  type SmartImportFileExtractionAdapters,
} from "../../src/modules/submissions/smartImportFileExtraction";

function imageFile(size = 12) {
  return new File([new Uint8Array(size)], "source.jpg", { type: "image/jpeg" });
}

function pdfFile(size = 12) {
  return new File([new Uint8Array(size)], "source.pdf", { type: "application/pdf" });
}

describe("smart import file extraction", () => {
  it("parses pasted text without exposing the source text", async () => {
    const result = await extractSmartImportFromText(
      "Телефон: +7 921 555-22-11\nEmail: anton@example.com",
    );

    expect(result.candidates.map((item) => item.fieldId)).toEqual(
      expect.arrayContaining(["contact-number", "email"]),
    );
    expect(Object.keys(result).sort()).toEqual([
      "candidates",
      "documentKind",
      "summary",
    ]);
    expect(JSON.stringify(result).toLowerCase()).not.toContain("телефон:");
  });

  it("runs local image OCR in rus+eng mode", async () => {
    const recognizeImage = vi.fn(async () => "Фамилия: Волков");
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage,
    };

    const result = await extractSmartImportFromFile(imageFile(), { adapters });

    expect(recognizeImage).toHaveBeenCalledTimes(1);
    expect(recognizeImage.mock.calls[0]?.[1]).toBe("rus+eng");
    expect(result.candidates.find((item) => item.fieldId === "surname")?.value).toBe(
      "ВОЛКОВ",
    );
  });

  it("processes a package sequentially and merges its sanitized candidates", async () => {
    let active = 0;
    let maxActive = 0;
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage: vi.fn(async (image) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return (image as File).name.startsWith("one")
          ? "Email: first@example.com"
          : "Телефон: +7 921 555-22-11";
      }),
    };

    const result = await extractSmartImportFromFiles(
      [
        new File(["one"], "one.jpg", { type: "image/jpeg" }),
        new File(["two"], "two.jpg", { type: "image/jpeg" }),
      ],
      { adapters },
    );

    expect(maxActive).toBe(1);
    expect(result.documentKind).toBe("mixed_package");
    expect(result.candidates.map((item) => item.fieldId)).toEqual(
      expect.arrayContaining(["email", "contact-number"]),
    );
    expect(JSON.stringify(result)).not.toContain("one.jpg");
    expect(JSON.stringify(result)).not.toContain("two.jpg");
  });

  it("rejects more than ten package files before starting OCR", async () => {
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage: vi.fn(),
    };
    const files = Array.from({ length: 11 }, (_, index) =>
      new File([String(index)], `${index}.jpg`, { type: "image/jpeg" }),
    );

    await expect(extractSmartImportFromFiles(files, { adapters })).rejects.toMatchObject({
      code: "too_many_files",
    });
    expect(adapters.recognizeImage).not.toHaveBeenCalled();
  });


  it("terminates the local OCR worker after successful recognition", async () => {
    const terminate = vi.fn(async () => undefined);
    const recognize = vi.fn(async () => ({ data: { text: "Фамилия: Волков" } }));
    const setParameters = vi.fn(async () => undefined);
    const source = imageFile();
    const createWorker = vi.fn(async () => ({
      recognize,
      setParameters,
      terminate,
    }));

    const result = await recognizeSmartImportImageLocally(
      source,
      "rus+eng",
      new AbortController().signal,
      createWorker,
    );

    expect(result).toBe("Фамилия: Волков");
    expect(createWorker).toHaveBeenCalledWith(
      "rus+eng",
      1,
      expect.objectContaining({ langPath: "/tesseract/lang" }),
    );
    expect(setParameters).toHaveBeenCalledWith(
      expect.objectContaining({ tessedit_pageseg_mode: "4" }),
    );
    expect(recognize).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ rotateAuto: true }),
    );
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates the local OCR worker when extraction is cancelled", async () => {
    const controller = new AbortController();
    let rejectRecognition: ((error: Error) => void) | undefined;
    const terminate = vi.fn(async () => {
      const error = new Error("terminated");
      error.name = "AbortError";
      rejectRecognition?.(error);
    });
    const createWorker = vi.fn(async () => ({
      recognize: vi.fn(
        () =>
          new Promise<{ data: { text: string } }>((_resolve, reject) => {
            rejectRecognition = reject;
          }),
      ),
      setParameters: vi.fn(async () => undefined),
      terminate,
    }));

    const extraction = recognizeSmartImportImageLocally(
      imageFile(),
      "rus+eng",
      controller.signal,
      createWorker,
    );
    controller.abort();

    await expect(extraction).rejects.toMatchObject({ code: "cancelled" });
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("falls back to English OCR when rus+eng returns no text", async () => {
    const recognizeImage = vi
      .fn()
      .mockResolvedValueOnce("   ")
      .mockResolvedValueOnce("Email: anton@example.com");
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage,
    };

    const result = await extractSmartImportFromFile(imageFile(), { adapters });

    expect(recognizeImage.mock.calls.map((call) => call[1])).toEqual([
      "rus+eng",
      "eng",
    ]);
    expect(result.candidates.find((item) => item.fieldId === "email")?.value).toBe(
      "anton@example.com",
    );
  });

  it("falls back to English OCR when the Russian language asset is unavailable", async () => {
    const recognizeImage = vi
      .fn()
      .mockRejectedValueOnce(new Error("language unavailable"))
      .mockResolvedValueOnce("Email: anton@example.com");
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage,
    };

    await extractSmartImportFromFile(imageFile(), { adapters });

    expect(recognizeImage.mock.calls.map((call) => call[1])).toEqual([
      "rus+eng",
      "eng",
    ]);
  });

  it("uses the PDF extraction adapter and returns only sanitized candidates", async () => {
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(async () => "Отель: Hotel Madrid\nEmail: stay@example.com"),
      recognizeImage: vi.fn(),
    };

    const result = await extractSmartImportFromFile(pdfFile(), { adapters });

    expect(adapters.extractPdfText).toHaveBeenCalledTimes(1);
    expect(adapters.recognizeImage).not.toHaveBeenCalled();
    expect(result.documentKind).toBe("booking");
    expect(JSON.stringify(result)).not.toContain("source.pdf");
  });

  it("rejects unsupported files before reading their bytes", async () => {
    const arrayBuffer = vi.fn();
    const file = Object.assign(
      new File(["hello"], "source.txt", { type: "text/plain" }),
      { arrayBuffer },
    );

    await expect(extractSmartImportFromFile(file)).rejects.toMatchObject({
      code: "unsupported_type",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects an oversized image before OCR", async () => {
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage: vi.fn(),
    };
    const oversized = imageFile(12 * 1024 * 1024 + 1);

    await expect(
      extractSmartImportFromFile(oversized, { adapters }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SmartImportExtractionError>>({
        code: "file_too_large",
      }),
    );
    expect(adapters.recognizeImage).not.toHaveBeenCalled();
  });

  it("honours an already-aborted signal before extraction", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage: vi.fn(),
    };

    await expect(
      extractSmartImportFromFile(imageFile(), {
        adapters,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(adapters.recognizeImage).not.toHaveBeenCalled();
  });

  it("returns an empty result rather than persisting unreadable source content", async () => {
    const adapters: SmartImportFileExtractionAdapters = {
      extractPdfText: vi.fn(),
      recognizeImage: vi.fn(async () => "unrelated decorative text"),
    };

    const result = await extractSmartImportFromFile(imageFile(), { adapters });

    expect(result.candidates).toEqual([]);
    expect(result.summary).toContain("Подходящие поля не найдены");
  });
});
