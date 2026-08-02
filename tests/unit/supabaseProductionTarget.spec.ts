import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import { SUPABASE_SANDBOX_TARGET } from "../../config/supabase-sandbox-target.mjs";
import { forbiddenProductionReadinessMarkers } from "../../scripts/lib/supabase-readiness-contract.mjs";
import {
  migrationContractEntriesFromFileSystem,
  requiredMigrationOrder,
  requiredRemoteMigrationOrderForGeneration,
} from "../../scripts/supabase-migration-contract.mjs";

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
      projectId: "pwaasuqljxeypeqhvzqs",
      projectUrl: "https://pwaasuqljxeypeqhvzqs.supabase.co",
      cutoverGeneration: "v19-supabase-clean-cutover-20260802-g5",
      baselineGitSha: "8658e26ac0c6abf0c4ebe14727fa7b30d83bf774",
      evidenceNotBefore: "2026-08-02T00:00:00.000Z",
      maxEvidenceAgeMs: 86_400_000,
      ownerApprovalPublicKeySha256: "",
      requiredCleanDataState: {
        authUserCount: 1,
        confirmedAuthUserCount: 1,
        profileCount: 1,
        adminProfileCount: 1,
        agentProfileCount: 0,
        orphanAuthUsersWithoutProfileCount: 0,
        orphanProfilesWithoutAuthCount: 0,
      },
      requiredEdgeFunctions: ["access-request", "ai-helper", "passport-extract"],
      requiredEdgeFunctionCapabilities: {
        "access-request": "registration-ready",
        "ai-helper": "provider-ready",
        "passport-extract": "manual-review-fallback",
      },
      requiredEdgeFunctionSemanticActions: {
        "access-request": "registration-request-persisted-and-read-back",
        "ai-helper": "quota-audit-inference-read-back",
        "passport-extract": "extraction-audit-and-result-read-back",
      },
      requiredEdgeFunctionSecretNames: [
        "SUPABASE_FUNCTION_ADMIN_KEY",
        "AI_HELPER_QUOTA_RPC",
        "AI_HELPER_RUNTIME_ENV",
        "AI_HELPER_PROVIDER_MODE",
        "AI_HELPER_LITELLM_BASE_URL",
        "AI_HELPER_LITELLM_API_KEY",
        "AI_HELPER_LITELLM_MODEL_GENERAL",
      ],
      requiredEmptyPublicTables: [
        "access_requests",
        "admin_pdf_artifacts",
        "agent_return_package_artifacts",
        "agent_return_packages",
        "ai_helper_audit_events",
        "ai_helper_quota_counters",
        "ai_helper_quota_receipts",
        "applicants",
        "appointments",
        "corrections",
        "document_assets",
        "document_export_events",
        "export_batch_members",
        "export_batches",
        "media_assets",
        "passport_extraction_openai_attempts",
        "questionnaire_answers",
        "returned_pdf_handoff_artifacts",
        "status_history",
        "submission_files",
        "submissions",
      ],
      requiredStorageBuckets: [
        "agent-return-packages",
        "submission-files",
        "submission-media",
      ],
      requiredAdminOnlyProductionEvidence: [
        "adminSignInWorks",
        "adminCanonicalReadbackPassed",
        "adminReloadReadbackPassed",
        "agentSignInWorks",
        "agentCreateWriteReadbackPassed",
        "agentReloadReadbackPassed",
        "secondAgentSignInWorks",
        "secondAgentBrowserIsolationPassed",
        "adminReadsAgentRecordPassed",
        "crossAgentDatabaseReadDenied",
        "crossAgentStorageReadDenied",
        "agentStorageWriteReadbackPassed",
        "agentStorageReloadReadbackPassed",
        "authenticatedRoleEscalationDenied",
        "anonymousDatabaseWriteDenied",
        "storageWriteReadbackPassed",
        "privateMediaAnonymousIsolationPassed",
        "migrationsApplied",
        "remoteMigrationHistoryReadbackPassed",
        "browserQaPassed",
        "deploymentIdentityPassed",
      ],
      requiredAdminOnlyEvidenceArtifacts: {
        localVerification: {
          scope: "supabase-production-local-verification",
          checks: [
            "typecheckPassed",
            "lintPassed",
            "fullTestSuitePassed",
            "buildPassed",
            "verifyAuthDataReadinessPassed",
            "verifySupabaseReleasePassed",
            "finalDiffReviewed",
          ],
        },
        remoteMigrationHistory: {
          scope: "supabase-production-remote-migration-history",
          checks: ["migrationsApplied", "remoteMigrationHistoryReadbackPassed"],
        },
        adminBrowserFlow: {
          scope: "supabase-production-admin-browser-flow",
          checks: ["adminSignInWorks", "adminReloadReadbackPassed", "browserQaPassed"],
        },
        agentBrowserFlow: {
          scope: "supabase-production-agent-browser-flow",
          checks: [
            "agentSignInWorks",
            "agentReloadReadbackPassed",
            "secondAgentSignInWorks",
            "secondAgentBrowserIsolationPassed",
            "browserQaPassed",
          ],
        },
        agentDatabaseReadback: {
          scope: "supabase-production-agent-database-readback",
          checks: [
            "agentCreateWriteReadbackPassed",
            "adminReadsAgentRecordPassed",
            "crossAgentDatabaseReadDenied",
            "authenticatedRoleEscalationDenied",
          ],
        },
        agentStorageReadback: {
          scope: "supabase-production-agent-storage-readback",
          checks: [
            "agentStorageWriteReadbackPassed",
            "agentStorageReloadReadbackPassed",
            "crossAgentStorageReadDenied",
          ],
        },
        adminDatabaseReadback: {
          scope: "supabase-production-admin-database-readback",
          checks: ["adminCanonicalReadbackPassed", "anonymousDatabaseWriteDenied"],
        },
        adminStorageReadback: {
          scope: "supabase-production-admin-storage-readback",
          checks: [
            "storageWriteReadbackPassed",
            "privateMediaAnonymousIsolationPassed",
          ],
        },
        deploymentIdentity: {
          scope: "vercel-production-release-identity",
          checks: ["deploymentIdentityPassed"],
        },
      },
    });
  });

  test("binds executable target consumers to the canonical descriptor", () => {
    for (const path of productionTargetConsumers) {
      const content = read(path);
      expect(content, path).toContain("SUPABASE_PRODUCTION_TARGET");
    }
  });

  test("keeps destructive smoke fail-closed until a dedicated sandbox is assigned", () => {
    expect(SUPABASE_SANDBOX_TARGET).toEqual({
      schemaVersion: 1,
      projectId: "",
      projectUrl: "",
      generation: "unassigned",
    });
  });

  test("binds clean cutover remote history to the current generation", () => {
    expect(
      requiredRemoteMigrationOrderForGeneration(
        SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      ),
    ).toEqual(requiredMigrationOrder.map((fileName) => fileName.replace(/\.sql$/, "")));
    expect(requiredRemoteMigrationOrderForGeneration("unknown-generation")).toEqual([]);
  });

  test("rejects any migration outside the exact declared inventory", () => {
    const root = mkdtempSync(resolve(tmpdir(), "v19-migration-inventory-"));
    const migrationsDir = resolve(root, "supabase/migrations");
    mkdirSync(migrationsDir, { recursive: true });
    for (const fileName of requiredMigrationOrder) {
      writeFileSync(resolve(migrationsDir, fileName), "select 1;\n");
    }
    expect(migrationContractEntriesFromFileSystem(root)).toHaveLength(
      requiredMigrationOrder.length,
    );
    writeFileSync(
      resolve(migrationsDir, "20990101000000_undeclared.sql"),
      "select 2;\n",
    );
    expect(() => migrationContractEntriesFromFileSystem(root)).toThrow(
      /migration inventory mismatch.*unexpected=20990101000000_undeclared.sql/i,
    );
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
        scope: "supabase-production-clean-cutover",
      },
    });
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
    for (const path of [
      "scripts/manage-supabase-production-migrations.mjs",
      "scripts/manage-supabase-production-functions.mjs",
      "scripts/verify-supabase-production-workflow.mjs",
      "scripts/provision-supabase-pilot-cohort.mjs",
    ]) {
      expect(read(path), path).toContain("assertProductionMutationAllowed");
      expect(read(path), path).toContain("productionApprovalPacketPath");
    }
    const mutationGate = read("scripts/lib/supabase-production-mutation-gate.mjs");
    expect(mutationGate).toContain("SUPABASE_PRODUCTION_APPROVAL_PACKET_PATH");
    expect(mutationGate).toContain("must be outside the repository");
    expect(mutationGate).toContain("working tree must be clean");
    expect(mutationGate).toContain("filesystem source differs from Git HEAD");
    expect(mutationGate).toContain("successful migration dry-run evidence is absent");
    expect(mutationGate).toContain("migration dry-run receipt exact contract mismatch");
    expect(mutationGate).toContain(
      "owner approval public-key fingerprint is not configured",
    );
    const functionManager = read("scripts/manage-supabase-production-functions.mjs");
    expect(functionManager).toContain("semanticChecksPassed = false");
    expect(functionManager).toContain("sourceIdentityBound = false");
    expect(read("scripts/manage-supabase-production-migrations.mjs")).toContain(
      "Migration apply is disabled until post-success immutable remote-history reconciliation is implemented.",
    );
    const cleanupHelper = read("scripts/lib/supabase-production-cleanup.mjs");
    expect(cleanupHelper).toContain("Production smoke cleanup failed");
    expect(cleanupHelper).toContain("result?.error");
    const vercelIdentity = read("scripts/verify-vercel-release-identity.mjs");
    expect(read("scripts/lib/vercel-release-identity.mjs")).toContain(
      "identity?.dirty === false",
    );
    expect(vercelIdentity).toContain("observedDirty: identity?.dirty ?? null");
  });

  test("routes every role-isolation blocker to the browser evidence artifact", () => {
    const readinessVerifier = read("scripts/verify-production-readiness.mjs");
    for (const check of [
      "secondAgentBrowserIsolationPassed",
      "agentStorageWriteReadbackPassed",
      "agentStorageReloadReadbackPassed",
      "anonymousDatabaseWriteDenied",
    ]) {
      expect(readinessVerifier).toContain(check);
    }
    expect(readinessVerifier).toContain(
      'testArtifactPath("supabase-production-role-isolation-runtime.json")',
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
