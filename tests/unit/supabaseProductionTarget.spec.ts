import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import { forbiddenProductionReadinessMarkers } from "../../scripts/lib/supabase-readiness-contract.mjs";

const productionTargetConsumers = [
  "config/playwright/playwright.supabase-production-ui.config.ts",
  "scripts/reconcile-production-cohort.mjs",
  "scripts/prepare-supabase-production-packet.mjs",
  "scripts/provision-supabase-pilot-cohort.mjs",
  "scripts/verify-agent-interaction-evidence.mjs",
  "scripts/verify-production-readiness.mjs",
  "scripts/verify-pilot-volume-envelope.mjs",
  "scripts/verify-supabase-production-ui-e2e.mjs",
  "scripts/verify-supabase-production-workflow.mjs",
  "tests/e2e-supabase-ui/production-cohort-helpers.ts",
  "tests/e2e-supabase/browser-key-audit.spec.ts",
  "tests/unit/agentInteractionProductionEvidenceVerifier.spec.ts",
  "src/lib/supabase/config.ts",
] as const;

function read(relativePath: string): string {
  return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
}

describe("Supabase production target", () => {
  test("binds the current cutover generation to one non-secret descriptor", () => {
    expect(SUPABASE_PRODUCTION_TARGET).toEqual({
      schemaVersion: 1,
      projectId: "tsymifccglpepvbmrcgh",
      projectUrl: "https://tsymifccglpepvbmrcgh.supabase.co",
      cutoverGeneration: "v19-supabase-reactivation-20260802-g4",
      baselineGitSha: "1c05cb316c42178a9ffe0be84c394b1b0e6a5729",
      evidenceNotBefore: "2026-08-02T00:00:00.000Z",
    });
  });

  test("removes abandoned alternate project refs from executable target consumers", () => {
    const abandonedProjectRefs = [
      ["mqhjiaym", "oarpzzjfefno"].join(""),
      ["pwaasuql", "jxeypeqhvzqs"].join(""),
    ];

    for (const path of productionTargetConsumers) {
      const content = read(path);
      expect(content, path).toContain("SUPABASE_PRODUCTION_TARGET");
      for (const projectRef of abandonedProjectRefs) {
        expect(content, path).not.toContain(projectRef);
      }
    }
  });

  test("resets production readiness without inheriting legacy approvals", () => {
    const readiness = JSON.parse(
      read("docs/release/supabase-production-readiness.json"),
    ) as {
      status?: string;
      phase?: string;
      productionTarget?: { projectId?: string; cutoverGeneration?: string };
      deploymentGate?: Record<string, boolean | string[]>;
      goNoGo?: { decision?: string; scope?: string };
    };

    expect(readiness).toMatchObject({
      status: "NO_GO",
      phase: "awaiting-fresh-evidence",
      productionTarget: {
        projectId: SUPABASE_PRODUCTION_TARGET.projectId,
        cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      },
      deploymentGate: {
        deployApproved: false,
        cutoverApproved: false,
        productionMutationApproved: false,
      },
      goNoGo: {
        decision: "NO_GO",
        scope: "supabase-production-reactivation",
      },
    });

    expect(read("docs/release/supabase-production-readiness.json")).not.toContain(
      ["pwaasuql", "jxeypeqhvzqs"].join(""),
    );
  });

  test("keeps every production operator pinned before local or remote writes", () => {
    expect(read("scripts/provision-supabase-pilot-cohort.mjs")).toContain(
      "productionTargetMatchesDescriptor()",
    );
    expect(read("scripts/prepare-supabase-production-packet.mjs")).toContain(
      "Refusing to write production files for a non-canonical target.",
    );
    expect(read("scripts/verify-pilot-volume-envelope.mjs")).toContain(
      "read-only cap check target matches canonical descriptor",
    );
  });

  test("rejects forbidden secret markers for schema-v2 readiness", () => {
    expect(forbiddenProductionReadinessMarkers('{"status":"NO_GO"}')).toEqual([]);
    expect(
      forbiddenProductionReadinessMarkers(
        '{"scope":"supabase-production-cutover","SUPABASE_SERVICE_ROLE_KEY":"x"}',
      ),
    ).not.toEqual([]);
  });
});
