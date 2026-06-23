import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  invokePassportExtraction,
  parsePassportMrzText,
  parsePassportVisualText,
} from "../../src/modules/submissions/passportExtractionService";
import type { Submission, SubmissionFile } from "../../src/modules/submissions/types";

const tesseractMock = vi.hoisted(() => ({
  recognize: vi.fn(),
  text: "",
}));
const supabaseMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    functions: {
      invoke: supabaseMock.invoke,
    },
  }),
}));

vi.mock("tesseract.js", () => ({
  default: {
    recognize: tesseractMock.recognize,
  },
  recognize: tesseractMock.recognize,
}));

vi.mock("tesseract.js/src/Tesseract.js", () => ({
  default: {
    recognize: tesseractMock.recognize,
  },
  recognize: tesseractMock.recognize,
}));

const validMrzText = [
  "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
  "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00",
].join("\n");

type BrowserMockOptions = {
  getImageDataThrows?: boolean;
  height: number;
  luma: (x: number, y: number) => number;
  width: number;
};

type TestBrowserGlobal = typeof globalThis & {
  createImageBitmap?: unknown;
  document?: unknown;
};

const browserGlobal = globalThis as TestBrowserGlobal;
const originalDocument = browserGlobal.document;
const originalCreateImageBitmap = browserGlobal.createImageBitmap;

function rgbaImage(width: number, height: number, lumaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = lumaAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

function installBrowserImageMocks(options: BrowserMockOptions) {
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: vi.fn(async () => ({
      close: vi.fn(),
      height: options.height,
      width: options.width,
    })),
  });

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: vi.fn(() => {
        const canvas = {
          height: 0,
          width: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn(() => {
              if (options.getImageDataThrows) {
                throw new Error("Image data unavailable.");
              }
              return {
                data: rgbaImage(canvas.width, canvas.height, options.luma),
              };
            }),
            rotate: vi.fn(),
            translate: vi.fn(),
          })),
        };
        return canvas;
      }),
    },
  });
}

function restoreBrowserImageMocks() {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: originalCreateImageBitmap,
  });
}

function localPassportFile(type = "image/jpeg", size = 120_000) {
  return {
    size,
    type,
  } as File;
}

function submissionFile(type = "image/jpeg") {
  return {
    mimeType: type,
    sizeBytes: 120_000,
    storageBucket: "submission-media",
    storagePath: "submissions/passport.jpg",
    type: "passport_scan",
  } as SubmissionFile;
}

function submission() {
  return {
    id: "submission-1",
  } as Submission;
}

async function invokeLocalPassport(type = "image/jpeg", size = 120_000) {
  return invokePassportExtraction({
    applicantIndex: 0,
    file: submissionFile(type),
    localFile: localPassportFile(type, size),
    submission: submission(),
  });
}

describe("passport extraction service local OCR quality integration", () => {
  beforeEach(() => {
    tesseractMock.text = validMrzText;
    tesseractMock.recognize.mockImplementation(async () => ({
      data: {
        text: tesseractMock.text,
      },
    }));
    supabaseMock.invoke.mockResolvedValue({
      data: {
        fields: [],
        guardrails: [],
        openAiAttempted: false,
        source: "edge-stub",
        status: "unavailable",
        summary: "Server extraction unavailable.",
      },
      error: null,
    });
  });

  afterEach(() => {
    restoreBrowserImageMocks();
    supabaseMock.invoke.mockReset();
    tesseractMock.recognize.mockReset();
  });

  test("attempts OCR when quality rejects a small but readable scan", async () => {
    installBrowserImageMocks({
      height: 360,
      luma: (x) => (Math.floor(x / 12) % 2 === 0 ? 30 : 230),
      width: 640,
    });

    const result = await invokeLocalPassport("image/jpeg", 120_000);

    expect(tesseractMock.recognize).toHaveBeenCalled();
    expect(result.status).toBe("extracted");
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "passportNumber",
          value: "123456789",
        }),
      ]),
    );
    expect(result.summary).toContain("Скан паспорта не готов к OCR");
  });

  test("parses noisy MRZ from a rotated passport crop", () => {
    const fields = parsePassportMrzText(
      [
        "P<RUSVOLKOV<<ANTONK<<KLLLLLLLLLLLLLLLLLKKKK",
        "7528696137RUS9008205M2602268<<<<<<LLLLLL<<00",
      ].join("\n"),
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "surname", value: "VOLKOV" }),
        expect.objectContaining({ key: "firstName", value: "ANTON" }),
        expect.objectContaining({ key: "passportNumber", value: "752869613" }),
        expect.objectContaining({ key: "birthDate", value: "20.08.1990" }),
        expect.objectContaining({ key: "passportExpiresAt", value: "26.02.2026" }),
      ]),
    );
  });

  test("adds visual passport fields from noisy OCR around the MRZ", () => {
    const mrzFields = parsePassportMrzText(
      [
        "P<RUSVOLKOV<<ANTONK<<KLLLLLLLLLLLLLLLLLKKKK",
        "7528696137RUS9008205M2602268<<<<<<LLLLLL<<00",
      ].join("\n"),
    );
    const visualFields = parsePassportVisualText(
      [
        "LPAXGAHCTEONATIONALITYLEEY",
        "POCCHIACKASEJIEPALINSRUSSIANFEDERATIONID",
        "LATAPOXAENUSDATEOFBIRTHYUERHAS3ANUCHLAVO",
        "NN20081990LWV",
        "RANDOM09032058NOISE28518",
        "IMONSEXMECROPOXAENUSPLACEOFBIRTH",
        "MMNEHWUHTPAJLUSSR",
        "HAVASHINADATEOFISSUEOPRANBBIAABLUIAOKYMEHTAUTHORITY",
        "26022016DMC78039",
        "PYLARAOXONIAHMSCPOKADATEOFEXPIRYFOANUESSRAGENSUAHOLDERSSIGNATURE",
        "NEIICTENS",
        "2602202674",
      ].join("\n"),
      mrzFields,
    );

    expect(visualFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "birthCountry", value: "USSR" }),
        expect.objectContaining({ key: "birthPlace", value: "LENINGRAD" }),
        expect.objectContaining({ key: "passportIssuedAt", value: "26.02.2016" }),
        expect.objectContaining({ key: "passportIssuePlace", value: "FMS 78039" }),
      ]),
    );
  });

  test("continues OCR when image quality pixels are unavailable", async () => {
    installBrowserImageMocks({
      getImageDataThrows: true,
      height: 700,
      luma: () => 120,
      width: 1200,
    });

    const result = await invokeLocalPassport();

    expect(tesseractMock.recognize).toHaveBeenCalled();
    expect(result.status).toBe("extracted");
    expect(result.summary).not.toContain("Качество скана требует проверки");
  });

  test("adds quality review context to successful OCR summary", async () => {
    installBrowserImageMocks({
      height: 700,
      luma: () => 42,
      width: 1200,
    });

    const result = await invokeLocalPassport();

    expect(result.status).toBe("extracted");
    expect(result.summary).toContain("Качество скана требует проверки");
  });

  test("falls back safely with quality context when OCR finds no MRZ", async () => {
    installBrowserImageMocks({
      height: 360,
      luma: () => 130,
      width: 640,
    });
    tesseractMock.text = "NO PASSPORT MRZ";

    const result = await invokeLocalPassport("image/png", 120_000);

    expect(tesseractMock.recognize).toHaveBeenCalledTimes(16);
    expect(result.status).toBe("unavailable");
    expect(result.summary).toContain("Скан паспорта не готов к OCR");
  });

  test("does not allow paid fallback after local OCR finds no passport MRZ", async () => {
    installBrowserImageMocks({
      height: 700,
      luma: () => 120,
      width: 1200,
    });
    tesseractMock.text = "NO PASSPORT MRZ";
    supabaseMock.invoke.mockResolvedValue({
      data: {
        fields: [],
        guardrails: [],
        openAiAttempted: false,
        source: "edge-stub",
        status: "unavailable",
        summary: "Server extraction unavailable.",
      },
      error: null,
    });

    const result = await invokeLocalPassport("image/jpeg", 120_000);

    expect(supabaseMock.invoke).toHaveBeenCalledWith(
      "passport-extract",
      expect.objectContaining({
        body: expect.objectContaining({
          allowOpenAiFallback: false,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: "unavailable",
    });
    expect(result.openAiAttempted).not.toBe(true);
    expect(result.summary).toContain("локальный OCR не нашел MRZ");
  });

  test("keeps local unavailable result when edge did not attempt OpenAI", async () => {
    installBrowserImageMocks({
      height: 360,
      luma: () => 130,
      width: 640,
    });
    tesseractMock.text = "NO PASSPORT MRZ";
    supabaseMock.invoke.mockResolvedValue({
      data: {
        fields: [],
        guardrails: [],
        openAiAttempted: false,
        source: "edge-stub",
        status: "unavailable",
        summary: "Server extraction unavailable.",
      },
      error: null,
    });

    const result = await invokeLocalPassport("image/png", 120_000);

    expect(supabaseMock.invoke).toHaveBeenCalledOnce();
    expect(result.summary).toContain("локальный OCR не нашел MRZ");
  });

  test("does not call edge fallback when OpenAI is disabled for the same fingerprint", async () => {
    installBrowserImageMocks({
      height: 700,
      luma: () => 120,
      width: 1200,
    });
    tesseractMock.text = "NO PASSPORT MRZ";

    const result = await invokePassportExtraction({
      applicantIndex: 0,
      file: submissionFile("image/jpeg"),
      localFile: localPassportFile("image/jpeg", 120_000),
      openAiFallbackAllowed: false,
      submission: submission(),
    });

    expect(supabaseMock.invoke).not.toHaveBeenCalled();
    expect(result.status).toBe("unavailable");
  });

  test("keeps OpenAI disabled at edge when no local file is available", async () => {
    supabaseMock.invoke.mockResolvedValue({
      data: {
        fields: [],
        guardrails: [],
        source: "edge-stub",
        status: "unavailable",
        summary: "Server extraction unavailable.",
      },
      error: null,
    });

    await invokePassportExtraction({
      applicantIndex: 0,
      file: submissionFile("application/pdf"),
      openAiFallbackAllowed: false,
      submission: submission(),
    });

    expect(supabaseMock.invoke).toHaveBeenCalledWith(
      "passport-extract",
      expect.objectContaining({
        body: expect.objectContaining({
          allowOpenAiFallback: false,
        }),
      }),
    );
  });
});
