import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  ReturnedPdfHandoffPublishPayload,
  ReturnedPdfHandoffPublishResult,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";

export type ReturnedPdfAgentHandoffPublishResult = ReturnedPdfHandoffPublishResult;

function toPublishPayload(submissionId: string): ReturnedPdfHandoffPublishPayload {
  const normalized = submissionId.trim();
  if (!normalized) {
    throw new Error("Returned PDF handoff submission id is required.");
  }

  return { submissionId: normalized };
}

export async function publishReturnedPdfAgentHandoff(
  submissionId: string,
): Promise<ReturnedPdfAgentHandoffPublishResult | null> {
  const payload = toPublishPayload(submissionId);
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.rpc("publish_returned_pdf_handoff", {
    payload,
  });

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "rpc.publish_returned_pdf_handoff",
      fallbackKind: "rpc",
    });
  }

  return data ?? null;
}
