import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import type { Database } from "../../src/lib/supabase/database.types";
import { buildMediaSlot, normalizeSubmission } from "../../src/lib/workflow";
import { toSubmissionDraftPersistencePayload } from "../../src/services/submissionService";
import {
  mediaStorageBucket,
  storageTargetForSlot,
} from "../../src/services/storageService";
import type { AppProfile } from "../../src/types/session";
import type { Applicant, Submission } from "../../src/types/domain";

const liveEnabled = process.env.VITEST_SUPABASE_LIVE === "1";
const describeLive = liveEnabled ? describe : describe.skip;
const describeLegacyArchiveLive =
  liveEnabled && process.env.VITEST_SUPABASE_LEGACY_ARCHIVE === "1"
    ? describe
    : describe.skip;
const smokeEnv = loadSmokeEnv();
const allowedSmokeProjectId = "oevvaowoklqttqkraxho";
const requiredSmokeEnv = [
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_ACTIVATION_TARGET",
  "VITE_SUPABASE_URL",
  "SUPABASE_SMOKE_AGENT_EMAIL",
  "SUPABASE_SMOKE_AGENT_PASSWORD",
  "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
  "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
  "SUPABASE_SMOKE_ADMIN_EMAIL",
  "SUPABASE_SMOKE_ADMIN_PASSWORD",
] as const;

function assertSmokeEnvReady(): void {
  const missing: string[] = requiredSmokeEnv.filter((name) => !envValue(name));
  if (
    !envValue("VITE_SUPABASE_PUBLISHABLE_KEY") &&
    !envValue("VITE_SUPABASE_ANON_KEY")
  ) {
    missing.push("VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY");
  }
  if (!missing.length) return;

  throw new Error(
    `Supabase live smoke requires these env vars: ${missing.join(", ")}.`,
  );
}

function loadSmokeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const filePath = resolve(process.cwd(), ".env.supabase-smoke.local");
  if (!existsSync(filePath)) return env;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return env;
}

function envValue(name: string): string {
  return process.env[name]?.trim() || smokeEnv[name]?.trim() || "";
}

function requiredEnv(name: string): string {
  const value = envValue(name);
  if (!value) {
    throw new Error(`${name} is required for Supabase live smoke.`);
  }
  return value;
}

function supabaseUrl(): string {
  const projectId = requiredEnv("VITE_SUPABASE_PROJECT_ID");
  const activationTarget = requiredEnv("VITE_SUPABASE_ACTIVATION_TARGET");
  const url = requiredEnv("VITE_SUPABASE_URL");

  if (activationTarget !== "sandbox") {
    throw new Error("Supabase live smoke may only run against sandbox activation.");
  }

  if (projectId !== allowedSmokeProjectId) {
    throw new Error(`Supabase live smoke project is not allowed: ${projectId}.`);
  }

  if (!url.startsWith(`https://${projectId}.supabase.co`)) {
    throw new Error("Supabase live smoke URL does not match the allowed project.");
  }

  return url;
}

function supabasePublishableKey(): string {
  return (
    envValue("VITE_SUPABASE_PUBLISHABLE_KEY") || requiredEnv("VITE_SUPABASE_ANON_KEY")
  );
}

function createSmokeClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `visaflow-smoke-${randomUUID()}`,
    },
  });
}

async function signInAs(
  emailEnv: string,
  passwordEnv: string,
): Promise<{
  client: SupabaseClient<Database>;
  profile: AppProfile;
}> {
  const client = createSmokeClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: requiredEnv(emailEnv),
    password: requiredEnv(passwordEnv),
  });

  if (error) throw error;
  if (!data.user?.id) throw new Error(`${emailEnv} did not return a user id.`);

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,email,display_name,organization_name,role")
    .eq("id", data.user.id)
    .single();

  if (profileError) throw profileError;

  return {
    client,
    profile: {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      organizationName: profile.organization_name,
      role: profile.role,
    },
  };
}

function makeSmokeSubmission(agent: AppProfile): {
  submission: Submission;
  applicant: Applicant;
} {
  const id = `SMOKE-${agent.id.slice(0, 8)}`;
  const applicant: Applicant = {
    id: `${id}-1`,
    name: "Supabase Smoke Applicant",
    role: "Заявитель",
    roleConfirmed: true,
    passport: "70 9001001",
    form: 100,
    media: 0,
    mediaRequired: 3,
    birthDate: "1990-01-01",
    citizenship: "РФ",
    address: "Moscow, Smoke 1",
    phone: "+7 900 100 10 01",
    email: "smoke@example.com",
    passportIssuedAt: "2020-01-01",
    passportExpiresAt: "2030-01-01",
    country: "Spain",
    city: "Madrid",
    tripDates: "2026-08-20 - 2026-08-30",
    hotelName: "Smoke Hotel",
    hotelAddress: "Gran Via 1, Madrid",
  };
  const mediaSlots = [
    buildMediaSlot(applicant, "photo_white", "missing"),
    buildMediaSlot(applicant, "selfie", "missing"),
    buildMediaSlot(applicant, "video", "missing"),
  ];

  const submission = normalizeSubmission({
    id,
    title: applicant.name,
    type: "single",
    agentId: agent.id,
    agentName: agent.organizationName ?? agent.displayName,
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: new Date().toISOString(),
    status: "draft",
    appointment: "not_started",
    priority: "Средний",
    fields: 100,
    media: 0,
    mediaRequired: 3,
    applicants: [{ ...applicant, mediaSlots }],
    mediaRows: [],
    notes: [],
  });

  return {
    submission,
    applicant: submission.applicants[0],
  };
}

function makeCanonicalSmokeSubmission(agent: AppProfile): {
  submission: Submission;
  applicant: Applicant;
} {
  const id = `SMOKE-V19-${agent.id.slice(0, 8)}`;
  const applicant: Applicant = {
    id: `${id}-1`,
    name: "Supabase Canonical Smoke Applicant",
    role: "Заявитель",
    roleConfirmed: true,
    passport: "70 9002002",
    form: 100,
    media: 0,
    mediaRequired: 3,
    birthDate: "1990-01-01",
    citizenship: "РФ",
    address: "Moscow, Canonical Smoke 1",
    phone: "+7 900 200 20 02",
    email: "canonical-smoke@example.com",
    passportIssuedAt: "2020-01-01",
    passportExpiresAt: "2030-01-01",
    country: "Spain",
    city: "Madrid",
    tripDates: "2026-08-20 - 2026-08-30",
    hotelName: "Smoke Hotel",
    hotelAddress: "Gran Via 1, Madrid",
  };
  const mediaSlots = [
    buildMediaSlot(applicant, "passport_scan", "missing"),
    buildMediaSlot(applicant, "selfie", "missing"),
    buildMediaSlot(applicant, "selfie_2", "missing"),
  ];

  const submission = normalizeSubmission({
    id,
    title: applicant.name,
    type: "single",
    agentId: agent.id,
    agentName: agent.organizationName ?? agent.displayName,
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: new Date().toISOString(),
    status: "draft",
    appointment: "not_started",
    priority: "Средний",
    fields: 100,
    media: 0,
    mediaRequired: 3,
    applicants: [{ ...applicant, mediaSlots }],
    mediaRows: [],
    notes: [],
  });

  return {
    submission,
    applicant: submission.applicants[0],
  };
}

async function saveDraft(
  client: SupabaseClient<Database>,
  submission: Submission,
  actorId: string,
): Promise<void> {
  const payload = toSubmissionDraftPersistencePayload(submission, actorId);
  const { error } = await client.rpc("save_submission_draft", { payload });
  if (error) throw error;
}

async function trySaveDraft(
  client: SupabaseClient<Database>,
  submission: Submission,
  actorId: string,
) {
  const payload = toSubmissionDraftPersistencePayload(submission, actorId);
  return client.rpc("save_submission_draft", { payload });
}

describeLive("V-19 canonical Supabase live smoke", () => {
  beforeAll(() => {
    assertSmokeEnvReady();
  });

  test("proves canonical media storage and adversarial RLS denial paths", async () => {
    const owner = await signInAs(
      "SUPABASE_SMOKE_AGENT_EMAIL",
      "SUPABASE_SMOKE_AGENT_PASSWORD",
    );
    const otherAgent = await signInAs(
      "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
      "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
    );
    const admin = await signInAs(
      "SUPABASE_SMOKE_ADMIN_EMAIL",
      "SUPABASE_SMOKE_ADMIN_PASSWORD",
    );

    expect(owner.profile.role).toBe("agent");
    expect(otherAgent.profile.role).toBe("agent");
    expect(admin.profile.role).toBe("admin");

    const { submission, applicant } = makeCanonicalSmokeSubmission(owner.profile);
    const uploadedSlots = [
      buildMediaSlot(applicant, "passport_scan", "uploaded"),
      buildMediaSlot(applicant, "selfie", "uploaded"),
      buildMediaSlot(applicant, "selfie_2", "uploaded"),
    ];
    const uploadedTargets = uploadedSlots.map((slot) => ({
      slot,
      target: storageTargetForSlot(submission.id, applicant.id ?? "", slot),
      file: new Blob(["supabase-canonical-smoke-image"], { type: "image/jpeg" }),
    }));
    const selfieTarget =
      uploadedTargets.find(({ slot }) => slot.type === "selfie")?.target ??
      uploadedTargets[0].target;

    await saveDraft(admin.client, submission, admin.profile.id);
    await admin.client.storage
      .from(mediaStorageBucket)
      .remove(uploadedTargets.map(({ target }) => target.path));
    await saveDraft(owner.client, submission, owner.profile.id);

    const { data: ownerRows, error: ownerReadError } = await owner.client
      .from("submissions")
      .select("id,status,agent_id")
      .eq("id", submission.id);
    expect(ownerReadError).toBeNull();
    expect(ownerRows).toHaveLength(1);

    const { data: adminRows, error: adminReadError } = await admin.client
      .from("submissions")
      .select("id,status,agent_id")
      .eq("id", submission.id);
    expect(adminReadError).toBeNull();
    expect(adminRows).toHaveLength(1);

    const { data: otherRows, error: otherReadError } = await otherAgent.client
      .from("submissions")
      .select("id")
      .eq("id", submission.id);
    expect(otherReadError).toBeNull();
    expect(otherRows).toEqual([]);

    const { data: otherMediaRows, error: otherMediaReadError } = await otherAgent.client
      .from("media_assets")
      .select("id")
      .eq("submission_id", submission.id);
    expect(otherMediaReadError).toBeNull();
    expect(otherMediaRows).toEqual([]);

    const crossAgentPayload = toSubmissionDraftPersistencePayload(
      submission,
      otherAgent.profile.id,
    );
    const { error: crossAgentSaveDraftError } = await otherAgent.client.rpc(
      "save_submission_draft",
      { payload: crossAgentPayload },
    );
    expect(crossAgentSaveDraftError).toBeTruthy();

    const { error: agentExportInsertError } = await owner.client
      .from("export_batches")
      .insert({
        format: "xlsx",
        row_count: 1,
        submission_ids: [submission.id],
      });
    expect(agentExportInsertError).toBeTruthy();

    const { error: agentExportRpcError } = await owner.client.rpc(
      "complete_export_package",
      {
        payload: {
          batch: {
            content_fingerprint: `smoke|${submission.id}`,
            file_name: `${submission.id}.xlsx`,
            format: "xlsx",
            idempotency_key: `smoke-${submission.id}-${randomUUID()}`,
            row_count: 1,
            submission_ids: [submission.id],
          },
        },
      },
    );
    expect(agentExportRpcError).toBeTruthy();

    const { error: wrongApplicantStorageError } = await owner.client.storage
      .from(mediaStorageBucket)
      .upload(
        `${submission.id}/${submission.id}-WRONG/selfie/709002002_selfie.jpg`,
        new Blob(["wrong-applicant"], { type: "image/jpeg" }),
        { contentType: "image/jpeg", upsert: false },
      );
    expect(wrongApplicantStorageError).toBeTruthy();

    const { error: wrongMediaSlotError } = await owner.client.storage
      .from(mediaStorageBucket)
      .upload(
        `${submission.id}/${applicant.id}/photo_white/709002002_photo_white.jpg`,
        new Blob(["legacy-photo"], { type: "image/jpeg" }),
        { contentType: "image/jpeg", upsert: false },
      );
    expect(wrongMediaSlotError).toBeTruthy();

    const { error: wrongExtensionError } = await owner.client.storage
      .from(mediaStorageBucket)
      .upload(
        `${submission.id}/${applicant.id}/selfie/709002002_selfie.mp4`,
        new Blob(["wrong-extension"], { type: "video/mp4" }),
        { contentType: "video/mp4", upsert: false },
      );
    expect(wrongExtensionError).toBeTruthy();

    const { error: pathTraversalError } = await owner.client.storage
      .from(mediaStorageBucket)
      .upload(
        `${submission.id}/${applicant.id}/selfie/../709002002_selfie.jpg`,
        new Blob(["path-traversal"], { type: "image/jpeg" }),
        { contentType: "image/jpeg", upsert: false },
      );
    expect(pathTraversalError).toBeTruthy();

    for (const { target, file } of uploadedTargets) {
      const { error: ownerUploadError } = await owner.client.storage
        .from(mediaStorageBucket)
        .upload(target.path, file, {
          contentType: file.type,
          upsert: false,
        });
      expect(ownerUploadError).toBeNull();
    }

    const { data: signedUrlData, error: signedUrlError } = await owner.client.storage
      .from(mediaStorageBucket)
      .createSignedUrl(selfieTarget.path, 60);
    expect(signedUrlError).toBeNull();
    expect(signedUrlData?.signedUrl).toContain(selfieTarget.path);

    const { data: otherSignedUrlData, error: otherSignedUrlError } =
      await otherAgent.client.storage
        .from(mediaStorageBucket)
        .createSignedUrl(selfieTarget.path, 60);
    expect(otherSignedUrlError).toBeTruthy();
    expect(otherSignedUrlData?.signedUrl).toBeFalsy();

    const { error: cleanupError } = await admin.client.storage
      .from(mediaStorageBucket)
      .remove(uploadedTargets.map(({ target }) => target.path));
    expect(cleanupError).toBeNull();
  }, 30_000);
});

describeLegacyArchiveLive(
  "Legacy Supabase live archive smoke (not V-19 release proof)",
  () => {
    beforeAll(() => {
      assertSmokeEnvReady();
    });

    test("keeps old workflow/RPC compatibility behind sandbox-only smoke", async () => {
      const owner = await signInAs(
        "SUPABASE_SMOKE_AGENT_EMAIL",
        "SUPABASE_SMOKE_AGENT_PASSWORD",
      );
      const otherAgent = await signInAs(
        "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
        "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
      );
      const admin = await signInAs(
        "SUPABASE_SMOKE_ADMIN_EMAIL",
        "SUPABASE_SMOKE_ADMIN_PASSWORD",
      );

      expect(owner.profile.role).toBe("agent");
      expect(otherAgent.profile.role).toBe("agent");
      expect(admin.profile.role).toBe("admin");

      const { submission, applicant } = makeSmokeSubmission(owner.profile);
      const blockedId = `${submission.id}-BLOCKED`;
      const blockedSubmission = normalizeSubmission({
        ...submission,
        id: blockedId,
        applicants: [
          {
            ...applicant,
            id: `${blockedId}-1`,
            address: "",
            mediaSlots: [
              buildMediaSlot(
                {
                  ...applicant,
                  id: `${blockedId}-1`,
                  address: "",
                },
                "photo_white",
                "missing",
              ),
            ],
          },
        ],
      });
      await saveDraft(owner.client, blockedSubmission, owner.profile.id);
      const { error: blockedReviewError } = await trySaveDraft(
        owner.client,
        normalizeSubmission({
          ...blockedSubmission,
          status: "waiting_review",
          submittedAt: new Date().toISOString(),
        }),
        owner.profile.id,
      );
      expect(blockedReviewError).toBeTruthy();
      expect(blockedReviewError?.message).toContain("required fields");

      // The smoke uses one deterministic submission id. Admin reset keeps repeated
      // runs stable without adding runtime delete permissions to the app role.
      await saveDraft(admin.client, submission, admin.profile.id);
      await saveDraft(owner.client, submission, owner.profile.id);

      const { data: ownerRows, error: ownerReadError } = await owner.client
        .from("submissions")
        .select("id,status,agent_id")
        .eq("id", submission.id);
      expect(ownerReadError).toBeNull();
      expect(ownerRows).toHaveLength(1);

      const { data: otherRows, error: otherReadError } = await otherAgent.client
        .from("submissions")
        .select("id")
        .eq("id", submission.id);
      expect(otherReadError).toBeNull();
      expect(otherRows).toEqual([]);

      const crossAgentPayload = toSubmissionDraftPersistencePayload(
        submission,
        otherAgent.profile.id,
      );
      const { error: crossAgentWriteError } = await otherAgent.client.rpc(
        "save_submission_draft",
        { payload: crossAgentPayload },
      );
      expect(crossAgentWriteError).toBeTruthy();

      const agentAcceptedPayload = toSubmissionDraftPersistencePayload(
        {
          ...submission,
          status: "accepted",
        },
        owner.profile.id,
      );
      const { error: agentAcceptedError } = await owner.client.rpc(
        "save_submission_draft",
        { payload: agentAcceptedPayload },
      );
      expect(agentAcceptedError).toBeTruthy();

      const uploadedSlots = [
        buildMediaSlot(applicant, "photo_white", "uploaded"),
        buildMediaSlot(applicant, "selfie", "uploaded"),
        buildMediaSlot(applicant, "video", "uploaded"),
      ];
      const uploadedTargets = uploadedSlots.map((slot) => ({
        slot,
        target: storageTargetForSlot(submission.id, applicant.id ?? "", slot),
        file:
          slot.type === "video"
            ? new Blob(["supabase-smoke-video"], { type: "video/mp4" })
            : new Blob(["supabase-smoke-image"], { type: "image/jpeg" }),
      }));
      const photoTarget = uploadedTargets[0].target;
      const photoFile = uploadedTargets[0].file;

      for (const { target, file } of uploadedTargets) {
        const { error: ownerUploadError } = await owner.client.storage
          .from(mediaStorageBucket)
          .upload(target.path, file, {
            contentType: file.type,
            upsert: false,
          });
        expect(ownerUploadError).toBeNull();
      }

      const { error: otherUploadError } = await otherAgent.client.storage
        .from(mediaStorageBucket)
        .upload(photoTarget.path, photoFile, {
          contentType: "image/jpeg",
          upsert: true,
        });
      expect(otherUploadError).toBeTruthy();

      const { data: signedUrlData, error: signedUrlError } = await owner.client.storage
        .from(mediaStorageBucket)
        .createSignedUrl(photoTarget.path, 60);
      expect(signedUrlError).toBeNull();
      expect(signedUrlData?.signedUrl).toContain(photoTarget.path);

      const readySubmission = normalizeSubmission({
        ...submission,
        status: "ready_for_review",
        media: 100,
        updated: new Date().toISOString(),
        applicants: [
          {
            ...applicant,
            media: 100,
            mediaSlots: uploadedSlots,
          },
        ],
      });
      await saveDraft(owner.client, readySubmission, owner.profile.id);

      const waitingSubmission = normalizeSubmission({
        ...readySubmission,
        status: "waiting_review",
        submittedAt: new Date().toISOString(),
        updated: new Date().toISOString(),
      });
      await saveDraft(owner.client, waitingSubmission, owner.profile.id);

      const adminAccepted = normalizeSubmission({
        ...waitingSubmission,
        status: "accepted",
        acceptedAt: new Date().toISOString(),
        updated: new Date().toISOString(),
      });
      await saveDraft(admin.client, adminAccepted, admin.profile.id);

      const { data: ownerApplicantUpdateRows, error: ownerApplicantUpdateError } =
        await owner.client
          .from("applicants")
          .update({ full_name: "Tampered After Handoff" })
          .eq("id", applicant.id ?? "")
          .select("id");
      expect(ownerApplicantUpdateError).toBeNull();
      expect(ownerApplicantUpdateRows).toEqual([]);

      const { data: ownerMediaUpdateRows, error: ownerMediaUpdateError } =
        await owner.client
          .from("media_assets")
          .update({ upload_status: "uploaded" })
          .eq("applicant_id", applicant.id ?? "")
          .eq("type", "photo_white")
          .select("id");
      expect(ownerMediaUpdateError).toBeNull();
      expect(ownerMediaUpdateRows).toEqual([]);

      const { error: ownerOverwriteAfterHandoffError } = await owner.client.storage
        .from(mediaStorageBucket)
        .upload(photoTarget.path, photoFile, {
          contentType: "image/jpeg",
          upsert: true,
        });
      expect(ownerOverwriteAfterHandoffError).toBeTruthy();

      const { data: otherSignedUrlData, error: otherSignedUrlError } =
        await otherAgent.client.storage
          .from(mediaStorageBucket)
          .createSignedUrl(photoTarget.path, 60);
      expect(otherSignedUrlError).toBeTruthy();
      expect(otherSignedUrlData?.signedUrl).toBeFalsy();

      const { data: applicantAfterTamper, error: applicantAfterTamperError } =
        await admin.client
          .from("applicants")
          .select("full_name")
          .eq("id", applicant.id ?? "")
          .single();
      expect(applicantAfterTamperError).toBeNull();
      expect(applicantAfterTamper?.full_name).toBe("Supabase Smoke Applicant");

      const { error: cleanupError } = await admin.client.storage
        .from(mediaStorageBucket)
        .remove(uploadedTargets.map(({ target }) => target.path));
      expect(cleanupError).toBeNull();
    }, 30_000);
  },
);
