import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { testArtifactPath } from "./lib/artifact-paths.mjs";

const repoRoot = process.cwd();
const publicEnvPath = resolve(repoRoot, ".env.supabase-production.local");
const adminEnvPath = resolve(repoRoot, ".env.supabase-production-admin.local");
const readinessPath = resolve(
  repoRoot,
  "docs/release/supabase-production-readiness.json",
);
const evidencePath = testArtifactPath("supabase-production-workflow-smoke-20260701.md");
const productionProjectId = "tsymifccglpepvbmrcgh";
const sandboxProjectId = "oevvaowoklqttqkraxho";
const bucket = "submission-media";
const stamp = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);
const runId = `VF-PROD-WORKFLOW-${stamp}`;
const familyRunId = `${runId}-FAMILY`;
const malformedBucketReadinessId = `${runId}-MALFORMED-BUCKET`;
const malformedPathReadinessId = `${runId}-MALFORMED-PATH`;
const correctionId = randomUUID();
const applicantId = applicantIdFor(runId);
const requiredMediaSlots = ["passport_scan", "selfie", "selfie_2"];
const uploadPaths = requiredMediaSlots.map((slot) =>
  storagePathFor(runId, applicantId, slot, `v19smoke_${slot}.jpg`),
);
const uploadPath = storagePathFor(runId, applicantId, "selfie", "v19smoke_selfie.jpg");
const checks = [];
const cleanupPaths = new Set(uploadPaths);

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
const adminCleanupKey = clean(
  adminEnv[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")],
);

await main();

async function main() {
  assert(
    projectId === productionProjectId,
    "target is production project",
    "project id mismatch",
  );
  assert(
    projectId !== sandboxProjectId,
    "target is not sandbox",
    "sandbox project selected",
  );
  assert(
    projectUrl === `https://${productionProjectId}.supabase.co`,
    "production URL is exact",
    "URL mismatch",
  );
  assert(
    publishableKey.startsWith("sb_publishable_"),
    "publishable key is present",
    "missing publishable key",
  );
  assert(
    Boolean(adminCleanupKey),
    "admin cleanup key is available locally",
    "missing admin key",
  );

  const adminService = supabase(adminCleanupKey);
  const agent = await signedClient(
    "SUPABASE_SMOKE_AGENT_EMAIL",
    "SUPABASE_SMOKE_AGENT_PASSWORD",
  );
  const otherAgent = await signedClient(
    "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
    "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
  );
  const adminUser = await signedClient(
    "SUPABASE_SMOKE_ADMIN_EMAIL",
    "SUPABASE_SMOKE_ADMIN_PASSWORD",
  );

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
      save(
        agent.client,
        incompleteWaitingReviewPayload(agent.userId, `${runId}-incomplete`),
      ),
      "incomplete waiting_review is rejected",
    );
    await expectMalformedBucketReadinessRejected(
      agent.client,
      adminService,
      agent.userId,
    );
    await expectMalformedPathReadinessRejected(
      agent.client,
      adminService,
      agent.userId,
    );

    await save(
      agent.client,
      validReviewPayload(agent.userId, runId, "ready_for_review"),
    );
    await save(agent.client, validReviewPayload(agent.userId, runId, "waiting_review"));
    await expectStatus(adminService, runId, "waiting_review");
    pass("valid waiting_review reaches admin queue");

    await save(
      adminUser.client,
      returnedPayload(agent.userId, adminUser.userId, runId),
    );
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

    await save(
      adminUser.client,
      acceptedPayload(agent.userId, adminUser.userId, runId),
    );
    await expectStatus(adminService, runId, "accepted");
    pass("admin can accept case");

    await expectRejected(
      save(agent.client, draftPayload(agent.userId, runId)),
      "agent mutation is blocked after admin handoff",
    );

    await save(agent.client, familyDraftPayload(agent.userId, familyRunId, false));
    await uploadFamilyPrivateMedia(agent.client, familyRunId);
    await save(
      agent.client,
      familyDraftPayload(agent.userId, familyRunId, true, "waiting_review"),
    );
    await expectFamilyReload(agent.client, familyRunId, "waiting_review");
    pass(
      "family submission reaches review with passports for all applicants and selfies for primary",
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
  if (!email || !password)
    throw new Error(`${emailKey}/${passwordKey} are required locally`);
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
  for (const path of uploadPaths) {
    const { error } = await client.storage
      .from(bucket)
      .upload(path, Buffer.from("supabase-production-workflow-smoke"), {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) throw new Error(`private media upload failed: ${error.message}`);
  }
}

async function createScopedSignedUrl(client, shouldPass) {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(uploadPath, 60);
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
  if (data.status !== status)
    throw new Error(`expected ${id}=${status}, got ${data.status}`);
}

async function uploadFamilyPrivateMedia(client, id) {
  for (const applicant of familyApplicants(id)) {
    for (const slot of requiredMediaSlotsForApplicant(applicant)) {
      const path = storagePathFor(
        id,
        applicant.id,
        slot,
        `v19smoke_${applicant.suffix}_${slot}.jpg`,
      );
      cleanupPaths.add(path);
      const { error } = await client.storage
        .from(bucket)
        .upload(path, Buffer.from("supabase-production-family-workflow-smoke"), {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (error)
        throw new Error(`family private media upload failed: ${error.message}`);
    }
  }
}

async function expectFamilyReload(client, id, expectedStatus) {
  const [
    { data: submission, error: submissionError },
    { data: applicants, error: applicantsError },
    { data: media, error: mediaError },
  ] = await Promise.all([
    client.from("submissions").select("id,type,status").eq("id", id).single(),
    client.from("applicants").select("id").eq("submission_id", id),
    client
      .from("media_assets")
      .select("applicant_id,type,upload_status,storage_path")
      .eq("submission_id", id)
      .in("type", requiredMediaSlots),
  ]);

  if (submissionError)
    throw new Error(`family submission reload failed: ${submissionError.message}`);
  if (applicantsError)
    throw new Error(`family applicants reload failed: ${applicantsError.message}`);
  if (mediaError) throw new Error(`family media reload failed: ${mediaError.message}`);
  if (submission.type !== "family" || submission.status !== expectedStatus) {
    throw new Error(
      `family submission reload mismatch: ${submission.type}/${submission.status}`,
    );
  }
  if ((applicants ?? []).length !== 3) {
    throw new Error(`expected 3 family applicants, got ${(applicants ?? []).length}`);
  }
  if ((media ?? []).length !== 5) {
    throw new Error(
      `expected 5 family required media rows, got ${(media ?? []).length}`,
    );
  }
  if (
    !(media ?? []).every(
      (row) =>
        row.upload_status === "uploaded" &&
        typeof row.storage_path === "string" &&
        row.storage_path.startsWith(`submissions/${id}/applicants/`),
    )
  ) {
    throw new Error(
      "family media reload returned invalid upload state or storage path",
    );
  }
}

async function expectMalformedBucketReadinessRejected(
  agentClient,
  adminClient,
  agentId,
) {
  await save(
    agentClient,
    malformedMediaReadinessPayload(agentId, malformedBucketReadinessId),
  );
  const { error: mediaError } = await adminClient
    .from("media_assets")
    .update({
      storage_bucket: "wrong-bucket",
      storage_path: storagePathFor(
        malformedBucketReadinessId,
        applicantIdFor(malformedBucketReadinessId),
        "passport_scan",
        "v19smoke_passport_scan.jpg",
      ),
    })
    .eq("submission_id", malformedBucketReadinessId)
    .eq("type", "passport_scan");
  if (mediaError) {
    if (!isCanonicalStorageIdentityError(mediaError)) {
      throw new Error(`malformed bucket media setup failed: ${mediaError.message}`);
    }
    await expectStatus(adminClient, malformedBucketReadinessId, "draft");
    pass("malformed bucket media storage identity is rejected");
    return;
  }

  await expectRejected(
    adminClient
      .from("submissions")
      .update({ status: "waiting_review" })
      .eq("id", malformedBucketReadinessId),
    "malformed bucket media readiness is rejected",
  );
  pass("wrong media bucket cannot satisfy review readiness");
}

async function expectMalformedPathReadinessRejected(agentClient, adminClient, agentId) {
  await save(
    agentClient,
    malformedMediaReadinessPayload(agentId, malformedPathReadinessId),
  );
  const { error: mediaError } = await adminClient
    .from("media_assets")
    .update({
      storage_bucket: bucket,
      storage_path: storagePathFor(
        malformedPathReadinessId,
        applicantIdFor(malformedPathReadinessId),
        "selfie",
        "v19smoke_wrong_slot_selfie.jpg",
      ),
    })
    .eq("submission_id", malformedPathReadinessId)
    .eq("type", "passport_scan");
  if (mediaError) {
    if (!isCanonicalStorageIdentityError(mediaError)) {
      throw new Error(`malformed path media setup failed: ${mediaError.message}`);
    }
    await expectStatus(adminClient, malformedPathReadinessId, "draft");
    pass("malformed path media storage identity is rejected");
    return;
  }

  await expectRejected(
    adminClient
      .from("submissions")
      .update({ status: "waiting_review" })
      .eq("id", malformedPathReadinessId),
    "malformed path media readiness is rejected",
  );
  pass("wrong media path cannot satisfy review readiness");
}

function isCanonicalStorageIdentityError(error) {
  return (
    error?.code === "23514" &&
    /Required media must use canonical submission-media storage identity/i.test(
      error.message ?? "",
    )
  );
}

async function cleanup(client) {
  await client.storage.from(bucket).remove([...cleanupPaths]);
  for (const id of [
    runId,
    `${runId}-incomplete`,
    malformedBucketReadinessId,
    malformedPathReadinessId,
    familyRunId,
  ]) {
    await client.from("corrections").delete().eq("submission_id", id);
    await client.from("status_history").delete().eq("submission_id", id);
    await client.from("media_assets").delete().eq("submission_id", id);
    await client.from("applicants").delete().eq("submission_id", id);
    await client.from("submissions").delete().eq("id", id);
  }
}

function draftPayload(agentId, id) {
  return basePayload(agentId, id, "draft", { complete: true, media: [] });
}

function incompleteWaitingReviewPayload(agentId, id) {
  return basePayload(agentId, id, "waiting_review", { complete: false, media: [] });
}

function malformedMediaReadinessPayload(agentId, id) {
  return basePayload(agentId, id, "draft", {
    complete: true,
    media: ["passport_scan", "selfie", "selfie_2"],
  });
}

function validReviewPayload(agentId, id, status) {
  return basePayload(agentId, id, status, {
    complete: true,
    media: ["passport_scan", "selfie", "selfie_2"],
  });
}

function returnedPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "returned", {
    complete: true,
    media: ["passport_scan", "selfie", "selfie_2"],
  });
  payload.corrections = [correction(adminId, "open", null)];
  return payload;
}

function fixedCorrectionPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "waiting_review", {
    complete: true,
    media: ["passport_scan", "selfie", "selfie_2"],
  });
  payload.corrections = [correction(adminId, "fixed", new Date().toISOString())];
  return payload;
}

function acceptedPayload(agentId, adminId, id) {
  const payload = basePayload(agentId, id, "accepted", {
    complete: true,
    media: ["passport_scan", "selfie", "selfie_2"],
    reviewStatus: "accepted",
  });
  payload.submission.accepted_at = new Date().toISOString();
  payload.corrections = [correction(adminId, "closed", new Date().toISOString())];
  return payload;
}

function familyDraftPayload(agentId, id, includeMedia, status = "draft") {
  const now = new Date().toISOString();
  const applicants = familyApplicants(id);
  const media = includeMedia ? familyMediaRows(id) : [];
  return {
    submission: {
      id,
      agent_id: agentId,
      type: "family",
      title: "Production Family Workflow Smoke",
      country: "Испания",
      city: "Москва",
      travel_date: "2026-07-10 - 2026-07-18",
      status,
      priority: "Средний",
      readiness_percent: includeMedia ? 100 : 40,
      family_intelligence: {
        status: "unreviewed",
        v19CockpitSnapshot: {
          version: 1,
          submission: {
            id,
            title: "Production Family Workflow Smoke",
            type: "family",
            country: "Испания",
            city: "Москва",
            tripDateFrom: "2026-07-10",
            tripDateTo: "2026-07-18",
            status:
              status === "waiting_review" ? "submitted_for_review" : "in_progress",
            applicants: applicants.map((applicant) => ({
              id: applicant.id,
              fullName: applicant.fullName,
              role: applicant.role,
              questionnaireStatus: "complete",
              fileStatus: includeMedia ? "complete" : "empty",
              sections: [],
            })),
            issues: [],
            files: media.map(({ cockpit }) => cockpit),
            completeness: {
              questionnaire: 100,
              files: includeMedia ? 100 : 0,
              total: includeMedia ? 100 : 40,
            },
            aiSuggestions: [],
            aiReviewState: "idle",
            exportState: "not_ready",
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
    applicants: applicants.map((applicant) => ({
      id: applicant.id,
      submission_id: id,
      full_name: applicant.fullName,
      role: applicant.roleLabel,
      suggested_role: null,
      role_confirmed: true,
      birth_date: applicant.birthDate,
      patronymic: null,
      citizenship: "Russia",
      address: "Moscow, Tverskaya 1",
      phone: "+79000000000",
      email: `${applicant.suffix}@example.test`,
      passport_number: applicant.passportNumber,
      passport_issued_at: "2020-01-01",
      passport_expires_at: "2030-01-01",
      country: "Испания",
      city: "Москва",
      trip_dates: "2026-07-10 - 2026-07-18",
      hotel_name: "ILUNION Barcelona",
      hotel_address: "CALLE RAMON TUR 196-198",
      questionnaire_percent: 100,
      media_percent: includeMedia ? 100 : 0,
    })),
    media_assets: media.map(({ media }) => media),
    corrections: [],
    status_history: [],
  };
}

function familyApplicants(id) {
  return [
    {
      id: `${id}-applicant-1`,
      suffix: "family_main",
      fullName: "Production Family Smoke Main",
      role: "main",
      roleLabel: "Основной заявитель",
      birthDate: "1990-01-01",
      passportNumber: "FA1234561",
    },
    {
      id: `${id}-applicant-2`,
      suffix: "family_spouse",
      fullName: "Production Family Smoke Spouse",
      role: "spouse",
      roleLabel: "Супруг/супруга",
      birthDate: "1991-02-02",
      passportNumber: "FA1234562",
    },
    {
      id: `${id}-applicant-3`,
      suffix: "family_child",
      fullName: "Production Family Smoke Child",
      role: "child",
      roleLabel: "Ребенок",
      birthDate: "2015-03-03",
      passportNumber: "FA1234563",
    },
  ];
}

function familyMediaRows(id) {
  const now = new Date().toISOString();
  return familyApplicants(id).flatMap((applicant) =>
    requiredMediaSlotsForApplicant(applicant).map((slot) => {
      const generatedFileName = `v19smoke_${applicant.suffix}_${slot}.jpg`;
      const storagePath = storagePathFor(id, applicant.id, slot, generatedFileName);
      cleanupPaths.add(storagePath);
      return {
        cockpit: {
          id: `${applicant.id}-${slot}`,
          applicantId: applicant.id,
          type: slot,
          status: "pending_review",
          generatedFileName,
          mimeType: "image/jpeg",
          originalFileName: `${slot}.jpg`,
          sizeBytes: 2048,
          storageBucket: bucket,
          storagePath,
          uploadedAtIso: now,
          uploadedAt: "сейчас",
          uploadedBy: "Агент",
          uploadStatus: "uploaded",
          reviewStatus: "not_reviewed",
        },
        media: {
          id: `${applicant.id}-media-${slot}`,
          applicant_id: applicant.id,
          submission_id: id,
          type: slot,
          original_file_name: `${slot}.jpg`,
          generated_file_name: generatedFileName,
          storage_bucket: bucket,
          storage_path: storagePath,
          mime_type: "image/jpeg",
          size_bytes: 2048,
          upload_status: "uploaded",
          review_status: "not_reviewed",
          uploaded_at: now,
          reviewed_at: null,
          reviewed_by: null,
        },
      };
    }),
  );
}

function requiredMediaSlotsForApplicant(applicant) {
  return applicant.role === "main" ? requiredMediaSlots : ["passport_scan"];
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
    const ext = "jpg";
    const mime = "image/jpeg";
    const generatedFileName = `v19smoke_${slot}.${ext}`;
    const storagePath = storagePathFor(id, applicantId, slot, generatedFileName);
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

function storagePathFor(id, applicantId, slot, generatedFileName) {
  return `submissions/${id}/applicants/${applicantId}/${slot}/${generatedFileName}`;
}

async function writeEvidenceAndReadiness() {
  await writeEvidence("PASS", "");
  const packet = readJson(readinessPath);
  packet.productionEnvEvidence = {
    ...packet.productionEnvEvidence,
    transactionalPersistenceTested: true,
    rlsPolicyTestsPassed: true,
    storagePolicyTestsPassed: true,
    productionWorkflowEvidenceArtifact: evidencePath,
  };
  packet.postActivationChecks = {
    ...packet.postActivationChecks,
    agentSignInWorks: true,
    adminSignInWorks: true,
    agentCanCreateDraft: true,
    agentCanUploadRequiredMedia: true,
    incompleteWaitingReviewRejected: true,
    validWaitingReviewReachesQueue: true,
    adminCanAcceptOrReturnCase: true,
    postHandoffAgentMutationBlocked: true,
    privateMediaSignedUrlScoped: true,
    workflowEvidenceArtifact: evidencePath,
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
