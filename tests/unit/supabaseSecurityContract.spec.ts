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

  test("keeps child and storage writes locked after review handoff", () => {
    const runtimeGuards = readProjectFile(
      "supabase/migrations/20260613005039_visaflow_runtime_write_guards.sql",
    );

    expect(runtimeGuards).toContain(
      "create constraint trigger submissions_review_readiness_guard",
    );
    expect(runtimeGuards).toContain("create trigger corrections_actor_guard");
    expect(runtimeGuards).toContain(
      "new.status not in ('ready_for_review', 'waiting_review')",
    );
    expect(runtimeGuards).toContain("Blocking corrections must be fixed before review");
    expect(runtimeGuards).toContain(
      "Applicant required fields must be complete before review",
    );
    expect(runtimeGuards).toContain(
      "All required media must be uploaded before review",
    );

    for (const policyName of [
      'create policy "applicants update editable submission"',
      'create policy "media update editable submission"',
      'create policy "corrections update editable submission"',
      'create policy "media storage update editable owner or admin"',
      'create policy "media storage delete editable owner or admin"',
    ]) {
      expect(runtimeGuards).toContain(policyName);
    }

    expect(runtimeGuards).toContain(
      "and s.status in ('draft', 'filling', 'returned', 'ready_for_review')",
    );
    expect(runtimeGuards).toContain(
      "and status in ('draft', 'filling', 'returned', 'ready_for_review')",
    );
  });

  test("does not trust client-provided correction authors", () => {
    const submissionService = readProjectFile("src/services/submissionService.ts");
    const runtimeGuards = readProjectFile(
      "supabase/migrations/20260613005039_visaflow_runtime_write_guards.sql",
    );

    expect(submissionService).toContain("created_by: actorId");
    expect(submissionService).not.toContain(
      "created_by: toNullableUuid(note.createdBy) ?? actorId",
    );
    expect(runtimeGuards).toContain("new.created_by := auth.uid()");
    expect(runtimeGuards).toContain("new.created_by := old.created_by");
  });

  test("keeps submit RPC idempotent while child rows stay locked after handoff", () => {
    const rpcBoundary = readProjectFile(
      "supabase/migrations/20260613010029_visaflow_rpc_submit_boundary.sql",
    );

    expect(rpcBoundary).toContain("can_write_children boolean := false");
    expect(rpcBoundary).toContain(
      "submission_record.status in ('draft', 'filling', 'returned', 'ready_for_review')",
    );
    expect(rpcBoundary).toContain("if can_write_children then");
    expect(rpcBoundary).toContain("insert into public.applicants");
    expect(rpcBoundary).toContain("insert into public.media_assets");
    expect(rpcBoundary).toContain("insert into public.corrections");
    expect(rpcBoundary).toContain("insert into public.status_history");
  });

  test("keeps AI helper quota surfaces service-role only", () => {
    const quotaMigration = readProjectFile(
      "supabase/migrations/20260614000000_ai_helper_audit_quota.sql",
    );
    const hardeningMigration = readProjectFile(
      "supabase/migrations/20260615000000_ai_helper_security_advisor_hardening.sql",
    );

    expect(quotaMigration).toContain("api_role is distinct from expected_api_role");
    expect(hardeningMigration).toContain(
      "revoke all on table public.ai_helper_audit_events from anon, authenticated",
    );
    expect(hardeningMigration).toContain(
      "revoke all on table public.ai_helper_quota_counters from anon, authenticated",
    );
    expect(hardeningMigration).toContain(
      "revoke all on table public.ai_helper_quota_receipts from anon, authenticated",
    );

    for (const policyName of [
      'create policy "ai helper audit service only"',
      'create policy "ai helper counters service only"',
      'create policy "ai helper receipts service only"',
    ]) {
      expect(hardeningMigration).toContain(policyName);
    }

    expect(hardeningMigration).toContain(
      "revoke all on function public.consume_ai_helper_quota(text, text, text, text) from public",
    );
    expect(hardeningMigration).toContain("from anon, authenticated");
    expect(hardeningMigration).toContain(
      "grant execute on function public.consume_ai_helper_quota(text, text, text, text)",
    );
    expect(hardeningMigration).toContain("to service_role");
    expect(hardeningMigration).not.toContain(
      "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to public",
    );
  });
});
