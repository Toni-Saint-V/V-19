import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  CANONICAL_FRONTEND_MEDIA_TYPES,
  CANONICAL_SUBMISSION_STATUSES,
  canonicalRequiredMediaReadiness,
  isStatusTransitionAllowed,
  normalizeLegacySubmissionStatus,
} from "../../../src/modules/submissions/domainContract";

const importFromPattern =
  /^\s*import(?:\s+type)?[\s\S]*?\s+from\s+["']([^"']+)["'];?/gm;
const legacyStackImportPathPattern =
  /^(?:\.\.\/)+src\/(?:types\/domain|lib\/workflow|services\/submissionService)$/;

const canonicalReleaseProofFiles = [
  "tests/unit/submissions/domainContract.test.ts",
  "tests/unit/submissions/releaseProof.test.ts",
  "tests/unit/v19DomainEngine.spec.ts",
  "tests/unit/v19SubmissionRules.spec.ts",
  "tests/unit/v19SupabasePersistence.spec.ts",
] as const;

const legacyArchiveOnlyTests = [
  "tests/integration/supabase-live.spec.ts",
  "tests/unit/aiHelperFacade.spec.ts",
  "tests/unit/aiHelperService.spec.ts",
  "tests/unit/exportBatchPersistence.spec.ts",
  "tests/unit/exportService.spec.ts",
  "tests/unit/smartCorrectionReturn.spec.ts",
  "tests/unit/storageService.spec.ts",
  "tests/unit/submissionService.spec.ts",
  "tests/unit/supabasePersistenceFailurePaths.spec.ts",
  "tests/unit/textIntakeReviewer.spec.ts",
  "tests/unit/workflow.spec.ts",
] as const;

function readProjectFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function testFilesUnder(relativePath: string): string[] {
  const absolutePath = join(process.cwd(), relativePath);
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) return testFilesUnder(entryPath);
    return /\.(spec|test)\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function importedModulePaths(source: string): string[] {
  return [...source.matchAll(importFromPattern)].map((match) => match[1] ?? "");
}

function hasLegacyStackImport(source: string): boolean {
  return importedModulePaths(source).some((path) =>
    legacyStackImportPathPattern.test(path),
  );
}

function legacyStackTestFiles(): string[] {
  return testFilesUnder("tests")
    .filter((filePath) => hasLegacyStackImport(readProjectFile(filePath)))
    .sort();
}

describe("Package 3 canonical release proof surface", () => {
  test("release proof tests target src/modules/submissions instead of the legacy stack", () => {
    for (const filePath of canonicalReleaseProofFiles) {
      const source = readProjectFile(filePath);

      expect(source, filePath).toContain("src/modules/submissions");
      expect(hasLegacyStackImport(source), filePath).toBe(false);
    }
  });

  test("legacy stack tests remain archive-only and are not release proof", () => {
    expect(legacyStackTestFiles()).toEqual([...legacyArchiveOnlyTests].sort());

    for (const filePath of legacyArchiveOnlyTests) {
      const source = readProjectFile(filePath);

      expect(hasLegacyStackImport(source), filePath).toBe(true);
    }
  });

  test("legacy path mentions without imports do not reclassify release tests", () => {
    const source = readProjectFile("tests/unit/supabaseSecurityContract.spec.ts");

    expect(source).toContain("src/services/submissionService.ts");
    expect(source).toContain("src/modules/submissions");
    expect(hasLegacyStackImport(source)).toBe(false);
  });

  test("canonical runtime contract owns statuses, transitions, and media readiness", () => {
    expect(CANONICAL_SUBMISSION_STATUSES).toEqual([
      "draft",
      "in_progress",
      "submitted_for_review",
      "returned",
      "corrections_received",
      "ready_for_export",
      "exported",
    ]);
    expect(isStatusTransitionAllowed("in_progress", "submitted_for_review")).toBe(
      true,
    );
    expect(isStatusTransitionAllowed("submitted_for_review", "ready_for_export")).toBe(
      true,
    );
    expect(isStatusTransitionAllowed("ready_for_export", "exported")).toBe(true);
    expect(isStatusTransitionAllowed("exported", "ready_for_export")).toBe(false);
  });

  test("release proof media uses only passport_scan, selfie, and selfie_2", () => {
    const ready = {
      applicants: [{ id: "app-1" }],
      files: CANONICAL_FRONTEND_MEDIA_TYPES.map((type) => ({
        applicantId: "app-1",
        status: "accepted",
        type,
      })),
    };

    expect(CANONICAL_FRONTEND_MEDIA_TYPES).toEqual([
      "passport_scan",
      "selfie",
      "selfie_2",
    ]);
    expect(canonicalRequiredMediaReadiness(ready, { requireAccepted: true })).toEqual({
      ok: true,
      data: true,
    });
    for (const type of ["photo", "photo_white", "video"] as const) {
      expect(
        canonicalRequiredMediaReadiness(
          {
            ...ready,
            files: [...ready.files, { applicantId: "app-1", status: "accepted", type }],
          },
          { requireAccepted: true },
        ).ok,
      ).toBe(false);
    }
  });

  test("legacy statuses normalize at the boundary but are not runtime truth", () => {
    expect(normalizeLegacySubmissionStatus("requires_action")).toEqual({
      ok: true,
      data: "returned",
    });
    expect(normalizeLegacySubmissionStatus("accepted")).toEqual({
      ok: true,
      data: "ready_for_export",
    });
    expect(normalizeLegacySubmissionStatus("ready_for_excel")).toEqual({
      ok: true,
      data: "ready_for_export",
    });
    expect(
      normalizeLegacySubmissionStatus("completed", {
        exportedAt: "2026-06-26T10:00:00.000Z",
      }),
    ).toEqual({ ok: true, data: "exported" });
    expect(normalizeLegacySubmissionStatus("unknown_runtime_status")).toEqual({
      ok: false,
      reason: "Unknown submission status.",
    });
  });
});
