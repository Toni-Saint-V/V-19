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

async function switchToAdmin(page: Page) {
  await page.getByRole("button", { name: "Сменить роль" }).click();
  await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();
}

function submissionCard(page: Page, name: string) {
  return page.locator(".submission-card").filter({ hasText: name }).first();
}

function drawer(page: Page) {
  return page.getByRole("dialog").first();
}

function selectedContext(page: Page) {
  return page.locator(".selected-context").first();
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
  const fields = drawer(page).locator(".questionnaire-field input:not([disabled])");
  const count = await fields.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const input = fields.nth(index);
    const label = (await input.getAttribute("aria-label")) ?? "";
    await input.fill(questionnaireValue(label, index));
  }

  await expect(drawer(page).getByText("Анкета готова").first()).toBeVisible();
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

async function createNamedSubmission(
  page: Page,
  input: { names: string[]; type: "single" | "family" },
) {
  await page.getByRole("button", { name: "Новая подача" }).click();
  if (input.type === "family")
    await drawer(page).getByRole("button", { name: "Семья" }).click();
  await drawer(page).getByRole("tab", { name: "Заявители" }).click();

  if (input.type === "family") {
    await drawer(page).getByLabel("Количество").fill(String(input.names.length));
    await drawer(page).getByLabel("Основной заявитель").fill(input.names[0]);
    await drawer(page).getByLabel("Супруг").fill(input.names[1]);
    await drawer(page).getByLabel("Ребёнок 1").fill(input.names[2]);
    await drawer(page).getByLabel("Ребёнок 2").fill(input.names[3]);
  } else {
    await drawer(page).getByLabel("Заявитель").fill(input.names[0]);
  }

  await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
}

async function fillFilesAndSubmit(page: Page) {
  await drawer(page).getByRole("tab", { name: "Файлы" }).click();
  await uploadAllVisibleFiles(page);
  await drawer(page).getByRole("button", { name: "Продолжить" }).click();
  await drawer(page).getByRole("button", { name: "На проверку" }).click();
  await expect(drawer(page).getByText("На проверке")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть подачу" }).click();
}

async function clearExportSelection(page: Page) {
  const checked = page.locator(".export-row input:checked");
  while ((await checked.count()) > 0) {
    await checked.first().uncheck();
  }
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
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Новая подача" })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Фильтр по городу" }),
    ).toBeVisible();
    await expect(submissionCard(page, "Семья Ивановых")).toBeVisible();
    await expect(
      submissionCard(page, "Семья Ивановых").getByText("Возвращено"),
    ).toBeVisible();
    await expect(
      submissionCard(page, "Семья Ивановых").getByText("2 блокера", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Исправить" }).first()).toBeVisible();

    await expectNoRetiredNavigation(page);
  });

  test("primary surfaces expose the 3-second decision frame", async ({ page }) => {
    const agentContext = selectedContext(page);
    await expect(
      agentContext.getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(agentContext.getByText("Возвращено")).toBeVisible();
    await expect(
      agentContext.getByText("2 блокера мешают движению дальше"),
    ).toBeVisible();
    await expect(agentContext.getByText("Действует")).toBeVisible();
    await expect(agentContext.getByText("Агент", { exact: true })).toBeVisible();
    await expect(agentContext.getByText("Следующая кнопка")).toBeVisible();
    await expect(agentContext.getByRole("button", { name: "Исправить" })).toBeVisible();

    await agentContext.getByRole("button", { name: "Исправить" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
    await expect(drawer(page).getByText("Мария Иванова · Файлы · Фото")).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await switchToAdmin(page);
    const adminContext = selectedContext(page);
    await expect(
      adminContext.getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();
    await expect(adminContext.getByText("На проверке")).toBeVisible();
    await expect(adminContext.getByText("Ожидает внутренней проверки")).toBeVisible();
    await expect(adminContext.getByText("Ответственный")).toBeVisible();
    await expect(
      adminContext.getByText("Администратор", { exact: true }),
    ).toBeVisible();
    await expect(adminContext.getByRole("button", { name: "Проверить" })).toBeVisible();
    await adminContext.getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await expect(
      drawer(page).getByText("Нина Волкова · Анкета · Маршрут поездки"),
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
    await page.getByRole("button", { name: "Открыть первую" }).click();
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
    await expect(page.locator(".export-preview").getByText("0 строк")).toBeVisible();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Выберите хотя бы одну подачу",
    );
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
    await page.getByRole("button", { name: "Новая подача" }).click();
    await expect(page.getByRole("heading", { name: "Создать черновик" })).toBeVisible();
    await expect(page.locator('input[readonly][value="Испания"]')).toBeVisible();
    await expect(
      drawer(page).getByRole("combobox", { name: "Город подачи" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Семья" }).click();
    await page.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Новая семейная подача" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("Черновик")).toBeVisible();
    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    await expect(
      drawer(page).getByRole("button", { name: "Заполнить анкету" }),
    ).toHaveCount(0);
    await fillQuestionnaire(page);
    await drawer(page).getByRole("tab", { name: "Файлы" }).click();
    await uploadAllVisibleFiles(page);
    await expect(
      drawer(page).getByRole("button", { name: /^(Загрузить|Заменить)/ }),
    ).toHaveCount(0);
    await drawer(page).getByRole("button", { name: "Продолжить" }).click();
    await expect(drawer(page).getByText("В работе")).toBeVisible();
    await drawer(page).getByRole("button", { name: "На проверку" }).click();
    await expect(drawer(page).getByText("На проверке")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Исправить" }).first().click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Замечания" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(drawer(page).getByText("Мария Иванова · Файлы · Фото")).toBeVisible();
    await expect(drawer(page).getByText("София Иванова · Файлы · Видео")).toBeVisible();

    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeDisabled();
    await expect(
      drawer(page).getByText("Сначала исправьте целевые замечания"),
    ).toBeVisible();
    await drawer(page).getByRole("tab", { name: "Файлы" }).click();
    await uploadAllVisibleFiles(page);
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправлено агентом").first()).toBeVisible();
    await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
  });

  test("drawer tabs and close flow work from keyboard", async ({ page }) => {
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

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("dirty create drawer confirms close from keyboard", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Новая подача" });
    await trigger.click();

    const paramsTab = drawer(page).getByRole("tab", { name: "Параметры" });
    await expect(paramsTab).toHaveAttribute("aria-selected", "true");
    await expect(paramsTab).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(drawer(page).getByRole("tab", { name: "Заявители" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.keyboard.press("Home");
    await expect(paramsTab).toHaveAttribute("aria-selected", "true");

    await drawer(page).getByRole("button", { name: "Семья" }).click();
    await page.keyboard.press("Escape");

    const confirmation = page.getByRole("dialog", { name: "Закрыть панель?" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Остаться" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(paramsTab).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Закрыть без сохранения" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("created draft persists after reload", async ({ page }) => {
    await page.getByRole("button", { name: "Новая подача" }).click();
    await page.getByRole("button", { name: "Семья" }).click();
    await page.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Новая семейная подача" }),
    ).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "В работе" }).click();
    await expect(submissionCard(page, "Новая семейная подача")).toBeVisible();
    await expect(
      submissionCard(page, "Новая семейная подача").getByText("Черновик"),
    ).toBeVisible();
  });

  test("agent sees ББ suggestions without admin issue actions", async ({ page }) => {
    await page.getByRole("button", { name: "Исправить" }).first().click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("ББ-помощник", { exact: true })).toBeVisible();

    await drawer(page).getByRole("button", { name: "Проверить ББ" }).click();

    await expect(drawer(page).getByText("Есть подсказки")).toBeVisible();
    await expect(
      drawer(page).getByText("Проверит администратор").first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Добавить как замечание" }),
    ).toHaveCount(0);
  });

  test("admin converts a ББ suggestion into a precise issue", async ({ page }) => {
    await switchToAdmin(page);
    await page.getByRole("button", { name: "Открыть первую" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();

    await drawer(page).getByRole("button", { name: "Проверить ББ" }).click();
    await expect(drawer(page).getByText("Есть подсказки")).toBeVisible();

    await drawer(page)
      .getByRole("button", { name: "Добавить как замечание" })
      .first()
      .click();

    await expect(drawer(page).getByText("Нина Волкова · Файлы · Фото")).toBeVisible();
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
    await expect(drawer(page).getByText("Нина Волкова · Файлы · Фото")).toBeVisible();
    await expect(
      drawer(page).getByText("Агент отправил подачу на проверку"),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Вернуть" }).click();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
  });

  test("admin can add a precise issue and return a submission", async ({ page }) => {
    await switchToAdmin(page);
    await expect(page.getByRole("button", { name: "Проверка" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Выгрузка" })).toBeVisible();
    await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Открыть первую" }).click();
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
      drawer(page).getByText("Нина Волкова · Анкета · Маршрут поездки"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Вернуть" }).click();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
  });

  test("admin accepts corrections and completes the export sequence", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await page.getByRole("tab", { name: "Исправления получены" }).click();
    await expect(submissionCard(page, "Семья Петровых")).toBeVisible();

    await submissionCard(page, "Семья Петровых")
      .getByRole("button", { name: "Проверить исправления" })
      .click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Петровых" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("Исправлено агентом")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть и принять" }).click();
    await expect(drawer(page).getByText("Готово к выгрузке")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Выгрузка" }).click();
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    await expect(page.getByText("Предпросмотр Эксель")).toBeVisible();
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
    await switchToAdmin(page);
    await page.getByRole("tab", { name: "Исправления получены" }).click();
    await submissionCard(page, "Семья Петровых")
      .getByRole("button", { name: "Проверить исправления" })
      .click();
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

    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    await fillQuestionnaire(page);
    await drawer(page).getByRole("tab", { name: "Файлы" }).click();
    await uploadAllVisibleFiles(page);
    await drawer(page).getByRole("button", { name: "Продолжить" }).click();
    await drawer(page).getByRole("button", { name: "На проверку" }).click();
    await expect(drawer(page).getByText("На проверке")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await switchToAdmin(page);
    await page.getByRole("tab", { name: "На проверке" }).click();
    await submissionCard(page, "Новая подача")
      .getByRole("button", { name: "Проверить" })
      .click();
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
    await expect(
      drawer(page).getByText("Новый заявитель · Анкета · Маршрут поездки"),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Вернуть" }).click();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await page.getByRole("button", { name: "Сменить роль" }).click();
    await submissionCard(page, "Новая подача")
      .getByRole("button", { name: "Исправить" })
      .click();
    await expect(page.getByRole("tab", { name: "Замечания" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    const routeInput = drawer(page).getByLabel(
      "Новый заявитель · Поездка · Маршрут поездки",
    );
    await expect(routeInput).toHaveAttribute("aria-invalid", "true");
    await routeInput.fill("Москва, Барселона, Москва");
    await expect(routeInput).toHaveAttribute("aria-invalid", "true");
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    await expect(
      drawer(page).getByLabel("Новый заявитель · Поездка · Маршрут поездки"),
    ).toHaveAttribute("aria-invalid", "false");
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await switchToAdmin(page);
    await page.getByRole("tab", { name: "Исправления получены" }).click();
    await submissionCard(page, "Новая подача")
      .getByRole("button", { name: "Проверить исправления" })
      .click();
    await drawer(page).getByRole("button", { name: "Закрыть и принять" }).click();
    await expect(drawer(page).getByText("Готово к выгрузке")).toBeVisible();
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

  test("family and two single applicants pass issue, ББ, return, correction and export corner cases", async ({
    page,
  }) => {
    const familyTitle = "Семья Кузнецовых";
    const firstSingle = "Романов Павел";
    const secondSingle = "Белова Ольга";

    await createNamedSubmission(page, {
      type: "family",
      names: ["Кузнецова Анна", "Кузнецов Иван", "Кузнецова Маша", "Кузнецов Лев"],
    });
    await expect(
      drawer(page).getByRole("heading", { name: familyTitle }),
    ).toBeVisible();
    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    await fillQuestionnaire(page);
    await fillFilesAndSubmit(page);

    await createNamedSubmission(page, { type: "single", names: [firstSingle] });
    await expect(
      drawer(page).getByRole("heading", { name: firstSingle }),
    ).toBeVisible();
    await drawer(page).getByRole("tab", { name: "Файлы" }).click();
    await uploadAllVisibleFiles(page);
    await drawer(page).getByRole("button", { name: "Продолжить" }).click();
    await expect(
      drawer(page).getByRole("button", { name: "На проверку" }),
    ).toBeDisabled();
    await expect(
      drawer(page).getByText("Есть незаполненные поля или недостающие файлы"),
    ).toBeVisible();
    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    await fillQuestionnaire(page);
    await drawer(page).getByRole("button", { name: "На проверку" }).click();
    await expect(drawer(page).getByText("На проверке")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await createNamedSubmission(page, { type: "single", names: [secondSingle] });
    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    await fillQuestionnaire(page);
    await fillFilesAndSubmit(page);

    await switchToAdmin(page);
    await page.getByRole("tab", { name: "На проверке" }).click();
    await submissionCard(page, familyTitle)
      .getByRole("button", { name: "Проверить" })
      .click();
    await drawer(page).getByRole("button", { name: "Проверить ББ" }).click();
    await expect(drawer(page).getByText("Есть подсказки")).toBeVisible();
    await drawer(page)
      .getByRole("button", { name: "Добавить как замечание" })
      .first()
      .click();
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await drawer(page)
      .getByLabel("Заявитель")
      .selectOption({ label: "Кузнецова Анна" });
    await drawer(page).getByLabel("Поле").selectOption({ label: "Адрес проживания" });
    await drawer(page).getByLabel("Причина").fill("Нужно уточнить адрес проживания");
    await drawer(page)
      .getByLabel("Комментарий агенту")
      .fill("Укажите точный адрес проживания.");
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
    await expect(
      drawer(page).getByText("Кузнецова Анна · Анкета · Адрес проживания"),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Вернуть" }).click();
    await expect(drawer(page).getByText("Возвращено")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    for (const title of [firstSingle, secondSingle]) {
      await submissionCard(page, title)
        .getByRole("button", { name: "Проверить" })
        .click();
      await drawer(page).getByRole("button", { name: "Принять" }).click();
      await expect(drawer(page).getByText("Готово к выгрузке")).toBeVisible();
      await page.getByRole("button", { name: "Закрыть подачу" }).click();
    }

    await page.getByRole("button", { name: "Сменить роль" }).click();
    await submissionCard(page, familyTitle)
      .getByRole("button", { name: "Исправить" })
      .click();
    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeDisabled();
    await drawer(page).getByRole("tab", { name: "Анкета" }).click();
    const addressInput = drawer(page).getByLabel(
      "Кузнецова Анна · Поездка · Адрес проживания",
    );
    await expect(addressInput).toHaveAttribute("aria-invalid", "true");
    await addressInput.fill("Апартаменты подтверждены, Мадрид");
    await drawer(page).getByRole("tab", { name: "Файлы" }).click();
    await uploadAllVisibleFiles(page);
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await switchToAdmin(page);
    await page.getByRole("tab", { name: "Исправления получены" }).click();
    await submissionCard(page, familyTitle)
      .getByRole("button", { name: "Проверить исправления" })
      .click();
    await drawer(page).getByRole("button", { name: "Закрыть и принять" }).click();
    await expect(drawer(page).getByText("Готово к выгрузке")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

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
    await page
      .locator(".export-row")
      .filter({ hasText: firstSingle })
      .getByRole("checkbox")
      .uncheck();
    await expect(page.locator(".export-preview").getByText("4 строк")).toBeVisible();
    await expect(page.locator(".export-preview").getByText("4/4")).toBeVisible();
    await expect(
      page.locator(".export-preview").getByText("Тип подачи совпадает"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Сформировать Эксель" }).click();
    await page.getByRole("button", { name: "Скачать" }).click();
    await page.getByRole("button", { name: "Отметить выгружено" }).click();

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
    await expect(page.locator(".export-preview").getByText("2 строк")).toBeVisible();
    await page.getByRole("button", { name: "Сформировать Эксель" }).click();
    await page.getByRole("button", { name: "Скачать" }).click();
    await page.getByRole("button", { name: "Отметить выгружено" }).click();
    await page.getByRole("tab", { name: "История" }).click();
    await expect(
      page.locator(".submission-panel").getByText(familyTitle),
    ).toBeVisible();
    await expect(
      page.locator(".submission-panel").getByText(firstSingle),
    ).toBeVisible();
    await expect(
      page.locator(".submission-panel").getByText(secondSingle),
    ).toBeVisible();
  });
});
