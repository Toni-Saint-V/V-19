import {
  aiHelperBaseGuardrails,
  buildSafeAiHelperStubResult,
  type AiHelperIntent,
  type AiHelperProvider,
  type AiHelperProviderRequest,
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

function runtimeEnvFor(value: string | undefined): AiHelperRuntimeEnv {
  if (
    value === "demo" ||
    value === "staging" ||
    value === "production" ||
    value === "local"
  ) {
    return value;
  }

  return "local";
}

function providerModeFor(value: string | undefined): AiHelperProviderMode {
  return value === "local_litellm" ? "local_litellm" : "stub";
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

  return env.AI_HELPER_ALLOW_STUB_PROVIDER !== "false";
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

function buildLiteLlmConfig(env: AiHelperLocalProviderEnv): LiteLlmProviderConfig | null {
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

function textArrayFrom(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function stringFieldFrom(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
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

function normalizeProviderResult(
  intent: AiHelperIntent,
  value: Record<string, unknown>,
) {
  return {
    intent,
    title: stringFieldFrom(value.title, "Helper draft"),
    summary: stringFieldFrom(
      value.summary,
      "AI helper generated a draft that needs operator review.",
    ),
    suggestions: textArrayFrom(value.suggestions),
    blockers: textArrayFrom(value.blockers),
    guardrails: [
      ...new Set([...textArrayFrom(value.guardrails), ...aiHelperBaseGuardrails]),
    ],
    source: "edge-provider",
    operatorSummary: textArrayFrom(value.operatorSummary),
    agentFollowUpDrafts: textArrayFrom(value.agentFollowUpDrafts),
  };
}

function systemPrompt(): string {
  return [
    "You are a VisaFlow helper running behind a server-side governance gateway.",
    "Return only valid JSON with keys: title, summary, suggestions, blockers, guardrails, operatorSummary, agentFollowUpDrafts.",
    "Use only the sanitized context. Do not infer identity, outcome likelihood, authority validation, guarantees, OCR, MRZ, passport data, contacts, addresses, document paths, or image content.",
    "Keep every field concise. Deterministic checks remain the source of truth.",
  ].join(" ");
}

function userPrompt(request: AiHelperProviderRequest): string {
  return JSON.stringify({
    intent: request.intent,
    actorRole: request.actorRole,
    sanitizedContext: request.context,
  });
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
            max_tokens: config.maxOutputTokens,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt() },
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
