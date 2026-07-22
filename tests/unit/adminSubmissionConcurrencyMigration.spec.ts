import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260722001000_admin_submission_batch_concurrency.sql";

function migrationSql(): string {
  return readFileSync(`${process.cwd()}/${migrationPath}`, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("admin submission optimistic concurrency migration", () => {
  test("adds an aggregate revision for parent and review-relevant child writes", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "add column if not exists case_revision bigint not null default 0",
    );
    expect(sql).toContain("new.case_revision := old.case_revision + 1");
    expect(sql).toContain(
      "previous_internal_trip_date_sync := current_setting( 'app.visaflow_internal_trip_date_sync', true )",
    );
    expect(sql).toContain(
      "set_config('app.visaflow_internal_trip_date_sync', 'on', true)",
    );
    expect(sql).toContain(
      "set_config( 'app.visaflow_internal_trip_date_sync', coalesce(previous_internal_trip_date_sync, ''), true )",
    );
    for (const trigger of [
      "applicants_touch_submission_case_revision",
      "questionnaire_answers_touch_submission_case_revision",
      "media_assets_touch_submission_case_revision",
      "corrections_touch_submission_case_revision",
      "status_history_touch_submission_case_revision",
    ]) {
      expect(sql).toContain(`create trigger ${trigger}`);
    }
  });

  test("locks the complete batch before comparing every expected revision", () => {
    const sql = migrationSql();

    expect(sql).toContain("order by submission.id for update");
    expect(sql).toContain("requested_distinct_count <> payload_count");
    expect(sql).toContain("locked_count <> payload_count");
    expect(sql).toContain("current_revision is distinct from expected_revision");
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).toContain(
      "persisted_result := app_private.dispatch_submission_draft_with_revision_context",
    );
  });

  test("binds the actor and keeps the RPC invoker-only", () => {
    const sql = migrationSql();
    const signature =
      "public.save_admin_submission_batch_if_current( jsonb, jsonb, uuid, uuid )";

    expect(sql).toContain("actor_id is distinct from auth.uid()");
    expect(sql).toContain("actor_role is distinct from 'admin'");
    expect(sql).not.toContain("actor_role <> 'admin'");
    expect(sql).toContain("security invoker");
    expect(sql).toContain(`revoke all on function ${signature}`);
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain(`grant execute on function ${signature}`);
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("proc.prosecdef");
    expect(sql).toContain("privilege.grantee = 0");
    expect(sql).toContain("privilege.privilege_type = 'execute'");
    expect(sql).toContain(
      "setting = 'search_path=pg_catalog, public, app_private'",
    );
  });

  test("removes the revision-blind admin RPC surface and records replay-safe operations", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "alter function public.save_submission_draft(jsonb) set schema app_private",
    );
    expect(sql).toContain("rename to save_submission_draft_for_internal_dispatch");
    expect(sql).toContain(
      "approved agents must use the submission draft rpc; administrators use the revision-checked batch rpc",
    );
    expect(sql).toContain(
      "create table if not exists app_private.admin_submission_mutation_receipts",
    );
    expect(sql).toContain(
      "alter table app_private.admin_submission_mutation_receipts enable row level security",
    );
    expect(sql).toContain("extensions.digest(");
    expect(sql).toContain(
      "on conflict on constraint admin_submission_mutation_receipts_pkey do nothing",
    );
    expect(sql).toContain("if receipt_result is not null then return receipt_result");
    expect(sql).toContain("receipt_fingerprint is distinct from request_fingerprint");
    expect(sql).toContain("interval '90 days'");
    expect(sql).toContain("offset 511");
    expect(sql).toContain("admin_submission_mutation_receipts_delete_own");
  });

  test("coalesces snapshot child writes and blocks profile self-provisioning", () => {
    const sql = migrationSql();

    expect(sql).toContain("app.visaflow_internal_snapshot_save");
    expect(sql).toContain("app.visaflow_snapshot_revision_bumped_ids");
    expect(sql).toContain(
      "create or replace function app_private.dispatch_submission_draft_with_revision_context",
    );
    expect(sql).toContain("revoke insert on public.profiles from authenticated");
    expect(sql).toContain('drop policy if exists "profiles insert own agent"');
    expect(sql).toContain(
      "create or replace function app_private.enforce_approved_submission_actor",
    );
    expect(sql).toContain("if actor_role is distinct from 'agent'");
  });
});
