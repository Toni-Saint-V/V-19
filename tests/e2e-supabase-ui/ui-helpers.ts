import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

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
const browserProblemIgnore = /ResizeObserver loop|favicon|net::ERR_ABORTED|Download the React DevTools/i;

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
    otherAgent: ["SUPABASE_SMOKE_OTHER_AGENT_EMAIL", "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD"],
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
  const control = page.getByRole("button", { name });
  if (await isVisible(control.first())) {
    await clickFirstVisible(control);
    return;
  }

  const menu = page.getByRole("button", { exact: true, name: "Меню" }).first();
  if (await isVisible(menu)) await menu.click();
  await clickFirstVisible(page.getByRole("button", { name }));
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
  expect(response.status(), "Supabase Auth password login must succeed").toBeGreaterThanOrEqual(200);
  expect(response.status(), "Supabase Auth password login must succeed").toBeLessThan(300);

  const expectedHeading =
    role === "admin" ? /^(Проверка|Очередь на проверку|Работа)$/ : /^(Мои действия|Мои подачи)$/;
  const accessError = page.getByRole("alert").first();
  await expect
    .poll(
      async () => (await isVisible(accessError)) || (await isVisible(page.getByRole("heading", {
        level: 1,
        name: expectedHeading,
      }))),
      { timeout: 45_000 },
    )
    .toBe(true);

  if (await isVisible(accessError)) {
    throw new Error(`Sandbox ${role} access is blocked: ${(await accessError.textContent()) ?? "unknown error"}`);
  }
  await expect(page.getByRole("heading", { level: 1, name: expectedHeading })).toBeVisible({
    timeout: 45_000,
  });
}

export async function signOut(page: Page) {
  const directLogout = page.getByRole("button", { name: /^Выйти$/ }).first();
  if (await isVisible(directLogout)) {
    await directLogout.click();
  } else {
    await clickWorkspaceButton(page, /Настройки/);
    await clickFirstVisible(page.getByRole("button", { name: /^Выйти$/ }));
  }

  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
}

export async function clickAndWaitForSupabaseWrite(
  page: Page,
  action: () => Promise<void>,
  expectedPath?: RegExp,
) {
  const response = page.waitForResponse(
    (candidate) => {
      const method = candidate.request().method();
      return (
        candidate.url().startsWith(supabaseOrigin()) &&
        /\/(?:rest\/v1|storage\/v1|functions\/v1)\//.test(candidate.url()) &&
        (!expectedPath || expectedPath.test(new URL(candidate.url()).pathname)) &&
        method !== "GET" &&
        method !== "HEAD" &&
        candidate.status() >= 200 &&
        candidate.status() < 300
      );
    },
    { timeout: 30_000 },
  );

  await action();
  return response;
}

export function runAssets(runId: string, count: number) {
  if (!existsSync(assetSource)) {
    throw new Error(`Required UI upload asset is missing: ${assetSource}`);
  }

  const assets: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const target = resolve(
      process.cwd(),
      "test-results",
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
  if (!(await isVisible(create.first()))) await clickWorkspaceButton(page, /Мои подачи/);
  await clickFirstVisible(create);
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByRole("heading", { name: /Загрузка и первичная сборка/ })).toBeVisible();
}

export async function fillQuestionnaire(page: Page, runId: string): Promise<string> {
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  if (!(await isVisible(questionnaire))) {
    const open = drawer(page).getByRole("button", { name: "Открыть анкету" }).first();
    if (!(await isVisible(open))) throw new Error("Questionnaire workspace is not openable from the UI.");
    await open.click();
    await expect(questionnaire).toBeVisible();
  }

  const submissionId = await questionnaire.getAttribute("data-submission-id");
  const applicants = questionnaire.locator(".v19-questionnaire-applicant-tab");
  const applicantCount = await applicants.count();
  let fieldIndex = 0;

  for (let applicantIndex = 0; applicantIndex < Math.max(applicantCount, 1); applicantIndex += 1) {
    if (applicantCount > 0) await applicants.nth(applicantIndex).click();

    const sections = questionnaire.locator(
      ".v19-questionnaire-section-list--sidebar .v19-questionnaire-section-tab:visible",
    );
    const sectionCount = await sections.count();
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      await sections.nth(sectionIndex).click();
      const fields = questionnaire.locator(
        ".v19-questionnaire-work-panel [data-field-label]",
      );
      const fieldCount = await fields.count();
      for (let index = 0; index < fieldCount; index += 1) {
        const field = fields.nth(index);
        const label = (await field.getAttribute("data-field-label")) ?? "";
        const textControl = field.locator("input:not([readonly]), textarea:not([readonly])").first();
        if (await isVisible(textControl)) {
          const controlType = await textControl.getAttribute("type");
          await textControl.fill(
            controlType === "number"
              ? "30"
              : questionnaireValue(label, runId, fieldIndex),
          );
          fieldIndex += 1;
          continue;
        }

        const quickOption = field.locator("button.v19-questionnaire-quick-option").first();
        if (await isVisible(quickOption)) {
          if ((await field.locator('button[aria-pressed="true"]').count()) === 0) {
            await quickOption.click();
            fieldIndex += 1;
          }
          continue;
        }

        const dropdown = field.locator("button.v19-questionnaire-field-control").first();
        if (await isVisible(dropdown)) {
          const currentValue = (await dropdown.innerText()).trim();
          if (currentValue.includes("Выберите")) {
            await dropdown.click();
            await questionnaire
              .locator(".v19-questionnaire-dropdown:visible .v19-questionnaire-dropdown-option")
              .first()
              .click();
            fieldIndex += 1;
          }
        }
      }
    }
  }

  expect(fieldIndex).toBeGreaterThan(0);
  await clickAndWaitForSupabaseWrite(
    page,
    () => questionnaire.getByRole("button", { name: "Черновик", exact: true }).click(),
    /\/rest\/v1\/rpc\/save_submission_draft$/,
  );
  await questionnaire.getByRole("button", { name: "Назад" }).click();
  await expect(questionnaire).toHaveCount(0);
  if (!submissionId) throw new Error("Created submission id was not rendered in the questionnaire UI.");
  return submissionId;
}

function questionnaireValue(label: string, runId: string, index: number) {
  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel.includes("дата") || normalizedLabel.includes("действител")) {
    return "01.01.2030";
  }
  if (label.includes("ФИО")) return `Sandbox ${runId}`;
  if (label.includes("Номер паспорта")) return String(800_000_000 + index).slice(0, 9);
  if (normalizedLabel.includes("email") || label.includes("Почта")) {
    return `sandbox-${runId.replace(/[^a-z0-9]/gi, "-")}@example.com`;
  }
  if (label.includes("Маршрут")) return "Москва, Мадрид, Москва";
  if (label.includes("Адрес")) return "Calle de Sandbox, 1";
  if (label.includes("Телефон")) return "+7 900 000 00 00";
  if (label.includes("Индекс") || label.includes("код")) return "101000";
  return `Sandbox ${runId} ${index + 1}`;
}

export async function openDrawerTab(page: Page, name: string | RegExp) {
  const drawerRoot = drawer(page);
  const tab = drawerRoot.getByRole("tab", { name }).first();
  const control = (await isVisible(tab))
    ? tab
    : drawerRoot.getByRole("button", { name }).first();
  await expect(control).toBeVisible();
  await control.click();
  if (await control.getAttribute("role") === "tab") {
    await expect(control).toHaveAttribute("aria-selected", "true");
  }
}

export async function uploadVisibleRequiredFiles(page: Page, assets: string[]) {
  const findUploadSection = async () => {
    const sections = page.locator(".v20-file-section:visible");
    for (let index = 0; index < await sections.count(); index += 1) {
      const section = sections.nth(index);
      const candidate = section.locator("button").filter({ hasText: "Загрузить" });
      const count = await visibleLocatorCount(candidate);
      if (count > 0) return { count, locator: candidate, section };
    }
    return null;
  };

  for (let pass = 0; pass < 20; pass += 1) {
    if (pass === 0) {
      await expect.poll(
        async () => Boolean(await findUploadSection()),
        { timeout: 15_000 },
      ).toBe(true);
    }
    const section = await findUploadSection();
    if (!section) {
      if (pass === 0) {
        throw new Error("Production Files tab rendered no upload inputs for the created submission.");
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
  for (let index = 0; index < await locator.count(); index += 1) {
    if (await isVisible(locator.nth(index))) visibleCount += 1;
  }
  return visibleCount;
}

async function firstVisibleLocator(locator: Locator) {
  for (let index = 0; index < await locator.count(); index += 1) {
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
