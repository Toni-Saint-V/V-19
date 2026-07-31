import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260729050000_agent_submission_concurrency.sql";

function migrationSql(): string {
  return readFileSync(`${process.cwd()}/${migrationPath}`, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("Agent submission concurrency migration", () => {
  test("serializes by receipt and submission row before comparing case_revision", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "create table if not exists app_private.agent_submission_mutation_receipts",
    );
    expect(sql).toContain(
      "on conflict on constraint agent_submission_mutation_receipts_pkey do nothing",
    );
    expect(sql).toContain(
      "where receipt.operation_id = save_agent_submission_if_current.operation_id",
    );
    expect(sql).toContain("for update");
    expect(sql).toContain(
      "existing_submission.case_revision is distinct from expected_revision",
    );
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).not.toContain("'idempotent', true");
  });

  test("persists draft and review lifecycle checkpoints in one transaction", () => {
    const sql = migrationSql();

    expect(sql).toContain("existing_submission.status = 'draft'");
    expect(sql).toContain("'{submission,status}', to_jsonb('filling'::text)");
    expect(sql).toContain("'{status_history}', final_history - 0");
    expect(sql).toContain(
      "perform app_private.dispatch_submission_draft_with_revision_context( intermediate_payload )",
    );
    expect(sql).toContain(
      "persisted_result := app_private.dispatch_submission_draft_with_revision_context( payload )",
    );
    expect(sql).toContain("final_history -> 0 ->> 'from_status' <> 'in_progress'");
    expect(sql).toContain("final_history -> 0 ->> 'source' <> 'agent'");
    expect(sql).toContain(
      "and submission_record.status <> 'draft' then raise exception 'a new agent submission must start as draft'",
    );
    expect(sql).toContain(
      "and submission_record.status = 'filling' then if jsonb_typeof(final_history)",
    );
    expect(sql).toContain("in-progress agent submissions cannot regress to draft");
  });

  test("guards every Agent aggregate table with the matching CAS receipt context", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "create or replace function app_private.enforce_agent_cas_write_boundary()",
    );
    expect(sql).toContain(
      "current_setting('app.visaflow_agent_cas_operation_id', true)",
    );
    expect(sql).toContain("receipt.submission_id = target_submission_id");
    for (const table of [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ]) {
      expect(sql).toContain(
        `create trigger ${table}_agent_cas_write_boundary before insert or update or delete on public.${table}`,
      );
    }
  });

  test("validates single and family applicant topology before persistence", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "single agent submissions require exactly one main applicant",
    );
    expect(sql).toContain(
      "family agent submissions require 2-6 applicants, one main, and at most one spouse",
    );
    expect(sql).toContain(
      "applicant.role not in ( 'основной заявитель', 'супруг', 'ребёнок' )",
    );
    expect(sql).toContain("group by applicant.id having count(*) > 1");
  });

  test("binds the cockpit snapshot to normalized applicants, answers, and media", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "agent cockpit snapshot diverges from the canonical submission projection",
    );
    expect(sql).toContain(
      "snapshot_submission ->> 'agentid' is distinct from actor_id::text",
    );
    expect(sql).toContain(
      "agent cockpit snapshot applicant topology diverges from canonical applicants",
    );
    expect(sql).toContain(
      "agent cockpit questionnaire diverges from canonical answers",
    );
    expect(sql).toContain("agent cockpit snapshot files diverge from canonical media");
    expect(sql).toContain("agent cockpit audit history diverges from durable history");
    expect(sql).toContain(
      "agent cockpit completeness diverges from the normalized package",
    );
    expect(sql).toContain(
      "snapshot_submission ->> 'tripdatefrom' is distinct from submission_record.trip_date_from",
    );
  });

  test("requires complete durable questionnaire data and real private Storage objects", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "every applicant requires a complete durable questionnaire before review",
    );
    expect(sql).toContain(
      "create or replace function app_private.agent_submission_questionnaire_complete",
    );
    expect(sql).toContain("and answer.semantic_value is not null");
    expect(sql).toContain(
      "app_private.questionnaire_semantic_date_is_valid( semantic.value )",
    );
    expect(sql).toContain(
      "every required review document must exist in private storage",
    );
    expect(sql).toContain("from storage.objects as stored_object");
    expect(sql).toContain(
      "stored_object.bucket_id = media.storage_bucket and stored_object.name = media.storage_path",
    );
    expect(sql).toContain(
      "or not app_private.agent_submission_questionnaire_complete( submission_record.id ) then",
    );
  });

  test("keeps server questionnaire readiness aligned with conditional BLS rules", () => {
    const sql = migrationSql();

    expect(sql).toContain("flags.requires_residence_permit");
    expect(sql).toContain("flags.requires_previous_biometrics_date");
    expect(sql).toContain("flags.requires_company");
    expect(sql).toContain("flags.requires_employer");
    expect(sql).toContain(
      "('employment', 'employer-contact', flags.requires_employer)",
    );
    expect(sql).toContain(
      "('employment', 'employer-address', flags.requires_employer)",
    );
    expect(sql).toContain("answer_text ~ '^\\d{2}[.-]\\d{2}[.-]\\d{4}$'");
    expect(sql).toContain("flags.stay_duration is distinct from");
  });

  test("binds every normalized applicant projection field to questionnaire data", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "agent applicant projection diverges from questionnaire data",
    );
    expect(sql).toContain(
      "submission_record.status = 'waiting_review' and applicant.trip_dates is distinct from",
    );
    for (const field of [
      "birth_date",
      "full_name",
      "citizenship",
      "address",
      "phone",
      "email",
      "passport_number",
      "passport_issued_at",
      "passport_expires_at",
      "trip_dates",
      "hotel_name",
      "hotel_address",
    ]) {
      expect(sql).toContain(`applicant.${field} is not distinct from`);
    }
  });

  test("keeps Admin questionnaire approval metadata outside the Agent trust boundary", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "agent questionnaire review metadata crosses the admin trust boundary",
    );
    expect(sql).toContain("answer.value ? 'adminreviewapprovedatiso'");
    expect(sql).toContain("answer.value ? 'adminreviewapprovedby'");
    expect(sql).toContain(
      "answer.value ->> 'reviewconfirmedby' is distinct from actor_id::text",
    );
    expect(sql).toContain(
      "app_private.questionnaire_semantic_text(answer.value) is not distinct from app_private.questionnaire_semantic_text(durable_answer.value)",
    );
  });

  test("accepts only the exact new Agent audit transitions for the locked lifecycle", () => {
    const sql = migrationSql();

    expect(sql).toContain("expected_history_transitions := jsonb_build_array");
    expect(sql).toContain(
      "new_history_count <> jsonb_array_length(expected_history_transitions)",
    );
    expect(sql).toContain(
      "agent status history reuses a durable identity with different content",
    );
    expect(sql).toContain(
      "persisted agent audit history diverges from the requested lifecycle",
    );
  });

  test("allows only a cleared export-ready resubmission boundary", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "old.status in ('accepted', 'ready_for_excel') and new.status = 'waiting_review'",
    );
    expect(sql).toContain(
      "current_setting('app.visaflow_agent_review_handoff', true) = 'on'",
    );
    expect(sql).toContain(
      "existing_submission.status in ('accepted', 'ready_for_excel')",
    );
    expect(sql).toContain("final_history -> 0 ->> 'from_status' <> 'ready_for_export'");
    expect(sql).toContain(
      "new.family_intelligence #>> '{v19cockpitsnapshot,submission,exportstate}' is distinct from 'not_ready'",
    );
    expect(sql).toContain(
      "new.review_status = 'not_reviewed'::public.media_review_status",
    );
  });

  test("keeps Admin issue identity immutable and allows only Agent open-to-fixed", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "create or replace function app_private.agent_issue_correction_id",
    );
    expect(sql).toContain(
      "agent cockpit issues diverge from the corrections projection",
    );
    expect(sql).toContain("new agent submissions cannot create review issues");
    expect(sql).toContain("agent cannot add or remove admin review issues");
    expect(sql).toContain(
      "agent cannot rewrite admin issue identity or immutable evidence",
    );
    expect(sql).toContain(
      "incoming_correction.reason is distinct from durable_correction.reason",
    );
    expect(sql).toContain(
      "incoming_correction.severity is distinct from durable_correction.severity",
    );
    expect(sql).toContain(
      "durable_correction.status = 'open' and incoming_correction.status = 'fixed'",
    );
    expect(sql).toContain(
      "coalesce(snapshot_field.value ->> 'value', '') ) is distinct from btrim( coalesce(existing_issue.value ->> 'snapshot', '')",
    );
    expect(sql).toContain("incoming_media.review_status = 'not_reviewed'");
    expect(sql).toContain(
      "durable_media.storage_path is distinct from incoming_media.storage_path",
    );
    expect(sql).toContain("from storage.objects as stored_object");
    expect(sql).toContain("agent correction mutation violates admin issue ownership");
    expect(sql).toContain("'fixed_at', case when durable_correction.status = 'open'");
  });

  test("keeps the RPC SECURITY INVOKER with authenticated-only execution", () => {
    const sql = migrationSql();
    const signature =
      "public.save_agent_submission_if_current( jsonb, bigint, uuid, uuid )";

    expect(sql).toContain("security invoker");
    expect(sql).toContain(`revoke all on function ${signature}`);
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain(`grant execute on function ${signature}`);
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("privilege.grantee = 0");
    expect(sql).toContain(
      "has_function_privilege('authenticated', function_oid, 'execute')",
    );
    expect(sql).toContain("'search_path=pg_catalog, public, app_private, extensions'");
    expect(sql).toContain(
      "alter table app_private.agent_submission_mutation_receipts enable row level security",
    );
    expect(sql).toContain(
      "revoke all on function public.save_submission_draft(jsonb) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.submit_corrections_handoff(jsonb) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.upsert_questionnaire_answers(jsonb) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "create or replace function public.ensure_submission_public_number( submission_id text )",
    );
    expect(sql).toContain("'caserevision', current_revision");
  });
});
