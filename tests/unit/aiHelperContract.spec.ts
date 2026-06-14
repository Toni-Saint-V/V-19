import { describe, expect, test, vi } from "vitest";
import {
  buildSafeAiHelperStubResult,
  type AiHelperRequest,
  evaluateAiHelperAccess,
  evaluateAiHelperRateLimit,
  parseAiHelperRequest,
  parseAiHelperResult,
  type AiHelperAuditEvent,
  type AiHelperActor,
} from "../../supabase/functions/_shared/ai-helper-contract";
import {
  createSupabaseRestAiHelperDependencies,
  handleAiHelperRequest,
  type AiHelperHandlerOptions,
} from "../../supabase/functions/_shared/ai-helper-handler";

const adminActor: AiHelperActor = {
  id: "admin-1",
  role: "admin",
  canUseAI: true,
};

const agentActor: AiHelperActor = {
  id: "agent-1",
  role: "agent",
  canUseAI: true,
};

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function helperRequest(
  intent = "text_intake_review",
  actor: AiHelperActor = agentActor,
): Request {
  return new Request("https://edge.local/ai-helper", {
    method: "POST",
    body: JSON.stringify({
      intent,
      context: {
        submissionId: "VF-1",
        applicantEmail: "private@example.com",
        freeText: "raw applicant context must not be audited",
      },
      actor,
      requestId: "client-reused-id",
    }),
  });
}

function durableOptions(
  overrides: Partial<AiHelperHandlerOptions> = {},
): AiHelperHandlerOptions & { auditEvents: AiHelperAuditEvent[] } {
  const auditEvents: AiHelperAuditEvent[] = [];

  return {
    auditEvents,
    now: () => "2026-06-14T12:00:00.000Z",
    auditStore: {
      record: (event) => {
        auditEvents.push(event);
        return Promise.resolve();
      },
    },
    quotaStore: {
      consume: () => Promise.resolve({ remaining: 4 }),
    },
    provider: {
      generate: (request) =>
        Promise.resolve(buildSafeAiHelperStubResult(request.intent, "edge-stub")),
    },
    requestIdFactory: () => "server-request-1",
    ...overrides,
  };
}

describe("AI helper shared contract", () => {
  test("accepts only explicit actor-scoped helper requests", () => {
    const parsed = parseAiHelperRequest({
      intent: "text_intake_review",
      context: { submissionId: "VF-1" },
      actor: agentActor,
      requestId: "request-1",
    });

    expect(parsed).toEqual({
      ok: true,
      data: {
        intent: "text_intake_review",
        context: { submissionId: "VF-1" },
        actor: agentActor,
      },
    });
    expect(parseAiHelperRequest({ intent: "text_intake_review" })).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      parseAiHelperRequest({ intent: "unknown", actor: agentActor }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  test("denies disabled users and admin-only helper intents", () => {
    expect(
      evaluateAiHelperAccess({
        intent: "readiness_summary",
        context: {},
        actor: { ...agentActor, canUseAI: false },
      }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      evaluateAiHelperAccess({
        intent: "export_guard",
        context: {},
        actor: agentActor,
      }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      evaluateAiHelperAccess({
        intent: "export_guard",
        context: {},
        actor: adminActor,
      }),
    ).toMatchObject({ ok: true });
  });

  test("exposes a fail-closed rate limit boundary", () => {
    const request = {
      intent: "text_intake_review" as const,
      context: {},
      actor: agentActor,
    };

    expect(evaluateAiHelperRateLimit(request)).toMatchObject({ ok: true });
    expect(
      evaluateAiHelperRateLimit(request, {
        remaining: 0,
        resetAt: "2026-06-14T12:00:00.000Z",
      }),
    ).toEqual({
      ok: false,
      status: 429,
      safeMessage: "AI helper quota is exhausted until 2026-06-14T12:00:00.000Z.",
    });
  });

  test("rejects unsafe helper output before UI consumption", () => {
    expect(
      parseAiHelperResult({
        ...buildSafeAiHelperStubResult("readiness_summary", "edge-stub"),
        summary: "This applicant has strong visa odds.",
      }),
    ).toMatchObject({
      ok: false,
      status: 502,
    });
    expect(
      parseAiHelperResult({
        ...buildSafeAiHelperStubResult("readiness_summary", "edge-stub"),
        summary: "This package is officially verified by the helper.",
      }),
    ).toMatchObject({
      ok: false,
      status: 502,
    });
    expect(
      parseAiHelperResult(
        buildSafeAiHelperStubResult("readiness_summary", "edge-provider"),
      ),
    ).toMatchObject({
      ok: true,
      data: {
        source: "edge-provider",
      },
    });
  });

  test("fails closed when durable audit is not configured", async () => {
    const response = await handleAiHelperRequest(helperRequest());

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: "AI helper durable audit is not configured.",
    });
  });

  test("handles edge requests through durable audit, quota, and provider boundaries", async () => {
    const options = durableOptions();

    const success = await handleAiHelperRequest(
      helperRequest("admin_review", adminActor),
      options,
    );
    expect(success.status).toBe(200);
    expect(await json(success)).toMatchObject({
      intent: "admin_review",
      source: "edge-stub",
      guardrails: expect.arrayContaining([
        "Детерминированные проверки остаются источником истины.",
      ]),
    });
    expect(options.auditEvents).toEqual([
      {
        event: "ai_helper_invoked",
        intent: "admin_review",
        actorId: "admin-1",
        actorRole: "admin",
        requestId: "server-request-1",
        reason: "edge-stub",
        createdAt: "2026-06-14T12:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(options.auditEvents)).not.toContain("private@example.com");
    expect(JSON.stringify(options.auditEvents)).not.toContain(
      "raw applicant context must not be audited",
    );
    expect(options.auditEvents[0]?.requestId).not.toBe("client-reused-id");
  });

  test("does not trust client request ids for quota idempotency", async () => {
    let id = 0;
    const quotaRequests: AiHelperRequest[] = [];
    const options = durableOptions({
      requestIdFactory: () => `server-request-${++id}`,
      quotaStore: {
        consume: (request) => {
          quotaRequests.push(request);
          return Promise.resolve({ remaining: 4 });
        },
      },
    });

    await handleAiHelperRequest(
      helperRequest("text_intake_review", agentActor),
      options,
    );
    await handleAiHelperRequest(
      helperRequest("text_intake_review", agentActor),
      options,
    );

    expect(quotaRequests.map((request) => request.requestId)).toEqual([
      "server-request-1",
      "server-request-2",
    ]);
    expect(quotaRequests.map((request) => request.requestId)).not.toContain(
      "client-reused-id",
    );
  });

  test("audits denied and quota-exhausted requests without calling the provider", async () => {
    const provider = { generate: vi.fn() };
    const deniedOptions = durableOptions({ provider });
    const denied = await handleAiHelperRequest(
      helperRequest("admin_review", agentActor),
      deniedOptions,
    );
    expect(denied.status).toBe(403);
    expect(await json(denied)).toEqual({
      error: "Admin AI helper access is required.",
    });
    expect(deniedOptions.auditEvents.at(-1)).toMatchObject({
      event: "ai_helper_denied",
      intent: "admin_review",
      actorId: "agent-1",
      reason: "Admin AI helper access is required.",
    });
    expect(provider.generate).not.toHaveBeenCalled();

    const limitedOptions = durableOptions({
      provider,
      quotaStore: { consume: () => Promise.resolve({ remaining: 0 }) },
    });
    const limited = await handleAiHelperRequest(
      helperRequest("text_intake_review", agentActor),
      limitedOptions,
    );
    expect(limited.status).toBe(429);
    expect(await json(limited)).toEqual({
      error: "AI helper quota is exhausted.",
    });
    expect(limitedOptions.auditEvents.at(-1)).toMatchObject({
      event: "ai_helper_rate_limited",
      intent: "text_intake_review",
      actorId: "agent-1",
    });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  test("audits quota failures, provider failures, unsafe output, and audit failures", async () => {
    const quotaFailure = durableOptions({
      quotaStore: { consume: () => Promise.reject(new Error("db down")) },
    });
    const quotaResponse = await handleAiHelperRequest(helperRequest(), quotaFailure);
    expect(quotaResponse.status).toBe(503);
    expect(await json(quotaResponse)).toEqual({
      error: "AI helper quota check failed.",
    });
    expect(quotaFailure.auditEvents.at(-1)).toMatchObject({
      event: "ai_helper_quota_failed",
    });

    const providerFailure = durableOptions({
      provider: { generate: () => Promise.reject(new Error("provider down")) },
    });
    const providerResponse = await handleAiHelperRequest(
      helperRequest(),
      providerFailure,
    );
    expect(providerResponse.status).toBe(502);
    expect(await json(providerResponse)).toEqual({
      error: "AI helper provider failed.",
    });
    expect(providerFailure.auditEvents.at(-1)).toMatchObject({
      event: "ai_helper_provider_failed",
    });

    const unsafeOutput = durableOptions({
      provider: {
        generate: () =>
          Promise.resolve({
            ...buildSafeAiHelperStubResult("text_intake_review", "edge-stub"),
            summary: "This helper can estimate approval odds.",
          }),
      },
    });
    const unsafeResponse = await handleAiHelperRequest(helperRequest(), unsafeOutput);
    expect(unsafeResponse.status).toBe(502);
    expect(await json(unsafeResponse)).toEqual({
      error: "AI helper result failed safety validation.",
    });
    expect(unsafeOutput.auditEvents.at(-1)).toMatchObject({
      event: "ai_helper_output_rejected",
    });

    const auditFailure = durableOptions({
      auditStore: { record: () => Promise.reject(new Error("audit down")) },
    });
    const auditResponse = await handleAiHelperRequest(helperRequest(), auditFailure);
    expect(auditResponse.status).toBe(503);
    expect(await json(auditResponse)).toEqual({
      error: "AI helper audit failed.",
    });
  });

  test("builds Supabase REST dependencies that write audit rows and consume quota RPC", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const textUrl = String(url);
      if (textUrl.includes("/rpc/consume_ai_helper_quota")) {
        return Response.json({ remaining: 3, reset_at: "2026-06-14T13:00:00.000Z" });
      }
      return new Response(null, { status: 201 });
    });
    const dependencies = createSupabaseRestAiHelperDependencies(
      {
        SUPABASE_URL: "https://project.supabase.co/",
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        AI_HELPER_AUDIT_TABLE: "ai_helper_audit_events",
        AI_HELPER_QUOTA_RPC: "consume_ai_helper_quota",
      },
      fetchMock as typeof fetch,
    );

    const response = await handleAiHelperRequest(helperRequest(), {
      ...dependencies,
      requestIdFactory: () => "server-request-1",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://project.supabase.co/rest/v1/rpc/consume_ai_helper_quota",
    );
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://project.supabase.co/rest/v1/ai_helper_audit_events",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: expect.not.stringContaining("private@example.com"),
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: expect.stringContaining("server-request-1"),
    });
  });
});
