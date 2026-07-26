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

  test("keeps the latest draft data in the durable intermediate checkpoint", () => {
    const draft = createDraftSubmission({
      applicantNames: ["ANTON VOLKOV"],
      city: "Санкт-Петербург",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    const latestTitle = "Последняя версия перед отправкой";
    const latestApplicantName = "ANTON UPDATED";
    const latestFileName = "latest-passport.jpg";
    const submitted = {
      ...draft,
      title: latestTitle,
      status: "submitted_for_review" as const,
      applicants: draft.applicants.map((applicant) => ({
        ...applicant,
        fullName: latestApplicantName,
      })),
      files: draft.files.map((file, index) =>
        index === 0
          ? {
              ...file,
              generatedFileName: latestFileName,
              status: "pending_review" as const,
            }
          : file,
      ),
    };

    const result = agentSubmissionPersistenceCheckpoints(
      draft,
      submitted,
      draft.agentId,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({
      status: "in_progress",
      title: latestTitle,
      applicants: [expect.objectContaining({ fullName: latestApplicantName })],
    });
    expect(result.data[0]?.files[0]).toMatchObject({
      generatedFileName: latestFileName,
      status: "uploaded",
    });
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
