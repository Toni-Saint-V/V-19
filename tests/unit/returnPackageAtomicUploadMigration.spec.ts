import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/20260722003000_atomic_return_package_artifact_upload.sql`,
  "utf8",
);

describe("atomic return-package upload migration", () => {
  test("uses versioned intents, CAS and replay-safe finalization", () => {
    expect(migration).toContain(
      "create table if not exists app_private.agent_return_package_upload_intents",
    );
    expect(migration).toContain(
      "V19_RETURN_PACKAGE_UPLOAD_CONFLICT: artifact slot changed",
    );
    expect(migration).toContain("if intent.status = 'finalized' then");
    expect(migration).toContain("'duplicate', true");
    expect(migration).toContain(
      "app.visaflow_return_package_upload_operation",
    );
  });

  test("keeps public RPCs SECURITY INVOKER and verifies executable ACLs", () => {
    for (const functionName of [
      "prepare_agent_return_package_artifact_upload",
      "finalize_agent_return_package_artifact_upload",
      "abort_agent_return_package_artifact_upload",
    ]) {
      const functionStart = migration.indexOf(
        `create or replace function public.${functionName}`,
      );
      expect(functionStart).toBeGreaterThan(-1);
      expect(migration.slice(functionStart, functionStart + 260)).toContain(
        "security invoker",
      );
    }
    expect(migration).toContain(
      "has_function_privilege('anon', prepare_oid, 'EXECUTE')",
    );
    expect(migration).toContain(
      "not has_function_privilege('authenticated', finalize_oid, 'EXECUTE')",
    );
  });

  test("locks immutable storage through a narrow fixed-path helper", () => {
    expect(migration).toContain(
      "app_private.lock_return_package_upload_storage_object",
    );
    expect(migration).toContain(
      "Storage row-lock helper must remain SECURITY DEFINER",
    );
    expect(migration).toContain(
      "setting = 'search_path=pg_catalog, public, app_private'",
    );
    expect(migration).toContain(
      'drop policy if exists "agent return package storage update"',
    );
  });
});
