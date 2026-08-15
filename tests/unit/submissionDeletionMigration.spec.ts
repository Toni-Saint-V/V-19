import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815000100_agent_submission_deletion.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("agent submission deletion migration", () => {
  it("uses an owned revision-checked two-phase deletion receipt", () => {
    expect(migration).toContain("begin_agent_submission_deletion");
    expect(migration).toContain("finalize_agent_submission_deletion");
    expect(migration).toContain("cancel_agent_submission_deletion");
    expect(migration).toContain(
      "mark_agent_submission_deletion_cleanup_started",
    );
    expect(migration).toContain("cleanup_started_at is not null");
    expect(migration).toContain("receipt.cleanup_started_at is null");
    expect(migration).toContain(
      "and receipt.cleanup_started_at is not null\n      and storage_object ->> 'bucket'",
    );
    expect(migration).toContain("owner_id is distinct from actor_id");
    expect(migration).toContain("submission_status not in ('draft', 'filling')");
    expect(migration).toContain("current_revision is distinct from expected_revision");
    expect(migration).toContain("V19_AGENT_SUBMISSION_CONFLICT");
    expect(migration).toContain("if receipt.completed_at is not null then");
    expect(migration).toContain("return receipt.result");
  });

  it("blocks concurrent mutation and requires exact private-media cleanup", () => {
    expect(migration).toContain("block_submission_mutation_during_deletion");
    expect(migration).toContain("agent submission deletion receipt storage cleanup");
    expect(migration).toContain("bucket_id in ('submission-media', 'submission-files')");
    expect(migration).toContain(
      "jsonb_to_recordset(receipt.storage_objects)",
    );
    expect(migration).toContain(
      "Submission storage objects must be deleted before finalization",
    );
    expect(migration).toContain("as restrictive for insert");
    expect(migration).toContain("as restrictive for update");
    expect(migration).toContain("pg_advisory_xact_lock_shared");
    expect(migration).toContain(
      "Submission storage namespace must be empty before finalization",
    );
    expect(migration).toContain("delete from public.status_history");
    expect(migration).toContain("delete from public.submissions");
  });

  it("does not grant direct receipt-table access", () => {
    expect(migration).toContain(
      "revoke all on app_private.agent_submission_deletion_receipts",
    );
    expect(migration).not.toContain(
      "grant select on app_private.agent_submission_deletion_receipts",
    );
  });
});
