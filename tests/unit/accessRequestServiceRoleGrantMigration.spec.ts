import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260804194432_grant_access_request_service_role_dml.sql";

function migrationSql() {
  return readFileSync(`${process.cwd()}/${migrationPath}`, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("access-request service-role DML migration", () => {
  test("grants only the table privileges required by the server-side flow", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "grant select, insert, update on table public.access_requests, public.profiles to service_role",
    );
    expect(sql).toContain(
      "has_table_privilege('service_role', 'public.access_requests', 'select')",
    );
    expect(sql).toContain(
      "has_table_privilege('service_role', 'public.profiles', 'update')",
    );
    expect(sql).not.toMatch(/grant\s+all/);
    expect(sql).not.toMatch(/to\s+(anon|authenticated)/);
    expect(sql).not.toMatch(/alter\s+table[\s\S]*row\s+level\s+security/);
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy/);
  });
});
