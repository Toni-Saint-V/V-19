import { getSupabaseClient } from "../lib/supabase/client";
import {
  parseAiHelperResult,
  type AiHelperActor,
  type AiHelperIntent,
  type AiHelperResult,
  type AiHelperRequest,
} from "../shared/ai-helper-contract";

export async function invokeAiHelperEdge(
  intent: AiHelperIntent,
  context: Record<string, unknown>,
  actor: AiHelperActor,
): Promise<AiHelperResult | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const request: AiHelperRequest = {
    intent,
    context,
    actor,
  };
  const { data, error } = await client.functions.invoke<unknown>("ai-helper", {
    body: request,
  });

  if (error) throw error;
  const parsed = parseAiHelperResult(data);
  if (!parsed.ok) {
    throw new Error(parsed.safeMessage);
  }

  return parsed.data;
}
