import {
  evaluatePassportExtractionAccess,
  parsePassportExtractionRequest,
  parsePassportExtractionResult,
  parsePassportDocumentPath,
  passportExtractionAuditEvent,
  safeUnavailablePassportExtractionResult,
  type PassportExtractionActor,
  type PassportExtractionAuditEvent,
  type PassportExtractionAuditStore,
  type PassportExtractionClientRequest,
  type PassportExtractionContractResult,
  type PassportExtractionProvider,
  type PassportExtractionRequest,
} from "./passport-extraction-contract.ts";

export const passportExtractionCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*",
};

export interface PassportExtractionHandlerOptions {
  auditStore?: PassportExtractionAuditStore;
  authorizer?: PassportExtractionAuthorizer;
  now?: () => string;
  provider?: PassportExtractionProvider;
  requestIdFactory?: () => string;
}

type HandlerAuditResult = { ok: true } | { ok: false; response: Response };
type PassportExtractionAuthorizationResult =
  | { ok: true; actor: PassportExtractionActor }
  | { ok: false; safeMessage: string; status: number };

export interface PassportExtractionAuthorizer {
  authorize(input: {
    bearerToken?: string;
    request: PassportExtractionClientRequest;
  }): Promise<PassportExtractionAuthorizationResult>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    headers: passportExtractionCorsHeaders,
    status,
  });
}

async function recordAudit(
  auditStore: PassportExtractionAuditStore | undefined,
  event: PassportExtractionAuditEvent,
): Promise<HandlerAuditResult> {
  if (!auditStore) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Passport extraction durable audit is not configured." },
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
      response: jsonResponse({ error: "Passport extraction audit failed." }, 503),
    };
  }
}

function withRequestId(
  request: PassportExtractionClientRequest,
  actor: PassportExtractionActor,
  requestId: string = crypto.randomUUID(),
): PassportExtractionRequest {
  return {
    ...request,
    actor,
    requestId,
  };
}

function bearerTokenFor(request: Request): string | undefined {
  const value = request.headers.get("authorization")?.trim();
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim();
}

function resultOrResponse<T>(
  parsed: PassportExtractionContractResult<T>,
): { ok: true; data: T } | { ok: false; response: Response } {
  if (parsed.ok) return parsed;
  return {
    ok: false,
    response: jsonResponse({ error: parsed.safeMessage }, parsed.status),
  };
}

function passportExtractionResultMetadata(
  request: PassportExtractionRequest,
  result: { source: string; status: string },
) {
  return {
    document_fingerprint: passportDocumentFingerprint(request),
    provider: result.source,
    result_status: result.status,
  };
}

export async function handlePassportExtractionRequest(
  request: Request,
  options: PassportExtractionHandlerOptions = {},
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: passportExtractionCorsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST with a passport document reference." }, 405);
  }

  const parsed = parsePassportExtractionRequest(
    await request.json().catch(() => undefined),
  );
  const requestResult = resultOrResponse(parsed);
  if (!requestResult.ok) {
    const audit = await recordAudit(
      options.auditStore,
      passportExtractionAuditEvent(
        "passport_extraction_denied",
        "request_invalid",
        undefined,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return requestResult.response;
  }

  if (!options.authorizer) {
    const audit = await recordAudit(
      options.auditStore,
      passportExtractionAuditEvent(
        "passport_extraction_denied",
        "authorization_not_configured",
        undefined,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse(
      { error: "Passport extraction authorization is not configured." },
      503,
    );
  }

  const authorized = await options.authorizer.authorize({
    bearerToken: bearerTokenFor(request),
    request: requestResult.data,
  });
  if (!authorized.ok) {
    const audit = await recordAudit(
      options.auditStore,
      passportExtractionAuditEvent(
        "passport_extraction_denied",
        authorized.safeMessage,
        undefined,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: authorized.safeMessage }, authorized.status);
  }

  const extractionRequest = withRequestId(
    requestResult.data,
    authorized.actor,
    options.requestIdFactory?.(),
  );

  const access = evaluatePassportExtractionAccess(extractionRequest);
  if (!access.ok) {
    const audit = await recordAudit(
      options.auditStore,
      passportExtractionAuditEvent(
        "passport_extraction_denied",
        access.safeMessage,
        extractionRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: access.safeMessage }, access.status);
  }

  if (!options.provider) {
    const unavailable = safeUnavailablePassportExtractionResult(
      extractionRequest.applicantIndex,
    );
    const audit = await recordAudit(
      options.auditStore,
      passportExtractionAuditEvent(
        "passport_extraction_invoked",
        unavailable.source,
        extractionRequest,
        options.now?.(),
        passportExtractionResultMetadata(extractionRequest, unavailable),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse(unavailable);
  }

  let providerResult: unknown;
  try {
    providerResult = await options.provider.extract(extractionRequest);
  } catch {
    const audit = await recordAudit(
      options.auditStore,
      passportExtractionAuditEvent(
        "passport_extraction_provider_failed",
        "provider_failed",
        extractionRequest,
        options.now?.(),
        {
          document_fingerprint: passportDocumentFingerprint(extractionRequest),
          failure_kind: "provider_failed",
        },
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: "Passport extraction provider failed." }, 502);
  }

  const validated = parsePassportExtractionResult(providerResult);
  if (!validated.ok) {
    const audit = await recordAudit(
      options.auditStore,
      passportExtractionAuditEvent(
        "passport_extraction_output_rejected",
        validated.safeMessage,
        extractionRequest,
        options.now?.(),
      ),
    );
    if (!audit.ok) return audit.response;
    return jsonResponse({ error: validated.safeMessage }, validated.status);
  }

  const audit = await recordAudit(
    options.auditStore,
    passportExtractionAuditEvent(
      "passport_extraction_invoked",
      validated.data.source,
      extractionRequest,
      options.now?.(),
      passportExtractionResultMetadata(extractionRequest, validated.data),
    ),
  );
  if (!audit.ok) return audit.response;
  return jsonResponse(validated.data);
}

interface SupabaseRestPassportExtractionEnv {
  PASSPORT_EXTRACTION_AUDIT_TABLE?: string;
  SUPABASE_FUNCTION_ADMIN_KEY?: string;
  SUPABASE_URL?: string;
}

interface SupabaseAuthUserResponse {
  id?: unknown;
}

interface AuthenticatedUser {
  id: string;
}

interface SupabaseMediaAssetResponse {
  applicant_id?: unknown;
  storage_bucket?: unknown;
  storage_path?: unknown;
  submission_id?: unknown;
  type?: unknown;
}

interface SupabaseProfileResponse {
  id?: unknown;
  role?: unknown;
}

interface SupabaseSubmissionResponse {
  agent_id?: unknown;
}

function authHeaders(adminKey: string): Record<string, string> {
  return {
    apikey: adminKey,
    authorization: `Bearer ${adminKey}`,
    "content-type": "application/json",
  };
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
  if (!response.ok) throw new Error("Supabase REST read failed.");

  const rows = (await response.json()) as unknown;
  return Array.isArray(rows) && rows.length ? (rows[0] as T) : null;
}

function opaqueFingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function passportDocumentFingerprint(request: PassportExtractionRequest) {
  return `passport-document:${opaqueFingerprint([
    request.document.bucket,
    request.document.path,
    request.document.mimeType,
    request.document.sizeBytes,
  ].join("|"))}`;
}

async function authenticatedUser(
  fetchFn: typeof fetch,
  supabaseUrl: string,
  adminKey: string,
  bearerToken: string | undefined,
): Promise<AuthenticatedUser | null> {
  if (!bearerToken) return null;

  const response = await fetchFn(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: adminKey,
      authorization: `Bearer ${bearerToken}`,
    },
    method: "GET",
  });
  if (!response.ok) return null;

  const body = (await response.json()) as SupabaseAuthUserResponse;
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  if (!id) return null;

  return {
    id,
  };
}

export function createSupabaseRestPassportExtractionDependencies(
  env: SupabaseRestPassportExtractionEnv,
  fetchFn: typeof fetch = fetch,
): PassportExtractionHandlerOptions {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
  const adminKey = env.SUPABASE_FUNCTION_ADMIN_KEY;
  if (!supabaseUrl || !adminKey) return {};

  const auditTable = env.PASSPORT_EXTRACTION_AUDIT_TABLE ?? "ai_helper_audit_events";

  return {
    authorizer: {
      async authorize({ bearerToken, request }) {
        const authUser = await authenticatedUser(
          fetchFn,
          supabaseUrl,
          adminKey,
          bearerToken,
        );
        if (!authUser) {
          return {
            ok: false,
            safeMessage: "Passport extraction authentication is required.",
            status: 401,
          };
        }

        const pathParts = parsePassportDocumentPath(request.document.path);
        if (!pathParts.ok) {
          return {
            ok: false,
            safeMessage: pathParts.safeMessage,
            status: pathParts.status,
          };
        }

        const profile = await readFirstRestRow<SupabaseProfileResponse>(
          fetchFn,
          `${supabaseUrl}/rest/v1/profiles?select=id,role&id=${restEq(authUser.id)}&limit=1`,
          adminKey,
        );
        const role = profile?.role === "admin" ? "admin" : "agent";
        if (profile?.id !== authUser.id) {
          return {
            ok: false,
            safeMessage: "Passport extraction profile is required.",
            status: 403,
          };
        }

        const media = await readFirstRestRow<SupabaseMediaAssetResponse>(
          fetchFn,
          `${supabaseUrl}/rest/v1/media_assets?select=submission_id,applicant_id,type,storage_bucket,storage_path&storage_bucket=${restEq("submission-media")}&storage_path=${restEq(request.document.path)}&type=${restEq("passport_scan")}&limit=1`,
          adminKey,
        );
        if (
          !media ||
          media.submission_id !== pathParts.data.submissionId ||
          media.applicant_id !== pathParts.data.applicantId ||
          media.storage_bucket !== "submission-media" ||
          media.storage_path !== request.document.path ||
          media.type !== "passport_scan"
        ) {
          return {
            ok: false,
            safeMessage: "Passport document is not registered for extraction.",
            status: 403,
          };
        }

        const submission = await readFirstRestRow<SupabaseSubmissionResponse>(
          fetchFn,
          `${supabaseUrl}/rest/v1/submissions?select=agent_id&id=${restEq(pathParts.data.submissionId)}&limit=1`,
          adminKey,
        );
        if (!submission?.agent_id) {
          return {
            ok: false,
            safeMessage: "Passport submission owner is unavailable.",
            status: 403,
          };
        }
        if (role !== "admin" && submission.agent_id !== authUser.id) {
          return {
            ok: false,
            safeMessage: "Passport extraction is not allowed for this submission.",
            status: 403,
          };
        }

        return {
          ok: true,
          actor: {
            id: authUser.id,
            role,
          },
        };
      },
    },
    auditStore: {
      async record(event) {
        const response = await fetchFn(`${supabaseUrl}/rest/v1/${auditTable}`, {
          body: JSON.stringify({
            actor_id: event.actorId,
            actor_role: event.actorRole,
            created_at: event.createdAt,
            event: event.event,
            intent: "passport_extraction",
            metadata: event.metadata ?? {},
            reason: event.reason,
            request_id: event.requestId,
          }),
          headers: {
            ...authHeaders(adminKey),
            prefer: "return=minimal",
          },
          method: "POST",
        });
        if (!response.ok) throw new Error("Passport extraction audit insert failed.");
      },
    },
  };
}
