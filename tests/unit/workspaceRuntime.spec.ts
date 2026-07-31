import { describe, expect, test } from "vitest";
import {
  canRefreshVisibleWorkspace,
  isLatestWorkspaceResponse,
  shouldRequestWorkspaceRefresh,
  shouldBlockLocalDemoDataSource,
  waitForWorkspaceMutationQueueDrain,
  workspaceDataState,
  workspaceRefreshIntervalMs,
} from "../../src/lib/supabase/workspaceRuntime";

describe("workspace runtime production guard", () => {
  test("fails closed instead of falling back to local demo when Supabase target is selected but blocked", () => {
    expect(
      shouldBlockLocalDemoDataSource({
        selected: "local-demo",
        target: "supabase",
      }),
    ).toBe(true);
  });

  test("keeps explicit local demo available only when it is the selected target", () => {
    expect(
      shouldBlockLocalDemoDataSource({
        selected: "local-demo",
        target: "local-demo",
      }),
    ).toBe(false);
  });

  test("blocks every non-Supabase selection in a production-only build", () => {
    expect(
      shouldBlockLocalDemoDataSource(
        { selected: "local-demo", target: "local-demo" },
        false,
      ),
    ).toBe(true);
  });

  test("refresh cadence is no slower than the 10 second production E2E contract", () => {
    expect(workspaceRefreshIntervalMs).toBeLessThanOrEqual(10_000);
  });

  test("refreshes only visible tabs and ignores stale responses", () => {
    expect(canRefreshVisibleWorkspace("visible")).toBe(true);
    expect(canRefreshVisibleWorkspace("hidden")).toBe(false);
    expect(isLatestWorkspaceResponse(3, 3)).toBe(true);
    expect(isLatestWorkspaceResponse(2, 3)).toBe(false);
  });

  test("opens the automatic refresh circuit only for a confirmed service restriction", () => {
    expect(shouldRequestWorkspaceRefresh("interval", true)).toBe(false);
    expect(shouldRequestWorkspaceRefresh("recovery", true)).toBe(true);
    expect(shouldRequestWorkspaceRefresh("interval", false)).toBe(true);
  });

  test("maps loaded Supabase result counts to deterministic UI states", () => {
    expect(workspaceDataState(0)).toBe("empty");
    expect(workspaceDataState(1)).toBe("ready");
  });

  test("bounds cross-session queue draining without treating a rejection as pending", async () => {
    const neverSettles = new Promise<void>(() => undefined);

    await expect(
      waitForWorkspaceMutationQueueDrain(neverSettles, 0),
    ).resolves.toBe("timed_out");
    await expect(
      waitForWorkspaceMutationQueueDrain(Promise.reject(new Error("stale")), 100),
    ).resolves.toBe("settled");
  });
});
