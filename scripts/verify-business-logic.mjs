import { spawnSync } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const includeSecurity = process.argv.includes("--include-security");

const checks = [
  {
    name: "typecheck",
    args: ["run", "typecheck"],
    purpose: "strict TypeScript contracts across the app",
  },
  {
    name: "test:business-logic",
    args: ["run", "test:business-logic"],
    purpose: "non-UI unit coverage for domain/services",
  },
  {
    name: "verify:v19-boundary",
    args: ["run", "verify:v19-boundary"],
    purpose: "submission-first V-19 runtime boundary and forbidden drift",
  },
  {
    name: "verify:safety",
    args: ["run", "verify:safety"],
    purpose: "static safety invariants for release-critical scripts/files",
  },
  {
    name: "verify:auth-data-readiness",
    args: ["run", "verify:auth-data-readiness"],
    purpose: "auth, RLS, storage, seed, and data-readiness contract",
  },
  {
    name: "verify:supabase-release",
    args: ["run", "verify:supabase-release"],
    purpose: "migration order and Supabase release contract",
  },
];

const optionalSecurityCheck = {
  name: "verify:security",
  args: ["run", "verify:security"],
  purpose: "production dependency audit without dev dependencies",
  timeoutMs: 120_000,
};

if (includeSecurity) {
  checks.push(optionalSecurityCheck);
}

const skippedChecks = [
  {
    name: "verify:security",
    reason:
      "network-dependent dependency audit; run npm run verify:business-logic:security",
  },
  {
    name: "verify:production-packet",
    reason:
      "release-only fail-closed gate; run npm run verify:production-packet before production ship",
  },
].filter((item) => !includeSecurity || item.name !== "verify:security");

const startedAt = Date.now();
const results = [];

console.log("VisaFlow V-19 business logic verification");
console.log("Scope: no browser, no Playwright, no screenshots, no visual QA.");
if (!includeSecurity) {
  console.log(
    "Security audit: skipped by default; run with --include-security for npm audit.",
  );
}
console.log("");

for (const check of checks) {
  const label = `${check.name} - ${check.purpose}`;
  console.log(`\n==> ${label}`);
  const result = spawnSync(npmCommand, check.args, {
    env: process.env,
    stdio: "inherit",
    timeout: check.timeoutMs,
  });
  const status = result.status ?? 1;
  results.push({ ...check, status });

  if (result.error) {
    console.error(`\nFAILED: ${check.name}`);
    if (result.error.code === "ETIMEDOUT") {
      console.error(`Timed out after ${check.timeoutMs}ms.`);
    } else {
      console.error(result.error.message);
    }
    printSummary(results, startedAt);
    process.exit(1);
  }

  if (status !== 0) {
    console.error(`\nFAILED: ${check.name} exited with ${status}`);
    printSummary(results, startedAt);
    process.exit(status);
  }
}

printSummary(results, startedAt);
console.log("\nBusiness logic verification passed.");

function printSummary(items, startedAtMs) {
  const elapsedSeconds = ((Date.now() - startedAtMs) / 1000).toFixed(1);
  console.log("\nBusiness logic verification summary");
  for (const item of items) {
    const mark = item.status === 0 ? "PASS" : "FAIL";
    console.log(`${mark} ${item.name}`);
  }
  for (const item of skippedChecks) {
    console.log(`SKIP ${item.name} - ${item.reason}`);
  }
  console.log(`Elapsed: ${elapsedSeconds}s`);
}
