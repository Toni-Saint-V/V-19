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

  return {
    ok: true,
    data: {
      intent: value.intent,
      title: value.title,
      summary: value.summary,
      suggestions: value.suggestions,
      blockers: value.blockers,
      guardrails: value.guardrails,
      source: value.source,
      textReview: value.textReview,
      operatorSummary: isStringArray(value.operatorSummary) ? value.operatorSummary : undefined,
      agentFollowUpDrafts: isStringArray(value.agentFollowUpDrafts) ? value.agentFollowUpDrafts : undefined,
      adminReviewChecklist: isStringArray(value.adminReviewChecklist) ? value.adminReviewChecklist : undefined,
      nextAction: typeof value.nextAction === "string" ? value.nextAction : undefined,
      issueRemarkDraft: typeof value.issueRemarkDraft === "string" ? value.issueRemarkDraft : undefined,
      readinessExplanation: typeof value.readinessExplanation === "string" ? value.readinessExplanation : undefined,
    },
  };
}
