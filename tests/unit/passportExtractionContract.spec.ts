import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  parsePassportExtractionRequest,
  parsePassportExtractionResult,
  safeUnavailablePassportExtractionResult,
} from "../../supabase/functions/_shared/passport-extraction-contract";
import {
  createSupabaseRestPassportExtractionDependencies,
  handlePassportExtractionRequest,
  type PassportExtractionHandlerOptions,
} from "../../supabase/functions/_shared/passport-extraction-handler";
import {
  createLocalPassportOcrProvider,
  normalizeLocalOcrTextToMrzCandidateText,
} from "../../supabase/functions/_shared/passport-local-ocr";
import { extractPassportMrzText } from "../../supabase/functions/_shared/passport-mrz";

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function extractionRequest(body: Record<string, unknown> = {}, token = "user-token") {
  return new Request("https://edge.local/passport-extract", {
    body: JSON.stringify({
      document: {
        bucket: "submission-media",
        mimeType: "image/jpeg",
        path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
        sizeBytes: 1024,
      },
      requestId: "client-request-id",
      ...body,
    }),
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    method: "POST",
  });
}

function durableOptions(
  overrides: Partial<PassportExtractionHandlerOptions> = {},
): PassportExtractionHandlerOptions {
  return {
    auditStore: {
      record: () => Promise.resolve(),
    },
    authorizer: {
      authorize: () =>
        Promise.resolve({
          ok: true,
          actor: { id: "agent-1", role: "agent" },
        }),
    },
    now: () => "2026-06-17T12:00:00.000Z",
    requestIdFactory: () => "server-request-id",
    ...overrides,
  };
}

const validTd3Mrz = [
  "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
  "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00",
].join("\n");

const validTd3Dob1930Mrz = [
  "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
  "1234567897RUS3001019M2602268<<<<<<<<<<<<<<08",
].join("\n");

function spacedMrzLine(line: string) {
  return line.split("").join(" ");
}

interface FakeLocalCommandOutput {
  code: number;
  stderr: Uint8Array;
  stdout: Uint8Array;
  success: boolean;
}

interface FakeLocalCommandOptions {
  args: string[];
  stderr: "piped";
  stdout: "piped";
}

interface FakeLocalCommandCall {
  command: string;
  options: FakeLocalCommandOptions;
}

interface FakeLocalRuntimeState {
  calls: FakeLocalCommandCall[];
  removals: string[];
  writes: Array<{ bytes: Uint8Array; path: string }>;
}

const encoder = new TextEncoder();

async function withFakeDenoCommand(
  output: FakeLocalCommandOutput,
  run: (state: FakeLocalRuntimeState) => Promise<void>,
  options: { tempPath?: string } = {},
) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  const calls: FakeLocalCommandCall[] = [];
  const removals: string[] = [];
  const writes: Array<{ bytes: Uint8Array; path: string }> = [];
  const tempPath = options.tempPath ?? "/tmp/visaflow-passport-ocr.jpg";

  class FakeCommand {
    constructor(command: string, options: FakeLocalCommandOptions) {
      calls.push({ command, options });
    }

    spawn() {
      return {
        kill: vi.fn(),
        output: () => Promise.resolve(output),
      };
    }
  }

  Object.defineProperty(globalThis, "Deno", {
    configurable: true,
    value: {
      Command: FakeCommand,
      makeTempFile: vi.fn(() => Promise.resolve(tempPath)),
      remove: vi.fn((path: string) => {
        removals.push(path);
        return Promise.resolve();
      }),
      writeFile: vi.fn((path: string, bytes: Uint8Array) => {
        writes.push({ bytes, path });
        return Promise.resolve();
      }),
    },
  });

  try {
    await run({ calls, removals, writes });
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "Deno", previousDescriptor);
    } else {
      delete (globalThis as { Deno?: unknown }).Deno;
    }
  }
}

async function withFakeDenoRuntime(
  runtime: Record<string, unknown>,
  run: () => Promise<void>,
) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Deno");

  Object.defineProperty(globalThis, "Deno", {
    configurable: true,
    value: runtime,
  });

  try {
    await run();
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "Deno", previousDescriptor);
    } else {
      delete (globalThis as { Deno?: unknown }).Deno;
    }
  }
}

function tempPassportMaterializer(path = "/tmp/visaflow-passport-ocr.jpg") {
  return {
    materialize: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        path,
        cleanup: vi.fn(() => Promise.resolve()),
      }),
    ),
  };
}

describe("passport extraction contract", () => {
  test("accepts only private passport-scan document references and ignores forged actor", () => {
    const parsed = parsePassportExtractionRequest({
      actor: { canUseAI: true, id: "forged-admin", role: "admin" },
      document: {
        bucket: "submission-media",
        mimeType: "image/jpeg",
        path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
        sizeBytes: 1024,
      },
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect("actor" in parsed.data).toBe(false);
    }

    const unsafe = parsePassportExtractionRequest({
      document: {
        bucket: "submission-media",
        mimeType: "image/jpeg",
        path: "VF-1/applicant-1/selfie/v19abc_selfie.jpg",
        sizeBytes: 1024,
      },
    });

    expect(unsafe.ok).toBe(false);

    const unsafeNestedPath = parsePassportExtractionRequest({
      document: {
        bucket: "submission-media",
        mimeType: "image/jpeg",
        path: "VF-1/passport_scan/applicant-1/v19abc_passport_scan.jpg",
        sizeBytes: 1024,
      },
    });

    expect(unsafeNestedPath.ok).toBe(false);
  });

  test("fails closed without server-side authorization", async () => {
    const response = await handlePassportExtractionRequest(extractionRequest(), {
      auditStore: { record: () => Promise.resolve() },
    });

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: "Passport extraction authorization is not configured.",
    });
  });

  test("uses server-derived actor for provider and audit", async () => {
    const auditEvents: unknown[] = [];
    const provider = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        provider: "local_ocr_unavailable" as const,
        reason: "local_ocr_unavailable" as const,
      }),
    );

    const response = await handlePassportExtractionRequest(
      extractionRequest({
        actor: { canUseAI: true, id: "forged-admin", role: "admin" },
      }),
      durableOptions({
        auditStore: {
          record: (event) => {
            auditEvents.push(event);
            return Promise.resolve();
          },
        },
        authorizer: {
          authorize: () =>
            Promise.resolve({
              ok: true,
              actor: { id: "agent-real", role: "agent" },
            }),
        },
        provider: { recognizeText: provider },
      }),
    );

    expect(response.status).toBe(200);
    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: "agent-real", role: "agent" },
        requestId: "server-request-id",
      }),
    );
    expect(auditEvents).toEqual([
      expect.objectContaining({
        actorId: "agent-real",
        actorRole: "agent",
        event: "passport_extraction_invoked",
      }),
    ]);
  });

  test("does not require AI access or quota for free passport extraction", async () => {
    const auditEvents: unknown[] = [];
    const provider = {
      recognizeText: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          provider: "local_ocr_unavailable" as const,
          reason: "local_ocr_unavailable" as const,
        }),
      ),
    };

    const response = await handlePassportExtractionRequest(
      extractionRequest(),
      durableOptions({
        auditStore: {
          record: (event) => {
            auditEvents.push(event);
            return Promise.resolve();
          },
        },
        authorizer: {
          authorize: () =>
            Promise.resolve({
              ok: true,
              actor: { id: "agent-1", role: "agent" },
            }),
        },
        provider,
      }),
    );

    expect(response.status).toBe(200);
    expect(auditEvents.at(-1)).toMatchObject({
      actorId: "agent-1",
      event: "passport_extraction_invoked",
    });
    expect(provider.recognizeText).toHaveBeenCalledOnce();
  });

  test("extracts passport fields only from local OCR text with valid MRZ", async () => {
    const response = await handlePassportExtractionRequest(
      extractionRequest({ applicantIndex: 0 }),
      durableOptions({
        provider: {
          recognizeText: vi.fn(() =>
            Promise.resolve({
              ok: true as const,
              provider: "local_ocr" as const,
              text: validTd3Mrz,
            }),
          ),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      applicantIndex: 0,
      confidence: "high",
      needsManualReview: true,
      ocr: {
        attempted: true,
        provider: "local_ocr",
      },
      source: "local-ocr",
      status: "extracted",
    });
  });

  test("authorizes passport extraction through Supabase auth and media ownership", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) {
        return Response.json({
          id: "agent-1",
        });
      }
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }
      if (url.includes("/rest/v1/media_assets")) {
        return Response.json([
          {
            applicant_id: "applicant-1",
            mime_type: "image/jpeg",
            size_bytes: 1024,
            storage_bucket: "submission-media",
            storage_path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
            submission_id: "VF-1",
            type: "passport_scan",
          },
        ]);
      }
      if (url.includes("/rest/v1/submissions")) {
        return Response.json([{ agent_id: "agent-1" }]);
      }
      if (url.includes("/rest/v1/rpc/consume_ai_helper_quota")) {
        throw new Error("Passport extraction must not consume AI helper quota.");
      }
      if (url.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });
    const options = createSupabaseRestPassportExtractionDependencies(
      {
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        SUPABASE_URL: "https://project.supabase.co",
      },
      fetchMock as unknown as typeof fetch,
    );

    const response = await handlePassportExtractionRequest(
      extractionRequest({ actor: { canUseAI: true, id: "other", role: "admin" } }),
      options,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer user-token",
        }),
      }),
    );
    expect(await json(response)).toMatchObject({
      ocr: {
        attempted: true,
        provider: "local_ocr_unavailable",
        reason: "local_ocr_not_configured",
      },
      source: "local-ocr",
      status: "unavailable",
    });
  });

  test("returns unavailable without calling external OCR when no free provider is wired", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) {
        return Response.json({
          id: "agent-1",
        });
      }
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }
      if (url.includes("/rest/v1/media_assets")) {
        return Response.json([
          {
            applicant_id: "applicant-1",
            mime_type: "image/jpeg",
            size_bytes: 1024,
            storage_bucket: "submission-media",
            storage_path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
            submission_id: "VF-1",
            type: "passport_scan",
          },
        ]);
      }
      if (url.includes("/rest/v1/submissions")) {
        return Response.json([{ agent_id: "agent-1" }]);
      }
      if (url.includes("/rest/v1/rpc/consume_ai_helper_quota")) {
        throw new Error("Passport extraction must not consume AI helper quota.");
      }
      if (url.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });

    const response = await handlePassportExtractionRequest(
      extractionRequest({ applicantIndex: 0 }),
      createSupabaseRestPassportExtractionDependencies(
        {
          SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
          SUPABASE_URL: "https://project.supabase.co",
        },
        fetchMock as unknown as typeof fetch,
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://external-ocr.local/extract",
      expect.anything(),
    );
    expect(await json(response)).toMatchObject({
      fields: [],
      ocr: {
        attempted: true,
        provider: "local_ocr_unavailable",
        reason: "local_ocr_not_configured",
      },
      source: "local-ocr",
      status: "unavailable",
    });
  });

  test("ignores legacy provider env and never calls paid passport fallback", async () => {
    const auditEvents: unknown[] = [];
    const paidApiUrl = ["https://api", "openai.com/v1/responses"].join(".");
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "agent-1" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }
      if (url.includes("/rest/v1/media_assets")) {
        return Response.json([
          {
            applicant_id: "applicant-1",
            mime_type: "image/jpeg",
            size_bytes: 1024,
            storage_bucket: "submission-media",
            storage_path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
            submission_id: "VF-1",
            type: "passport_scan",
          },
        ]);
      }
      if (url.includes("/rest/v1/submissions")) {
        return Response.json([{ agent_id: "agent-1" }]);
      }
      if (url.includes("/rest/v1/passport_extraction_provider_attempts")) {
        throw new Error("Passport extraction must not reserve paid provider attempts.");
      }
      if (url.includes("/storage/v1/object/submission-media/")) {
        throw new Error(
          "Passport extraction must not read raw files for paid fallback.",
        );
      }
      if (url === paidApiUrl) {
        throw new Error("Passport extraction must not call OpenAI.");
      }
      if (url.includes("/rest/v1/ai_helper_audit_events")) {
        auditEvents.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });

    const response = await handlePassportExtractionRequest(
      extractionRequest({ allowOpenAiFallback: true }),
      createSupabaseRestPassportExtractionDependencies(
        {
          [`${"OPENAI"}_API_KEY`]: "server-openai-key",
          PASSPORT_EXTRACTION_PROVIDER_ENABLED: "true",
          PASSPORT_EXTRACTION_PROVIDER_ORDER: "openai",
          PASSPORT_EXTRACTION_OPENAI_MODEL: "gpt-4o-mini",
          SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
          SUPABASE_URL: "https://project.supabase.co",
        } as unknown as Parameters<
          typeof createSupabaseRestPassportExtractionDependencies
        >[0],
        fetchMock as unknown as typeof fetch,
      ),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      fields: [],
      source: "local-ocr",
      status: "unavailable",
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input) === paidApiUrl)).toBe(
      false,
    );
    expect(auditEvents.at(-1)).toMatchObject({
      metadata: {
        confidence: "low",
        document_fingerprint: expect.stringMatching(/^passport-document:[0-9a-f]+$/),
        field_count: 0,
        needs_manual_review: true,
        ocr_attempted: true,
        ocr_provider: "local_ocr_unavailable",
        ocr_reason: "local_ocr_not_configured",
        source: "local-ocr",
        status: "unavailable",
      },
    });
    expect(JSON.stringify(auditEvents)).not.toContain(
      "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
    );
    expect(JSON.stringify(auditEvents)).not.toContain("765432100");
  });

  test("denies Supabase extraction when media belongs to another agent", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) {
        return Response.json({
          id: "agent-1",
        });
      }
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }
      if (url.includes("/rest/v1/media_assets")) {
        return Response.json([
          {
            applicant_id: "applicant-1",
            mime_type: "image/jpeg",
            size_bytes: 1024,
            storage_bucket: "submission-media",
            storage_path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
            submission_id: "VF-1",
            type: "passport_scan",
          },
        ]);
      }
      if (url.includes("/rest/v1/submissions")) {
        return Response.json([{ agent_id: "agent-2" }]);
      }
      if (url.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });

    const response = await handlePassportExtractionRequest(
      extractionRequest(),
      createSupabaseRestPassportExtractionDependencies(
        {
          SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
          SUPABASE_URL: "https://project.supabase.co",
        },
        fetchMock as unknown as typeof fetch,
      ),
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      error: "Passport extraction is not allowed for this submission.",
    });
  });

  test("denies Supabase extraction when caller forges registered media metadata", async () => {
    const storagePath = "VF-1/applicant-1/passport_scan/v19abc_passport_scan.pdf";
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "agent-1" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }
      if (url.includes("/rest/v1/media_assets")) {
        return Response.json([
          {
            applicant_id: "applicant-1",
            mime_type: "application/pdf",
            size_bytes: 4096,
            storage_bucket: "submission-media",
            storage_path: storagePath,
            submission_id: "VF-1",
            type: "passport_scan",
          },
        ]);
      }
      if (url.includes("/storage/v1/object/submission-media/")) {
        throw new Error("Forged metadata must not trigger storage download.");
      }
      if (url.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });

    await withFakeDenoCommand(
      {
        code: 0,
        stderr: new Uint8Array(),
        stdout: encoder.encode(validTd3Mrz),
        success: true,
      },
      async ({ calls, writes }) => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({
            document: {
              bucket: "submission-media",
              mimeType: "image/jpeg",
              path: storagePath,
              sizeBytes: 1024,
            },
          }),
          createSupabaseRestPassportExtractionDependencies(
            {
              PASSPORT_OCR_COMMAND: "tesseract",
              PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
              SUPABASE_URL: "https://project.supabase.co",
            },
            fetchMock as unknown as typeof fetch,
          ),
        );

        expect(response.status).toBe(403);
        expect(await json(response)).toMatchObject({
          error: "Passport document is not registered for extraction.",
        });
        expect(calls).toEqual([]);
        expect(writes).toEqual([]);
      },
    );
  });

  test("rejects incomplete local OCR output and keeps unavailable fallback honest", () => {
    const invalid = parsePassportExtractionResult({
      fields: [{ key: "passportNumber", value: "765432100" }],
      source: "local-ocr",
      status: "extracted",
    });

    expect(invalid.ok).toBe(false);

    const fallback = safeUnavailablePassportExtractionResult(0);
    expect(fallback.status).toBe("unavailable");
    expect(fallback.fields).toEqual([]);
    expect(fallback.summary).toContain("Требуется ручная проверка");
  });

  test("rejects extracted provider output that does not require manual review", () => {
    const fieldWithoutManualReview = parsePassportExtractionResult({
      fields: [
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: false,
          value: "765432100",
        },
      ],
      ocr: {
        attempted: true,
        provider: "local_ocr",
      },
      source: "local-ocr",
      status: "extracted",
    });
    const resultWithoutManualReview = parsePassportExtractionResult({
      fields: [],
      needsManualReview: false,
      source: "local-ocr",
      status: "unavailable",
    });

    expect(fieldWithoutManualReview.ok).toBe(false);
    expect(resultWithoutManualReview.ok).toBe(false);
  });

  test("normalizes valid extracted fields as manual-review data", () => {
    const parsed = parsePassportExtractionResult({
      fields: [
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: true,
          value: "765432100",
        },
      ],
      ocr: {
        attempted: true,
        provider: "local_ocr",
      },
      source: "local-ocr",
      status: "extracted",
      summary: "Данные подготовлены.",
      orientation: {
        corrected: true,
        reason: "mrz_detected",
        rotation: 270,
      },
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.fields[0]).toMatchObject({
        key: "passportNumber",
        needsManualReview: true,
      });
      expect(parsed.data.orientation).toEqual({
        corrected: true,
        reason: "mrz_detected",
        rotation: 270,
      });
      expect(parsed.data.guardrails.join(" ")).toContain("проверить вручную");
    }
  });

  test("parses valid TD3 MRZ text into manual-review passport fields", () => {
    const result = extractPassportMrzText(validTd3Mrz, 0);

    expect(result).toMatchObject({
      applicantIndex: 0,
      confidence: "high",
      needsManualReview: true,
      source: "local-ocr",
      status: "extracted",
      summary: expect.stringContaining("Требуется ручная проверка"),
    });
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "high",
          key: "surname",
          needsManualReview: true,
          value: "IVANOV",
        }),
        expect.objectContaining({
          key: "firstName",
          needsManualReview: true,
          value: "IVAN",
        }),
        expect.objectContaining({
          key: "passportNumber",
          value: "123456789",
        }),
        expect.objectContaining({
          key: "birthDate",
          value: "20.08.1990",
        }),
        expect.objectContaining({
          key: "passportExpiresAt",
          value: "26.02.2026",
        }),
        expect.objectContaining({
          key: "citizenship",
          value: "Russian Federation",
        }),
        expect.objectContaining({
          key: "passportIssueCountry",
          value: "Russian Federation",
        }),
        expect.objectContaining({
          key: "gender",
          value: "Male - Мужской",
        }),
        expect.objectContaining({
          key: "passportType",
          value: "Ordinary Passport",
        }),
      ]),
    );
  });

  test("uses the current-year pivot for TD3 birth-date century inference", () => {
    const result = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS3001019M2602268<<<<<<<<<<<<<<08",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      confidence: "high",
      needsManualReview: true,
      source: "local-ocr",
      status: "extracted",
    });
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "birthDate",
          value: "01.01.1930",
        }),
      ]),
    );
    expect(result.fields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "birthDate",
          value: "01.01.2030",
        }),
      ]),
    );
  });

  test("rejects truncated TD3 MRZ line one even when line two is otherwise valid", () => {
    const result = extractPassportMrzText(
      ["P<RUSIVANOV<<IVAN", "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00"].join("\n"),
    );

    expect(result).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      source: "local-ocr",
      status: "unavailable",
    });
    expect(result.status).not.toBe("extracted");
    expect(result.confidence).not.toBe("high");
  });

  test("rejects TD3 MRZ with invalid document-number check digit", () => {
    const result = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567890RUS9008205M2602268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      source: "local-ocr",
      status: "unavailable",
    });
  });

  test("rejects TD3 MRZ with invalid birth-date check digit", () => {
    const result = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008200M2602268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      status: "unavailable",
    });
  });

  test("rejects TD3 MRZ with invalid expiry-date check digit", () => {
    const result = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602260<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      status: "unavailable",
    });
  });

  test("validates clean 44-character composite check digit", () => {
    const invalidComposite = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602268<<<<<<<<<<<<<<01",
      ].join("\n"),
    );
    const noisyTail = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00RB",
      ].join("\n"),
    );

    expect(invalidComposite).toMatchObject({
      confidence: "low",
      fields: [],
      status: "unavailable",
    });
    expect(noisyTail).toMatchObject({
      confidence: "medium",
      needsManualReview: true,
      source: "local-ocr",
      status: "extracted",
    });
  });

  test("normalizes OCR digit substitutions only in MRZ-critical numeric regions", () => {
    const normalized = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "I234567897RUS9OO82O5M26O2268<<<<<<<<<<<<<<OO",
      ].join("\n"),
    );
    const countryCodeNoise = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RU59008205M2602268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(normalized).toMatchObject({
      confidence: "high",
      needsManualReview: true,
      status: "extracted",
    });
    expect(normalized.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "firstName", value: "IVAN" }),
        expect.objectContaining({ key: "passportNumber", value: "123456789" }),
        expect.objectContaining({ key: "birthDate", value: "20.08.1990" }),
        expect.objectContaining({ key: "passportExpiresAt", value: "26.02.2026" }),
      ]),
    );
    expect(countryCodeNoise).toMatchObject({
      confidence: "low",
      fields: [],
      status: "unavailable",
    });
  });

  test("does not produce trusted extraction for malformed or partial MRZ text", () => {
    for (const text of [
      "",
      "P<RUSIVANOV<<IVAN",
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602268",
      ].join("\n"),
    ]) {
      expect(extractPassportMrzText(text)).toMatchObject({
        confidence: "low",
        fields: [],
        needsManualReview: true,
        status: "unavailable",
      });
    }
  });

  test("keeps unsupported PDF-only server input unavailable and manual-review only", async () => {
    const response = await handlePassportExtractionRequest(
      extractionRequest({
        applicantIndex: 0,
        document: {
          bucket: "submission-media",
          mimeType: "application/pdf",
          path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.pdf",
          sizeBytes: 2048,
        },
      }),
      durableOptions(),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      ocr: {
        attempted: true,
        provider: "local_ocr_unavailable",
        reason: "local_ocr_not_configured",
      },
      source: "local-ocr",
      status: "unavailable",
      summary:
        "Данные не удалось распознать автоматически. Требуется ручная проверка. Проверьте данные вручную.",
    });
  });

  test("keeps local CLI OCR disabled unless the exact env provider is configured", async () => {
    const response = await handlePassportExtractionRequest(
      extractionRequest({ applicantIndex: 0 }),
      durableOptions({
        provider: createLocalPassportOcrProvider({
          PASSPORT_OCR_COMMAND: "tesseract",
          PASSPORT_OCR_PROVIDER: "disabled",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      ocr: {
        attempted: true,
        provider: "local_ocr_unavailable",
        reason: "local_ocr_not_configured",
      },
      source: "local-ocr",
      status: "unavailable",
    });
  });

  test("fails closed when local CLI OCR is configured without the exact command", async () => {
    const response = await handlePassportExtractionRequest(
      extractionRequest({ applicantIndex: 0 }),
      durableOptions({
        provider: createLocalPassportOcrProvider({
          PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      fields: [],
      needsManualReview: true,
      ocr: {
        attempted: true,
        provider: "local_ocr_unavailable",
        reason: "local_ocr_command_not_allowed",
      },
      status: "unavailable",
    });
  });

  test("skips configured local CLI OCR for PDF before materialization or command", async () => {
    const materializer = tempPassportMaterializer();

    await withFakeDenoCommand(
      {
        code: 0,
        stderr: new Uint8Array(),
        stdout: encoder.encode(validTd3Mrz),
        success: true,
      },
      async ({ calls }) => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({
            applicantIndex: 0,
            document: {
              bucket: "submission-media",
              mimeType: "application/pdf",
              path: "VF-1/applicant-1/passport_scan/v19abc_passport_scan.pdf",
              sizeBytes: 2048,
            },
          }),
          durableOptions({
            provider: createLocalPassportOcrProvider(
              {
                PASSPORT_OCR_COMMAND: "tesseract",
                PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              },
              { materializer },
            ),
          }),
        );

        expect(response.status).toBe(200);
        expect(await json(response)).toMatchObject({
          fields: [],
          needsManualReview: true,
          ocr: {
            reason: "local_ocr_unsupported_mime",
          },
          status: "unavailable",
        });
        expect(calls).toEqual([]);
        expect(materializer.materialize).not.toHaveBeenCalled();
      },
    );
  });

  test("fails closed before materialization when local command runtime is unavailable", async () => {
    const materializer = tempPassportMaterializer();

    await withFakeDenoRuntime(
      {
        makeTempFile: vi.fn(() => Promise.resolve("/tmp/visaflow-passport-ocr.jpg")),
        remove: vi.fn(() => Promise.resolve()),
        writeFile: vi.fn(() => Promise.resolve()),
      },
      async () => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({ applicantIndex: 0 }),
          durableOptions({
            provider: createLocalPassportOcrProvider(
              {
                PASSPORT_OCR_COMMAND: "tesseract",
                PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              },
              { materializer },
            ),
          }),
        );

        expect(response.status).toBe(200);
        expect(await json(response)).toMatchObject({
          fields: [],
          needsManualReview: true,
          ocr: {
            provider: "local_ocr_unavailable",
            reason: "local_ocr_runtime_unavailable",
          },
          status: "unavailable",
        });
        expect(materializer.materialize).not.toHaveBeenCalled();
      },
    );
  });

  test("fails closed when local CLI OCR command fails without exposing command output", async () => {
    const sensitiveMrzFixture = [
      "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00",
    ].join("\n");
    const auditEvents: unknown[] = [];
    const materializer = tempPassportMaterializer();

    await withFakeDenoCommand(
      {
        code: 1,
        stderr: encoder.encode(`stderr ${sensitiveMrzFixture}`),
        stdout: encoder.encode(`stdout ${sensitiveMrzFixture}`),
        success: false,
      },
      async ({ calls }) => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({ applicantIndex: 0 }),
          durableOptions({
            auditStore: {
              record: (event) => {
                auditEvents.push(event);
                return Promise.resolve();
              },
            },
            provider: createLocalPassportOcrProvider(
              {
                PASSPORT_OCR_COMMAND: "tesseract",
                PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              },
              { materializer },
            ),
          }),
        );
        const body = await json(response);
        const safeOutput = JSON.stringify([body, auditEvents]);

        expect(response.status).toBe(200);
        expect(calls).toEqual([
          {
            command: "tesseract",
            options: {
              args: ["/tmp/visaflow-passport-ocr.jpg", "stdout", "--psm", "6"],
              stderr: "piped",
              stdout: "piped",
            },
          },
        ]);
        expect(body).toMatchObject({
          fields: [],
          ocr: {
            provider: "local_ocr_unavailable",
            reason: "local_ocr_command_failed",
          },
          status: "unavailable",
        });
        expect(materializer.materialize).toHaveBeenCalledOnce();
        expect(safeOutput).not.toContain("P<RUSIVANOV");
        expect(safeOutput).not.toContain("123456789");
        expect(safeOutput).not.toContain(
          "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
        );
      },
    );
  });

  test("keeps OCR noise and partial TD3 unavailable for manual review", async () => {
    for (const stdout of [
      "passport number 765432100\nname IVAN IVANOV\nnot mrz",
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602268",
      ].join("\n"),
    ]) {
      const materializer = tempPassportMaterializer();
      await withFakeDenoCommand(
        {
          code: 0,
          stderr: new Uint8Array(),
          stdout: encoder.encode(stdout),
          success: true,
        },
        async () => {
          const response = await handlePassportExtractionRequest(
            extractionRequest({ applicantIndex: 0 }),
            durableOptions({
              provider: createLocalPassportOcrProvider(
                {
                  PASSPORT_OCR_COMMAND: "tesseract",
                  PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
                },
                { materializer },
              ),
            }),
          );

          expect(response.status).toBe(200);
          expect(await json(response)).toMatchObject({
            fields: [],
            needsManualReview: true,
            ocr: {
              reason: "local_ocr_no_mrz",
            },
            status: "unavailable",
          });
          expect(materializer.materialize).toHaveBeenCalledOnce();
        },
      );
    }
  });

  test("keeps normalized local OCR candidates unavailable when MRZ checks fail", async () => {
    const [line1 = "", line2 = ""] = validTd3Dob1930Mrz.split("\n");
    const materializer = tempPassportMaterializer();
    const invalidCheckDigitLine2 = `${line2.slice(0, 43)}9`;

    await withFakeDenoCommand(
      {
        code: 0,
        stderr: new Uint8Array(),
        stdout: encoder.encode([line1.slice(0, -2), invalidCheckDigitLine2].join("\n")),
        success: true,
      },
      async () => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({ applicantIndex: 0 }),
          durableOptions({
            provider: createLocalPassportOcrProvider(
              {
                PASSPORT_OCR_COMMAND: "tesseract",
                PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              },
              { materializer },
            ),
          }),
        );

        expect(response.status).toBe(200);
        expect(await json(response)).toMatchObject({
          fields: [],
          needsManualReview: true,
          ocr: {
            reason: "local_ocr_no_mrz",
          },
          status: "unavailable",
        });
        expect(materializer.materialize).toHaveBeenCalledOnce();
      },
    );
  });

  test("extracts valid local CLI TD3 only through the existing MRZ parser", async () => {
    const [line1 = ""] = validTd3Dob1930Mrz.split("\n");
    const materializer = tempPassportMaterializer();
    await withFakeDenoCommand(
      {
        code: 0,
        stderr: encoder.encode("ignored provider diagnostics"),
        stdout: encoder.encode(
          [
            "visible OCR text before MRZ",
            line1.slice(0, -2),
            "1234567897RUS3OO1O19M26O2268<<<<<<<<<<<<<<O8",
            "visible OCR text after MRZ",
          ].join("\n"),
        ),
        success: true,
      },
      async () => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({ applicantIndex: 0 }),
          durableOptions({
            provider: createLocalPassportOcrProvider(
              {
                PASSPORT_OCR_COMMAND: "tesseract",
                PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              },
              { materializer },
            ),
          }),
        );
        const body = await json(response);

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          confidence: "high",
          needsManualReview: true,
          ocr: {
            attempted: true,
            provider: "local_ocr",
          },
          source: "local-ocr",
          status: "extracted",
        });
        expect(body.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: "passportNumber",
              needsManualReview: true,
              value: "123456789",
            }),
            expect.objectContaining({
              key: "birthDate",
              needsManualReview: true,
              value: "01.01.1930",
            }),
          ]),
        );
        expect(materializer.materialize).toHaveBeenCalledOnce();
      },
    );
  });

  test("does not convert arbitrary local OCR text into extracted fields", async () => {
    const materializer = tempPassportMaterializer();
    await withFakeDenoCommand(
      {
        code: 0,
        stderr: new Uint8Array(),
        stdout: encoder.encode(
          JSON.stringify({
            fields: [{ key: "passportNumber", value: "765432100" }],
          }),
        ),
        success: true,
      },
      async () => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({ applicantIndex: 0 }),
          durableOptions({
            provider: createLocalPassportOcrProvider(
              {
                PASSPORT_OCR_COMMAND: "tesseract",
                PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              },
              { materializer },
            ),
          }),
        );
        const body = await json(response);

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
          fields: [],
          needsManualReview: true,
          ocr: {
            reason: "local_ocr_no_mrz",
          },
          status: "unavailable",
        });
        expect(materializer.materialize).toHaveBeenCalledOnce();
        expect(JSON.stringify(body)).not.toContain("765432100");
      },
    );
  });

  test("downloads private storage object to temp file before local CLI OCR", async () => {
    const auditEvents: unknown[] = [];
    const storageBytes = encoder.encode("fake image bytes");
    const storagePath = "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg";
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "agent-1" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }
      if (url.includes("/rest/v1/media_assets")) {
        return Response.json([
          {
            applicant_id: "applicant-1",
            mime_type: "image/jpeg",
            size_bytes: 1024,
            storage_bucket: "submission-media",
            storage_path: storagePath,
            submission_id: "VF-1",
            type: "passport_scan",
          },
        ]);
      }
      if (url.includes("/rest/v1/submissions")) {
        return Response.json([{ agent_id: "agent-1" }]);
      }
      if (url.includes("/storage/v1/object/submission-media/")) {
        return new Response(storageBytes, { status: 200 });
      }
      if (url.includes("/rest/v1/ai_helper_audit_events")) {
        auditEvents.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });

    await withFakeDenoCommand(
      {
        code: 0,
        stderr: new Uint8Array(),
        stdout: encoder.encode(
          [
            "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<",
            "1234567897RUS3001019M2602268<<<<<<<<<<<<<<08",
          ].join("\n"),
        ),
        success: true,
      },
      async ({ calls, removals, writes }) => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({ applicantIndex: 0 }),
          createSupabaseRestPassportExtractionDependencies(
            {
              PASSPORT_OCR_COMMAND: "tesseract",
              PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
              SUPABASE_URL: "https://project.supabase.co",
            },
            fetchMock as unknown as typeof fetch,
          ),
        );
        const body = await json(response);
        const safeOutput = JSON.stringify([body, auditEvents, calls]);

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
          `https://project.supabase.co/storage/v1/object/submission-media/${storagePath}`,
          expect.objectContaining({
            headers: expect.objectContaining({
              authorization: "Bearer server-only",
            }),
            method: "GET",
          }),
        );
        expect(writes).toHaveLength(1);
        expect(writes[0]?.path).toBe("/tmp/visaflow-passport-ocr.jpg");
        expect(Array.from(writes[0]?.bytes ?? [])).toEqual(Array.from(storageBytes));
        expect(calls).toEqual([
          {
            command: "tesseract",
            options: {
              args: ["/tmp/visaflow-passport-ocr.jpg", "stdout", "--psm", "6"],
              stderr: "piped",
              stdout: "piped",
            },
          },
        ]);
        expect(removals).toEqual(["/tmp/visaflow-passport-ocr.jpg"]);
        expect(body).toMatchObject({
          ocr: {
            provider: "local_ocr",
          },
          status: "extracted",
        });
        expect(body.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: "birthDate",
              value: "01.01.1930",
            }),
          ]),
        );
        expect(safeOutput).not.toContain(storagePath);
        expect(safeOutput).not.toContain("P<RUSIVANOV");
      },
    );
  });

  test("fails closed when private storage object exceeds declared size", async () => {
    const storageBytes = encoder.encode("oversized fake image bytes");
    const storagePath = "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg";
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "agent-1" });
      if (url.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }
      if (url.includes("/rest/v1/media_assets")) {
        return Response.json([
          {
            applicant_id: "applicant-1",
            mime_type: "image/jpeg",
            size_bytes: 4,
            storage_bucket: "submission-media",
            storage_path: storagePath,
            submission_id: "VF-1",
            type: "passport_scan",
          },
        ]);
      }
      if (url.includes("/rest/v1/submissions")) {
        return Response.json([{ agent_id: "agent-1" }]);
      }
      if (url.includes("/storage/v1/object/submission-media/")) {
        return new Response(storageBytes, { status: 200 });
      }
      if (url.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });

    await withFakeDenoCommand(
      {
        code: 0,
        stderr: new Uint8Array(),
        stdout: encoder.encode(validTd3Mrz),
        success: true,
      },
      async ({ calls, removals, writes }) => {
        const response = await handlePassportExtractionRequest(
          extractionRequest({
            document: {
              bucket: "submission-media",
              mimeType: "image/jpeg",
              path: storagePath,
              sizeBytes: 4,
            },
          }),
          createSupabaseRestPassportExtractionDependencies(
            {
              PASSPORT_OCR_COMMAND: "tesseract",
              PASSPORT_OCR_PROVIDER: "local_tesseract_cli",
              SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
              SUPABASE_URL: "https://project.supabase.co",
            },
            fetchMock as unknown as typeof fetch,
          ),
        );

        expect(response.status).toBe(200);
        expect(await json(response)).toMatchObject({
          fields: [],
          needsManualReview: true,
          ocr: {
            provider: "local_ocr_unavailable",
            reason: "local_ocr_input_too_large",
          },
          status: "unavailable",
        });
        expect(writes).toEqual([]);
        expect(calls).toEqual([]);
        expect(removals).toEqual([]);
      },
    );
  });

  test("normalizes spaced local OCR TD3 text to two candidate lines", () => {
    const [line1 = "", line2 = ""] = validTd3Mrz.split("\n");
    const candidateText = normalizeLocalOcrTextToMrzCandidateText(
      [
        "ignore this line",
        spacedMrzLine(line1),
        spacedMrzLine(line2),
        "residence line hidden",
      ].join("\n"),
    );

    expect(candidateText).toBe(validTd3Mrz);
    expect(candidateText).toMatch(/^[A-Z0-9<\n]+$/);
    expect(candidateText).not.toContain("residence");
  });

  test("normalizes noisy local OCR output to TD3 candidate characters only", () => {
    const candidateText = normalizeLocalOcrTextToMrzCandidateText(
      [
        "ignore this line",
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<***",
        "1234567897 RUS 9008205 M 2602268 <<<<<<<<<<<<<<00",
        "residence line hidden",
      ].join("\n"),
    );

    expect(candidateText).toBe(validTd3Mrz);
    expect(candidateText).toMatch(/^[A-Z0-9<\n]+$/);
    expect(candidateText).not.toContain("residence");
  });

  test("pads short TD3 line one filler without bypassing the existing parser", () => {
    const [line1 = "", line2 = ""] = validTd3Dob1930Mrz.split("\n");
    const candidateText = normalizeLocalOcrTextToMrzCandidateText(
      [line1.slice(0, -2), line2].join("\n"),
    );
    const parsed = extractPassportMrzText(candidateText);

    expect(candidateText).toBe(validTd3Dob1930Mrz);
    expect(parsed).toMatchObject({
      confidence: "high",
      needsManualReview: true,
      status: "extracted",
    });
    expect(parsed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "birthDate", value: "01.01.1930" }),
      ]),
    );
  });

  test("reconstructs joined TD3 output with short line one before parser validation", () => {
    const [line1 = "", line2 = ""] = validTd3Dob1930Mrz.split("\n");
    const candidateText = normalizeLocalOcrTextToMrzCandidateText(
      `noise before ${line1.slice(0, -2)}${line2} noise after`,
    );

    expect(candidateText).toBe(validTd3Dob1930Mrz);
    expect(extractPassportMrzText(candidateText)).toMatchObject({
      confidence: "high",
      needsManualReview: true,
      status: "extracted",
    });
  });

  test("keeps server local OCR source free of cloud and browser OCR paths", () => {
    const localOcrSource = readFileSync(
      join(process.cwd(), "supabase/functions/_shared/passport-local-ocr.ts"),
      "utf8",
    );
    const cloudProviderTerms = [
      ["OPENAI", "_API_KEY"],
      ["https://api.", "openai.com"],
      ["api.", "anthropic"],
      ["generative", "language"],
      ["vision.", "googleapis"],
      ["tex", "tract"],
      ["computervision.", "azure"],
      ["new ", "OpenAI"],
      ["Anthropic", "("],
      ["@ai", "-sdk"],
      ["generate", "Text"],
      ["stream", "Text"],
      ["chat.", "completions"],
      ["responses.", "create"],
      ["AWS", "_ACCESS_KEY"],
      ["AZURE", "_"],
    ].map((parts) => parts.join(""));
    const browserOcrTerms = [
      ["tesseract", ".js"],
      ["create", "Worker"],
      ["Tesseract.", "recognize"],
      ["window", "."],
      ["document", "."],
      ["navigator", "."],
    ].map((parts) => parts.join(""));

    for (const forbidden of [...cloudProviderTerms, ...browserOcrTerms]) {
      expect(localOcrSource).not.toContain(forbidden);
    }
  });

  test("does not expose raw MRZ or passport PII in audit metadata or thrown errors", async () => {
    const auditEvents: unknown[] = [];
    const providerError = new Error(
      "MRZ P<RUSIVANOV<<IVAN 123456789 20.08.1990 VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
    );
    const response = await handlePassportExtractionRequest(
      extractionRequest(),
      durableOptions({
        auditStore: {
          record: (event) => {
            auditEvents.push(event);
            return Promise.resolve();
          },
        },
        provider: {
          recognizeText: vi.fn(() => Promise.reject(providerError)),
        },
      }),
    );
    const body = await json(response);
    const auditJson = JSON.stringify(auditEvents);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      ocr: {
        attempted: true,
        provider: "local_ocr_unavailable",
        reason: "local_ocr_unavailable",
      },
      status: "unavailable",
    });
    for (const forbidden of [
      "P<RUSIVANOV",
      "IVANOV",
      "IVAN",
      "123456789",
      "20.08.1990",
      "VF-1/applicant-1/passport_scan/v19abc_passport_scan.jpg",
    ]) {
      expect(JSON.stringify(body)).not.toContain(forbidden);
      expect(auditJson).not.toContain(forbidden);
    }
    expect(auditEvents.at(-1)).toMatchObject({
      metadata: {
        confidence: "low",
        document_fingerprint: expect.stringMatching(/^passport-document:[0-9a-f]+$/),
        field_count: 0,
        needs_manual_review: true,
        ocr_attempted: true,
        ocr_provider: "local_ocr_unavailable",
        ocr_reason: "local_ocr_unavailable",
        source: "local-ocr",
        status: "unavailable",
      },
    });
  });
});
