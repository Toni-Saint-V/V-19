import {
  createSupabaseRestAiHelperDependencies,
  handleAiHelperRequest,
} from "../_shared/ai-helper-handler.ts";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

Deno.serve((request) =>
  handleAiHelperRequest(
    request,
    createSupabaseRestAiHelperDependencies({
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_FUNCTION_ADMIN_KEY: Deno.env.get("SUPABASE_FUNCTION_ADMIN_KEY"),
      AI_HELPER_AUDIT_TABLE: Deno.env.get("AI_HELPER_AUDIT_TABLE"),
      AI_HELPER_QUOTA_RPC: Deno.env.get("AI_HELPER_QUOTA_RPC"),
      AI_HELPER_RUNTIME_ENV: Deno.env.get("AI_HELPER_RUNTIME_ENV"),
      AI_HELPER_PROVIDER_MODE: Deno.env.get("AI_HELPER_PROVIDER_MODE"),
      AI_HELPER_LITELLM_BASE_URL: Deno.env.get("AI_HELPER_LITELLM_BASE_URL"),
      AI_HELPER_LITELLM_API_KEY: Deno.env.get("AI_HELPER_LITELLM_API_KEY"),
      AI_HELPER_LITELLM_MODEL_GENERAL: Deno.env.get(
        "AI_HELPER_LITELLM_MODEL_GENERAL",
      ),
      AI_HELPER_LITELLM_TIMEOUT_MS: Deno.env.get("AI_HELPER_LITELLM_TIMEOUT_MS"),
      AI_HELPER_LITELLM_MAX_INPUT_CHARS: Deno.env.get(
        "AI_HELPER_LITELLM_MAX_INPUT_CHARS",
      ),
      AI_HELPER_LITELLM_MAX_OUTPUT_TOKENS: Deno.env.get(
        "AI_HELPER_LITELLM_MAX_OUTPUT_TOKENS",
      ),
      AI_HELPER_ALLOW_STUB_PROVIDER: Deno.env.get("AI_HELPER_ALLOW_STUB_PROVIDER"),
    }),
  ),
);
