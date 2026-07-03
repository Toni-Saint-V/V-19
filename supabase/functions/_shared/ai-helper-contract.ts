export const aiHelperIntents = [
  "readiness_summary",
  "text_intake_review",
  "admin_review",
  "admin_next_action",
  "admin_issue_remark_draft",
  "admin_readiness_explanation",
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
  adminReviewChecklist?: string[];
  nextAction?: string;
  issueRemarkDraft?: string;
  readinessExplanation?: string;
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
  /ш[а]нс\w*\s+виз/i,
  /вероятност\w*\s+виз/i,
  new RegExp(["виз", "[\\p{L}]*\\s+одобрен"].join(""), "iu"),
  new RegExp(["официальн", "[\\p{L}]*\\s+провер"].join(""), "iu"),
  new RegExp(["ш", "анс"].join(""), "i"),
  new RegExp(["веро", "ятност"].join(""), "i"),
  new RegExp(["гаран", "ти"].join(""), "i"),
  new RegExp(["OCR", "\\s+подтверд"].join(""), "i"),
  new RegExp(["AI", "\\s+решил"].join(""), "i"),
  new RegExp(["ИИ", "\\s+решил"].join(""), "i"),
];

const sensitiveOutputPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\+?\d[\d\s().-]{9,}\d/,
  /\b\d{2}\s?\d{7}\b/,
];

const maxVisibleOutputChars = 6000;

const aiHelperIntentRolePolicy: Record<AiHelperIntent, readonly AiHelperRole[]> = {
  readiness_summary: ["agent", "admin"],
  text_intake_review: ["agent", "admin"],
  admin_review: ["admin"],
  admin_next_action: ["admin"],
  admin_issue_remark_draft: ["admin"],
  admin_readiness_explanation: ["admin"],
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

const knownSubmissionTypes = new Set(["single", "family"]);

const knownCountryCodes = new Set(["ES"]);

const knownCountryLabels = new Set(["Испания"]);

const knownCities = new Set(["Москва", "Санкт-Петербург", "Казань"]);

const knownApplicantRoles = new Set(["main", "spouse", "child"]);

const knownSeverityValues = new Set([
  "blocking",
  "blocker",
  "warning",
  "info",
  "note",
]);

const knownStateValues = new Set([
  "draft",
  "in_progress",
  "submitted_for_review",
  "returned",
  "corrections_received",
  "ready_for_export",
  "exported",
  "requires_action",
  "filling",
  "ready_for_review",
  "waiting_review",
  "in_review",
  "accepted",
  "ready_for_excel",
  "attention_required",
  "sent_to_appointment",
  "appointment_scheduled",
  "completed",
  "open",
  "fixed_by_agent",
  "closed_by_admin",
  "empty",
  "partial",
  "complete",
  "needs_fix",
  "confirmed",
  "needs_review",
  "missing",
  "uploaded",
  "needs_replacement",
  "pending_review",
  "idle",
  "checking",
  "ready",
  "failed",
  "unavailable",
  "not_ready",
  "file_generated",
  "file_downloaded",
  "marked_exported",
  "clear",
  "needs_correction",
]);

const knownIssueCodes = new Set([
  "missing_required_text",
  "missing_conditional_text",
  "placeholder_text",
  "invalid_email",
  "weak_phone",
  "invalid_date_format",
  "invalid_birth_date",
  "birth_date_in_future",
  "passport_expired_before_travel",
  "passport_issued_after_expiry",
  "date_order_inconsistent",
  "duration_dates_mismatch",
  "non_numeric_duration",
  "weak_passport_number",
  "passport_number_unexpected_format",
  "passport_validity_too_short_after_departure",
  "passport_validity_period_unexpected",
  "latin_text_expected",
  "family_trip_mismatch",
  "residence_submission_city_mismatch",
  "home_address_incomplete",
  "host_country_unexpected",
  "spanish_host_postal_invalid",
  "spanish_host_phone_unexpected",
  "appointment_after_travel_date",
  "minor_occupation_age_mismatch",
  "employer_contact_matches_applicant",
  "employer_address_matches_home",
  "submission_applicant_country_mismatch",
  "submission_applicant_city_mismatch",
  "trip_dates_not_machine_readable",
  "travel_date_outside_trip_dates",
  "duplicate_passport",
  "shared_contact_requires_review",
  "name_too_short",
  "family_role_unconfirmed",
  "missing_media",
  "missing_passport_scan",
  "missing_selfie",
  "missing_selfie_2",
  "media_needs_replacement",
  "questionnaire_incomplete",
  "blocking_issue_open",
  "acceptance_blocked",
  "export_not_ready",
]);

const safeNumericFactKeys = new Set([
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
]);

const safeBooleanFactKeys = new Set([
  "requiresAction",
  "canSubmit",
  "canExport",
]);

const maxSafeAggregateNumber = 10000;

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

function valueFromAllowlist(
  value: string,
  allowlist: ReadonlySet<string>,
): string | null {
  const trimmed = value.trim();

  if (!trimmed || isSensitiveString(trimmed) || !allowlist.has(trimmed)) {
    return null;
  }

  return trimmed;
}

function allowlistedSignalForKey(key: string, value: string): string | null {
  if (key === "code" || key === "issueCode" || key === "reasonCode") {
    return valueFromAllowlist(value, knownIssueCodes);
  }

  if (key === "role" || key === "applicantRole") {
    return valueFromAllowlist(value, knownApplicantRoles);
  }

  if (key === "severity") {
    return valueFromAllowlist(value, knownSeverityValues);
  }

  if (key === "status" || key === "state" || key === "readinessState") {
    return valueFromAllowlist(value, knownStateValues);
  }

  if (key === "type" || key === "submissionType") {
    return valueFromAllowlist(value, knownSubmissionTypes);
  }

  if (key === "countryCode") {
    return valueFromAllowlist(value, knownCountryCodes);
  }

  if (key === "country" || key === "countryLabel") {
    return valueFromAllowlist(value, knownCountryLabels);
  }

  if (
    key === "destinationCity" ||
    key === "consulateCity" ||
    key === "submissionCity"
  ) {
    return valueFromAllowlist(value, knownCities);
  }

  return null;
}

function safeSanitizedValue(
  key: string,
  value: unknown,
): AiHelperSanitizedValue | null {
  if (typeof value === "boolean") {
    return safeBooleanFactKeys.has(key) ? value : null;
  }

  if (typeof value === "number" && isSafeAggregateNumber(value)) {
    return safeNumericFactKeys.has(key) ? value : null;
  }

  if (typeof value === "string") {
    return allowlistedSignalForKey(key, value);
  }

  return null;
}

function isSafeAggregateNumber(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maxSafeAggregateNumber
  );
}

function addUniqueAllowlisted(
  target: string[],
  key: string,
  value: string,
  limit: number,
): void {
  const safeValue = allowlistedSignalForKey(key, value);

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
    isSafeAggregateNumber(value)
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

  const safeValue = safeSanitizedValue(key, value);

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
    const role = allowlistedSignalForKey("role", value.role);

    if (role) {
      applicant.role = role;
    }
  }

  for (const key of ["status", "state", "readinessState"]) {
    const state = value[key];

    if (typeof state === "string") {
      const readinessState = allowlistedSignalForKey(key, state);

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

    if (typeof numberValue === "number" && isSafeAggregateNumber(numberValue)) {
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
            addUniqueAllowlisted(context.issueCodes, "code", issueCode, 80);
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

    if (depth === 0 && sanitizedFactKeys.has(key)) {
      addFact(context.facts, key, item, 50);
    }

    if (
      (key === "code" || key === "issueCode" || key === "reasonCode") &&
      typeof item === "string"
    ) {
      addUniqueAllowlisted(context.issueCodes, key, item, 80);
    }

    if (
      (key === "status" ||
        key === "state" ||
        key === "readinessState" ||
        key === "severity") &&
      typeof item === "string"
    ) {
      const readinessState = allowlistedSignalForKey(key, item);

      if (
        readinessState &&
        !context.readinessStates.includes(`${key}:${readinessState}`) &&
        context.readinessStates.length < 80
      ) {
        context.readinessStates.push(`${key}:${readinessState}`);
      }
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
    adminReviewChecklist: isStringArray(value.adminReviewChecklist)
      ? value.adminReviewChecklist
      : undefined,
    nextAction: typeof value.nextAction === "string" ? value.nextAction : undefined,
    issueRemarkDraft:
      typeof value.issueRemarkDraft === "string" ? value.issueRemarkDraft : undefined,
    readinessExplanation:
      typeof value.readinessExplanation === "string"
        ? value.readinessExplanation
        : undefined,
  };

  const safety = validateAiHelperResult(result);
  if (!safety.ok) return safety;

  return { ok: true, data: result };
}

export function validateAiHelperResult(
  result: AiHelperResult,
): AiHelperContractResult<AiHelperResult> {
  const visibleItems = [
    result.title,
    result.summary,
    ...result.suggestions,
    ...result.blockers,
    ...result.guardrails,
    ...(result.operatorSummary ?? []),
    ...(result.agentFollowUpDrafts ?? []),
    ...(result.adminReviewChecklist ?? []),
    result.nextAction ?? "",
    result.issueRemarkDraft ?? "",
    result.readinessExplanation ?? "",
  ];
  const visibleCopy = visibleItems.join(" ");

  if (
    !result.title.trim() ||
    !result.summary.trim() ||
    visibleItems.some((item) => item.length > 0 && !item.trim()) ||
    visibleCopy.length > maxVisibleOutputChars
  ) {
    return {
      ok: false,
      status: 502,
      safeMessage: "AI helper result failed safety validation.",
    };
  }

  if (
    forbiddenOutputPatterns.some((pattern) => pattern.test(visibleCopy)) ||
    sensitiveOutputPatterns.some((pattern) => pattern.test(visibleCopy))
  ) {
    return {
      ok: false,
      status: 502,
      safeMessage: "AI helper result failed safety validation.",
    };
  }

  return { ok: true, data: result };
}
