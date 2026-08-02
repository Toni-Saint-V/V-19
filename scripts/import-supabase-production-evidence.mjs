import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { testArtifactPath } from "./lib/artifact-paths.mjs";
import { validateExternalEvidenceBundle } from "./lib/supabase-external-evidence.mjs";

const repoRoot = process.cwd();
const manifestArgIndex = process.argv.indexOf("--manifest");
const manifestValue = manifestArgIndex >= 0 ? process.argv[manifestArgIndex + 1] : "";
if (!manifestValue || !isAbsolute(manifestValue)) {
  fail("Usage: npm run supabase:evidence:import -- --manifest /absolute/external/bundle.json");
}
const manifestPath = resolve(manifestValue);
if (!existsSync(manifestPath) || !relative(repoRoot, manifestPath).startsWith("..")) {
  fail("Evidence bundle manifest must exist outside the repository.");
}
const content = readFileSync(manifestPath, "utf8");
let manifest;
try {
  manifest = JSON.parse(content);
} catch (error) {
  fail(`Evidence bundle manifest is invalid JSON: ${error.message}`);
}
const validation = validateExternalEvidenceBundle({
  bundleManifest: manifest,
  bundleRoot: dirname(manifestPath),
});
if (validation.issues.length > 0) {
  fail(`Evidence bundle refused: ${validation.issues.join("; ")}`);
}
const receipt = {
  schemaVersion: 1,
  scope: "supabase-production-external-evidence-import",
  status: "PASS",
  checkedAt: new Date().toISOString(),
  projectRef: manifest.projectRef,
  cutoverGeneration: manifest.cutoverGeneration,
  gitHead: manifest.gitHead,
  sourceSha256: manifest.sourceSha256,
  evidenceRootSha256: validation.evidenceRootSha256,
  artifacts: {
    roleIsolation: {
      path: validation.artifacts.roleIsolation.path,
      sha256: validation.artifacts.roleIsolation.sha256,
    },
    edgeFunctions: {
      path: validation.artifacts.edgeFunctions.path,
      sha256: validation.artifacts.edgeFunctions.sha256,
    },
  },
};
const receiptPath = testArtifactPath("supabase-production-evidence-import.json");
const receiptContent = `${JSON.stringify(receipt, null, 2)}\n`;
mkdirSync(dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, receiptContent);
console.log(`PASS External production evidence imported: ${receiptPath}`);
console.log(`Receipt SHA-256: ${createHash("sha256").update(receiptContent).digest("hex")}`);

function fail(message) {
  console.error(`BLOCKED ${message}`);
  process.exit(1);
}
