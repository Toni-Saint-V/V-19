import {
  evaluatePassportExtractionAccess,
  parsePassportExtractionRequest,
  parsePassportExtractionResult,
  parsePassportDocumentPath,
  passportExtractionAuditEvent,
  passportExtractionFields,
  safeUnavailablePassportExtractionResult,
  type PassportExtractionActor,
  type PassportExtractionAuditEvent,
  type PassportExtractionAuditStore,
  type PassportExtractionClientRequest,
  type PassportExtractionContractResult,
  type PassportExtractionField,
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
  result: { openAiAttempted?: boolean; source: string; status: string },
) {
  const isOpenAi = result.source === "openai-vision";
  return {
    document_fingerprint: passportDocumentFingerprint(request),
    openai_attempted: isOpenAi ? result.openAiAttempted === true : false,
    provider: isOpenAi ? "openai" : result.source,
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
  OPENAI_API_KEY?: string;
  PASSPORT_EXTRACTION_OPENAI_MAX_BYTES?: string;
  PASSPORT_EXTRACTION_OPENAI_MODEL?: string;
  PASSPORT_EXTRACTION_OPENAI_ATTEMPTS_TABLE?: string;
  PASSPORT_EXTRACTION_OPENAI_TIMEOUT_MS?: string;
  PASSPORT_EXTRACTION_PROVIDER_ORDER?: string;
  PASSPORT_EXTRACTION_PROVIDER_ENABLED?: string;
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

type PassportProviderName = "openai";

type OpenAiPassportField = {
  confidence?: unknown;
  key?: unknown;
  needsManualReview?: unknown;
  value?: unknown;
};

type OpenAiPassportPayload = {
  fields?: unknown;
  mrzValid?: unknown;
  status?: unknown;
  summary?: unknown;
};

const openAiFieldKeys = new Set<string>(passportExtractionFields);
const defaultOpenAiMaxBytes = 10 * 1024 * 1024;
const defaultOpenAiTimeoutMs = 25_000;

function providerOrderFromEnv(value: string | undefined): PassportProviderName[] {
  const parsed = (value ?? "openai")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is PassportProviderName => item === "openai");
  if (parsed.length) return parsed;
  return value ? [] : ["openai"];
}

function positiveIntegerFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstTextFromOpenAiResponse(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.output_text === "string") return value.output_text;

  const output = Array.isArray(value.output) ? value.output : [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (typeof content.text === "string") return content.text;
      if (typeof content.output_text === "string") return content.output_text;
    }
  }

  return "";
}

function parseJsonObject(text: string): OpenAiPassportPayload | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizedOpenAiField(
  field: OpenAiPassportField,
): PassportExtractionField | null {
  if (
    typeof field.key !== "string" ||
    !openAiFieldKeys.has(field.key) ||
    typeof field.value !== "string"
  ) {
    return null;
  }

  const value = field.value.trim();
  if (!value) return null;
  const confidence =
    field.confidence === "high" ||
    field.confidence === "medium" ||
    field.confidence === "low"
      ? field.confidence
      : "low";

  return {
    confidence,
    key: field.key as PassportExtractionField["key"],
    needsManualReview:
      typeof field.needsManualReview === "boolean"
        ? field.needsManualReview
        : confidence !== "high",
    value,
  };
}

function passportResultFromOpenAiPayload(
  payload: OpenAiPassportPayload | null,
  request: PassportExtractionRequest,
) {
  if (
    !payload ||
    payload.status !== "extracted" ||
    payload.mrzValid !== true ||
    !Array.isArray(payload.fields)
  ) {
    return {
      ...safeUnavailablePassportExtractionResult(request.applicantIndex),
      openAiAttempted: true,
      source: "openai-vision" as const,
      summary:
        "OpenAI не дал валидные паспортные данные с подтвержденной MRZ. Проверьте паспорт вручную.",
    };
  }

  const fields = payload.fields
    .filter(isRecord)
    .map((field) => normalizedOpenAiField(field))
    .filter((field): field is PassportExtractionField => Boolean(field));

  if (!fields.length) {
    return {
      ...safeUnavailablePassportExtractionResult(request.applicantIndex),
      openAiAttempted: true,
      source: "openai-vision" as const,
      summary: "OpenAI не вернул пригодные паспортные поля. Проверьте паспорт вручную.",
    };
  }

  return {
    applicantIndex: request.applicantIndex,
    fields,
    guardrails: [
      "Данные из паспорта нужно проверить вручную.",
      "OpenAI используется только как fallback, не как юридическое подтверждение.",
      "Поля без уверенного чтения остаются на ручную проверку.",
    ],
    openAiAttempted: true,
    source: "openai-vision" as const,
    status: "extracted" as const,
    summary:
      typeof payload.summary === "string" && payload.summary.trim()
        ? payload.summary.trim()
        : "OpenAI fallback извлек паспортные поля. Проверьте их вручную.",
  };
}

function unavailableOpenAiResult(
  request: PassportExtractionRequest,
  summary: string,
  openAiAttempted: boolean,
) {
  return {
    ...safeUnavailablePassportExtractionResult(request.applicantIndex),
    openAiAttempted,
    source: "openai-vision" as const,
    summary,
  };
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

async function readStorageObject(
  fetchFn: typeof fetch,
  supabaseUrl: string,
  adminKey: string,
  request: PassportExtractionRequest,
): Promise<ArrayBuffer> {
  const path = request.document.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await fetchFn(
    `${supabaseUrl}/storage/v1/object/${request.document.bucket}/${path}`,
    {
      headers: {
        apikey: adminKey,
        authorization: `Bearer ${adminKey}`,
      },
      method: "GET",
    },
  );
  if (!response.ok) throw new Error("Passport storage object read failed.");
  return response.arrayBuffer();
}

function openAiDocumentContent(request: PassportExtractionRequest, fileData: string) {
  const dataUrl = `data:${request.document.mimeType};base64,${fileData}`;
  if (request.document.mimeType === "application/pdf") {
    return {
      type: "input_file",
      filename: request.document.path.split("/").at(-1) ?? "passport.pdf",
      file_data: dataUrl,
    };
  }

  return {
    type: "input_image",
    image_url: dataUrl,
  };
}

function openAiPromptText() {
  return [
    "Extract passport data from this document.",
    "Accept only passports with a readable MRZ.",
    "Return JSON only with keys: status ('extracted' or 'unavailable'), mrzValid (boolean), summary (string), fields (array).",
    "Each field item must have key, value, confidence ('high','medium','low'), needsManualReview.",
    `Allowed field keys: ${passportExtractionFields.join(", ")}.`,
    "If this is not a passport, MRZ is missing, or check digits are uncertain, return status unavailable, mrzValid false, fields [].",
    "Do not guess missing values.",
  ].join(" ");
}

function passportDocumentFingerprint(request: PassportExtractionRequest) {
  return [
    request.document.bucket,
    request.document.path,
    request.document.mimeType,
    request.document.sizeBytes,
  ].join("|");
}

async function reserveOpenAiAttemptForDocument({
  adminKey,
  attemptsTable,
  fetchFn,
  fingerprint,
  request,
  supabaseUrl,
}: {
  adminKey: string;
  attemptsTable: string;
  fetchFn: typeof fetch;
  fingerprint: string;
  request: PassportExtractionRequest;
  supabaseUrl: string;
}) {
  const response = await fetchFn(`${supabaseUrl}/rest/v1/${attemptsTable}`, {
    body: JSON.stringify({
      actor_id: request.actor.id,
      actor_role: request.actor.role,
      document_fingerprint: fingerprint,
      request_id: request.requestId ?? null,
      storage_path: request.document.path,
    }),
    headers: {
      ...authHeaders(adminKey),
      prefer: "return=minimal",
    },
    method: "POST",
  });
  if (response.ok) return true;
  if (response.status === 409) return false;
  throw new Error("Passport OpenAI attempt registry unavailable.");
}

function createOpenAiPassportExtractionProvider({
  adminKey,
  apiKey,
  fetchFn,
  maxBytes,
  model,
  supabaseUrl,
  timeoutMs,
}: {
  adminKey: string;
  apiKey: string;
  fetchFn: typeof fetch;
  maxBytes: number;
  model: string;
  supabaseUrl: string;
  timeoutMs: number;
}): PassportExtractionProvider {
  return {
    async extract(request) {
      if (request.allowOpenAiFallback === false) {
        return safeUnavailablePassportExtractionResult(request.applicantIndex);
      }
      if (request.document.sizeBytes > maxBytes) {
        return unavailableOpenAiResult(
          request,
          "Файл паспорта слишком большой для OpenAI fallback. Проверьте паспорт вручную.",
          false,
        );
      }

      const file = await readStorageObject(fetchFn, supabaseUrl, adminKey, request);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchFn("https://api.openai.com/v1/responses", {
          body: JSON.stringify({
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: openAiPromptText(),
                  },
                  openAiDocumentContent(request, base64FromArrayBuffer(file)),
                ],
              },
            ],
            max_output_tokens: 900,
            model,
            text: {
              format: {
                type: "json_object",
              },
            },
          }),
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });
      } catch {
        return unavailableOpenAiResult(
          request,
          "OpenAI fallback временно недоступен. Проверьте паспорт вручную.",
          true,
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return unavailableOpenAiResult(
          request,
          "OpenAI fallback не обработал паспорт. Проверьте паспорт вручную.",
          true,
        );
      }
      let openAiResponse: unknown;
      try {
        openAiResponse = await response.json();
      } catch {
        return unavailableOpenAiResult(
          request,
          "OpenAI fallback вернул нечитаемый ответ. Проверьте паспорт вручную.",
          true,
        );
      }
      const payload = parseJsonObject(firstTextFromOpenAiResponse(openAiResponse));
      return passportResultFromOpenAiPayload(payload, request);
    },
  };
}

function createPassportExtractionProviderChain({
  openAiProvider,
  order,
  reserveOpenAiAttempt,
}: {
  openAiProvider?: PassportExtractionProvider;
  order: PassportProviderName[];
  reserveOpenAiAttempt?: (request: PassportExtractionRequest) => Promise<boolean>;
}): PassportExtractionProvider {
  return {
    async extract(request) {
      let fallback = safeUnavailablePassportExtractionResult(request.applicantIndex);

      for (const providerName of order) {
        if (providerName === "openai" && openAiProvider) {
          if (request.allowOpenAiFallback === false) {
            continue;
          }
          if (reserveOpenAiAttempt) {
            try {
              if (!(await reserveOpenAiAttempt(request))) continue;
            } catch {
              return {
                ...fallback,
                summary:
                  "OpenAI fallback временно недоступен: не удалось зарезервировать попытку. Проверьте паспорт вручную.",
              };
            }
          }
          const result = await openAiProvider.extract(request);
          const parsed = parsePassportExtractionResult(result);
          if (parsed.ok) {
            fallback = parsed.data;
            if (parsed.data.status === "extracted") return parsed.data;
          }
        }
      }

      return fallback;
    },
  };
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
  const openAiAttemptsTable =
    env.PASSPORT_EXTRACTION_OPENAI_ATTEMPTS_TABLE ??
    "passport_extraction_openai_attempts";
  const providerEnabled = env.PASSPORT_EXTRACTION_PROVIDER_ENABLED === "true";
  const openAiApiKey = env.OPENAI_API_KEY?.trim();
  const openAiMaxBytes = positiveIntegerFromEnv(
    env.PASSPORT_EXTRACTION_OPENAI_MAX_BYTES,
    defaultOpenAiMaxBytes,
  );
  const openAiTimeoutMs = positiveIntegerFromEnv(
    env.PASSPORT_EXTRACTION_OPENAI_TIMEOUT_MS,
    defaultOpenAiTimeoutMs,
  );
  const openAiProvider =
    providerEnabled && openAiApiKey
      ? createOpenAiPassportExtractionProvider({
          adminKey,
          apiKey: openAiApiKey,
          fetchFn,
          maxBytes: openAiMaxBytes,
          model: env.PASSPORT_EXTRACTION_OPENAI_MODEL ?? "gpt-4o-mini",
          supabaseUrl,
          timeoutMs: openAiTimeoutMs,
        })
      : undefined;
  const provider = providerEnabled
    ? createPassportExtractionProviderChain({
        reserveOpenAiAttempt: (request) =>
          reserveOpenAiAttemptForDocument({
            adminKey,
            attemptsTable: openAiAttemptsTable,
            fetchFn,
            fingerprint: passportDocumentFingerprint(request),
            request,
            supabaseUrl,
          }),
        openAiProvider,
        order: providerOrderFromEnv(env.PASSPORT_EXTRACTION_PROVIDER_ORDER),
      })
    : undefined;

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
    provider,
  };
}
