import {
  parsePassportExtractionResult,
  safeUnavailablePassportExtractionResult,
  type PassportExtractionProvider,
  type PassportExtractionProviderResult,
  type PassportExtractionOcrReason,
  type PassportExtractionRequest,
  type PassportExtractionResult,
} from "./passport-extraction-contract.ts";
import { extractPassportMrzText } from "./passport-mrz.ts";

const localTesseractCliProvider = "local_tesseract_cli";
const localTesseractCliCommand = "tesseract";
const localTesseractMaxInputBytes = 50 * 1024 * 1024;
const localTesseractTimeoutMs = 10_000;
const localTesseractKillDrainMs = 500;

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
  makeTempFile?(options?: { prefix?: string; suffix?: string }): Promise<string>;
  remove?(path: string): Promise<void>;
  writeFile?(path: string, data: Uint8Array): Promise<void>;
}

export interface LocalPassportOcrEnv {
  PASSPORT_OCR_COMMAND?: string;
  PASSPORT_OCR_PROVIDER?: string;
}

export type LocalPassportOcrMaterializeResult =
  | {
      ok: true;
      cleanup(): Promise<void>;
      path: string;
    }
  | {
      ok: false;
      reason: PassportExtractionOcrReason;
    };

export interface LocalPassportOcrMaterializer {
  materialize(
    request: PassportExtractionRequest,
  ): Promise<LocalPassportOcrMaterializeResult>;
}

export interface LocalPassportOcrProviderOptions {
  materializer?: LocalPassportOcrMaterializer;
}

export interface SupabaseStorageLocalPassportOcrMaterializerOptions {
  adminKey: string;
  fetchFn?: typeof fetch;
  supabaseUrl: string;
}

export function createLocalPassportOcrProvider(
  env: LocalPassportOcrEnv,
  options: LocalPassportOcrProviderOptions = {},
): PassportExtractionProvider | undefined {
  if (env.PASSPORT_OCR_PROVIDER?.trim() !== localTesseractCliProvider) {
    return undefined;
  }

  const command = env.PASSPORT_OCR_COMMAND?.trim();
  return {
    async recognizeText(request) {
      if (command !== localTesseractCliCommand) {
        return localOcrUnavailableResult("local_ocr_command_not_allowed");
      }

      const passportDocument = request["document"];
      if (passportDocument.mimeType === "application/pdf") {
        return localOcrUnavailableResult("local_ocr_unsupported_mime");
      }
      if (passportDocument.sizeBytes > localTesseractMaxInputBytes) {
        return localOcrUnavailableResult("local_ocr_input_too_large");
      }
      if (!options.materializer) {
        return localOcrUnavailableResult("local_ocr_document_unavailable");
      }
      if (!localPassportOcrRuntime()?.Command) {
        return localOcrUnavailableResult("local_ocr_runtime_unavailable");
      }

      const materialized = await options.materializer.materialize(request);
      if (!materialized.ok) {
        return localOcrUnavailableResult(materialized.reason);
      }

      try {
        const ocr = await recognizeMrzCandidateTextWithTesseract(
          command,
          materialized.path,
        );
        if (!ocr.ok) return localOcrUnavailableResult(ocr.reason);

        return {
          ok: true,
          provider: "local_ocr",
          text: ocr.text,
        };
      } finally {
        await materialized.cleanup().catch(() => undefined);
      }
    },
  };
}

export function createSupabaseStorageLocalPassportOcrMaterializer({
  adminKey,
  fetchFn = fetch,
  supabaseUrl,
}: SupabaseStorageLocalPassportOcrMaterializerOptions): LocalPassportOcrMaterializer {
  return {
    async materialize(request) {
      const runtime = localPassportOcrRuntime();
      if (!runtime?.makeTempFile || !runtime.writeFile || !runtime.remove) {
        return { ok: false, reason: "local_ocr_runtime_unavailable" };
      }

      const { bucket, mimeType, path, sizeBytes } = request["document"];
      if (mimeType === "application/pdf") {
        return { ok: false, reason: "local_ocr_unsupported_mime" };
      }
      if (sizeBytes > localTesseractMaxInputBytes) {
        return { ok: false, reason: "local_ocr_input_too_large" };
      }

      const response = await fetchFn(
        `${supabaseUrl}/storage/v1/object/${bucket}/${storageObjectPath(path)}`,
        {
          headers: storageAuthHeaders(adminKey),
          method: "GET",
        },
      ).catch(() => undefined);
      if (!response?.ok) {
        return { ok: false, reason: "local_ocr_document_unavailable" };
      }

      const bytesResult = await readBoundedStorageObjectBytes(response, sizeBytes);
      if (!bytesResult.ok) return bytesResult;
      const bytes = bytesResult.bytes;

      const tempPath = await runtime
        .makeTempFile({
          prefix: "visaflow-passport-ocr-",
          suffix: fileSuffixForMime(mimeType),
        })
        .catch(() => "");
      if (!tempPath) {
        return { ok: false, reason: "local_ocr_document_unavailable" };
      }

      try {
        await runtime.writeFile(tempPath, bytes);
      } catch {
        await runtime.remove(tempPath).catch(() => undefined);
        return { ok: false, reason: "local_ocr_document_unavailable" };
      }

      return {
        ok: true,
        path: tempPath,
        cleanup: () => runtime.remove?.(tempPath) ?? Promise.resolve(),
      };
    },
  };
}

function localOcrUnavailableResult(
  reason: PassportExtractionOcrReason = "local_ocr_unavailable",
): PassportExtractionProviderResult {
  return {
    ok: false,
    provider: "local_ocr_unavailable",
    reason,
  };
}

async function recognizeMrzCandidateTextWithTesseract(
  command: string,
  documentPath: string,
): Promise<
  { ok: true; text: string } | { ok: false; reason: PassportExtractionOcrReason }
> {
  const runtime = localPassportOcrRuntime();
  if (!runtime?.Command) return { ok: false, reason: "local_ocr_runtime_unavailable" };

  let childProcess: LocalPassportOcrChildProcess | undefined;
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    const processOutput = new runtime.Command(command, {
      args: [documentPath, "stdout", "--psm", "6"],
      stderr: "piped",
      stdout: "piped",
    }).spawn();
    childProcess = processOutput;

    const outputPromise = processOutput.output();
    const output = await Promise.race([
      outputPromise,
      new Promise<"timeout">((resolve) => {
        timeout = globalThis.setTimeout(
          () => resolve("timeout"),
          localTesseractTimeoutMs,
        );
      }),
    ]);

    if (output === "timeout") {
      await stopLocalOcrProcess(childProcess, outputPromise);
      return { ok: false, reason: "local_ocr_timeout" };
    }

    if (!output.success || output.code !== 0) {
      return { ok: false, reason: "local_ocr_command_failed" };
    }

    const text = normalizeLocalOcrTextToMrzCandidateText(
      new TextDecoder().decode(output.stdout),
    );
    return text ? { ok: true, text } : { ok: false, reason: "local_ocr_no_mrz" };
  } catch {
    return { ok: false, reason: "local_ocr_command_failed" };
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

async function stopLocalOcrProcess(
  childProcess: LocalPassportOcrChildProcess,
  outputPromise: Promise<LocalPassportOcrCommandOutput>,
) {
  try {
    childProcess.kill("SIGTERM");
  } catch {
    return;
  }

  const drained = await Promise.race([
    outputPromise.then(() => true).catch(() => true),
    delay(localTesseractKillDrainMs).then(() => false),
  ]);
  if (drained) return;

  try {
    childProcess.kill("SIGKILL");
  } catch {
    // Ignore cleanup failures and fail closed.
  }

  await Promise.race([
    outputPromise.catch(() => undefined),
    delay(localTesseractKillDrainMs),
  ]).catch(() => undefined);
}

function localPassportOcrRuntime(): LocalPassportOcrDenoRuntime | undefined {
  return (globalThis as { Deno?: LocalPassportOcrDenoRuntime }).Deno;
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function storageAuthHeaders(adminKey: string): Record<string, string> {
  return {
    apikey: adminKey,
    authorization: `Bearer ${adminKey}`,
  };
}

function storageObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function fileSuffixForMime(
  mimeType: PassportExtractionRequest["document"]["mimeType"],
) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  return ".bin";
}

async function readBoundedStorageObjectBytes(
  response: Response,
  expectedSizeBytes: number,
): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; reason: PassportExtractionOcrReason }
> {
  const maxBytes = Math.min(expectedSizeBytes, localTesseractMaxInputBytes);
  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, reason: "local_ocr_input_too_large" };
  }
  if (!response.body) {
    return { ok: false, reason: "local_ocr_document_unavailable" };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "local_ocr_input_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "local_ocr_document_unavailable" };
  } finally {
    reader.releaseLock();
  }

  if (!totalBytes) {
    return { ok: false, reason: "local_ocr_document_unavailable" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, bytes };
}

export function normalizeLocalOcrTextToMrzCandidateText(text: string): string {
  const lines = text
    .toUpperCase()
    .replace(/[«»]/g, "<")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map(normalizeMrzCandidateLine)
    .filter(Boolean);

  const td3Candidate = td3CandidateLines(lines);
  if (td3Candidate) return td3Candidate.join("\n");

  return "";
}

function td3CandidateLines(lines: string[]): [string, string] | undefined {
  for (let index = 0; index < lines.length - 1; index += 1) {
    for (
      let line1End = index;
      line1End < Math.min(lines.length - 1, index + 4);
      line1End += 1
    ) {
      const line1 = td3Line1Candidate(lines.slice(index, line1End + 1).join(""));
      if (!line1) continue;

      const line2 = td3Line2Candidate(
        lines.slice(line1End + 1, Math.min(lines.length, line1End + 5)).join(""),
      );
      if (line2) return [line1, line2];
    }
  }

  const compactedText = lines.join("");
  for (let index = 0; index <= compactedText.length - 84; index += 1) {
    if (compactedText.slice(index, index + 2) !== "P<") continue;

    for (let line1Length = 44; line1Length >= 40; line1Length -= 1) {
      const line1 = td3Line1Candidate(compactedText.slice(index, index + line1Length));
      const line2 = td3Line2Candidate(
        compactedText.slice(index + line1Length, index + line1Length + 44),
      );
      if (line1 && line2) {
        return [line1, line2];
      }
    }
  }
  return undefined;
}

function normalizeMrzCandidateLine(line: string) {
  return line.replace(/[^A-Z0-9<]/g, "").trim();
}

function td3Line1Candidate(line: string): string | undefined {
  const candidate = line.slice(0, 44);
  if (
    candidate.length < 40 ||
    candidate.length > 44 ||
    !/^P<[A-Z0-9<]+$/.test(candidate) ||
    !candidate.includes("<<")
  ) {
    return undefined;
  }

  const normalized =
    `${candidate.slice(0, 2)}${normalizeMrzCountryCode(candidate.slice(2, 5))}${candidate.slice(5)}`.padEnd(
      44,
      "<",
    );
  return /^P<[A-Z]{3}[A-Z0-9<]{39}$/.test(normalized) ? normalized : undefined;
}

function td3Line2Candidate(line: string): string | undefined {
  const candidate = normalizeTd3Line2Candidate(line.slice(0, 44));
  return candidate.length === 44 &&
    /^[A-Z0-9<]{44}$/.test(candidate) &&
    /\d/.test(candidate.slice(0, 10)) &&
    /^[A-Z]{3}$/.test(candidate.slice(10, 13))
    ? candidate
    : undefined;
}

function normalizeTd3Line2Candidate(line: string) {
  return line
    .split("")
    .map((character, index) => {
      if (index >= 10 && index <= 12) return normalizeMrzLetter(character);
      if (
        index === 9 ||
        (index >= 13 && index <= 19) ||
        (index >= 21 && index <= 27) ||
        index === 42 ||
        index === 43
      ) {
        return normalizeMrzDigit(character);
      }
      return character;
    })
    .join("");
}

function normalizeMrzCountryCode(value: string) {
  return value
    .split("")
    .map((character) => normalizeMrzLetter(character))
    .join("");
}

function normalizeMrzDigit(character: string) {
  if (character === "O") return "0";
  if (character === "I") return "1";
  if (character === "B") return "8";
  if (character === "S") return "5";
  return character;
}

function normalizeMrzLetter(character: string) {
  if (character === "0") return "O";
  if (character === "1") return "I";
  if (character === "8") return "B";
  if (character === "5") return "S";
  return character;
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
      "local_ocr_no_mrz",
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
