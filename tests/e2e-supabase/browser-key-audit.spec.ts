import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const smokeEnvPath = resolve(process.cwd(), ".env.supabase-smoke.local");
const productionEnvPath = resolve(process.cwd(), ".env.supabase-production.local");
const allowedSmokeProjectId = "oevvaowoklqttqkraxho";
const allowedProductionProjectId = "tsymifccglpepvbmrcgh";
const browserAuditTarget =
  process.env.SUPABASE_BROWSER_AUDIT_ENV === "production" ? "production" : "sandbox";
const browserAuditEnvPath =
  browserAuditTarget === "production" ? productionEnvPath : smokeEnvPath;
const uploadSmokeApplicantId = "app-browser-upload-smoke-1";
const uploadSmokeApplicantName = "Upload Smoke Browser Fixture";
const uploadSmokeFileIds = {
  passport: "file-browser-upload-smoke-passport",
  selfie: "file-browser-upload-smoke-selfie",
  selfie2: "file-browser-upload-smoke-selfie-2",
} as const;
const uploadSmokeSubmissionId = "VF-BROWSER-UPLOAD-SMOKE";
const syncSmokeApplicantId = "app-browser-sync-smoke-1";
const syncSmokeApplicantName = "Admin Agent Sync Fixture";
const syncSmokeFileIds = {
  passport: "file-browser-sync-smoke-passport",
  selfie: "file-browser-sync-smoke-selfie",
  selfie2: "file-browser-sync-smoke-selfie-2",
} as const;
const syncSmokeSubmissionId = "VF-BROWSER-SYNC-SMOKE";
type SmokeMediaRow = {
  applicant_id: string;
  generated_file_name: string | null;
  id: string;
  mime_type: string | null;
  original_file_name: string | null;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_path: string;
  submission_id: string;
  type: string;
  upload_status: string;
  uploaded_at: string | null;
};
const forbiddenBundleMarkers = [
  "SUPABASE_SMOKE_AGENT_EMAIL",
  "SUPABASE_SMOKE_AGENT_PASSWORD",
  "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
  "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
  "SUPABASE_SMOKE_ADMIN_EMAIL",
  "SUPABASE_SMOKE_ADMIN_PASSWORD",
  "SUPABASE_SERVICE_ROLE",
  "SERVICE_ROLE",
  "SUPABASE_FUNCTION_ADMIN_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MODEL_PROVIDER_API_KEY",
];

function loadSmokeEnv(): Record<string, string> {
  if (!existsSync(browserAuditEnvPath)) return {};

  const env: Record<string, string> = {};
  for (const line of readFileSync(browserAuditEnvPath, "utf8").split(/\r?\n/)) {
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

function requiredSmokeValue(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Supabase browser key audit.`);
  return value;
}

function expectBundleDoesNotContainSecretValue(
  browserBundle: string,
  name: string,
  value: string,
): void {
  if (!value.trim()) return;
  if (browserBundle.includes(value)) {
    throw new Error(`${name} leaked into browser bundle.`);
  }
}

function drawer(page: Page) {
  return page.getByRole("dialog");
}

function smokeClient(env = loadSmokeEnv()): SupabaseClient {
  return createClient(
    requiredSmokeValue(env, "VITE_SUPABASE_URL"),
    requiredSmokeValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

async function signedSmokeAgentClient() {
  return signedSmokeClient("SUPABASE_SMOKE_AGENT_EMAIL", "SUPABASE_SMOKE_AGENT_PASSWORD");
}

async function signedSmokeOtherAgentClient() {
  return signedSmokeClient(
    "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
    "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
  );
}

async function signedSmokeAdminClient() {
  return signedSmokeClient("SUPABASE_SMOKE_ADMIN_EMAIL", "SUPABASE_SMOKE_ADMIN_PASSWORD");
}

async function signedSmokeClient(emailKey: string, passwordKey: string) {
  const smokeEnv = loadSmokeEnv();
  const client = smokeClient(smokeEnv);
  const { data, error } = await client.auth.signInWithPassword({
    email: requiredSmokeValue(smokeEnv, emailKey),
    password: requiredSmokeValue(smokeEnv, passwordKey),
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? `${emailKey} sign-in failed.`);
  }

  return { client, userId: data.user.id };
}

function uploadSmokeDraftPayload(
  agentId: string,
  nowIso: string,
  mediaRows: SmokeMediaRow[] = uploadSmokeMissingMediaRows(),
) {
  const uploadedMediaByType = new Map(
    mediaRows
      .filter((row) => row.upload_status === "uploaded")
      .map((row) => [row.type, row]),
  );
  const hasUploadedMedia = uploadedMediaByType.size >= 3;
  const submission = {
    id: uploadSmokeSubmissionId,
    title: uploadSmokeApplicantName,
    type: "single",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "не указано",
    tripDateTo: "не указано",
    status: "draft",
    applicants: [
      {
        id: uploadSmokeApplicantId,
        fullName: uploadSmokeApplicantName,
        role: "main",
        questionnaireStatus: "empty",
        fileStatus: hasUploadedMedia ? "complete" : "empty",
        sections: [],
      },
    ],
    issues: [],
    files: [
      {
        id: uploadSmokeFileIds.passport,
        applicantId: uploadSmokeApplicantId,
        type: "passport_scan",
        status: uploadedMediaByType.has("passport_scan") ? "pending_review" : "missing",
      },
      {
        id: uploadSmokeFileIds.selfie,
        applicantId: uploadSmokeApplicantId,
        type: "selfie",
        status: uploadedMediaByType.has("selfie") ? "pending_review" : "missing",
      },
      {
        id: uploadSmokeFileIds.selfie2,
        applicantId: uploadSmokeApplicantId,
        type: "selfie_2",
        status: uploadedMediaByType.has("selfie_2") ? "pending_review" : "missing",
      },
    ],
    completeness: {
      questionnaire: 0,
      files: hasUploadedMedia ? 100 : 0,
      total: hasUploadedMedia ? 35 : 0,
    },
    aiSuggestions: [],
    aiReviewState: "idle",
    exportState: "not_ready",
    createdAt: nowIso,
    updatedAt: nowIso,
    history: [
      {
        id: "history-browser-upload-smoke-reset",
        text: "Smoke draft reset",
        at: nowIso,
        source: "system",
      },
    ],
  };

  return {
    submission: {
      id: uploadSmokeSubmissionId,
      agent_id: agentId,
      type: "single",
      title: uploadSmokeApplicantName,
      country: "Испания",
      city: "Москва",
      travel_date: "не указано",
      status: "draft",
      priority: "Средний",
      readiness_percent: hasUploadedMedia ? 35 : 0,
      family_intelligence: {
        status: "unreviewed",
        v19CockpitSnapshot: {
          version: 1,
          submission,
        },
      },
      appointment_status: "not_started",
      submitted_at: null,
      review_started_at: null,
      accepted_at: null,
      exported_at: null,
      updated_at: nowIso,
    },
    applicants: [
      {
        id: uploadSmokeApplicantId,
        submission_id: uploadSmokeSubmissionId,
        full_name: uploadSmokeApplicantName,
        role: "Основной заявитель",
        suggested_role: null,
        role_confirmed: true,
        birth_date: null,
        patronymic: null,
        citizenship: null,
        address: null,
        phone: null,
        email: null,
        passport_number: "",
        passport_issued_at: null,
        passport_expires_at: null,
        country: "Испания",
        city: "Москва",
        trip_dates: "не указано",
        hotel_name: null,
        hotel_address: null,
        questionnaire_percent: 0,
        media_percent: hasUploadedMedia ? 100 : 0,
      },
    ],
    media_assets: mediaRows,
    corrections: [],
    status_history: [],
  };
}

function uploadSmokeMissingMediaRows(): SmokeMediaRow[] {
  return [
    { id: "media-browser-upload-passport", type: "passport_scan" },
    { id: "media-browser-upload-selfie", type: "selfie" },
    { id: "media-browser-upload-selfie-2", type: "selfie_2" },
    { id: "media-browser-upload-legacy-photo", type: "photo_white" },
    { id: "media-browser-upload-legacy-video", type: "video" },
  ].map(({ id, type }) => ({
    id,
    applicant_id: uploadSmokeApplicantId,
    submission_id: uploadSmokeSubmissionId,
    type,
    original_file_name: null,
    generated_file_name: null,
    storage_bucket: "submission-media",
    storage_path: `${uploadSmokeSubmissionId}/${uploadSmokeApplicantId}/${type}/pending-${type}.placeholder`,
    mime_type: null,
    size_bytes: null,
    upload_status: "none",
    review_status: "not_reviewed",
    uploaded_at: null,
    reviewed_at: null,
    reviewed_by: null,
  }));
}

async function removeUploadSmokeStorage(client: SupabaseClient) {
  const { data, error } = await client
    .from("media_assets")
    .select("storage_path")
    .eq("submission_id", uploadSmokeSubmissionId);

  if (error) throw new Error(error.message);

  const paths = Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.storage_path)
        .filter((path): path is string => typeof path === "string" && path.length > 0),
    ),
  );
  if (!paths.length) return;

  const { error: removeError } = await client.storage
    .from("submission-media")
    .remove(paths);
  if (removeError) throw new Error(removeError.message);
}

async function resetUploadSmokeSubmission() {
  const { client, userId } = await signedSmokeAgentClient();
  await removeUploadSmokeStorage(client);
  const { error: mediaDeleteError } = await client
    .from("media_assets")
    .delete()
    .eq("submission_id", uploadSmokeSubmissionId);
  if (mediaDeleteError) throw new Error(mediaDeleteError.message);
  const { error } = await client.rpc("save_submission_draft", {
    payload: uploadSmokeDraftPayload(userId, new Date().toISOString()),
  });
  if (error) throw new Error(error.message);
  return { client, userId };
}

async function resetUploadSmokeSubmissionWithTimeout() {
  await Promise.race([
    resetUploadSmokeSubmission(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Upload smoke cleanup timed out.")), 20_000),
    ),
  ]);
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeoutMs),
    ),
  ]);
}

function syncSmokeFilePayload(
  type: keyof typeof syncSmokeFileIds,
  slotType: "passport_scan" | "selfie" | "selfie_2",
  nowIso: string,
) {
  const generatedFileName = `v19sync_${slotType}.jpg`;
  const storagePath = `${syncSmokeSubmissionId}/${syncSmokeApplicantId}/${slotType}/${generatedFileName}`;

  return {
    cockpit: {
      id: syncSmokeFileIds[type],
      applicantId: syncSmokeApplicantId,
      type: slotType,
      status: "pending_review",
      generatedFileName,
      mimeType: "image/jpeg",
      originalFileName: `${slotType}.jpg`,
      sizeBytes: 2048,
      storageBucket: "submission-media",
      storagePath,
      uploadedAtIso: nowIso,
      uploadedAt: "сейчас",
      uploadedBy: "Агент",
      uploadStatus: "uploaded",
      reviewStatus: "not_reviewed",
    },
    media: {
      id: `media-browser-sync-${slotType}`,
      applicant_id: syncSmokeApplicantId,
      submission_id: syncSmokeSubmissionId,
      type: slotType,
      original_file_name: `${slotType}.jpg`,
      generated_file_name: generatedFileName,
      storage_bucket: "submission-media",
      storage_path: storagePath,
      mime_type: "image/jpeg",
      size_bytes: 2048,
      upload_status: "uploaded",
      review_status: "not_reviewed",
      uploaded_at: nowIso,
      reviewed_at: null,
      reviewed_by: null,
    },
  };
}

function syncSmokeSubmittedPayload(agentId: string, nowIso: string) {
  const passport = syncSmokeFilePayload("passport", "passport_scan", nowIso);
  const selfie = syncSmokeFilePayload("selfie", "selfie", nowIso);
  const selfie2 = syncSmokeFilePayload("selfie2", "selfie_2", nowIso);
  const submission = {
    id: syncSmokeSubmissionId,
    title: syncSmokeApplicantName,
    type: "single",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "2026-07-10",
    tripDateTo: "2026-07-18",
    status: "submitted_for_review",
    applicants: [
      {
        id: syncSmokeApplicantId,
        fullName: syncSmokeApplicantName,
        role: "main",
        questionnaireStatus: "complete",
        fileStatus: "complete",
        passportExtraction: {
          appliedFieldKeys: [],
          dismissedAtIso: nowIso,
          extractedFields: [],
          lastAttemptAtIso: nowIso,
          sourceFileId: syncSmokeFileIds.passport,
          sourceFileName: "passport_scan.jpg",
          sourceStoragePath: passport.media.storage_path,
          status: "unavailable",
          summary: "Smoke fixture uses manually verified passport fields.",
        },
        sections: [
          {
            id: `${syncSmokeApplicantId}-passport`,
            title: "Паспорт",
            stepLabel: "2",
            status: "complete",
            fields: [
              {
                id: "passport-type",
                label: "Тип паспорта",
                value: "ORDINARY PASSPORT",
                required: true,
              },
              {
                id: "passport-no",
                label: "Номер паспорта",
                value: "123456789",
                required: true,
              },
              {
                id: "passport-issue-date",
                label: "Дата выдачи",
                value: "2020-01-01",
                required: true,
              },
              {
                id: "passport-expiry-date",
                label: "Действителен до",
                value: "2030-01-01",
                required: true,
              },
            ],
          },
          {
            id: `${syncSmokeApplicantId}-trip`,
            title: "Поездка",
            stepLabel: "5",
            status: "complete",
            fields: [
              {
                id: "route",
                label: "Маршрут поездки",
                value: "Москва, Барселона, Москва",
                required: true,
                span: "full",
              },
            ],
          },
        ],
      },
    ],
    issues: [],
    files: [passport.cockpit, selfie.cockpit, selfie2.cockpit],
    completeness: { questionnaire: 100, files: 100, total: 100 },
    aiSuggestions: [],
    aiReviewState: "idle",
    exportState: "not_ready",
    createdAt: nowIso,
    updatedAt: nowIso,
    history: [
      {
        id: "history-browser-sync-smoke-reset",
        text: "Sync smoke submitted",
        at: nowIso,
        source: "system",
      },
    ],
  };

  return {
    submission: {
      id: syncSmokeSubmissionId,
      agent_id: agentId,
      type: "single",
      title: syncSmokeApplicantName,
      country: "Испания",
      city: "Москва",
      travel_date: "2026-07-10 - 2026-07-18",
      status: "waiting_review",
      priority: "Средний",
      readiness_percent: 100,
      family_intelligence: {
        status: "unreviewed",
        v19CockpitSnapshot: {
          version: 1,
          submission,
        },
      },
      appointment_status: "not_started",
      submitted_at: nowIso,
      review_started_at: null,
      accepted_at: null,
      exported_at: null,
      updated_at: nowIso,
    },
    applicants: [
      {
        id: syncSmokeApplicantId,
        submission_id: syncSmokeSubmissionId,
        full_name: syncSmokeApplicantName,
        role: "Основной заявитель",
        suggested_role: null,
        role_confirmed: true,
        birth_date: "1990-01-01",
        patronymic: null,
        citizenship: "Russia",
        address: "Moscow, Tverskaya 1",
        phone: "+79000000000",
        email: "sync-smoke@example.test",
        passport_number: "123456789",
        passport_issued_at: "2020-01-01",
        passport_expires_at: "2030-01-01",
        country: "Испания",
        city: "Москва",
        trip_dates: "2026-07-10 - 2026-07-18",
        hotel_name: "ILUNION Barcelona",
        hotel_address: "CALLE RAMON TUR 196-198",
        questionnaire_percent: 100,
        media_percent: 100,
      },
    ],
    media_assets: [passport.media, selfie.media, selfie2.media],
    corrections: [],
    status_history: [],
  };
}

async function resetSyncSmokeSubmission() {
  const { userId: agentId } = await signedSmokeAgentClient();
  const { client: adminClient } = await signedSmokeAdminClient();
  const nowIso = new Date().toISOString();
  const { error: correctionsError } = await adminClient
    .from("corrections")
    .update({ fixed_at: nowIso, status: "closed" })
    .eq("submission_id", syncSmokeSubmissionId)
    .neq("status", "closed");

  if (correctionsError) throw new Error(correctionsError.message);

  const { error } = await adminClient.rpc("save_submission_draft", {
    payload: syncSmokeSubmittedPayload(agentId, nowIso),
  });
  if (error) throw new Error(error.message);

  return agentId;
}

async function openUploadSmokeDraft(page: Page) {
  await page.getByRole("button", { name: /Мои подачи/ }).click();
  await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
  await page.getByRole("tab", { name: "В работе" }).click();
  await page.getByRole("searchbox").fill(uploadSmokeApplicantName);
  const card = page.locator(`[data-submission-id="${uploadSmokeSubmissionId}"]`).first();

  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(
    drawer(page).getByRole("heading", { name: uploadSmokeApplicantName }),
  ).toBeVisible({ timeout: 10_000 });
}

async function openSyncSmokeSubmission(page: Page, searchTerm = syncSmokeApplicantName) {
  await page.getByRole("searchbox").fill(searchTerm);
  const card = page.locator(`[data-submission-id="${syncSmokeSubmissionId}"]`).first();

  await expect(card).toBeVisible({ timeout: 15_000 });
  const cardAction = card.getByRole("button").first();

  if ((await cardAction.count()) > 0) await cardAction.click();
  else await card.click();

  await expect(
    drawer(page).getByRole("heading", { name: syncSmokeApplicantName }),
  ).toBeVisible({ timeout: 10_000 });
}

async function openSyncSmokeReviewDrawer(page: Page) {
  await expect(
    drawer(page).getByRole("heading", { name: syncSmokeApplicantName }),
  ).toBeVisible({ timeout: 10_000 });
}

async function signInSmokeAgent(page: Page) {
  const smokeEnv = loadSmokeEnv();
  const smokeAgentEmail = requiredSmokeValue(smokeEnv, "SUPABASE_SMOKE_AGENT_EMAIL");
  const smokeAgentPassword = requiredSmokeValue(
    smokeEnv,
    "SUPABASE_SMOKE_AGENT_PASSWORD",
  );

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  if (await isWorkspaceVisible(page)) return;
  await expect(
    page.getByRole("main", { name: "Вход в рабочий кабинет" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill(smokeAgentEmail);
  await page.getByRole("textbox", { name: "Пароль" }).fill(smokeAgentPassword);
  await submitLoginAndWaitForWorkspace(page);
}

async function signInSmokeAdmin(page: Page) {
  const smokeEnv = loadSmokeEnv();
  const smokeAdminEmail = requiredSmokeValue(smokeEnv, "SUPABASE_SMOKE_ADMIN_EMAIL");
  const smokeAdminPassword = requiredSmokeValue(
    smokeEnv,
    "SUPABASE_SMOKE_ADMIN_PASSWORD",
  );

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  if (await isWorkspaceVisible(page)) return;
  await expect(
    page.getByRole("main", { name: "Вход в рабочий кабинет" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill(smokeAdminEmail);
  await page.getByRole("textbox", { name: "Пароль" }).fill(smokeAdminPassword);
  await submitLoginAndWaitForWorkspace(page);
}

async function submitLoginAndWaitForWorkspace(page: Page) {
  const workspace = page.getByRole("main", { name: "Рабочая область подач" });
  const loginButton = page.getByRole("button", { name: "Войти" });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await isWorkspaceVisible(page)) return;
    if (!(await loginButton.isVisible({ timeout: 5_000 }).catch(() => false))) {
      continue;
    }
    await loginButton.click({ timeout: 5_000 });
    if (await workspace.isVisible({ timeout: 15_000 }).catch(() => false)) return;
    await page.waitForTimeout(attempt * 1_000);
  }

  await expect(workspace).toBeVisible({ timeout: 15_000 });
}

async function isWorkspaceVisible(page: Page) {
  return page
    .getByRole("main", { name: "Рабочая область подач" })
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
}

async function signOut(page: Page) {
  const closeDrawer = page
    .getByRole("button", { name: /Закрыть подачу|Закрыть проверку/ })
    .first();
  if ((await closeDrawer.count()) > 0 && (await closeDrawer.isVisible())) {
    await closeDrawer.click();
    await expect(drawer(page)).toBeHidden();
  }

  await page.getByRole("button", { name: /Выйти|Выход/ }).click();
  await expect(
    page.getByRole("main", { name: "Вход в рабочий кабинет" }),
  ).toBeVisible({ timeout: 20_000 });
}

async function waitForSyncSmokeStatus(
  client: SupabaseClient,
  status: string,
  snapshotStatus: string,
) {
  await expect
    .poll(
      async () => {
        const { data, error } = await client
          .from("submissions")
          .select("status,family_intelligence")
          .eq("id", syncSmokeSubmissionId)
          .single();
        if (error) return error.message;
        const snapshot = data.family_intelligence as {
          v19CockpitSnapshot?: { submission?: { status?: string } };
        };
        return `${data.status}:${snapshot.v19CockpitSnapshot?.submission?.status}`;
      },
      { timeout: 15_000 },
    )
    .toBe(`${status}:${snapshotStatus}`);
}

async function expectCorrectionHandoffRejectedForClient(
  client: SupabaseClient,
  ownerAgentId: string,
) {
  const { error } = await client.rpc("submit_corrections_handoff", {
    payload: syncSmokeSubmittedPayload(ownerAgentId, new Date().toISOString()),
  });

  expect(error).toBeTruthy();
  expect(error?.message).toContain("Only the assigned agent can submit corrections");
}

function uploadSmokeUploadedMediaRows(nowIso: string): SmokeMediaRow[] {
  return [
    {
      generatedFileName: "smoke-passport.jpg",
      id: "media-browser-upload-passport",
      mimeType: "image/jpeg",
      originalFileName: "smoke-passport.jpg",
      sizeBytes: 2048,
      type: "passport_scan",
    },
    {
      generatedFileName: "smoke-selfie.jpg",
      id: "media-browser-upload-selfie",
      mimeType: "image/jpeg",
      originalFileName: "smoke-selfie.jpg",
      sizeBytes: 2048,
      type: "selfie",
    },
    {
      generatedFileName: "smoke-selfie-2.jpg",
      id: "media-browser-upload-selfie-2",
      mimeType: "image/jpeg",
      originalFileName: "smoke-selfie-2.jpg",
      sizeBytes: 2048,
      type: "selfie_2",
    },
  ].map((item) => ({
    id: item.id,
    applicant_id: uploadSmokeApplicantId,
    submission_id: uploadSmokeSubmissionId,
    type: item.type,
    original_file_name: item.originalFileName,
    generated_file_name: item.generatedFileName,
    storage_bucket: "submission-media",
    storage_path: `${uploadSmokeSubmissionId}/${uploadSmokeApplicantId}/${item.type}/${item.generatedFileName}`,
    mime_type: item.mimeType,
    size_bytes: item.sizeBytes,
    upload_status: "uploaded",
    review_status: "not_reviewed",
    uploaded_at: nowIso,
    reviewed_at: null,
    reviewed_by: null,
  }));
}

async function persistUploadSmokeMedia(client: SupabaseClient, agentId: string) {
  const nowIso = new Date().toISOString();
  const mediaRows = uploadSmokeUploadedMediaRows(nowIso);

  const { error } = await withTimeout(
    client.rpc("save_submission_draft", {
      payload: uploadSmokeDraftPayload(agentId, nowIso, mediaRows),
    }),
    30_000,
    "Upload smoke media save_submission_draft timed out.",
  );
  if (error) throw new Error(error.message);
}

async function expectUploadSmokeMediaPersisted(client: SupabaseClient) {
  const { data, error } = await client
    .from("media_assets")
    .select("type, upload_status")
    .eq("submission_id", uploadSmokeSubmissionId)
    .in("type", ["passport_scan", "selfie", "selfie_2"]);

  if (error) throw new Error(error.message);

  expect(data).toHaveLength(3);
  expect(data?.every((row) => row.upload_status === "uploaded")).toBe(true);
}

test("exposes only browser-safe Supabase values", async ({ page }) => {
  const smokeEnv = loadSmokeEnv();
  const projectId = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_PROJECT_ID");
  const supabaseUrl = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_URL");
  const publishableKey = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_PUBLISHABLE_KEY");
  const expectedProjectId =
    browserAuditTarget === "production"
      ? allowedProductionProjectId
      : allowedSmokeProjectId;

  expect(projectId).toBe(expectedProjectId);
  expect(supabaseUrl).toBe(`https://${expectedProjectId}.supabase.co`);
  expect(publishableKey).toMatch(/^sb_publishable_/);

  const scriptBodyReads: Promise<{ body: string; url: string }>[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.resourceType() !== "script") return;
    if (!response.url().startsWith("http://127.0.0.1:4198/")) return;

    scriptBodyReads.push(
      response.text().then((body) => ({
        body,
        url: response.url(),
      })),
    );
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("main", { name: "Вход в рабочий кабинет" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Вход" }),
  ).toBeVisible();
  await expect(
    page.getByText("Введите email и пароль для доступа к кабинету."),
  ).toBeVisible();

  const scriptBodies = await Promise.all(scriptBodyReads);
  expect(scriptBodies.length).toBeGreaterThan(0);

  const browserBundle = scriptBodies.map(({ body }) => body).join("\n");
  expect(browserBundle).toContain(expectedProjectId);
  expect(browserBundle).toContain(supabaseUrl);
  expect(browserBundle).toContain(publishableKey);

  for (const marker of forbiddenBundleMarkers) {
    expect(browserBundle).not.toContain(marker);
  }

  for (const [name, value] of Object.entries(smokeEnv)) {
    if (name.startsWith("VITE_")) continue;
    expectBundleDoesNotContainSecretValue(browserBundle, name, value);
  }

  await page.screenshot({
    fullPage: true,
    path:
      browserAuditTarget === "production"
        ? "docs/qa/supabase-production-browser-key-audit-desktop.png"
        : "docs/qa/supabase-browser-key-audit-desktop.png",
  });
});

test.describe("Supabase sandbox auth smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("opens the workspace with a smoke agent without retained traces", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signInSmokeAgent(page);
    await page.getByRole("button", { name: /Мои подачи/ }).click();
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Новая подача" }).first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path:
        browserAuditTarget === "production"
          ? "docs/qa/supabase-production-auth-smoke-desktop.png"
          : "docs/qa/supabase-auth-smoke-desktop.png",
    });
  });

  test("uploads private media and shows it in the cockpit drawer", async ({ page }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    const { client, userId } = await resetUploadSmokeSubmission();

    try {
      await signInSmokeAgent(page);
      await openUploadSmokeDraft(page);

      await drawer(page).getByRole("button", { name: "Файлы" }).click();
      await expect(
        drawer(page).locator(".v19-drawer-files-count"),
      ).toContainText("0/3", { timeout: 15_000 });
      await persistUploadSmokeMedia(client, userId);
      await expectUploadSmokeMediaPersisted(client);

      await page.reload();
      await expect(
        page.getByRole("main", { name: "Рабочая область подач" }),
      ).toBeVisible({
        timeout: 20_000,
      });
      await openUploadSmokeDraft(page);
      await drawer(page).getByRole("button", { name: "Файлы" }).click();
      await expect(
        drawer(page).locator(".v19-drawer-files-count"),
      ).toContainText("3/3", { timeout: 15_000 });

      await page.screenshot({
        fullPage: true,
        path: "docs/qa/supabase-private-media-upload-desktop.png",
      });
    } finally {
      await resetUploadSmokeSubmissionWithTimeout();
    }
  });

  test("keeps admin return and agent correction in sync across Supabase roles", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(20_000);
    const syncOwnerAgentId = await resetSyncSmokeSubmission();
    const { client: adminClient } = await signedSmokeAdminClient();

    try {
      await signInSmokeAdmin(page);
      await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();
      await page.getByRole("tab", { name: "На проверке" }).click();
      await openSyncSmokeSubmission(page);
      await openSyncSmokeReviewDrawer(page);
      await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
      await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
      await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
      await expect(
        drawer(page).getByText("Требуется уточнение"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Вернуть", exact: true }).click();
      await expect(drawer(page).getByText("Возвращено")).toBeVisible();
      await waitForSyncSmokeStatus(adminClient, "returned", "returned");
      await expectCorrectionHandoffRejectedForClient(
        adminClient,
        syncOwnerAgentId,
      );
      const { client: otherAgentClient } = await signedSmokeOtherAgentClient();
      await expectCorrectionHandoffRejectedForClient(
        otherAgentClient,
        syncOwnerAgentId,
      );

      await signOut(page);
      await signInSmokeAgent(page);
      await openSyncSmokeSubmission(page);
      if (!(await drawer(page).isVisible())) {
        await page
          .getByRole("complementary", { name: "Контекст выбранной подачи" })
          .getByRole("button", { name: "Исправить" })
          .click();
      }
      await expect(
        drawer(page).getByRole("heading", { name: syncSmokeApplicantName }),
      ).toBeVisible();
      await drawer(page).getByRole("button", { name: /Замечания/ }).click();
      await drawer(page).getByRole("button", { name: "Исправить" }).click();
      const routeField = page.getByLabel(/Маршрут поездки/).first();
      await expect(routeField).toBeVisible();
      await routeField.fill("Москва, Барселона, Мадрид, Москва");
      await page.getByRole("button", { name: "Готово к проверке" }).click();
      await expect(
        drawer(page).getByRole("heading", { name: syncSmokeApplicantName }),
      ).toBeVisible();
      await drawer(page).getByRole("button", { name: /Замечания/ }).click();
      await drawer(page).getByRole("button", { name: "Отметить исправленным" }).click();
      await expect(drawer(page).getByText("Исправлено")).toBeVisible();
      await expect(
        drawer(page).getByRole("button", { name: "Отправить исправления" }),
      ).toBeEnabled();
      const correctionSave = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/rest/v1/rpc/submit_corrections_handoff"),
        { timeout: 20_000 },
      );
      await page.getByRole("button", { name: "Отправить исправления" }).click();
      await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
      const correctionSaveResponse = await correctionSave;
      const correctionSaveBody = await correctionSaveResponse.text();
      expect(
        correctionSaveResponse.ok(),
        `submit_corrections_handoff failed with ${correctionSaveResponse.status()}: ${correctionSaveBody}`,
      ).toBe(true);
      await waitForSyncSmokeStatus(adminClient, "waiting_review", "corrections_received");

      await signOut(page);
      await signInSmokeAdmin(page);
      await openSyncSmokeSubmission(page, syncSmokeSubmissionId);
      await openSyncSmokeReviewDrawer(page);
      await expect(drawer(page).getByText("Исправлено агентом")).toBeVisible();
      await page.getByRole("button", { name: "Закрыть и принять" }).click();
      await expect(drawer(page).getByText("Готово к выгрузке").first()).toBeVisible();
      await waitForSyncSmokeStatus(adminClient, "ready_for_excel", "ready_for_export");
    } finally {
      await resetSyncSmokeSubmission();
    }
  });
});
