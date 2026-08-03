import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";

import { testArtifactPath } from "./lib/artifact-paths.mjs";
import {
  releaseSourceSha256FromFileSystem,
  releaseSourceSha256FromGitHead,
} from "./lib/release-source-identity.mjs";
import {
  readStableExternalFile,
  validateExternalEvidenceBundle,
  writeStableExternalFile,
} from "./lib/supabase-external-evidence.mjs";

const repoRoot = process.cwd();
const manifestArgIndex = process.argv.indexOf("--manifest");
const manifestValue = manifestArgIndex >= 0 ? process.argv[manifestArgIndex + 1] : "";
if (!manifestValue || !isAbsolute(manifestValue)) {
  fail(
    "Usage: npm run supabase:evidence:import -- --manifest /absolute/external/bundle.json",
  );
}
const requestedManifestPath = resolve(manifestValue);
const manifestIssues = [];
const manifestFile = readStableExternalFile({
  issues: manifestIssues,
  label: "Evidence bundle manifest",
  repoRoot,
  value: requestedManifestPath,
});
if (!manifestFile) fail(manifestIssues.join("; "));
const manifestPath = manifestFile.path;
const content = manifestFile.content.toString("utf8");
let manifest;
try {
  manifest = JSON.parse(content);
} catch (error) {
  fail(`Evidence bundle manifest is invalid JSON: ${error.message}`);
}
const gitHead = git(["rev-parse", "HEAD"]);
const gitStatus = git(["status", "--porcelain"]);
if (gitStatus) {
  fail("Evidence import requires a clean checkout.");
}
const gitSourceSha256 = releaseSourceSha256FromGitHead(repoRoot);
const fileSourceSha256 = releaseSourceSha256FromFileSystem(repoRoot);
if (fileSourceSha256 !== gitSourceSha256) {
  fail("Evidence import checkout differs from committed Git source.");
}
if (manifest.gitHead !== gitHead) {
  fail("Evidence bundle Git SHA does not match the current clean checkout.");
}
if (manifest.sourceSha256 !== gitSourceSha256) {
  fail("Evidence bundle source SHA-256 does not match the current Git source.");
}
const validation = validateExternalEvidenceBundle({
  bundleManifest: manifest,
  bundleRoot: dirname(manifestPath),
  repoRoot,
});
if (validation.issues.length > 0) {
  fail(`Evidence bundle refused: ${validation.issues.join("; ")}`);
}
const receipt = {
  schemaVersion: 1,
  scope: "supabase-production-external-evidence-import",
  status: "PASS",
  checkedAt: manifest.checkedAt,
  importedAt: new Date().toISOString(),
  projectRef: manifest.projectRef,
  cutoverGeneration: manifest.cutoverGeneration,
  gitHead: manifest.gitHead,
  sourceSha256: manifest.sourceSha256,
  evidenceRootSha256: validation.evidenceRootSha256,
  bundleManifest: {
    path: manifestPath,
    sha256: createHash("sha256").update(content).digest("hex"),
  },
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
const requestedReceiptPath = testArtifactPath(
  "supabase-production-evidence-import.json",
);
const receiptContent = `${JSON.stringify(receipt, null, 2)}\n`;
let receiptPath;
try {
  receiptPath = writeStableExternalFile({
    content: receiptContent,
    label: "Evidence import receipt",
    path: requestedReceiptPath,
    repoRoot,
  });
} catch (error) {
  fail(`Evidence import receipt refused: ${error.message}`);
}
console.log(`PASS External production evidence imported: ${receiptPath}`);
console.log(
  `Receipt SHA-256: ${createHash("sha256").update(receiptContent).digest("hex")}`,
);

function fail(message) {
  console.error(`BLOCKED ${message}`);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
