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

const CANONICAL_AUDIT_TABLE = "ai_helper_audit_events";

function runtimeEnv() {
  return {
    PASSPORT_EXTRACTION_AUDIT_TABLE: Deno.env.get("PASSPORT_EXTRACTION_AUDIT_TABLE"),
    PASSPORT_OCR_COMMAND: Deno.env.get("PASSPORT_OCR_COMMAND"),
    PASSPORT_OCR_PROVIDER: Deno.env.get("PASSPORT_OCR_PROVIDER"),
    SUPABASE_FUNCTION_ADMIN_KEY: Deno.env.get("SUPABASE_FUNCTION_ADMIN_KEY"),
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  };
}

function runtimeReady(env: ReturnType<typeof runtimeEnv>) {
  return Boolean(
    env.SUPABASE_URL?.trim() &&
    env.SUPABASE_FUNCTION_ADMIN_KEY?.trim() &&
    (env.PASSPORT_EXTRACTION_AUDIT_TABLE === undefined ||
      env.PASSPORT_EXTRACTION_AUDIT_TABLE === CANONICAL_AUDIT_TABLE),
  );
}

Deno.serve(async (request) => {
  const env = runtimeEnv();
  if (request.method === "GET" && new URL(request.url).pathname.endsWith("/health")) {
    const ready = runtimeReady(env);
    return Response.json(
      {
        capability: "manual-review-fallback",
        function: "passport-extract",
        status: ready ? "ok" : "blocked",
      },
      { status: ready ? 200 : 503 },
    );
  }
  return await handlePassportExtractionRequest(
    request,
    createSupabaseRestPassportExtractionDependencies(env),
  );
});
