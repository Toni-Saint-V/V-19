import { getSupabaseClient } from "../lib/supabase/client";
import type { AiHelperIntent, AiHelperResult } from "./aiHelperService";

export async function invokeAiHelperEdge(
  intent: AiHelperIntent,
  context: Record<string, unknown>,
): Promise<AiHelperResult | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.functions.invoke<AiHelperResult>("ai-helper", {
    body: { intent, context },
  });

  if (error) throw error;
  return data ?? null;
}
