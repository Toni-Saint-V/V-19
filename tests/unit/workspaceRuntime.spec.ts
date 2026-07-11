import { describe, expect, test } from "vitest";
import {
  canRefreshVisibleWorkspace,
  isLatestWorkspaceResponse,
  shouldBlockLocalDemoDataSource,
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

  test("maps loaded Supabase result counts to deterministic UI states", () => {
    expect(workspaceDataState(0)).toBe("empty");
    expect(workspaceDataState(1)).toBe("ready");
  });
});
