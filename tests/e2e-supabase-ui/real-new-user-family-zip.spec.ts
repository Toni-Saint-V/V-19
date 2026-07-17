import { createHash, randomBytes } from "node:crypto";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import JSZip from "jszip";

import { testArtifactPath } from "../support/artifacts";
import { EXPECTED_EXPORT_CONTRACT_HEADERS } from "../../src/lib/export/exportContractCore";
import { parseExportWorkbookBlob } from "../../src/lib/export/exportWorkbookCore";
import { extractPdfTextFromFile } from "../../src/modules/submissions/pdfTextExtraction";
import {
  assertNoOverflow,
  clickAndWaitForSupabaseWrite,
  clickFirstVisible,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  isVisible,
  openCreateSubmission,
  openDrawerTab,
  openSubmissionById,
  signIn,
  signOut,
} from "./ui-helpers";

type MailTmAccount = {
  address: string;
  id: string;
  password: string;
  token: string;
};

type ApplicantInput = {
  birthDate: string;
  birthPlace: string;
  firstName: string;
  gender: "Женский" | "Мужской";
  issueDate: string;
  passportExpiry: string;
  passportNumber: string;
  surname: string;
};

type Evidence = {
  applicationId: string;
  browserProblems: string[];
  documents: {
    expected: string[];
    found: string[];
    hashesMatched: boolean;
    signaturesValid: boolean;
  };
  roles: {
    adminAccepted: boolean;
    adminSawSubmission: boolean;
    agentAdminNavigationHidden: boolean;
    agentEdgeAdminAttemptStatus: number;
    foreignSubmissionsVisibleBeforeCreation: boolean;
  };
  runId: string;
  sandbox: {
    projectRef: string;
    releaseEnabled: false;
  };
  statuses: {
    afterAdminCheck: string;
    afterAcceptance: string;
    afterExport: string;
    afterSubmission: string;
    beforeSubmission: string;
  };
  testUserEmail: string;
  viewports: Array<{ height: number; surface: string; width: number }>;
  workbook: {
    dimension: string;
    fields: Array<{ actual: string; expected: string; field: string }>;
    logicalDataRows: number;
    sheetName: string;
  };
  zip: {
    createdAt: string;
    entries: string[];
    fileCount: number;
    fileName: string;
    path: string;
    sizeBytes: number;
  };
};

const mailTmOrigin = "https://api.mail.tm";
const phone = "+7 900 111-22-33";
const tripStart = "15.01.2027";
const tripEnd = "22.01.2027";
const sourceDocuments = [
  "E2E_TEST_PERSON_ONE_910000001.png",
  "селфи_И1.png",
  "селфи_И2.png",
  "E2E_TEST_PERSON_TWO_910000002.png",
  "селфи_М1.png",
  "селфи_М2.png",
] as const;
const applicants: ApplicantInput[] = [
  {
    birthDate: "01.01.1990",
    birthPlace: "TEST CITY",
    firstName: "TEST",
    gender: "Мужской",
    issueDate: "01.01.2024",
    passportExpiry: "01.01.2034",
    passportNumber: "910000001",
    surname: "PERSON ONE",
  },
  {
    birthDate: "02.02.1992",
    birthPlace: "SAMPLE CITY",
    firstName: "TEST",
    gender: "Женский",
    issueDate: "15.05.2024",
    passportExpiry: "15.05.2034",
    passportNumber: "910000002",
    surname: "PERSON TWO",
  },
];

function readSmokeEnv() {
  const values: Record<string, string> = {};
  const raw = requireSmokeFile();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function requireSmokeFile() {
  const path = resolve(process.cwd(), ".env.supabase-smoke.local");
  return readFileSync(path, "utf8");
}

async function mailTmRequest<T>(
  path: string,
  input: {
    body?: unknown;
    method?: string;
    token?: string;
  } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`${mailTmOrigin}${path}`, {
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        headers: {
          accept: "application/ld+json, application/json",
          ...(input.body === undefined ? {} : { "content-type": "application/json" }),
          ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        },
        method: input.method ?? (input.body === undefined ? "GET" : "POST"),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        throw new Error(
          `mail.tm ${input.method ?? "GET"} ${path} failed with ${response.status}`,
        );
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 4)
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`mail.tm ${path} failed.`);
}

function collectionMembers<T>(collection: unknown): T[] {
  if (Array.isArray(collection)) return collection as T[];
  if (!collection || typeof collection !== "object") return [];
  const candidate = collection as {
    "hydra:member"?: T[];
    member?: T[];
  };
  return candidate["hydra:member"] ?? candidate.member ?? [];
}

async function createMailTmAccount(label: string): Promise<MailTmAccount> {
  const domains = await mailTmRequest<unknown>("/domains?page=1");
  const domain = collectionMembers<{ domain: string; isActive: boolean }>(domains).find(
    (candidate) => candidate.isActive,
  )?.domain;
  if (!domain) throw new Error("mail.tm returned no active domain.");

  const suffix = `${Date.now()}-${randomBytes(5).toString("hex")}`;
  const address = `v19-${label}-${suffix}@${domain}`.toLowerCase();
  const password = `Mail-${randomBytes(18).toString("base64url")}!`;
  const account = await mailTmRequest<{ address: string; id: string }>("/accounts", {
    body: { address, password },
  });
  const auth = await mailTmRequest<{ token: string }>("/token", {
    body: { address, password },
  });

  return { address: account.address, id: account.id, password, token: auth.token };
}

async function deleteMailTmAccount(account: MailTmAccount) {
  await mailTmRequest<void>(`/accounts/${account.id}`, {
    method: "DELETE",
    token: account.token,
  }).catch(() => undefined);
}

function htmlDecode(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#x3D;", "=")
    .replaceAll("&#61;", "=");
}

function inviteTokenFromMessage(message: { html?: string[] | string; text?: string }) {
  const html = Array.isArray(message.html)
    ? message.html.join("\n")
    : (message.html ?? "");
  const body = htmlDecode(`${html}\n${message.text ?? ""}`);
  const urls = body.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

  for (const candidate of urls) {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/, ""));
      const type = url.searchParams.get("type");
      const tokenHash =
        url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      if (type === "invite" && tokenHash) return tokenHash;

      const redirect = url.searchParams.get("redirect_to");
      if (redirect) {
        const redirectUrl = new URL(redirect);
        const nestedType = redirectUrl.searchParams.get("type");
        const nestedToken =
          redirectUrl.searchParams.get("token_hash") ??
          redirectUrl.searchParams.get("token");
        if (nestedType === "invite" && nestedToken) return nestedToken;
      }
    } catch {
      // Ignore unrelated malformed URLs in the email footer.
    }
  }

  return null;
}

async function waitForInviteToken(account: MailTmAccount): Promise<string> {
  const deadline = Date.now() + 180_000;
  const seen = new Set<string>();

  while (Date.now() < deadline) {
    const list = await mailTmRequest<unknown>("/messages?page=1", {
      token: account.token,
    });

    for (const item of collectionMembers<{ id: string; subject?: string }>(list)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const message = await mailTmRequest<{ html?: string[] | string; text?: string }>(
        `/messages/${item.id}`,
        { token: account.token },
      );
      const token = inviteTokenFromMessage(message);
      if (token) return token;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }

  throw new Error(`Supabase invite email did not arrive for ${account.address}.`);
}

async function clearBrowserState(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
  });
  await page.reload();
}

async function ensureLoginMode(page: Page) {
  const heading = page.getByRole("heading", { level: 1, name: "Вход" });
  if (await isVisible(heading)) return;
  const back = page.getByRole("button", {
    name: /^(Уже есть доступ\? Войти|Вернуться ко входу)$/,
  });
  if (await isVisible(back.first())) await clickFirstVisible(back);
  await expect(heading).toBeVisible();
}

async function submitAccessRequest(page: Page, email: string, label: string) {
  await clearBrowserState(page);
  await ensureLoginMode(page);
  await page.getByRole("button", { name: "Запросить доступ" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Заявка на доступ" }),
  ).toBeVisible();
  await page.getByLabel("Имя и фамилия").fill(`TEST AGENT ${label}`);
  await page.getByLabel("Агентство / компания").fill("V19 REAL E2E LAB");
  await page.getByLabel("Город").fill("Москва");
  await page.getByLabel("Телефон").fill(phone);
  await page.getByLabel("Email").fill(email);
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0);

  const submitButton = page.getByRole("button", { name: "Подать заявку на доступ" });
  let response: Awaited<ReturnType<Page["waitForResponse"]>> | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const edgeResponse = page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" &&
          candidate.url().includes("/functions/v1/access-request"),
        { timeout: 30_000 },
      );
      await submitButton.click();
      response = await edgeResponse;
      break;
    } catch (error) {
      lastError = error;
      await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    }
  }
  if (!response) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Access-request submit returned no response.");
  }
  const responseBody = await response.text();
  expect(
    response.status(),
    `public access-request submit must succeed: ${responseBody}`,
  ).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ожидает подтверждения" }),
  ).toBeVisible();
  await expect(page.getByText("Статус: pending · роль agent")).toBeVisible();
}

async function approveAccessRequest(page: Page, email: string) {
  await clickWorkspaceButton(page, /Настройки/);
  const queueButton = page
    .locator("button:visible")
    .filter({ hasText: "Входящие заявки на регистрацию" });
  await expect(queueButton.first()).toBeVisible({ timeout: 30_000 });
  await queueButton.first().click();
  await expect(
    page
      .getByTestId("admin-access-queue")
      .or(page.getByTestId("admin-users-access-requests")),
  ).toBeVisible();

  const settingsRow = page.locator(".settings-access-row").filter({ hasText: email });
  const workspaceRow = page
    .getByTestId("admin-users-access-requests")
    .locator("article")
    .filter({ hasText: email });
  const row = (await isVisible(settingsRow.first()))
    ? settingsRow.first()
    : workspaceRow.first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/functions/v1/access-request"),
    { timeout: 45_000 },
  );
  const [response] = await Promise.all([
    responsePromise,
    row.getByRole("button", { name: "Одобрить" }).click(),
  ]);
  const responseBody = await response.text();
  expect(
    response.status(),
    `admin approval must succeed for ${email}: ${responseBody}`,
  ).toBe(200);
  await page.waitForTimeout(1_000);
  if (await isVisible(row)) {
    await page.reload();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^(Проверка|Очередь на проверку|Работа|Системные настройки)$/,
      }),
    ).toBeVisible({ timeout: 45_000 });
    await clickWorkspaceButton(page, /Настройки/);
    const refreshedQueueButton = page
      .locator("button:visible")
      .filter({ hasText: "Входящие заявки на регистрацию" });
    await expect(refreshedQueueButton.first()).toBeVisible({ timeout: 30_000 });
    await refreshedQueueButton.first().click();
    await expect(
      page.locator(".settings-access-row").filter({ hasText: email }),
    ).toHaveCount(0);
  }
}

async function activateInviteAndLogin(
  page: Page,
  email: string,
  tokenHash: string,
  password: string,
) {
  const pendingLogout = page.getByRole("button", { name: /^Выйти$/ });
  if (await isVisible(pendingLogout.first())) await clickFirstVisible(pendingLogout);
  await page.goto(`/?token_hash=${encodeURIComponent(tokenHash)}&type=invite`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Создайте пароль" }),
  ).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await page.getByLabel("Новый пароль").fill(password);
  await page.getByLabel("Повторите пароль").fill(password);
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("status")).toContainText("Пароль сохранён");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/auth\/v1\/token\?grant_type=password/.test(response.url()),
    { timeout: 45_000 },
  );
  const [response] = await Promise.all([
    loginResponse,
    page.getByRole("button", { name: /Войти/ }).click(),
  ]);
  expect(response.status(), "new Supabase Auth password login must succeed").toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: /^(Мои действия|Мои подачи)$/ }),
  ).toBeVisible({ timeout: 45_000 });
}

async function clickQuestionnaireSection(
  questionnaire: Locator,
  name: RegExp | string,
) {
  const sections = questionnaire
    .locator(".v19-questionnaire-section-tab")
    .filter({ hasText: name });
  await clickFirstVisible(sections);
  await expect(questionnaire.locator(".v19-questionnaire-work-panel")).toBeVisible();
}

async function questionnaireField(questionnaire: Locator, label: string) {
  const panel = questionnaire.locator(".v19-questionnaire-work-panel");
  const field = panel
    .locator("[data-field-label]")
    .filter({ has: panel.getByText(label, { exact: true }) });
  const exact = panel
    .locator(`[data-field-label="${label.replaceAll('"', '\\"')}"]`)
    .first();
  return (await exact.count()) > 0 ? exact : field.first();
}

async function fillQuestionnaireField(
  questionnaire: Locator,
  label: string,
  value: string,
) {
  const field = await questionnaireField(questionnaire, label);
  await expect(field).toBeVisible();
  const control = field
    .locator("input:not([readonly]), textarea:not([readonly])")
    .first();
  await expect(control).toBeVisible();
  await control.fill(value);
  await control.press("Tab");
}

async function chooseQuestionnaireField(
  questionnaire: Locator,
  label: string,
  value: string,
) {
  const field = await questionnaireField(questionnaire, label);
  await expect(field).toBeVisible();
  const quick = field.getByRole("button", { exact: true, name: value });
  if (await isVisible(quick.first())) {
    await clickFirstVisible(quick);
    return;
  }

  const dropdown = field.locator("button.v19-questionnaire-field-control").first();
  await expect(dropdown).toBeVisible();
  await dropdown.click();
  const search = field.getByRole("textbox", { name: `Поиск: ${label}` });
  if (await isVisible(search)) await search.fill(value);
  const option = field
    .locator(".v19-questionnaire-dropdown-option")
    .filter({ hasText: value });
  await expect(option.first()).toBeVisible();
  await option.first().click();
}

async function fillApplicantQuestionnaire(
  questionnaire: Locator,
  applicantIndex: number,
  input: ApplicantInput,
  email: string,
) {
  const applicantTabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
  await expect(applicantTabs).toHaveCount(2);
  await applicantTabs.nth(applicantIndex).click();

  await clickQuestionnaireSection(questionnaire, /Запись/);
  await chooseQuestionnaireField(questionnaire, "Город подачи", "Москва");
  await chooseQuestionnaireField(questionnaire, "Тип визы", "Шенгенская");
  await chooseQuestionnaireField(questionnaire, "Категория обслуживания", "Normal");
  await fillQuestionnaireField(questionnaire, "Желаемая дата 1", "10.12.2026");
  await fillQuestionnaireField(
    questionnaire,
    "Примечание",
    "REAL E2E FAMILY APPLICATION",
  );

  await clickQuestionnaireSection(questionnaire, /Личные данные/);
  await fillQuestionnaireField(questionnaire, "Фамилия", input.surname);
  await fillQuestionnaireField(questionnaire, "Имя", input.firstName);
  await fillQuestionnaireField(questionnaire, "Дата рождения", input.birthDate);
  await fillQuestionnaireField(questionnaire, "Место рождения", input.birthPlace);
  await chooseQuestionnaireField(
    questionnaire,
    "Страна рождения",
    "Russian Federation",
  );
  await chooseQuestionnaireField(
    questionnaire,
    "Текущее гражданство",
    "Russian Federation",
  );
  await chooseQuestionnaireField(questionnaire, "Пол", input.gender);
  await chooseQuestionnaireField(
    questionnaire,
    "Семейное положение",
    "Холост/не замужем",
  );

  await clickQuestionnaireSection(questionnaire, /^Паспорт$/);
  await chooseQuestionnaireField(questionnaire, "Тип документа", "Ordinary Passport");
  await fillQuestionnaireField(questionnaire, "Номер паспорта", input.passportNumber);
  await fillQuestionnaireField(questionnaire, "Дата выдачи", input.issueDate);
  await fillQuestionnaireField(questionnaire, "Действителен до", input.passportExpiry);
  await chooseQuestionnaireField(questionnaire, "Страна выдачи", "Russian Federation");
  await fillQuestionnaireField(questionnaire, "Место выдачи", input.birthPlace);

  await clickQuestionnaireSection(questionnaire, /Адрес и контакты/);
  await fillQuestionnaireField(questionnaire, "Домашний адрес", "TEST STREET 1");
  await fillQuestionnaireField(questionnaire, "Email", email);
  await fillQuestionnaireField(questionnaire, "Телефон", phone);
  await chooseQuestionnaireField(
    questionnaire,
    "Страна проживания",
    "Russian Federation",
  );
  await fillQuestionnaireField(questionnaire, "Город проживания", "MOSCOW");
  await fillQuestionnaireField(questionnaire, "Почтовый индекс", "101000");
  await chooseQuestionnaireField(
    questionnaire,
    "Проживание не в стране гражданства",
    "Нет",
  );

  await clickQuestionnaireSection(questionnaire, /Работа \/ учеба/);
  await chooseQuestionnaireField(questionnaire, "Профессия", "IT PROFESSIONAL");
  await fillQuestionnaireField(
    questionnaire,
    "Работодатель / учебное заведение",
    "E2E TEST LAB",
  );
  await fillQuestionnaireField(
    questionnaire,
    "Телефон работодателя / учебного заведения",
    "+7 900 222-33-44",
  );
  await fillQuestionnaireField(
    questionnaire,
    "Адрес работодателя / учебного заведения",
    "E2E OFFICE STREET 2",
  );

  await clickQuestionnaireSection(questionnaire, /^Поездка$/);
  await chooseQuestionnaireField(questionnaire, "Цель поездки", "TOURISM");
  await fillQuestionnaireField(
    questionnaire,
    "Дополнительные сведения о цели",
    "REAL E2E TOURISM",
  );
  await chooseQuestionnaireField(questionnaire, "Основная страна назначения", "Spain");
  await chooseQuestionnaireField(questionnaire, "Страна первого въезда", "Spain");
  await chooseQuestionnaireField(questionnaire, "Количество въездов", "Однократная");
  await fillQuestionnaireField(questionnaire, "Дата въезда", tripStart);
  await fillQuestionnaireField(questionnaire, "Дата выезда", tripEnd);
  await fillQuestionnaireField(questionnaire, "Длительность пребывания", "7");
  await chooseQuestionnaireField(questionnaire, "Отпечатки ранее сдавались", "Нет");

  await clickQuestionnaireSection(questionnaire, /Отель \/ приглашение/);
  await chooseQuestionnaireField(
    questionnaire,
    "Тип принимающей стороны",
    "Гостиница/временное жилье",
  );
  await fillQuestionnaireField(
    questionnaire,
    "ФИО приглашающего лица или название отеля",
    "HOTEL E2E MADRID",
  );
  await fillQuestionnaireField(questionnaire, "Адрес", "CALLE TEST 10, MADRID");
  await chooseQuestionnaireField(questionnaire, "Страна", "Spain");
  await fillQuestionnaireField(questionnaire, "Город", "Madrid");
  await fillQuestionnaireField(questionnaire, "Почтовый индекс", "28001");
  await fillQuestionnaireField(questionnaire, "Email", "hotel.e2e@example.test");
  await fillQuestionnaireField(questionnaire, "Телефон", "+34 600 123 456");

  await clickQuestionnaireSection(questionnaire, /Оплата поездки/);
  await chooseQuestionnaireField(
    questionnaire,
    "Кто оплачивает поездку",
    "Сам заявитель",
  );
  await chooseQuestionnaireField(questionnaire, "Средства заявителя", "Наличные");
}

async function uploadApplicantSelfies(
  page: Page,
  questionnaire: Locator,
  applicantIndex: number,
  paths: [string, string],
) {
  const applicantTabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
  await applicantTabs.nth(applicantIndex).click();
  await clickQuestionnaireSection(questionnaire, /^Файлы$/);

  for (const [index, label] of ["Селфи 1", "Селфи 2"].entries()) {
    const slot = questionnaire
      .locator(".v19-questionnaire-file-slot")
      .filter({ hasText: label });
    const input = slot.locator('input[type="file"]');
    await expect(input).toBeVisible();
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() !== "GET" &&
        candidate.request().method() !== "HEAD" &&
        /\/(?:storage\/v1|rest\/v1)\//.test(candidate.url()) &&
        candidate.status() >= 200 &&
        candidate.status() < 300,
      { timeout: 45_000 },
    );
    await input.setInputFiles(paths[index]!);
    await response;
    await expect(slot).toContainText(basename(paths[index]!), { timeout: 45_000 });
    await expect(input).toHaveCount(0, { timeout: 45_000 });
  }
}

async function visibleStatus(root: Locator, expected: RegExp) {
  const text = await root.innerText();
  const match = text.match(expected);
  if (!match)
    throw new Error(`Expected status ${expected} was absent from visible UI.`);
  return match[0];
}

async function openQuestionnaireFromDrawer(page: Page) {
  await openDrawerTab(page, /Анкета/);
  const open = drawer(page).getByRole("button", { name: "Открыть анкету" });
  await clickFirstVisible(open);
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  return questionnaire;
}

async function createFamilyDraft(page: Page, passportPaths: [string, string]) {
  await openCreateSubmission(page);
  const create = drawer(page);
  await create.getByRole("button", { name: "Семья" }).click();
  await create.locator(".pi-file-input").setInputFiles(passportPaths);
  const submit = create.getByRole("button", { name: "Создать и открыть анкету" });
  await expect(submit).toBeEnabled({ timeout: 90_000 });
  await clickAndWaitForSupabaseWrite(
    page,
    () => submit.click(),
    /\/rest\/v1\/rpc\/save_submission_draft$/,
  );
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible({ timeout: 45_000 });
  const applicationId = await questionnaire.getAttribute("data-submission-id");
  if (!applicationId)
    throw new Error("New application id is absent from questionnaire UI.");
  return { applicationId, questionnaire };
}

async function unauthorizedAdminAttempt(
  page: Page,
  functionUrl: string,
  publishableKey: string,
) {
  return page.evaluate(
    async ({ edgeUrl, key }) => {
      const authStorageKey = Object.keys(localStorage).find((candidate) =>
        candidate.endsWith("-auth-token"),
      );
      if (!authStorageKey) return { body: "AUTH_STORAGE_MISSING", status: 0 };
      const raw = localStorage.getItem(authStorageKey);
      const parsed = raw ? (JSON.parse(raw) as { access_token?: string }) : null;
      if (!parsed?.access_token) return { body: "ACCESS_TOKEN_MISSING", status: 0 };
      const response = await fetch(edgeUrl, {
        body: JSON.stringify({
          action: "approve",
          id: "00000000-0000-0000-0000-000000000000",
        }),
        headers: {
          apikey: key,
          authorization: `Bearer ${parsed.access_token}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      return { body: await response.text(), status: response.status };
    },
    { edgeUrl: functionUrl, key: publishableKey },
  );
}

async function clearExportSelection(page: Page) {
  const checked = page.locator(
    '.v19-admin-export-row input[type="checkbox"]:checked, .export-row input[type="checkbox"]:checked',
  );
  while ((await checked.count()) > 0) {
    await checked.first().uncheck();
  }
}

async function sha256(bytes: Uint8Array | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngSignatureValid(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((byte, index) => bytes[index] === byte);
}

function workbookValue(headers: string[], row: string[], header: string) {
  const index = headers.indexOf(header);
  if (index < 0) throw new Error(`Workbook header is absent: ${header}`);
  return row[index] ?? "";
}

async function inspectGeneratedZip(
  zipPath: string,
  applicationId: string,
  ownerEmail: string,
  sourcePaths: string[],
): Promise<Pick<Evidence, "documents" | "workbook" | "zip">> {
  const bytes = await readFile(zipPath);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort();
  expect(entries).toHaveLength(11);
  expect(
    entries.every((name) => !name.startsWith("/") && !name.split("/").includes("..")),
  ).toBe(true);

  const manifestName = entries.find((name) => name.endsWith("/manifest.json"));
  const workbookName = entries.find((name) => name.endsWith(".xlsx"));
  const readmeName = entries.find((name) => name.endsWith("/README_ПАКЕТ.txt"));
  if (!manifestName || !workbookName || !readmeName) {
    throw new Error("ZIP is missing manifest, XLSX, or README.");
  }

  const manifest = JSON.parse(await zip.file(manifestName)!.async("string")) as {
    applicantCount: number;
    documentEntries: string[];
    fileCount: number;
    package: { submissionIds: string[] };
    requiredDocumentTypes: string[];
    submissions: Array<{
      applicants: Array<{ name: string }>;
      id: string;
      type: string;
    }>;
  };
  expect(manifest.applicantCount).toBe(2);
  expect(manifest.fileCount).toBe(4);
  expect(manifest.documentEntries).toHaveLength(4);
  expect(manifest.package.submissionIds).toEqual([applicationId]);
  expect(manifest.submissions).toHaveLength(1);
  expect(manifest.submissions[0]?.id).toBe(applicationId);
  expect(manifest.submissions[0]?.type).toBe("family");
  expect(
    manifest.submissions[0]?.applicants.map((applicant) => applicant.name),
  ).toEqual(["TEST PERSON ONE", "TEST PERSON TWO"]);
  expect(manifest.requiredDocumentTypes).toEqual([
    "passport_scan",
    "selfie_1",
    "selfie_2",
  ]);
  expect(entries.filter((name) => name.endsWith("_visa_form.pdf"))).toHaveLength(0);
  expect(entries.filter((name) => name.endsWith(".png"))).toHaveLength(4);

  const sourceHashByName = new Map<string, string>();
  for (const sourcePath of sourcePaths) {
    sourceHashByName.set(
      basename(sourcePath),
      await sha256(await readFile(sourcePath)),
    );
  }
  const foundHashes = new Set<string>();
  let signaturesValid = true;
  for (const entry of entries.filter((name) => name.endsWith(".png"))) {
    const entryBytes = await zip.file(entry)!.async("uint8array");
    expect(entryBytes.byteLength).toBeGreaterThan(0);
    signaturesValid &&= pngSignatureValid(entryBytes);
    foundHashes.add(await sha256(entryBytes));
  }
  const expectedHashes = new Set(sourceHashByName.values());
  expect(foundHashes).toEqual(expectedHashes);
  expect(signaturesValid).toBe(true);

  const workbookBytes = await zip.file(workbookName)!.async("uint8array");
  expect(workbookBytes.byteLength).toBeGreaterThan(1_000);
  expect(String.fromCharCode(workbookBytes[0]!, workbookBytes[1]!)).toBe("PK");
  const parsed = await parseExportWorkbookBlob(
    new Blob(
      [
        workbookBytes.buffer.slice(
          workbookBytes.byteOffset,
          workbookBytes.byteOffset + workbookBytes.byteLength,
        ) as ArrayBuffer,
      ],
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ),
  );
  expect(parsed.sheetName).toBe("Sheet1");
  expect(parsed.dimension).toBe("A1:BD3");
  const headers = parsed.rows[0]?.slice(0, 56) ?? [];
  expect(headers).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);
  const dataRows = parsed.rows
    .slice(1)
    .filter((row) =>
      applicants.some((applicant) => row.includes(applicant.passportNumber)),
    );
  expect(dataRows).toHaveLength(2);

  const workbookFields: Evidence["workbook"]["fields"] = [];
  for (const [index, applicant] of applicants.entries()) {
    const row = dataRows.find((candidate) =>
      candidate.includes(applicant.passportNumber),
    );
    if (!row) throw new Error(`Workbook row missing for ${applicant.passportNumber}.`);
    const expectedFields: Array<[string, string]> = [
      ["Applicant Email", ownerEmail],
      ["Applicant Mobile(10 Digit, No space or -,leading zero)", "9001112233"],
      ["Passport No", applicant.passportNumber],
      ["Surname (Family Name)", applicant.surname],
      ["FirstName", applicant.firstName],
      ["Date of Birth(YYYY-MM-DD)", index === 0 ? "1990-01-01" : "1992-02-02"],
      ["Passport Issue Date(YYYY-MM-DD)", index === 0 ? "2024-01-01" : "2024-05-15"],
      ["Passport Expiry Date(YYYY-MM-DD)", index === 0 ? "2034-01-01" : "2034-05-15"],
      ["Purpose of journey", "TOURISM"],
      ["Intended Date Of Arrival", "2027-01-15"],
      ["Intended Date Of Departure", "2027-01-22"],
      ["Inviting Company Name", "HOTEL E2E MADRID"],
      ["Inviting Company Country", "Spain"],
      ["Inviting Company City", "Madrid"],
      ["Inviting Company Zip Code", "28001"],
      ["Gender(Male/Female)", index === 0 ? "Male" : "Female"],
      ["Marital Status(Single/Married)", "Single"],
      ["Cost Covered By(Sponsor/Applicant)", "Applicant"],
      [
        "Means Of Support(Accommodation Provided/All expenses covered/Cash/CreditCard)",
        "Cash",
      ],
      [
        "Appointment Type(For Family, applicant email and contact number should be same for all family members)",
        "FAMILY",
      ],
    ];
    for (const [field, expected] of expectedFields) {
      const actual = workbookValue(headers, row, field);
      expect(actual).toBe(expected);
      workbookFields.push({ actual, expected, field });
    }
  }
  expect(workbookValue(headers, dataRows[0]!, "Applicant Email")).toBe(
    workbookValue(headers, dataRows[1]!, "Applicant Email"),
  );

  for (const pdfName of entries.filter((name) => name.endsWith("_visa_form.pdf"))) {
    const pdfBytes = await zip.file(pdfName)!.async("uint8array");
    expect(new TextDecoder().decode(pdfBytes.slice(0, 8))).toBe("%PDF-1.4");
    const pdfFile = new File(
      [
        pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength,
        ) as ArrayBuffer,
      ],
      basename(pdfName),
      {
        type: "application/pdf",
      },
    ) as unknown as globalThis.File;
    const extraction = await extractPdfTextFromFile(pdfFile);
    expect(extraction.pageCount).toBe(4);
    expect(extraction.source).toBe("text_layer");
    expect(extraction.text).toContain("APPLICATION FOR SCHENGEN VISA");
    expect(extraction.text).toContain("HOTEL E2E MADRID");
    expect(
      applicants.some((applicant) =>
        extraction.text.includes(applicant.passportNumber),
      ),
    ).toBe(true);
  }

  const fileStat = await stat(zipPath);
  return {
    documents: {
      expected: [...sourceDocuments],
      found: entries.filter((name) => name.endsWith(".png")),
      hashesMatched: true,
      signaturesValid,
    },
    workbook: {
      dimension: parsed.dimension,
      fields: workbookFields,
      logicalDataRows: dataRows.length,
      sheetName: parsed.sheetName,
    },
    zip: {
      createdAt: fileStat.birthtime.toISOString(),
      entries,
      fileCount: entries.length,
      fileName: basename(zipPath),
      path: zipPath,
      sizeBytes: fileStat.size,
    },
  };
}

async function newContextPage(browser: Browser) {
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  const page = await context.newPage();
  return { context, page };
}

async function signInAdminWithRetry(page: Page) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await signIn(page, "admin");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await page.waitForTimeout(1_500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Admin login failed.");
}

test.describe("real new-user Supabase family application ZIP", () => {
  test("creates users, submits one new family, accepts it, and verifies the generated ZIP", async ({
    browser,
  }) => {
    test.setTimeout(900_000);
    const runId = `real-e2e-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const outputDir = testArtifactPath("real-supabase-e2e", runId);
    await mkdir(outputDir, { recursive: true });
    const docsDir = resolve(process.cwd(), "tests", "fixtures", "production-media");
    const sourcePaths = sourceDocuments.map((name) => resolve(docsDir, name));
    for (const path of sourcePaths) expect((await stat(path)).size).toBeGreaterThan(0);

    const env = readSmokeEnv();
    const projectRef = env.VITE_SUPABASE_PROJECT_ID;
    expect(projectRef).toBe("oevvaowoklqttqkraxho");
    expect(env.VITE_SUPABASE_RELEASE_ENABLED ?? "false").not.toBe("true");
    const functionUrl = `${(env.VITE_SUPABASE_EDGE_FUNCTIONS_URL || env.VITE_SUPABASE_URL).replace(/\/$/, "")}/access-request`;
    const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    expect(publishableKey).toBeTruthy();

    const ownerMailbox = await createMailTmAccount("owner");
    const ownerPassword = `Owner-${randomBytes(18).toString("base64url")}!`;
    const owner = await newContextPage(browser);
    const admin = await newContextPage(browser);
    const ownerProblems = collectBrowserProblems(owner.page);
    const adminProblems = collectBrowserProblems(admin.page);
    let applicationId = "";

    try {
      await submitAccessRequest(owner.page, ownerMailbox.address, "OWNER");

      await signInAdminWithRetry(admin.page);
      await approveAccessRequest(admin.page, ownerMailbox.address);
      const ownerInviteToken = await waitForInviteToken(ownerMailbox);
      await activateInviteAndLogin(
        owner.page,
        ownerMailbox.address,
        ownerInviteToken,
        ownerPassword,
      );

      await expect(
        owner.page.getByRole("button", { name: /Проверка|Выгрузка/ }),
      ).toHaveCount(0);
      await clickWorkspaceButton(owner.page, /Мои подачи/);
      await expect(owner.page.locator("[data-submission-id]")).toHaveCount(0);
      const agentEdgeAttempt = await unauthorizedAdminAttempt(
        owner.page,
        functionUrl,
        publishableKey,
      );
      expect(agentEdgeAttempt.status).toBe(403);
      expect(agentEdgeAttempt.body).toContain("ADMIN_REQUIRED");

      await owner.page.setViewportSize({ height: 844, width: 390 });
      const created = await createFamilyDraft(owner.page, [
        sourcePaths[0]!,
        sourcePaths[3]!,
      ]);
      applicationId = created.applicationId;
      const questionnaire = created.questionnaire;
      await fillApplicantQuestionnaire(
        questionnaire,
        0,
        applicants[0]!,
        ownerMailbox.address,
      );
      await uploadApplicantSelfies(owner.page, questionnaire, 0, [
        sourcePaths[1]!,
        sourcePaths[2]!,
      ]);
      await fillApplicantQuestionnaire(
        questionnaire,
        1,
        applicants[1]!,
        ownerMailbox.address,
      );
      await uploadApplicantSelfies(owner.page, questionnaire, 1, [
        sourcePaths[4]!,
        sourcePaths[5]!,
      ]);
      await assertNoOverflow(owner.page);
      await owner.page.screenshot({
        fullPage: true,
        path: resolve(outputDir, "mobile-390-questionnaire-files.png"),
      });

      const saveDraft = questionnaire.getByRole("button", {
        name: "Черновик",
        exact: true,
      });
      await clickAndWaitForSupabaseWrite(
        owner.page,
        () => saveDraft.click(),
        /\/rest\/v1\/rpc\/save_submission_draft$/,
      );
      await questionnaire.getByRole("button", { name: "Назад" }).click();
      await expect(questionnaire).toHaveCount(0);
      if (!(await isVisible(drawer(owner.page)))) {
        await clickWorkspaceButton(owner.page, /Мои подачи/);
        await openSubmissionById(owner.page, applicationId);
      }
      const beforeSubmission = await visibleStatus(
        drawer(owner.page),
        /Черновик|В работе|Готово к отправке/,
      );
      await owner.page.screenshot({
        fullPage: true,
        path: resolve(outputDir, "mobile-390-before-submit.png"),
      });

      const reopenedQuestionnaire = await openQuestionnaireFromDrawer(owner.page);
      const complete = reopenedQuestionnaire.getByRole("button", {
        name: /Отправить на проверку|Отправить/,
      });
      await expect(complete).toBeEnabled({ timeout: 60_000 });
      await clickAndWaitForSupabaseWrite(
        owner.page,
        () => complete.click(),
        /\/rest\/v1\/rpc\/save_submission_draft$/,
      );
      await reopenedQuestionnaire.getByRole("button", { name: "Назад" }).click();
      await expect(reopenedQuestionnaire).toHaveCount(0);
      await owner.page.setViewportSize({ height: 932, width: 430 });
      const afterSubmission = await visibleStatus(
        drawer(owner.page),
        /На проверке|Отправлено на проверку/,
      );
      await assertNoOverflow(owner.page);
      await owner.page.screenshot({
        fullPage: true,
        path: resolve(outputDir, "mobile-430-after-submit-status.png"),
      });

      await clickWorkspaceButton(admin.page, /Проверка|Работа/);
      await openSubmissionById(admin.page, applicationId);
      const afterAdminCheck = await visibleStatus(drawer(admin.page), /На проверке/);
      await openDrawerTab(admin.page, /Анкета/);
      await expect(drawer(admin.page)).toContainText("TEST PERSON ONE");
      await expect(drawer(admin.page)).toContainText("TEST PERSON TWO");
      await expect(drawer(admin.page)).toContainText(ownerMailbox.address);
      await expect(drawer(admin.page)).toContainText("910000001");
      await expect(drawer(admin.page)).toContainText("910000002");
      await openDrawerTab(admin.page, /Файлы/);
      for (const name of sourceDocuments)
        await expect(drawer(admin.page)).toContainText(name);
      await admin.page.screenshot({
        fullPage: true,
        path: resolve(outputDir, "desktop-1440-admin-review.png"),
      });

      await admin.page.setViewportSize({ height: 844, width: 390 });
      await assertNoOverflow(admin.page);
      await openDrawerTab(admin.page, /Анкета/);
      await expect(drawer(admin.page)).toContainText("910000001");
      await admin.page.screenshot({
        fullPage: true,
        path: resolve(outputDir, "mobile-390-admin-review.png"),
      });
      await admin.page.setViewportSize({ height: 900, width: 1440 });

      const accept = drawer(admin.page).locator(".admin-review-primary");
      await expect(accept).toBeEnabled();
      await clickAndWaitForSupabaseWrite(admin.page, () => accept.click());
      const afterAcceptance = await visibleStatus(
        drawer(admin.page),
        /Готово к выгрузке|Готово/,
      );

      await clickWorkspaceButton(admin.page, /Выгрузка/);
      await expect(
        admin.page.getByRole("heading", { level: 1, name: "Выгрузка" }),
      ).toBeVisible();
      await clearExportSelection(admin.page);
      const exportRow = admin.page
        .locator(".v19-admin-export-row, .export-row")
        .filter({ hasText: applicationId })
        .first();
      await expect(exportRow).toBeVisible({ timeout: 30_000 });
      await exportRow.getByRole("checkbox").check();
      const checkedRows = admin.page.locator(
        '.v19-admin-export-row input[type="checkbox"]:checked, .export-row input[type="checkbox"]:checked',
      );
      await expect(checkedRows).toHaveCount(1);

      const preview = admin.page.getByRole("region", { name: "Данные Excel Preview" });
      await expect(preview).toBeVisible();
      const previewTable = preview.getByRole("table", { name: "Excel Preview Sheet1" });
      await expect(previewTable.getByRole("columnheader")).toHaveCount(56);
      await expect(previewTable.getByRole("row")).toHaveCount(3);
      await expect(preview).toContainText(ownerMailbox.address);
      await expect(preview).toContainText("910000001");
      await expect(preview).toContainText("910000002");
      await expect(preview).toContainText("HOTEL E2E MADRID");
      await admin.page.getByRole("button", { name: "Сформировать Excel" }).click();
      await expect(
        admin.page.getByRole("button", { name: "Excel готов" }),
      ).toBeVisible();
      await admin.page.screenshot({
        fullPage: true,
        path: resolve(outputDir, "desktop-1440-excel-preview.png"),
      });

      const zipButton = admin.page.getByRole("button", { name: "Скачать ZIP с Excel" });
      await expect(zipButton).toBeEnabled();
      const downloadPromise = admin.page.waitForEvent("download");
      await zipButton.click();
      const download = await downloadPromise;
      await expect(download.failure()).resolves.toBeNull();
      expect(download.suggestedFilename()).toMatch(
        /^visaflow-export-.+_documents\.zip$/,
      );
      const zipPath = resolve(outputDir, download.suggestedFilename());
      await download.saveAs(zipPath);
      await expect(admin.page.locator("#export-action-hint")).toContainText(
        /ZIP скачан|пакет/i,
        {
          timeout: 45_000,
        },
      );

      await signOut(owner.page);
      await ensureLoginMode(owner.page);
      await owner.page.getByLabel("Email").fill(ownerMailbox.address);
      await owner.page.getByLabel("Пароль", { exact: true }).fill(ownerPassword);
      await owner.page.getByRole("button", { name: /Войти/ }).click();
      await expect(
        owner.page.getByRole("heading", {
          level: 1,
          name: /^(Мои действия|Мои подачи)$/,
        }),
      ).toBeVisible({ timeout: 45_000 });
      await clickWorkspaceButton(owner.page, /Мои подачи/);
      await openSubmissionById(owner.page, applicationId);
      const afterExport = await visibleStatus(
        drawer(owner.page),
        /Выгружено|Экспортировано/,
      );

      const inspected = await inspectGeneratedZip(
        zipPath,
        applicationId,
        ownerMailbox.address,
        sourcePaths,
      );
      const browserProblems = [...ownerProblems(), ...adminProblems()];
      expect(browserProblems).toEqual([]);
      const evidence: Evidence = {
        applicationId,
        browserProblems,
        documents: inspected.documents,
        roles: {
          adminAccepted: true,
          adminSawSubmission: true,
          agentAdminNavigationHidden: true,
          agentEdgeAdminAttemptStatus: agentEdgeAttempt.status,
          foreignSubmissionsVisibleBeforeCreation: false,
        },
        runId,
        sandbox: {
          projectRef,
          releaseEnabled: false,
        },
        statuses: {
          afterAdminCheck,
          afterAcceptance,
          afterExport,
          afterSubmission,
          beforeSubmission,
        },
        testUserEmail: ownerMailbox.address,
        viewports: [
          { height: 844, surface: "agent questionnaire and uploads", width: 390 },
          { height: 932, surface: "agent submit and status", width: 430 },
          { height: 844, surface: "admin review", width: 390 },
          { height: 900, surface: "admin review and export", width: 1440 },
        ],
        workbook: inspected.workbook,
        zip: inspected.zip,
      };
      await writeFile(
        resolve(outputDir, "e2e-evidence.json"),
        `${JSON.stringify(evidence, null, 2)}\n`,
        "utf8",
      );
    } finally {
      await Promise.all([
        owner.context.close(),
        admin.context.close(),
        deleteMailTmAccount(ownerMailbox),
      ]);
    }
  });
});
