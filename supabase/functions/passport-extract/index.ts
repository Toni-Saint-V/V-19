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
      PASSPORT_EXTRACTION_AUDIT_TABLE: Deno.env.get("PASSPORT_EXTRACTION_AUDIT_TABLE"),
      SUPABASE_FUNCTION_ADMIN_KEY: Deno.env.get("SUPABASE_FUNCTION_ADMIN_KEY"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    }),
  ),
);
