// tests/unit/aiHelperContract.spec.ts
import { describe, expect, test, vi } from "vitest";
import {
  buildAiHelperProviderRequest,
  buildSafeAiHelperStubResult,
  type AiHelperRequest,
  evaluateAiHelperAccess,
  evaluateAiHelperRateLimit,
  parseAiHelperRequest,
  parseAiHelperResult,
  type AiHelperAuditEvent,
  type AiHelperActor,
  type AiHelperProviderRequest,
} from "../../supabase/functions/_shared/ai-helper-contract";
import {
  createSupabaseRestAiHelperDependencies,
  handleAiHelperRequest,
  type AiHelperHandlerOptions,
} from "../../supabase/functions/_shared/ai-helper-handler";
import { createAiHelperLocalProvider } from "../../supabase/functions/_shared/ai-helper-local-provider";

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
  bearerToken?: string,
): Request {
  return new Request("https://edge.local/ai-helper", {
    method: "POST",
    headers: bearerToken ? { authorization: `Bearer ${bearerToken}` } : undefined,
    body: JSON.stringify({
      intent,
      context: {
        submissionId: "VF-1",
        status: "draft",
        fields: 70,
        applicantEmail: "private@example.com",
        applicantPhone: "+79990000000",
        passportNumber: "72 1190482",
        storagePath: "submission-media/private/passport.png",
        freeText: "raw applicant context must not be audited",
        applicants: [
          {
            name: "Private Applicant",
            role: "Applicant",
            email: "applicant@example.com",
            passport: "72 1190482",
            fields: 70,
            media: 2,
            mediaRequired: 4,
            findings: [
              {
                code: "invalid_email",
                text: "Raw finding text must not reach provider",
                status: "open",
              },
            ],
          },
        ],
        issues: [
          {
            code: "missing_media",
            severity: "blocking",
            text: "Upload private passport scan",
          },
        ],
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
    authorizer: {
      authorize: ({ request }) =>
        Promise.resolve({
          ok: true,
          actor: request.actor,
        }),
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
    expect(
      parseAiHelperRequest({ intent: "agent_next_action", actor: agentActor }),
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
    expect(
      parseAiHelperRequest({ intent: "issue_draft_assistant", actor: agentActor }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  test("keeps Task 7 admin AI intents admin-only", () => {
    for (const intent of [
      "admin_review",
      "admin_next_action",
      "admin_issue_remark_draft",
      "admin_readiness_explanation",
    ] as const) {
      expect(
        evaluateAiHelperAccess({
          intent,
          context: {},
          actor: adminActor,
        }),
      ).toMatchObject({ ok: true });
      expect(
        evaluateAiHelperAccess({
          intent,
          context: {},
          actor: agentActor,
        }),
      ).toMatchObject({ ok: false, status: 403 });
    }
  });

  test("builds a sanitized provider request without raw context or actor identity", () => {
    const parsed = parseAiHelperRequest({
      intent: "text_intake_review",
      actor: agentActor,
      requestId: "client-request-1",
      context: {
        submissionId: "VF-PII",
        status: "draft",
        fields: 65,
        applicantEmail: "private@example.com",
        phone: "+79990000000",
        passport: "72 1190482",
        address: "Moscow Test Street 1",
        freeText: "raw questionnaire paragraph",
        storagePath: "submission-media/private/passport.png",
        applicants: [
          {
            name: "Artem Sokolov",
            role: "main",
            email: "artem@example.com",
            passport: "72 1190482",
            fields: 65,
            media: 1,
            mediaRequired: 4,
            findings: [{ code: "invalid_email", text: "Private finding text" }],
          },
        ],
        issues: [
          {
            code: "missing_media",
            severity: "blocking",
            text: "Upload passport scan",
          },
        ],
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const providerRequest = buildAiHelperProviderRequest(parsed.data);
    const serialized = JSON.stringify(providerRequest);

    expect(providerRequest).toMatchObject({
      intent: "text_intake_review",
      actorRole: "agent",
      context: {
        redaction: "raw_context_removed",
        facts: {
          status: "draft",
          fields: 65,
        },
        issueCodes: expect.arrayContaining(["invalid_email", "missing_media"]),
        readinessStates: expect.arrayContaining(["status:draft", "severity:blocking"]),
        applicants: [
          expect.objectContaining({
            label: "applicant_1",
            role: "main",
            fieldCompletion: 65,
            mediaUploaded: 1,
            mediaRequired: 4,
          }),
        ],
      },
    });
    expect(serialized).not.toContain("agent-1");
    expect(serialized).not.toContain("client-request-1");
    expect(serialized).not.toContain("VF-PII");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("+79990000000");
    expect(serialized).not.toContain("72 1190482");
    expect(serialized).not.toContain("Moscow Test Street");
    expect(serialized).not.toContain("raw questionnaire paragraph");
    expect(serialized).not.toContain("submission-media");
    expect(serialized).not.toContain("Upload passport scan");
  });

  test("drops non-allowlisted provider signals that could smuggle PII tokens", () => {
    const parsed = parseAiHelperRequest({
      intent: "text_intake_review",
      actor: agentActor,
      context: {
        status: "Sokolov",
        state: "Petrov",
        severity: "Ivanov",
        code: "Smirnov",
        issueCode: "Kozlov",
        type: "family",
        countryCode: "ES",
        priority: 721190482,
        fields: 88,
        mediaAccepted: 721190482,
        canExport: false,
        applicants: [
          {
            role: "Volkova",
            status: "Mikhailova",
            fields: 88,
            findings: [
              {
                code: "Fedorov",
                issueCode: "Morozov",
                severity: "Semenov",
              },
            ],
          },
        ],
        issues: [
          {
            code: "Pavlov",
            issueCode: "Egorov",
            severity: "Nikolaev",
            status: "Vasilev",
          },
        ],
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const providerRequest = buildAiHelperProviderRequest(parsed.data);
    const serialized = JSON.stringify(providerRequest);

    expect(providerRequest.context).toMatchObject({
      facts: {
        type: "family",
        countryCode: "ES",
        fields: 88,
        canExport: false,
      },
      issueCodes: [],
      readinessStates: [],
      applicants: [
        expect.objectContaining({
          label: "applicant_1",
          fieldCompletion: 88,
          issueCodes: [],
        }),
      ],
    });
    expect(providerRequest.context.applicants[0]).not.toHaveProperty("role");
    expect(providerRequest.context.applicants[0]).not.toHaveProperty("readinessState");
    for (const unsafeToken of [
      "Sokolov",
      "Petrov",
      "Ivanov",
      "Smirnov",
      "Kozlov",
      "Volkova",
      "Mikhailova",
      "Fedorov",
      "Morozov",
      "Semenov",
      "Pavlov",
      "Egorov",
      "Nikolaev",
      "Vasilev",
      "721190482",
    ]) {
      expect(serialized).not.toContain(unsafeToken);
    }
    expect(providerRequest.context.facts).not.toHaveProperty("priority");
    expect(providerRequest.context.facts).not.toHaveProperty("mediaAccepted");
  });

  test("keeps only known provider enum signals and issue codes", () => {
    const parsed = parseAiHelperRequest({
      intent: "text_intake_review",
      actor: agentActor,
      context: {
        type: "single",
        status: "ready_for_export",
        state: "ready",
        severity: "blocking",
        code: "invalid_email",
        issueCode: "missing_media",
        country: "Испания",
        countryCode: "ES",
        submissionCity: "Москва",
        fields: 92,
        applicants: [
          {
            role: "spouse",
            status: "complete",
            fields: 92,
            findings: [{ code: "weak_phone", severity: "warning" }],
          },
        ],
        issues: [
          {
            code: "blocking_issue_open",
            severity: "blocker",
            status: "open",
          },
        ],
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const providerRequest = buildAiHelperProviderRequest(parsed.data);

    expect(providerRequest.context).toMatchObject({
      facts: {
        type: "single",
        status: "ready_for_export",
        country: "Испания",
        countryCode: "ES",
        submissionCity: "Москва",
        fields: 92,
      },
      issueCodes: expect.arrayContaining([
        "invalid_email",
        "missing_media",
        "weak_phone",
        "blocking_issue_open",
      ]),
      readinessStates: expect.arrayContaining([
        "status:ready_for_export",
        "state:ready",
        "severity:blocking",
        "status:open",
        "severity:blocker",
      ]),
      applicants: [
        expect.objectContaining({
          label: "applicant_1",
          role: "spouse",
          readinessState: "status:complete",
          issueCodes: ["weak_phone"],
        }),
      ],
    });
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
    expect(
      parseAiHelperResult({
        ...buildSafeAiHelperStubResult("text_intake_review", "edge-provider"),
        textReview: { status: "clear" },
      }),
    ).toMatchObject({
      ok: false,
      status: 502,
      safeMessage: "AI helper result is invalid.",
    });
  });

  test("validates Task 7 structured admin output fields", () => {
    expect(
      parseAiHelperResult({
        ...buildSafeAiHelperStubResult("admin_next_action", "edge-provider"),
        nextAction: "Проверьте открытые замечания и выберите действие вручную.",
      }),
    ).toMatchObject({
      ok: true,
      data: {
        intent: "admin_next_action",
        nextAction: "Проверьте открытые замечания и выберите действие вручную.",
      },
    });
    expect(
      parseAiHelperResult({
        ...buildSafeAiHelperStubResult("admin_issue_remark_draft", "edge-provider"),
        issueRemarkDraft:
          "Уточните данные и отправьте исправление на повторную проверку.",
      }),
    ).toMatchObject({
      ok: true,
      data: {
        issueRemarkDraft:
          "Уточните данные и отправьте исправление на повторную проверку.",
      },
    });
    expect(
      parseAiHelperResult({
        ...buildSafeAiHelperStubResult("admin_readiness_explanation", "edge-provider"),
        readinessExplanation:
          "Пакет не готов: есть открытые замечания и недостающие данные.",
      }),
    ).toMatchObject({
      ok: true,
      data: {
        readinessExplanation:
          "Пакет не готов: есть открытые замечания и недостающие данные.",
      },
    });
    expect(
      parseAiHelperResult({
        ...buildSafeAiHelperStubResult("admin_review", "edge-provider"),
        adminReviewChecklist: ["Сверьте анкету, файлы и открытые замечания."],
      }),
    ).toMatchObject({
      ok: true,
      data: {
        adminReviewChecklist: ["Сверьте анкету, файлы и открытые замечания."],
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
        reason: "provider_attempt",
        createdAt: "2026-06-14T12:00:00.000Z",
      },
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

  test("fails closed without an explicit provider after audit and quota gates", async () => {
    const options = durableOptions({ provider: undefined });

    const response = await handleAiHelperRequest(
      helperRequest("text_intake_review", agentActor),
      options,
    );

    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({
      error: "AI helper provider failed.",
    });
    expect(options.auditEvents).toEqual([
      expect.objectContaining({
        event: "ai_helper_invoked",
        reason: "provider_attempt",
      }),
      expect.objectContaining({
        event: "ai_helper_provider_failed",
        reason: "AI helper provider failed.",
      }),
    ]);
  });

  test("fails closed without server-side authorization before quota or provider execution", async () => {
    const provider = { generate: vi.fn() };
    const quotaStore = { consume: vi.fn(() => Promise.resolve({ remaining: 4 })) };
    const options = durableOptions({
      authorizer: undefined,
      provider,
      quotaStore,
    });

    const response = await handleAiHelperRequest(
      helperRequest("text_intake_review", agentActor),
      options,
    );

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: "AI helper authorization is not configured.",
    });
    expect(options.auditEvents).toEqual([
      expect.objectContaining({
        actorId: undefined,
        event: "ai_helper_denied",
        intent: "text_intake_review",
        reason: "AI helper authorization is not configured.",
      }),
    ]);
    expect(quotaStore.consume).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  test("uses the server-authorized actor instead of forged request actor", async () => {
    const provider = { generate: vi.fn() };
    const quotaStore = { consume: vi.fn(() => Promise.resolve({ remaining: 4 })) };
    const options = durableOptions({
      authorizer: {
        authorize: () =>
          Promise.resolve({
            ok: true,
            actor: { ...agentActor, id: "agent-real" },
          }),
      },
      provider,
      quotaStore,
    });

    const response = await handleAiHelperRequest(
      helperRequest("admin_review", adminActor),
      options,
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      error: "Admin AI helper access is required.",
    });
    expect(options.auditEvents.at(-1)).toMatchObject({
      actorId: "agent-real",
      actorRole: "agent",
      event: "ai_helper_denied",
      intent: "admin_review",
    });
    expect(quotaStore.consume).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  test("passes only sanitized provider input after audit and quota gates", async () => {
    const providerRequests: AiHelperProviderRequest[] = [];
    const auditEventsBeforeProvider: AiHelperAuditEvent[][] = [];
    const options = durableOptions({
      provider: {
        generate: (request) => {
          auditEventsBeforeProvider.push([...options.auditEvents]);
          providerRequests.push(request);

          return Promise.resolve(
            buildSafeAiHelperStubResult(request.intent, "edge-stub"),
          );
        },
      },
    });

    const response = await handleAiHelperRequest(
      helperRequest("text_intake_review", agentActor),
      options,
    );
    const serialized = JSON.stringify(providerRequests);

    expect(response.status).toBe(200);
    expect(providerRequests).toHaveLength(1);
    expect(auditEventsBeforeProvider[0]).toEqual([
      expect.objectContaining({
        event: "ai_helper_invoked",
        reason: "provider_attempt",
      }),
    ]);
    expect(providerRequests[0]).toMatchObject({
      intent: "text_intake_review",
      actorRole: "agent",
      context: {
        redaction: "raw_context_removed",
        facts: {
          status: "draft",
          fields: 70,
        },
        issueCodes: expect.arrayContaining(["invalid_email", "missing_media"]),
      },
    });
    expect(serialized).not.toContain("agent-1");
    expect(serialized).not.toContain("client-reused-id");
    expect(serialized).not.toContain("VF-1");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("+79990000000");
    expect(serialized).not.toContain("72 1190482");
    expect(serialized).not.toContain("submission-media");
    expect(serialized).not.toContain("raw applicant context must not be audited");
    expect(serialized).not.toContain("Raw finding text must not reach provider");
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
      if (textUrl.endsWith("/auth/v1/user")) {
        return Response.json({ id: "agent-real" });
      }
      if (textUrl.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-real", role: "agent" }]);
      }
      if (textUrl.includes("/rpc/consume_ai_helper_quota")) {
        return Response.json({
          remaining: 3,
          reset_at: "2026-06-14T13:00:00.000Z",
        });
      }
      if (textUrl.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });
    const dependencies = createSupabaseRestAiHelperDependencies(
      {
        SUPABASE_URL: "https://project.supabase.co/",
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        AI_HELPER_AUDIT_TABLE: "ai_helper_audit_events",
        AI_HELPER_QUOTA_RPC: "consume_ai_helper_quota",
        AI_HELPER_RUNTIME_ENV: "local",
        AI_HELPER_PROVIDER_MODE: "stub",
        AI_HELPER_ALLOW_STUB_PROVIDER: "true",
      },
      fetchMock as typeof fetch,
    );

    const response = await handleAiHelperRequest(
      helperRequest(undefined, adminActor, "user-token"),
      {
        ...dependencies,
        requestIdFactory: () => "server-request-1",
      },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://project.supabase.co/auth/v1/user",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer user-token",
      }),
    });
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://project.supabase.co/rest/v1/profiles?select=id,role&id=eq.agent-real&limit=1",
    );
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      "https://project.supabase.co/rest/v1/rpc/consume_ai_helper_quota",
    );
    expect(String(fetchMock.mock.calls[3][0])).toBe(
      "https://project.supabase.co/rest/v1/ai_helper_audit_events",
    );
    expect(String(fetchMock.mock.calls[4][0])).toBe(
      "https://project.supabase.co/rest/v1/ai_helper_audit_events",
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      body: expect.stringContaining("server-request-1"),
    });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      body: expect.stringContaining("agent-real"),
    });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      body: expect.stringContaining('"p_actor_role":"agent"'),
    });
    expect(fetchMock.mock.calls[3][1]).toMatchObject({
      method: "POST",
      body: expect.not.stringContaining("private@example.com"),
    });
    expect(fetchMock.mock.calls[3][1]).toMatchObject({
      body: expect.stringContaining("provider_attempt"),
    });
  });

  test("allows local/demo edge stubs but fails closed in production without provider config", async () => {
    const localFetchMock = vi.fn<typeof fetch>(async (url) => {
      const textUrl = String(url);

      if (textUrl.endsWith("/auth/v1/user")) {
        return Response.json({ id: "agent-1" });
      }

      if (textUrl.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }

      if (textUrl.includes("/rpc/consume_ai_helper_quota")) {
        return Response.json({ remaining: 3 });
      }

      if (textUrl.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }

      return new Response(null, { status: 404 });
    });
    const localDependencies = createSupabaseRestAiHelperDependencies(
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        AI_HELPER_QUOTA_RPC: "consume_ai_helper_quota",
        AI_HELPER_RUNTIME_ENV: "demo",
        AI_HELPER_PROVIDER_MODE: "local_litellm",
        AI_HELPER_ALLOW_STUB_PROVIDER: "true",
      },
      localFetchMock as typeof fetch,
    );

    const localResponse = await handleAiHelperRequest(
      helperRequest(undefined, agentActor, "user-token"),
      {
        ...localDependencies,
        requestIdFactory: () => "server-request-1",
      },
    );

    expect(localResponse.status).toBe(200);
    expect(await json(localResponse)).toMatchObject({ source: "edge-stub" });
    expect(localFetchMock).toHaveBeenCalledTimes(5);

    const productionFetchMock = vi.fn<typeof fetch>(async (url) => {
      const textUrl = String(url);

      if (textUrl.endsWith("/auth/v1/user")) {
        return Response.json({ id: "agent-1" });
      }

      if (textUrl.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }

      if (textUrl.includes("/rpc/consume_ai_helper_quota")) {
        return Response.json({ remaining: 3 });
      }

      if (textUrl.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }

      return new Response(null, { status: 404 });
    });
    const productionDependencies = createSupabaseRestAiHelperDependencies(
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        AI_HELPER_QUOTA_RPC: "consume_ai_helper_quota",
        AI_HELPER_RUNTIME_ENV: "production",
        AI_HELPER_PROVIDER_MODE: "local_litellm",
      },
      productionFetchMock as typeof fetch,
    );

    const productionResponse = await handleAiHelperRequest(
      helperRequest(undefined, agentActor, "user-token"),
      {
        ...productionDependencies,
        requestIdFactory: () => "server-request-1",
      },
    );

    expect(productionResponse.status).toBe(502);
    expect(await json(productionResponse)).toEqual({
      error: "AI helper provider failed.",
    });
    expect(productionFetchMock).toHaveBeenCalledTimes(5);
    expect(productionFetchMock.mock.calls[4][1]).toMatchObject({
      body: expect.stringContaining("ai_helper_provider_failed"),
    });
  });

  test("fails closed when AI provider mode or runtime env is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const textUrl = String(url);

      if (textUrl.endsWith("/auth/v1/user")) {
        return Response.json({ id: "agent-1" });
      }

      if (textUrl.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }

      if (textUrl.includes("/rpc/consume_ai_helper_quota")) {
        return Response.json({ remaining: 3 });
      }

      if (textUrl.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }

      return new Response(null, { status: 404 });
    });
    const dependencies = createSupabaseRestAiHelperDependencies(
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        AI_HELPER_QUOTA_RPC: "consume_ai_helper_quota",
        AI_HELPER_ALLOW_STUB_PROVIDER: "true",
      },
      fetchMock as typeof fetch,
    );

    const response = await handleAiHelperRequest(
      helperRequest(undefined, agentActor, "user-token"),
      {
        ...dependencies,
        requestIdFactory: () => "server-request-1",
      },
    );

    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({
      error: "AI helper provider failed.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4][1]).toMatchObject({
      body: expect.stringContaining("ai_helper_provider_failed"),
    });
  });

  test("calls LiteLLM with sanitized context and server-only provider config", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const textUrl = String(url);

      if (textUrl.endsWith("/auth/v1/user")) {
        return Response.json({ id: "agent-1" });
      }

      if (textUrl.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }

      if (textUrl.includes("/rpc/consume_ai_helper_quota")) {
        return Response.json({ remaining: 3 });
      }

      if (textUrl.includes("/v1/chat/completions")) {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Local helper draft",
                  summary: "Review deterministic blockers before continuing.",
                  suggestions: ["Check missing media in the application."],
                  blockers: [],
                  guardrails: ["Human operator reviews the draft."],
                  operatorSummary: ["Draft generated from sanitized facts."],
                  agentFollowUpDrafts: [],
                }),
              },
            },
          ],
        });
      }

      if (textUrl.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }

      return new Response(null, { status: 404 });
    });
    const dependencies = createSupabaseRestAiHelperDependencies(
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        AI_HELPER_QUOTA_RPC: "consume_ai_helper_quota",
        AI_HELPER_RUNTIME_ENV: "local",
        AI_HELPER_PROVIDER_MODE: "local_litellm",
        AI_HELPER_LITELLM_BASE_URL: "http://127.0.0.1:4000/",
        AI_HELPER_LITELLM_API_KEY: "local-token",
        AI_HELPER_LITELLM_MODEL_GENERAL: "qwen2.5:7b",
        AI_HELPER_LITELLM_MAX_INPUT_CHARS: "900",
      },
      fetchMock as typeof fetch,
    );

    const response = await handleAiHelperRequest(
      helperRequest(undefined, agentActor, "user-token"),
      {
        ...dependencies,
        requestIdFactory: () => "server-request-1",
      },
    );
    const providerCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/v1/chat/completions"),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      intent: "text_intake_review",
      source: "edge-provider",
      title: "Local helper draft",
    });
    expect(providerCall).toBeDefined();
    if (!providerCall) return;

    expect(String(providerCall[0])).toBe("http://127.0.0.1:4000/v1/chat/completions");
    expect(providerCall[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer local-token",
      }),
    });

    const body = JSON.parse(String(providerCall[1]?.body)) as Record<string, unknown>;
    const serializedBody = JSON.stringify(body);

    expect(body).toMatchObject({
      model: "qwen2.5:7b",
      temperature: 0,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });
    expect(serializedBody).toContain("sanitizedContext");
    expect(serializedBody).not.toContain("private@example.com");
    expect(serializedBody).not.toContain("+79990000000");
    expect(serializedBody).not.toContain("72 1190482");
    expect(serializedBody).not.toContain("submission-media");
    expect(serializedBody).not.toContain("raw applicant context must not be audited");
  });

  test("uses a small free-tier token budget and correction-specific prompt", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Вступление",
                summary:
                  "Здравствуйте! Пожалуйста, исправьте перечисленные ниже пункты.",
                suggestions: [],
                blockers: [],
                guardrails: ["Оператор проверяет текст вручную."],
                operatorSummary: [],
                agentFollowUpDrafts: [],
                issueRemarkDraft:
                  "Здравствуйте! Пожалуйста, исправьте перечисленные ниже пункты.",
              }),
            },
          },
        ],
      }),
    );
    const provider = createAiHelperLocalProvider(
      {
        AI_HELPER_RUNTIME_ENV: "local",
        AI_HELPER_PROVIDER_MODE: "local_litellm",
        AI_HELPER_LITELLM_BASE_URL: "http://127.0.0.1:4000",
        AI_HELPER_LITELLM_MODEL_GENERAL: "qwen2.5:7b",
        AI_HELPER_LITELLM_MAX_OUTPUT_TOKENS: "700",
      },
      fetchMock as typeof fetch,
    );

    await provider.generate({
      intent: "correction_draft",
      actorRole: "admin",
      context: {
        facts: {},
        counts: { openIssueCount: 2 },
        issueCodes: ["blocking_issue_open"],
        readinessStates: ["returned"],
        applicants: [],
        redaction: "raw_context_removed",
        truncated: false,
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    const messages = body.messages as Array<{ content: string; role: string }>;

    expect(body.max_tokens).toBe(220);
    expect(messages[0]?.content).toContain("one or two neutral opening sentences");
    expect(messages[0]?.content).toContain("Do not include names");
    expect(JSON.stringify(body)).not.toContain("private@example.com");
  });

  test("rejects malformed LiteLLM output instead of normalizing it into success", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const textUrl = String(url);

      if (textUrl.endsWith("/auth/v1/user")) {
        return Response.json({ id: "agent-1" });
      }

      if (textUrl.includes("/rest/v1/profiles")) {
        return Response.json([{ id: "agent-1", role: "agent" }]);
      }

      if (textUrl.includes("/rpc/consume_ai_helper_quota")) {
        return Response.json({ remaining: 3 });
      }

      if (textUrl.includes("/v1/chat/completions")) {
        return Response.json({
          choices: [
            {
              message: {
                content: "{}",
              },
            },
          ],
        });
      }

      if (textUrl.includes("/rest/v1/ai_helper_audit_events")) {
        return new Response(null, { status: 201 });
      }

      return new Response(null, { status: 404 });
    });
    const dependencies = createSupabaseRestAiHelperDependencies(
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_FUNCTION_ADMIN_KEY: "server-only",
        AI_HELPER_QUOTA_RPC: "consume_ai_helper_quota",
        AI_HELPER_RUNTIME_ENV: "local",
        AI_HELPER_PROVIDER_MODE: "local_litellm",
        AI_HELPER_LITELLM_BASE_URL: "http://127.0.0.1:4000",
        AI_HELPER_LITELLM_MODEL_GENERAL: "qwen2.5:7b",
      },
      fetchMock as typeof fetch,
    );

    const response = await handleAiHelperRequest(
      helperRequest(undefined, agentActor, "user-token"),
      {
        ...dependencies,
        requestIdFactory: () => "server-request-1",
      },
    );

    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({
      error: "AI helper provider failed.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[5][1]).toMatchObject({
      body: expect.stringContaining("ai_helper_provider_failed"),
    });
  });
});
