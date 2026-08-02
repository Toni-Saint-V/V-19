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

async function supabaseRestReady(env: ReturnType<typeof runtimeEnv>) {
  if (!env.SUPABASE_URL?.trim() || !env.SUPABASE_FUNCTION_ADMIN_KEY?.trim()) {
    return false;
  }
  try {
    if (
      env.PASSPORT_EXTRACTION_AUDIT_TABLE !== undefined &&
      env.PASSPORT_EXTRACTION_AUDIT_TABLE !== CANONICAL_AUDIT_TABLE
    ) {
      return false;
    }
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`, {
      headers: {
        accept: "application/openapi+json",
        apikey: env.SUPABASE_FUNCTION_ADMIN_KEY,
        authorization: `Bearer ${env.SUPABASE_FUNCTION_ADMIN_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const contract = await response.json();
    const auditContract = JSON.stringify({
      path: contract?.paths?.[`/${CANONICAL_AUDIT_TABLE}`] ?? {},
      schema:
        contract?.definitions?.[CANONICAL_AUDIT_TABLE] ??
        contract?.components?.schemas?.[CANONICAL_AUDIT_TABLE] ??
        {},
    });
    return [
      "actor_id",
      "actor_role",
      "created_at",
      "event",
      "intent",
      "metadata",
      "reason",
      "request_id",
    ].every((field) => auditContract.includes(`"${field}"`));
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const env = runtimeEnv();
  if (request.method === "GET" && new URL(request.url).pathname.endsWith("/health")) {
    const ready = await supabaseRestReady(env);
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
