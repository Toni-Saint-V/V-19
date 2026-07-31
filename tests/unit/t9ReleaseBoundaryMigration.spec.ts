import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260731000000_block_t9_until_approved_contract.sql";

function migrationSql(): string {
  return readFileSync(`${process.cwd()}/${migrationPath}`, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("T9 canonical release boundary migration", () => {
  test("revokes every client execution path after the historical T9 hardening", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "revoke all on function app_private.complete_export_package_core(jsonb) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.complete_export_package(jsonb) from public, anon, authenticated",
    );
    expect(sql).not.toContain("grant execute");
  });

  test("changes privileges only and leaves the dormant implementation intact", () => {
    const sql = migrationSql();

    expect(sql).not.toContain("create or replace function");
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("create policy");
    expect(sql).not.toContain("insert into");
    expect(sql).not.toContain("update ");
    expect(sql).not.toContain("delete from");
  });
});
