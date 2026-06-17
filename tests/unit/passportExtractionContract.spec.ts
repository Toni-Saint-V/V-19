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
          actor: { canUseAI: true, id: "agent-1", role: "agent" },
        }),
    },
    now: () => "2026-06-17T12:00:00.000Z",
    quotaStore: {
      consume: () => Promise.resolve({ remaining: 4 }),
    },
    requestIdFactory: () => "server-request-id",
    ...overrides,
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
      extractionRequest({ actor: { canUseAI: true, id: "forged-admin", role: "admin" } }),
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
              actor: { canUseAI: true, id: "agent-real", role: "agent" },
            }),
        },
        provider: { extract: provider },
      }),
    );

    expect(response.status).toBe(200);
    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { canUseAI: true, id: "agent-real", role: "agent" },
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

  test("denies disabled AI access before quota and provider", async () => {
    const auditEvents: unknown[] = [];
    const provider = { extract: vi.fn(() => Promise.resolve({})) };
    const quotaStore = { consume: vi.fn() };

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
              actor: { canUseAI: false, id: "agent-1", role: "agent" },
            }),
        },
        provider,
        quotaStore,
      }),
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      error: "Passport extraction AI access is disabled.",
    });
    expect(auditEvents.at(-1)).toMatchObject({
      actorId: "agent-1",
      event: "passport_extraction_denied",
      reason: "Passport extraction AI access is disabled.",
    });
    expect(quotaStore.consume).not.toHaveBeenCalled();
    expect(provider.extract).not.toHaveBeenCalled();
  });

  test("fails closed without quota storage before provider", async () => {
    const provider = { extract: vi.fn(() => Promise.resolve({})) };
    const response = await handlePassportExtractionRequest(
      extractionRequest(),
      durableOptions({
        provider,
        quotaStore: undefined,
      }),
    );

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: "Passport extraction quota store is not configured.",
    });
    expect(provider.extract).not.toHaveBeenCalled();
  });

  test("rate-limits passport extraction before provider", async () => {
    const provider = { extract: vi.fn(() => Promise.resolve({})) };
    const response = await handlePassportExtractionRequest(
      extractionRequest(),
      durableOptions({
        provider,
        quotaStore: {
          consume: () =>
            Promise.resolve({
              remaining: 0,
              resetAt: "2026-06-17T13:00:00.000Z",
            }),
        },
      }),
    );

    expect(response.status).toBe(429);
    expect(await json(response)).toEqual({
      error:
        "Passport extraction quota is exhausted until 2026-06-17T13:00:00.000Z.",
    });
    expect(provider.extract).not.toHaveBeenCalled();
  });

  test("authorizes passport extraction through Supabase auth and media ownership", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) {
        return Response.json({
          app_metadata: { can_use_ai: true },
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
        return Response.json({ remaining: 3 });
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
        PASSPORT_EXTRACTION_QUOTA_RPC: "consume_ai_helper_quota",
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

  test("denies Supabase extraction when media belongs to another agent", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) {
        return Response.json({
          app_metadata: { can_use_ai: true },
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
    expect(fallback.summary).toContain("недоступно");
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
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.fields[0]).toMatchObject({
        key: "passportNumber",
        needsManualReview: true,
      });
      expect(parsed.data.guardrails.join(" ")).toContain("проверить вручную");
    }
  });
});
