import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createQuestionnaireSections } from "../../src/modules/submissions/questionnaire";
import { testArtifactPath } from "../support/artifacts";

const smokeEnvPath = resolve(process.cwd(), ".env.supabase-smoke.local");
const productionEnvPath = resolve(process.cwd(), ".env.supabase-production.local");
const allowedSmokeProjectId = "oevvaowoklqttqkraxho";
const allowedProductionProjectId = "tsymifccglpepvbmrcgh";
const browserAuditTarget =
  process.env.SUPABASE_BROWSER_AUDIT_ENV === "production" ? "production" : "sandbox";
const browserAuditEnvPath =
  browserAuditTarget === "production" ? productionEnvPath : smokeEnvPath;
const browserSmokeTargetSuffix =
  browserAuditTarget === "production" ? "prod" : "sandbox";
const uploadSmokeApplicantId = `app-browser-upload-smoke-${browserSmokeTargetSuffix}-1`;
const uploadSmokeApplicantName = "Upload Smoke Browser Fixture";
const uploadSmokeFileIds = {
  passport: `file-browser-upload-smoke-${browserSmokeTargetSuffix}-passport`,
  selfie: `file-browser-upload-smoke-${browserSmokeTargetSuffix}-selfie`,
  selfie2: `file-browser-upload-smoke-${browserSmokeTargetSuffix}-selfie-2`,
} as const;
const uploadSmokeSubmissionId = `VF-BROWSER-UPLOAD-SMOKE-${browserSmokeTargetSuffix.toUpperCase()}`;
const syncSmokeApplicantId = `app-browser-sync-smoke-${browserSmokeTargetSuffix}-1`;
const syncSmokeApplicantName = "Admin Agent Sync Fixture";
const syncSmokeFileIds = {
  passport: `file-browser-sync-smoke-${browserSmokeTargetSuffix}-passport`,
  selfie: `file-browser-sync-smoke-${browserSmokeTargetSuffix}-selfie`,
  selfie2: `file-browser-sync-smoke-${browserSmokeTargetSuffix}-selfie-2`,
} as const;
const syncSmokeSubmissionId = `VF-BROWSER-SYNC-SMOKE-${browserSmokeTargetSuffix.toUpperCase()}`;
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
  ["OPENAI", "API", "KEY"].join("_"),
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
  mediaRows: SmokeMediaRow[] = [],
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

function browserSmokeStoragePath(
  submissionId: string,
  applicantId: string,
  type: string,
  generatedFileName: string,
): string {
  return `submissions/${submissionId}/applicants/${applicantId}/${type}/${generatedFileName}`;
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
  const storagePath = browserSmokeStoragePath(
    syncSmokeSubmissionId,
    syncSmokeApplicantId,
    slotType,
    generatedFileName,
  );

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
      id: `media-browser-sync-${browserSmokeTargetSuffix}-${slotType}`,
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

function syncSmokeQuestionnaireSections() {
  const exactValues: Record<string, string> = {
    "arrival-date": "10.07.2026",
    "birth-date": "20.08.1990",
    "departure-date": "18.07.2026",
    "passport-expiry-date": "26.02.2032",
    "passport-issue-date": "26.02.2016",
    "stay-duration": "9",
  };

  return createQuestionnaireSections(
    syncSmokeApplicantId,
    syncSmokeApplicantName,
    "complete",
  ).map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({
      ...field,
      value:
        exactValues[field.id] ??
        field.options?.[0] ??
        (field.id.includes("date") ||
        field.id.includes("valid") ||
        field.id.includes("expiry")
          ? "20.08.2030"
          : field.label.toLocaleLowerCase("ru-RU").includes("email")
            ? "sync-smoke@example.test"
            : field.label.toLocaleLowerCase("ru-RU").includes("телефон")
              ? "79000000000"
              : field.id === "passport-no"
                ? "752869613"
                : "READY"),
    })),
  }));
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
        sections: syncSmokeQuestionnaireSections(),
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
  const { error: questionnaireAnswersError } = await adminClient
    .from("questionnaire_answers")
    .delete()
    .eq("submission_id", syncSmokeSubmissionId);

  if (questionnaireAnswersError) throw new Error(questionnaireAnswersError.message);
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
  const workTab = page.getByRole("tab", { name: "В работе" });
  if ((await workTab.count()) > 0) await workTab.click();
  await submissionSearch(page).fill(uploadSmokeApplicantName);
  const card = page.locator(`[data-submission-id="${uploadSmokeSubmissionId}"]`).first();

  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  const drawerHeading = drawer(page).getByRole("heading", {
    name: uploadSmokeApplicantName,
  });
  const workspaceHeading = page.getByRole("heading", {
    name: `Анкета: ${uploadSmokeApplicantName}`,
  });
  await expect(
    drawerHeading.or(workspaceHeading),
  ).toBeVisible({ timeout: 10_000 });
}

async function openSyncSmokeSubmission(page: Page, searchTerm = syncSmokeApplicantName) {
  await submissionSearch(page).fill(searchTerm);
  const card = page.locator(`[data-submission-id="${syncSmokeSubmissionId}"]`).first();

  await expect(card).toBeVisible({ timeout: 15_000 });
  const cardAction = card.getByRole("button").first();

  if ((await cardAction.count()) > 0) await cardAction.click();
  else await card.click();

  await expect(
    page
      .getByRole("dialog", { name: "Проверка пакета" })
      .or(page.getByRole("dialog", { name: syncSmokeApplicantName }))
      .first(),
  ).toBeVisible({ timeout: 10_000 });
}

function submissionSearch(page: Page) {
  return page
    .getByRole("searchbox")
    .or(
      page.getByRole("textbox", {
        name: /^(Поиск по подачам|ID, семья или агент)$/,
      }),
    )
    .first();
}

async function openSyncSmokeReviewDrawer(page: Page) {
  await expect(
    page.getByRole("dialog", { name: "Проверка пакета" }),
  ).toBeVisible({ timeout: 10_000 });
}

async function openDrawerFilesSection(page: Page) {
  const filesCount = drawer(page).locator(".v19-drawer-files-count");
  if ((await filesCount.count()) > 0 && (await filesCount.first().isVisible())) {
    return;
  }

  const filesTab = drawer(page).getByRole("tab", { name: "Файлы" });
  if ((await filesTab.count()) > 0) {
    await filesTab.click();
    return;
  }

  await drawer(page).getByRole("button", { name: "Файлы" }).click();
}

async function openDrawerIssuesSection(page: Page) {
  const issuesTab = drawer(page).getByRole("tab", { name: /Замечания/ });
  if ((await issuesTab.count()) > 0) {
    await issuesTab.click();
    return;
  }

  await drawer(page).getByRole("button", { name: /Замечания/ }).click();
}

async function chooseQuestionnaireOption(
  page: Page,
  label: string,
  value: string,
) {
  const field = page.locator(`[data-field-label="${label}"]`).first();
  await expect(field).toBeVisible();
  const dropdown = field.getByRole("combobox");
  await expect(dropdown).toBeVisible();
  if ((await dropdown.innerText()).trim().includes(value)) return;

  await dropdown.click();
  const search = field.getByRole("textbox", { name: `Поиск: ${label}` });
  if (await search.isVisible().catch(() => false)) await search.fill(value);
  const option = field.getByRole("option", { name: value, exact: true });
  await expect(option).toBeVisible();
  await option.click();
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

  await openExistingAccountSignIn(page);
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

  await openExistingAccountSignIn(page);
  await page.getByLabel("Email").fill(smokeAdminEmail);
  await page.getByRole("textbox", { name: "Пароль" }).fill(smokeAdminPassword);
  await submitLoginAndWaitForWorkspace(page);
}

async function openExistingAccountSignIn(page: Page) {
  const password = page.getByRole("textbox", { name: "Пароль" });
  if (await password.isVisible({ timeout: 1_000 }).catch(() => false)) return;

  await page
    .getByRole("button", { name: "Уже есть доступ? Войти" })
    .click({ timeout: 5_000 });
  await expect(password).toBeVisible({ timeout: 5_000 });
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

  const directSignOut = page.getByRole("button", { name: /Выйти|Выход/ }).first();
  if (await directSignOut.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await directSignOut.click();
  } else {
    const adminProfile = page.getByRole("button", { name: "Профиль администратора" });
    await expect(adminProfile).toBeVisible({ timeout: 5_000 });
    await adminProfile.click();
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
  }
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
      id: `media-browser-upload-${browserSmokeTargetSuffix}-passport`,
      mimeType: "image/jpeg",
      originalFileName: "smoke-passport.jpg",
      sizeBytes: 2048,
      type: "passport_scan",
    },
    {
      generatedFileName: "smoke-selfie.jpg",
      id: `media-browser-upload-${browserSmokeTargetSuffix}-selfie`,
      mimeType: "image/jpeg",
      originalFileName: "smoke-selfie.jpg",
      sizeBytes: 2048,
      type: "selfie",
    },
    {
      generatedFileName: "smoke-selfie-2.jpg",
      id: `media-browser-upload-${browserSmokeTargetSuffix}-selfie-2`,
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
    storage_path: browserSmokeStoragePath(
      uploadSmokeSubmissionId,
      uploadSmokeApplicantId,
      item.type,
      item.generatedFileName,
    ),
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
    page.getByRole("heading", { name: "Заявка на доступ" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Заполните данные агентства. Доступ появится после подтверждения администратором.",
    ),
  ).toBeVisible();
  await openExistingAccountSignIn(page);
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
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
        ? testArtifactPath("supabase-production-browser-key-audit-desktop.png")
        : testArtifactPath("supabase-browser-key-audit-desktop.png"),
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
    await expect(
      page.getByRole("button", { name: "Новая подача" }).first(),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path:
        browserAuditTarget === "production"
          ? testArtifactPath("supabase-production-auth-smoke-desktop.png")
          : testArtifactPath("supabase-auth-smoke-desktop.png"),
    });
  });

  test("uploads private media and persists it through Supabase", async ({ page }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    const { client, userId } = await resetUploadSmokeSubmission();

    try {
      await signInSmokeAgent(page);
      await openUploadSmokeDraft(page);

      const filesCount = drawer(page).locator(".v19-drawer-files-count");
      if ((await filesCount.count()) > 0 && (await filesCount.first().isVisible())) {
        await openDrawerFilesSection(page);
        await expect(filesCount).toContainText("0/3", { timeout: 15_000 });
      }
      await persistUploadSmokeMedia(client, userId);
      await expectUploadSmokeMediaPersisted(client);

      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("supabase-private-media-upload-desktop.png"),
      });
    } finally {
      await resetUploadSmokeSubmissionWithTimeout();
    }
  });

  test("keeps admin return and agent correction in sync across Supabase roles", async ({
    page,
  }) => {
    test.skip(
      browserAuditTarget === "production",
      "Production cross-role workflow is covered by supabase:production-workflow-smoke.",
    );
    test.setTimeout(180_000);
    page.setDefaultTimeout(20_000);
    const syncOwnerAgentId = await resetSyncSmokeSubmission();
    const { client: adminClient } = await signedSmokeAdminClient();

    try {
      await signInSmokeAdmin(page);
      await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();
      const inReviewTab = page.getByRole("tab", { name: "На проверке" });
      if ((await inReviewTab.count()) > 0) await inReviewTab.click();
      await openSyncSmokeSubmission(page);
      await openSyncSmokeReviewDrawer(page);
      const reviewDrawer = page.getByRole("dialog", { name: "Проверка пакета" });
      await reviewDrawer.getByRole("tab", { name: "Анкета" }).click();
      const tripSection = reviewDrawer
        .locator("details")
        .filter({ hasText: "Поездка" })
        .first();
      await expect(tripSection).toBeVisible();
      await tripSection.locator("summary").click();
      const routeReviewRow = reviewDrawer
        .locator(".admin-review-field-row")
        .filter({ hasText: "Страна первого въезда" })
        .first();
      await expect(routeReviewRow).toBeVisible();
      await routeReviewRow.getByTestId("admin-review-add-remark").click();
      const remarkDialog = page.getByRole("dialog", { name: "Добавить замечание" });
      await expect(
        remarkDialog.getByRole("textbox", { name: "Текст для клиента" }),
      ).toBeVisible();
      await remarkDialog.getByRole("button", { name: "Отправить замечание" }).click();
      await expect(remarkDialog).toBeHidden();
      const returnSave = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/rest/v1/rpc/save_submission_draft"),
        { timeout: 20_000 },
      );
      await page
        .getByRole("button", { name: "Отправить на исправление", exact: true })
        .click();
      const returnSaveResponse = await returnSave;
      expect(returnSaveResponse.ok(), "Admin return save must succeed.").toBe(true);
      await expect(
        page.getByRole("dialog", { name: "Проверка пакета" }),
      ).toBeHidden();
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
      await page.getByRole("button", { name: "Мои подачи" }).click();
      await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
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
      await openDrawerIssuesSection(page);
      await drawer(page).getByRole("button", { name: "Исправить в анкете" }).click();
      const agentDraftSave = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/rest/v1/rpc/save_submission_draft"),
        { timeout: 20_000 },
      );
      await chooseQuestionnaireOption(page, "Страна первого въезда", "France");
      const agentDraftSaveResponse = await agentDraftSave;
      const agentDraftSaveBody = await agentDraftSaveResponse.text();
      expect(
        agentDraftSaveResponse.ok(),
        `Agent correction draft save must succeed: ${agentDraftSaveResponse.status()}: ${agentDraftSaveBody}`,
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Пометить исправленным" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Пометить исправленным" }).click();
      await expect(
        page.getByText("Исправление по полю «Страна первого въезда»", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Отправить исправления" }),
      ).toBeEnabled();
      const correctionSave = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/rest/v1/rpc/submit_corrections_handoff"),
        { timeout: 20_000 },
      );
      await page.getByRole("button", { name: "Отправить исправления" }).click();
      const correctionSaveResponse = await correctionSave;
      const correctionSaveBody = await correctionSaveResponse.text();
      expect(
        correctionSaveResponse.ok(),
        `submit_corrections_handoff failed with ${correctionSaveResponse.status()}: ${correctionSaveBody}`,
      ).toBe(true);
      await expect(page.getByText("· Исправления отправлены", { exact: true })).toBeVisible();
      await waitForSyncSmokeStatus(adminClient, "waiting_review", "corrections_received");
      await page.getByRole("button", { name: "Назад" }).click();
      await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();

      await signOut(page);
      await signInSmokeAdmin(page);
      await openSyncSmokeSubmission(page, syncSmokeSubmissionId);
      await openSyncSmokeReviewDrawer(page);
      await openDrawerIssuesSection(page);
      await expect(drawer(page).getByText("Исправлено агентом")).toBeVisible();
      await page.getByRole("button", { name: "Принять на выгрузку" }).click();
      await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
      await waitForSyncSmokeStatus(adminClient, "ready_for_excel", "ready_for_export");
    } finally {
      await resetSyncSmokeSubmission();
    }
  });
});
