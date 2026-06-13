import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function readProjectFile(relativePath: string): string {
  return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
}

describe("Supabase security contract", () => {
  test("keeps profile role out of client-owned profile writes", () => {
    const profileService = readProjectFile("src/services/profileService.ts");
    const migration = readProjectFile(
      "supabase/migrations/20260611000000_visaflow_mvp_foundation.sql",
    );

    expect(profileService).not.toContain("role: profile.role");
    expect(profileService).toContain("id,email,display_name,organization_name,role");
    expect(migration).toContain('create policy "profiles insert own agent"');
    expect(migration).toContain(
      "with check (id = (select auth.uid()) and role = 'agent')",
    );
    expect(migration).toContain(
      "grant update (email, display_name, organization_name) on public.profiles",
    );
    expect(migration).not.toContain("grant select, insert, update on public.profiles");
  });

  test("blocks agent-owned writes from changing operator review and handoff state", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260611000000_visaflow_mvp_foundation.sql",
    );

    expect(migration).toContain(
      "create function app_private.enforce_submission_agent_mutation()",
    );
    expect(migration).toContain("create trigger submissions_agent_mutation_guard");
    expect(migration).toContain(
      "Agents cannot update submissions after handoff to operator review",
    );
    expect(migration).toContain(
      "Agents cannot update review, export, or appointment state",
    );
    expect(migration).toContain(
      "new.status not in ('returned', 'ready_for_review', 'waiting_review')",
    );
  });

  test("keeps Supabase repository reads on explicit field contracts", () => {
    const submissionService = readProjectFile("src/services/submissionService.ts");
    const profileService = readProjectFile("src/services/profileService.ts");

    expect(submissionService).not.toContain('.select("*")');
    expect(profileService).not.toContain('.select("*")');
    expect(submissionService).toContain("const submissionSelect =");
    expect(submissionService).toContain("const statusHistorySelect =");
  });

  test("keeps corrections scoped to applicants in the same submission", () => {
    const foundationMigration = readProjectFile(
      "supabase/migrations/20260611000000_visaflow_mvp_foundation.sql",
    );
    const hardeningMigration = readProjectFile(
      "supabase/migrations/20260612000000_visaflow_rls_performance_hardening.sql",
    );
    const rpcMigration = readProjectFile(
      "supabase/migrations/20260612001000_visaflow_rpc_corrections_persistence.sql",
    );

    for (const migration of [foundationMigration, hardeningMigration]) {
      expect(migration).toContain("corrections.applicant_id is null");
      expect(migration).toContain("a.id = corrections.applicant_id");
      expect(migration).toContain("a.submission_id = corrections.submission_id");
    }

    for (const migration of [foundationMigration, rpcMigration]) {
      expect(migration).toContain(
        "Correction payload contains an applicant outside the submission",
      );
      expect(migration).toContain("correction_payload.applicant_id is not null");
      expect(migration).toContain(
        "applicant_payload.id = correction_payload.applicant_id",
      );
      expect(migration).toContain("a.id = correction_payload.applicant_id");
      expect(migration).toContain("a.submission_id = submission_record.id");
    }
  });
});
