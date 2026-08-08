// supabase/functions/_shared/ai-helper-local-provider.ts
import {
  aiHelperBaseGuardrails,
  buildSafeAiHelperStubResult,
  type AiHelperIntent,
  type AiHelperProvider,
  type AiHelperProviderRequest,
  type AiHelperResult,
} from "./ai-helper-contract.ts";

type AiHelperRuntimeEnv = "local" | "demo" | "staging" | "production";
type AiHelperProviderMode = "stub" | "local_litellm";

export interface AiHelperLocalProviderEnv {
  AI_HELPER_RUNTIME_ENV?: string;
  AI_HELPER_PROVIDER_MODE?: string;
  AI_HELPER_LITELLM_BASE_URL?: string;
  AI_HELPER_LITELLM_API_KEY?: string;
  AI_HELPER_LITELLM_MODEL_GENERAL?: string;
  AI_HELPER_LITELLM_TIMEOUT_MS?: string;
  AI_HELPER_LITELLM_MAX_INPUT_CHARS?: string;
  AI_HELPER_LITELLM_MAX_OUTPUT_TOKENS?: string;
  AI_HELPER_ALLOW_STUB_PROVIDER?: string;
}

interface LiteLlmProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

function runtimeEnvFor(value: string | undefined): AiHelperRuntimeEnv | null {
  if (
    value === "demo" ||
    value === "staging" ||
    value === "production" ||
    value === "local"
  ) {
    return value;
  }

  return null;
}

function providerModeFor(value: string | undefined): AiHelperProviderMode | null {
  if (value === "local_litellm" || value === "stub") {
    return value;
  }

  return null;
}

function positiveIntegerFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isStubAllowed(
  env: AiHelperLocalProviderEnv,
  runtimeEnv: AiHelperRuntimeEnv,
): boolean {
  if (runtimeEnv === "staging" || runtimeEnv === "production") {
    return false;
  }

  return env.AI_HELPER_ALLOW_STUB_PROVIDER === "true";
}

function buildStubProvider(): AiHelperProvider {
  return {
    generate: (request) =>
      Promise.resolve(buildSafeAiHelperStubResult(request.intent, "edge-stub")),
  };
}

function buildFailClosedProvider(): AiHelperProvider {
  return {
    generate: () => Promise.reject(new Error("AI helper provider is not configured.")),
  };
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/$/, "");
}

function buildLiteLlmConfig(
  env: AiHelperLocalProviderEnv,
): LiteLlmProviderConfig | null {
  const baseUrl = normalizeBaseUrl(env.AI_HELPER_LITELLM_BASE_URL);
  const model = env.AI_HELPER_LITELLM_MODEL_GENERAL?.trim() || "qwen2.5:7b";

  if (!baseUrl || !model) {
    return null;
  }

  return {
    baseUrl,
    apiKey: env.AI_HELPER_LITELLM_API_KEY?.trim() || undefined,
    model,
    timeoutMs: positiveIntegerFromEnv(env.AI_HELPER_LITELLM_TIMEOUT_MS, 15000),
    maxOutputTokens: positiveIntegerFromEnv(
      env.AI_HELPER_LITELLM_MAX_OUTPUT_TOKENS,
      700,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectFrom(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseLiteLlmContent(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") {
    throw new Error("LiteLLM response content is missing.");
  }

  const parsed = JSON.parse(value);
  const parsedObject = objectFrom(parsed);

  if (!parsedObject) {
    throw new Error("LiteLLM response content is not an object.");
  }

  return parsedObject;
}

function contentFromLiteLlmResponse(value: unknown): unknown {
  const responseObject = objectFrom(value);
  const choices = responseObject?.choices;

  if (!Array.isArray(choices)) {
    return undefined;
  }

  const firstChoice = objectFrom(choices[0]);
  const message = objectFrom(firstChoice?.message);

  return message?.content;
}

function requiredStringField(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("LiteLLM response string field is invalid.");
  }

  return value;
}

function requiredStringArrayField(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("LiteLLM response array field is invalid.");
  }

  return value;
}

function optionalStringArrayField(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requiredStringArrayField(value);
}

function normalizeProviderResult(
  intent: AiHelperIntent,
  value: Record<string, unknown>,
): AiHelperResult {
  return {
    intent,
    title: requiredStringField(value.title),
    summary: requiredStringField(value.summary),
    suggestions: requiredStringArrayField(value.suggestions),
    blockers: requiredStringArrayField(value.blockers),
    guardrails: [
      ...new Set([
        ...requiredStringArrayField(value.guardrails),
        ...aiHelperBaseGuardrails,
      ]),
    ],
    source: "edge-provider",
    operatorSummary: optionalStringArrayField(value.operatorSummary),
    agentFollowUpDrafts: optionalStringArrayField(value.agentFollowUpDrafts),
    adminReviewChecklist: optionalStringArrayField(value.adminReviewChecklist),
    nextAction:
      typeof value.nextAction === "string" && value.nextAction.trim()
        ? value.nextAction
        : undefined,
    issueRemarkDraft:
      typeof value.issueRemarkDraft === "string" && value.issueRemarkDraft.trim()
        ? value.issueRemarkDraft
        : undefined,
    readinessExplanation:
      typeof value.readinessExplanation === "string" &&
      value.readinessExplanation.trim()
        ? value.readinessExplanation
        : undefined,
  };
}

function intentInstructions(intent: AiHelperIntent): string {
  if (intent === "correction_draft" || intent === "admin_issue_remark_draft") {
    return [
      "Write in Russian.",
      "The summary must be one or two neutral opening sentences for a correction message.",
      "Do not invent, restate, add, remove, or prioritize concrete correction facts.",
      "Do not include names, identifiers, dates, contacts, document numbers, links, deadlines, or outcome promises.",
      "Suggestions may contain at most three short clarifying questions for the human operator.",
      "If issueRemarkDraft is returned, it must contain only the same safe opening copy as summary.",
    ].join(" ");
  }

  if (
    intent === "admin_review" ||
    intent === "admin_next_action" ||
    intent === "admin_readiness_explanation"
  ) {
    return [
      "Write in Russian for an internal operator.",
      "Explain uncertainty and ask concise clarifying questions when evidence is incomplete.",
      "Never override deterministic action availability or claim that the package is accepted.",
      "Keep checklists prioritized and limited to five items.",
    ].join(" ");
  }

  return [
    "Write in Russian.",
    "Prefer concise explanations and actionable questions.",
    "Do not repeat raw context or invent facts.",
  ].join(" ");
}

function systemPrompt(intent: AiHelperIntent): string {
  return [
    "You are a VisaFlow helper running behind a server-side governance gateway.",
    "Return only valid JSON with keys: title, summary, suggestions, blockers, guardrails, operatorSummary, agentFollowUpDrafts.",
    "For admin intents you may also return adminReviewChecklist, nextAction, issueRemarkDraft, readinessExplanation.",
    "Use only the sanitized context. Do not infer identity, outcome likelihood, authority validation, guarantees, OCR, MRZ, passport data, contacts, addresses, document paths, or image content.",
    "Keep every field concise. Deterministic checks remain the source of truth.",
    intentInstructions(intent),
  ].join(" ");
}

function userPrompt(request: AiHelperProviderRequest): string {
  return JSON.stringify({
    intent: request.intent,
    actorRole: request.actorRole,
    sanitizedContext: request.context,
  });
}

function outputTokenBudget(intent: AiHelperIntent, configuredLimit: number): number {
  if (intent === "correction_draft" || intent === "admin_issue_remark_draft") {
    return Math.min(configuredLimit, 220);
  }

  if (
    intent === "admin_review" ||
    intent === "admin_next_action" ||
    intent === "admin_readiness_explanation"
  ) {
    return Math.min(configuredLimit, 480);
  }

  return Math.min(configuredLimit, 600);
}

function buildLiteLlmProvider(
  config: LiteLlmProviderConfig,
  fetchFn: typeof fetch,
): AiHelperProvider {
  return {
    async generate(request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const response = await fetchFn(`${config.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            max_tokens: outputTokenBudget(request.intent, config.maxOutputTokens),
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt(request.intent) },
              { role: "user", content: userPrompt(request) },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("LiteLLM provider returned an error.");
        }

        const providerJson = await response.json();
        const providerResult = parseLiteLlmContent(
          contentFromLiteLlmResponse(providerJson),
        );

        return normalizeProviderResult(request.intent, providerResult);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createAiHelperLocalProvider(
  env: AiHelperLocalProviderEnv,
  fetchFn: typeof fetch = fetch,
): AiHelperProvider {
  const runtimeEnv = runtimeEnvFor(env.AI_HELPER_RUNTIME_ENV);
  const mode = providerModeFor(env.AI_HELPER_PROVIDER_MODE);
  if (!runtimeEnv || !mode) {
    return buildFailClosedProvider();
  }

  const stubAllowed = isStubAllowed(env, runtimeEnv);

  if (mode === "stub") {
    return stubAllowed ? buildStubProvider() : buildFailClosedProvider();
  }

  const liteLlmConfig = buildLiteLlmConfig(env);

  if (!liteLlmConfig) {
    return stubAllowed ? buildStubProvider() : buildFailClosedProvider();
  }

  return buildLiteLlmProvider(liteLlmConfig, fetchFn);
}
