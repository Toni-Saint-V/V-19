// tests/unit/aiEdgeClient.spec.ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildSafeAiHelperStubResult,
  type AiHelperActor,
} from "../../supabase/functions/_shared/ai-helper-contract";
import {
  aiHelperRequestCacheKey,
  clearAiHelperEdgeCache,
  invokeAiHelperEdge,
  invokeAiHelperEdgeCached,
} from "../../src/services/aiEdgeClient";

const mocks = vi.hoisted(() => ({
  client: null as null | {
    functions: {
      invoke: ReturnType<typeof vi.fn>;
    };
  },
  invoke: vi.fn(),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => mocks.client,
}));

const actor: AiHelperActor = {
  id: "agent-1",
  role: "agent",
  canUseAI: true,
};

describe("AI edge client contract", () => {
  beforeEach(() => {
    clearAiHelperEdgeCache();
    mocks.invoke.mockReset();
    mocks.client = {
      functions: {
        invoke: mocks.invoke,
      },
    };
  });

  test("returns null when Supabase is not configured", async () => {
    mocks.client = null;

    await expect(
      invokeAiHelperEdge("readiness_summary", { submissionId: "VF-1" }, actor),
    ).resolves.toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  test("sends an actor-scoped request and parses the edge result", async () => {
    mocks.invoke.mockResolvedValue({
      data: buildSafeAiHelperStubResult("readiness_summary", "edge-stub"),
      error: null,
    });

    await expect(
      invokeAiHelperEdge("readiness_summary", { submissionId: "VF-1" }, actor),
    ).resolves.toMatchObject({
      intent: "readiness_summary",
      source: "edge-stub",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("ai-helper", {
      body: {
        intent: "readiness_summary",
        context: { submissionId: "VF-1" },
        actor,
      },
    });
    expect(JSON.stringify(mocks.invoke.mock.calls)).not.toMatch(
      /AI_HELPER|LITELLM|OLLAMA|qwen2\.5|provider/i,
    );
  });

  test("rejects unsafe edge output before UI consumption", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ...buildSafeAiHelperStubResult("readiness_summary", "edge-stub"),
        summary: "The helper can estimate approval odds.",
      },
      error: null,
    });

    await expect(invokeAiHelperEdge("readiness_summary", {}, actor)).rejects.toThrow(
      "AI helper result failed safety validation.",
    );
  });

  test("uses a stable cache key regardless of object key order", () => {
    const left = aiHelperRequestCacheKey(
      "admin_review",
      { b: 2, nested: { z: true, a: undefined }, a: 1 },
      actor,
    );
    const right = aiHelperRequestCacheKey(
      "admin_review",
      { a: 1, nested: { a: undefined, z: true }, b: 2 },
      actor,
    );

    expect(left).toBe(right);
    expect(left).toMatch(/^ai-[0-9a-f]{16}$/u);
    expect(left).not.toContain("admin_review");
    expect(left).not.toContain("applicantCount");
  });

  test("caches a safe result and deduplicates repeated free-tier calls", async () => {
    mocks.invoke.mockResolvedValue({
      data: buildSafeAiHelperStubResult("admin_review", "edge-stub"),
      error: null,
    });
    const context = { applicantCount: 2, openIssueCount: 1 };

    const first = await invokeAiHelperEdgeCached("admin_review", context, actor, {
      ttlMs: 60_000,
    });
    const second = await invokeAiHelperEdgeCached(
      "admin_review",
      { openIssueCount: 1, applicantCount: 2 },
      actor,
      { ttlMs: 60_000 },
    );

    expect(first).toEqual(second);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  test("deduplicates concurrent requests with the same sanitized context", async () => {
    let resolveInvoke:
      | ((value: {
          data: ReturnType<typeof buildSafeAiHelperStubResult>;
          error: null;
        }) => void)
      | undefined;
    mocks.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve;
        }),
    );

    const requestA = invokeAiHelperEdgeCached(
      "admin_review",
      { applicantCount: 1 },
      actor,
    );
    const requestB = invokeAiHelperEdgeCached(
      "admin_review",
      { applicantCount: 1 },
      actor,
    );

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    resolveInvoke?.({
      data: buildSafeAiHelperStubResult("admin_review", "edge-stub"),
      error: null,
    });

    await expect(Promise.all([requestA, requestB])).resolves.toHaveLength(2);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  test("briefly negative-caches an unavailable provider", async () => {
    mocks.client = null;

    await expect(
      invokeAiHelperEdgeCached("admin_review", { applicantCount: 1 }, actor),
    ).resolves.toBeNull();
    mocks.client = {
      functions: {
        invoke: mocks.invoke,
      },
    };
    await expect(
      invokeAiHelperEdgeCached("admin_review", { applicantCount: 1 }, actor),
    ).resolves.toBeNull();

    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
