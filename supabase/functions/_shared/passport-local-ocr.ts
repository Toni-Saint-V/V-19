import {
  parsePassportExtractionResult,
  safeUnavailablePassportExtractionResult,
  type PassportExtractionProvider,
  type PassportExtractionProviderResult,
  type PassportExtractionRequest,
  type PassportExtractionResult,
} from "./passport-extraction-contract.ts";
import { extractPassportMrzText } from "./passport-mrz.ts";

const localTesseractCliProvider = "local_tesseract_cli";
const localTesseractCliCommand = "tesseract";
const localTesseractTimeoutMs = 10_000;

interface LocalPassportOcrCommandOutput {
  code: number;
  stderr: Uint8Array;
  stdout: Uint8Array;
  success: boolean;
}

interface LocalPassportOcrChildProcess {
  kill(signal?: string): void;
  output(): Promise<LocalPassportOcrCommandOutput>;
}

interface LocalPassportOcrCommandOptions {
  args: string[];
  stderr: "piped";
  stdout: "piped";
}

interface LocalPassportOcrDenoRuntime {
  Command?: new (
    command: string,
    options: LocalPassportOcrCommandOptions,
  ) => {
    spawn(): LocalPassportOcrChildProcess;
  };
}

export interface LocalPassportOcrEnv {
  PASSPORT_OCR_COMMAND?: string;
  PASSPORT_OCR_PROVIDER?: string;
}

export function createLocalPassportOcrProvider(
  env: LocalPassportOcrEnv,
): PassportExtractionProvider | undefined {
  if (env.PASSPORT_OCR_PROVIDER?.trim() !== localTesseractCliProvider) {
    return undefined;
  }

  const command = env.PASSPORT_OCR_COMMAND?.trim();
  return {
    async recognizeText(request) {
      if (command !== localTesseractCliCommand) {
        return localOcrUnavailableResult();
      }

      const { path } = request.document;
      const candidateText = await recognizeMrzCandidateTextWithTesseract(command, path);
      if (!candidateText) return localOcrUnavailableResult();

      return {
        ok: true,
        provider: "local_ocr",
        text: candidateText,
      };
    },
  };
}

function localOcrUnavailableResult(): PassportExtractionProviderResult {
  return {
    ok: false,
    provider: "local_ocr_unavailable",
    reason: "local_ocr_unavailable",
  };
}

async function recognizeMrzCandidateTextWithTesseract(
  command: string,
  documentPath: string,
): Promise<string> {
  const runtime = localPassportOcrRuntime();
  if (!runtime?.Command) return "";

  let childProcess: LocalPassportOcrChildProcess | undefined;
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    const processOutput = new runtime.Command(command, {
      args: [documentPath, "stdout", "--psm", "6"],
      stderr: "piped",
      stdout: "piped",
    }).spawn();
    childProcess = processOutput;

    const output = await Promise.race([
      processOutput.output(),
      new Promise<LocalPassportOcrCommandOutput>((_, reject) => {
        timeout = globalThis.setTimeout(() => {
          try {
            childProcess?.kill("SIGTERM");
          } catch {
            // Ignore kill failures and fail closed below.
          }
          reject(new Error("local OCR command timed out."));
        }, localTesseractTimeoutMs);
      }),
    ]);

    if (!output.success || output.code !== 0) return "";

    return normalizeLocalOcrTextToMrzCandidateText(
      new TextDecoder().decode(output.stdout),
    );
  } catch {
    return "";
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

function localPassportOcrRuntime(): LocalPassportOcrDenoRuntime | undefined {
  return (globalThis as { Deno?: LocalPassportOcrDenoRuntime }).Deno;
}

export function normalizeLocalOcrTextToMrzCandidateText(text: string): string {
  const lines = text
    .toUpperCase()
    .replace(/[«»]/g, "<")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/[^A-Z0-9<]/g, "").trim())
    .filter(Boolean);

  const td3Candidate = td3CandidateLines(lines);
  if (td3Candidate) return td3Candidate.join("\n");

  return lines.filter(isMrzCandidateLine).slice(0, 4).join("\n");
}

function td3CandidateLines(lines: string[]): [string, string] | undefined {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line1 = lines[index] ?? "";
    const line2 = lines[index + 1] ?? "";
    if (isTd3Line1Candidate(line1) && isTd3Line2Candidate(line2)) {
      return [line1.slice(0, 44), line2.slice(0, 44)];
    }
  }
  return undefined;
}

function isTd3Line1Candidate(line: string) {
  return line.length >= 44 && /^P<[A-Z0-9<]{42}/.test(line);
}

function isTd3Line2Candidate(line: string) {
  return (
    line.length >= 44 &&
    /^[A-Z0-9<]{44}/.test(line) &&
    /\d/.test(line.slice(0, 10)) &&
    /^[A-Z0-9<]{3}$/.test(line.slice(10, 13))
  );
}

function isMrzCandidateLine(line: string) {
  return line.length >= 20 && line.length <= 60 && line.includes("<");
}

export async function extractPassportWithLocalOcr(
  request: PassportExtractionRequest,
  provider?: PassportExtractionProvider,
): Promise<PassportExtractionResult> {
  if (!provider) {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_not_configured",
    );
  }

  let providerResult: PassportExtractionProviderResult;
  try {
    providerResult = await provider.recognizeText(request);
  } catch {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_unavailable",
    );
  }

  if (!providerResult.ok) {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      providerResult.reason,
    );
  }

  const text = providerResult.text.trim();
  if (!text) {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_unavailable",
    );
  }

  const mrzResult = extractPassportMrzText(text, request.applicantIndex);
  if (mrzResult.status !== "extracted") {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_unavailable",
    );
  }

  const parsed = parsePassportExtractionResult({
    ...mrzResult,
    ocr: {
      attempted: true,
      provider: "local_ocr",
    },
    source: "local-ocr",
  });
  if (parsed.ok) return parsed.data;

  return safeUnavailablePassportExtractionResult(
    request.applicantIndex,
    "local_ocr_unavailable",
  );
}
