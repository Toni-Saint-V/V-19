import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SUPABASE_PRODUCTION_TARGET } from "../config/supabase-production-target.mjs";
import { testArtifactPath } from "./lib/artifact-paths.mjs";
import { edgeFunctionSourceSha256 } from "./lib/edge-function-source-identity.mjs";
import { releaseSourceSha256FromGitHead } from "./lib/release-source-identity.mjs";
import {
  assertProductionMutationAllowed,
  productionApprovalPacketPath,
} from "./lib/supabase-production-mutation-gate.mjs";

const repoRoot = process.cwd();
const modes = new Set(process.argv.slice(2));
const checkLocal = modes.has("--check-local") || modes.size === 0;
const verifyRemote = modes.has("--verify-remote");
const deploy = modes.has("--deploy");
const selectedModeCount = [checkLocal, verifyRemote, deploy].filter(Boolean).length;
const projectRef = SUPABASE_PRODUCTION_TARGET.projectId;
const requiredFunctions = [...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions];
const requiredSecretNames = [
  ...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSecretNames,
];
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const sourceSha256 = releaseSourceSha256FromGitHead(repoRoot);
const localFunctionSourceSha256 = Object.fromEntries(
  requiredFunctions.map((name) => [name, edgeFunctionSourceSha256(repoRoot, name)]),
);

if (selectedModeCount !== 1) {
  fail("Use exactly one mode: --check-local, --verify-remote, or --deploy.");
}

verifyLocalContract();

if (deploy) {
  try {
    assertProductionMutationAllowed({
      action: "function-deploy",
      repoRoot,
      readinessPath: productionApprovalPacketPath(repoRoot),
    });
  } catch (error) {
    fail(error.message);
  }
  const expectedConfirmation = `${projectRef}:${SUPABASE_PRODUCTION_TARGET.cutoverGeneration}`;
  if (
    process.env.SUPABASE_PRODUCTION_FUNCTION_DEPLOY_CONFIRMATION !==
    expectedConfirmation
  ) {
    fail(
      `Deployment refused. Set SUPABASE_PRODUCTION_FUNCTION_DEPLOY_CONFIRMATION=${expectedConfirmation} for this exact target.`,
    );
  }
  runSupabase(
    [
      "functions",
      "deploy",
      ...requiredFunctions,
      "--project-ref",
      projectRef,
      "--use-api",
    ],
    "inherit",
  );
}

if (verifyRemote || deploy) {
  const remoteFunctions = jsonSupabase([
    "functions",
    "list",
    "--project-ref",
    projectRef,
    "--output",
    "json",
  ]);
  const remoteSecrets = jsonSupabase([
    "secrets",
    "list",
    "--project-ref",
    projectRef,
    "--output",
    "json",
  ]);
  const remoteFunctionNames = remoteFunctions
    .map((entry) => clean(entry.slug) || clean(entry.name))
    .filter(Boolean)
    .sort();
  const expectedFunctionNames = [...requiredFunctions].sort();
  const secretNames = new Set(remoteSecrets.map((entry) => clean(entry.name)));
  const missingSecrets = requiredSecretNames.filter((name) => !secretNames.has(name));
  const functionListMatches =
    remoteFunctionNames.join("\n") === expectedFunctionNames.join("\n");
  const runtimeChecks =
    functionListMatches && missingSecrets.length === 0
      ? await verifyRuntimeHealth()
      : expectedFunctionNames.map((name) => ({
          function: name,
          passed: false,
          statusCode: null,
        }));
  const dryRunsPassed = runtimeChecks.every((check) => check.passed);
  const sourceIdentityBound = false;
  const semanticChecksPassed = false;
  const observedFunctionSourceSha256 = {};
  const deploymentIdentities = [];
  const semanticReceipts = [];
  const evidence = {
    schemaVersion: 1,
    scope: "supabase-production-edge-functions",
    checkedAt: new Date().toISOString(),
    projectRef,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead,
    sourceSha256,
    expectedFunctions: expectedFunctionNames,
    observedFunctions: remoteFunctionNames,
    requiredSecretNames,
    missingSecretNames: missingSecrets,
    localContractChecked: true,
    remoteListChecked: true,
    deployed: functionListMatches,
    dryRunsPassed,
    runtimeChecks,
    localFunctionSourceSha256,
    observedFunctionSourceSha256,
    deploymentIdentities,
    semanticReceipts,
    sourceIdentityBound,
    semanticChecksPassed,
    status:
      functionListMatches &&
      missingSecrets.length === 0 &&
      dryRunsPassed &&
      sourceIdentityBound &&
      semanticChecksPassed
        ? "PASS"
        : "BLOCKED",
  };
  const evidencePath = testArtifactPath("supabase-production-edge-functions.json");
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Edge Function evidence: ${evidencePath}`);

  if (!functionListMatches) {
    fail(
      `Remote Edge Functions mismatch. Expected ${expectedFunctionNames.join(", ")}; observed ${remoteFunctionNames.join(", ") || "none"}.`,
    );
  }
  if (missingSecrets.length > 0) {
    fail(
      `Required Edge Function secret names are missing: ${missingSecrets.join(", ")}.`,
    );
  }
  if (!dryRunsPassed) {
    fail("One or more target-bound Edge Function health invocations failed.");
  }
  if (!sourceIdentityBound || !semanticChecksPassed) {
    fail(
      "Edge Function names and /health are insufficient: deployed source identity and real handler semantic evidence are required.",
    );
  }
  console.log(
    "PASS Required Edge Functions, secret names, and runtime health checks match the canonical target.",
  );
} else {
  console.log("PASS Required Edge Function local contract is complete.");
}

function verifyLocalContract() {
  const localFunctionNames = requiredFunctions.filter((name) =>
    existsSync(resolve(repoRoot, "supabase", "functions", name, "index.ts")),
  );
  if (localFunctionNames.length !== requiredFunctions.length) {
    const missing = requiredFunctions.filter(
      (name) => !localFunctionNames.includes(name),
    );
    fail(`Required local Edge Functions are missing: ${missing.join(", ")}.`);
  }
}

function runSupabase(args, stdio = "pipe") {
  return execFileSync("npx", ["supabase", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio,
  });
}

function jsonSupabase(args) {
  const output = runSupabase(args);
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) fail("Supabase CLI returned a non-array JSON response.");
  return parsed;
}

async function verifyRuntimeHealth() {
  const publicEnv = readEnv(resolve(repoRoot, ".env.supabase-production.local"));
  const publishableKey = clean(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (!publishableKey) {
    return requiredFunctions.map((name) => ({
      function: name,
      passed: false,
      statusCode: null,
    }));
  }

  return Promise.all(
    requiredFunctions.map(async (name) => {
      try {
        const response = await fetch(
          `${SUPABASE_PRODUCTION_TARGET.projectUrl}/functions/v1/${name}/health`,
          {
            headers: {
              apikey: publishableKey,
              authorization: `Bearer ${publishableKey}`,
            },
            method: "GET",
            signal: AbortSignal.timeout(15_000),
          },
        );
        const body = await response.json().catch(() => null);
        const expectedCapability =
          SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionCapabilities[name];
        return {
          capability: body?.capability ?? null,
          function: name,
          passed:
            response.status === 200 &&
            body?.function === name &&
            body?.status === "ok" &&
            body?.capability === expectedCapability,
          statusCode: response.status,
        };
      } catch {
        return { function: name, passed: false, statusCode: null };
      }
    }),
  );
}

function readEnv(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(message) {
  console.error(`BLOCKED ${message}`);
  process.exit(1);
}
