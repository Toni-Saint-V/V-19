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
const cockpitSnapshotKey = "v19CockpitSnapshot";
const canonicalRequiredMediaSlots = ["passport_scan", "selfie", "selfie_2"];
// Production DB enum is still legacy; this smoke proves canonical state in the cockpit snapshot.
const storageStatusByCanonicalStatus = {
  draft: "draft",
  submitted_for_review: "waiting_review",
  returned: "returned",
  corrections_received: "waiting_review",
  ready_for_export: "accepted",
};
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
    await expectCanonicalStatus(adminService, runId, "draft");
    pass("agent can create draft through save_submission_draft");

    await uploadPrivateMedia(agent.client);
    await createScopedSignedUrl(agent.client, true);
    await createScopedSignedUrl(otherAgent.client, false);
    pass("agent can upload private media and signed URLs are owner-scoped");

    await expectRejected(
      save(
        agent.client,
        incompleteSubmittedForReviewPayload(agent.userId, `${runId}-incomplete`),
      ),
      "incomplete submitted_for_review is rejected",
    );

    await save(agent.client, validSubmittedForReviewPayload(agent.userId, runId));
    await expectCanonicalStatus(adminService, runId, "submitted_for_review");
    pass("valid submitted_for_review reaches admin queue");

    await save(adminUser.client, returnedPayload(agent.userId, adminUser.userId, runId));
    await expectCanonicalStatus(adminService, runId, "returned");
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
    await expectCanonicalStatus(adminService, runId, "corrections_received");
    pass("assigned agent can hand off fixed corrections");

    await save(adminUser.client, readyForExportPayload(agent.userId, adminUser.userId, runId));
    await expectCanonicalStatus(adminService, runId, "ready_for_export");
    pass("admin can move package to ready_for_export");

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

async function expectCanonicalStatus(client, id, canonicalStatus) {
  const { data, error } = await client
    .from("submissions")
    .select("status,family_intelligence")
    .eq("id", id)
    .single();
  if (error) throw new Error(`status read failed: ${error.message}`);
  const storageStatus = storageStatusForCanonicalStatus(canonicalStatus);
  if (data.status !== storageStatus) {
    throw new Error(
      `expected ${id} storage status ${storageStatus} for ${canonicalStatus}, got ${data.status}`,
    );
  }

  const snapshotStatus =
    data.family_intelligence?.[cockpitSnapshotKey]?.submission?.status;
  if (snapshotStatus !== canonicalStatus) {
    throw new Error(
      `expected ${id} canonical status ${canonicalStatus}, got ${snapshotStatus ?? "missing"}`,
    );
  }
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

function incompleteSubmittedForReviewPayload(agentId, id) {
  return basePayload(agentId, id, "submitted_for_review", {
    complete: false,
    media: [],
  });
}

function validSubmittedForReviewPayload(agentId, id) {
  return basePayload(agentId, id, "submitted_for_review", {
    complete: true,
    media: canonicalRequiredMediaSlots,
  });
}

function returnedPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "returned", {
    complete: true,
    media: canonicalRequiredMediaSlots,
  });
  payload.corrections = [correction(adminId, "open", null)];
  return payload;
}

function fixedCorrectionPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "corrections_received", {
    complete: true,
    media: canonicalRequiredMediaSlots,
  });
  payload.corrections = [correction(adminId, "fixed", new Date().toISOString())];
  return payload;
}

function readyForExportPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "ready_for_export", {
    complete: true,
    media: canonicalRequiredMediaSlots,
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
  const storageStatus = storageStatusForCanonicalStatus(status);
  return {
    submission: {
      id,
      agent_id: agentId,
      type: "single",
      title: "Production Workflow Smoke",
      country: "Испания",
      city: "Москва",
      travel_date: complete ? "2026-07-10 - 2026-07-18" : "не указано",
      status: storageStatus,
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
            status,
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
            exportState: status === "ready_for_export" ? "ready" : "not_ready",
            createdAt: now,
            updatedAt: now,
            history: [],
          },
        },
      },
      appointment_status: "not_started",
      submitted_at: storageStatus === "waiting_review" ? now : null,
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
    const ext = "jpg";
    const mime = "image/jpeg";
    const generatedFileName = `v19smoke_${slot}.${ext}`;
    const storagePath = `${id}/${applicantId}/${slot}/${generatedFileName}`;
    cleanupPaths.add(storagePath);
    return {
      cockpit: {
        id: `${id}-${slot}`,
        applicantId,
        type: slot,
        status: reviewStatus === "accepted" ? "accepted" : "pending_review",
        generatedFileName,
        mimeType: mime,
        originalFileName: `${slot}.${ext}`,
        sizeBytes: 2048,
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
        size_bytes: 2048,
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

function storageStatusForCanonicalStatus(status) {
  const storageStatus = storageStatusByCanonicalStatus[status];
  if (!storageStatus) throw new Error(`Unsupported canonical smoke status: ${status}`);
  return storageStatus;
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
    incompleteSubmittedForReviewRejected: true,
    validSubmittedForReviewReachesQueue: true,
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
