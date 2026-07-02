import {
  buildAiHelperProviderRequest,
  buildAiHelperAuditEvent,
  evaluateAiHelperAccess,
  evaluateAiHelperRateLimit,
  parseAiHelperRequest,
  parseAiHelperResult,
  withAiHelperRequestId,
  type AiHelperAuditEvent,
  type AiHelperAuditStore,
  type AiHelperActor,
  type AiHelperProvider,
  type AiHelperQuotaStore,
  type AiHelperRequest,
} from "./ai-helper-contract.ts";
import {
  createAiHelperLocalProvider,
  type AiHelperLocalProviderEnv,
} from "./ai-helper-local-provider.ts";

export const aiHelperCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export interface AiHelperHandlerOptions {
  auditStore?: AiHelperAuditStore;
  authorizer?: AiHelperAuthorizer;
  quotaStore?: AiHelperQuotaStore;
  provider?: AiHelperProvider;
  providerMaxInputChars?: number;
  now?: () => string;
  requestIdFactory?: () => string;
}

type AiHelperAuthorizationResult =
  | { ok: true; actor: AiHelperActor }
  | { ok: false; safeMessage: string; status: number };

export interface AiHelperAuthorizer {
  authorize(input: {
    bearerToken?: string;
    request: AiHelperRequest;
  }): Promise<AiHelperAuthorizationResult>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: aiHelperCorsHeaders,
  });
}

async function recordAudit(
  auditStore: AiHelperAuditStore | undefined,
  event: AiHelperAuditEvent,
): Promise<AiHelperContractResponse> {
  if (!auditStore) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "AI helper durable audit is not configured." },
        503,
      ),
    };
  }

  try {
    await auditStore.record(event);
    return { ok: true };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: "AI helper audit failed." }, 503),
    };
  }
}

type AiHelperContractResponse = { ok: true } | { ok: false; response: Response };

function bearerTokenFor(request: Request): string | undefined {
  const value = request.headers.get("authorization")?.trim();
  if (!value) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(value);

  return match?.[1]?.trim();
}

function providerFor(options: AiHelperHandlerOptions): AiHelperProvider {
  return (
    options.provider ?? {
      generate: () =>
        Promise.reject(new Error("AI helper provider is not configured.")),
    }
  );
}

export async function handleAiHelperRequest(
  request: Request,
  options: AiHelperHandlerOptions = {},
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: aiHelperCorsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST with an AI helper intent." }, 405);
  }

  const body = await request.json().catch(() => undefined);
  const parsed = parseAiHelperRequest(body);
  if (!parsed.ok) {
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_denied",
        parsed.safeMessage,
        undefined,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: parsed.safeMessage }, parsed.status);
  }

  if (!options.authorizer) {
    const reason = "AI helper authorization is not configured.";
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_denied",
        reason,
        { intent: parsed.data.intent },
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: reason }, 503);
  }

  let authorized: AiHelperAuthorizationResult;
  try {
    authorized = await options.authorizer.authorize({
      bearerToken: bearerTokenFor(request),
      request: parsed.data,
    });
  } catch {
    authorized = {
      ok: false,
      safeMessage: "AI helper authorization failed.",
      status: 503,
    };
  }
  if (!authorized.ok) {
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_denied",
        authorized.safeMessage,
        { intent: parsed.data.intent },
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: authorized.safeMessage }, authorized.status);
  }

  const helperRequest = withAiHelperRequestId(
    {
      ...parsed.data,
      actor: authorized.actor,
    },
    options.requestIdFactory?.(),
  );
  const access = evaluateAiHelperAccess(helperRequest);
  if (!access.ok) {
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_denied",
        access.safeMessage,
        helperRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: access.safeMessage }, access.status);
  }

  if (!options.quotaStore) {
    const reason = "AI helper quota store is not configured.";
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_denied",
        reason,
        helperRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: reason }, 503);
  }

  let quotaState;
  try {
    quotaState = await options.quotaStore.consume(helperRequest);
  } catch {
    const reason = "AI helper quota check failed.";
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_quota_failed",
        reason,
        helperRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: reason }, 503);
  }

  const rateLimit = evaluateAiHelperRateLimit(helperRequest, quotaState);
  if (!rateLimit.ok) {
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_rate_limited",
        rateLimit.safeMessage,
        helperRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: rateLimit.safeMessage }, rateLimit.status);
  }

  const attemptAudit = await recordAudit(
    options.auditStore,
    buildAiHelperAuditEvent(
      "ai_helper_invoked",
      "provider_attempt",
      helperRequest,
      options.now?.(),
    ),
  );
  if (!attemptAudit.ok) return attemptAudit.response;

  let result;
  try {
    result = await providerFor(options).generate(
      buildAiHelperProviderRequest(helperRequest, options.providerMaxInputChars),
    );
  } catch {
    const reason = "AI helper provider failed.";
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_provider_failed",
        reason,
        helperRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: reason }, 502);
  }

  const validated = parseAiHelperResult(result);
  if (!validated.ok) {
    const audit = await recordAudit(
      options.auditStore,
      buildAiHelperAuditEvent(
        "ai_helper_output_rejected",
        validated.safeMessage,
        helperRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: validated.safeMessage }, validated.status);
  }

  const audit = await recordAudit(
    options.auditStore,
    buildAiHelperAuditEvent(
      "ai_helper_invoked",
      validated.data.source,
      helperRequest,
      options.now?.(),
    ),
  );
  if (!audit.ok) return audit.response;
  return jsonResponse(validated.data);
}

interface SupabaseRestAiHelperEnv extends AiHelperLocalProviderEnv {
  SUPABASE_URL?: string;
  SUPABASE_FUNCTION_ADMIN_KEY?: string;
  AI_HELPER_AUDIT_TABLE?: string;
  AI_HELPER_QUOTA_RPC?: string;
}

interface SupabaseRpcQuotaRow {
  remaining?: unknown;
  reset_at?: unknown;
  resetAt?: unknown;
}

interface SupabaseAuthUserResponse {
  id?: unknown;
}

interface SupabaseProfileResponse {
  id?: unknown;
  role?: unknown;
}

function authHeaders(adminKey: string): Record<string, string> {
  return {
    apikey: adminKey,
    authorization: `Bearer ${adminKey}`,
    "content-type": "application/json",
  };
}

function parseQuotaRow(value: unknown): SupabaseRpcQuotaRow {
  const row = Array.isArray(value) ? value[0] : value;
  return typeof row === "object" && row !== null ? row : {};
}

function restEq(value: string): string {
  return encodeURIComponent(`eq.${value}`);
}

async function readFirstRestRow<T>(
  fetchFn: typeof fetch,
  url: string,
  adminKey: string,
): Promise<T | null> {
  const response = await fetchFn(url, {
    headers: authHeaders(adminKey),
    method: "GET",
  });
  if (!response.ok) {
    throw new Error("Supabase REST read failed.");
  }

  const rows = (await response.json()) as unknown;

  return Array.isArray(rows) && rows.length ? (rows[0] as T) : null;
}

async function authenticatedUserId(
  fetchFn: typeof fetch,
  supabaseUrl: string,
  adminKey: string,
  bearerToken: string | undefined,
): Promise<string | null> {
  if (!bearerToken) {
    return null;
  }

  const response = await fetchFn(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: adminKey,
      authorization: `Bearer ${bearerToken}`,
    },
    method: "GET",
  });
  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as SupabaseAuthUserResponse;

  return typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
}

function positiveIntegerFromEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function createSupabaseRestAiHelperDependencies(
  env: SupabaseRestAiHelperEnv,
  fetchFn: typeof fetch = fetch,
): AiHelperHandlerOptions {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
  const adminKey = env.SUPABASE_FUNCTION_ADMIN_KEY;
  if (!supabaseUrl || !adminKey) return {};

  const auditTable = env.AI_HELPER_AUDIT_TABLE ?? "ai_helper_audit_events";
  const quotaRpc = env.AI_HELPER_QUOTA_RPC;

  return {
    auditStore: {
      async record(event) {
        const response = await fetchFn(`${supabaseUrl}/rest/v1/${auditTable}`, {
          method: "POST",
          headers: {
            ...authHeaders(adminKey),
            prefer: "return=minimal",
          },
          body: JSON.stringify({
            event: event.event,
            intent: event.intent,
            actor_id: event.actorId,
            actor_role: event.actorRole,
            request_id: event.requestId,
            reason: event.reason,
            created_at: event.createdAt,
          }),
        });
        if (!response.ok) {
          throw new Error("AI helper audit insert failed.");
        }
      },
    },
    authorizer: {
      async authorize({ bearerToken }) {
        const userId = await authenticatedUserId(
          fetchFn,
          supabaseUrl,
          adminKey,
          bearerToken,
        );
        if (!userId) {
          return {
            ok: false,
            safeMessage: "AI helper authentication is required.",
            status: 401,
          };
        }

        const profile = await readFirstRestRow<SupabaseProfileResponse>(
          fetchFn,
          `${supabaseUrl}/rest/v1/profiles?select=id,role&id=${restEq(userId)}&limit=1`,
          adminKey,
        );
        if (profile?.id !== userId) {
          return {
            ok: false,
            safeMessage: "AI helper profile is required.",
            status: 403,
          };
        }

        return {
          ok: true,
          actor: {
            id: userId,
            role: profile.role === "admin" ? "admin" : "agent",
            canUseAI: true,
          },
        };
      },
    },
    providerMaxInputChars: positiveIntegerFromEnv(
      env.AI_HELPER_LITELLM_MAX_INPUT_CHARS,
    ),
    quotaStore: quotaRpc
      ? {
          async consume(helperRequest) {
            const response = await fetchFn(`${supabaseUrl}/rest/v1/rpc/${quotaRpc}`, {
              method: "POST",
              headers: authHeaders(adminKey),
              body: JSON.stringify({
                p_actor_id: helperRequest.actor.id,
                p_actor_role: helperRequest.actor.role,
                p_intent: helperRequest.intent,
                p_request_id: helperRequest.requestId,
              }),
            });
            if (!response.ok) {
              throw new Error("AI helper quota RPC failed.");
            }

            const row = parseQuotaRow(await response.json().catch(() => undefined));
            const remaining =
              typeof row.remaining === "number" && Number.isFinite(row.remaining)
                ? row.remaining
                : 0;
            const resetAt =
              typeof row.resetAt === "string"
                ? row.resetAt
                : typeof row.reset_at === "string"
                  ? row.reset_at
                  : undefined;

            return { remaining, resetAt };
          },
        }
      : undefined,
    provider: createAiHelperLocalProvider(env, fetchFn),
  };
}
