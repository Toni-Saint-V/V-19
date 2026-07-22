import { clearProductIntakeDrafts, loadProductIntakeDrafts } from "./productIntakeFlow";
import { productIntakeDraftToSubmission } from "./productIntakeSubmissionAdapter";
import type { Submission } from "./types";

export async function migrateLegacyProductIntakeDrafts({
  agentId,
  canonicalSubmissions,
  persistSubmissions,
}: {
  agentId?: Submission["agentId"];
  canonicalSubmissions: Submission[];
  persistSubmissions: (submissions: Submission[]) => Promise<void> | void;
}): Promise<number> {
  const legacyDrafts = loadProductIntakeDrafts();
  if (!legacyDrafts.length) return 0;

  const existingIds = new Set(canonicalSubmissions.map((submission) => submission.id));
  let invalidDraftCount = 0;
  const migrated = legacyDrafts.flatMap((draft) => {
    if (!draft?.id || existingIds.has(draft.id)) return [];
    try {
      return [
        productIntakeDraftToSubmission(draft, {
          agentId,
          submissionId: draft.id,
          // File objects were never serializable. Do not claim a durable upload
          // while preserving advisory OCR fields for manual review.
          useIntakeFilesAsLocalDemoUploads: false,
        }),
      ];
    } catch {
      invalidDraftCount += 1;
      return [];
    }
  });

  if (migrated.length) await persistSubmissions(migrated);
  if (invalidDraftCount === 0) clearProductIntakeDrafts();
  return migrated.length;
}
