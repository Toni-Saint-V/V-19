import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { SUPABASE_PRODUCTION_TARGET } from "../config/supabase-production-target.mjs";

const repoRoot = process.cwd();
const sandboxProjectRef = "oevvaowoklqttqkraxho";
const adminEnvPath = resolve(repoRoot, ".env.supabase-production-admin.local");
const publicEnvPath = resolve(repoRoot, ".env.supabase-production.local");
const cohortPath = resolve(repoRoot, ".supabase-pilot-cohort.local.json");
const readinessPath = resolve(repoRoot, "docs/release/supabase-production-readiness.json");

const args = new Set(process.argv.slice(2));
const writeTemplate = args.has("--write-template");
const checkOnly = args.has("--check");
const provision = args.has("--provision");
const verifySignIn = args.has("--verify-sign-in");
const requiredPilotSize = numberArg("--required-size", 20);

if (![writeTemplate, checkOnly, provision].some(Boolean)) {
  usage();
  process.exit(2);
}

if ([writeTemplate, checkOnly, provision].filter(Boolean).length > 1) {
  fail("Use exactly one mode: --write-template, --check, or --provision.");
}

const readiness = readJsonIfExists(readinessPath);
const adminEnv = readEnvIfExists(adminEnvPath);
const publicEnv = readEnvIfExists(publicEnvPath);
const cohort = readJsonIfExists(cohortPath);

const projectRef =
  clean(adminEnv.SUPABASE_PROJECT_REF) ||
  clean(publicEnv.VITE_SUPABASE_PROJECT_ID) ||
  SUPABASE_PRODUCTION_TARGET.projectId;
const projectUrl =
  clean(adminEnv.SUPABASE_PROJECT_URL) ||
  clean(publicEnv.VITE_SUPABASE_URL) ||
  SUPABASE_PRODUCTION_TARGET.projectUrl;
const publishableKey = clean(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
const adminKey = clean(adminEnv[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")]);

if (writeTemplate) {
  if (!productionTargetMatchesDescriptor()) {
    fail("Refusing to write a pilot template for a non-canonical production target.");
  }
  writePilotTemplate();
  process.exit(0);
}

const desiredUsers = desiredPilotUsers(cohort);
const preflight = validatePreflight({
  desiredUsers,
  needAdminKey: provision,
  needPublishableKey: provision || verifySignIn,
});

if (checkOnly || preflight.some((item) => !item.ok)) {
  printReport(preflight, desiredUsers);
  if (preflight.some((item) => !item.ok)) process.exit(1);
  process.exit(0);
}

await provisionPilotUsers(desiredUsers);

function usage() {
  console.log("Usage:");
  console.log("  node scripts/provision-supabase-pilot-cohort.mjs --write-template");
  console.log("  node scripts/provision-supabase-pilot-cohort.mjs --check [--required-size 20]");
  console.log(
    "  node scripts/provision-supabase-pilot-cohort.mjs --provision [--verify-sign-in] [--required-size 20]",
  );
}

function numberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function productionTargetMatchesDescriptor() {
  return (
    projectRef === SUPABASE_PRODUCTION_TARGET.projectId &&
    projectUrl === SUPABASE_PRODUCTION_TARGET.projectUrl
  );
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function readEnvIfExists(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^=#]+)=(.*)$/);
    if (!match) continue;
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function writePilotTemplate() {
  const existing = readJsonIfExists(cohortPath);
  const template = {
    schemaVersion: 1,
    scope: "supabase-production-pilot-cohort",
    recordedAt: new Date().toISOString(),
    projectRef,
    projectUrl,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    organization:
      clean(adminEnv.SUPABASE_ORGANIZATION) ||
      clean(readiness.productionTarget?.supabaseOrganization),
    productionNotSandboxConfirmed: Boolean(projectRef && projectRef !== sandboxProjectRef),
    cohorts: existing.cohorts ?? {
      agent: { email: "", exists: false, roleVerified: false, identifierRecorded: false },
      otherAgent: {
        email: "",
        exists: false,
        roleVerified: false,
        identifierRecorded: false,
      },
      admin: { email: "", exists: false, roleVerified: false, identifierRecorded: false },
    },
    pilotUsers: existing.pilotUsers ?? defaultPilotUsers(),
    orphanAuthUsersWithoutProfileCount: existing.orphanAuthUsersWithoutProfileCount ?? null,
    notes:
      existing.notes ??
      "Fill email/password/displayName locally. This file is ignored and must not be committed.",
  };

  writeFileSync(cohortPath, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`Wrote ignored pilot cohort template: ${cohortPath}`);
  console.log("Fill 20 real pilot emails/passwords locally, then run --check.");
}

function defaultPilotUsers() {
  return Array.from({ length: requiredPilotSize }, (_, index) => {
    const isAdmin = index === 0;
    return {
      key: isAdmin ? "pilot-admin-01" : `pilot-agent-${String(index).padStart(2, "0")}`,
      email: "",
      password: "",
      displayName: "",
      organizationName: "VisaFlow Pilot",
      role: isAdmin ? "admin" : "agent",
      exists: false,
      roleVerified: false,
      signInVerified: false,
    };
  });
}

function desiredPilotUsers(rawCohort) {
  const users = Array.isArray(rawCohort.pilotUsers) ? rawCohort.pilotUsers : [];
  return users
    .map((user, index) => ({
      key: clean(user.key) || `pilot-user-${index + 1}`,
      email: clean(user.email).toLowerCase(),
      password: clean(user.password),
      displayName: clean(user.displayName) || `Pilot User ${index + 1}`,
      organizationName: clean(user.organizationName) || "VisaFlow Pilot",
      role: user.role === "admin" ? "admin" : "agent",
      exists: Boolean(user.exists),
      roleVerified: Boolean(user.roleVerified),
      signInVerified: Boolean(user.signInVerified),
    }))
    .filter((user) => user.email || user.password || user.displayName);
}

function validatePreflight({ desiredUsers, needAdminKey, needPublishableKey }) {
  const checks = [];
  const add = (ok, label, detail = "") => checks.push({ ok, label, detail });
  const uniqueEmails = new Set(desiredUsers.map((user) => user.email).filter(Boolean));

  add(Boolean(projectRef), "production project ref is recorded");
  add(projectRef !== sandboxProjectRef, "target is not sandbox");
  add(Boolean(projectUrl), "production project URL is recorded");
  add(
    productionTargetMatchesDescriptor(),
    "production target matches canonical descriptor",
  );
  add(
    !needPublishableKey || Boolean(publishableKey),
    needPublishableKey
      ? "publishable key is available for sign-in verification"
      : "publishable key is not required for local cohort check",
  );
  add(
    !needAdminKey || Boolean(adminKey),
    needAdminKey
      ? "admin API key is available locally"
      : "admin API key is not required for local cohort check",
  );
  add(desiredUsers.length >= requiredPilotSize, `pilot cohort has at least ${requiredPilotSize} users`);
  add(
    desiredUsers.every((user) => user.email.includes("@")),
    "every pilot user has an email",
  );
  add(
    desiredUsers.every((user) => user.role === "agent" || user.role === "admin"),
    "every pilot user role is agent/admin",
  );
  add(
    desiredUsers.some((user) => user.role === "admin"),
    "pilot cohort includes at least one admin",
  );
  add(
    desiredUsers.filter((user) => user.role === "agent").length >= 2,
    "pilot cohort includes at least two agents",
  );
  add(
    uniqueEmails.size === desiredUsers.length,
    "pilot user emails are unique",
    `${uniqueEmails.size}/${desiredUsers.length}`,
  );
  if (verifySignIn || provision) {
    add(
      desiredUsers.every((user) => user.password.length >= 12),
      "every pilot user has a local password for verification",
    );
  }

  return checks;
}

function printReport(checks, desiredUsers) {
  for (const check of checks) {
    const detail = check.detail ? ` - ${check.detail}` : "";
    console.log(`${check.ok ? "PASS" : "BLOCKED"} ${check.label}${detail}`);
  }
  const adminCount = desiredUsers.filter((user) => user.role === "admin").length;
  const agentCount = desiredUsers.filter((user) => user.role === "agent").length;
  console.log(`Pilot cohort summary: total=${desiredUsers.length}, admins=${adminCount}, agents=${agentCount}`);
}

async function provisionPilotUsers(desiredUsers) {
  const admin = createClient(projectUrl, adminKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const publicClient = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const results = [];
  for (const user of desiredUsers) {
    const authUser = await ensureAuthUser(admin, user);
    await upsertProfile(admin, user, authUser.id);
    const signInVerified = verifySignIn
      ? await verifyUserSignIn(publicClient, user)
      : false;
    results.push({ ...user, authUserId: authUser.id, exists: true, roleVerified: true, signInVerified });
  }

  const updated = {
    ...cohort,
    recordedAt: new Date().toISOString(),
    projectRef,
    projectUrl,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    productionNotSandboxConfirmed: projectRef !== sandboxProjectRef,
    pilotUsers: mergePilotResults(cohort.pilotUsers ?? [], results),
    orphanAuthUsersWithoutProfileCount: cohort.orphanAuthUsersWithoutProfileCount ?? null,
  };

  updated.cohorts = updateSmokeCohorts(updated.cohorts ?? {}, results);
  writeFileSync(cohortPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(
    `Provisioned pilot cohort: total=${results.length}, admins=${results.filter((user) => user.role === "admin").length}, agents=${results.filter((user) => user.role === "agent").length}`,
  );
  console.log(`Updated ignored pilot evidence: ${cohortPath}`);
}

async function ensureAuthUser(admin, user) {
  const existing = await findUserByEmail(admin, user.email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password || randomPassword(),
    email_confirm: true,
    user_metadata: { display_name: user.displayName },
  });

  if (error || !data.user) {
    throw new Error(`Could not create pilot auth user for ${user.key}: ${error?.message ?? "missing user"}`);
  }

  return data.user;
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list auth users: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Could not find user after scanning 20000 auth records.");
}

async function upsertProfile(admin, user, userId) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: user.email,
      display_name: user.displayName,
      organization_name: user.organizationName,
      role: user.role,
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(`Could not upsert profile for ${user.key}: ${error.message}`);

  const { data, error: readError } = await admin
    .from("profiles")
    .select("id,role")
    .eq("id", userId)
    .maybeSingle();
  if (readError || data?.role !== user.role) {
    throw new Error(`Profile role verification failed for ${user.key}.`);
  }
}

async function verifyUserSignIn(publicClient, user) {
  const { data, error } = await publicClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  await publicClient.auth.signOut();
  if (error || !data.user) throw new Error(`Sign-in verification failed for ${user.key}.`);
  return true;
}

function mergePilotResults(existingUsers, results) {
  const byKey = new Map(results.map((user) => [user.key, user]));
  return existingUsers.map((user) => {
    const result = byKey.get(clean(user.key));
    if (!result) return user;
    return {
      ...user,
      exists: result.exists,
      roleVerified: result.roleVerified,
      signInVerified: result.signInVerified,
      authUserId: result.authUserId,
    };
  });
}

function updateSmokeCohorts(existingCohorts, users) {
  const admin = users.find((user) => user.role === "admin");
  const agents = users.filter((user) => user.role === "agent");
  return {
    ...existingCohorts,
    agent: smokeEntry(existingCohorts.agent, agents[0]),
    otherAgent: smokeEntry(existingCohorts.otherAgent, agents[1]),
    admin: smokeEntry(existingCohorts.admin, admin),
  };
}

function smokeEntry(existing, user) {
  if (!user) return existing ?? {};
  return {
    ...existing,
    email: user.email,
    exists: true,
    roleVerified: true,
    identifierRecorded: true,
  };
}

function randomPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
