import { describe, expect, test } from "vitest";
import {
  evaluateSupabaseActivationReadiness,
  type SupabaseActivationConfig,
  type SupabaseActivationEvidence,
} from "../../src/lib/supabase/activation";

const completeConfig: SupabaseActivationConfig = {
  projectId: "sandbox-project",
  url: "https://sandbox-project.supabase.co",
  publishableKey: "sb_publishable_test",
  edgeFunctionsUrl: "https://sandbox-project.functions.supabase.co",
};

const completeEvidence: SupabaseActivationEvidence = {
  target: "sandbox",
  activationTargetDeclared: true,
  transactionalPersistenceTested: true,
  migrationApproved: true,
  migrationsApplied: true,
  rlsPolicyTestsPassed: true,
  storagePolicyTestsPassed: true,
  edgeFunctionDryRunsPassed: true,
  browserQaPassed: true,
  browserKeyAudited: true,
  productionApproved: false,
};

describe("Supabase activation gate", () => {
  test("keeps local-demo inactive even when config exists", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      target: "local-demo",
      releaseEnabled: true,
      config: completeConfig,
      evidence: completeEvidence,
    });

    expect(readiness.state).toBe("local-demo");
    expect(readiness.allowClientActivation).toBe(false);
    expect(readiness.blockedReasons).toEqual([]);
  });

  test("blocks URL/key-only Supabase config without evidence", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      target: "supabase",
      releaseEnabled: false,
      config: completeConfig,
      evidence: {
        ...completeEvidence,
        migrationApproved: false,
        migrationsApplied: false,
        rlsPolicyTestsPassed: false,
        storagePolicyTestsPassed: false,
        edgeFunctionDryRunsPassed: false,
        browserQaPassed: false,
        browserKeyAudited: false,
      },
    });

    expect(readiness.state).toBe("contract-only");
    expect(readiness.allowClientActivation).toBe(false);
    expect(readiness.missing.map((item) => item.id)).toContain("release-switch");
    expect(readiness.missing.map((item) => item.id)).toContain("rls-policy-tests");
  });

  test("keeps placeholder config blocked", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      target: "supabase",
      releaseEnabled: true,
      config: {
        ...completeConfig,
        projectId: "CHANGE_ME",
      },
      evidence: completeEvidence,
    });

    expect(readiness.state).toBe("placeholder-config");
    expect(readiness.allowClientActivation).toBe(false);
    expect(readiness.configValues.projectId).toBe("placeholder");
  });

  test("allows sandbox only after all non-production evidence passes", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      target: "supabase",
      releaseEnabled: true,
      config: completeConfig,
      evidence: completeEvidence,
    });

    expect(readiness.state).toBe("sandbox-ready");
    expect(readiness.allowClientActivation).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  test("blocks Supabase target when activation target is not explicit", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      target: "supabase",
      releaseEnabled: true,
      config: completeConfig,
      evidence: {
        ...completeEvidence,
        activationTargetDeclared: false,
      },
    });

    expect(readiness.allowClientActivation).toBe(false);
    expect(readiness.missing.map((item) => item.id)).toContain("activation-target");
  });

  test("blocks Supabase target until transactional persistence is tested", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      target: "supabase",
      releaseEnabled: true,
      config: completeConfig,
      evidence: {
        ...completeEvidence,
        transactionalPersistenceTested: false,
      },
    });

    expect(readiness.allowClientActivation).toBe(false);
    expect(readiness.missing.map((item) => item.id)).toContain(
      "transactional-persistence",
    );
  });

  test("requires explicit approval for production activation", () => {
    const readiness = evaluateSupabaseActivationReadiness({
      target: "supabase",
      releaseEnabled: true,
      config: completeConfig,
      evidence: {
        ...completeEvidence,
        target: "production",
        productionApproved: false,
      },
    });

    expect(readiness.allowClientActivation).toBe(false);
    expect(readiness.missing.map((item) => item.id)).toContain("production-approval");
  });
});
