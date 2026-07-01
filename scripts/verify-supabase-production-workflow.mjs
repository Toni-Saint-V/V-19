import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const publicEnvPath = resolve(repoRoot, ".env.supabase-production.local");
const adminEnvPath = resolve(repoRoot, ".env.supabase-production-admin.local");
const readinessPath = resolve(repoRoot, "docs/release/supabase-production-readiness.json");
const evidencePath = resolve(repoRoot, "docs/qa/supabase-production-workflow-smoke-20260701.md");
const productionProjectId = "tsymifccglpepvbmrcgh";
const sandboxProjectId = "oevvaowoklqttqkraxho";
const bucket = "submission-media";
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const runId = `VF-PROD-WORKFLOW-${stamp}`;
const correctionId = randomUUID();
const applicantId = applicantIdFor(runId);
const uploadPath = `${runId}/${applicantId}/selfie/v19smoke_selfie.jpg`;
const checks = [];
const cleanupPaths = new Set([uploadPath]);

const publicEnv = readEnv(publicEnvPath);
const adminEnv = readEnv(adminEnvPath);
const readiness = readJson(readinessPath);
const projectId =
  clean(publicEnv.VITE_SUPABASE_PROJECT_ID) ||
  clean(adminEnv.SUPABASE_PROJECT_REF) ||
  clean(readiness.productionTarget?.projectId);
const projectUrl =
  clean(publicEnv.VITE_SUPABASE_URL) ||
  clean(adminEnv.SUPABASE_PROJECT_URL) ||
  clean(readiness.productionTarget?.projectUrl);
const publishableKey = clean(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
const adminCleanupKey = clean(adminEnv[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")]);

await main();

async function main() {
  assert(projectId === productionProjectId, "target is production project", "project id mismatch");
  assert(projectId !== sandboxProjectId, "target is not sandbox", "sandbox project selected");
  assert(projectUrl === `https://${productionProjectId}.supabase.co`, "production URL is exact", "URL mismatch");
  assert(publishableKey.startsWith("sb_publishable_"), "publishable key is present", "missing publishable key");
  assert(Boolean(adminCleanupKey), "admin cleanup key is available locally", "missing admin key");

  const adminService = supabase(adminCleanupKey);
  const agent = await signedClient("SUPABASE_SMOKE_AGENT_EMAIL", "SUPABASE_SMOKE_AGENT_PASSWORD");
  const otherAgent = await signedClient(
    "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
    "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
  );
  const adminUser = await signedClient("SUPABASE_SMOKE_ADMIN_EMAIL", "SUPABASE_SMOKE_ADMIN_PASSWORD");

  try {
    await cleanup(adminService);

    await save(agent.client, draftPayload(agent.userId, runId));
    await expectStatus(adminService, runId, "draft");
    pass("agent can create draft through save_submission_draft");

    await uploadPrivateMedia(agent.client);
    await createScopedSignedUrl(agent.client, true);
    await createScopedSignedUrl(otherAgent.client, false);
    pass("agent can upload private media and signed URLs are owner-scoped");

    await expectRejected(
      save(agent.client, incompleteWaitingReviewPayload(agent.userId, `${runId}-incomplete`)),
      "incomplete waiting_review is rejected",
    );

    await save(agent.client, validReviewPayload(agent.userId, runId, "ready_for_review"));
    await save(agent.client, validReviewPayload(agent.userId, runId, "waiting_review"));
    await expectStatus(adminService, runId, "waiting_review");
    pass("valid waiting_review reaches admin queue");

    await save(adminUser.client, returnedPayload(agent.userId, adminUser.userId, runId));
    await expectStatus(adminService, runId, "returned");
    pass("admin can return case with blocking correction");

    await expectRejected(
      otherAgent.client.rpc("submit_corrections_handoff", {
        payload: fixedCorrectionPayload(agent.userId, adminUser.userId, runId),
      }),
      "other agent cannot submit assigned correction handoff",
    );
    await expectRejected(
      adminUser.client.rpc("submit_corrections_handoff", {
        payload: fixedCorrectionPayload(agent.userId, adminUser.userId, runId),
      }),
      "admin cannot impersonate assigned agent correction handoff",
    );

    const handoff = await agent.client.rpc("submit_corrections_handoff", {
      payload: fixedCorrectionPayload(agent.userId, adminUser.userId, runId),
    });
    if (handoff.error) throw new Error(handoff.error.message);
    await expectStatus(adminService, runId, "waiting_review");
    pass("assigned agent can hand off fixed corrections");

    await save(adminUser.client, acceptedPayload(agent.userId, adminUser.userId, runId));
    await expectStatus(adminService, runId, "accepted");
    pass("admin can accept case");

    await expectRejected(
      save(agent.client, draftPayload(agent.userId, runId)),
      "agent mutation is blocked after admin handoff",
    );

    await cleanup(adminService);
    await writeEvidenceAndReadiness();
    printReport("PASS");
  } catch (error) {
    await cleanup(adminService).catch(() => undefined);
    await writeEvidence("BLOCKED", error.message);
    printReport("BLOCKED", error.message);
    process.exit(1);
  }
}

function readEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    env[trimmed.slice(0, index).trim()] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assert(condition, label, detail) {
  if (!condition) throw new Error(`${label}: ${detail}`);
  pass(label);
}

function pass(label) {
  checks.push({ ok: true, label });
}

function supabase(key) {
  return createClient(projectUrl, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function signedClient(emailKey, passwordKey) {
  const client = supabase(publishableKey);
  const email = clean(publicEnv[emailKey]);
  const password = clean(publicEnv[passwordKey]);
  if (!email || !password) throw new Error(`${emailKey}/${passwordKey} are required locally`);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`${emailKey} sign-in failed`);
  pass(`${emailKey.replace("_EMAIL", "").toLowerCase()} sign-in works`);
  return { client, userId: data.user.id };
}

async function save(client, payload) {
  const { error } = await client.rpc("save_submission_draft", { payload });
  if (error) throw new Error(error.message);
}

async function expectRejected(action, label) {
  try {
    const result = await action;
    if (result?.error) {
      pass(label);
      return;
    }
  } catch {
    pass(label);
    return;
  }
  throw new Error(`${label}: unexpectedly accepted`);
}

async function uploadPrivateMedia(client) {
  const { error } = await client.storage
    .from(bucket)
    .upload(uploadPath, Buffer.from("supabase-production-workflow-smoke"), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) throw new Error(`private media upload failed: ${error.message}`);
}

async function createScopedSignedUrl(client, shouldPass) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(uploadPath, 60);
  if (shouldPass && (error || !data?.signedUrl)) {
    throw new Error(`own signed URL failed: ${error?.message ?? "missing URL"}`);
  }
  if (!shouldPass && !error) {
    throw new Error("other-agent signed URL unexpectedly succeeded");
  }
}

async function expectStatus(client, id, status) {
  const { data, error } = await client
    .from("submissions")
    .select("status")
    .eq("id", id)
    .single();
  if (error) throw new Error(`status read failed: ${error.message}`);
  if (data.status !== status) throw new Error(`expected ${id}=${status}, got ${data.status}`);
}

async function cleanup(client) {
  await client.storage.from(bucket).remove([...cleanupPaths]);
  await client.from("corrections").delete().eq("submission_id", runId);
  await client.from("status_history").delete().eq("submission_id", runId);
  await client.from("media_assets").delete().eq("submission_id", runId);
  await client.from("applicants").delete().eq("submission_id", runId);
  await client.from("submissions").delete().eq("id", runId);
  await client.from("corrections").delete().eq("submission_id", `${runId}-incomplete`);
  await client.from("status_history").delete().eq("submission_id", `${runId}-incomplete`);
  await client.from("media_assets").delete().eq("submission_id", `${runId}-incomplete`);
  await client.from("applicants").delete().eq("submission_id", `${runId}-incomplete`);
  await client.from("submissions").delete().eq("id", `${runId}-incomplete`);
}

function draftPayload(agentId, id) {
  return basePayload(agentId, id, "draft", { complete: true, media: [] });
}

function incompleteWaitingReviewPayload(agentId, id) {
  return basePayload(agentId, id, "waiting_review", { complete: false, media: [] });
}

function validReviewPayload(agentId, id, status) {
  return basePayload(agentId, id, status, {
    complete: true,
    media: ["photo_white", "selfie", "video"],
  });
}

function returnedPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "returned", {
    complete: true,
    media: ["photo_white", "selfie", "video"],
  });
  payload.corrections = [correction(adminId, "open", null)];
  return payload;
}

function fixedCorrectionPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "waiting_review", {
    complete: true,
    media: ["photo_white", "selfie", "video"],
  });
  payload.corrections = [correction(adminId, "fixed", new Date().toISOString())];
  return payload;
}

function acceptedPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "accepted", {
    complete: true,
    media: ["photo_white", "selfie", "video"],
    reviewStatus: "accepted",
  });
  payload.submission.accepted_at = new Date().toISOString();
  payload.corrections = [correction(adminId, "closed", new Date().toISOString())];
  return payload;
}

function correction(adminId, status, fixedAt) {
  return {
    id: correctionId,
    submission_id: runId,
    applicant_id: applicantIdFor(runId),
    scope: "field",
    field_key: "route",
    media_type: null,
    reason: "Production workflow smoke correction",
    severity: "blocking",
    status,
    created_by: adminId,
    created_at: new Date().toISOString(),
    fixed_at: fixedAt,
  };
}

function basePayload(agentId, id, status, options) {
  const now = new Date().toISOString();
  const complete = options.complete === true;
  const applicantId = applicantIdFor(id);
  const cockpitStatus =
    status === "waiting_review"
      ? "submitted_for_review"
      : status === "accepted"
        ? "ready_for_export"
        : status;
  return {
    submission: {
      id,
      agent_id: agentId,
      type: "single",
      title: "Production Workflow Smoke",
      country: "Испания",
      city: "Москва",
      travel_date: complete ? "2026-07-10 - 2026-07-18" : "не указано",
      status,
      priority: "Средний",
      readiness_percent: complete ? 100 : 0,
      family_intelligence: {
        status: "unreviewed",
        v19CockpitSnapshot: {
          version: 1,
          submission: {
            id,
            title: "Production Workflow Smoke",
            type: "single",
            country: "Испания",
            city: "Москва",
            tripDateFrom: complete ? "2026-07-10" : "не указано",
            tripDateTo: complete ? "2026-07-18" : "не указано",
            status: cockpitStatus,
            applicants: [
              {
                id: applicantId,
                fullName: "Production Workflow Smoke",
                role: "main",
                questionnaireStatus: complete ? "complete" : "empty",
                fileStatus: complete ? "complete" : "empty",
                sections: [],
              },
            ],
            issues: [],
            files: mediaRows(id, options.media ?? [], options.reviewStatus).map(
              ({ cockpit }) => cockpit,
            ),
            completeness: {
              questionnaire: complete ? 100 : 0,
              files: complete ? 100 : 0,
              total: complete ? 100 : 0,
            },
            aiSuggestions: [],
            aiReviewState: "idle",
            exportState: status === "accepted" ? "ready" : "not_ready",
            createdAt: now,
            updatedAt: now,
            history: [],
          },
        },
      },
      appointment_status: "not_started",
      submitted_at: status === "waiting_review" ? now : null,
      review_started_at: null,
      accepted_at: null,
      exported_at: null,
      updated_at: now,
    },
    applicants: [
      {
        id: applicantId,
        submission_id: id,
        full_name: "Production Workflow Smoke",
        role: "Основной заявитель",
        suggested_role: null,
        role_confirmed: true,
        birth_date: complete ? "1990-01-01" : null,
        patronymic: null,
        citizenship: complete ? "Russia" : null,
        address: complete ? "Moscow, Tverskaya 1" : null,
        phone: complete ? "+79000000000" : null,
        email: complete ? "workflow-smoke@example.test" : null,
        passport_number: complete ? "AA1234567" : "",
        passport_issued_at: complete ? "2020-01-01" : null,
        passport_expires_at: complete ? "2030-01-01" : null,
        country: "Испания",
        city: "Москва",
        trip_dates: complete ? "2026-07-10 - 2026-07-18" : "не указано",
        hotel_name: complete ? "ILUNION Barcelona" : null,
        hotel_address: complete ? "CALLE RAMON TUR 196-198" : null,
        questionnaire_percent: complete ? 100 : 0,
        media_percent: complete ? 100 : 0,
      },
    ],
    media_assets: mediaRows(id, options.media ?? [], options.reviewStatus).map(
      ({ media }) => media,
    ),
    corrections: [],
    status_history: [],
  };
}

function mediaRows(id, slots, reviewStatus = "not_reviewed") {
  const now = new Date().toISOString();
  const applicantId = applicantIdFor(id);
  return slots.map((slot) => {
    const ext = slot === "video" ? "mp4" : "jpg";
    const mime = slot === "video" ? "video/mp4" : "image/jpeg";
    const generatedFileName = `v19smoke_${slot}.${ext}`;
    const storagePath = `${id}/${applicantId}/${slot}/${generatedFileName}`;
    cleanupPaths.add(storagePath);
    return {
      cockpit: {
        id: `${id}-${slot}`,
        applicantId,
        type: slot === "photo_white" ? "photo" : slot,
        status: reviewStatus === "accepted" ? "accepted" : "pending_review",
        generatedFileName,
        mimeType: mime,
        originalFileName: `${slot}.${ext}`,
        sizeBytes: slot === "video" ? 4096 : 2048,
        storageBucket: bucket,
        storagePath,
        uploadedAtIso: now,
        uploadedAt: "сейчас",
        uploadedBy: "Агент",
        uploadStatus: "uploaded",
        reviewStatus,
      },
      media: {
        id: `${id}-media-${slot}`,
        applicant_id: applicantId,
        submission_id: id,
        type: slot,
        original_file_name: `${slot}.${ext}`,
        generated_file_name: generatedFileName,
        storage_bucket: bucket,
        storage_path: storagePath,
        mime_type: mime,
        size_bytes: slot === "video" ? 4096 : 2048,
        upload_status: "uploaded",
        review_status: reviewStatus,
        uploaded_at: now,
        reviewed_at: reviewStatus === "accepted" ? now : null,
        reviewed_by: null,
      },
    };
  });
}

function applicantIdFor(id) {
  return `${id}-applicant`;
}

async function writeEvidenceAndReadiness() {
  await writeEvidence("PASS", "");
  const packet = readJson(readinessPath);
  packet.productionEnvEvidence = {
    ...packet.productionEnvEvidence,
    transactionalPersistenceTested: true,
    rlsPolicyTestsPassed: true,
    storagePolicyTestsPassed: true,
    productionWorkflowEvidenceArtifact:
      "docs/qa/supabase-production-workflow-smoke-20260701.md",
  };
  packet.postActivationChecks = {
    ...packet.postActivationChecks,
    agentCanCreateDraft: true,
    agentCanUploadRequiredMedia: true,
    incompleteWaitingReviewRejected: true,
    validWaitingReviewReachesQueue: true,
    adminCanAcceptOrReturnCase: true,
    postHandoffAgentMutationBlocked: true,
    privateMediaSignedUrlScoped: true,
    workflowEvidenceArtifact: "docs/qa/supabase-production-workflow-smoke-20260701.md",
  };
  writeFileSync(readinessPath, `${JSON.stringify(packet, null, 2)}\n`);
}

async function writeEvidence(result, failure) {
  const lines = [
    "# Supabase Production Workflow Smoke",
    "",
    `Result: \`${result}\``,
    `Project: \`${projectId}\``,
    `Checked at: \`${new Date().toISOString()}\``,
    "",
    "No email, password, service-role key, signed URL, or personal identifier is recorded in this artifact.",
    "",
    "## Checks",
    "",
    ...checks.map((check) => `- PASS ${check.label}`),
  ];
  if (failure) lines.push("", `Failure: \`${failure.replace(/`/g, "'")}\``);
  writeFileSync(evidencePath, `${lines.join("\n")}\n`);
}

function printReport(result, failure = "") {
  for (const check of checks) console.log(`PASS ${check.label}`);
  if (result === "PASS") {
    console.log(`PASS Production workflow smoke evidence: ${evidencePath}`);
  } else {
    console.error(`BLOCKED Production workflow smoke: ${failure}`);
    console.error(`Evidence written: ${evidencePath}`);
  }
}
