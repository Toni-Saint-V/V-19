import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260812090000_workbook_export_lifecycle.sql";

function migrationSource() {
  return readFileSync(`${process.cwd()}/${migrationPath}`, "utf8").toLowerCase();
}

describe("workbook export lifecycle migration", () => {
  test("keeps immutable revision-bound receipts separate from artifact batches", () => {
    const source = migrationSource();

    expect(source).toContain("create table public.workbook_export_receipts");
    expect(source).toContain("create table public.workbook_export_receipt_members");
    expect(source).toContain("acceptance_case_revision");
    expect(source).toContain("terminal_case_revision");
    expect(source).not.toMatch(/update\s+public\.export_batches[\s\S]*downloaded_at/);
  });

  test("exposes only strict admin entrypoints and keeps helpers private", () => {
    const source = migrationSource();

    for (const functionName of [
      "record_export_workbook_download_acknowledgement",
      "complete_workbook_export",
      "reconcile_workbook_export",
    ]) {
      expect(source).toContain(`create or replace function public.${functionName}`);
      expect(source).toContain(
        `revoke all on function public.${functionName}(jsonb) from public, anon, authenticated`,
      );
      expect(source).toContain(
        `grant execute on function public.${functionName}(jsonb) to authenticated`,
      );
    }
    expect(source).toContain("set search_path = ''");
    expect(source).toContain("app_private.current_profile_role() is distinct from 'admin'");
    expect(source).toContain(
      "revoke all on function app_private.validate_workbook_export_payload(jsonb) from public, anon, authenticated",
    );
  });

  test("guards overlap, stale revisions, terminal linkage, and exact revision deltas", () => {
    const source = migrationSource();

    expect(source).toContain("workbook export selection overlaps an active receipt");
    expect(source).toContain("workbook export acceptance revision is stale");
    expect(source).toContain("app.visaflow_workbook_export_completion");
    expect(source).toContain("terminal_case_revision");
    expect(source).toContain("workbook export receipt is not acknowledged");
    expect(source).toContain("workbook export status is unknown");
  });
});
