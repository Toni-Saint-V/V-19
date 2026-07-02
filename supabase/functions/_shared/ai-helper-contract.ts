export const aiHelperIntents = [
  "readiness_summary",
  "text_intake_review",
  "admin_review",
  "correction_draft",
  "export_guard",
] as const;

export type AiHelperIntent = (typeof aiHelperIntents)[number];
export type AiHelperSource = "local-stub" | "edge-stub" | "edge-provider";
export type AiHelperRole = "agent" | "admin";

export interface AiHelperActor {
  id: string;
  role: AiHelperRole;
  canUseAI: boolean;
}

export interface AiHelperRequest {
  intent: AiHelperIntent;
  context: Record<string, unknown>;
  actor: AiHelperActor;
  requestId?: string;
}

export type AiHelperSanitizedValue = string | number | boolean;

export interface AiHelperSanitizedApplicantContext {
  label: string;
  role?: string;
  readinessState?: string;
  fieldCompletion?: number;
  mediaUploaded?: number;
  mediaRequired?: number;
  issueCodes: string[];
}

export interface AiHelperSanitizedProviderContext {
  facts: Record<string, AiHelperSanitizedValue>;
  counts: Record<string, number>;
  issueCodes: string[];
  readinessStates: string[];
  applicants: AiHelperSanitizedApplicantContext[];
  redaction: "raw_context_removed";
  truncated: boolean;
}

export interface AiHelperProviderRequest {
  intent: AiHelperIntent;
  actorRole: AiHelperRole;
  context: AiHelperSanitizedProviderContext;
}

export interface AiHelperResult {
  intent: AiHelperIntent;
  title: string;
  summary: string;
  suggestions: string[];
  blockers: string[];
  guardrails: string[];
  source: AiHelperSource;
  textReview?: unknown;
  operatorSummary?: string[];
  agentFollowUpDrafts?: string[];
}

export interface AiHelperAuditEvent {
  event:
    | "ai_helper_invoked"
    | "ai_helper_denied"
    | "ai_helper_rate_limited"
    | "ai_helper_quota_failed"
    | "ai_helper_provider_failed"
    | "ai_helper_output_rejected";
  intent?: AiHelperIntent;
  actorId?: string;
  actorRole?: AiHelperRole;
  requestId?: string;
  reason: string;
  createdAt: string;
}

export type AiHelperContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; safeMessage: string };

export interface AiHelperRateLimitState {
  remaining: number;
  resetAt?: string;
}

export interface AiHelperAuditStore {
  record(event: AiHelperAuditEvent): Promise<void>;
}

export interface AiHelperQuotaStore {
  consume(request: AiHelperRequest): Promise<AiHelperRateLimitState>;
}

export interface AiHelperProvider {
  generate(request: AiHelperProviderRequest): Promise<unknown>;
}

export const aiHelperBaseGuardrails = [
  "Подсказка не является решением.",
  "Детерминированные проверки остаются источником истины.",
  "Оператор принимает медиа и заявку вручную.",
] as const;

const forbiddenOutputPatterns = [
  /approval\s+odds/i,
  /approval\s+probability/i,
  /visa\s+odds/i,
  /visa\s+guarantee/i,
  /official\W+verification/i,
  /official\W+validation/i,
  /official\w*\s+verif/i,
  /guaranteed/i,
  /одобрен/i,
  /гарантир/i,
  /официальн\w*\s+провер/i,
  /шанс\w*\s+виз/i,
  /вероятност\w*\s+виз/i,
];

const aiHelperIntentRolePolicy: Record<AiHelperIntent, readonly AiHelperRole[]> = {
  readiness_summary: ["agent", "admin"],
  text_intake_review: ["agent", "admin"],
  admin_review: ["admin"],
  correction_draft: ["agent", "admin"],
  export_guard: ["admin"],
};

const sanitizedFactKeys = new Set([
  "submissionId",
  "submissionType",
  "type",
  "status",
  "appointment",
  "priority",
  "country",
  "countryCode",
  "countryLabel",
  "destinationCity",
  "consulateCity",
  "submissionCity",
  "fields",
  "fieldCompletion",
  "media",
  "mediaRequired",
  "mediaAccepted",
  "mediaUploaded",
  "applicantCount",
  "peopleCount",
  "openIssueCount",
  "blockingIssueCount",
  "warningIssueCount",
  "exportableCount",
  "readyCount",
  "requiresAction",
  "canSubmit",
  "canExport",
]);

const countArrayKeys = new Map([
  ["applicants", "applicantCount"],
  ["issues", "issueCount"],
  ["notes", "issueCount"],
  ["findings", "findingCount"],
  ["blockers", "blockerCount"],
  ["mediaRows", "mediaRowCount"],
  ["mediaSlots", "mediaSlotCount"],
  ["files", "fileCount"],
  ["documents", "documentCount"],
]);

const sensitiveKeyPatterns = [
  /name/i,
  /email/i,
  /phone/i,
  /passport/i,
  /address/i,
  /free.?text/i,
  /^text$/i,
  /comment/i,
  /message/i,
  /note/i,
  /ocr/i,
  /mrz/i,
  /storage/i,
  /path/i,
  /url/i,
  /image/i,
  /document/i,
  /file/i,
  /payload/i,
  /content/i,
  /base64/i,
];

const sensitiveValuePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\+?\d[\d\s().-]{7,}\d/,
  /\b\d{2}\s?\d{7}\b/,
  /https?:\/\//i,
  /supabase\.co/i,
  /storage\/v1/i,
];

const safeSignalPattern = /^[\p{L}\p{N}_.:-]{1,80}$/u;

export function isAiHelperIntent(value: unknown): value is AiHelperIntent {
  return (
    typeof value === "string" && (aiHelperIntents as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRoleAllowedForIntent(intent: AiHelperIntent, role: AiHelperRole): boolean {
  return aiHelperIntentRolePolicy[intent].includes(role);
}

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyPatterns.some((pattern) => pattern.test(key));
}

function isSensitiveString(value: string): boolean {
  return sensitiveValuePatterns.some((pattern) => pattern.test(value));
}

function sanitizeSignalString(value: string): string | null {
  const trimmed = value.trim();

  if (
    !trimmed ||
    !safeSignalPattern.test(trimmed) ||
    isSensitiveString(trimmed)
  ) {
    return null;
  }

  return trimmed;
}

function safeSanitizedValue(value: unknown): AiHelperSanitizedValue | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeSignalString(value);
  }

  return null;
}

function addUnique(target: string[], value: string, limit: number): void {
  const safeValue = sanitizeSignalString(value);

  if (safeValue && !target.includes(safeValue) && target.length < limit) {
    target.push(safeValue);
  }
}

function addCount(
  target: Record<string, number>,
  key: string,
  value: number,
  limit: number,
): void {
  if (
    Object.keys(target).length < limit &&
    Number.isFinite(value) &&
    value >= 0
  ) {
    target[key] = value;
  }
}

function addFact(
  target: Record<string, AiHelperSanitizedValue>,
  key: string,
  value: unknown,
  limit: number,
): void {
  if (Object.keys(target).length >= limit) {
    return;
  }

  const safeValue = safeSanitizedValue(value);

  if (safeValue !== null) {
    target[key] = safeValue;
  }
}

function sanitizeApplicant(
  value: unknown,
  index: number,
): AiHelperSanitizedApplicantContext | null {
  if (!isRecord(value)) {
    return null;
  }

  const applicant: AiHelperSanitizedApplicantContext = {
    label: `applicant_${index + 1}`,
    issueCodes: [],
  };

  if (typeof value.role === "string") {
    const role = sanitizeSignalString(value.role);

    if (role) {
      applicant.role = role;
    }
  }

  for (const key of ["status", "state", "readinessState"]) {
    const state = value[key];

    if (typeof state === "string") {
      const readinessState = sanitizeSignalString(state);

      if (readinessState) {
        applicant.readinessState = `${key}:${readinessState}`;
        break;
      }
    }
  }

  for (const [sourceKey, targetKey] of [
    ["fields", "fieldCompletion"],
    ["form", "fieldCompletion"],
    ["fieldCompletion", "fieldCompletion"],
    ["media", "mediaUploaded"],
    ["mediaUploaded", "mediaUploaded"],
    ["mediaRequired", "mediaRequired"],
  ] as const) {
    const numberValue = value[sourceKey];

    if (typeof numberValue === "number" && Number.isFinite(numberValue)) {
      applicant[targetKey] = numberValue;
    }
  }

  collectSafeSignals(value, {
    facts: {},
    counts: {},
    issueCodes: applicant.issueCodes,
    readinessStates: [],
    applicants: [],
    truncated: false,
  });

  return applicant;
}

function collectSafeSignals(
  value: unknown,
  context: Omit<AiHelperSanitizedProviderContext, "redaction">,
  depth = 0,
  currentKey = "",
): void {
  if (depth > 4) {
    context.truncated = true;
    return;
  }

  if (Array.isArray(value)) {
    const countKey = countArrayKeys.get(currentKey);

    if (countKey) {
      addCount(context.counts, countKey, value.length, 50);
    }

    for (const item of value.slice(0, 30)) {
      collectSafeSignals(item, context, depth + 1, currentKey);
    }

    if (value.length > 30) {
      context.truncated = true;
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      const countKey = countArrayKeys.get(key);

      if (countKey) {
        addCount(context.counts, countKey, item.length, 50);
      }
    }

    if (key === "applicants" && Array.isArray(item)) {
      for (const [index, applicant] of item.slice(0, 12).entries()) {
        const sanitizedApplicant = sanitizeApplicant(applicant, index);

        if (sanitizedApplicant) {
          for (const issueCode of sanitizedApplicant.issueCodes) {
            addUnique(context.issueCodes, issueCode, 80);
          }

          context.applicants.push(sanitizedApplicant);
        }
      }

      if (item.length > 12) {
        context.truncated = true;
      }

      continue;
    }

    if (isSensitiveKey(key)) {
      continue;
    }

    if (sanitizedFactKeys.has(key)) {
      addFact(context.facts, key, item, 50);
    }

    if (
      (key === "code" || key === "issueCode" || key === "reasonCode") &&
      typeof item === "string"
    ) {
      addUnique(context.issueCodes, item, 80);
    }

    if (
      (key === "status" ||
        key === "state" ||
        key === "readinessState" ||
        key === "severity") &&
      typeof item === "string"
    ) {
      addUnique(context.readinessStates, `${key}:${item}`, 80);
    }

    if (isRecord(item) || Array.isArray(item)) {
      collectSafeSignals(item, context, depth + 1, key);
    }
  }
}

function enforceProviderInputBudget(
  context: AiHelperSanitizedProviderContext,
  maxInputChars: number,
): AiHelperSanitizedProviderContext {
  if (JSON.stringify(context).length <= maxInputChars) {
    return context;
  }

  const compactContext: AiHelperSanitizedProviderContext = {
    ...context,
    facts: Object.fromEntries(Object.entries(context.facts).slice(0, 20)),
    counts: Object.fromEntries(Object.entries(context.counts).slice(0, 20)),
    issueCodes: context.issueCodes.slice(0, 20),
    readinessStates: context.readinessStates.slice(0, 20),
    applicants: context.applicants.slice(0, 4).map((applicant) => ({
      ...applicant,
      issueCodes: applicant.issueCodes.slice(0, 8),
    })),
    truncated: true,
  };

  if (JSON.stringify(compactContext).length <= maxInputChars) {
    return compactContext;
  }

  return {
    facts: Object.fromEntries(Object.entries(compactContext.facts).slice(0, 8)),
    counts: Object.fromEntries(Object.entries(compactContext.counts).slice(0, 8)),
    issueCodes: compactContext.issueCodes.slice(0, 8),
    readinessStates: compactContext.readinessStates.slice(0, 8),
    applicants: [],
    redaction: "raw_context_removed",
    truncated: true,
  };
}

export function buildAiHelperProviderRequest(
  request: AiHelperRequest,
  maxInputChars = 6000,
): AiHelperProviderRequest {
  const context: Omit<AiHelperSanitizedProviderContext, "redaction"> = {
    facts: {},
    counts: {},
    issueCodes: [],
    readinessStates: [],
    applicants: [],
    truncated: false,
  };

  collectSafeSignals(request.context, context);

  return {
    intent: request.intent,
    actorRole: request.actor.role,
    context: enforceProviderInputBudget(
      {
        ...context,
        redaction: "raw_context_removed",
      },
      maxInputChars,
    ),
  };
}

export function parseAiHelperRequest(
  value: unknown,
): AiHelperContractResult<AiHelperRequest> {
  if (!isRecord(value)) {
    return { ok: false, status: 400, safeMessage: "AI helper request is invalid." };
  }

  if (!isAiHelperIntent(value.intent)) {
    return { ok: false, status: 400, safeMessage: "Unsupported helper intent." };
  }

  if (!isRecord(value.actor)) {
    return { ok: false, status: 401, safeMessage: "AI helper actor is required." };
  }

  const actor = value.actor;
  if (
    typeof actor.id !== "string" ||
    !actor.id.trim() ||
    (actor.role !== "agent" && actor.role !== "admin") ||
    typeof actor.canUseAI !== "boolean"
  ) {
    return { ok: false, status: 401, safeMessage: "AI helper actor is invalid." };
  }

  return {
    ok: true,
    data: {
      intent: value.intent,
      context: isRecord(value.context) ? value.context : {},
      actor: {
        id: actor.id.trim(),
        role: actor.role,
        canUseAI: actor.canUseAI,
      },
    },
  };
}

export function evaluateAiHelperAccess(
  request: AiHelperRequest,
): AiHelperContractResult<AiHelperRequest> {
  if (!request.actor.canUseAI) {
    return { ok: false, status: 403, safeMessage: "AI helper access is disabled." };
  }

  if (!isRoleAllowedForIntent(request.intent, request.actor.role)) {
    return {
      ok: false,
      status: 403,
      safeMessage: "Admin AI helper access is required.",
    };
  }

  return { ok: true, data: request };
}

export function evaluateAiHelperRateLimit(
  request: AiHelperRequest,
  state?: AiHelperRateLimitState,
): AiHelperContractResult<AiHelperRequest> {
  if (state && state.remaining <= 0) {
    return {
      ok: false,
      status: 429,
      safeMessage: state.resetAt
        ? `AI helper quota is exhausted until ${state.resetAt}.`
        : "AI helper quota is exhausted.",
    };
  }

  return { ok: true, data: request };
}

export function buildAiHelperAuditEvent(
  event: AiHelperAuditEvent["event"],
  reason: string,
  request?: Partial<AiHelperRequest>,
  createdAt = new Date().toISOString(),
): AiHelperAuditEvent {
  return {
    event,
    intent: request?.intent,
    actorId: request?.actor?.id,
    actorRole: request?.actor?.role,
    requestId: request?.requestId,
    reason,
    createdAt,
  };
}

export function withAiHelperRequestId(
  request: AiHelperRequest,
  requestId: string = crypto.randomUUID(),
): AiHelperRequest {
  return {
    ...request,
    requestId,
  };
}

export function buildSafeAiHelperStubResult(
  intent: AiHelperIntent,
  source: AiHelperSource,
): AiHelperResult {
  return {
    intent,
    title: "Helper draft",
    summary:
      "Backend helper stub is available. Configure a server-side model provider later to generate richer drafts.",
    suggestions: [
      "Use deterministic blockers before sending or exporting.",
      "Review the draft before showing it to an agent.",
    ],
    blockers: [],
    guardrails: [...aiHelperBaseGuardrails],
    source,
  };
}

export function parseAiHelperResult(
  value: unknown,
): AiHelperContractResult<AiHelperResult> {
  if (!isRecord(value) || !isAiHelperIntent(value.intent)) {
    return { ok: false, status: 502, safeMessage: "AI helper result is invalid." };
  }

  if (
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    !isStringArray(value.suggestions) ||
    !isStringArray(value.blockers) ||
    !isStringArray(value.guardrails) ||
    (value.source !== "local-stub" &&
      value.source !== "edge-stub" &&
      value.source !== "edge-provider")
  ) {
    return { ok: false, status: 502, safeMessage: "AI helper result is incomplete." };
  }

  if (value.source === "edge-provider" && value.textReview !== undefined) {
    return {
      ok: false,
      status: 502,
      safeMessage: "AI helper result is invalid.",
    };
  }

  const result: AiHelperResult = {
    intent: value.intent,
    title: value.title,
    summary: value.summary,
    suggestions: value.suggestions,
    blockers: value.blockers,
    guardrails: value.guardrails,
    source: value.source,
    textReview: value.textReview,
    operatorSummary: isStringArray(value.operatorSummary)
      ? value.operatorSummary
      : undefined,
    agentFollowUpDrafts: isStringArray(value.agentFollowUpDrafts)
      ? value.agentFollowUpDrafts
      : undefined,
  };

  const safety = validateAiHelperResult(result);
  if (!safety.ok) return safety;

  return { ok: true, data: result };
}

export function validateAiHelperResult(
  result: AiHelperResult,
): AiHelperContractResult<AiHelperResult> {
  const visibleCopy = [
    result.title,
    result.summary,
    ...result.suggestions,
    ...result.blockers,
    ...result.guardrails,
    ...(result.operatorSummary ?? []),
    ...(result.agentFollowUpDrafts ?? []),
  ].join(" ");

  if (forbiddenOutputPatterns.some((pattern) => pattern.test(visibleCopy))) {
    return {
      ok: false,
      status: 502,
      safeMessage: "AI helper result failed safety validation.",
    };
  }

  return { ok: true, data: result };
}
