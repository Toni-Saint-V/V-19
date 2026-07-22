import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  expect,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

import { testArtifactPath } from "../support/artifacts";
import {
  questionnaireFixturePreferredOption,
  questionnaireFixtureTextValue,
} from "./questionnaire-fixture-values";

type SmokeRole = "agent" | "otherAgent" | "admin";

type SmokeCredentials = {
  email: string;
  password: string;
};

const smokeEnvPath = resolve(
  process.cwd(),
  process.env.SUPABASE_UI_E2E_ENV_FILE ?? ".env.supabase-smoke.local",
);
// The lifecycle fixture intentionally has no MRZ so production exercises the
// documented manual-review fallback instead of relying on an expired passport.
const assetSource = resolve(process.cwd(), "src/assets/export-demo/selfie_1.jpg");
const browserProblemIgnore =
  /ResizeObserver loop|favicon|net::ERR_ABORTED|Download the React DevTools/i;

function loadSmokeEnv(): Record<string, string> {
  if (!existsSync(smokeEnvPath)) {
    throw new Error(".env.supabase-smoke.local is required for the sandbox UI suite.");
  }

  const values: Record<string, string> = {};
  for (const line of readFileSync(smokeEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return values;
}

function requiredValue(name: string): string {
  const value = loadSmokeEnv()[name]?.trim();
  if (!value) throw new Error(`${name} is required for the sandbox UI suite.`);
  return value;
}

export function smokeCredentials(role: SmokeRole): SmokeCredentials {
  const names: Record<SmokeRole, [string, string]> = {
    admin: ["SUPABASE_SMOKE_ADMIN_EMAIL", "SUPABASE_SMOKE_ADMIN_PASSWORD"],
    agent: ["SUPABASE_SMOKE_AGENT_EMAIL", "SUPABASE_SMOKE_AGENT_PASSWORD"],
    otherAgent: [
      "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
      "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
    ],
  };
  const [emailName, passwordName] = names[role];
  return {
    email: requiredValue(emailName),
    password: requiredValue(passwordName),
  };
}

function supabaseOrigin() {
  return new URL(requiredValue("VITE_SUPABASE_URL")).origin;
}

function supabaseEdgeFunctionsOrigin() {
  return new URL(requiredValue("VITE_SUPABASE_EDGE_FUNCTIONS_URL")).origin;
}

export function drawer(page: Page): Locator {
  return page.locator('[role="dialog"]:visible').first();
}

export function collectBrowserProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  return () => problems.filter((problem) => !browserProblemIgnore.test(problem));
}

export function collectSupabaseMutations(page: Page) {
  const mutations: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const isSupabaseApi =
      /\/(?:auth\/v1|rest\/v1|storage\/v1|functions\/v1)(?:\/|$)/.test(url.pathname);

    if (
      !isSupabaseApi ||
      method === "GET" ||
      method === "HEAD" ||
      method === "OPTIONS"
    ) {
      return;
    }

    // Password login is the only expected non-read request in this smoke.
    // All data/storage/function writes remain evidence of an unsafe test.
    if (
      method === "POST" &&
      url.pathname === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "password"
    ) {
      return;
    }

    mutations.push(`${method} ${url.pathname}`);
  });

  return () => mutations;
}

export async function isVisible(locator: Locator) {
  return locator.isVisible({ timeout: 750 }).catch(() => false);
}

export async function clickFirstVisible(locator: Locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await isVisible(candidate)) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await candidate.click({ timeout: 10_000 });
          return;
        } catch (error) {
          if (attempt === 2) throw error;
          await locator.page().waitForTimeout(250);
        }
      }
    }
  }

  throw new Error("No visible control matched the requested UI action.");
}

export async function clickWorkspaceButton(page: Page, name: string | RegExp) {
  const canonicalNavigationLabels = [
    "Проверка",
    "Очередь на проверку",
    "Работа",
    "Выгрузка",
    "Возврат",
    "Мои действия",
    "Мои подачи",
    "Настройки",
  ];
  const exactNavigationLabel = canonicalNavigationLabels.find((label) =>
    typeof name === "string"
      ? label === name
      : new RegExp(name.source, name.flags).test(label),
  );
  const control = page.getByRole(
    "button",
    exactNavigationLabel ? { exact: true, name: exactNavigationLabel } : { name },
  );
  const desktopViewport = (page.viewportSize()?.width ?? 0) >= 768;
  if (desktopViewport && (await isVisible(control.first()))) {
    await clickFirstVisible(control);
    return;
  }

  const adminMenu = page
    .getByRole("button", { name: "Открыть меню администратора" })
    .first();
  if (await isVisible(adminMenu)) {
    const dialog = page.getByRole("dialog", { name: "Меню администратора" });
    await expect(adminMenu).toHaveAttribute("aria-expanded", "false");
    await expect(dialog).toBeHidden();
    await adminMenu.click();
    await expect(dialog).toBeVisible();
    await clickFirstVisible(
      dialog.getByRole(
        "button",
        exactNavigationLabel ? { exact: true, name: exactNavigationLabel } : { name },
      ),
    );
    await expect(dialog).toBeHidden();
    await expect(adminMenu).toHaveAttribute("aria-expanded", "false");
    return;
  }

  const menu = page
    .getByRole("button", {
      name: /^(Меню|Открыть меню)$/,
    })
    .first();
  const agentDialog = page.getByRole("dialog", { name: "Меню агента" });
  if (await isVisible(menu)) {
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(agentDialog).toBeHidden();
    await menu.click();
    await expect(agentDialog).toBeVisible();
  }
  const navigationScope = (await isVisible(agentDialog)) ? agentDialog : page;
  await clickFirstVisible(navigationScope.getByRole("button", { name }));
  if (await agentDialog.count()) {
    await expect(agentDialog).toBeHidden();
    if (await isVisible(menu))
      await expect(menu).toHaveAttribute("aria-expanded", "false");
  }
}

export async function signIn(page: Page, role: SmokeRole) {
  const credentials = smokeCredentials(role);
  await page.goto("/");
  const switchToLogin = page.getByRole("button", { name: "Уже есть доступ? Войти" });
  if (await isVisible(switchToLogin)) await switchToLogin.click();
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Пароль", { exact: true }).fill(credentials.password);
  const authResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      candidate.url().startsWith(supabaseOrigin()) &&
      /\/auth\/v1\/token\?grant_type=password/.test(candidate.url()),
    { timeout: 45_000 },
  );
  const [response] = await Promise.all([
    authResponse,
    page.getByRole("button", { name: "Войти" }).click(),
  ]);
  expect(
    response.status(),
    "Supabase Auth password login must succeed",
  ).toBeGreaterThanOrEqual(200);
  expect(response.status(), "Supabase Auth password login must succeed").toBeLessThan(
    300,
  );

  const expectedHeading =
    role === "admin"
      ? /^(Проверка|Очередь на проверку|Работа)$/
      : /^(Мои действия|Мои подачи)$/;
  const accessError = page.getByRole("alert").first();
  await expect
    .poll(
      async () =>
        (await isVisible(accessError)) ||
        (await isVisible(
          page.getByRole("heading", {
            level: 1,
            name: expectedHeading,
          }),
        )),
      { timeout: 45_000 },
    )
    .toBe(true);

  if (await isVisible(accessError)) {
    throw new Error(
      `Sandbox ${role} access is blocked: ${(await accessError.textContent()) ?? "unknown error"}`,
    );
  }
  await expect(
    page.getByRole("heading", { level: 1, name: expectedHeading }),
  ).toBeVisible({
    timeout: 45_000,
  });
}

export async function signOut(page: Page) {
  const directLogout = page.getByRole("button", { name: /^Выйти$/ }).first();
  if (await isVisible(directLogout)) {
    await directLogout.click();
  } else {
    const mobileMenu = page
      .getByRole("button", {
        name: /^(Меню|Открыть меню|Открыть меню администратора)$/,
      })
      .first();
    if (await isVisible(mobileMenu)) await mobileMenu.click();
    else await clickWorkspaceButton(page, /Настройки/);
    await clickFirstVisible(page.getByRole("button", { name: /^Выйти$/ }));
  }

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Вход|Заявка на доступ)$/,
    }),
  ).toBeVisible({ timeout: 45_000 });
}

export async function clickAndWaitForSupabaseWrite(
  page: Page,
  action: () => Promise<void>,
  expectedPath?: RegExp,
) {
  const responsePromise = page.waitForResponse(
    (candidate) => {
      const method = candidate.request().method();
      const url = new URL(candidate.url());
      const isSupabaseDataApi =
        url.origin === supabaseOrigin() &&
        /\/(?:rest\/v1|storage\/v1|functions\/v1)\//.test(url.pathname);
      const isSupabaseEdgeFunction = url.origin === supabaseEdgeFunctionsOrigin();
      return (
        (isSupabaseDataApi || isSupabaseEdgeFunction) &&
        (!expectedPath || expectedPath.test(url.pathname)) &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
        candidate.status() >= 200 &&
        candidate.status() < 300
      );
    },
    { timeout: 30_000 },
  );

  const [, response] = await Promise.all([action(), responsePromise]);
  return response;
}

export function runAssets(runId: string, count: number) {
  if (!existsSync(assetSource)) {
    throw new Error(`Required UI upload asset is missing: ${assetSource}`);
  }

  const assets: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const target = testArtifactPath(
      "supabase-ui-inputs",
      runId,
      `${runId}-passport-${index + 1}.jpeg`,
    );
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(assetSource, target);
    assets.push(target);
  }
  return assets;
}

export async function openCreateSubmission(page: Page) {
  const create = page.getByRole("button", { name: /^(Создать пакет|Новая подача)$/ });
  if (!(await isVisible(create.first())))
    await clickWorkspaceButton(page, /Мои подачи/);
  await clickFirstVisible(create);
  await expect(drawer(page)).toBeVisible();
  await expect(
    drawer(page).getByRole("heading", { name: /Загрузка и первичная сборка/ }),
  ).toBeVisible();
}

type QuestionnaireSectionEvidence = {
  applicantCount: number;
  applicantIndex: number;
  sectionCount: number;
  sectionIndex: number;
  sectionLabel: string;
  submissionId: string;
};

export type QuestionnaireSaveIntegrationEvidence = {
  saveNetwork: {
    method: "POST";
    path: string;
    status: number;
  };
  saveWriteCount: number;
  submissionId: string;
  surnameReadbacks: Array<{ applicantIndex: number; value: string }>;
};

export async function fillQuestionnaire(
  page: Page,
  runId: string,
  onSectionComplete?: (step: QuestionnaireSectionEvidence) => Promise<void>,
  onFamilyCopyState?: (
    state: "preview" | "complete",
    submissionId: string,
  ) => Promise<void>,
): Promise<QuestionnaireSaveIntegrationEvidence> {
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  if (!(await isVisible(questionnaire))) {
    const open = drawer(page).getByRole("button", { name: "Открыть анкету" }).first();
    if (!(await isVisible(open)))
      throw new Error("Questionnaire workspace is not openable from the UI.");
    await open.click();
    await expect(questionnaire).toBeVisible();
  }

  const submissionId = await questionnaire.getAttribute("data-submission-id");
  const applicants = questionnaire.locator(".v19-questionnaire-applicant-tab");
  const applicantCount = await applicants.count();
  if (!submissionId)
    throw new Error("Created submission id was not rendered in the questionnaire UI.");
  let fieldIndex = 0;

  for (
    let applicantIndex = 0;
    applicantIndex < Math.max(applicantCount, 1);
    applicantIndex += 1
  ) {
    if (applicantCount > 0) await applicants.nth(applicantIndex).click();

    const sections = questionnaire.locator(
      ".v19-questionnaire-section-list--sidebar .v19-questionnaire-section-tab:visible",
    );
    const sectionCount = await sections.count();
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      await sections.nth(sectionIndex).click();
      const sectionLabel = (await sections.nth(sectionIndex).innerText())
        .replace(/\s+/g, " ")
        .trim();
      const fields = questionnaire.locator(
        ".v19-questionnaire-work-panel [data-field-label]",
      );
      const fieldLabels = await fields.evaluateAll((elements) =>
        elements
          .map(
            (element) =>
              (element as unknown as { dataset?: { fieldLabel?: string } }).dataset
                ?.fieldLabel ?? "",
          )
          .filter(Boolean),
      );
      for (const label of fieldLabels) {
        const escapedLabel = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const field = questionnaire
          .locator(`.v19-questionnaire-work-panel [data-field-label="${escapedLabel}"]`)
          .first();
        if ((await field.count()) === 0) continue;
        const requiredControl = field.locator('[aria-required="true"]').first();
        if ((await requiredControl.count()) === 0) continue;

        const textControl = field
          .locator("input:not([readonly]), textarea:not([readonly])")
          .first();
        if (await isVisible(textControl)) {
          if (!(await textControl.inputValue()).trim()) {
            await textControl.fill(
              questionnaireFixtureTextValue(label, runId, fieldIndex, sectionLabel),
            );
            fieldIndex += 1;
          }
          continue;
        }

        const preferredOption = questionnaireFixturePreferredOption(label);
        const quickOptions = field.locator("button.v19-questionnaire-quick-option");
        const quickOption = preferredOption
          ? quickOptions.getByText(preferredOption, { exact: true })
          : quickOptions.first();
        if (await isVisible(quickOption)) {
          if ((await field.locator('button[aria-pressed="true"]').count()) === 0) {
            await quickOption.click();
            fieldIndex += 1;
          }
          continue;
        }

        const dropdown = field
          .locator("button.v19-questionnaire-field-control")
          .first();
        if (await isVisible(dropdown)) {
          const currentValue = (await dropdown.innerText()).trim();
          if (label === "Город подачи" && applicantIndex === 0) {
            expect(currentValue).toContain("Выберите город");
          }
          if (currentValue.includes("Выберите")) {
            await dropdown.click();
            const options = questionnaire.locator(
              ".v19-questionnaire-dropdown:visible .v19-questionnaire-dropdown-option",
            );
            const option = preferredOption
              ? options.getByText(preferredOption, { exact: true })
              : options.first();
            await option.click();
            fieldIndex += 1;
          }
        }
      }
      await onSectionComplete?.({
        applicantCount: Math.max(applicantCount, 1),
        applicantIndex,
        sectionCount,
        sectionIndex,
        sectionLabel,
        submissionId,
      });
    }

    if (applicantIndex === 0 && applicantCount > 1) {
      const copyShared = questionnaire.getByRole("button", {
        name: "Копировать для всех",
      });
      await expect(copyShared).toBeVisible();
      await copyShared.click();
      await onFamilyCopyState?.("preview", submissionId);
      const confirmCopy = questionnaire.getByRole("button", {
        name: "Подтвердить копирование",
      });
      await expect(confirmCopy).toBeVisible();
      await confirmCopy.click();
      await onFamilyCopyState?.("complete", submissionId);
    }
  }

  expect(fieldIndex).toBeGreaterThan(0);
  const surnameReadbacks: Array<{ applicantIndex: number; value: string }> = [];
  for (
    let applicantIndex = 0;
    applicantIndex < Math.max(applicantCount, 1);
    applicantIndex += 1
  ) {
    if (applicantCount > 0) await applicants.nth(applicantIndex).click();
    await questionnaire
      .locator(".v19-questionnaire-section-list--sidebar .v19-questionnaire-section-tab")
      .filter({ hasText: "Личные данные" })
      .click();
    surnameReadbacks.push({
      applicantIndex,
      value: await questionnaire
        .locator('[data-model-field-id="surname"] input')
        .inputValue(),
    });
  }

  const matchingSaveRequests: Request[] = [];
  const matchingSaveResponses: Response[] = [];
  const isMatchingSaveRequest = (request: Request) => {
    const url = new URL(request.url());
    return (
      url.origin === supabaseOrigin() &&
      url.pathname.endsWith("/rest/v1/rpc/save_submission_draft") &&
      request.method() === "POST"
    );
  };
  const recordSaveRequest = (request: Request) => {
    if (isMatchingSaveRequest(request)) matchingSaveRequests.push(request);
  };
  const recordSaveResponse = (response: Response) => {
    if (isMatchingSaveRequest(response.request())) matchingSaveResponses.push(response);
  };
  page.on("request", recordSaveRequest);
  page.on("response", recordSaveResponse);
  let saveResponse: Response | undefined;
  try {
    saveResponse = await clickAndWaitForSupabaseWrite(
      page,
      () =>
        questionnaire
          .getByRole("button", { name: "Сохранить и выйти", exact: true })
          .click(),
      /\/rest\/v1\/rpc\/save_submission_draft$/,
    );
    await expect(questionnaire).toHaveCount(0);
    // Keep observing through the 900 ms questionnaire autosave debounce so a
    // delayed or rejected duplicate request cannot masquerade as exact-once.
    await page.waitForTimeout(1_000);
  } finally {
    page.off("request", recordSaveRequest);
    page.off("response", recordSaveResponse);
  }
  if (!saveResponse) throw new Error("Save & Exit did not return a response.");
  expect(matchingSaveRequests).toHaveLength(1);
  expect(matchingSaveResponses).toHaveLength(1);
  expect(matchingSaveResponses[0]?.status()).toBeGreaterThanOrEqual(200);
  expect(matchingSaveResponses[0]?.status()).toBeLessThan(300);
  return {
    saveNetwork: {
      method: "POST",
      path: new URL(saveResponse.url()).pathname,
      status: saveResponse.status(),
    },
    saveWriteCount: matchingSaveRequests.length,
    submissionId,
    surnameReadbacks,
  };
}

export async function openDrawerTab(page: Page, name: string | RegExp) {
  const drawerRoot = drawer(page);
  const tab = drawerRoot.getByRole("tab", { name }).first();
  const control = (await isVisible(tab))
    ? tab
    : drawerRoot.getByRole("button", { name }).first();
  await expect(control).toBeVisible();
  await control.click();
  if ((await control.getAttribute("role")) === "tab") {
    await expect(control).toHaveAttribute("aria-selected", "true");
  }
}

export async function uploadVisibleRequiredFiles(page: Page, assets: string[]) {
  const findUploadSection = async () => {
    const sections = page.locator(".v20-file-section:visible");
    for (let index = 0; index < (await sections.count()); index += 1) {
      const section = sections.nth(index);
      const candidate = section.locator("button").filter({ hasText: "Загрузить" });
      const count = await visibleLocatorCount(candidate);
      if (count > 0) return { count, locator: candidate, section };
    }
    return null;
  };

  for (let pass = 0; pass < 20; pass += 1) {
    if (pass === 0) {
      await expect
        .poll(async () => Boolean(await findUploadSection()), { timeout: 15_000 })
        .toBe(true);
    }
    const section = await findUploadSection();
    if (!section) {
      if (pass === 0) {
        throw new Error(
          "Production Files tab rendered no upload inputs for the created submission.",
        );
      }
      return;
    }

    const uploadButton = await firstVisibleLocator(section.locator);
    const asset = assets[pass % assets.length];
    await clickAndWaitForSupabaseWrite(
      page,
      async () => {
        const fileChooser = page.waitForEvent("filechooser");
        await uploadButton.click();
        await (await fileChooser).setFiles(asset);
      },
      /\/rest\/v1\/rpc\/save_submission_draft$/,
    );
    await expect
      .poll(() => visibleLocatorCount(section.locator), { timeout: 30_000 })
      .toBe(section.count - 1);
  }

  throw new Error("Required media inputs did not clear after 20 UI uploads.");
}

async function visibleLocatorCount(locator: Locator) {
  let visibleCount = 0;
  for (let index = 0; index < (await locator.count()); index += 1) {
    if (await isVisible(locator.nth(index))) visibleCount += 1;
  }
  return visibleCount;
}

async function firstVisibleLocator(locator: Locator) {
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index);
    if (await isVisible(candidate)) return candidate;
  }
  throw new Error("No visible upload control matched the production file slot.");
}

export async function extractSubmissionId(page: Page) {
  const text = await drawer(page).innerText();
  const match = text.match(/(?:ПД|SUB|VF)-\d+/);
  if (!match) throw new Error("Created submission id was not rendered in the UI.");
  return match[0];
}

export async function openSubmissionById(page: Page, id: string) {
  const search = page.getByRole("searchbox").first();
  if (await isVisible(search)) await search.fill(id);

  const row = page.locator(`[data-submission-id="${id}"]`).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(drawer(page)).toBeVisible();
}

export async function assertNoOverflow(page: Page) {
  const dimensions = await page.locator("html").evaluate((element) => {
    const root = element as unknown as { clientWidth: number; scrollWidth: number };
    return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
