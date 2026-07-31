import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728191313_archive_agent_submission_cards.sql",
  ),
  "utf8",
).toLowerCase();

describe("agent submission card archive migration", () => {
  it("uses an RLS-protected audit table and an RPC-only security boundary", () => {
    expect(migration).toContain(
      "alter table public.agent_submission_card_archives enable row level security",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public, app_private");
    expect(migration).toContain("set row_security = on");
    expect(migration).toContain(
      "grant execute on function public.archive_agent_submission_card(text, bigint)",
    );
    expect(migration).toContain(
      "revoke delete, truncate on public.submissions from anon, authenticated",
    );
  });

  it("limits agent archives to owned draft or filling rows at the current revision", () => {
    expect(migration).toContain(
      "actor_role is distinct from 'agent'",
    );
    expect(migration).toContain("submission.agent_id = (select auth.uid())");
    expect(migration).toContain("submission.status in ('draft', 'filling')");
    expect(migration).toContain("submission.case_revision = case_revision");
    expect(migration).toContain(
      "current_submission.case_revision <> expected_case_revision",
    );
  });

  it("serializes idempotency readback behind the parent row lock", () => {
    const rowLockIndex = migration.indexOf("for update;");
    const idempotencyReadIndex = migration.indexOf(
      "select archive.*\n  into existing_archive",
    );

    expect(rowLockIndex).toBeGreaterThan(-1);
    expect(idempotencyReadIndex).toBeGreaterThan(rowLockIndex);
  });

  it("keeps archive rows immutable to authenticated clients", () => {
    expect(migration).toContain(
      "revoke all on public.agent_submission_card_archives\n  from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select on public.agent_submission_card_archives",
    );
    expect(migration).not.toContain(
      "grant select, insert on public.agent_submission_card_archives",
    );
    expect(migration).not.toContain(
      "grant insert on public.agent_submission_card_archives",
    );
    expect(migration).not.toContain(
      "on public.agent_submission_card_archives\nfor delete",
    );
  });

  it("serializes stale-tab mutations and rejects them after archival", () => {
    expect(migration).toContain(
      "create or replace function app_private.agent_submission_card_mutation_allowed",
    );
    expect(migration).toContain(
      "from public.submissions submission\n  where submission.id = target_submission_id",
    );
    expect(migration).toContain("for update;");
    expect(migration).toContain(
      "v19_agent_submission_archived_mutation_blocked",
    );
    expect(migration).toContain(
      "v19_agent_submission_archived_reassign_blocked",
    );
    expect(migration).toContain(
      "new.agent_id is distinct from old.agent_id",
    );
    expect(migration).toContain(
      "create or replace function app_private.status_history_parent_submission_id",
    );
    for (const entityType of [
      "submission",
      "applicant",
      "media",
      "appointment",
    ]) {
      expect(migration).toContain(`when '${entityType}' then`);
    }

    for (const table of [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "appointments",
      "status_history",
      "submission_files",
    ]) {
      expect(migration).toContain(
        `create trigger ${table}_agent_card_archive_fence`,
      );
    }
  });

  it("fences both submission storage buckets with restrictive policies", () => {
    expect(migration).toContain(
      "create policy agent_card_archive_storage_insert_fence\non storage.objects\nas restrictive",
    );
    expect(migration).toContain(
      "create policy agent_card_archive_storage_update_fence\non storage.objects\nas restrictive",
    );
    expect(migration).toContain(
      "create policy agent_card_archive_storage_delete_fence\non storage.objects\nas restrictive",
    );
    expect(migration).toContain(
      "bucket_id not in ('submission-media', 'submission-files')",
    );
    expect(migration).toContain(
      "when bucket_id = 'submission-media'\n        and split_part(name, '/', 1) = 'submissions'",
    );
  });
});
