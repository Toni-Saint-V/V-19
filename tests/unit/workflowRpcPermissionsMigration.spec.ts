import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260722000000_harden_workflow_rpc_anon_execute.sql";

function readProjectFile(relativePath: string): string {
  return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
}

function normalizeSql(content: string): string {
  return content.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("workflow RPC permission hardening migration", () => {
  const signatures = [
    "public.save_submission_draft(jsonb)",
    "public.submit_corrections_handoff(jsonb)",
    "public.upsert_questionnaire_answers(jsonb)",
  ];

  test("removes anonymous and PUBLIC execution while preserving authenticated use", () => {
    const migration = normalizeSql(readProjectFile(migrationPath));

    for (const signature of signatures) {
      expect(migration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`,
      );
      expect(migration).toContain(
        `grant execute on function ${signature} to authenticated`,
      );
      expect(migration).not.toContain(
        `grant execute on function ${signature} to anon`,
      );
      expect(migration).not.toContain(
        `grant execute on function ${signature} to public`,
      );
    }
  });

  test("fails closed when a required RPC or its final ACL is wrong", () => {
    const migration = readProjectFile(migrationPath);

    expect(migration).toContain("to_regprocedure(function_signature) is null");
    expect(migration).toContain(
      "alter function public.save_submission_draft(jsonb) security invoker",
    );
    expect(migration).toContain(
      "alter function public.submit_corrections_handoff(jsonb) security invoker",
    );
    expect(migration).toContain(
      "alter function public.upsert_questionnaire_answers(jsonb) security invoker",
    );
    expect(migration).toContain("proc.prosecdef");
    expect(migration).toContain(
      "has_function_privilege('anon', function_oid, 'EXECUTE')",
    );
    expect(migration).toContain(
      "not has_function_privilege('authenticated', function_oid, 'EXECUTE')",
    );
    expect(migration).toContain("privilege.grantee = 0");
    expect(migration).toContain("privilege.privilege_type = 'EXECUTE'");
  });

  test("is followed by admin concurrency, access-review and upload migrations", () => {
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );
    const previousMigration =
      "20260720000000_export_package_media_only_file_count.sql";
    const currentMigration =
      "20260722000000_harden_workflow_rpc_anon_execute.sql";
    const nextMigration =
      "20260722001000_admin_submission_batch_concurrency.sql";
    const accessReviewMigration =
      "20260722002000_access_request_review_claim.sql";
    const returnPackageUploadMigration =
      "20260722003000_atomic_return_package_artifact_upload.sql";

    expect(migrationContract).toContain(currentMigration);
    expect(migrationContract).toContain(nextMigration);
    expect(migrationContract.indexOf(previousMigration)).toBeLessThan(
      migrationContract.indexOf(currentMigration),
    );
    expect(migrationContract.indexOf(currentMigration)).toBeLessThan(
      migrationContract.indexOf(nextMigration),
    );
    expect(migrationContract.indexOf(nextMigration)).toBeLessThan(
      migrationContract.indexOf(accessReviewMigration),
    );
    expect(migrationContract.indexOf(accessReviewMigration)).toBeLessThan(
      migrationContract.indexOf(returnPackageUploadMigration),
    );
  });
});
