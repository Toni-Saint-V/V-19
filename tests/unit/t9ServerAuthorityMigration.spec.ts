import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260729060000_harden_t9_server_authority.sql";

function migrationSql(): string {
  return readFileSync(`${process.cwd()}/${migrationPath}`, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("T9 server-authority hardening migration", () => {
  test("accepts only canonical XLSX package identity", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "if batch_record.format is distinct from 'xlsx' then raise exception 'export package format must be xlsx'",
    );
    expect(sql).toContain(
      "right(lower(batch_record.file_name), 5) <> '.xlsx'",
    );
    expect(sql).toContain(
      "right(lower(document_record.workbook_file_name), 5) <> '.xlsx'",
    );
    expect(sql).toContain(
      "if cockpit_snapshot_count is distinct from current_submission_count then raise exception 'export package requires a canonical cockpit snapshot for every submission'",
    );
    expect(sql).toContain(
      "cockpit_identity_check constant text := 'export_identity.export_package ->> ''contentfingerprint'' is distinct from batch_record.content_fingerprint'",
    );
  });

  test("locks and binds every exact document asset to private Storage", () => {
    const sql = migrationSql();

    expect(sql).toContain("join storage.objects as storage_object");
    expect(sql).toContain(
      "storage_object.bucket_id = asset.bucket and storage_object.name = asset.storage_path",
    );
    expect(sql).toContain("asset.bucket = 'submission-media'");
    expect(sql).toContain("for key share of storage_object");
    expect(sql).toContain("count(distinct locked_object.object_id)");
    expect(sql).toContain(
      "locked_storage_match_count <> provided_asset_count or locked_storage_object_count <> provided_asset_count",
    );
    expect(sql).toContain(
      "export package storage objects do not match document assets",
    );
  });

  test("fails closed on drift and preserves the exact Admin execution boundary", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "pg_catalog.pg_get_functiondef( 'app_private.complete_export_package_core(jsonb)'::regprocedure::oid )",
    );
    expect(sql).toContain(
      "pg_catalog.pg_get_functiondef( 'public.complete_export_package(jsonb)'::regprocedure::oid )",
    );
    expect(sql).toContain(
      "t9 core does not match one complete reviewed identity state",
    );
    expect(sql).toContain(
      "t9 wrapper does not match one complete reviewed storage state",
    );
    expect(sql).toContain(
      "if actor_role is distinct from ''admin'' then",
    );
    expect(sql).toContain("position(unsafe_admin_guard in core_definition) > 0");
    expect(sql).toContain(
      "position(unsafe_admin_guard in wrapper_definition) > 0",
    );
    expect(sql).toContain(
      "revoke all on function app_private.complete_export_package_core(jsonb) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.complete_export_package(jsonb) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.complete_export_package(jsonb) to authenticated",
    );
  });

  test("changes function definitions only and does not broaden schema or table rights", () => {
    const sql = migrationSql();

    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("create policy");
    expect(sql).not.toContain("grant select");
    expect(sql).not.toContain("grant insert");
    expect(sql).not.toContain("grant update");
    expect(sql).not.toContain("grant delete");
  });
});
