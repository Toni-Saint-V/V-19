import { getSupabaseClient } from "../lib/supabase/client";
import { mapSupabasePersistenceError } from "./persistenceObservability";

export interface StatusHistoryInput {
  id?: string;
  entity_type: "submission" | "applicant" | "media" | "appointment";
  entity_id: string;
  from_status: string | null;
  to_status: string;
  comment: string;
  changed_by: string;
  changed_at?: string;
}

export async function appendStatusHistory(input: StatusHistoryInput): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client.from("status_history").insert({
    id: input.id ?? crypto.randomUUID(),
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    from_status: input.from_status,
    to_status: input.to_status,
    comment: input.comment,
    changed_by: input.changed_by,
    changed_at: input.changed_at ?? new Date().toISOString(),
  });

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "status_history.insert",
      fallbackKind: "database",
    });
  }
}
