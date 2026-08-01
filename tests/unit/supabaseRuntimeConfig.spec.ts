import { describe, expect, test } from "vitest";

import {
  bindActivationToCanonicalProductionTarget,
  productionTargetConfigIssues,
  resolveSupabaseBackendTarget,
} from "../../src/lib/supabase/config";

describe("Supabase runtime target selection", () => {
  test("starts a clean development checkout in local-demo mode", () => {
    expect(resolveSupabaseBackendTarget(undefined)).toBe("local-demo");
    expect(resolveSupabaseBackendTarget("")).toBe("local-demo");
  });

  test("requires an explicit exact Supabase target before enabling the client", () => {
    expect(resolveSupabaseBackendTarget("legacy")).toBe("local-demo");
    expect(resolveSupabaseBackendTarget("supabase")).toBe("supabase");
  });

  test("blocks a legacy or mismatched production project", () => {
    expect(
      productionTargetConfigIssues({
        activationTarget: "production",
        projectId: "legacy-project",
        url: "https://legacy-project.supabase.co",
      }),
    ).toHaveLength(2);
    expect(
      productionTargetConfigIssues({
        activationTarget: "production",
        projectId: "mqhjiaymoarpzzjfefno",
        url: "https://mqhjiaymoarpzzjfefno.supabase.co",
      }),
    ).toEqual([]);
  });

  test("does not apply the production descriptor to sandbox probes", () => {
    expect(
      productionTargetConfigIssues({
        activationTarget: "sandbox",
        projectId: "sandbox-project",
        url: "https://sandbox-project.supabase.co",
      }),
    ).toEqual([]);
  });

  test("prevents a mismatched production target from activating the client", () => {
    const activation = bindActivationToCanonicalProductionTarget(
      {
        target: "production",
        ready: true,
        allowClientActivation: true,
        allowSandboxProbe: false,
        state: "production-ready",
        missing: [],
        warnings: [],
        blockedReasons: [],
        configured: {
          projectId: true,
          url: true,
          publishableKey: true,
          edgeFunctionsUrl: true,
        },
        configValues: {
          projectId: "configured",
          url: "configured",
          publishableKey: "configured",
          edgeFunctionsUrl: "configured",
        },
        boundary: "ready",
      },
      ["mismatched production target"],
    );

    expect(activation.ready).toBe(false);
    expect(activation.allowClientActivation).toBe(false);
    expect(activation.allowSandboxProbe).toBe(false);
    expect(activation.blockedReasons).toContain("mismatched production target");
  });
});
