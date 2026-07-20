import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function installPassportCanvasMocks() {
  const createCanvas = () => {
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(
        (_offsetX: number, _offsetY: number, width: number, height: number) => ({
          data: new Uint8ClampedArray(Math.max(1, width * height * 4)),
        }),
      ),
      putImageData: vi.fn(),
      rotate: vi.fn(),
      translate: vi.fn(),
    };
    return {
      getContext: vi.fn(() => context),
      height: 0,
      width: 0,
    };
  };

  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
    close: vi.fn(),
    height: 10,
    width: 10,
  })));
  vi.stubGlobal("document", {
    createElement: vi.fn(() => createCanvas()),
  });
}

const validPassportMrz = `
  P<RUSVOLKOV<<ANTONK<<<<<<<<<<<KKKKKKKKKKKKKK
  7528696137RUS9008205M2602268<<<<<<<<<<<<<<00
`;

describe("passport OCR worker lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    tesseractMocks.createWorker.mockReset();
    tesseractMocks.extractPdfTextFromFile.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  test("waits for timed-out worker termination before recognizing the next applicant", async () => {
    vi.useFakeTimers();
    installPassportCanvasMocks();
    const recognitionStarted = deferred<void>();
    const terminationStarted = deferred<void>();
    const terminationFinished = deferred<void>();
    const firstWorker = {
      recognize: vi.fn(() => {
        recognitionStarted.resolve();
        return new Promise<never>(() => undefined);
      }),
      terminate: vi.fn(() => {
        terminationStarted.resolve();
        return terminationFinished.promise;
      }),
    };
    const secondWorker = {
      recognize: vi.fn(async () => ({ data: { text: validPassportMrz } })),
      terminate: vi.fn(async () => undefined),
    };
    tesseractMocks.createWorker
      .mockResolvedValueOnce(firstWorker)
      .mockResolvedValueOnce(secondWorker);
    const { invokePassportExtraction } =
      await import("../../src/modules/submissions/passportExtractionService");
    const firstPassport = new File(["first"], "first.jpeg", {
      type: "image/jpeg",
    });
    const secondPassport = new File(["second"], "second.jpeg", {
      type: "image/jpeg",
    });

    const queuedResult = invokePassportExtraction({
      applicantIndex: 0,
      localFile: firstPassport,
      openAiFallbackAllowed: false,
    }).catch(async (error: unknown) => {
      expect(error).toEqual(
        expect.objectContaining({ message: "Local passport OCR timed out." }),
      );
      return invokePassportExtraction({
        applicantIndex: 1,
        localFile: secondPassport,
        openAiFallbackAllowed: false,
      });
    });

    await recognitionStarted.promise;
    await vi.advanceTimersByTimeAsync(45_000);
    await terminationStarted.promise;
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(1);

    terminationFinished.resolve();
    const result = await queuedResult;

    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(2);
    expect(secondWorker.recognize).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        applicantIndex: 1,
        status: "extracted",
      }),
    );
  });

  test("uses one total deadline across candidates before starting the next applicant", async () => {
    vi.useFakeTimers();
    installPassportCanvasMocks();
    const firstCandidateStarted = deferred<void>();
    const secondCandidateStarted = deferred<void>();
    const terminationStarted = deferred<void>();
    const terminationFinished = deferred<void>();
    let recognitionCount = 0;
    const firstWorker = {
      recognize: vi.fn(() => {
        recognitionCount += 1;
        if (recognitionCount === 1) {
          firstCandidateStarted.resolve();
          return new Promise<{ data: { text: string } }>((resolve) => {
            globalThis.setTimeout(
              () => resolve({ data: { text: "" } }),
              30_000,
            );
          });
        }
        secondCandidateStarted.resolve();
        return new Promise<never>(() => undefined);
      }),
      terminate: vi.fn(() => {
        terminationStarted.resolve();
        return terminationFinished.promise;
      }),
    };
    const secondWorker = {
      recognize: vi.fn(async () => ({ data: { text: validPassportMrz } })),
      terminate: vi.fn(async () => undefined),
    };
    tesseractMocks.createWorker
      .mockResolvedValueOnce(firstWorker)
      .mockResolvedValueOnce(secondWorker);
    const { invokePassportExtraction } =
      await import("../../src/modules/submissions/passportExtractionService");

    const queuedResult = invokePassportExtraction({
      applicantIndex: 0,
      localFile: new File(["first"], "first.jpeg", { type: "image/jpeg" }),
      openAiFallbackAllowed: false,
    }).catch(async (error: unknown) => {
      expect(error).toEqual(
        expect.objectContaining({ message: "Local passport OCR timed out." }),
      );
      return invokePassportExtraction({
        applicantIndex: 1,
        localFile: new File(["second"], "second.jpeg", { type: "image/jpeg" }),
        openAiFallbackAllowed: false,
      });
    });

    await firstCandidateStarted.promise;
    await vi.advanceTimersByTimeAsync(30_000);
    await secondCandidateStarted.promise;
    await vi.advanceTimersByTimeAsync(15_000);
    await terminationStarted.promise;

    expect(firstWorker.recognize).toHaveBeenCalledTimes(2);
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(1);
    terminationFinished.resolve();

    await expect(queuedResult).resolves.toEqual(
      expect.objectContaining({
        applicantIndex: 1,
        status: "extracted",
      }),
    );
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(2);
    expect(secondWorker.recognize).toHaveBeenCalledTimes(1);
  });

  test("keeps the queue blocked until recognition settles when termination fails", async () => {
    vi.useFakeTimers();
    installPassportCanvasMocks();
    const recognitionStarted = deferred<void>();
    const recognitionFinished = deferred<{ data: { text: string } }>();
    const firstWorker = {
      recognize: vi.fn(() => {
        recognitionStarted.resolve();
        return recognitionFinished.promise;
      }),
      terminate: vi.fn(async () => {
        throw new Error("termination failed");
      }),
    };
    const secondWorker = {
      recognize: vi.fn(async () => ({ data: { text: validPassportMrz } })),
      terminate: vi.fn(async () => undefined),
    };
    tesseractMocks.createWorker
      .mockResolvedValueOnce(firstWorker)
      .mockResolvedValueOnce(secondWorker);
    const { invokePassportExtraction } =
      await import("../../src/modules/submissions/passportExtractionService");

    const queuedResult = invokePassportExtraction({
      applicantIndex: 0,
      localFile: new File(["first"], "first.jpeg", { type: "image/jpeg" }),
      openAiFallbackAllowed: false,
    }).catch(() =>
      invokePassportExtraction({
        applicantIndex: 1,
        localFile: new File(["second"], "second.jpeg", { type: "image/jpeg" }),
        openAiFallbackAllowed: false,
      }),
    );

    await recognitionStarted.promise;
    await vi.advanceTimersByTimeAsync(45_000);
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(1);

    recognitionFinished.resolve({ data: { text: "" } });
    await expect(queuedResult).resolves.toEqual(
      expect.objectContaining({
        applicantIndex: 1,
        status: "extracted",
      }),
    );
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(2);
  });

  test("terminates and invalidates a worker after external cancellation", async () => {
    installPassportCanvasMocks();
    const recognitionStarted = deferred<void>();
    const firstWorker = {
      recognize: vi.fn(() => {
        recognitionStarted.resolve();
        return new Promise<never>(() => undefined);
      }),
      terminate: vi.fn(async () => undefined),
    };
    const secondWorker = {
      recognize: vi.fn(),
      terminate: vi.fn(async () => undefined),
    };
    tesseractMocks.createWorker
      .mockResolvedValueOnce(firstWorker)
      .mockResolvedValueOnce(secondWorker);
    const { invokePassportExtraction, prewarmLocalPassportOcr } =
      await import("../../src/modules/submissions/passportExtractionService");
    const controller = new AbortController();
    const extraction = invokePassportExtraction({
      applicantIndex: 0,
      localFile: new File(["passport"], "passport.jpeg", { type: "image/jpeg" }),
      openAiFallbackAllowed: false,
      signal: controller.signal,
    });

    await recognitionStarted.promise;
    controller.abort();

    await expect(extraction).rejects.toEqual(
      expect.objectContaining({ name: "AbortError" }),
    );
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    await prewarmLocalPassportOcr();
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(2);
  });

  test("terminates and replaces a worker after a fatal recognize failure", async () => {
    installPassportCanvasMocks();
    const firstWorker = {
      recognize: vi.fn(async () => {
        throw new Error("recognize failed");
      }),
      terminate: vi.fn(async () => undefined),
    };
    const secondWorker = {
      recognize: vi.fn(),
      terminate: vi.fn(async () => undefined),
    };
    tesseractMocks.createWorker
      .mockResolvedValueOnce(firstWorker)
      .mockResolvedValueOnce(secondWorker);
    const { invokePassportExtraction, prewarmLocalPassportOcr } =
      await import("../../src/modules/submissions/passportExtractionService");

    await expect(
      invokePassportExtraction({
        applicantIndex: 0,
        localFile: new File(["passport"], "passport.jpeg", { type: "image/jpeg" }),
        openAiFallbackAllowed: false,
      }),
    ).rejects.toThrow("recognize failed");
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    await prewarmLocalPassportOcr();
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(2);
  });
});
