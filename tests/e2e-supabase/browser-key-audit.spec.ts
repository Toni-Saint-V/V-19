import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const smokeEnvPath = resolve(process.cwd(), ".env.supabase-smoke.local");
const allowedSmokeProjectId = "oevvaowoklqttqkraxho";
const uploadSmokeApplicantId = "app-browser-upload-smoke-1";
const uploadSmokeApplicantName = "Upload Smoke Browser Fixture";
const uploadSmokeFileIds = {
  photo: "file-browser-upload-smoke-photo",
  selfie: "file-browser-upload-smoke-selfie",
  video: "file-browser-upload-smoke-video",
} as const;
const uploadSmokeSubmissionId = "VF-BROWSER-UPLOAD-SMOKE";
const syncSmokeApplicantId = "app-browser-sync-smoke-1";
const syncSmokeApplicantName = "Admin Agent Sync Fixture";
const syncSmokeFileIds = {
  photo: "file-browser-sync-smoke-photo",
  selfie: "file-browser-sync-smoke-selfie",
  video: "file-browser-sync-smoke-video",
} as const;
const syncSmokeSubmissionId = "VF-BROWSER-SYNC-SMOKE";
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
  if (!existsSync(smokeEnvPath)) return {};

  const env: Record<string, string> = {};
  for (const line of readFileSync(smokeEnvPath, "utf8").split(/\r?\n/)) {
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
  return page.locator(".submission-drawer");
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

function uploadSmokeDraftPayload(agentId: string, nowIso: string) {
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
        fileStatus: "empty",
        sections: [],
      },
    ],
    issues: [],
    files: [
      {
        id: uploadSmokeFileIds.photo,
        applicantId: uploadSmokeApplicantId,
        type: "photo",
        status: "missing",
      },
      {
        id: uploadSmokeFileIds.selfie,
        applicantId: uploadSmokeApplicantId,
        type: "selfie",
        status: "missing",
      },
      {
        id: uploadSmokeFileIds.video,
        applicantId: uploadSmokeApplicantId,
        type: "video",
        status: "missing",
      },
    ],
    completeness: { questionnaire: 0, files: 0, total: 0 },
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
      readiness_percent: 0,
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
        media_percent: 0,
      },
    ],
    media_assets: [],
    corrections: [],
    status_history: [],
  };
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
  const { error } = await client.rpc("save_submission_draft", {
    payload: uploadSmokeDraftPayload(userId, new Date().toISOString()),
  });
  if (error) throw new Error(error.message);
}

function syncSmokeFilePayload(
  type: keyof typeof syncSmokeFileIds,
  slotType: "photo_white" | "selfie" | "video",
  nowIso: string,
) {
  const generatedFileName = `v19sync_${slotType}.${slotType === "video" ? "mp4" : "jpg"}`;
  const storagePath = `${syncSmokeSubmissionId}/${syncSmokeApplicantId}/${slotType}/${generatedFileName}`;

  return {
    cockpit: {
      id: syncSmokeFileIds[type],
      applicantId: syncSmokeApplicantId,
      type,
      status: "pending_review",
      generatedFileName,
      mimeType: slotType === "video" ? "video/mp4" : "image/jpeg",
      originalFileName: `${slotType}.${slotType === "video" ? "mp4" : "jpg"}`,
      sizeBytes: slotType === "video" ? 4096 : 2048,
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
      original_file_name: `${slotType}.${slotType === "video" ? "mp4" : "jpg"}`,
      generated_file_name: generatedFileName,
      storage_bucket: "submission-media",
      storage_path: storagePath,
      mime_type: slotType === "video" ? "video/mp4" : "image/jpeg",
      size_bytes: slotType === "video" ? 4096 : 2048,
      upload_status: "uploaded",
      review_status: "not_reviewed",
      uploaded_at: nowIso,
      reviewed_at: null,
      reviewed_by: null,
    },
  };
}

function syncSmokeSubmittedPayload(agentId: string, nowIso: string) {
  const photo = syncSmokeFilePayload("photo", "photo_white", nowIso);
  const selfie = syncSmokeFilePayload("selfie", "selfie", nowIso);
  const video = syncSmokeFilePayload("video", "video", nowIso);
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
        sections: [
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
    files: [photo.cockpit, selfie.cockpit, video.cockpit],
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
        passport_number: "AA1234567",
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
    media_assets: [photo.media, selfie.media, video.media],
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
  await page.getByRole("tab", { name: "В работе" }).click();
  await page.getByLabel("Поиск в текущем списке").fill(uploadSmokeApplicantName);
  const card = page
    .locator(".submission-card")
    .filter({ hasText: uploadSmokeApplicantName })
    .first();

  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button").click();
  await expect(
    drawer(page).getByRole("heading", { name: uploadSmokeApplicantName }),
  ).toBeVisible();
}

async function openSyncSmokeSubmission(page: Page) {
  await page.getByLabel("Поиск в текущем списке").fill(syncSmokeApplicantName);
  const card = page
    .locator(".submission-card")
    .filter({ hasText: syncSmokeApplicantName })
    .first();

  await expect(card).toBeVisible({ timeout: 15_000 });
  const cardAction = card.getByRole("button").first();

  if ((await cardAction.count()) > 0) await cardAction.click();
  else await card.click();

  await expect(
    page.locator(".selected-context").filter({ hasText: syncSmokeApplicantName }),
  ).toBeVisible();
}

async function openSyncSmokeReviewDrawer(page: Page) {
  await page
    .getByRole("region", { name: "Текущее решение администратора" })
    .getByRole("button", { name: "Открыть проверку" })
    .click();
  await expect(
    drawer(page).getByRole("heading", { name: syncSmokeApplicantName }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("main", { name: "Вход в рабочий кабинет" }),
  ).toBeVisible();

  await page.getByLabel("Рабочая почта").fill(smokeAgentEmail);
  await page.getByLabel("Пароль").fill(smokeAgentPassword);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByRole("main", { name: "Рабочая область подач" })).toBeVisible({
    timeout: 20_000,
  });
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
  await expect(
    page.getByRole("main", { name: "Вход в рабочий кабинет" }),
  ).toBeVisible();

  await page.getByLabel("Рабочая почта").fill(smokeAdminEmail);
  await page.getByLabel("Пароль").fill(smokeAdminPassword);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByRole("main", { name: "Рабочая область подач" })).toBeVisible({
    timeout: 20_000,
  });
}

async function signOut(page: Page) {
  const closeSubmission = page.getByRole("button", { name: "Закрыть подачу" });
  if ((await closeSubmission.count()) > 0 && (await closeSubmission.isVisible())) {
    await closeSubmission.click();
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

test("exposes only browser-safe Supabase sandbox values", async ({ page }) => {
  const smokeEnv = loadSmokeEnv();
  const projectId = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_PROJECT_ID");
  const supabaseUrl = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_URL");
  const publishableKey = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_PUBLISHABLE_KEY");

  expect(projectId).toBe(allowedSmokeProjectId);
  expect(supabaseUrl).toBe(`https://${allowedSmokeProjectId}.supabase.co`);
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
    page.getByRole("heading", { name: "Вход в рабочий кабинет" }),
  ).toBeVisible();
  await expect(page.getByText("Вход идёт через Supabase Auth.")).toBeVisible();

  const scriptBodies = await Promise.all(scriptBodyReads);
  expect(scriptBodies.length).toBeGreaterThan(0);

  const browserBundle = scriptBodies.map(({ body }) => body).join("\n");
  expect(browserBundle).toContain(allowedSmokeProjectId);
  expect(browserBundle).toContain(supabaseUrl);
  expect(browserBundle).toContain(publishableKey);

  for (const marker of forbiddenBundleMarkers) {
    expect(browserBundle).not.toContain(marker);
  }

  for (const [name, value] of Object.entries(smokeEnv)) {
    if (name.startsWith("VITE_")) continue;
    expectBundleDoesNotContainSecretValue(browserBundle, name, value);
  }
});

test.describe("Supabase sandbox auth smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("opens the workspace with a smoke agent without retained traces", async ({
    page,
  }) => {
    await signInSmokeAgent(page);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Новая подача" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: "docs/qa/supabase-browser-key-audit-desktop.png",
    });
  });

  test("uploads private media from the cockpit drawer", async ({ page }) => {
    test.setTimeout(90_000);
    await resetUploadSmokeSubmission();

    try {
      await signInSmokeAgent(page);
      await openUploadSmokeDraft(page);

      await drawer(page).getByRole("tab", { name: "Файлы" }).click();
      await drawer(page)
        .locator('input[type="file"]')
        .nth(0)
        .setInputFiles({
          name: "smoke-photo.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("supabase-smoke-photo"),
        });
      await expect(
        drawer(page).locator(".file-row").filter({ hasText: "Загружено" }),
      ).toHaveCount(1, { timeout: 15_000 });
      await drawer(page)
        .locator('input[type="file"]')
        .nth(0)
        .setInputFiles({
          name: "smoke-selfie.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("supabase-smoke-selfie"),
        });
      await expect(
        drawer(page).locator(".file-row").filter({ hasText: "Загружено" }),
      ).toHaveCount(2, { timeout: 15_000 });
      await drawer(page)
        .locator('input[type="file"]')
        .nth(0)
        .setInputFiles({
          name: "smoke-video.mp4",
          mimeType: "video/mp4",
          buffer: Buffer.from("supabase-smoke-video"),
        });

      await expect(
        drawer(page).locator(".file-row").filter({ hasText: "Загружено" }),
      ).toHaveCount(3, { timeout: 15_000 });
      await expect(page.locator(".save-status")).toContainText("Supabase", {
        timeout: 15_000,
      });

      await page.reload();
      await expect(
        page.getByRole("main", { name: "Рабочая область подач" }),
      ).toBeVisible({
        timeout: 20_000,
      });
      await openUploadSmokeDraft(page);
      await drawer(page).getByRole("tab", { name: "Файлы" }).click();
      await expect(
        drawer(page).locator(".file-row").filter({ hasText: "Загружено" }),
      ).toHaveCount(3, { timeout: 15_000 });

      await page.screenshot({
        fullPage: true,
        path: "docs/qa/supabase-private-media-upload-desktop.png",
      });
    } finally {
      await resetUploadSmokeSubmission();
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
      await expect(page.getByRole("heading", { name: "Проверка подач" })).toBeVisible();
      await page.getByRole("tab", { name: "На проверке" }).click();
      await openSyncSmokeSubmission(page);
      await openSyncSmokeReviewDrawer(page);
      await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
      await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
      await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
      await expect(
        drawer(page).getByText("Нужно уточнить маршрут поездки"),
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
      await page.getByRole("tab", { name: "Требуют действия" }).click();
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
      const questionnaireTab = drawer(page).locator("#drawer-tab-questionnaire");
      await questionnaireTab.click();
      await expect(questionnaireTab).toHaveAttribute("aria-selected", "true");
      const routeField = drawer(page).getByLabel(
        `${syncSmokeApplicantName} · Поездка · Маршрут поездки`,
      );
      await expect(routeField).toBeVisible();
      await routeField.fill("Москва, Барселона, Мадрид, Москва");
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
      await page.getByRole("tab", { name: "Исправления" }).click();
      await openSyncSmokeSubmission(page);
      await openSyncSmokeReviewDrawer(page);
      await expect(drawer(page).getByText("Исправлено агентом")).toBeVisible();
      await page.getByRole("button", { name: "Закрыть и принять" }).click();
      await expect(drawer(page).getByText("Готово к выгрузке")).toBeVisible();
      await waitForSyncSmokeStatus(adminClient, "ready_for_excel", "ready_for_export");
    } finally {
      await resetSyncSmokeSubmission();
    }
  });
});
