import { describe, expect, it, vi } from "vitest";

import {
  agentSubmissionDeletionDecision,
  commitLocalDemoSubmissionDeletion,
  localDemoMediaPathsForSubmission,
} from "../../src/modules/submissions/submissionDeletion";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";

function submission() {
  return createDraftSubmission({
    agentId: "agent-1",
    city: "Москва",
    familyCount: 1,
    submissions: [],
    type: "single",
  });
}

describe("agent submission deletion", () => {
  it("commits local deletion and leaves failed IndexedDB cleanup for bootstrap retry", async () => {
    const persistCanonicalDeletion = vi.fn(async () => undefined);
    const deleteStoredMedia = vi.fn(async (path: string) => {
      if (path === "local/a.jpg") throw new Error("IndexedDB unavailable");
    });

    await expect(
      commitLocalDemoSubmissionDeletion({
        cleanupPaths: ["local/a.jpg", "local/b.jpg"],
        deleteStoredMedia,
        persistCanonicalDeletion,
      }),
    ).resolves.toEqual({ cleanupPendingPaths: ["local/a.jpg"] });
    expect(persistCanonicalDeletion).toHaveBeenCalledOnce();
    expect(deleteStoredMedia).toHaveBeenCalledTimes(2);
  });

  it("does not remove IndexedDB media when canonical local deletion fails", async () => {
    const persistenceError = new Error("localStorage unavailable");
    const deleteStoredMedia = vi.fn(async () => undefined);

    await expect(
      commitLocalDemoSubmissionDeletion({
        cleanupPaths: ["local/a.jpg"],
        deleteStoredMedia,
        persistCanonicalDeletion: async () => {
          throw persistenceError;
        },
      }),
    ).rejects.toBe(persistenceError);
    expect(deleteStoredMedia).not.toHaveBeenCalled();
  });

  it.each(["draft", "in_progress"] as const)(
    "allows the owner to delete %s submissions",
    (status) => {
      expect(
        agentSubmissionDeletionDecision({ ...submission(), status }, "agent-1"),
      ).toEqual({ ok: true });
    },
  );

  it("rejects another agent", () => {
    expect(agentSubmissionDeletionDecision(submission(), "agent-2")).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
  });

  it.each([
    "submitted_for_review",
    "returned",
    "corrections_received",
    "ready_for_export",
    "exported",
    "requires_action",
  ] as const)("protects %s submissions", (status) => {
    expect(
      agentSubmissionDeletionDecision({ ...submission(), status }, "agent-1"),
    ).toMatchObject({ ok: false, reason: "status" });
  });

  it("collects only unique browser-local media paths", () => {
    const draft = submission();
    const [first, second] = draft.files;
    if (!first || !second) throw new Error("expected local draft media slots");

    expect(
      localDemoMediaPathsForSubmission({
        ...draft,
        files: [
          { ...first, localDemoMediaStored: true, storagePath: "local/a.jpg" },
          { ...second, localDemoMediaStored: true, storagePath: "local/a.jpg" },
          { ...second, storagePath: "remote/b.jpg" },
        ],
      }),
    ).toEqual(["local/a.jpg"]);
  });
});
