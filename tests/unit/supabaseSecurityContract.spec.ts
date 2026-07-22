import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { aiHelperIntents } from "../../supabase/functions/_shared/ai-helper-contract";

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

  test("keeps frontend Supabase auth on sign-in and out of self-service signup", () => {
    const authService = readProjectFile("src/services/authService.ts");

    expect(authService).toContain("client.auth.signInWithPassword");
    expect(authService).toContain(
      "Production profile repair requires owner-approved role assignment",
    );
    expect(authService).not.toContain("allowMissingProfileRecovery");
    expect(authService).not.toContain("upsertProfile");
    expect(authService).not.toContain("client.auth.signUp");
    expect(authService).not.toContain(".signUp(");
  });

  test("uses the active admin UUID for atomic passport-section persistence", () => {
    const app = readProjectFile("src/App.tsx");

    expect(app).toContain("approvePassportReviewSectionForAdmin(");
    expect(app).toContain("activeApprovedSession.userId");
    expect(app).not.toContain("onAdminFileAccept");
    expect(app).not.toContain("markSubmissionFileAccepted");
    expect(app).not.toContain("reviewedBy: 'local-admin'");
  });

  test("keeps access requests admin-approved with requester-only status reads", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260629193805_v19_access_requests_admin_pdfs.sql",
    );
    const authService = readProjectFile("src/services/authService.ts");
    const supabaseRegistration = readProjectFile(
      "src/shared/supabaseAuthRegistration.ts",
    );
    const accessRequestFunction = readProjectFile(
      "supabase/functions/access-request/index.ts",
    );
    const accessRequestProvisioning = readProjectFile(
      "supabase/functions/_shared/accessRequestProvisioning.ts",
    );

    expect(migration).toContain("create table public.access_requests");
    expect(migration).toContain(
      "alter table public.access_requests enable row level security",
    );
    expect(migration).toContain('create policy "access requests admin read"');
    expect(migration).toContain('create policy "access requests requester read own"');
    expect(migration).toContain("using (user_id = (select auth.uid()))");
    expect(migration).toContain(
      "requested_role public.profile_role not null default 'agent'",
    );
    expect(migration).toContain("check (requested_role = 'agent')");
    expect(migration).toContain("where status = 'pending'");
    expect(migration).toContain(
      "revoke all on public.access_requests from anon, authenticated",
    );
    expect(migration).toContain(
      "grant select on public.access_requests to authenticated",
    );
    expect(authService).toContain('.from("access_requests")');
    expect(authService).toContain("Заявка отправлена");
    expect(authService).toContain("Заявка отклонена");
    expect(accessRequestFunction).toContain('action === "approve"');
    expect(accessRequestFunction).toContain("publicAccessRequestResponse");
    expect(accessRequestFunction).toContain("resubmittedRequest");
    expect(accessRequestFunction).toContain('.eq("status", "rejected")');
    expect(accessRequestFunction).toContain("rejection_reason: null");
    expect(accessRequestFunction).toContain("reviewed_at: null");
    expect(accessRequestFunction).toContain("reviewed_by_admin_id: null");
    expect(accessRequestFunction).toContain("resolveAccessRequestUserId");
    expect(accessRequestProvisioning).toContain("inviteUserByEmail");
    expect(accessRequestProvisioning).toContain("findAuthUserByEmail");
    expect(accessRequestProvisioning).toContain("listUsers");
    expect(accessRequestFunction).toContain("requireAdminProfile");
    expect(accessRequestFunction).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(accessRequestFunction).not.toContain("email_confirm: true");
    expect(accessRequestFunction).not.toContain("updateUserById");
    expect(accessRequestFunction).not.toContain("password:");
    expect(accessRequestFunction).not.toContain("display_name,organization_name,role");
    expect(supabaseRegistration).not.toContain("...input");
    expect(supabaseRegistration).not.toContain("password:");
  });

  test("keeps admin PDFs private, slot-limited, and linked before agent reads", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260629193805_v19_access_requests_admin_pdfs.sql",
    );
    const storagePolicy = readProjectFile(
      "src/modules/submissions/mediaStoragePolicy.ts",
    );
    const adminPdfService = readProjectFile(
      "src/modules/submissions/adminPdfArtifacts.ts",
    );

    expect(migration).toContain("create table public.admin_pdf_artifacts");
    expect(migration).toContain(
      "alter table public.admin_pdf_artifacts enable row level security",
    );
    expect(migration).toContain(
      "check (artifact_kind in ('appointment_pdf', 'application_pdf'))",
    );
    expect(migration).toContain("storage_bucket = 'submission-media'");
    expect(migration).toContain("position('/' in file_name) = 0");
    expect(migration).toContain("position(chr(92) in file_name) = 0");
    expect(migration).toContain("file_name !~ '[[:cntrl:]]'");
    expect(migration).toContain("create unique index admin_pdf_artifacts_slot_uidx");
    expect(migration).toContain(
      'create policy "admin pdf artifacts read owner or admin"',
    );
    expect(migration).toContain('create policy "admin pdf artifacts admin insert"');
    expect(migration).toContain('create policy "admin pdf artifacts admin update"');
    expect(migration).toContain('create policy "admin pdf artifacts admin delete"');
    expect(migration).toContain("from public.admin_pdf_artifacts a");
    expect(migration).toContain("and a.storage_path = name");
    expect(migration).toContain(
      "split_part(name, '/', 3) in ('appointment_pdf', 'application_pdf')",
    );
    expect(storagePolicy).toContain('"application_pdf"');
    expect(storagePolicy).toContain("buildApplicationPdfStorageTarget");
    expect(adminPdfService).toContain("uploadAdminPdfArtifact");
    expect(adminPdfService).toContain("deleteMediaFromStorage(target)");
    expect(adminPdfService).toContain("crypto.subtle.digest");
    expect(adminPdfService).toContain('onConflict: "submission_id,artifact_kind"');
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

  test("adds questionnaire answers as an RLS-protected normalized persistence table", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260624001000_questionnaire_answers_persistence.sql",
    );

    expect(migration).toContain(
      "create table if not exists public.questionnaire_answers",
    );
    expect(migration).toContain("unique (applicant_id, section_id, field_id)");
    expect(migration).toContain(
      "alter table public.questionnaire_answers enable row level security",
    );
    expect(migration).toContain(
      'create policy "questionnaire answers read through submission"',
    );
    expect(migration).toContain(
      'create policy "questionnaire answers write editable submission"',
    );
    expect(migration).toContain(
      'create policy "questionnaire answers delete editable submission"',
    );
    expect(migration).toContain(
      "create or replace function public.upsert_questionnaire_answers(answers jsonb)",
    );
    expect(migration).toContain("updated_by,");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain(
      "Questionnaire answer applicant does not belong to submission",
    );
    expect(migration).toContain(
      "grant execute on function public.upsert_questionnaire_answers(jsonb) to authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on public.questionnaire_answers",
    );
  });

  test("keeps questionnaire answer persistence inside the atomic cockpit save RPC", () => {
    const questionnaireMigration = readProjectFile(
      "supabase/migrations/20260624001000_questionnaire_answers_persistence.sql",
    );
    const historicalCockpitSaveMigration = readProjectFile(
      "supabase/migrations/20260617002000_preserve_applicant_profile_on_cockpit_save.sql",
    );
    const cockpitRepository = readProjectFile(
      "src/modules/submissions/supabasePersistence.ts",
    );

    expect(questionnaireMigration).toContain(
      "alter function public.save_submission_draft(jsonb) set schema app_private",
    );
    expect(questionnaireMigration).toContain(
      "create or replace function public.save_submission_draft(payload jsonb)",
    );
    expect(questionnaireMigration).toContain("payload ? 'questionnaire_answers'");
    expect(questionnaireMigration).toContain(
      "insert into public.questionnaire_answers",
    );
    expect(questionnaireMigration).toContain(
      "delete from public.questionnaire_answers qa",
    );
    expect(questionnaireMigration).toContain("'questionnaireAnswers'");
    expect(historicalCockpitSaveMigration).not.toContain("questionnaire_answers");
    expect(cockpitRepository).not.toContain('"upsert_questionnaire_answers"');
  });

  test("persists trip date ranges as additive submission columns", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260628000100_trip_date_range_persistence.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const generatedTypes = readProjectFile("src/lib/supabase/database.types.ts");
    const cockpitRepository = readProjectFile(
      "src/modules/submissions/supabasePersistence.ts",
    );

    expect(migration).toContain("add column if not exists trip_date_from text");
    expect(migration).toContain("add column if not exists trip_date_to text");
    expect(migration).toContain("submissions_trip_date_from_not_blank");
    expect(migration).toContain("submissions_trip_date_to_not_blank");
    expect(migration).toContain(
      "check (trip_date_from is null or btrim(trip_date_from) <> '')",
    );
    expect(migration).toContain(
      "nullif(btrim(coalesce(submission_record.trip_date_from, '')), '')",
    );
    expect(migration).toContain(
      "nullif(btrim(coalesce(submission_record.trip_date_to, '')), '')",
    );
    expect(migration).toContain("legacy_trip_date_parts");
    expect(migration).toContain("'^\\s*(.*?)\\s+-\\s+(.*?)\\s*$'");
    expect(migration).toContain("Trip date range is required");
    expect(migration).toContain(
      "app_private.save_submission_draft_without_questionnaire_rows",
    );
    expect(migration).toContain("travel_date = case");
    expect(migrationContract).toContain(
      "20260628000100_trip_date_range_persistence.sql",
    );
    expect(generatedTypes).toContain("trip_date_from: string | null");
    expect(generatedTypes).toContain("trip_date_to: string | null");
    expect(cockpitRepository).toContain("trip_date_from");
    expect(cockpitRepository).toContain("trip_date_to");
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

  test("keeps workspace export package completion aligned with cockpit identity", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260617004000_complete_export_package_workspace_media_slots.sql",
    );

    expect(migration).toContain("cockpit.snapshot -> 'exportPackage'");
    expect(migration).toContain(
      "export_identity.export_package ->> 'contentFingerprint' is distinct from batch_record.content_fingerprint",
    );
    expect(migration).toContain(
      "export_identity.export_package ->> 'idempotencyKey' is distinct from batch_record.idempotency_key",
    );
    expect(migration).toContain(
      "jsonb_typeof(export_identity.export_package -> 'submissionIds') = 'array'",
    );
    expect(migration).toContain(
      "file.value ->> 'type' in ('selfie', 'selfie_2', 'passport_scan')",
    );
    expect(migration).not.toContain("count(distinct type) as type_count");
    expect(migration).not.toContain(
      "Export package cannot mix city, travel date, or submission type",
    );
  });

  test("makes terminal document export a single server-owned transaction", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260713095403_atomic_export_document_completion.sql",
    );
    const guardHardeningMigration = readProjectFile(
      "supabase/migrations/20260714020334_atomic_export_guard_null_safe.sql",
    );

    expect(migration).toContain(
      "create or replace function public.complete_export_package(payload jsonb)",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public, app_private");
    expect(migration).toContain("payload -> 'document_export'");
    expect(migration).toContain("Export document asset ids must be unique UUIDs");
    expect(migration).toContain(
      "Export document assets must exactly match three ready documents per applicant",
    );
    expect(migration).toContain(
      "coalesce(array_length(expected_document_asset_ids, 1), 0) <> expected_applicant_count * 3",
    );
    expect(migration).not.toContain("photo_white");
    expect(migration).toContain("document_export_events_package_identity_key_uidx");
    expect(migration).toContain(
      "perform set_config('app.visaflow_complete_export_package', 'on', true)",
    );
    expect(migration).toContain("submissions_export_completion_boundary");
    expect(migration).toContain(
      "before update of status, exported_at on public.submissions",
    );
    expect(migration).toContain("status_history_export_completion_boundary");
    expect(guardHardeningMigration).toContain(
      "coalesce(current_setting('app.visaflow_complete_export_package', true), '') <> 'on'",
    );
    expect(migration).toContain("media_assets_prevent_exported_mutation");
    expect(migration).toContain(
      "before insert or update or delete on public.media_assets",
    );
    expect(migration).toContain(
      'drop policy if exists "document assets admin export update" on public.document_assets',
    );
    expect(migration).toContain(
      "revoke all on table public.document_assets from authenticated",
    );
    expect(migration).toContain(
      "revoke update (export_status) on table public.document_assets from authenticated",
    );
    expect(migration).toContain(
      "revoke all on table public.document_export_events from authenticated",
    );
    expect(migration).toContain(
      "revoke all on table public.export_batches from authenticated",
    );

    const startReturnFunction = migration.slice(
      migration.indexOf("create or replace function public.start_agent_return_package"),
      migration.indexOf(
        "create or replace function public.publish_agent_return_package",
      ),
    );
    expect(startReturnFunction).toContain("from public.export_batches");
    expect(startReturnFunction).not.toMatch(
      /from public\.export_batches[\s\S]{0,240}for update/i,
    );
  });

  test("repairs the terminal ZIP suffix guard without weakening the RPC boundary", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260714190000_fix_complete_export_package_zip_suffix_guard.sql",
    );

    expect(migration).toContain(
      "create or replace function public.complete_export_package(payload jsonb)",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public, app_private");
    expect(migration).toContain(
      "right(lower(document_record.zip_file_name), 4) <> '.zip'",
    );
    expect(migration).not.toMatch(/lower\(document_record\.zip_file_name\)\s*!~/);
    expect(migration).toContain(
      "document_record.zip_file_name <> replace(replace(document_record.zip_file_name, '/', ''), chr(92), '')",
    );
    expect(migration).toContain("position('..' in document_record.zip_file_name) > 0");
    expect(migration).toContain(
      "core_result := app_private.complete_export_package_core(payload)",
    );
    expect(migration).toContain(
      "revoke all on function public.complete_export_package(jsonb) from public",
    );
    expect(migration).toContain(
      "revoke all on function public.complete_export_package(jsonb) from anon",
    );
    expect(migration).toContain(
      "revoke all on function public.complete_export_package(jsonb) from authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.complete_export_package(jsonb) to authenticated",
    );
  });

  test("replaces fixed document counts with the primary and secondary passport policy", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260717050000_admin_passport_review_media_policy.sql",
    );

    expect(migration).toContain("if actor_role is distinct from 'admin' then");
    expect(migration).not.toContain("if actor_role <> 'admin' then");
    expect(migration).toContain(
      "coalesce(array_length(expected_document_asset_ids, 1), 0) <> expected_applicant_count + (coalesce(array_length(submission_ids, 1), 0) * 2)",
    );
    expect(migration).toContain(
      "asset.applicant_id = app_private.primary_applicant_id(asset.submission_id)",
    );
    expect(migration).toContain(
      "issue.value ->> 'status' in ('open', 'fixed_by_agent')",
    );
    expect(migration).toContain("status in ('open', 'fixed')");
    expect(migration).toContain("safe_admin_guard constant text");
    expect(migration).toContain(
      "position(unsafe_admin_guard in function_definition) > 0",
    );
    expect(migration).toContain(
      "Deployed complete_export_package wrapper does not have the reviewed null-safe admin guard",
    );
    expect(migration).toContain(
      "Export document assets must exactly match the primary/secondary passport media policy",
    );
    expect(migration).toContain(
      "revoke all on function public.complete_export_package(jsonb) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.complete_export_package(jsonb) to authenticated",
    );
  });

  test("makes every deployed admin RPC guard null-safe and retires browser repair access", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260714200000_harden_null_safe_admin_rpc_guards.sql",
    );
    const targetFunctions = [
      ["app_private.complete_export_package_core(jsonb)", 1],
      ["app_private.save_submission_draft_without_questionnaire_rows(jsonb)", 2],
      ["public.complete_export_package(jsonb)", 1],
      ["public.publish_agent_return_package(jsonb)", 1],
      ["public.publish_returned_pdf_handoff(jsonb)", 1],
      ["public.repair_incomplete_export_document_completion(text)", 1],
      ["public.start_agent_return_package(jsonb)", 1],
    ] as const;

    for (const [functionIdentity, expectedCount] of targetFunctions) {
      expect(migration).toContain(
        `'${functionIdentity}'::regprocedure, ${expectedCount}`,
      );
    }
    expect(
      targetFunctions.reduce((total, [, expectedCount]) => total + expectedCount, 0),
    ).toBe(8);
    expect(migration).toContain(
      "unsafe_guard constant text := 'actor_role <> ''admin'''",
    );
    expect(migration).toContain(
      "safe_guard constant text := 'actor_role is distinct from ''admin'''",
    );
    expect(migration).toContain(
      "if guard_occurrences <> expected_guard_occurrences then",
    );
    expect(migration).toContain(
      "execute replace(function_definition, unsafe_guard, safe_guard)",
    );
    expect(migration).toContain(
      "raise exception 'A null-unsafe V-19 admin function guard remains after hardening'",
    );
    expectSqlStatement(
      migration,
      "revoke execute on function public.repair_incomplete_export_document_completion(text) from authenticated, anon, public",
    );
  });

  test("binds the complete P1 and A2 proof surface into the readiness hash", () => {
    const verifier = readProjectFile("scripts/verify-production-readiness.mjs");
    const requiredProofPaths = [
      "config/playwright/playwright.supabase-production-export-a1-s1.config.ts",
      "config/playwright/playwright.supabase-production-export-a2-s1-abort.config.ts",
      "src/modules/submissions/submissionActions.ts",
      "tests/e2e-supabase-ui/production-export-a1-s1-helpers.ts",
      "tests/e2e-supabase-ui/production-export-a1-s1-resumable.spec.ts",
      "tests/e2e-supabase-ui/production-lifecycle-helpers.ts",
      "tests/e2e-supabase-ui/production-lifecycle-resumable.spec.ts",
      "tests/unit/appProductionWorkspaceRuntime.spec.tsx",
      "tests/unit/productionCohortNetworkContract.spec.ts",
      "tests/unit/supabaseSecurityContract.spec.ts",
      "tests/unit/v19SubmissionRules.spec.ts",
      "tests/unit/v19SupabasePersistence.spec.ts",
    ];

    for (const proofPath of requiredProofPaths) {
      expect(verifier).toContain(`"${proofPath}"`);
    }
  });

  test("keeps incomplete legacy export repair server-owned, admin-only, and forward-only", () => {
    const repairMigration = readProjectFile(
      "supabase/migrations/20260714110000_repair_incomplete_export_document_completion.sql",
    );

    expect(repairMigration).toContain(
      "create or replace function public.repair_incomplete_export_document_completion(",
    );
    expect(repairMigration).toContain("security definer");
    expect(repairMigration).toContain(
      "set search_path = pg_catalog, public, app_private",
    );
    expect(repairMigration).toContain("for update");
    expect(repairMigration).toContain("Only admins can repair export completion");
    expect(repairMigration).toContain(
      "Export package submissions are not in the exact terminal state",
    );
    expect(repairMigration).toContain(
      "Incomplete export document states are mixed and cannot be repaired",
    );
    expect(repairMigration).toContain(
      "revoke all on function public.repair_incomplete_export_document_completion(text) from authenticated",
    );
    expect(repairMigration).toContain(
      "grant execute on function public.repair_incomplete_export_document_completion(text) to authenticated",
    );
    expect(repairMigration).not.toContain("update public.submissions");
    expect(repairMigration).not.toContain("insert into public.status_history");
    expect(repairMigration).not.toContain("insert into public.export_batches");
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
    expect(migration).toContain(
      "before update of status, exported_at on public.submissions",
    );
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

  test("requires canonical storage identity for review readiness media", () => {
    const readinessMigration = readProjectFile(
      "supabase/migrations/20260703141744_day10_review_readiness_required_media_slots.sql",
    );

    expect(readinessMigration).toContain("m.storage_bucket = 'submission-media'");
    expect(readinessMigration).toContain("m.storage_path !~ '(^/|//|\\.\\.)'");
    expect(readinessMigration).toContain(
      "split_part(m.storage_path, '/', 1) = 'submissions'",
    );
    expect(readinessMigration).toContain("split_part(m.storage_path, '/', 2) = new.id");
    expect(readinessMigration).toContain(
      "split_part(m.storage_path, '/', 3) = 'applicants'",
    );
    expect(readinessMigration).toContain("split_part(m.storage_path, '/', 4) = a.id");
    expect(readinessMigration).toContain(
      "split_part(m.storage_path, '/', 5) = required_media.type::text",
    );
    expect(readinessMigration).toContain("split_part(m.storage_path, '/', 6) <> ''");
    expect(readinessMigration).toContain("split_part(m.storage_path, '/', 7) = ''");
  });

  test("allows only admin same-status waiting-review issue checkpoints", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260712201203_allow_admin_waiting_review_issue_checkpoint.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const sql = normalizeSql(migration);
    const blockingIssueGuard = sql.indexOf(
      "c.severity = 'blocking' and c.status = 'open'",
    );
    const adminCheckpointException = sql.indexOf(
      "actor_role = 'admin' and old.status = 'waiting_review' and new.status = 'waiting_review'",
    );
    const blockingIssueFailure = sql.indexOf(
      "raise exception 'blocking corrections must be fixed before review'",
    );

    expectSqlStatement(
      migration,
      "create or replace function app_private.enforce_submission_review_readiness()",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, app_private");
    expect(migration).toContain("actor_role public.profile_role;");
    expect(migration).toContain("if tg_op = 'UPDATE' then");
    expect(migration).toContain("actor_role := app_private.current_profile_role();");
    expect(
      sql.indexOf("actor_role := app_private.current_profile_role()"),
    ).toBeGreaterThan(blockingIssueGuard);
    expect(blockingIssueGuard).toBeGreaterThan(-1);
    expect(adminCheckpointException).toBeGreaterThan(blockingIssueGuard);
    expect(blockingIssueFailure).toBeGreaterThan(adminCheckpointException);

    for (const preservedGuard of [
      "A single submission must have exactly one applicant before review",
      "A family submission must have applicants before review",
      "Applicant required fields must be complete before review",
      "All required media must be uploaded before review",
    ]) {
      expect(migration).toContain(preservedGuard);
    }

    expect(migration).not.toMatch(/\b(?:grant|revoke)\b/i);
    expect(migration).not.toMatch(/\bcreate\s+policy\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migrationContract).toContain(
      "20260712201203_allow_admin_waiting_review_issue_checkpoint.sql",
    );
    expect(migrationContract).toContain(
      "20260712201203_allow_admin_waiting_review_issue_checkpoint",
    );
  });

  test("keeps the review-readiness rollback exact, forward-only, and ACL checked", () => {
    const previousMigration = readProjectFile(
      "supabase/migrations/20260703165306_day10_review_readiness_storage_identity.sql",
    );
    const rollbackTemplate = readProjectFile(
      "supabase/remediation/20260712201203_allow_admin_waiting_review_issue_checkpoint.rollback.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const promotionRunbook = readProjectFile(
      "docs/release/supabase-production-promotion.md",
    );
    const functionStart = rollbackTemplate.indexOf(
      "create or replace function app_private.enforce_submission_review_readiness()",
    );
    const functionEnd = rollbackTemplate.indexOf("$$;", functionStart) + 3;
    const restoredFunction = rollbackTemplate.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThan(-1);
    expect(functionEnd).toBeGreaterThan(functionStart + 3);
    expect(normalizeSql(restoredFunction)).toBe(normalizeSql(previousMigration));
    expectSqlStatement(
      rollbackTemplate,
      "revoke all on function app_private.enforce_submission_review_readiness() from public, anon, authenticated",
    );
    expect(rollbackTemplate).toContain("has_function_privilege(");
    expect(rollbackTemplate).toContain("'anon'");
    expect(rollbackTemplate).toContain("'authenticated'");
    expect(rollbackTemplate).toContain("function_definition.prosecdef");
    expect(rollbackTemplate).toContain("search_path=public, app_private");
    expect(rollbackTemplate).toContain("submissions_review_readiness_guard");
    expect(rollbackTemplate).toContain("readiness_trigger.tgdeferrable");
    expect(rollbackTemplate).toContain("readiness_trigger.tginitdeferred");
    expect(rollbackTemplate).toContain("readiness_trigger.tgfoid");
    expect(rollbackTemplate).toContain("trigger_record.tgenabled is distinct from 'O'");
    expect(migrationContract).not.toContain(
      "20260712201203_allow_admin_waiting_review_issue_checkpoint.rollback.sql",
    );
    expect(promotionRunbook).toContain(
      "supabase/remediation/20260712201203_allow_admin_waiting_review_issue_checkpoint.rollback.sql",
    );
  });

  test("updates existing returned submissions before insert-on-miss without weakening the global guard", () => {
    const previousMigration = readProjectFile(
      "supabase/migrations/20260710000300_persist_handoff_applicant_projection.sql",
    );
    const migration = readProjectFile(
      "supabase/migrations/20260712225209_save_returned_submission_update_first.sql",
    );
    const globalGuard = readProjectFile(
      "supabase/migrations/20260630235513_allow_trip_date_sync_during_submit_handoff.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const previousLower = previousMigration.toLowerCase();
    const migrationLower = migration.toLowerCase();
    const previousWriteStart = previousLower.indexOf(
      "  insert into public.submissions (",
    );
    const updateStart = migrationLower.indexOf("  update public.submissions");
    const diagnosticsStart = migrationLower.indexOf(
      "  get diagnostics submission_write_count = row_count;",
      updateStart,
    );
    const insertStart = migrationLower.indexOf(
      "    insert into public.submissions (",
      diagnosticsStart,
    );
    const childrenStart = migrationLower.indexOf(
      "  if can_write_children then",
      insertStart,
    );
    const previousChildrenStart = previousLower.indexOf(
      "  if can_write_children then",
      previousWriteStart,
    );
    const updateStatement = migration.slice(updateStart, diagnosticsStart);
    const submissionWrite = migration.slice(updateStart, childrenStart);
    const migrationPrefix = migration
      .slice(0, updateStart)
      .replace(" SECURITY INVOKER\n", "")
      .replace("  submission_write_count integer := 0;\n", "");
    const normalizedPreviousSuffix = normalizeSql(
      previousMigration.slice(previousChildrenStart),
    ).replace(/;$/, "");
    const normalizedMigrationSuffix = normalizeSql(
      migration.slice(childrenStart),
    ).replace(/;$/, "");

    expect(previousWriteStart).toBeGreaterThan(-1);
    expect(updateStart).toBeGreaterThan(-1);
    expect(diagnosticsStart).toBeGreaterThan(updateStart);
    expect(insertStart).toBeGreaterThan(diagnosticsStart);
    expect(childrenStart).toBeGreaterThan(insertStart);
    expect(normalizeSql(migrationPrefix)).toBe(
      normalizeSql(previousMigration.slice(0, previousWriteStart)),
    );
    expect(normalizedMigrationSuffix).toBe(normalizedPreviousSuffix);

    expect(migration).toContain(" SECURITY INVOKER");
    expect(migration).toContain(" SET search_path TO 'public'");
    expect(migration).not.toContain("SECURITY DEFINER");
    expect(migration).not.toContain("app_private.enforce_submission_agent_mutation");
    expect(updateStatement).toContain("where id = submission_record.id;");
    expect(updateStatement).not.toMatch(/\bagent_id\s*=/i);
    expect(submissionWrite).toContain(
      "get diagnostics submission_write_count = row_count;",
    );
    expect(submissionWrite).toContain("if submission_write_count = 0 then");
    expect(submissionWrite).toContain("insert into public.submissions (");
    expect(submissionWrite).toContain("submission_record.agent_id,");
    expect(submissionWrite).not.toContain("on conflict (id) do update");

    expect(globalGuard).toContain("if tg_op = 'INSERT' then");
    expect(globalGuard).toContain(
      "new.status not in ('draft', 'filling', 'ready_for_review', 'waiting_review')",
    );
    expect(globalGuard).toContain("if old.status = 'returned' then");
    expect(globalGuard).toContain(
      "new.status not in ('returned', 'ready_for_review', 'waiting_review')",
    );
    expect(migrationContract).toContain(
      "20260712225209_save_returned_submission_update_first.sql",
    );
    expect(migrationContract).toContain(
      "20260712225209_save_returned_submission_update_first",
    );
  });

  test("keeps the returned-save rollback exact, forward-only, and ACL checked", () => {
    const previousMigration = readProjectFile(
      "supabase/migrations/20260710000300_persist_handoff_applicant_projection.sql",
    );
    const rollbackTemplate = readProjectFile(
      "supabase/remediation/20260712225209_save_returned_submission_update_first.rollback.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const promotionRunbook = readProjectFile(
      "docs/release/supabase-production-promotion.md",
    );
    const functionStart = rollbackTemplate.indexOf(
      "CREATE OR REPLACE FUNCTION app_private.save_submission_draft_without_questionnaire_rows(payload jsonb)",
    );
    const functionDelimiter = rollbackTemplate.indexOf("$function$;", functionStart);
    const functionEnd = functionDelimiter + "$function$".length;
    const restoredFunction = rollbackTemplate.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThan(-1);
    expect(functionDelimiter).toBeGreaterThan(functionStart);
    expect(normalizeSql(restoredFunction)).toBe(normalizeSql(previousMigration));
    expectSqlStatement(
      rollbackTemplate,
      "revoke all on function app_private.save_submission_draft_without_questionnaire_rows(jsonb) from public, anon",
    );
    expectSqlStatement(
      rollbackTemplate,
      "grant execute on function app_private.save_submission_draft_without_questionnaire_rows(jsonb) to authenticated",
    );
    expect(rollbackTemplate).toContain("function_definition.prosecdef");
    expect(rollbackTemplate).toContain("search_path=public");
    expect(rollbackTemplate).toContain("is distinct from false");
    expect(rollbackTemplate).toContain("has_function_privilege(");
    expect(rollbackTemplate).toContain("'anon'");
    expect(rollbackTemplate).toContain("'authenticated'");
    expect(rollbackTemplate).not.toContain(
      "app_private.enforce_submission_agent_mutation",
    );
    expect(migrationContract).not.toContain(
      "20260712225209_save_returned_submission_update_first.rollback.sql",
    );
    expect(promotionRunbook).toContain(
      "supabase/remediation/20260712225209_save_returned_submission_update_first.rollback.sql",
    );
    expect(promotionRunbook).toContain(
      "The global submission mutation trigger is not changed",
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

  test("persists typed cockpit status history source and note without mutable audit patches", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260707000100_typed_status_history_source.sql",
    );

    expect(migration).toContain(
      "add column if not exists source text not null default 'system'",
    );
    expect(migration).toContain("add column if not exists note text");
    expect(migration).toContain("status_history_source_check");
    expect(migration).toContain("source in ('agent', 'admin', 'bb', 'system')");
    expect(migration).toContain("payload_without_status_history");
    expect(migration).toContain("payload_without_status_history");
    expect(migration).toContain("insert into public.status_history");
    expect(migration).toContain("source,");
    expect(migration).toContain("note,");
    expect(migration).toContain(
      "jsonb_to_recordset(coalesce(payload -> 'status_history'",
    );
    expect(migration).toContain(
      "history_payload.source in ('agent', 'admin', 'bb', 'system')",
    );
    expect(migration).toContain("history_payload.note");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).not.toContain("update public.status_history");
  });

  test("keeps media access private with signed URLs instead of public URLs", () => {
    const mediaStorage = readProjectFile("src/modules/submissions/mediaStorage.ts");
    const appSource = readProjectFile("src/App.tsx");

    expect(mediaStorage).toContain(".createSignedUrl(");
    expect(mediaStorage).not.toContain(".getPublicUrl(");
    expect(appSource).not.toContain("/storage/v1/object/public/");
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
    expect(handoffMigration).toContain(
      "result := public.save_submission_draft(payload)",
    );
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
    expect(profilePreservationMigration).toContain("full_name = excluded.full_name");
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

  test("keeps returned PDF storage policies aligned with generated client paths", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260627001000_returned_pdf_storage_policies.sql",
    );
    const securityInvokerMigration = readProjectFile(
      "supabase/migrations/20260630222703_returned_pdf_handoff_security_invoker.sql",
    );
    const readPolicy =
      sqlStatements(migration).find((statement) =>
        statement.includes('create policy "media storage read owner or admin"'),
      ) ?? "";

    for (const policyName of [
      'create policy "media storage read owner or admin"',
      'create policy "media storage write editable owner or admin"',
      'create policy "media storage update editable owner or admin"',
      'create policy "media storage delete editable owner or admin"',
    ]) {
      expect(migration).toContain(policyName);
    }

    expect(migration).toContain(
      "create table if not exists public.returned_pdf_handoff_artifacts",
    );
    expect(migration).toContain(
      "alter table public.returned_pdf_handoff_artifacts enable row level security",
    );
    expect(migration).toContain(
      'create policy "returned pdf handoff artifacts read owner or admin"',
    );
    expect(migration).toContain("applicants_id_submission_id_uidx");
    expect(migration).toContain(
      "constraint returned_pdf_handoff_artifacts_applicant_submission_fkey",
    );
    expect(migration).toContain("split_part(storage_path, '/', 1) = submission_id");
    expect(migration).toContain("split_part(storage_path, '/', 2) = applicant_id");
    expect(migration).toContain("returned_pdf_handoff_artifacts_storage_uidx");
    expect(migration).toContain("returned_pdf_handoff_artifacts_submission_idx");
    expect(migration).toContain("returned_pdf_handoff_artifacts_applicant_idx");
    expect(migration).toContain(
      "create or replace function public.publish_returned_pdf_handoff(payload jsonb)",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain(
      "revoke all on public.returned_pdf_handoff_artifacts from anon, authenticated",
    );
    expect(migration).toContain(
      "grant select on public.returned_pdf_handoff_artifacts to authenticated",
    );
    expect(migration).not.toContain(
      "grant select, insert, update, delete on public.returned_pdf_handoff_artifacts to authenticated",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("actor_role <> 'admin'");
    expect(migration).toContain(
      "Returned PDF mismatch issues must be closed before handoff",
    );
    expect(migration).toContain(
      "Returned PDF handoff requires a durable export package identity",
    );
    expect(migration).toContain(
      "Returned PDF handoff owner does not match submission owner",
    );
    expect(migration).toContain("snapshot #>> '{exportPackage,idempotencyKey}'");
    expect(migration).toContain("snapshot #>> '{returnedPdfPackage,ownerAgentId}'");
    expect(migration).toContain(
      "Returned PDF blocked reviews must be resolved before handoff",
    );
    expect(migration).toContain(
      "Returned PDF handoff requires exactly one ready application PDF per applicant",
    );
    expect(migration).toContain("ready_application_pdfs jsonb");
    expect(migration).toContain("into ready_application_pdfs");
    expect(migration).toContain("from jsonb_array_elements(ready_application_pdfs)");
    expect(migration).toContain(
      "expected_handoff_count := current_applicant_count + 1",
    );
    expect(migration).toContain("existing_handoff_count > 0");
    expect(migration).toContain("'duplicate', true");
    expect(migration).toContain(
      "Returned PDF handoff was already published with different artifacts",
    );
    expect(migration).not.toContain(
      "delete from public.returned_pdf_handoff_artifacts",
    );
    expect(migration).toContain("from storage.objects stored_common_pdf");
    expect(migration).toContain(
      "stored_common_pdf.bucket_id = common_artifact ->> 'storageBucket'",
    );
    expect(migration).toContain("from storage.objects stored_application_pdf");
    expect(migration).toContain(
      "stored_application_pdf.name = application_pdf.artifact ->> 'storagePath'",
    );
    expect(migration).toContain("lower(left(common_artifact ->> 'sha256', 16))");
    expect(migration).toContain(
      "lower(left(application_pdf.artifact ->> 'sha256', 16))",
    );
    expect(migration).toContain("_appointment_pdf\\\\.pdf$");
    expect(migration).toContain("_visa_application_pdf\\\\.pdf$");
    expect(migration).not.toContain("limit 1");
    expect(migration).toContain(
      "insert into public.returned_pdf_handoff_artifacts (\n    submission_id,",
    );
    expect(migration).toContain(
      "select\n    target_submission_id,\n    ready_application_pdf.value ->> 'applicantId'",
    );
    expect(migration).not.toContain(
      "insert into public.returned_pdf_handoff_artifacts (\n    target_submission_id,",
    );
    expect(migration).toContain(
      "grant execute on function public.publish_returned_pdf_handoff(jsonb) to authenticated",
    );
    expect(securityInvokerMigration).toContain(
      "alter function public.publish_returned_pdf_handoff(jsonb) security invoker",
    );
    expect(securityInvokerMigration).toContain(
      "grant insert on public.returned_pdf_handoff_artifacts to authenticated",
    );
    expect(securityInvokerMigration).toContain(
      'create policy "returned pdf handoff artifacts admin insert"',
    );
    expect(securityInvokerMigration).toContain(
      "(select app_private.current_profile_role()) = 'admin'",
    );
    expect(securityInvokerMigration).not.toContain("grant update");
    expect(securityInvokerMigration).not.toContain("grant delete");
    expect(migration).toContain("'visa_application_pdf'");
    expect(migration).toContain("'appointment_pdf'");
    expect(migration).toContain("split_part(name, '/', 2) = 'common'");
    expect(migration).toContain("split_part(name, '/', 3) = 'appointment_pdf'");
    expect(migration).toContain(
      "split_part(name, '/', 3) = 'visa_application_pdf' and storage.extension(name) = 'pdf'",
    );
    expect(migration).toContain("storage.extension(name) = 'pdf'");
    expect(migration).toContain("a.id = split_part(name, '/', 2)");
    expect(migration).toContain("a.submission_id = split_part(name, '/', 1)");
    expect(migration).toContain(
      "select id from public.submissions where agent_id = (select auth.uid())",
    );
    expect(migration).toContain(
      "split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan')",
    );
    expect(readPolicy).toContain(
      normalizeSql("from public.returned_pdf_handoff_artifacts h"),
    );
    expect(readPolicy).toContain(normalizeSql("h.storage_path = name"));
    expect(readPolicy).toContain(normalizeSql("s.agent_id = (select auth.uid())"));
    expect(migration).toContain(
      "from public.returned_pdf_handoff_artifacts published_handoff",
    );
    expect(migration).toContain("published_handoff.storage_bucket = bucket_id");
    expect(migration).toContain("published_handoff.storage_path = name");
    expect(migration).not.toContain("photo_white");
    expect(migration).not.toContain("video");
    expect(migration).not.toContain("storage.extension(name) = 'mp4'");
    expect(readPolicy).toContain(
      normalizeSql(
        "split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan') and split_part(name, '/', 1) in ( select id from public.submissions where agent_id = (select auth.uid()) )",
      ),
    );
    expect(readPolicy).not.toContain(
      normalizeSql(
        "or split_part(name, '/', 1) in ( select id from public.submissions where agent_id = (select auth.uid()) )",
      ),
    );
    expect(migration).toContain(
      "status in ('draft', 'filling', 'returned', 'ready_for_review')",
    );
  });

  test("creates private submission media bucket and locks day-10 storage paths", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260703115102_day10_submission_media_bucket_policies.sql",
    );

    expect(migration).toContain("insert into storage.buckets");
    expect(migration).toContain("'submission-media'");
    expect(migration).toContain("public = false");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'image/png'");
    expect(migration).toContain("'image/heic'");
    expect(migration).toContain("'image/heif'");
    expect(migration).toContain("'application/pdf'");
    expect(migration).toContain("file_size_limit");
    expect(migration).toContain("52428800");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("to anon");
    expect(migration).not.toContain("for all");
    expect(migration).toContain("name !~ '(^/|//|(^|/)\\.\\.?(/|$))'");
    expect(migration).toContain("split_part(name, '/', 1) = 'submissions'");
    expect(migration).toContain("split_part(name, '/', 3) = 'applicants'");
    expect(migration).toContain(
      "split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')",
    );
    expect(migration).toContain("split_part(name, '/', 1) <> 'submissions'");
    expect(migration).toContain(
      "split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')",
    );
    expect(migration).toContain("split_part(name, '/', 3) = 'common'");
    expect(migration).toContain(
      "split_part(name, '/', 4) in ('application_pdf', 'appointment_pdf')",
    );
    expect(migration).toContain("split_part(name, '/', 2) = 'common'");
    expect(migration).toContain(
      "split_part(name, '/', 3) in ('application_pdf', 'appointment_pdf')",
    );
    expect(migration).toContain("where agent_id = (select auth.uid())");
    expect(migration).toContain(
      "status in ('draft', 'filling', 'returned', 'ready_for_review')",
    );
    expect(migration).toContain("from public.admin_pdf_artifacts a");
    expect(migration).toContain("from public.returned_pdf_handoff_artifacts h");
    expect(migration).toContain(
      "storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf')",
    );
    expect(migration).toContain(
      "coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/heic', 'image/heif')",
    );
    expect(migration).toContain(
      "coalesce(metadata ->> 'mimetype', '') = 'application/pdf'",
    );
  });

  test("rejects legacy submission-media object paths as write targets", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260703115102_day10_submission_media_bucket_policies.sql",
    );
    const insertStart = migration.indexOf(
      'create policy "media storage write editable owner or admin"',
    );
    const updateStart = migration.indexOf(
      'create policy "media storage update editable owner or admin"',
    );
    const deleteStart = migration.indexOf(
      'create policy "media storage delete editable owner or admin"',
    );
    const insertPolicy = normalizeSql(migration.slice(insertStart, updateStart));
    const updatePolicy = migration.slice(updateStart, deleteStart);
    const updateWithCheck = normalizeSql(
      updatePolicy.slice(updatePolicy.lastIndexOf("with check (")),
    );

    for (const writePolicy of [insertPolicy, updateWithCheck]) {
      expect(writePolicy).not.toContain(
        normalizeSql("split_part(name, '/', 1) <> 'submissions'"),
      );
      expect(writePolicy).not.toContain(
        normalizeSql("split_part(name, '/', 2) = 'common'"),
      );
      expect(writePolicy).toContain(
        normalizeSql("split_part(name, '/', 1) = 'submissions'"),
      );
      expect(writePolicy).toContain(
        normalizeSql("split_part(name, '/', 3) = 'applicants'"),
      );
    }
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

  test("keeps AI helper SQL intent whitelists aligned with the shared Edge contract", () => {
    const intentContractMigration = readProjectFile(
      "supabase/migrations/20260706000100_ai_helper_admin_intent_quota_contract.sql",
    );
    const normalizedMigration = normalizeSql(intentContractMigration);
    const statements = sqlStatements(intentContractMigration);
    const auditConstraint = statements.find((statement) =>
      statement.includes("add constraint ai_helper_audit_events_intent_check"),
    );
    const quotaConstraint = statements.find((statement) =>
      statement.includes("add constraint ai_helper_quota_counters_intent_check"),
    );
    const quotaRpcStart = normalizedMigration.indexOf(
      "create or replace function public.consume_ai_helper_quota",
    );
    const quotaRpcEnd = normalizedMigration.indexOf(
      "revoke all on function public.consume_ai_helper_quota",
      quotaRpcStart,
    );
    const quotaRpc =
      quotaRpcStart >= 0 && quotaRpcEnd > quotaRpcStart
        ? normalizedMigration.slice(quotaRpcStart, quotaRpcEnd)
        : undefined;

    expect(auditConstraint).toBeDefined();
    expect(quotaConstraint).toBeDefined();
    expect(quotaRpc).toBeDefined();

    for (const intent of aiHelperIntents) {
      expect(auditConstraint).toContain(`'${intent}'`);
      expect(quotaConstraint).toContain(`'${intent}'`);
      expect(quotaRpc).toContain(`'${intent}'`);
    }

    expect(auditConstraint).toContain("'passport_extraction'");
    expect(quotaConstraint).not.toContain("'passport_extraction'");
    expect(quotaRpc).not.toContain("'passport_extraction'");
    expectSqlStatement(
      intentContractMigration,
      "alter table public.ai_helper_audit_events drop constraint if exists ai_helper_audit_events_intent_check",
    );
    expectSqlStatement(
      intentContractMigration,
      "alter table public.ai_helper_quota_counters drop constraint if exists ai_helper_quota_counters_intent_check",
    );
    expectSqlStatement(
      intentContractMigration,
      "revoke execute on function public.consume_ai_helper_quota(text, text, text, text) from anon, authenticated",
    );
    expectSqlStatement(
      intentContractMigration,
      "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to service_role",
    );
    expectNoSqlStatement(
      intentContractMigration,
      "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to public",
    );
  });

  test("keeps media review state server-owned and binds media to its applicant submission", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260710021043_harden_media_asset_review_boundary.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );

    expectSqlStatement(
      migration,
      "create or replace function app_private.enforce_media_asset_review_boundary()",
    );
    expectSqlStatement(migration, "if actor_role = 'agent' then");
    expectSqlStatement(
      migration,
      "raise exception 'Agents cannot set media review state'",
    );
    expectSqlStatement(
      migration,
      "raise exception 'Agents cannot preserve or set media review state while changing media'",
    );
    expectSqlStatement(
      migration,
      "where applicant.id = new.applicant_id and applicant.submission_id = new.submission_id",
    );
    expectSqlStatement(
      migration,
      "create trigger media_assets_enforce_review_boundary",
    );
    expectSqlStatement(
      migration,
      "create unique index if not exists applicants_id_submission_id_uidx",
    );
    expectSqlStatement(
      migration,
      "create index if not exists media_assets_applicant_submission_idx",
    );
    expectSqlStatement(
      migration,
      "add constraint media_assets_applicant_submission_fkey",
    );
    expectSqlStatement(
      migration,
      "foreign key (applicant_id, submission_id) references public.applicants (id, submission_id)",
    );
    expectSqlStatement(
      migration,
      "alter table public.media_assets validate constraint media_assets_applicant_submission_fkey",
    );
    expect(migrationContract).toContain(
      "20260710021043_harden_media_asset_review_boundary.sql",
    );
  });

  test("cascades a normalized media identity into its server-owned document projection", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260715000000_document_assets_source_media_id_update_cascade.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );

    expectSqlStatement(
      migration,
      "alter table public.document_assets drop constraint if exists document_assets_source_media_asset_id_fkey",
    );
    expectSqlStatement(
      migration,
      "foreign key (source_media_asset_id) references public.media_assets (id) on delete cascade on update cascade",
    );
    expect(migrationContract).toContain(
      "20260715000000_document_assets_source_media_id_update_cascade.sql",
    );
  });

  test("requires passports for every applicant and selfies only for the primary applicant", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260717050000_admin_passport_review_media_policy.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const sql = normalizeSql(migration);

    for (const expected of [
      "create or replace function app_private.primary_applicant_id(target_submission_id text)",
      "create or replace function app_private.cockpit_primary_applicant_id(snapshot jsonb)",
      "applicant.role in ('main', 'Основной заявитель')",
      "when count(*) filter ( where applicant.role in ('main', 'Основной заявитель') ) > 1 then null",
      "when count(*) filter ( where applicant.value ->> 'role' in ('main', 'Основной заявитель') ) > 1 then null",
      "A submission must have one unambiguous primary applicant before review",
      "Cockpit export requires one unambiguous primary applicant",
      "Export requires one unambiguous primary applicant",
      "required_media.type = 'passport_scan'::public.media_slot_type or a.id = app_private.primary_applicant_id(new.id)",
      "file.value ->> 'type' = 'passport_scan' or applicant.value ->> 'id' = app_private.cockpit_primary_applicant_id(cockpit.snapshot)",
      "m.type = 'passport_scan' or a.id = app_private.primary_applicant_id(a.submission_id)",
      "when applicant.value ->> 'id' = app_private.cockpit_primary_applicant_id(cockpit.snapshot) then 3 else 1",
      "when a.id = app_private.primary_applicant_id(a.submission_id) then 3 else 1",
    ]) {
      expect(sql).toContain(normalizeSql(expected));
    }

    expect(migration).toContain(
      "revoke all on function app_private.primary_applicant_id(text) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function app_private.cockpit_primary_applicant_id(jsonb) from public, anon, authenticated;",
    );
    expect(migrationContract).toContain(
      "20260717050000_admin_passport_review_media_policy.sql",
    );
  });

  test("assigns immutable global submission numbers on the database", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260718190000_global_submission_public_numbers.sql",
    );
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );

    expectSqlStatement(
      migration,
      "create sequence if not exists public.submission_public_number_seq as bigint minvalue 1 maxvalue 9999 start with 1001 no cycle",
    );
    expectSqlStatement(
      migration,
      "create unique index submissions_public_number_uidx on public.submissions (public_number)",
    );
    expect(migration).toContain("Submission public number is immutable");
    expect(migration).toContain(
      "nextval('public.submission_public_number_seq')",
    );
    expectSqlStatement(
      migration,
      "revoke all on function app_private.assign_submission_public_number() from public",
    );
    expect(migrationContract).toContain(
      "20260718190000_global_submission_public_numbers.sql",
    );
  });

  test("assigns public numbers only after a complete questionnaire through a protected RPC", () => {
    const migrationFileName =
      "20260719160000_assign_public_number_after_questionnaire.sql";
    const previousMigrationFileName =
      "20260718190000_global_submission_public_numbers.sql";
    const migration = readProjectFile(`supabase/migrations/${migrationFileName}`);
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const sql = normalizeSql(migration);
    const existingNumberReturn = sql.indexOf(
      "if submission_record.public_number is not null then",
    );
    const questionnaireGuard = sql.indexOf(
      "questionnaire must be complete before assigning public number",
    );
    const sequenceAdvance = sql.indexOf(
      "next_number := nextval('public.submission_public_number_seq')",
    );
    const previousMigrationIndex = migrationContract.indexOf(
      `"${previousMigrationFileName}"`,
    );
    const migrationIndex = migrationContract.indexOf(`"${migrationFileName}"`);

    expectSqlStatement(
      migration,
      "alter table public.submissions alter column public_number drop not null",
    );
    expectSqlStatement(
      migration,
      "create or replace function public.ensure_submission_public_number(submission_id text)",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain("actor_id uuid := auth.uid()");
    expect(migration).toContain(
      "actor_role public.profile_role := app_private.current_profile_role()",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain(
      "submission_record.agent_id <> actor_id and actor_role <> 'admin'",
    );
    expect(migration).toContain("applicant.questionnaire_percent < 100");
    expect(migration).toContain("'assignedNow', false");
    expect(migration).toContain("'assignedNow', true");
    expect(migration).toContain(
      "set_config('app.v19_public_number_assignment', 'allowed', true)",
    );
    expect(migration).toContain(
      "Submission public number must be assigned through ensure_submission_public_number",
    );
    expect(migration).toContain("Submission public number is immutable");
    expect(existingNumberReturn).toBeGreaterThan(-1);
    expect(questionnaireGuard).toBeGreaterThan(existingNumberReturn);
    expect(sequenceAdvance).toBeGreaterThan(questionnaireGuard);

    expectSqlStatement(
      migration,
      "revoke all on function app_private.assign_submission_public_number() from public, anon, authenticated",
    );
    expectSqlStatement(
      migration,
      "revoke all on function public.ensure_submission_public_number(text) from public, anon",
    );
    expectSqlStatement(
      migration,
      "grant execute on function public.ensure_submission_public_number(text) to authenticated",
    );
    expectNoSqlStatement(
      migration,
      "grant execute on function public.ensure_submission_public_number(text) to anon",
    );
    expectNoSqlStatement(
      migration,
      "grant execute on function public.ensure_submission_public_number(text) to public",
    );
    expectSqlStatement(
      migration,
      "revoke all on sequence public.submission_public_number_seq from anon, authenticated",
    );

    expect(previousMigrationIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeGreaterThan(previousMigrationIndex);
  });
});
