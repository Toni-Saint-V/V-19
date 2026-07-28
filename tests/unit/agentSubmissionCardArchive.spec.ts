import { describe, expect, it } from "vitest";

import { agentSubmissionCardArchiveDecision } from "../../src/modules/submissions/agentSubmissionCardArchive";
import type { Submission } from "../../src/modules/submissions/types";

describe("agent submission card archive decision", () => {
  it.each(["draft", "in_progress"] satisfies Submission["status"][])(
    "allows an agent-owned pre-review %s card",
    (status) => {
      expect(agentSubmissionCardArchiveDecision({ status })).toEqual({ ok: true });
    },
  );

  it.each([
    "submitted_for_review",
    "corrections_received",
    "ready_for_export",
    "exported",
  ] satisfies Submission["status"][])("blocks a card after handoff in %s", (status) => {
    expect(agentSubmissionCardArchiveDecision({ status })).toMatchObject({
      ok: false,
    });
  });

  it("explains why a returned submission must stay in the correction lifecycle", () => {
    expect(agentSubmissionCardArchiveDecision({ status: "returned" })).toEqual({
      ok: false,
      reason:
        "Возвращённую подачу нельзя удалить: исправьте замечания и отправьте её повторно.",
    });
  });
});
