import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";

import { parseSmartImportText } from "../../src/modules/submissions/smartImport";

const repositoryRoot = process.cwd();
const smartImportSources = [
  "src/modules/submissions/smartImport.ts",
  "src/modules/submissions/smartImportFileExtraction.ts",
  "src/modules/submissions/components/SmartImportDialog.tsx",
];

describe("smart import privacy boundary", () => {
  test("does not couple ephemeral source handling to persistence, network, cache, or logging APIs", () => {
    const forbiddenPatterns = [
      /supabase/iu,
      /localStorage/u,
      /indexedDB/u,
      /sendBeacon/u,
      /console\.(?:debug|error|info|log|warn)/u,
      /\.storage\b/u,
      /fetch\s*\(/u,
    ];

    for (const relativePath of smartImportSources) {
      const source = readFileSync(join(repositoryRoot, relativePath), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source, `${relativePath} must not match ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  test("returns only sanitized structured candidates from source text", () => {
    const secret = "СЕКРЕТНЫЙ ИСХОДНИК";
    const result = parseSmartImportText(
      `${secret}\nТелефон: +7 921 555-22-11\nEmail: anton@example.com`,
    );
    const serialized = JSON.stringify(result);

    expect(Object.keys(result).sort()).toEqual([
      "candidates",
      "documentKind",
      "summary",
    ]);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(/raw(?:Source|Text|Value)|fileName|filename|blob/iu);
  });

  test("uses only the bundled offline OCR language asset", () => {
    const asset = join(
      repositoryRoot,
      "public",
      "tesseract",
      "lang",
      "eng.traineddata.gz",
    );

    expect(existsSync(asset)).toBe(true);
    expect(gunzipSync(readFileSync(asset)).byteLength).toBeGreaterThan(1_000_000);
  });

  test("keeps extraction advisory until the user confirms selected fields", () => {
    const contract = readFileSync(
      join(repositoryRoot, "docs", "release", "canonical-domain-contract.md"),
      "utf8",
    );

    expect(contract).toContain("### 1.8 AI, OCR, and PDF boundary");
    expect(contract).toContain(
      "apply OCR/PDF values to questionnaire fields automatically",
    );
    expect(contract).toContain("All discrepancies must remain visible");
  });
});
