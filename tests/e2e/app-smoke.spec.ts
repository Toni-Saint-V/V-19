import { expect, test, type Page } from "@playwright/test";

const forbiddenPrimaryLabels = [
  "Люди",
  "Семьи",
  "Группы",
  "Туристы",
  "Документы",
  "CRM",
  "Dashboard",
  "Smart Inbox",
  "AI Checker",
  "Operations Center",
];

async function expectNoRetiredNavigation(page: Page) {
  for (const label of forbiddenPrimaryLabels) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
}

async function switchToAdminViaUi(page: Page) {
  await page.getByRole("button", { name: "Сменить роль" }).click();
  await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();
}

async function seedAdminRole(page: Page) {
  await page.evaluate(() => {
    (
      globalThis as unknown as {
        localStorage: { setItem(key: string, value: string): void };
      }
    ).localStorage.setItem("visaflow.workspaceEmail.v1", "admin@visaflow.local");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();
}

async function openAgentSubmissions(page: Page) {
  await page.getByRole("button", { name: "Мои подачи" }).click();
  await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
}

function submissionCard(page: Page, name: string) {
  return page
    .locator(".submission-card, [data-submission-card]")
    .filter({ hasText: name })
    .first();
}

function submissionCardById(page: Page, id: string) {
  return page.locator(`[data-submission-id="${id}"]`).first();
}

function drawer(page: Page) {
  return page.getByRole("dialog").first();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openDrawerTab(page: Page, labels: string[]) {
  const name = new RegExp(`^(${labels.map(escapeRegex).join("|")})(\\b|\\s|$)`);
  await drawer(page).getByRole("tab", { name }).click();
}

async function openQuestionnaireTab(page: Page) {
  await openDrawerTab(page, ["Данные", "Анкета"]);
}

async function openMediaTab(page: Page) {
  await openDrawerTab(page, ["Медиа", "Файлы"]);
}

async function openSelectedReview(page: Page) {
  await page.getByRole("button", { name: "Открыть выбранную" }).click();
}

async function openAdminSubmission(page: Page, name: string) {
  await submissionCard(page, name).click();
  await openSelectedReview(page);
  await expect(drawer(page).getByRole("heading", { name })).toBeVisible();
}

async function returnSelectedWithIssue(page: Page) {
  await page.getByRole("button", { name: "Вернуть", exact: true }).click();
}

async function openCorrectionsTab(page: Page) {
  await page.getByRole("tab", { name: "Исправления" }).click();
}

function questionnaireValue(label: string, index: number) {
  if (label.includes("ФИО")) return "Иван Иванов";
  if (label.includes("Дата рождения")) return "01.01.1990";
  if (label.includes("Маршрут")) return "Москва, Мадрид, Москва";
  if (label.includes("Адрес")) return "Отель подтвержден";
  if (label.includes("Телефон")) return "+7 900 000 00 00";
  if (label.includes("Почта")) return "почта указана";
  return `Значение ${index + 1}`;
}

async function fillQuestionnaire(page: Page) {
  const sectionButtons = drawer(page).locator(".questionnaire-section-heading");
  const sectionCount = await sectionButtons.count();
  expect(sectionCount).toBeGreaterThan(0);

  let filledCount = 0;

  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const sectionButton = sectionButtons.nth(sectionIndex);
    await sectionButton.scrollIntoViewIfNeeded();
    await sectionButton.click();

    const fields = drawer(page).locator(
      ".questionnaire-fields:not([hidden]) .questionnaire-field input:not([disabled])",
    );
    const count = await fields.count();

    for (let index = 0; index < count; index += 1) {
      const input = fields.nth(index);
      const label = (await input.getAttribute("aria-label")) ?? "";
      await input.fill(questionnaireValue(label, filledCount));
      filledCount += 1;
    }

    const selects = drawer(page).locator(
      ".questionnaire-fields:not([hidden]) .questionnaire-field select:not([disabled])",
    );
    const selectCount = await selects.count();
    for (let index = 0; index < selectCount; index += 1) {
      const select = selects.nth(index);
      if (await select.inputValue()) continue;
      await select.selectOption({ index: 1 });
    }
  }

  expect(filledCount).toBeGreaterThan(0);
  await expect(drawer(page).getByText("Готово к решению").first()).toBeVisible();
}

async function uploadAllVisibleFiles(page: Page) {
  const uploadButtons = drawer(page).getByRole("button", {
    name: /^(Загрузить|Заменить)/,
  });

  for (let guard = 0; guard < 30; guard += 1) {
    const count = await uploadButtons.count();
    if (count === 0) return;
    await uploadButtons.first().click();
  }

  throw new Error("Не удалось загрузить все видимые файлы");
}

async function saveDraftFromDrawer(page: Page) {
  await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
}

async function submitForReviewFromDrawer(page: Page) {
  await drawer(page).getByRole("button", { name: "Отправить" }).click();
}

async function createNamedSubmission(
  page: Page,
  input: { names: string[]; type: "single" | "family" },
) {
  await page.getByRole("button", { name: "Новая подача" }).click();
  if (input.type === "family") {
    await drawer(page).getByRole("button", { name: "Семья" }).click();
    await drawer(page).getByLabel("Основной заявитель").fill(input.names[0]);
    await drawer(page).getByLabel("Супруг").fill(input.names[1]);

    for (let index = 2; index < input.names.length; index += 1) {
      await drawer(page).getByRole("button", { name: "Добавить человека" }).click();
      await drawer(page)
        .getByLabel(`Ребенок ${index - 1}`)
        .fill(input.names[index]);
    }
  } else {
    await drawer(page).getByRole("textbox", { name: "Заявитель" }).fill(input.names[0]);
  }

  await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
}

async function fillFilesAndSubmit(page: Page, screenshotPath?: string) {
  await openMediaTab(page);
  if (screenshotPath) {
    await page.waitForTimeout(150);
    await page.screenshot({ fullPage: true, path: screenshotPath });
  }
  await uploadAllVisibleFiles(page);
  await saveDraftFromDrawer(page);
  await submitForReviewFromDrawer(page);
  await expect(drawer(page).getByText(/ПД-\d+ · На проверке/)).toBeVisible();
  await page.getByRole("button", { name: "Закрыть подачу" }).click();
}

async function clearExportSelection(page: Page) {
  const checked = page.locator(".export-row input:checked");
  while ((await checked.count()) > 0) {
    await checked.first().uncheck();
  }
}

function collectBrowserProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

test.describe("V-19 operations workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      (
        globalThis as unknown as { localStorage: { clear(): void } }
      ).localStorage.clear();
    });
    await page.reload();
  });

  test("agent surface exposes only the submissions cockpit", async ({ page }) => {
    await page.getByRole("button", { name: "Мои подачи" }).click();
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Новая подача" })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Фильтр по городу" }),
    ).toBeVisible();
    await expect(submissionCardById(page, "ПД-1048")).toBeVisible();
    await expect(
      submissionCardById(page, "ПД-1048").getByText("Возвращено 2", { exact: true }),
    ).toBeVisible();
    await expect(
      submissionCardById(page, "ПД-1048").getByText("2 блокера", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Исправить" }).first()).toBeVisible();
    await expect(submissionCard(page, "Ольга Морозова")).toHaveCount(0);

    await expectNoRetiredNavigation(page);
  });

  test("role switch button changes workspace role through UI", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Mobile flows seed role explicitly; desktop covers the visible role switch.",
    );

    await switchToAdminViaUi(page);
    await expect(page.getByRole("button", { name: "Выгрузка" })).toBeVisible();
  });

  test("local cockpit keeps another agent submission out of the agent workspace", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Мои подачи" }).click();
    await expect(submissionCard(page, "Ольга Морозова")).toHaveCount(0);

    await seedAdminRole(page);
    await page.getByRole("button", { name: "Выгрузка" }).click();
    await page.getByRole("tab", { name: "История" }).click();

    await expect(
      page.locator(".export-row").filter({ hasText: "Ольга Морозова" }),
    ).toBeVisible();
  });

  test("primary surfaces expose the 3-second decision frame", async ({ page }) => {
    await page.getByRole("button", { name: "Мои подачи" }).click();
    await expect(
      submissionCardById(page, "ПД-1048").getByText("Возвращено 2", { exact: true }),
    ).toBeVisible();
    await expect(
      submissionCardById(page, "ПД-1048").getByText("2 блокера", { exact: true }),
    ).toHaveCount(0);
    await expect(submissionCardById(page, "ПД-1048").getByText("Дальше:")).toHaveCount(
      0,
    );
    await expect(submissionCardById(page, "ПД-1048").getByText(/Анкета \d+%/)).toHaveCount(
      0,
    );
    await expect(
      submissionCardById(page, "ПД-1048").locator(".v19-submission-file-tag", {
        hasText: "Файлы 4/6",
      }),
    ).toBeVisible();

    await submissionCardById(page, "ПД-1048").click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
    await expect(
      drawer(page).getByText("Мария Иванова · Медиа · Фото на белом фоне").first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await seedAdminRole(page);
    await expect(page.getByRole("button", { name: "Входящие" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Мои действия" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Проверка" })).toBeVisible();
    await expect(
      submissionCard(page, "Нина Волкова").getByText("На проверке"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Открыть выбранную" }),
    ).toBeVisible();
    await returnSelectedWithIssue(page);
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await expect(
      drawer(page).getByText("Нина Волкова · Данные · Маршрут поездки").first(),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(drawer(page).getByLabel("Новое замечание")).toHaveCount(0);
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Отмена" }).click();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();
    await openSelectedReview(page);
    await expect(drawer(page).getByLabel("Новое замечание")).toHaveCount(0);
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Выгрузка" }).click();
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    await expect(
      page.locator(".export-row").filter({ hasText: "Дмитрий Орлов" }),
    ).toBeVisible();
    await expect(page.locator(".export-preview").getByText("Готово")).toBeVisible();
    await expect(
      page.locator(".export-preview").getByText("Дмитрий Орлов"),
    ).toBeVisible();
    await expect(
      page
        .locator(".export-preview")
        .getByRole("button", { name: "Сформировать Эксель" }),
    ).toBeVisible();
    await expect(
      page.locator(".export-preview").getByText("Сначала сформируйте Эксель"),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Фильтр по городу" })
      .selectOption("Казань");
    await expect(
      page.locator(".export-preview").getByText("Пакет не выбран"),
    ).toBeVisible();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Выберите хотя бы одну подачу",
    );
  });

  test("admin keyboard review flow and export preview stay console-clean", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    const projectName = test.info().project.name;

    await page.reload();
    await seedAdminRole(page);
    await expect(submissionCard(page, "Нина Волкова")).toBeVisible();
    await expect(
      submissionCard(page, "Нина Волкова").getByText("Проверка:"),
    ).toBeVisible();

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: "docs/qa/v19-linear-admin-review-desktop.png",
      });
    }

    const reviewCard = submissionCard(page, "Нина Волкова");
    await reviewCard.focus();
    await expect(reviewCard).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("На проверке")).toBeVisible();

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: "docs/qa/v19-linear-drawer-desktop.png",
      });
    }

    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: "docs/qa/v19-linear-issue-composer-desktop.png",
      });
    }

    await drawer(page).getByLabel("Причина").focus();
    await page.keyboard.press("Escape");
    await expect(drawer(page).getByLabel("Новое замечание")).toHaveCount(0);
    await drawer(page).getByRole("tab", { name: "Обзор" }).focus();
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);
    await expect(reviewCard).toBeFocused();

    await page.getByRole("button", { name: "Выгрузка" }).click();
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    await expect(
      page.locator(".export-preview").getByText("Пакет выгрузки"),
    ).toBeVisible();
    await expect(
      page.locator(".export-preview").getByText("Сначала сформируйте Эксель"),
    ).toBeVisible();

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: "docs/qa/v19-linear-export-desktop.png",
      });
    }

    if (projectName === "mobile-chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: "docs/qa/v19-linear-export-mobile.png",
      });
    }

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("pre-created admin mail opens the admin workspace", async ({ page }) => {
    await page.evaluate(() => {
      (
        globalThis as unknown as {
          localStorage: { setItem(key: string, value: string): void };
        }
      ).localStorage.setItem("visaflow.workspaceEmail.v1", "admin@visaflow.local");
    });
    await page.reload();

    await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Выгрузка" })).toBeVisible();
    await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);
  });

  test("agent creates a draft and opens returned issues in the drawer", async ({
    page,
  }) => {
    await openAgentSubmissions(page);
    await page.getByRole("button", { name: "Новая подача" }).click();
    await expect(page.getByRole("heading", { name: "Новая подача" })).toBeVisible();
    await expect(page.locator('input[readonly][value="Испания"]')).toBeVisible();
    await expect(
      drawer(page).getByRole("combobox", { name: "Город подачи" }),
    ).toBeVisible();

    await drawer(page).getByRole("button", { name: "Семья", exact: true }).click();
    await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Новая семейная подача" }),
    ).toBeVisible();
    await expect(drawer(page).getByText(/ПД-\d+ · Черновик/)).toBeVisible();
    await openQuestionnaireTab(page);
    await expect(drawer(page).getByText("ИИ-помощник")).toBeVisible();
    await expect(drawer(page).getByText(/Почему сейчас/).first()).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Заполнить анкету" }),
    ).toHaveCount(0);
    await fillQuestionnaire(page);
    await openMediaTab(page);
    await expect(drawer(page).getByText("ИИ-помощник")).toBeVisible();
    await expect(drawer(page).getByText(/Источник:/).first()).toBeVisible();
    await uploadAllVisibleFiles(page);
    await expect(
      drawer(page).getByRole("button", { name: /^(Загрузить|Заменить)/ }),
    ).toHaveCount(0);
    await saveDraftFromDrawer(page);
    await expect(drawer(page).getByText(/ПД-\d+ · В работе/)).toBeVisible();
    await submitForReviewFromDrawer(page);
    await expect(drawer(page).getByText(/ПД-\d+ · На проверке/)).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Мои подачи" }).click();
    await page.getByRole("button", { name: "Исправить" }).first().click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Замечания" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(drawer(page).getByText("ИИ-помощник")).toBeVisible();
    await expect(drawer(page).getByText("Локальная проверка")).toBeVisible();
    await expect(drawer(page).getByText(/Почему сейчас/).first()).toBeVisible();
    await expect(drawer(page).getByText(/Источник:/).first()).toBeVisible();
    await expect(
      drawer(page).getByText("Черновик ответа по исправлениям").first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByText("Мария Иванова · Медиа · Фото на белом фоне").first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByText("София Иванова · Медиа · Загранпаспорт").first(),
    ).toBeVisible();

    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeDisabled();
    await expect(
      drawer(page).getByText("Сначала исправьте целевые замечания"),
    ).toBeVisible();
    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправлено агентом").first()).toBeVisible();
    await expect(drawer(page).getByText("Исправления получены").first()).toBeVisible();
  });

  test("drawer tabs and close flow work from keyboard", async ({ page }) => {
    await page.getByRole("button", { name: "Мои подачи" }).click();
    const trigger = page.getByRole("button", { name: "Исправить" }).first();
    await trigger.click();

    const issuesTab = drawer(page).getByRole("tab", { name: /Замечания/ });
    await expect(issuesTab).toHaveAttribute("aria-selected", "true");
    await expect(issuesTab).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(drawer(page).getByRole("tab", { name: /История/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.keyboard.press("Home");
    await expect(drawer(page).getByRole("tab", { name: /Обзор/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.keyboard.press("End");
    await expect(drawer(page).getByRole("tab", { name: /История/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.keyboard.press("ArrowLeft");
    await expect(drawer(page).getByRole("tab", { name: /Замечания/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await openQuestionnaireTab(page);
    const sectionButtons = drawer(page).locator(".questionnaire-section-heading");
    await expect(sectionButtons.nth(1)).toBeVisible();
    const firstFieldsId = await sectionButtons.first().getAttribute("aria-controls");
    const secondFieldsId = await sectionButtons.nth(1).getAttribute("aria-controls");
    await sectionButtons.first().focus();
    await expect(sectionButtons.first()).toHaveAttribute("aria-expanded", "true");
    expect(firstFieldsId).toBeTruthy();
    expect(secondFieldsId).toBeTruthy();
    await expect(drawer(page).locator(`#${firstFieldsId}`)).toBeVisible();
    await sectionButtons.nth(1).focus();
    await expect(sectionButtons.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(sectionButtons.first()).toHaveAttribute("aria-expanded", "false");
    await expect(drawer(page).locator(`#${firstFieldsId}`)).toBeHidden();
    await expect(drawer(page).locator(`#${secondFieldsId}`)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("dirty create drawer confirms close from keyboard", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Новая подача" });
    await trigger.click();

    await expect(
      drawer(page).getByRole("heading", { name: "Новая подача" }),
    ).toBeVisible();
    await expect(drawer(page).getByLabel("Создание подачи")).toBeVisible();
    await expect(drawer(page).getByLabel("Заявители в подаче")).toBeVisible();

    await drawer(page)
      .locator('.passport-dropzone input[type="file"]')
      .setInputFiles({
        name: "passport.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("passport-local-preview"),
      });
    await expect(
      drawer(page).getByText("Выбрано локально · загрузите после сохранения"),
    ).toBeVisible();
    await expect(
      drawer(page).getByText(/Выбрано локально: 1 паспортов/),
    ).toBeVisible();

    await drawer(page).getByRole("button", { name: "Семья" }).click();
    await expect(
      drawer(page).locator(".create-people-list").getByRole("button"),
    ).toHaveCount(0);
    await expect(
      drawer(page).locator(".questionnaire-section-preview").getByRole("button"),
    ).toHaveCount(0);
    await drawer(page).getByRole("button", { name: "Добавить человека" }).click();
    await expect(drawer(page).getByLabel("Подставленная фамилия")).toBeVisible();
    await expect(
      drawer(page).getByLabel("Подставленная фамилия").getByRole("checkbox"),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    const confirmation = page.getByRole("dialog", { name: "Закрыть панель?" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Остаться" })).toBeFocused();
    await confirmation.getByRole("button", { name: "Остаться" }).click();
    await expect(page.getByRole("dialog", { name: "Закрыть панель?" })).toHaveCount(0);
    await expect(
      drawer(page).getByRole("button", { name: "Закрыть создание" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Закрыть без сохранения" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("created draft persists after reload", async ({ page }) => {
    await page.getByRole("button", { name: "Новая подача" }).click();
    await drawer(page).getByRole("button", { name: "Семья", exact: true }).click();
    await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Новая семейная подача" }),
    ).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Мои подачи" }).click();
    await expect(submissionCard(page, "Новая семейная подача")).toBeVisible();
    await expect(
      submissionCard(page, "Новая семейная подача").getByText("Черновик"),
    ).toBeVisible();
  });

  test("header actions stay locked when the current list is filtered empty", async ({
    page,
  }) => {
    await seedAdminRole(page);
    await page.getByLabel("Поиск в текущем списке").fill("нет такой подачи");

    await expect(page.getByText("Очередь проверки пуста.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Открыть выбранную" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Вернуть", exact: true }),
    ).toBeDisabled();
    await expect(drawer(page)).toHaveCount(0);
  });

  test("agent sees ББ suggestions without admin issue actions", async ({ page }) => {
    await page.getByRole("button", { name: "Мои подачи" }).click();
    await page.getByRole("button", { name: "Исправить" }).first().click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("ББ", { exact: true })).toBeVisible();

    await drawer(page).getByRole("button", { name: "Запустить проверку" }).click();

    await expect(drawer(page).getByText("Есть подсказки")).toBeVisible();
    await expect(
      drawer(page).getByText("Проверит администратор").first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Добавить как замечание" }),
    ).toHaveCount(0);
  });

  test("admin converts a ББ suggestion into a precise issue", async ({ page }) => {
    await seedAdminRole(page);
    await openSelectedReview(page);
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();

    await drawer(page).getByRole("button", { name: "Запустить проверку" }).click();
    await expect(drawer(page).getByText("Есть подсказки")).toBeVisible();

    await drawer(page)
      .getByRole("button", { name: "Добавить как замечание" })
      .first()
      .click();

    await expect(
      drawer(page).getByText("Нина Волкова · Медиа · Фото на белом фоне").first(),
    ).toBeVisible();
    await expect(
      drawer(page)
        .getByText("Рекомендация требует человеческого подтверждения.")
        .first(),
    ).toBeVisible();
    await drawer(page).getByRole("tab", { name: "История" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Журнал действий" }),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "ББ" }).click();
    await expect(drawer(page).getByText("ББ-проверка запущена")).toBeVisible();
    await expect(
      drawer(page).getByText("Подсказка ББ принята администратором"),
    ).toBeVisible();
    await expect(
      drawer(page).getByText("Нина Волкова · Медиа · Фото на белом фоне").first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByText("Агент отправил подачу на проверку"),
    ).toHaveCount(0);
    await drawer(page).getByRole("button", { name: "Вернуть", exact: true }).click();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
  });

  test("admin can add a precise issue and return a submission", async ({ page }) => {
    await seedAdminRole(page);
    await expect(page.getByRole("button", { name: "Проверка" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Выгрузка" })).toBeVisible();
    await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);

    await openSelectedReview(page);
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();

    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
    await expect(page.getByRole("tab", { name: "Замечания" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      drawer(page).getByText("Нина Волкова · Данные · Маршрут поездки").first(),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Вернуть", exact: true }).click();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
  });

  test("admin accepts corrections and completes the export sequence", async ({
    page,
  }) => {
    await seedAdminRole(page);
    await openCorrectionsTab(page);
    await expect(submissionCard(page, "Семья Петровых")).toBeVisible();

    await openAdminSubmission(page, "Семья Петровых");
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Петровых" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("Исправлено агентом")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть и принять" }).click();
    await expect(drawer(page).getByText(/ПД-\d+ · Готово к выгрузке/)).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Выгрузка" }).click();
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    await expect(page.getByText("Пакет выгрузки")).toBeVisible();
    await expect(
      page.locator(".export-preview").getByText("Дмитрий Орлов"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Сформировать Эксель" }).click();
    await expect(
      page.getByText("Файл сформирован. Теперь скачайте его."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Скачать" })).toBeEnabled();
    await page.getByRole("button", { name: "Скачать" }).click();
    await expect(
      page.getByText("Файл скачан. Можно отметить подачу выгруженной."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Отметить выгружено" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Отметить выгружено" }).click();

    await page.getByRole("tab", { name: "История" }).click();
    await expect(
      page.locator(".submission-panel").getByText("Дмитрий Орлов"),
    ).toBeVisible();
    await expect(
      page.locator(".submission-panel").getByText("Выгружено").first(),
    ).toBeVisible();
  });

  test("export blocks mixed packages before file generation", async ({ page }) => {
    await seedAdminRole(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Семья Петровых");
    await page.getByRole("button", { name: "Закрыть и принять" }).click();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Выгрузка" }).click();
    await page
      .locator(".export-row")
      .filter({ hasText: "Семья Петровых" })
      .getByRole("checkbox")
      .check();

    await expect(
      page
        .locator(".blocker-box")
        .getByText("Нельзя смешивать одинарные и семейные подачи"),
    ).toBeVisible();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Нельзя смешивать одинарные и семейные подачи",
    );
    await expect(
      page.getByRole("button", { name: "Сформировать Эксель" }),
    ).toBeDisabled();
  });

  test("one submission moves from creation to Excel export", async ({ page }) => {
    await page.getByRole("button", { name: "Новая подача" }).click();
    await page.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Новая подача" }),
    ).toBeVisible();

    await openQuestionnaireTab(page);
    await fillQuestionnaire(page);
    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await saveDraftFromDrawer(page);
    await submitForReviewFromDrawer(page);
    await expect(drawer(page).getByText(/ПД-\d+ · На проверке/)).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await seedAdminRole(page);
    await page.getByRole("tab", { name: "На проверке" }).click();
    await openAdminSubmission(page, "Новая подача");
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
    await expect(
      drawer(page).getByText("Новый заявитель · Данные · Маршрут поездки").first(),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Вернуть", exact: true }).click();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Сменить роль" }).click();
    await page.getByRole("button", { name: "Мои подачи" }).click();
    await submissionCard(page, "Новая подача").click();
    await expect(page.getByRole("tab", { name: "Замечания" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await openQuestionnaireTab(page);
    const routeInput = drawer(page).getByLabel(
      "Новый заявитель · Поездка · Маршрут поездки",
    );
    await expect(routeInput).toHaveAttribute("aria-invalid", "true");
    await routeInput.fill("Москва, Барселона, Москва");
    await expect(routeInput).toHaveAttribute("aria-invalid", "true");
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
    await openQuestionnaireTab(page);
    await expect(
      drawer(page).getByLabel("Новый заявитель · Поездка · Маршрут поездки"),
    ).toHaveAttribute("aria-invalid", "false");
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await seedAdminRole(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Новая подача");
    await drawer(page).getByRole("button", { name: "Закрыть и принять" }).click();
    await expect(drawer(page).getByText(/ПД-\d+ · Готово к выгрузке/)).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Выгрузка" }).click();
    await page
      .locator(".export-row")
      .filter({ hasText: "Дмитрий Орлов" })
      .getByRole("checkbox")
      .uncheck();
    await page
      .locator(".export-row")
      .filter({ hasText: "Новая подача" })
      .getByRole("checkbox")
      .check();
    await expect(
      page.locator(".export-preview").getByText("Новый заявитель"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Сформировать Эксель" }).click();
    await page
      .locator(".export-row")
      .filter({ hasText: "Новая подача" })
      .getByRole("checkbox")
      .uncheck();
    await page
      .locator(".export-row")
      .filter({ hasText: "Дмитрий Орлов" })
      .getByRole("checkbox")
      .check();
    await expect(page.getByRole("button", { name: "Скачать" })).toBeDisabled();
    await page
      .locator(".export-row")
      .filter({ hasText: "Дмитрий Орлов" })
      .getByRole("checkbox")
      .uncheck();
    await page
      .locator(".export-row")
      .filter({ hasText: "Новая подача" })
      .getByRole("checkbox")
      .check();
    await expect(page.getByRole("button", { name: "Скачать" })).toBeEnabled();
    await page.getByRole("button", { name: "Скачать" }).click();
    await page.getByRole("button", { name: "Отметить выгружено" }).click();

    await page.getByRole("tab", { name: "История" }).click();
    await expect(
      page.locator(".submission-panel").getByText("Новая подача"),
    ).toBeVisible();
    await expect(
      page.locator(".submission-panel").getByText("Выгружено").first(),
    ).toBeVisible();
  });

  test("two families and two single applicants pass issue, ББ, return, correction and export corner cases", async ({
    page,
  }) => {
    test.slow();
    const browserProblems = collectBrowserProblems(page);

    const familyTitle = "Семья Кузнецовых";
    const familyListTitle = "Кузнецовы";
    const secondFamilyTitle = "Семья Смирновых";
    const firstSingle = "Романов Павел";
    const secondSingle = "Белова Ольга";

    await test.step("agent creates and submits first four-person family", async () => {
      await createNamedSubmission(page, {
        type: "family",
        names: ["Кузнецова Анна", "Кузнецов Иван", "Кузнецова Маша", "Кузнецов Лев"],
      });
      await expect(
        drawer(page).getByRole("heading", { name: familyTitle }),
      ).toBeVisible();
      await openQuestionnaireTab(page);
      await fillQuestionnaire(page);
      await fillFilesAndSubmit(page, "docs/qa/v19-flow-media-drawer-no-overlap.png");
    });

    await test.step("agent creates and submits second four-person family", async () => {
      await createNamedSubmission(page, {
        type: "family",
        names: ["Смирнова Елена", "Смирнов Андрей", "Смирнова Ника", "Смирнов Артём"],
      });
      await expect(
        drawer(page).getByRole("heading", { name: secondFamilyTitle }),
      ).toBeVisible();
      await openQuestionnaireTab(page);
      await fillQuestionnaire(page);
      await fillFilesAndSubmit(page);
    });

    await test.step("agent cannot submit incomplete single applicant", async () => {
      await createNamedSubmission(page, { type: "single", names: [firstSingle] });
      await expect(
        drawer(page).getByRole("heading", { name: firstSingle }),
      ).toBeVisible();
      await openMediaTab(page);
      await uploadAllVisibleFiles(page);
      await saveDraftFromDrawer(page);
      await expect(
        drawer(page).getByRole("button", { name: "Отправить" }),
      ).toBeDisabled();
      await expect(
        drawer(page).getByText("Есть незаполненные поля или недостающие файлы"),
      ).toBeVisible();
      await openQuestionnaireTab(page);
      await fillQuestionnaire(page);
      await submitForReviewFromDrawer(page);
      await expect(drawer(page).getByText(/ПД-\d+ · На проверке/)).toBeVisible();
      await page.getByRole("button", { name: "Закрыть подачу" }).click();
    });

    await test.step("agent creates and submits second single applicant", async () => {
      await createNamedSubmission(page, { type: "single", names: [secondSingle] });
      await openQuestionnaireTab(page);
      await fillQuestionnaire(page);
      await fillFilesAndSubmit(page);
    });

    await test.step("admin returns first family with ББ and manual issues", async () => {
      await seedAdminRole(page);
      await page.getByRole("tab", { name: "На проверке" }).click();
      await openAdminSubmission(page, familyTitle);
      await drawer(page).getByRole("button", { name: "Запустить проверку" }).click();
      await expect(drawer(page).getByText("Есть подсказки")).toBeVisible();
      await drawer(page)
        .getByRole("button", { name: "Добавить как замечание" })
        .first()
        .click();
      await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
      await drawer(page)
        .getByLabel("Заявитель")
        .selectOption({ label: "Кузнецова Анна" });
      await drawer(page).getByLabel("Поле").selectOption({ label: "Домашний адрес" });
      await drawer(page).getByLabel("Причина").fill("Нужно уточнить домашний адрес");
      await drawer(page)
        .getByLabel("Комментарий агенту")
        .fill("Укажите точный домашний адрес.");
      await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
      await expect(
        drawer(page)
          .locator(".issue-row")
          .filter({ hasText: "Кузнецова Анна · Данные · Домашний адрес" })
          .first(),
      ).toBeVisible();
      await drawer(page).getByRole("button", { name: "Вернуть", exact: true }).click();
      await expect(drawer(page).getByText("Возвращено")).toBeVisible();
      await page.getByRole("button", { name: "Закрыть подачу" }).click();
    });

    await test.step("admin accepts other submitted packages", async () => {
      for (const title of [secondFamilyTitle, firstSingle, secondSingle]) {
        await openAdminSubmission(page, title);
        await drawer(page).getByRole("button", { name: "Принять" }).click();
        await expect(drawer(page).getByText(/ПД-\d+ · Готово к выгрузке/)).toBeVisible();
        await page.getByRole("button", { name: "Закрыть подачу" }).click();
      }
    });

    await test.step("agent fixes returned family blockers and resubmits", async () => {
      await page.getByRole("button", { name: "Сменить роль" }).click();
      await page.getByRole("button", { name: "Мои подачи" }).click();
      await submissionCard(page, familyListTitle).click();
      await expect(
        drawer(page).getByRole("button", { name: "Отправить исправления" }),
      ).toBeDisabled();
      await openQuestionnaireTab(page);
      const addressInput = drawer(page).getByLabel(
        "Кузнецова Анна · Адрес и контакты · Домашний адрес",
      );
      await expect(addressInput).toHaveAttribute("aria-invalid", "true");
      await addressInput.fill("Апартаменты подтверждены, Мадрид");
      await openMediaTab(page);
      await uploadAllVisibleFiles(page);
      await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
      await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
      await page.getByRole("button", { name: "Закрыть подачу" }).click();
    });

    await test.step("admin accepts returned family corrections", async () => {
      await seedAdminRole(page);
      await openCorrectionsTab(page);
      await openAdminSubmission(page, familyTitle);
      await drawer(page).getByRole("button", { name: "Закрыть и принять" }).click();
      await expect(drawer(page).getByText(/ПД-\d+ · Готово к выгрузке/)).toBeVisible();
      await page.getByRole("button", { name: "Закрыть подачу" }).click();
    });

    await test.step("export blocks mixed family and single package", async () => {
      await page.getByRole("button", { name: "Выгрузка" }).click();
      await clearExportSelection(page);
      await page
        .locator(".export-row")
        .filter({ hasText: familyTitle })
        .getByRole("checkbox")
        .check();
      await page
        .locator(".export-row")
        .filter({ hasText: firstSingle })
        .getByRole("checkbox")
        .check();
      await expect(
        page
          .locator(".blocker-box")
          .getByText("Нельзя смешивать одинарные и семейные подачи"),
      ).toBeVisible();
    });

    await test.step("export first family package", async () => {
      await page
        .locator(".export-row")
        .filter({ hasText: firstSingle })
        .getByRole("checkbox")
        .uncheck();
      await expect(
        page.locator(".export-preview").getByText("1 подача · 4 строки"),
      ).toBeVisible();
      await expect(page.locator(".export-preview").getByText("4/4")).toBeVisible();
      await expect(
        page.locator(".export-preview").getByText("Тип: Семья"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Сформировать Эксель" }).click();
      await page.getByRole("button", { name: "Скачать" }).click();
      await page.getByRole("button", { name: "Отметить выгружено" }).click();
    });

    await test.step("export second family package", async () => {
      await clearExportSelection(page);
      await page
        .locator(".export-row")
        .filter({ hasText: secondFamilyTitle })
        .getByRole("checkbox")
        .check();
      await expect(
        page.locator(".export-preview").getByText("1 подача · 4 строки"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Сформировать Эксель" }).click();
      await page.getByRole("button", { name: "Скачать" }).click();
      await page.getByRole("button", { name: "Отметить выгружено" }).click();
    });

    await test.step("export two single applicants together", async () => {
      await clearExportSelection(page);
      await page
        .locator(".export-row")
        .filter({ hasText: firstSingle })
        .getByRole("checkbox")
        .check();
      await page
        .locator(".export-row")
        .filter({ hasText: secondSingle })
        .getByRole("checkbox")
        .check();
      await expect(
        page.locator(".export-preview").getByText("2 подачи · 2 строки"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Сформировать Эксель" }).click();
      await page.getByRole("button", { name: "Скачать" }).click();
      await page.getByRole("button", { name: "Отметить выгружено" }).click();
    });

    await test.step("export history contains all generated packages", async () => {
      await page.getByRole("tab", { name: "История" }).click();
      await expect(
        page.locator(".submission-panel").getByText(familyTitle),
      ).toBeVisible();
      await expect(
        page.locator(".submission-panel").getByText(secondFamilyTitle),
      ).toBeVisible();
      await expect(
        page.locator(".submission-panel").getByText(firstSingle),
      ).toBeVisible();
      await expect(
        page.locator(".submission-panel").getByText(secondSingle),
      ).toBeVisible();
    });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
