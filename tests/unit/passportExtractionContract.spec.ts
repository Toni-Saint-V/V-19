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
  "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
  "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00",
].join("\n");

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
    const provider = vi.fn((request) =>
      Promise.resolve({
        applicantIndex: request.applicantIndex,
        fields: [],
        source: "edge-provider",
        status: "unavailable",
        summary: "No data.",
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
        provider: { extract: provider },
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
      extract: vi.fn(() =>
        Promise.resolve({
          fields: [],
          source: "edge-provider",
          status: "unavailable",
          summary: "No data.",
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
    expect(provider.extract).toHaveBeenCalledOnce();
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
      source: "edge-stub",
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
      source: "edge-stub",
      status: "unavailable",
    });
  });

  test("ignores legacy provider env and never calls paid passport fallback", async () => {
    const auditEvents: unknown[] = [];
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
        throw new Error("Passport extraction must not read raw files for paid fallback.");
      }
      if (url === "https://api.openai.com/v1/responses") {
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
        ({
          OPENAI_API_KEY: "server-openai-key",
          PASSPORT_EXTRACTION_PROVIDER_ENABLED: "true",
          PASSPORT_EXTRACTION_PROVIDER_ORDER: "openai",
          PASSPORT_EXTRACTION_OPENAI_MODEL: "gpt-4o-mini",
          SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
          SUPABASE_URL: "https://project.supabase.co",
        } as unknown) as Parameters<
          typeof createSupabaseRestPassportExtractionDependencies
        >[0],
        fetchMock as unknown as typeof fetch,
      ),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      fields: [],
      source: "edge-stub",
      status: "unavailable",
    });
    expect(
      fetchMock.mock.calls.some(
        ([input]) => String(input) === "https://api.openai.com/v1/responses",
      ),
    ).toBe(false);
    expect(auditEvents.at(-1)).toMatchObject({
      metadata: {
        confidence: "low",
        document_fingerprint: expect.stringMatching(/^passport-document:[0-9a-f]+$/),
        field_count: 0,
        needs_manual_review: true,
        source: "edge-stub",
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

  test("rejects incomplete provider output and keeps unavailable fallback honest", () => {
    const invalid = parsePassportExtractionResult({
      fields: [{ key: "passportNumber", value: "765432100" }],
      source: "edge-provider",
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
      source: "edge-provider",
      status: "extracted",
    });
    const resultWithoutManualReview = parsePassportExtractionResult({
      fields: [],
      needsManualReview: false,
      source: "edge-provider",
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
      source: "edge-provider",
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
      ]),
    );
  });

  test("rejects TD3 MRZ with invalid document-number check digit", () => {
    const result = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567890RUS9008205M2602268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      confidence: "low",
      fields: [],
      needsManualReview: true,
      source: "edge-stub",
      status: "unavailable",
    });
  });

  test("rejects TD3 MRZ with invalid birth-date check digit", () => {
    const result = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
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
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
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
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602268<<<<<<<<<<<<<<01",
      ].join("\n"),
    );
    const noisyTail = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
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
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "I234567897RUS9OO82O5M26O2268<<<<<<<<<<<<<<OO",
      ].join("\n"),
    );
    const countryCodeNoise = extractPassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
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
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
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
      source: "edge-stub",
      status: "unavailable",
      summary:
        "Данные не удалось распознать автоматически. Требуется ручная проверка. Проверьте данные вручную.",
    });
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
          extract: vi.fn(() => Promise.reject(providerError)),
        },
      }),
    );
    const body = await json(response);
    const auditJson = JSON.stringify(auditEvents);

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "Passport extraction provider failed." });
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
        document_fingerprint: expect.stringMatching(/^passport-document:[0-9a-f]+$/),
        safe_error_class: "provider_failed",
      },
    });
  });
});
