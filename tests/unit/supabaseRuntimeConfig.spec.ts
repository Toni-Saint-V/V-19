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
        edgeFunctionsUrl: "https://legacy-project.supabase.co/functions/v1",
        cutoverGeneration: "stale-generation",
      }),
    ).toHaveLength(4);
    expect(
      productionTargetConfigIssues({
        activationTarget: "production",
        projectId: "pwaasuqljxeypeqhvzqs",
        url: "https://pwaasuqljxeypeqhvzqs.supabase.co",
        edgeFunctionsUrl: "https://pwaasuqljxeypeqhvzqs.supabase.co/functions/v1",
        cutoverGeneration: "v19-supabase-clean-cutover-20260802-g5",
      }),
    ).toEqual([]);
  });

  test("blocks stale production evidence for the same project", () => {
    expect(
      productionTargetConfigIssues({
        activationTarget: "production",
        projectId: "pwaasuqljxeypeqhvzqs",
        url: "https://pwaasuqljxeypeqhvzqs.supabase.co",
        edgeFunctionsUrl: "https://pwaasuqljxeypeqhvzqs.supabase.co/functions/v1",
        cutoverGeneration: "v19-supabase-cutover-20260801-g2",
      }),
    ).toEqual([
      "Supabase production cutover generation does not match the canonical target.",
    ]);
  });

  test("does not apply the production descriptor to sandbox probes", () => {
    expect(
      productionTargetConfigIssues({
        activationTarget: "sandbox",
        projectId: "sandbox-project",
        url: "https://sandbox-project.supabase.co",
        edgeFunctionsUrl: "https://sandbox-project.supabase.co/functions/v1",
        cutoverGeneration: "",
      }),
    ).toEqual([]);
  });

  test("blocks the canonical production project when relabeled as sandbox", () => {
    const issues = productionTargetConfigIssues({
      activationTarget: "sandbox",
      projectId: "pwaasuqljxeypeqhvzqs",
      url: "https://pwaasuqljxeypeqhvzqs.supabase.co",
      edgeFunctionsUrl: "https://pwaasuqljxeypeqhvzqs.supabase.co/functions/v1",
      cutoverGeneration: "",
    });

    expect(issues).toEqual([
      "The canonical Supabase production target must declare production activation.",
      "Supabase production cutover generation does not match the canonical target.",
    ]);

    const activation = bindActivationToCanonicalProductionTarget(
      {
        target: "sandbox",
        ready: false,
        allowClientActivation: false,
        allowSandboxProbe: true,
        state: "sandbox-ready",
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
      issues,
    );

    expect(activation.allowSandboxProbe).toBe(false);
    expect(activation.blockedReasons).toEqual(issues);
  });

  test("blocks normalized production origins relabeled as sandbox", () => {
    const issues = productionTargetConfigIssues({
      activationTarget: "sandbox",
      projectId: "sandbox-label",
      url: "https://pwaasuqljxeypeqhvzqs.supabase.co/",
      edgeFunctionsUrl: "https://pwaasuqljxeypeqhvzqs.supabase.co/functions/v1/",
      cutoverGeneration: "stale-generation",
    });

    expect(issues).toContain(
      "The canonical Supabase production target must declare production activation.",
    );
    expect(issues).toContain(
      "Supabase production Edge Functions URL does not match the canonical target.",
    );
  });

  test("blocks a trailing-dot production hostname relabeled as sandbox", () => {
    expect(
      productionTargetConfigIssues({
        activationTarget: "sandbox",
        projectId: "sandbox-label",
        url: "https://pwaasuqljxeypeqhvzqs.supabase.co./",
        edgeFunctionsUrl: "https://sandbox-project.supabase.co/functions/v1",
        cutoverGeneration: "",
      }),
    ).not.toEqual([]);
  });

  test("blocks a canonical production Edge Functions origin in sandbox mode", () => {
    expect(
      productionTargetConfigIssues({
        activationTarget: "sandbox",
        projectId: "sandbox-project",
        url: "https://sandbox-project.supabase.co",
        edgeFunctionsUrl: "https://pwaasuqljxeypeqhvzqs.supabase.co/functions/v1",
        cutoverGeneration: "",
      }),
    ).not.toEqual([]);
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
