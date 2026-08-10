import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { SUPABASE_PRODUCTION_TARGET } from "../config/supabase-production-target.mjs";
import { testArtifactPath } from "./lib/artifact-paths.mjs";
import {
  releaseArchiveSourceSha256FromGitHead,
  releaseSourceSha256FromGitHead,
} from "./lib/release-source-identity.mjs";
import { isVercelReleaseIdentityMatch } from "./lib/vercel-release-identity.mjs";

const canonicalHost = SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost;
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const expectedSourceSha256 = releaseArchiveSourceSha256FromGitHead(process.cwd());
const canonicalGitSourceSha256 = releaseSourceSha256FromGitHead(process.cwd());
const deployment = JSON.parse(
  execFileSync("vercel", ["inspect", canonicalHost, "--format=json"], {
    encoding: "utf8",
  }),
);
const response = await fetch(
  `https://${canonicalHost}/release-identity.json?checked=${Date.now()}`,
  { cache: "no-store", signal: AbortSignal.timeout(15_000) },
);
const identity = response.ok ? await response.json() : null;
const aliases = Array.isArray(deployment.aliases) ? deployment.aliases : [];
const passed = isVercelReleaseIdentityMatch({
  aliases,
  canonicalHost,
  deployment,
  expectedGitSha: gitHead,
  expectedSourceSha256,
  identity,
});
const evidence = {
  schemaVersion: 1,
  scope: "vercel-production-release-identity",
  status: passed ? "PASS" : "BLOCKED",
  checkedAt: new Date().toISOString(),
  projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
  cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
  gitHead,
  // This envelope remains bound to the canonical Git tree. The two explicit
  // effective archive fields below describe the Vercel-transformed build.
  sourceSha256: canonicalGitSourceSha256,
  canonicalGitSourceSha256,
  deploymentId: deployment.id ?? null,
  deploymentUrl: deployment.url ?? null,
  canonicalHost,
  expectedGitSha: gitHead,
  expectedEffectiveArchiveSourceSha256: expectedSourceSha256,
  observedGitSha: identity?.gitSha ?? null,
  observedEffectiveArchiveSourceSha256: identity?.sourceSha256 ?? null,
  observedReleaseIdentitySchemaVersion: identity?.schemaVersion ?? null,
  observedDirty: identity?.dirty ?? null,
  checks: { deploymentIdentityPassed: passed },
};
const evidencePath = testArtifactPath("vercel-production-release-identity.json");
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Vercel release identity evidence: ${evidencePath}`);
if (!passed) {
  console.error("BLOCKED Canonical production deployment does not match this Git SHA.");
  process.exit(1);
}
console.log(`PASS Canonical production deployment serves Git SHA ${gitHead}.`);
