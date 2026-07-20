import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migrationPath =
  "supabase/migrations/20260720000000_export_package_media_only_file_count.sql";

function readProjectFile(relativePath: string): string {
  return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
}

describe("export package media-only migration contract", () => {
  test("patches only the reviewed PDF-inclusive file count guard", () => {
    const migration = readProjectFile(migrationPath);

    expect(migration).toContain(
      "legacy_file_count_guard constant text :=\n    'if document_record.file_count <> provided_asset_count + expected_applicant_count then'",
    );
    expect(migration).toContain(
      "media_only_file_count_guard constant text :=\n    'if document_record.file_count <> provided_asset_count then'",
    );
    expect(migration).toContain(
      "Export ZIP file count must match exported media assets",
    );
    expect(migration).toContain(
      "Deployed complete_export_package wrapper does not match one reviewed file-count contract",
    );
  });

  test("fails closed unless the latest passport media and admin guards are present", () => {
    const migration = readProjectFile(migrationPath);

    expect(migration).toContain(
      "asset.applicant_id = app_private.primary_applicant_id(asset.submission_id)",
    );
    expect(migration).toContain(
      "coalesce(array_length(expected_document_asset_ids, 1), 0) <> expected_applicant_count + (coalesce(array_length(submission_ids, 1), 0) * 2)",
    );
    expect(migration).toContain(
      "if actor_role is distinct from ''admin'' then",
    );
    expect(migration).toContain(
      "position(unsafe_admin_guard in function_definition) > 0",
    );
    expect(migration).toContain(
      "revoke all on function public.complete_export_package(jsonb) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.complete_export_package(jsonb) to authenticated",
    );
  });

  test("is declared in the local promotion order", () => {
    const migrationContract = readProjectFile(
      "scripts/supabase-migration-contract.mjs",
    );

    expect(migrationContract).toContain(
      "20260720000000_export_package_media_only_file_count.sql",
    );
  });
});
