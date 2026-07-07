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

export type AiHelperContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; safeMessage: string };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isAiHelperIntent(value: unknown): value is AiHelperIntent {
  return typeof value === "string" && (aiHelperIntents as readonly string[]).includes(value);
}

export function parseAiHelperResult(value: unknown): AiHelperContractResult<AiHelperResult> {
  if (!isRecord(value) || !isAiHelperIntent(value.intent)) {
    return { ok: false, status: 502, safeMessage: "AI helper result is invalid." };
  }
  if (
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    !isStringArray(value.suggestions) ||
    !isStringArray(value.blockers) ||
    !isStringArray(value.guardrails) ||
    (value.source !== "local-stub" && value.source !== "edge-stub" && value.source !== "edge-provider")
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
