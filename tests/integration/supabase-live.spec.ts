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
import type { AppProfile } from "../../src/services/authService";
import type { Applicant, Submission } from "../../src/types/domain";

const liveEnabled = process.env.VITEST_SUPABASE_LIVE === "1";
const describeLive = liveEnabled ? describe : describe.skip;
const smokeEnv = loadSmokeEnv();
const requiredSmokeEnv = [
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
  for (const fileName of [
    ".env",
    ".env.local",
    ".env.test",
    ".env.test.local",
    ".env.supabase-smoke.local",
  ]) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

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
  return requiredEnv("VITE_SUPABASE_URL");
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

async function saveDraft(
  client: SupabaseClient<Database>,
  submission: Submission,
  actorId: string,
): Promise<void> {
  const payload = toSubmissionDraftPersistencePayload(submission, actorId);
  const { error } = await client.rpc("save_submission_draft", { payload });
  if (error) throw error;
}

describeLive("Supabase live persistence, RLS and Storage smoke", () => {
  beforeAll(() => {
    assertSmokeEnvReady();
  });

  test("enforces owner/admin boundaries and private media storage", async () => {
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

    const adminAccepted = normalizeSubmission({
      ...submission,
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });
    await saveDraft(admin.client, adminAccepted, admin.profile.id);

    const photoSlot = buildMediaSlot(applicant, "photo_white", "uploaded");
    const target = storageTargetForSlot(submission.id, applicant.id ?? "", photoSlot);
    const file = new Blob(["supabase-smoke"], { type: "image/jpeg" });

    const { error: ownerUploadError } = await owner.client.storage
      .from(mediaStorageBucket)
      .upload(target.path, file, {
        contentType: "image/jpeg",
        upsert: true,
      });
    expect(ownerUploadError).toBeNull();

    const { error: otherUploadError } = await otherAgent.client.storage
      .from(mediaStorageBucket)
      .upload(target.path, file, {
        contentType: "image/jpeg",
        upsert: true,
      });
    expect(otherUploadError).toBeTruthy();

    const { data: signedUrlData, error: signedUrlError } = await owner.client.storage
      .from(mediaStorageBucket)
      .createSignedUrl(target.path, 60);
    expect(signedUrlError).toBeNull();
    expect(signedUrlData?.signedUrl).toContain(target.path);

    const { data: otherSignedUrlData, error: otherSignedUrlError } =
      await otherAgent.client.storage
        .from(mediaStorageBucket)
        .createSignedUrl(target.path, 60);
    expect(otherSignedUrlError).toBeTruthy();
    expect(otherSignedUrlData?.signedUrl).toBeFalsy();

    const { error: cleanupError } = await owner.client.storage
      .from(mediaStorageBucket)
      .remove([target.path]);
    expect(cleanupError).toBeNull();
  });
});
