import { beforeEach, describe, expect, test, vi } from "vitest";

const tesseractMocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
  extractPdfTextFromFile: vi.fn(),
}));

vi.mock("tesseract.js/src/index.js", () => ({
  createWorker: tesseractMocks.createWorker,
}));

vi.mock("../../src/modules/submissions/pdfTextExtraction", () => ({
  extractPdfTextFromFile: tesseractMocks.extractPdfTextFromFile,
}));

describe("passport OCR worker lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    tesseractMocks.createWorker.mockReset();
    tesseractMocks.extractPdfTextFromFile.mockReset();
  });

  test("reuses one worker across concurrent warmup requests", async () => {
    tesseractMocks.createWorker.mockResolvedValue({
      recognize: vi.fn(),
    });
    const { prewarmLocalPassportOcr } =
      await import("../../src/modules/submissions/passportExtractionService");

    await Promise.all([
      prewarmLocalPassportOcr(),
      prewarmLocalPassportOcr(),
      prewarmLocalPassportOcr(),
    ]);

    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(1);
    expect(tesseractMocks.createWorker).toHaveBeenCalledWith(
      "eng",
      1,
      expect.objectContaining({ cacheMethod: "write" }),
    );
  });

  test("retries worker bootstrap after a transient failure", async () => {
    tesseractMocks.createWorker
      .mockRejectedValueOnce(new Error("bootstrap failed"))
      .mockResolvedValueOnce({ recognize: vi.fn() });
    const { prewarmLocalPassportOcr } =
      await import("../../src/modules/submissions/passportExtractionService");

    await prewarmLocalPassportOcr();
    await prewarmLocalPassportOcr();

    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(2);
  });

  test("routes passport PDFs through the local PDF extraction path", async () => {
    tesseractMocks.extractPdfTextFromFile.mockResolvedValue({
      text: `
        P<RUSVOLKOV<<ANTONK<<<<<<<<<<<KKKKKKKKKKKKKK
        7528696137RUS9008205M2602268<<<<<<<<<<<<<<00
      `,
    });
    const { invokePassportExtraction } =
      await import("../../src/modules/submissions/passportExtractionService");

    const result = await invokePassportExtraction({
      localFile: new File(["pdf"], "passport.pdf", { type: "application/pdf" }),
      openAiFallbackAllowed: false,
    });

    expect(result.status).toBe("extracted");
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "surname", value: "VOLKOV" }),
        expect.objectContaining({ key: "firstName", value: "ANTON" }),
        expect.objectContaining({ key: "passportNumber", value: "752869613" }),
      ]),
    );
  });
});
