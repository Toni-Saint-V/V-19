import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseRuntimeConfig } from "./config";
import type { Database } from "./database.types";
import { createEdgeFunctionsRoutingFetch } from "./edgeFunctionsRoutingFetch";
import { createSupabaseResilientFetch } from "./resilientFetch";

export type VisaFlowSupabaseClient = SupabaseClient<Database>;

let cachedClient: VisaFlowSupabaseClient | null = null;

export function getSupabaseClient(): VisaFlowSupabaseClient | null {
  if (supabaseRuntimeConfig.selected !== "supabase") return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient<Database>(
    supabaseRuntimeConfig.url,
    supabaseRuntimeConfig.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: createEdgeFunctionsRoutingFetch(createSupabaseResilientFetch(), {
          edgeFunctionsUrl: supabaseRuntimeConfig.edgeFunctionsUrl,
          projectId: supabaseRuntimeConfig.projectId,
          supabaseUrl: supabaseRuntimeConfig.url,
        }),
      },
    },
  );

  return cachedClient;
}

export function requireSupabaseClient(): VisaFlowSupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      `Supabase is inactive. ${supabaseRuntimeConfig.activation.boundary}`,
    );
  }

  return client;
}
