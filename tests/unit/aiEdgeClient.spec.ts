import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildSafeAiHelperStubResult,
  type AiHelperActor,
} from "../../supabase/functions/_shared/ai-helper-contract";
import { invokeAiHelperEdge } from "../../src/services/aiEdgeClient";

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
});
