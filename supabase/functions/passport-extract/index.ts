import {
  createSupabaseRestPassportExtractionDependencies,
  handlePassportExtractionRequest,
} from "../_shared/passport-extraction-handler.ts";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

Deno.serve((request) =>
  handlePassportExtractionRequest(
    request,
    createSupabaseRestPassportExtractionDependencies({
      OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
      PASSPORT_EXTRACTION_AUDIT_TABLE: Deno.env.get("PASSPORT_EXTRACTION_AUDIT_TABLE"),
      PASSPORT_EXTRACTION_OPENAI_MAX_BYTES: Deno.env.get(
        "PASSPORT_EXTRACTION_OPENAI_MAX_BYTES",
      ),
      PASSPORT_EXTRACTION_OPENAI_MODEL: Deno.env.get(
        "PASSPORT_EXTRACTION_OPENAI_MODEL",
      ),
      PASSPORT_EXTRACTION_OPENAI_ATTEMPTS_TABLE: Deno.env.get(
        "PASSPORT_EXTRACTION_OPENAI_ATTEMPTS_TABLE",
      ),
      PASSPORT_EXTRACTION_OPENAI_TIMEOUT_MS: Deno.env.get(
        "PASSPORT_EXTRACTION_OPENAI_TIMEOUT_MS",
      ),
      PASSPORT_EXTRACTION_PROVIDER_ENABLED: Deno.env.get(
        "PASSPORT_EXTRACTION_PROVIDER_ENABLED",
      ),
      PASSPORT_EXTRACTION_PROVIDER_ORDER: Deno.env.get(
        "PASSPORT_EXTRACTION_PROVIDER_ORDER",
      ),
      PASSPORT_EXTRACTION_QUOTA_RPC: Deno.env.get("PASSPORT_EXTRACTION_QUOTA_RPC"),
      AI_HELPER_QUOTA_RPC: Deno.env.get("AI_HELPER_QUOTA_RPC"),
      SUPABASE_FUNCTION_ADMIN_KEY: Deno.env.get("SUPABASE_FUNCTION_ADMIN_KEY"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    }),
  ),
);
