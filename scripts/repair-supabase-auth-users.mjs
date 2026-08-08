import {
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  cleanAuthRepairValue,
  defaultAuthRepairPlan,
  mergeAuthRepairMetadata,
  normalizeAuthRepairEmail,
  passwordForAuthRepairUser,
  projectRefFromSupabaseUrl,
  validateAuthRepairPlan,
} from "./lib/supabase-auth-repair.mjs";

const repoRoot = process.cwd();
const sandboxProjectRef = "oevvaowoklqttqkraxho";
const adminEnvPath = resolve(repoRoot, ".env.supabase-production-admin.local");
const publicEnvPath = resolve(repoRoot, ".env.supabase-production.local");
const planPath = resolve(repoRoot, ".supabase-auth-repair.local.json");
const defaultResultPath = resolve(
  repoRoot,
  ".supabase-auth-repair-result.local.json",
);
const readinessPath = resolve(
  repoRoot,
  "docs/release/supabase-production-readiness.json",
);

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const knownArgs = new Set([
  "--write-template",
  "--check",
  "--repair",
  "--force",
]);
const unknownArgs = rawArgs.filter((arg) => !knownArgs.has(arg));
const writeTemplate = args.has("--write-template");
const checkOnly = args.has("--check");
const repair = args.has("--repair");
const force = args.has("--force");
const selectedModes = [writeTemplate, checkOnly, repair].filter(Boolean).length;

if (unknownArgs.length) {
  fail(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}
if (force && !writeTemplate) {
  fail("--force is allowed only with --write-template.");
}
if (selectedModes !== 1) {
  usage();
  process.exit(2);
}

const readiness = readJsonIfExists(readinessPath);
const adminEnv = readEnvIfExists(adminEnvPath);
const publicEnv = readEnvIfExists(publicEnvPath);
const projectUrl =
  cleanAuthRepairValue(adminEnv.SUPABASE_PROJECT_URL) ||
  cleanAuthRepairValue(publicEnv.VITE_SUPABASE_URL) ||
  cleanAuthRepairValue(readiness.productionTarget?.projectUrl);
const projectRef =
  cleanAuthRepairValue(adminEnv.SUPABASE_PROJECT_REF) ||
  cleanAuthRepairValue(publicEnv.VITE_SUPABASE_PROJECT_ID) ||
  cleanAuthRepairValue(readiness.productionTarget?.projectId) ||
  projectRefFromSupabaseUrl(projectUrl);
const publishableKey = cleanAuthRepairValue(
  publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY || publicEnv.VITE_SUPABASE_ANON_KEY,
);
const adminKey = cleanAuthRepairValue(
  adminEnv[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")],
);

if (writeTemplate) {
  writeRepairTemplate();
  process.exit(0);
}

const plan = readJsonIfExists(planPath);
const validation = validateAuthRepairPlan({
  config: plan,
  projectRef,
  projectUrl,
  requireAdminKey: repair,
  requirePublishableKey: repair,
  adminKey,
  publishableKey,
});
if (projectRef === sandboxProjectRef) {
  validation.failures.push("repair refuses the known sandbox project");
}
try {
  resolveRepairResultPath(plan.resultPath);
} catch (error) {
  validation.failures.push(errorMessage(error));
}

printValidation(validation, projectRef, projectUrl);
if (validation.failures.length) process.exit(1);
if (checkOnly) process.exit(0);

await repairUsers(validation.users, plan);

function usage() {
  console.log("Usage:");
  console.log("  npm run supabase:repair-auth -- --write-template");
  console.log("  npm run supabase:repair-auth -- --check");
  console.log("  npm run supabase:repair-auth -- --repair");
  console.log("");
  console.log(
    "The repair mode rotates passwords, clears password_setup_required, repairs profiles, verifies sign-in, and revokes other sessions.",
  );
}

function writeRepairTemplate() {
  if (existsSync(planPath) && !force) {
    fail(
      `${basename(planPath)} already exists. Use --force only when overwriting it is intentional.`,
    );
  }

  const template = defaultAuthRepairPlan({
    expectedProjectRef: projectRef,
    expectedProjectUrl: projectUrl,
  });
  writePrivateJson(planPath, template);
  console.log(`Wrote ignored repair plan: ${basename(planPath)}`);
  console.log("Fill only email and role. Generated passwords are the safe default.");
}

function printValidation(validation, targetProjectRef, targetProjectUrl) {
  const checks = [
    [validation.failures.length === 0, "repair plan is valid"],
    [Boolean(targetProjectRef), "target project ref is recorded"],
    [Boolean(targetProjectUrl), "target project URL is recorded"],
    [targetProjectRef !== sandboxProjectRef, "target is not the known sandbox"],
    [validation.users.length > 0, "repair plan contains users"],
  ];

  for (const [ok, label] of checks) {
    console.log(`${ok ? "PASS" : "BLOCKED"} ${label}`);
  }
  for (const failure of validation.failures) {
    console.log(`BLOCKED ${failure}`);
  }
  console.log(
    `Repair scope: project=${targetProjectRef || "missing"}, users=${validation.users.length}`,
  );
}

async function repairUsers(users, plan) {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(projectUrl, adminKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const prepared = await prepareRepairUsers(admin, users);
  const resultPath = resolveRepairResultPath(plan.resultPath);
  const receipt = {
    schemaVersion: 1,
    projectRef,
    projectUrl,
    status: "prepared",
    preparedAt: new Date().toISOString(),
    completedAt: null,
    users: prepared.map((item) => ({
      key: item.user.key,
      email: item.user.email,
      role: item.user.role,
      password: passwordForAuthRepairUser(item.user),
      authUserId: item.existingAuthUser?.id ?? null,
      profileDisplayName: null,
      profileOrganizationName: null,
      created: !item.existingAuthUser,
      status: "prepared",
      verifiedAt: null,
    })),
    securityNote:
      "Distribute the generated passwords, then delete this ignored local receipt.",
  };

  writePrivateJson(resultPath, receipt);
  console.log(
    `PASS prepared private credential receipt: ${relative(repoRoot, resultPath)}`,
  );

  let activeIndex = -1;
  try {
    for (const [index, item] of prepared.entries()) {
      activeIndex = index;
      const result = receipt.users[index];
      result.status = "updating";
      receipt.status = "in_progress";
      receipt.updatedAt = new Date().toISOString();
      writePrivateJson(resultPath, receipt);

      const authUser = await writeAuthUser(admin, item, result.password);
      result.authUserId = authUser.id;
      writePrivateJson(resultPath, receipt);

      const profile = await writeProfile(admin, item, authUser);
      await verifyCanonicalState(admin, item.user, authUser.id);
      await verifySignInAndRevokeOtherSessions(
        createClient,
        item.user,
        authUser.id,
        result.password,
      );

      Object.assign(result, {
        profileDisplayName: profile.display_name,
        profileOrganizationName: profile.organization_name,
        status: "verified",
        verifiedAt: new Date().toISOString(),
      });
      receipt.updatedAt = new Date().toISOString();
      writePrivateJson(resultPath, receipt);
      console.log(`PASS repaired and verified ${item.user.key}`);
    }
  } catch (error) {
    if (activeIndex >= 0 && receipt.users[activeIndex]) {
      receipt.users[activeIndex].status = "failed";
    }
    receipt.status = "partial_failure";
    receipt.failedAt = new Date().toISOString();
    receipt.failure = errorMessage(error);
    writePrivateJson(resultPath, receipt);
    console.error(
      `BLOCKED auth repair stopped; recovery credentials remain in ${relative(repoRoot, resultPath)}`,
    );
    throw error;
  }

  receipt.status = "completed";
  receipt.completedAt = new Date().toISOString();
  receipt.updatedAt = receipt.completedAt;
  writePrivateJson(resultPath, receipt);

  console.log(`PASS auth repair completed for ${receipt.users.length} users`);
  console.log(`Generated credentials: ${relative(repoRoot, resultPath)}`);
  console.log("Passwords were not printed to the terminal.");
}

async function prepareRepairUsers(admin, users) {
  const prepared = [];

  for (const user of users) {
    const existingAuthUser = await findUserByEmail(admin, user.email);
    if (!existingAuthUser && !user.createIfMissing) {
      throw new Error(
        `${user.key}: auth user was not found and createIfMissing is false`,
      );
    }

    const existingProfile = existingAuthUser
      ? await readProfile(admin, existingAuthUser.id)
      : null;
    prepared.push({ user, existingAuthUser, existingProfile });
  }

  return prepared;
}

async function writeAuthUser(admin, item, password) {
  const displayName = resolvedDisplayName(item);
  const metadata = mergeAuthRepairMetadata(
    item.existingAuthUser?.user_metadata,
    displayName,
  );

  if (item.existingAuthUser) {
    const { data, error } = await admin.auth.admin.updateUserById(
      item.existingAuthUser.id,
      {
        password,
        email_confirm: true,
        user_metadata: metadata,
      },
    );
    if (error || !data.user) {
      throw new Error(
        `${item.user.key}: auth update failed: ${error?.message ?? "missing user"}`,
      );
    }
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: item.user.email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) {
    throw new Error(
      `${item.user.key}: auth create failed: ${error?.message ?? "missing user"}`,
    );
  }
  return data.user;
}

async function writeProfile(admin, item, authUser) {
  const profile = {
    id: authUser.id,
    email: item.user.email,
    display_name: resolvedDisplayName(item),
    organization_name:
      item.user.organizationName ||
      cleanAuthRepairValue(item.existingProfile?.organization_name) ||
      null,
    role: item.user.role,
  };
  const { error } = await admin.from("profiles").upsert(profile, {
    onConflict: "id",
  });
  if (error) {
    throw new Error(`${item.user.key}: profile repair failed: ${error.message}`);
  }
  return profile;
}

async function verifyCanonicalState(admin, user, authUserId) {
  const { data: authData, error: authError } =
    await admin.auth.admin.getUserById(authUserId);
  if (authError || !authData.user) {
    throw new Error(
      `${user.key}: auth readback failed: ${authError?.message ?? "missing user"}`,
    );
  }
  if (normalizeAuthRepairEmail(authData.user.email) !== user.email) {
    throw new Error(`${user.key}: auth readback email mismatch`);
  }
  if (authData.user.user_metadata?.password_setup_required === true) {
    throw new Error(`${user.key}: password_setup_required remains true`);
  }
  if (!authData.user.email_confirmed_at) {
    throw new Error(`${user.key}: email is not confirmed`);
  }

  const profile = await readProfile(admin, authUserId);
  if (!profile) throw new Error(`${user.key}: profile readback is missing`);
  if (normalizeAuthRepairEmail(profile.email) !== user.email) {
    throw new Error(`${user.key}: profile email mismatch`);
  }
  if (profile.role !== user.role) {
    throw new Error(`${user.key}: profile role mismatch`);
  }
}

async function verifySignInAndRevokeOtherSessions(
  createClient,
  user,
  authUserId,
  password,
) {
  const client = createClient(projectUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error || data.user?.id !== authUserId || !data.session) {
    throw new Error(
      `${user.key}: sign-in verification failed: ${error?.message ?? "session mismatch"}`,
    );
  }

  const otherSessions = await client.auth.signOut({ scope: "others" });
  if (otherSessions.error) {
    throw new Error(
      `${user.key}: other-session revocation failed: ${otherSessions.error.message}`,
    );
  }
  const localSession = await client.auth.signOut({ scope: "local" });
  if (localSession.error) {
    throw new Error(
      `${user.key}: verification session cleanup failed: ${localSession.error.message}`,
    );
  }
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`Could not list auth users: ${error.message}`);
    const found = data.users.find(
      (user) => normalizeAuthRepairEmail(user.email) === email,
    );
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Could not find user after scanning 20000 auth records.");
}

async function readProfile(admin, userId) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,display_name,organization_name,role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not read profile ${userId}: ${error.message}`);
  return data;
}

function resolvedDisplayName(item) {
  return (
    item.user.displayName ||
    cleanAuthRepairValue(item.existingProfile?.display_name) ||
    cleanAuthRepairValue(item.existingAuthUser?.user_metadata?.display_name) ||
    item.user.email.split("@")[0]
  );
}

function resolveRepairResultPath(configuredPath) {
  const requested = cleanAuthRepairValue(configuredPath);
  const candidate = requested ? resolve(repoRoot, requested) : defaultResultPath;
  const rel = relative(repoRoot, candidate);
  const contained =
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  if (!contained || dirname(candidate) !== repoRoot) {
    throw new Error("resultPath must be a file in the repository root");
  }
  if (!basename(candidate).endsWith(".local.json")) {
    throw new Error("resultPath must end with .local.json");
  }
  return candidate;
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

function writePrivateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
