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
  const smokeEnv = loadSmokeEnv();
  const client = smokeClient(smokeEnv);
  const { data, error } = await client.auth.signInWithPassword({
    email: requiredSmokeValue(smokeEnv, "SUPABASE_SMOKE_AGENT_EMAIL"),
    password: requiredSmokeValue(smokeEnv, "SUPABASE_SMOKE_AGENT_PASSWORD"),
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Smoke agent sign-in failed.");
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
});
