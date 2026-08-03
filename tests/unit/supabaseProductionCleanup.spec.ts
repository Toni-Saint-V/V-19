import { describe, expect, test, vi } from "vitest";

import {
  cleanupProductionWorkflowFixtures,
  productionWorkflowFailureMessage,
} from "../../scripts/lib/supabase-production-cleanup.mjs";

function cleanupClient(
  options: { deleteError?: Error; rowStillExists?: boolean } = {},
) {
  const predicates: Array<{
    column: string;
    id: string;
    mode: "delete" | "readback";
    table: string;
  }> = [];
  const client = {
    storage: {
      from: vi.fn(() => ({
        list: vi.fn(async () => ({ data: [], error: null })),
        remove: vi.fn(async () => ({
          data: null,
          error: options.deleteError ?? null,
        })),
      })),
    },
    from: vi.fn((table: string) => ({
      delete: () => ({
        eq: async (column: string, id: string) => {
          predicates.push({ column, id, mode: "delete", table });
          return { data: null, error: options.deleteError ?? null };
        },
      }),
      select: () => ({
        eq: (column: string, id: string) => ({
          limit: async () => {
            predicates.push({ column, id, mode: "readback", table });
            return {
              data: options.rowStillExists ? [{ id }] : [],
              error: null,
            };
          },
        }),
      }),
    })),
  };
  return { client, predicates };
}

describe("Supabase production workflow cleanup", () => {
  test("uses id for submissions, submission_id for children, and reads back every target", async () => {
    const { client, predicates } = cleanupClient();
    await cleanupProductionWorkflowFixtures({
      bucket: "submission-media",
      client,
      cleanupPaths: new Set(["submission/asset.jpg"]),
      submissionIds: ["submission"],
    });

    expect(predicates.filter((entry) => entry.table === "submissions")).toEqual([
      { column: "id", id: "submission", mode: "delete", table: "submissions" },
      { column: "id", id: "submission", mode: "readback", table: "submissions" },
    ]);
    expect(
      predicates
        .filter((entry) => entry.table !== "submissions")
        .every((entry) => entry.column === "submission_id"),
    ).toBe(true);
    expect(predicates.filter((entry) => entry.mode === "readback")).toHaveLength(5);
  });

  test("fails closed on Supabase cleanup errors or surviving rows", async () => {
    const errorClient = cleanupClient({ deleteError: new Error("denied") }).client;
    await expect(
      cleanupProductionWorkflowFixtures({
        bucket: "submission-media",
        client: errorClient,
        cleanupPaths: new Set(),
        submissionIds: ["submission"],
      }),
    ).rejects.toThrow(/Production smoke cleanup failed:.*denied/);

    const survivingClient = cleanupClient({ rowStillExists: true }).client;
    await expect(
      cleanupProductionWorkflowFixtures({
        bucket: "submission-media",
        client: survivingClient,
        cleanupPaths: new Set(),
        submissionIds: ["submission"],
      }),
    ).rejects.toThrow(/row still exists/);
  });

  test("preserves both the primary workflow failure and cleanup/readback failure", () => {
    expect(
      productionWorkflowFailureMessage(
        new Error("agent write failed"),
        new Error("storage object still exists"),
      ),
    ).toBe(
      "Primary workflow failure: agent write failed; cleanup/readback failure: storage object still exists",
    );
    expect(productionWorkflowFailureMessage(new Error("agent write failed"))).toBe(
      "agent write failed",
    );
  });
});
