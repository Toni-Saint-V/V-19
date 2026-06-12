import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseRuntimeConfig } from "./config";
import type { Database } from "./database.types";

export type VisaFlowSupabaseClient = SupabaseClient<Database>;

let cachedClient: VisaFlowSupabaseClient | null = null;

export function getSupabaseClient(): VisaFlowSupabaseClient | null {
  if (!supabaseRuntimeConfig.allowClientActivation) return null;
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
    },
  );

  return cachedClient;
}

export function requireSupabaseClient(): VisaFlowSupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase activation gate is closed. Local demo mode is active.");
  }

  return client;
}
