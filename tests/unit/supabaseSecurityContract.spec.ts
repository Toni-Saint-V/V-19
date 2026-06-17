import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function readProjectFile(relativePath: string): string {
  return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
}

function normalizeSql(content: string): string {
  return content.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function sqlStatements(content: string): string[] {
  return content
    .replace(/--.*$/gm, " ")
    .split(";")
    .map((statement) => normalizeSql(statement))
    .filter(Boolean);
}

function expectSqlStatement(content: string, statement: string): void {
  expect(normalizeSql(content)).toContain(normalizeSql(statement));
}

function expectNoSqlStatement(content: string, statement: string): void {
  expect(normalizeSql(content)).not.toContain(normalizeSql(statement));
}

function expectNoQuotaExecuteGrantToRole(content: string, role: string): void {
  const grantPrefix = normalizeSql(
    "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to ",
  );
  const forbiddenRole = role.toLowerCase();
  const matchingStatement = sqlStatements(content).find((statement) => {
    if (!statement.startsWith(grantPrefix)) return false;

    return statement
      .slice(grantPrefix.length)
      .split(",")
      .map((candidateRole) => candidateRole.trim())
      .some(
        (candidateRole) =>
          candidateRole === forbiddenRole ||
          candidateRole.startsWith(`${forbiddenRole} `),
      );
  });

  expect(matchingStatement).toBeUndefined();
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
    expect(submissionService).toContain(
      "id,created_by,created_at,format,content_fingerprint,idempotency_key,file_name,row_count,submission_ids",
    );
  });

  test("keeps export batch identity migration additive for legacy batches", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260616000000_export_batch_identity.sql",
    );

    expectSqlStatement(
      migration,
      "alter table public.export_batches add column if not exists idempotency_key text, add column if not exists file_name text",
    );
    expectSqlStatement(
      migration,
      "create unique index if not exists export_batches_idempotency_key_uidx on public.export_batches (idempotency_key) where idempotency_key is not null",
    );
    expect(normalizeSql(migration)).not.toContain("idempotency_key text not null");
    expect(normalizeSql(migration)).not.toContain("file_name text not null");
    expect(migration).toContain("export_batches_idempotency_key_not_blank");
    expect(migration).toContain("export_batches_file_name_safe");
    expect(normalizeSql(migration)).toContain(
      "check (idempotency_key is null or btrim(idempotency_key) <> '')",
    );
    expect(normalizeSql(migration)).toContain("chr(92)");
    expect(migration).toContain(
      "create or replace function app_private.enforce_export_batch_actor()",
    );
    expect(migration).toContain(
      "raise exception 'Authenticated user required to write export batches'",
    );
    expect(migration).toContain("new.created_by := auth.uid()");
    expect(migration).toContain("new.created_at := now()");
    expect(migration).toContain("new.created_by := old.created_by");
    expect(migration).toContain("new.created_at := old.created_at");
    expect(migration).toContain(
      "create trigger export_batches_actor_guard\nbefore insert or update on public.export_batches",
    );
  });

  test("keeps export package completion server-authoritative and atomic", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260616001000_complete_export_package_rpc.sql",
    );

    expect(migration).toContain(
      "create or replace function public.complete_export_package(payload jsonb)",
    );
    expect(migration).toContain("actor_role <> 'admin'");
    expect(migration).toContain("for update");
    expect(migration).toContain("add column if not exists content_fingerprint text");
    expect(migration).toContain("export_batches_content_fingerprint_uidx");
    expect(migration).toContain("Export package content fingerprint is required");
    expect(migration).toContain(
      "Export package cannot mix cockpit snapshot and normalized submissions",
    );
    expect(migration).toContain("Cockpit snapshot is not ready for export completion");
    expect(migration).toContain(
      "All cockpit applicant files must be accepted before export",
    );
    expect(migration).toContain(
      "Export package content fingerprint does not match current cockpit snapshot",
    );
    expect(migration).toContain(
      "(cockpit.snapshot ->> 'tripDateFrom') || '-' || (cockpit.snapshot ->> 'tripDateTo')",
    );
    expect(migration).toContain(
      "Only accepted or Excel-ready submissions can be exported",
    );
    expect(migration).toContain("status in ('accepted', 'ready_for_excel')");
    expect(migration).toContain(
      "Duplicate export packages can only converge accepted, Excel-ready, or exported submissions",
    );
    expect(migration).toContain(
      "Export package cannot mix city, travel date, or submission type",
    );
    expect(migration).toContain("count(distinct city) as city_count");
    expect(migration).toContain("count(distinct travel_date) as travel_date_count");
    expect(migration).toContain("count(distinct type) as type_count");
    expect(migration).toContain(
      "Export package row count does not match current applicants",
    );
    expect(migration).toContain("Blocking corrections must be closed before export");
    expect(migration).toContain("All applicant media must be accepted before export");
    expect(migration).toContain("Family submissions must be confirmed before export");
    expect(migration).toContain("on conflict (idempotency_key)");
    expect(migration).toContain("update public.submissions");
    expect(migration).toContain("insert into public.status_history");
    expect(migration).toContain(
      "grant execute on function public.complete_export_package(jsonb) to authenticated",
    );
  });

  test("prevents stale draft saves from downgrading exported submissions", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260616002000_prevent_export_regression.sql",
    );

    expect(migration).toContain(
      "create or replace function app_private.prevent_submission_export_regression()",
    );
    expect(migration).toContain("old.status = 'exported' and new.status <> 'exported'");
    expect(migration).toContain("Exported submissions cannot be downgraded");
    expect(migration).toContain("old.exported_at is not null");
    expect(migration).toContain("new.exported_at is null");
    expect(migration).toContain("new.exported_at < old.exported_at");
    expect(migration).toContain("Exported timestamp cannot move backwards");
    expect(migration).toContain("create trigger submissions_export_regression_guard");
    expect(migration).toContain("before update of status, exported_at on public.submissions");
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

  test("keeps correction handoff server-authoritative and atomic", () => {
    const handoffMigration = readProjectFile(
      "supabase/migrations/20260617001000_submit_corrections_handoff_rpc.sql",
    );

    expect(handoffMigration).toContain(
      "create or replace function public.submit_corrections_handoff(payload jsonb)",
    );
    expect(handoffMigration).toContain("for update");
    expect(handoffMigration).toContain("perform public.save_submission_draft");
    expect(handoffMigration).toContain("result := public.save_submission_draft(payload)");
    expect(handoffMigration).toContain(
      "Correction handoff requires an existing returned submission",
    );
    expect(handoffMigration).toContain(
      "Only the assigned agent can submit corrections",
    );
    expect(handoffMigration).toContain(
      "grant execute on function public.submit_corrections_handoff(jsonb) to authenticated",
    );
  });

  test("keeps cockpit saves from overwriting normalized applicant profile fields", () => {
    const profilePreservationMigration = readProjectFile(
      "supabase/migrations/20260617002000_preserve_applicant_profile_on_cockpit_save.sql",
    );

    expect(profilePreservationMigration).toContain(
      "create or replace function public.save_submission_draft(payload jsonb)",
    );
    expect(profilePreservationMigration).toContain(
      "full_name = excluded.full_name",
    );
    expect(profilePreservationMigration).toContain(
      "questionnaire_percent = excluded.questionnaire_percent",
    );
    expect(profilePreservationMigration).not.toContain(
      "passport_number = excluded.passport_number",
    );
    expect(profilePreservationMigration).not.toContain("email = excluded.email");
    expect(profilePreservationMigration).not.toContain("phone = excluded.phone");
    expect(profilePreservationMigration).not.toContain("address = excluded.address");
    expect(profilePreservationMigration).not.toContain(
      "birth_date = excluded.birth_date",
    );
  });

  test("keeps AI helper quota surfaces service-role only", () => {
    const quotaMigration = readProjectFile(
      "supabase/migrations/20260614000000_ai_helper_audit_quota.sql",
    );
    const hardeningMigration = readProjectFile(
      "supabase/migrations/20260615000000_ai_helper_security_advisor_hardening.sql",
    );

    expect(quotaMigration).toContain("api_role is distinct from expected_api_role");
    expectSqlStatement(
      hardeningMigration,
      "revoke all on table public.ai_helper_audit_events from anon, authenticated;",
    );
    expectSqlStatement(
      hardeningMigration,
      "revoke all on table public.ai_helper_quota_counters from anon, authenticated;",
    );
    expectSqlStatement(
      hardeningMigration,
      "revoke all on table public.ai_helper_quota_receipts from anon, authenticated;",
    );

    for (const policyName of [
      'create policy "ai helper audit service only"',
      'create policy "ai helper counters service only"',
      'create policy "ai helper receipts service only"',
    ]) {
      expect(hardeningMigration).toContain(policyName);
    }

    expectSqlStatement(
      hardeningMigration,
      "revoke all on function public.consume_ai_helper_quota(text, text, text, text) from public;",
    );
    expectSqlStatement(
      hardeningMigration,
      "revoke execute on function public.consume_ai_helper_quota(text, text, text, text) from anon, authenticated;",
    );
    expectSqlStatement(
      hardeningMigration,
      "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to service_role;",
    );
    expectNoSqlStatement(
      hardeningMigration,
      "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to public;",
    );
    expectNoQuotaExecuteGrantToRole(hardeningMigration, "public");
    expectNoQuotaExecuteGrantToRole(hardeningMigration, "anon");
    expectNoQuotaExecuteGrantToRole(hardeningMigration, "authenticated");
  });
});
