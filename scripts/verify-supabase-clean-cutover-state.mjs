import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SUPABASE_PRODUCTION_TARGET } from "../config/supabase-production-target.mjs";
import { testArtifactPath } from "./lib/artifact-paths.mjs";
import { releaseSourceSha256FromGitHead } from "./lib/release-source-identity.mjs";

const repoRoot = process.cwd();
const adminEnvPath = resolve(repoRoot, ".env.supabase-production-admin.local");
const publicEnvPath = resolve(repoRoot, ".env.supabase-production.local");
const evidencePath = testArtifactPath("supabase-clean-cutover-final-state.json");
const adminEnv = readEnv(adminEnvPath);
const publicEnv = readEnv(publicEnvPath);
const projectRef = clean(adminEnv.SUPABASE_PROJECT_REF);
const projectUrl =
  clean(adminEnv.SUPABASE_PROJECT_URL) || clean(publicEnv.VITE_SUPABASE_URL);
const adminKey = clean(adminEnv[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")]);
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const sourceSha256 = releaseSourceSha256FromGitHead(repoRoot);

assert(
  projectRef === SUPABASE_PRODUCTION_TARGET.projectId,
  "Admin-only state check refuses a non-canonical project ref.",
);
assert(
  projectUrl === SUPABASE_PRODUCTION_TARGET.projectUrl,
  "Admin-only state check refuses a non-canonical project URL.",
);
assert(adminKey, "Admin-only state check requires the local admin API key.");

const admin = createClient(projectUrl, adminKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const authUsers = await listAllAuthUsers(admin);
const [profileCounts, emptyPublicTableRowCounts, schemaInventory, storageState] =
  await Promise.all([
    readProfileCounts(admin),
    readEmptyPublicTableRowCounts(admin),
    readSchemaInventory(admin),
    readStorageState(admin),
  ]);
const profileIds = new Set(profileCounts.profileIds);
const authIds = new Set(authUsers.map((user) => user.id));
const observed = {
  authUserCount: authUsers.length,
  confirmedAuthUserCount: authUsers.filter(isConfirmedAuthUser).length,
  profileCount: profileCounts.profileCount,
  adminProfileCount: profileCounts.adminProfileCount,
  agentProfileCount: profileCounts.agentProfileCount,
  orphanAuthUsersWithoutProfileCount: authUsers.filter(
    (user) => !profileIds.has(user.id),
  ).length,
  orphanProfilesWithoutAuthCount: profileCounts.profileIds.filter(
    (profileId) => !authIds.has(profileId),
  ).length,
  emptyPublicTableRowCounts,
  publicTables: schemaInventory.publicTables,
  storageBucketObjectCounts: storageState.objectCounts,
  unexpectedStorageBucketCount: storageState.unexpectedBucketNames.length,
};
const expectedPublicTables = [
  "profiles",
  ...SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables,
].sort();
const mismatches = Object.entries(SUPABASE_PRODUCTION_TARGET.requiredCleanDataState)
  .filter(([key, expected]) => observed[key] !== expected)
  .map(([key, expected]) => ({ key, expected, observed: observed[key] }));
for (const [table, count] of Object.entries(emptyPublicTableRowCounts)) {
  if (count !== 0) {
    mismatches.push({ key: `public.${table}`, expected: 0, observed: count });
  }
}
for (const [bucket, count] of Object.entries(storageState.objectCounts)) {
  if (count !== 0) {
    mismatches.push({ key: `storage.${bucket}`, expected: 0, observed: count });
  }
}
if (schemaInventory.publicTables.join("\n") !== expectedPublicTables.join("\n")) {
  mismatches.push({
    key: "public.tableInventory",
    expected: expectedPublicTables,
    observed: schemaInventory.publicTables,
  });
}
if (
  schemaInventory.storageBuckets.join("\n") !==
  [...SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets].sort().join("\n")
) {
  mismatches.push({
    key: "storage.bucketInventory",
    expected: [...SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets].sort(),
    observed: schemaInventory.storageBuckets,
  });
}
if (storageState.unexpectedBucketNames.length > 0) {
  mismatches.push({
    key: "storage.unexpectedBucketCount",
    expected: 0,
    observed: storageState.unexpectedBucketNames.length,
  });
}
const evidence = {
  schemaVersion: 1,
  scope: "supabase-clean-cutover-final-data-state",
  checkedAt: new Date().toISOString(),
  projectRef,
  cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
  gitHead,
  sourceSha256,
  expected: {
    ...SUPABASE_PRODUCTION_TARGET.requiredCleanDataState,
    emptyPublicTables: SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables,
    publicTables: expectedPublicTables,
    emptyStorageBuckets: SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets,
    unexpectedStorageBucketCount: 0,
  },
  observed,
  status: mismatches.length === 0 ? "PASS" : "BLOCKED",
  mismatches,
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Clean cutover final-state evidence: ${evidencePath}`);
console.log(JSON.stringify(observed, null, 2));

if (mismatches.length > 0) {
  for (const mismatch of mismatches) {
    console.error(
      `BLOCKED ${mismatch.key}: expected ${mismatch.expected}, observed ${mismatch.observed}`,
    );
  }
  process.exit(1);
}

console.log(
  "PASS Clean cutover contains exactly one confirmed admin and no other users.",
);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function isConfirmedAuthUser(user) {
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

async function listAllAuthUsers(client) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list Auth users: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) return users;
  }
  throw new Error("Auth user pagination exceeded the bounded 100-page limit.");
}

async function exactProfileCount(client, role) {
  let query = client.from("profiles").select("id", { count: "exact", head: true });
  if (role) query = query.eq("role", role);
  const { count, error } = await query;
  if (error)
    throw new Error(`Could not count ${role || "all"} profiles: ${error.message}`);
  if (!Number.isInteger(count)) throw new Error("Profile count was not exact.");
  return count;
}

async function readProfileCounts(client) {
  const [profileCount, adminProfileCount, agentProfileCount] = await Promise.all([
    exactProfileCount(client, ""),
    exactProfileCount(client, "admin"),
    exactProfileCount(client, "agent"),
  ]);
  if (profileCount > 1000) {
    throw new Error("Profile id readback refuses more than 1000 rows.");
  }
  const { data, error } = await client.from("profiles").select("id").range(0, 999);
  if (error) throw new Error(`Could not read profile ids: ${error.message}`);
  return {
    profileCount,
    adminProfileCount,
    agentProfileCount,
    profileIds: (data ?? []).map((profile) => profile.id),
  };
}

async function exactTableCount(client, table) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`Could not count public.${table}: ${error.message}`);
  if (!Number.isInteger(count)) throw new Error(`public.${table} count was not exact.`);
  return count;
}

async function readEmptyPublicTableRowCounts(client) {
  const entries = await Promise.all(
    SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables.map(async (table) => [
      table,
      await exactTableCount(client, table),
    ]),
  );
  return Object.fromEntries(entries);
}

async function readSchemaInventory(client) {
  const { data, error } = await client.rpc("v19_clean_cutover_schema_inventory");
  if (error) throw new Error(`Could not read schema inventory: ${error.message}`);
  const publicTables = Array.isArray(data?.publicTables)
    ? data.publicTables.filter((value) => typeof value === "string").sort()
    : [];
  const storageBuckets = Array.isArray(data?.storageBuckets)
    ? data.storageBuckets.filter((value) => typeof value === "string").sort()
    : [];
  return { publicTables, storageBuckets };
}

async function readStorageState(client) {
  const { data, error } = await client.storage.listBuckets();
  if (error) throw new Error(`Could not list Storage buckets: ${error.message}`);
  const actualBucketNames = (data ?? []).map((bucket) => bucket.name).sort();
  const expectedBucketNames = [
    ...SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets,
  ].sort();
  const unexpectedBucketNames = actualBucketNames.filter(
    (name) => !expectedBucketNames.includes(name),
  );
  const missingBucketNames = expectedBucketNames.filter(
    (name) => !actualBucketNames.includes(name),
  );
  if (missingBucketNames.length > 0) {
    throw new Error(
      `Required Storage buckets are missing: ${missingBucketNames.join(", ")}.`,
    );
  }

  const counts = await Promise.all(
    expectedBucketNames.map(async (bucket) => [
      bucket,
      await countStorageObjects(client, bucket),
    ]),
  );
  return { objectCounts: Object.fromEntries(counts), unexpectedBucketNames };
}

async function countStorageObjects(client, bucket) {
  const pendingPrefixes = [""];
  let count = 0;
  let visitedPrefixes = 0;

  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift();
    visitedPrefixes += 1;
    if (visitedPrefixes > 1000) {
      throw new Error(`Storage traversal exceeded 1000 prefixes for ${bucket}.`);
    }

    for (let offset = 0; offset < 10000; offset += 1000) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error)
        throw new Error(`Could not list Storage bucket ${bucket}: ${error.message}`);
      const entries = data ?? [];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.metadata === null) pendingPrefixes.push(path);
        else count += 1;
      }
      if (entries.length < 1000) break;
    }
  }

  return count;
}
