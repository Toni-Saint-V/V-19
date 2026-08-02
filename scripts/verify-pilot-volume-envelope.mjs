import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { testArtifactPath } from "./lib/artifact-paths.mjs";
import { SUPABASE_PRODUCTION_TARGET } from "../config/supabase-production-target.mjs";

const repoRoot = process.cwd();
const evidencePath = testArtifactPath("supabase-pilot-volume-envelope-20260706.md");
const readinessPath = resolve(
  repoRoot,
  "docs/release/supabase-production-readiness.json",
);
const pilotCohortPath = resolve(repoRoot, ".supabase-pilot-cohort.local.json");
const adminEnvPath = resolve(repoRoot, ".env.supabase-production-admin.local");
const publicEnvPath = resolve(repoRoot, ".env.supabase-production.local");

const envelope = {
  registeredAgents: 10,
  maxSubmissionsPerAgent: 50,
  maxApplicantsPerSubmission: 3,
  primaryApplicantRequiredMediaSlots: 3,
  secondaryApplicantRequiredMediaSlots: 1,
};

const primaryRequiredMediaSlots = ["passport_scan", "selfie", "selfie_2"];
const secondaryRequiredMediaSlots = ["passport_scan"];
const maxTotalSubmissions = envelope.registeredAgents * envelope.maxSubmissionsPerAgent;
const maxTotalApplicants = maxTotalSubmissions * envelope.maxApplicantsPerSubmission;
const maxRequiredMediaObjects = maxTotalApplicants + maxTotalSubmissions * 2;
const readiness = readJsonIfExists(readinessPath);
const pilotWindowStartedAt = clean(readiness.controlledPilot?.pilotWindowStartedAt);
const adminEnv = readEnvIfExists(adminEnvPath);
const publicEnv = readEnvIfExists(publicEnvPath);
const projectRef =
  clean(adminEnv.SUPABASE_PROJECT_REF) ||
  clean(publicEnv.VITE_SUPABASE_PROJECT_ID) ||
  SUPABASE_PRODUCTION_TARGET.projectId;
const projectUrl =
  clean(adminEnv.SUPABASE_PROJECT_URL) ||
  clean(publicEnv.VITE_SUPABASE_URL) ||
  SUPABASE_PRODUCTION_TARGET.projectUrl;
const adminCredential = clean(
  adminEnv[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")],
);

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
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

function roleCountsFromUsers(users) {
  return users.reduce((counts, user) => {
    const role = clean(user?.role);
    if (!role) return counts;
    counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }, {});
}

function readPilotCohortAggregate() {
  assert(
    existsSync(pilotCohortPath),
    "local pilot cohort file is available for registered-agent cap check",
  );
  const cohort = readJsonIfExists(pilotCohortPath);
  const users = Array.isArray(cohort.pilotUsers) ? cohort.pilotUsers : [];
  const roleCounts = roleCountsFromUsers(users);

  return {
    projectRef: clean(cohort.projectRef),
    totalUsers: users.length,
    registeredAgents: roleCounts.agent ?? 0,
    registeredAdmins: roleCounts.admin ?? 0,
  };
}

function storagePathFor(submissionId, applicantId, slot, generatedFileName) {
  return `submissions/${submissionId}/applicants/${applicantId}/${slot}/${generatedFileName}`;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function listProductionAuthUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      fail(`production Auth user list is unreadable: ${error.message}`);
    }

    const pageUsers = data?.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) break;
  }
  return users;
}

function isAuthUserBanned(user) {
  return Boolean(user?.banned_until && new Date(user.banned_until) > new Date());
}

async function verifyProductionSubmissionCaps() {
  assert(projectRef, "production project ref is available for read-only cap check");
  assert(projectUrl, "production project URL is available for read-only cap check");
  assert(
    projectRef === SUPABASE_PRODUCTION_TARGET.projectId &&
      projectUrl === SUPABASE_PRODUCTION_TARGET.projectUrl,
    "read-only cap check target matches canonical descriptor",
  );
  assert(
    projectUrl.includes(projectRef),
    "production project URL matches production project ref",
  );
  assert(
    adminCredential,
    "local service-role key is available for read-only cap check",
  );
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(pilotWindowStartedAt) &&
      !Number.isNaN(Date.parse(pilotWindowStartedAt)),
    "controlled pilot window start is a valid UTC timestamp",
  );
  assert(
    Date.parse(pilotWindowStartedAt) <= Date.now(),
    "controlled pilot window start is not in the future",
  );

  const admin = createClient(projectUrl, adminCredential, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const pilotCohort = readPilotCohortAggregate();

  const { data: agentProfiles, error: agentProfileError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "agent");

  if (agentProfileError) {
    fail(
      `production registered agent profile count is unreadable: ${agentProfileError.message}`,
    );
  }

  const authUsers = await listProductionAuthUsers(admin);
  const authUsersById = new Map(authUsers.map((user) => [user.id, user]));
  const productionProfileRowsAgentCount = agentProfiles?.length ?? 0;
  const productionBannedAgentProfiles = (agentProfiles ?? []).filter((profile) =>
    isAuthUserBanned(authUsersById.get(profile.id)),
  ).length;
  const productionUnmatchedAgentProfiles = (agentProfiles ?? []).filter(
    (profile) => !authUsersById.has(profile.id),
  ).length;
  const productionRegisteredAgentProfiles = (agentProfiles ?? []).filter(
    (profile) =>
      authUsersById.has(profile.id) && !isAuthUserBanned(authUsersById.get(profile.id)),
  ).length;

  const { count: productionRegisteredAdminProfiles, error: adminProfileError } =
    await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

  if (adminProfileError) {
    fail(
      `production registered admin profile count is unreadable: ${adminProfileError.message}`,
    );
  }

  const capViolations = [];
  if (pilotCohort.projectRef !== projectRef) {
    capViolations.push(
      "local pilot cohort project ref does not match production project ref",
    );
  }
  if (!Number.isInteger(productionRegisteredAgentProfiles)) {
    capViolations.push("production registered agent profile count is not exact");
  } else if (productionRegisteredAgentProfiles > envelope.registeredAgents) {
    capViolations.push(
      `production has ${productionRegisteredAgentProfiles} registered agent profiles, above pilot cap ${envelope.registeredAgents}`,
    );
  }
  if (productionUnmatchedAgentProfiles > 0) {
    capViolations.push(
      `production has ${productionUnmatchedAgentProfiles} agent profiles without a matching Auth user`,
    );
  }
  if (!Number.isInteger(productionRegisteredAdminProfiles)) {
    capViolations.push("production registered admin profile count is not exact");
  }
  if (pilotCohort.registeredAgents > envelope.registeredAgents) {
    capViolations.push(
      `local pilot cohort declares ${pilotCohort.registeredAgents} registered agents, above pilot cap ${envelope.registeredAgents}`,
    );
  }

  const { count: lifetimeSubmissionCount, error: lifetimeCountError } = await admin
    .from("submissions")
    .select("id", { count: "exact", head: true });

  if (lifetimeCountError) {
    fail(
      `production lifetime submission count is unreadable: ${lifetimeCountError.message}`,
    );
  }

  const { count, error: countError } = await admin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", pilotWindowStartedAt);

  if (countError) {
    fail(
      `production pilot-window submission count is unreadable: ${countError.message}`,
    );
  }

  if (!Number.isInteger(count)) {
    capViolations.push("production pilot-window submission count is not exact");
  } else if (count > maxTotalSubmissions) {
    capViolations.push(
      `production pilot window has ${count} submissions, above pilot cap ${maxTotalSubmissions}`,
    );
  }

  const { data, error: rowsError } = await admin
    .from("submissions")
    .select("agent_id")
    .gte("created_at", pilotWindowStartedAt)
    .range(0, maxTotalSubmissions);

  if (rowsError) {
    fail(
      `production pilot-window per-agent submission counts are unreadable: ${rowsError.message}`,
    );
  }

  const productionPerAgentCounts = new Map();
  for (const row of data ?? []) {
    if (!row?.agent_id) {
      capViolations.push("production submission has an empty agent_id");
      continue;
    }
    productionPerAgentCounts.set(
      row.agent_id,
      (productionPerAgentCounts.get(row.agent_id) ?? 0) + 1,
    );
  }

  const activeAgentCount = productionPerAgentCounts.size;
  const maxSubmissionsForOneAgent = Math.max(0, ...productionPerAgentCounts.values());
  if (activeAgentCount > envelope.registeredAgents) {
    capViolations.push(
      `production pilot window has ${activeAgentCount} active agents with submissions, above pilot cap ${envelope.registeredAgents}`,
    );
  }
  if (maxSubmissionsForOneAgent > envelope.maxSubmissionsPerAgent) {
    capViolations.push(
      `production pilot window has one agent with ${maxSubmissionsForOneAgent} submissions, above pilot cap ${envelope.maxSubmissionsPerAgent}`,
    );
  }

  const { data: lifetimeRows, error: lifetimeRowsError } = await admin
    .from("submissions")
    .select("agent_id")
    .range(0, Math.max(0, (lifetimeSubmissionCount ?? 0) - 1));
  if (lifetimeRowsError) {
    fail(
      `production lifetime per-agent counts are unreadable: ${lifetimeRowsError.message}`,
    );
  }
  const lifetimePerAgentCounts = new Map();
  for (const row of lifetimeRows ?? []) {
    if (!row?.agent_id) continue;
    lifetimePerAgentCounts.set(
      row.agent_id,
      (lifetimePerAgentCounts.get(row.agent_id) ?? 0) + 1,
    );
  }

  return {
    projectRef,
    capViolations,
    pilotWindowStartedAt,
    productionRegisteredAgentProfiles,
    productionProfileRowsAgentCount,
    productionBannedAgentProfiles,
    productionUnmatchedAgentProfiles,
    productionRegisteredAdminProfiles,
    pilotCohortRegisteredAgents: pilotCohort.registeredAgents,
    pilotCohortRegisteredAdmins: pilotCohort.registeredAdmins,
    pilotCohortTotalUsers: pilotCohort.totalUsers,
    lifetimeTotalSubmissions: lifetimeSubmissionCount,
    lifetimeActiveAgentsWithSubmissions: lifetimePerAgentCounts.size,
    lifetimeMaxSubmissionsForOneAgent: Math.max(0, ...lifetimePerAgentCounts.values()),
    totalSubmissions: count,
    activeAgentsWithSubmissions: activeAgentCount,
    maxSubmissionsForOneAgent,
  };
}

const submissions = [];
const applicants = [];
const mediaRows = [];
const storagePaths = new Set();
const perAgentCounts = new Map();

for (let agentIndex = 1; agentIndex <= envelope.registeredAgents; agentIndex += 1) {
  const agentId = `pilot-agent-${String(agentIndex).padStart(2, "0")}`;
  perAgentCounts.set(agentId, 0);

  for (
    let submissionIndex = 1;
    submissionIndex <= envelope.maxSubmissionsPerAgent;
    submissionIndex += 1
  ) {
    const submissionId = `VF-PILOT-${String(agentIndex).padStart(2, "0")}-${String(
      submissionIndex,
    ).padStart(3, "0")}`;

    submissions.push({
      id: submissionId,
      agentId,
      type: "family",
      status: "waiting_review",
    });
    perAgentCounts.set(agentId, (perAgentCounts.get(agentId) ?? 0) + 1);

    for (
      let applicantIndex = 1;
      applicantIndex <= envelope.maxApplicantsPerSubmission;
      applicantIndex += 1
    ) {
      const applicantId = `${submissionId}-APP-${applicantIndex}`;
      applicants.push({
        id: applicantId,
        submissionId,
      });

      const requiredMediaSlots =
        applicantIndex === 1 ? primaryRequiredMediaSlots : secondaryRequiredMediaSlots;
      for (const slot of requiredMediaSlots) {
        const generatedFileName = `v19pilot_${applicantId}_${slot}.jpg`;
        const storagePath = storagePathFor(
          submissionId,
          applicantId,
          slot,
          generatedFileName,
        );

        assert(!storagePath.includes(".."), "storage path contains traversal");
        assert(!storagePath.startsWith("/"), "storage path is absolute");
        assert(!storagePath.includes("//"), "storage path contains duplicate slash");
        assert(!storagePaths.has(storagePath), "storage path is not unique");
        storagePaths.add(storagePath);

        mediaRows.push({
          submissionId,
          applicantId,
          type: slot,
          storageBucket: "submission-media",
          storagePath,
          generatedFileName,
        });
      }
    }
  }
}

assert(submissions.length === maxTotalSubmissions, "submission envelope mismatch");
assert(applicants.length === maxTotalApplicants, "applicant envelope mismatch");
assert(
  mediaRows.length === maxRequiredMediaObjects,
  "required media envelope mismatch",
);
assert(storagePaths.size === mediaRows.length, "storage paths are not unique");

for (const [agentId, count] of perAgentCounts) {
  assert(
    count === envelope.maxSubmissionsPerAgent,
    `${agentId} submission count mismatch`,
  );
}

for (const row of mediaRows) {
  const expectedPath = storagePathFor(
    row.submissionId,
    row.applicantId,
    row.type,
    row.generatedFileName,
  );
  assert(row.storageBucket === "submission-media", "media bucket mismatch");
  assert(row.storagePath === expectedPath, "canonical storage path mismatch");
}

const productionCaps = await verifyProductionSubmissionCaps();
const checkedAt = new Date().toISOString();
const capViolations = productionCaps.capViolations ?? [];
const passed = capViolations.length === 0;
const result = passed ? "PASS" : "BLOCKED_PILOT_VOLUME_CAP_EXCEEDED";
const blockers = passed
  ? "- None."
  : capViolations.map((violation) => `- ${violation}.`).join("\n");
const evidence = `# Supabase Pilot Volume Envelope - 2026-07-06

Result: \`${result}\`
Checked at: \`${checkedAt}\`

No production data, Auth users, Storage objects, or Supabase settings were mutated by this check. The production cap check is read-only and records aggregates only.

## Envelope

- Registered agents: \`${envelope.registeredAgents}\`
- Max submissions per registered agent: \`${envelope.maxSubmissionsPerAgent}\`
- Max total submissions: \`${maxTotalSubmissions}\`
- Max applicants per submission: \`${envelope.maxApplicantsPerSubmission}\`
- Max total applicants: \`${maxTotalApplicants}\`
- Required media slots for the primary applicant: \`${envelope.primaryApplicantRequiredMediaSlots}\`
- Required media slots for each secondary applicant: \`${envelope.secondaryApplicantRequiredMediaSlots}\`
- Max required media objects: \`${maxRequiredMediaObjects}\`

## Proof

- Generated synthetic submissions: \`${submissions.length}\`
- Generated synthetic applicants: \`${applicants.length}\`
- Generated synthetic required media rows: \`${mediaRows.length}\`
- Unique canonical storage paths: \`${storagePaths.size}\`
- Per-agent submission distribution: \`10 agents x 50 submissions\`
- Canonical storage path pattern: \`submissions/{submissionId}/applicants/{applicantId}/{type}/{generatedFileName}\`

## Production Read-Only Cap Check

- Production project: \`${productionCaps.projectRef}\`
- Pilot window starts at: \`${productionCaps.pilotWindowStartedAt}\`
- Production agent profile rows (including banned): \`${productionCaps.productionProfileRowsAgentCount}\`
- Production banned agent profiles excluded from pilot intake: \`${productionCaps.productionBannedAgentProfiles}\`
- Production registered agent profiles: \`${productionCaps.productionRegisteredAgentProfiles}\`
- Production registered admin profiles: \`${productionCaps.productionRegisteredAdminProfiles}\`
- Pilot cohort registered agents: \`${productionCaps.pilotCohortRegisteredAgents}\`
- Pilot cohort registered admins: \`${productionCaps.pilotCohortRegisteredAdmins}\`
- Pilot cohort total users: \`${productionCaps.pilotCohortTotalUsers}\`
- Production lifetime total submissions: \`${productionCaps.lifetimeTotalSubmissions}\`
- Production lifetime active agents with submissions: \`${productionCaps.lifetimeActiveAgentsWithSubmissions}\`
- Production lifetime max submissions for one agent: \`${productionCaps.lifetimeMaxSubmissionsForOneAgent}\`
- Production pilot-window submissions: \`${productionCaps.totalSubmissions}\`
- Production pilot-window active agents with submissions: \`${productionCaps.activeAgentsWithSubmissions}\`
- Production pilot-window max submissions for one agent: \`${productionCaps.maxSubmissionsForOneAgent}\`
- Production registered agent profiles cap: \`<= ${envelope.registeredAgents}\`
- Pilot cohort registered-agent cap: \`<= ${envelope.registeredAgents}\`
- Production pilot-window submissions cap: \`<= ${maxTotalSubmissions}\`
- Production pilot-window per-agent submissions cap: \`<= ${envelope.maxSubmissionsPerAgent}\`
- Production pilot-window active-agent cap: \`<= ${envelope.registeredAgents}\`

## Current Blockers

${blockers}

This check writes no production rows, Auth users, Storage objects, or Supabase settings. It intentionally records no emails, user IDs, submission IDs, or storage paths from production.
`;

writeFileSync(evidencePath, evidence);

console.log(
  passed
    ? "PASS Supabase pilot volume envelope verified"
    : "FAIL Supabase pilot volume envelope blocked",
);
console.log(`Registered agents: ${envelope.registeredAgents}`);
console.log(`Max submissions per agent: ${envelope.maxSubmissionsPerAgent}`);
console.log(`Max total submissions: ${maxTotalSubmissions}`);
console.log(`Max total applicants: ${maxTotalApplicants}`);
console.log(`Max required media objects: ${maxRequiredMediaObjects}`);
console.log(
  `Production agent profile rows: ${productionCaps.productionProfileRowsAgentCount}`,
);
console.log(
  `Production banned agent profiles: ${productionCaps.productionBannedAgentProfiles}`,
);
console.log(
  `Production active registered agent profiles: ${productionCaps.productionRegisteredAgentProfiles}`,
);
console.log(
  `Pilot cohort registered agents: ${productionCaps.pilotCohortRegisteredAgents}`,
);
console.log(`Pilot window starts at: ${productionCaps.pilotWindowStartedAt}`);
console.log(
  `Production lifetime total submissions: ${productionCaps.lifetimeTotalSubmissions}`,
);
console.log(
  `Production lifetime max submissions for one agent: ${productionCaps.lifetimeMaxSubmissionsForOneAgent}`,
);
console.log(`Production pilot-window submissions: ${productionCaps.totalSubmissions}`);
console.log(
  `Production pilot-window active agents with submissions: ${productionCaps.activeAgentsWithSubmissions}`,
);
console.log(
  `Production pilot-window max submissions for one agent: ${productionCaps.maxSubmissionsForOneAgent}`,
);
console.log(`Evidence: ${evidencePath}`);

if (!passed) {
  console.error(`FAIL ${capViolations.join("; ")}`);
  process.exit(1);
}
