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
    }),
  ),
);
