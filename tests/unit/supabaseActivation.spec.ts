import { describe, expect, test } from "vitest";
import {
  evaluateSupabaseActivationReadiness,
  selectSupabaseBackend,
  type SupabaseActivationConfig,
  type SupabaseActivationEvidence,
} from "../../src/lib/supabase/activation";

const validConfig: SupabaseActivationConfig = {
  projectId: "vf19-sandbox",
  url: "https://vf19.supabase.co",
  publishableKey: "sb_publishable_demo_key",
  edgeFunctionsUrl: "https://vf19.functions.supabase.co",
};

const sandboxEvidence: SupabaseActivationEvidence = {
  target: "sandbox",
  migrationApproval: true,
  migrationsApplied: true,
  rlsPolicyTestsPassed: true,
  storagePolicyTestsPassed: true,
  edgeFunctionDryRunsPassed: true,
  browserQaPassed: true,
  browserKeyAudited: true,
};

describe("Supabase activation gate", () => {
  test("fails closed when project configuration is missing", () => {
    const readiness = evaluateSupabaseActivationReadiness({});

    expect(readiness.ready).toBe(false);
    expect(readiness.allowClientActivation).toBe(false);
    expect(readiness.state).toBe("missing-config");
    expect(readiness.missing.map((item) => item.id)).toContain("project-config");
  });

  test("treats placeholders as non-configured values", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      ...validConfig,
      projectId: "CHANGE_ME",
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.state).toBe("placeholder-config");
    expect(readiness.configValues.projectId).toBe("placeholder");
    expect(readiness.configured.projectId).toBe(false);
  });

  test("blocks a configured target until evidence gates pass", () => {
    const readiness = evaluateSupabaseActivationReadiness(validConfig);

    expect(readiness.ready).toBe(false);
    expect(readiness.state).toBe("contract-only");
    expect(readiness.warnings.join(" ")).toMatch(/evidence gates/i);
    expect(readiness.missing.map((item) => item.id)).toEqual([
      "migration-approval",
      "migrations-applied",
      "rls-policy-tests",
      "storage-policy-tests",
      "edge-function-dry-runs",
      "browser-qa",
      "browser-key-audit",
    ]);
  });

  test("allows sandbox activation only when evidence and release switch are present", () => {
    const blocked = selectSupabaseBackend({
      target: "supabase",
      releaseSwitch: false,
      runtimeAdapter: "client",
      supabase: validConfig,
      evidence: sandboxEvidence,
    });
    const selected = selectSupabaseBackend({
      target: "supabase",
      releaseSwitch: true,
      runtimeAdapter: "client",
      supabase: validConfig,
      evidence: sandboxEvidence,
    });

    expect(blocked.selected).toBe("local-demo");
    expect(blocked.blockedReasons).toContain("release switch is off");
    expect(selected.selected).toBe("supabase");
    expect(selected.readiness.state).toBe("sandbox-ready");
    expect(selected.blockedReasons).toEqual([]);
  });

  test("requires explicit approval for production activation", () => {
    const withoutApproval = evaluateSupabaseActivationReadiness(validConfig, {
      ...sandboxEvidence,
      target: "production",
    });
    const withApproval = evaluateSupabaseActivationReadiness(validConfig, {
      ...sandboxEvidence,
      target: "production",
      productionApproval: true,
    });

    expect(withoutApproval.ready).toBe(false);
    expect(withoutApproval.missing.map((item) => item.id)).toContain(
      "production-approval",
    );
    expect(withApproval.ready).toBe(true);
    expect(withApproval.state).toBe("production-ready");
  });
});
