import { describe, expect, test } from "vitest";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";
import { toCockpitDraftPersistencePayload } from "../../src/modules/submissions/supabasePersistence";
import {
  agentSubmissionPersistenceCheckpoints,
  isFinalSubmissionPersistenceCheckpoint,
} from "../../src/modules/submissions/submissionPersistencePlan";

describe("agent submission persistence plan", () => {
  test("persists a ready draft through in-progress before review handoff", () => {
    const draft = createDraftSubmission({
      applicantNames: ["ANTON VOLKOV"],
      city: "Санкт-Петербург",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    const submitted = {
      ...draft,
      status: "submitted_for_review" as const,
    };

    const result = agentSubmissionPersistenceCheckpoints(
      draft,
      submitted,
      draft.agentId,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((submission) => submission.status)).toEqual([
      "in_progress",
      "submitted_for_review",
    ]);
    expect(
      result.data.map(
        (submission) =>
          toCockpitDraftPersistencePayload(submission, draft.agentId, draft.agentId)
            .submission.status,
      ),
    ).toEqual(["filling", "waiting_review"]);
    expect(
      result.data.map((_, index) =>
        isFinalSubmissionPersistenceCheckpoint(index, result.data.length),
      ),
    ).toEqual([false, true]);
  });

  test("keeps an existing in-progress submission as a single persistence write", () => {
    const draft = createDraftSubmission({
      applicantNames: ["ANTON VOLKOV"],
      city: "Санкт-Петербург",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    const current = { ...draft, status: "in_progress" as const };
    const submitted = {
      ...current,
      status: "submitted_for_review" as const,
    };

    const result = agentSubmissionPersistenceCheckpoints(
      current,
      submitted,
      current.agentId,
    );

    expect(result).toEqual({ ok: true, data: [submitted] });
  });
});
