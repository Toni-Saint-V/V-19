import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const verifierPath = resolve(
  process.cwd(),
  "scripts/verify-live-supabase-registry.mjs",
);
const migrationContractSource = readFileSync(
  resolve(process.cwd(), "scripts/supabase-migration-contract.mjs"),
  "utf8",
);
const remoteOrderSource =
  migrationContractSource.match(
    /export const requiredRemoteMigrationOrder = \[([\s\S]*?)\];/,
  )?.[1] ?? "";
const requiredRemoteMigrationOrder = [...remoteOrderSource.matchAll(/"([^"]+)"/g)].map(
  (match) => match[1] as string,
);

function verifierMetadata() {
  const result = spawnSync(process.execPath, [verifierPath, "--print-query-metadata"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Could not load verifier metadata");
  }
  return JSON.parse(result.stdout) as {
    contractSha256: string;
    projectRef: string;
    querySha256: string;
  };
}

function validArtifact() {
  const metadata = verifierMetadata();
  const capturedAt = new Date().toISOString();
  const column = (
    table: string,
    name: string,
    type: string,
    nullable: boolean,
    defaultValue: string | null = null,
  ) => ({
    column: name,
    default: defaultValue,
    nullable,
    schema: "public",
    table,
    type,
  });
  const functionFact = (
    identity: string,
    securityDefiner: boolean,
    definition: string,
  ) => ({
    anonExecute: false,
    authenticatedExecute: true,
    config: [
      identity.includes("save_submission_draft_for_internal_dispatch") ||
      identity.includes("save_submission_draft_without_questionnaire_rows")
        ? "search_path=public"
        : "search_path=pg_catalog, public, app_private",
    ],
    definition,
    identity,
    securityDefiner,
  });

  return {
    collectorCapturedAt: capturedAt,
    columns: [
      column("submissions", "public_number", "bigint", true),
      column("submissions", "case_revision", "bigint", false, "0"),
      column("corrections", "target_revision", "bigint", false, "0"),
      column("corrections", "agent_confirmed_at", "timestamp with time zone", true),
      column("corrections", "agent_confirmed_revision", "bigint", true),
      column("corrections", "target_section_id", "text", true),
      column("corrections", "target_field_id", "text", true),
      column("corrections", "target_baseline", "jsonb", true),
      column("corrections", "target_projection", "jsonb", true),
    ],
    constraints: [
      {
        definition: "CHECK (target_revision >= 0)",
        name: "corrections_target_revision_nonnegative_check",
        schema: "public",
        table: "corrections",
        type: "c",
        validated: true,
      },
      {
        definition:
          "CHECK (agent_confirmed_at IS NULL AND agent_confirmed_revision IS NULL OR agent_confirmed_at IS NOT NULL AND agent_confirmed_revision IS NOT NULL AND agent_confirmed_revision >= 0 AND agent_confirmed_revision <= target_revision)",
        name: "corrections_agent_confirmation_pair_check",
        schema: "public",
        table: "corrections",
        type: "c",
        validated: true,
      },
      {
        definition:
          "CHECK (target_section_id IS NULL AND target_field_id IS NULL OR target_section_id IS NOT NULL AND target_field_id IS NOT NULL)",
        name: "corrections_target_field_identity_pair_check",
        schema: "public",
        table: "corrections",
        type: "c",
        validated: true,
      },
    ],
    contractSha256: metadata.contractSha256,
    dbCapturedAt: capturedAt,
    format: "v19.supabase-live-registry.v2",
    functions: [
      functionFact(
        "save_submission_draft(jsonb)",
        false,
        "dispatch_submission_draft_with_revision_context",
      ),
      functionFact("submit_corrections_handoff(jsonb)", false, "handoff"),
      functionFact(
        "app_private.dispatch_submission_draft_with_revision_context(jsonb)",
        false,
        "save_submission_draft_for_internal_dispatch sync_correction_targets_from_payload",
      ),
      functionFact(
        "app_private.save_submission_draft_for_internal_dispatch(jsonb)",
        false,
        "save_submission_draft_without_questionnaire_rows",
      ),
      functionFact(
        "app_private.save_submission_draft_without_questionnaire_rows(jsonb)",
        false,
        "insert",
      ),
      functionFact(
        "app_private.sync_correction_targets_from_payload(jsonb)",
        true,
        "update",
      ),
    ],
    projectRef: metadata.projectRef,
    querySha256: metadata.querySha256,
    registryRows: requiredRemoteMigrationOrder.map((migration) => {
      const separator = migration.indexOf("_");
      return {
        name: migration.slice(separator + 1),
        version: migration.slice(0, separator),
      };
    }),
    triggers: [
      {
        enabled: "O",
        name: "submissions_bump_case_revision",
        table: "public.submissions",
      },
      {
        enabled: "O",
        name: "corrections_agent_target_revision_guard",
        table: "public.corrections",
      },
      {
        enabled: "O",
        name: "corrections_agent_parent_status_guard",
        table: "public.corrections",
      },
      {
        enabled: "O",
        name: "questionnaire_answers_refresh_correction_targets",
        table: "public.questionnaire_answers",
      },
      {
        enabled: "O",
        name: "media_assets_refresh_correction_targets",
        table: "public.media_assets",
      },
      {
        enabled: "O",
        name: "submissions_returned_questionnaire_readiness_guard",
        table: "public.submissions",
      },
    ],
  };
}

function runVerifier(artifact: ReturnType<typeof validArtifact>) {
  return spawnSync(
    process.execPath,
    [
      verifierPath,
      "--artifact-base64",
      Buffer.from(JSON.stringify(artifact)).toString("base64"),
    ],
    { encoding: "utf8" },
  );
}

describe("live Supabase registry verifier", () => {
  test("accepts a complete exact catalog fixture", () => {
    const result = runVerifier(validArtifact());
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS: live Supabase registry");
  });

  test("rejects a trigger with the right name on the wrong table", () => {
    const artifact = validArtifact();
    artifact.triggers[0] = {
      ...artifact.triggers[0],
      table: "public.corrections",
    };
    const result = runVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("submissions_bump_case_revision");
  });

  test("rejects a correction column with a drifted runtime contract", () => {
    const artifact = validArtifact();
    artifact.columns[2] = {
      ...artifact.columns[2],
      nullable: true,
    };
    const result = runVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("corrections.target_revision");
  });

  test("rejects a correction column with a drifted numeric default", () => {
    const artifact = validArtifact();
    artifact.columns[2] = {
      ...artifact.columns[2],
      default: "100",
    };
    const result = runVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("corrections.target_revision");
  });

  test("rejects a missing correction constraint", () => {
    const artifact = validArtifact();
    artifact.constraints.pop();
    const result = runVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("constraints");
  });

  test("rejects a weakened confirmation-pair constraint", () => {
    const artifact = validArtifact();
    artifact.constraints[1] = {
      ...artifact.constraints[1],
      definition:
        "CHECK (agent_confirmed_at IS NULL AND agent_confirmed_revision IS NULL OR agent_confirmed_revision <= target_revision)",
    };
    const result = runVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "corrections_agent_confirmation_pair_check",
    );
  });

  test("rejects a constraint with the same tokens but different grouping", () => {
    const artifact = validArtifact();
    artifact.constraints[2] = {
      ...artifact.constraints[2],
      definition:
        "CHECK ((target_section_id IS NULL AND target_field_id IS NULL OR target_section_id IS NOT NULL) AND target_field_id IS NOT NULL)",
    };
    const result = runVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "corrections_target_field_identity_pair_check",
    );
  });

  test("rejects a SECURITY DEFINER helper without its fixed search path", () => {
    const artifact = validArtifact();
    const helper = artifact.functions.find(
      (item) =>
        item.identity ===
        "app_private.sync_correction_targets_from_payload(jsonb)",
    );
    if (!helper) throw new Error("Missing SECURITY DEFINER fixture");
    helper.config = [];
    const result = runVerifier(artifact);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "app_private.sync_correction_targets_from_payload(jsonb)",
    );
  });
});
