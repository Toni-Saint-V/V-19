import { describe, expect, test } from "vitest";
import {
  applySubmissionAction,
  canPerformAction,
  getPrimaryAction,
} from "../../src/modules/submissions/status";
import {
  completeQuestionnaire,
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

function reviewReadySubmission(): Submission {
  const draft = createDraftSubmission({
    applicantNames: ["Мария Иванова"],
    city: "Москва",
    familyCount: 1,
    idScheme: "supabase",
    submissions: [],
    type: "single",
  });

  return {
    ...uploadRequiredFiles(completeQuestionnaire(draft)),
    status: "in_progress",
  };
}

describe("submission action safety", () => {
  test("does not allow history view action to export a submission under review", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );

    expect(canPerformAction(submitted, "open_history", "admin")).toEqual({
      ok: false,
      reason: "Действие недоступно в текущем статусе",
    });

    expect(applySubmissionAction(submitted, "open_history", "admin")).toBe(submitted);
  });

  test("keeps exported history view read-only", () => {
    const exported = {
      ...reviewReadySubmission(),
      exportState: "marked_exported",
      status: "exported",
    } satisfies Submission;

    expect(canPerformAction(exported, "open_history", "admin")).toEqual({ ok: true });
    expect(applySubmissionAction(exported, "open_history", "admin")).toBe(exported);
  });

  test("does not expose agent status view as an executable lifecycle action", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );

    expect(getPrimaryAction(submitted, "agent", "agent")).toEqual({
      action: "open_history",
      disabled: true,
      label: "Смотреть статус",
      reason: "Недостаточно прав",
    });
  });
});
