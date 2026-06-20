import { aiHelperBaseGuardrails } from "./ai-helper-guardrails";

export { aiHelperBaseGuardrails };

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
  generate(request: AiHelperRequest): Promise<unknown>;
}

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

  if (
    request.actor.role !== "admin" &&
    (request.intent === "admin_review" || request.intent === "export_guard")
  ) {
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
