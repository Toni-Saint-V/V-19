import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260722002000_access_request_review_claim.sql";
const edgeFunctionPath = "supabase/functions/access-request/index.ts";

function normalizedMigration() {
  return readFileSync(`${process.cwd()}/${migrationPath}`, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("access request review claim migration", () => {
  test("serializes approve/reject and keeps the RPC service-only", () => {
    const sql = normalizedMigration();

    expect(sql).toContain("review_claim_action in ('approve', 'reject')");
    expect(sql).toContain(
      "create or replace function public.claim_access_request_review",
    );
    expect(sql).toContain(
      "create or replace function public.finalize_access_request_review",
    );
    expect(sql).toContain("access_request.review_claim_id = p_operation_id");
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain(
      "has_function_privilege('authenticated', claim_oid, 'execute')",
    );
  });

  test("makes finalization replay-safe without reopening a terminal decision", () => {
    const sql = normalizedMigration();

    expect(sql).toContain("access_request.status = target_status");
    expect(sql).toContain("access_request.status = 'pending'");
    expect(sql).toContain("insert into public.profiles");
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain("from public.access_requests as access_request");
    expect(sql).toContain("for update");
    expect(sql).toContain("review_claim_action = null");
    expect(sql).toContain("review_claim_id = null");
    expect(sql).toContain("review_claimed_at = null");
  });

  test("allows an administrator to recover a stale claim with either decision", () => {
    const sql = normalizedMigration();

    expect(sql).toContain(
      "access_request.review_claimed_at < clock_timestamp() - interval '5 minutes'",
    );
    expect(sql).not.toContain(
      "access_request.review_claim_action = p_action and access_request.review_claimed_at",
    );
  });

  test("leaves profile activation inside the atomic finalization RPC", () => {
    const edgeSource = readFileSync(
      `${process.cwd()}/${edgeFunctionPath}`,
      "utf8",
    );

    expect(edgeSource).toContain('"finalize_access_request_review"');
    expect(edgeSource).not.toMatch(
      /from\(["']profiles["']\)[\s\S]{0,80}\.upsert/,
    );
  });
});
