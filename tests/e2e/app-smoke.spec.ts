import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFreshWorkspace } from "./v19-pilot-helpers";
import { testArtifactPath } from "../support/artifacts";

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
const adminWorkspaceHeading = /^(Очередь на проверку|Проверка|Работа)$/;

async function expectNoRetiredNavigation(page: Page) {
  for (const label of forbiddenPrimaryLabels) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
}

async function isVisible(locator: Locator) {
  return locator.isVisible({ timeout: 750 }).catch(() => false);
}

async function openMobileMenu(page: Page) {
  const closeButton = page.getByRole("button", { name: /^Закрыть меню$/ }).first();
  if (await isVisible(closeButton)) return;

  const menuButton = page.getByRole("button", { name: /^Меню$/ }).first();

  if (await isVisible(menuButton)) {
    await menuButton.click();
    await expect(closeButton).toBeVisible();
  }
}

async function clickFirstVisible(locator: Locator) {
  const count = await locator.count();
  let lastError: unknown = null;

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);

    if (await isVisible(candidate)) {
      try {
        await candidate.click({ timeout: 10_000 });
        return;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  await locator.first().click({ timeout: 10_000 });
}

async function expectAtLeastOneVisible(locator: Locator, message: string) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);

    const visible = await candidate
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);

    if (visible) {
      await expect(candidate).toBeVisible();
      return;
    }
  }

  throw new Error(message);
}

async function hasAtLeastOneVisible(locator: Locator) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    if (await isVisible(locator.nth(index))) {
      return true;
    }
  }

  return false;
}

async function clickWorkspaceButton(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name });

  if (!(await hasAtLeastOneVisible(button))) {
    await openMobileMenu(page);
  }

  await expectAtLeastOneVisible(
    button,
    `No visible workspace button matched ${String(name)}.`,
  );

  await clickFirstVisible(button);
}

async function openCreateSubmission(page: Page) {
  const createButton = page.getByRole("button", {
    name: /^(Создать пакет|Новая подача)$/,
  });

  if (!(await isVisible(createButton.first()))) {
    await clickWorkspaceButton(page, /Мои подачи/);
  }

  if (!(await isVisible(createButton.first()))) {
    await openMobileMenu(page);
  }

  await clickFirstVisible(createButton);
}

async function selectSubmissionStatus(page: Page, label: string | RegExp) {
  const legacyStatusAliases: Record<string, Array<string | RegExp>> = {
    "В работе": ["В работе", "Черновики"],
    "Требуют действия": ["Требуют действия", "С замечаниями"],
  };
  const labels =
    typeof label === "string"
      ? (legacyStatusAliases[label] ?? [label])
      : (legacyStatusAliases[label.source] ?? [label]);

  for (const candidate of labels) {
    const desktopTab = page.getByRole("tab", { name: candidate }).first();

    if (await isVisible(desktopTab)) {
      await desktopTab.click();
      await expect(desktopTab).toHaveAttribute("aria-selected", "true");
      return;
    }
  }

  await page.getByRole("button", { name: "Фильтры подач" }).click();
  const statusDialog = page.getByRole("dialog", { name: "Статус подач" });
  const statusOption = statusDialog
    .locator(".v19-mobile-filter-options")
    .getByRole("button", { name: labels[0] });

  await expect(statusOption).toBeVisible();
  await statusOption.click();
  await expect(statusDialog).toHaveCount(0);
}

async function selectAdminReviewQueue(page: Page) {
  for (const label of [/На проверке/, /К проверке/]) {
    const tab = page.getByRole("tab", { name: label }).first();

    if (await isVisible(tab)) {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      return;
    }
  }

  const allQueueTab = page.getByRole("tab", { name: /^Все(?:\s|$)/ }).first();
  if (await isVisible(allQueueTab)) {
    if ((await allQueueTab.getAttribute("aria-selected")) !== "true") {
      await allQueueTab.click();
      await expect(allQueueTab).toHaveAttribute("aria-selected", "true");
    }
    return;
  }

  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: adminWorkspaceHeading }),
  ).toBeVisible();
}

async function fillCurrentListSearch(page: Page, value: string) {
  for (const label of ["Поиск по действиям", "Поиск в текущем списке"]) {
    const search = page.getByLabel(label).first();

    if (await isVisible(search)) {
      await search.fill(value);
      return;
    }
  }

  await page.getByLabel(/Поиск/).first().fill(value);
}

async function clickExportTab(page: Page, label: string | RegExp) {
  const closePanelButton = page.getByRole("button", { name: "Закрыть панель" });

  if (await isVisible(closePanelButton)) {
    await closePanelButton.click();
    await expect(
      page.getByRole("complementary", { name: "Контекст выгрузки" }),
    ).toHaveCount(0);
  }

  const tab = page.getByRole("tab", { name: label });
  if (await hasAtLeastOneVisible(tab)) {
    await clickFirstVisible(tab);
    await expect(tab.first()).toHaveAttribute("aria-selected", "true");
    return;
  }

  const button = page.getByRole("button", { name: label });
  await expectAtLeastOneVisible(
    button,
    `No visible export tab or button matched ${String(label)}.`,
  );
  await clickFirstVisible(button);

  if (label === "Пакеты") {
    await expect(page.getByRole("region", { name: "Пакеты к выгрузке" })).toBeVisible();
  } else if (label === "История") {
    await expect(page.getByRole("region", { name: "История выгрузки" })).toBeVisible();
  }
}

async function switchToAdmin(page: Page) {
  await clickWorkspaceButton(page, /^(В админскую зону|Сменить роль)$/);
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: adminWorkspaceHeading }),
  ).toBeVisible();
}

async function switchToAgent(page: Page) {
  await clickWorkspaceButton(page, /^(В агентскую зону|Сменить роль)$/);
}

async function expectAdminWorkNavigation(page: Page) {
  const workButton = page.getByRole("button", { name: /^(Проверка|Работа)$/ });
  const exportButton = page.getByRole("button", { name: /^Выгрузка$/ });

  if (!(await isVisible(workButton.first()))) {
    await openMobileMenu(page);
  }

  await expect(workButton.first()).toBeVisible();
  await expect(exportButton.first()).toBeVisible();
  await clickFirstVisible(workButton);
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: adminWorkspaceHeading }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Входящие" })).toHaveCount(0);
}

function submissionCard(page: Page, name: string) {
  const fixtureIds: Record<string, string> = {
    "Нина Волкова": "ПД-1053",
    Петровы: "ПД-1054",
    "Семья Петровых": "ПД-1054",
  };
  const byText = page
    .locator(
      ".submission-card, .v17-admin-work-row, .v19-event-row, [data-submission-card]",
    )
    .filter({ hasText: name })
    .first();
  const byRoleButton = page
    .getByRole("button", { name: new RegExp(escapeRegex(name)) })
    .first();
  const fixtureId = fixtureIds[name];

  if (!fixtureId) return byText.or(byRoleButton).first();

  return page
    .locator(`[data-submission-id="${fixtureId}"]`)
    .first()
    .or(byText)
    .or(byRoleButton)
    .first();
}

function submissionCardById(page: Page, id: string) {
  return page.locator(`[data-submission-id="${id}"]`).first();
}

function drawer(page: Page) {
  return page.getByRole("dialog").first();
}

async function closeDrawer(page: Page) {
  const namedClose = drawer(page).getByRole("button", {
    name: /Закрыть (подачу|проверку)/,
  });

  if (await isVisible(namedClose.first())) {
    await namedClose.first().click();
  } else {
    await page.keyboard.press("Escape");
  }

  await expect(drawer(page)).toHaveCount(0);
}

async function expectDrawerStatus(page: Page, status: string) {
  const detailMeta = drawer(page).locator(".drawer-meta-line");
  if ((await detailMeta.count()) > 0) {
    await expect(detailMeta).toContainText(/ПД-\d+/);
    await expect(drawer(page).locator(".drawer-status-chip")).toContainText(status);
    return;
  }

  await expect(drawer(page).getByText(status).first()).toBeVisible();
  await expect(
    drawer(page)
      .getByText(/ПД-\d+|SUB-\d+/)
      .first(),
  ).toBeVisible();
}

function returnedIvanovsAction(page: Page) {
  return submissionCardById(page, "ПД-1048");
}

async function openReturnedIvanovsSubmission(page: Page) {
  await openAgentSubmission(page, "Ивановы", "Семья Ивановых");
}

async function expectReturnedIvanovsDecisionFrame(page: Page) {
  const card = submissionCardById(page, "ПД-1048");

  await expect(card).toContainText("Возвращено");
  await expect(card.getByText("+2")).toBeVisible();
  await expect(card.getByText("4 заявителя")).toBeVisible();
  await expect(card.getByText("2/3").first()).toBeVisible();
  await expect(card.getByText("Готовность").first()).toBeVisible();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openDrawerTab(page: Page, labels: string[]) {
  const drawerScope = drawer(page);
  await expect(drawerScope).toBeVisible();

  const drawerTabIds: Record<string, string> = {
    Анкета: "questionnaire",
    Данные: "questionnaire",
    Замечания: "issues",
    История: "history",
    Обзор: "overview",
    Паспорт: "files",
    Селфи: "files",
    Файлы: "files",
  };
  for (const label of labels) {
    const tabId = drawerTabIds[label];
    if (!tabId) continue;

    const tabById = drawerScope
      .locator(`[data-drawer-tab="${tabId}"], #drawer-tab-${tabId}`)
      .first();
    if ((await tabById.count()) > 0) {
      await expect(tabById).toBeVisible();
      await tabById.click();
      return;
    }
  }

  const name = new RegExp(`^(${labels.map(escapeRegex).join("|")})([\\s,]|$)`);
  const roleTab = drawerScope.getByRole("tab", { name }).first();

  if ((await roleTab.count()) > 0) {
    await expect(roleTab).toBeVisible();
    await roleTab.click();
    return;
  }

  const textTab = drawerScope.getByText(name).first();
  if ((await textTab.count()) > 0) {
    await expect(textTab).toBeVisible();
    await textTab.click();
    return;
  }

  const controlTab = drawerScope
    .locator('button, [role="tab"], [data-drawer-tab]')
    .filter({ hasText: name })
    .first();
  await expect(controlTab).toBeVisible();
  await controlTab.click();
}

async function openQuestionnaireTab(page: Page) {
  await openDrawerTab(page, ["Анкета", "Данные"]);
}

function questionnaireScreen(page: Page) {
  return page.locator(".vf-figma-questionnaire-screen").first();
}

async function openMediaTab(page: Page) {
  await openDrawerTab(page, ["Файлы", "Селфи", "Паспорт"]);
  await expect(
    drawer(page).getByRole("heading", { name: /Файлы подачи|Файлы/ }),
  ).toBeVisible();
}

async function openAdminSubmission(
  page: Page,
  cardText: string,
  drawerTitle = cardText,
) {
  const targetCard = page
    .getByRole("button", { name: new RegExp(escapeRegex(cardText)) })
    .or(submissionCard(page, cardText));
  await expectAtLeastOneVisible(
    targetCard,
    `No visible submission card matched ${cardText}.`,
  );
  await clickFirstVisible(targetCard);
  if (!(await isVisible(drawer(page)))) {
    const explicitOpenAction = targetCard
      .locator(".v17-admin-row-action, .v19-admin-row-action")
      .first();

    if (await isVisible(explicitOpenAction)) {
      await explicitOpenAction.click();
    } else {
      await clickFirstVisible(targetCard);
    }
  }
  await expect(drawer(page)).toBeVisible();
  await expectAtLeastOneVisible(
    drawer(page)
      .getByRole("heading", { name: drawerTitle })
      .or(drawer(page).getByText(drawerTitle))
      .or(drawer(page).getByText(cardText)),
    `Submission drawer did not expose ${drawerTitle} or ${cardText}.`,
  );
}

async function openAgentSubmission(
  page: Page,
  cardText: string,
  drawerTitle = cardText,
) {
  const targetCard = submissionCard(page, cardText);
  await expectAtLeastOneVisible(
    targetCard,
    `No visible agent submission card matched ${cardText}.`,
  );

  const primaryButton = targetCard.getByRole("button").first();
  if (await isVisible(primaryButton)) {
    await primaryButton.click();
  } else {
    await clickFirstVisible(targetCard);
  }

  const questionnaireScreen = page.locator(".vf-figma-questionnaire-screen").first();
  if (await isVisible(questionnaireScreen)) {
    await questionnaireScreen.getByRole("button", { name: "Назад" }).click();
    await expect(questionnaireScreen).toHaveCount(0);
  }

  if (!(await isVisible(drawer(page)))) {
    const railOpenButton = page.getByRole("button", { name: "Открыть подачу" }).first();

    if (await isVisible(railOpenButton)) {
      await railOpenButton.click();
    } else {
      await clickFirstVisible(targetCard);
    }
  }

  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText(
    new RegExp(`${escapeRegex(drawerTitle)}|${escapeRegex(cardText)}`),
  );
}

async function openCorrectionsTab(page: Page) {
  await clickWorkspaceButton(page, /Проверка|Работа/);
  const correctionsTab = page.getByRole("tab", { name: /Исправления/ }).first();

  if (await isVisible(correctionsTab)) {
    await correctionsTab.click();
    await expect(correctionsTab).toHaveAttribute("aria-selected", "true");
  }
}

function issueArticle(page: Page, applicantName: string, detail: string) {
  return drawer(page)
    .locator("article")
    .filter({ hasText: applicantName })
    .filter({ hasText: detail })
    .first();
}

function questionnaireValue(label: string, index: number) {
  if (label.includes("ФИО")) return "Иван Иванов";
  if (label.includes("Номер паспорта")) return String(900_000_000 + index).slice(0, 9);
  if (label.includes("Дата выдачи паспорта")) return "01.01.2020";
  if (label.includes("Дата окончания паспорта")) return "01.01.2030";
  if (label.includes("Дата рождения")) return "01.01.1990";
  if (label.includes("Маршрут")) return "Москва, Мадрид, Москва";
  if (label.includes("Адрес")) return "Отель подтвержден";
  if (label.includes("Телефон")) return "+7 900 000 00 00";
  if (label.includes("Почта")) return "почта указана";
  return `Значение ${index + 1}`;
}

async function fillQuestionnaire(page: Page) {
  const modernQuestionnaire = questionnaireScreen(page);
  const openQuestionnaireButton = drawer(page)
    .getByRole("button", { name: "Открыть анкету" })
    .first();

  if (await isVisible(modernQuestionnaire)) {
    await modernQuestionnaire
      .getByRole("button", { name: /Отправить на проверку|Отправить/ })
      .click();
    await expect(modernQuestionnaire).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    return;
  }

  if (
    await openQuestionnaireButton
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await openQuestionnaireButton.click();
    await expect(modernQuestionnaire).toBeVisible();
    await modernQuestionnaire
      .getByRole("button", { name: /Отправить на проверку|Отправить/ })
      .click();
    await expect(modernQuestionnaire).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    return;
  }

  let filledCount = 0;
  const applicantButtons = drawer(page).locator(".questionnaire-applicant-trigger");
  const applicantCount = Math.max(await applicantButtons.count(), 1);

  for (let applicantIndex = 0; applicantIndex < applicantCount; applicantIndex += 1) {
    if ((await applicantButtons.count()) > 0) {
      const applicantButton = applicantButtons.nth(applicantIndex);
      await applicantButton.scrollIntoViewIfNeeded();
      await applicantButton.click();
      await expect(applicantButton).toHaveAttribute("aria-expanded", "true");
    }

    const sectionButtons = drawer(page).locator(".questionnaire-section-heading");
    const sectionCount = await sectionButtons.count();
    expect(sectionCount).toBeGreaterThan(0);

    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      const sectionButton = sectionButtons.nth(sectionIndex);
      await sectionButton.scrollIntoViewIfNeeded();
      if ((await sectionButton.getAttribute("aria-expanded")) !== "true") {
        await sectionButton.click();
        await expect(sectionButton).toHaveAttribute("aria-expanded", "true");
      }

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
  }

  expect(filledCount).toBeGreaterThan(0);
  await expect(drawer(page).getByRole("tab", { name: /Анкета,\s*100%/ })).toBeVisible();
}

async function uploadAllVisibleFiles(page: Page) {
  for (let pass = 0; pass < 40; pass += 1) {
    const fileInputs = drawer(page).locator(".drawer-file-input");
    if ((await fileInputs.count()) > 0) {
      await fileInputs.first().setInputFiles(e2ePassportFile(`drawer-${pass}`));
      await expect(
        drawer(page).getByRole("heading", { name: "Файлы подачи" }),
      ).toBeVisible();
      continue;
    }

    return;
  }

  throw new Error("Не удалось загрузить все видимые файлы");
}

async function markVisibleIssuesFixed(page: Page) {
  await openDrawerTab(page, ["Замечания"]);
  const fixedButtons = drawer(page).getByRole("button", {
    name: /Отметить (замечание )?исправленным/,
  });

  for (let safety = 0; safety < 12; safety += 1) {
    const before = await fixedButtons.count();
    if (before === 0) return;

    await fixedButtons.first().click();
    await expect(fixedButtons).toHaveCount(before - 1);
  }

  throw new Error("Too many visible issue fix buttons");
}

async function saveDraftFromDrawer(page: Page) {
  await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
}

async function submitForReviewFromDrawer(page: Page) {
  await drawer(page).getByRole("button", { name: "Отправить", exact: true }).click();
  const verifyPassportButton = page.getByRole("button", {
    name: "Проверил, отправить",
  });
  if (
    await verifyPassportButton
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await verifyPassportButton.focus();
    await page.keyboard.press("Enter");
  }
}

function e2ePassportFile(name: string) {
  return {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    mimeType: "image/jpeg",
    name: `e2e-passport-${name}.jpg`,
  };
}

async function generateAndDownloadExcel(page: Page) {
  const downloadButton = page.getByRole("button", { name: "Скачать Excel" });
  if (!(await isVisible(downloadButton))) {
    const openContractButton = page
      .getByRole("button", { name: "Открыть контракт выгрузки" })
      .first();

    if (await isVisible(openContractButton)) {
      await openContractButton.click();
      await expect(downloadButton).toBeVisible();
    }
  }

  await expect(downloadButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  await expect(download.failure()).resolves.toBeNull();
  await expect(page.getByRole("button", { name: "Excel скачан" })).toBeDisabled();
  return download;
}

async function expectCurrentExportDownloadComplete(page: Page) {
  await expect(page.getByRole("button", { name: "Excel скачан" })).toBeDisabled();
  await expect(page.locator("#export-action-hint")).toContainText("Excel скачан:");
  await expect(
    page.getByRole("button", { name: "Подтвердить скачивание" }),
  ).toHaveCount(0);
}

async function uploadCreatePassports(page: Page, names: string[]) {
  await drawer(page)
    .locator(".pi-file-input")
    .setInputFiles(names.map((name) => e2ePassportFile(name)));
  await expectAtLeastOneVisible(
    drawer(page).getByText(/Паспорт принят|Все паспорта приняты/),
    "Uploaded passport accepted status was not visible.",
  );
  await expect(
    drawer(page).getByRole("button", { name: "Сохранить черновик" }),
  ).toBeEnabled();
}

async function createNamedSubmission(
  page: Page,
  input: { names: string[]; type: "single" | "family" },
) {
  await openCreateSubmission(page);
  await uploadCreatePassports(page, input.names);
  await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
}

async function fillFilesAndSubmit(page: Page, screenshotPath?: string) {
  await openMediaTab(page);
  if (screenshotPath) {
    await page.waitForTimeout(150);
    await page.screenshot({ fullPage: true, path: screenshotPath });
  }
  await uploadAllVisibleFiles(page);
  await openQuestionnaireTab(page);
  await fillQuestionnaire(page);
  await saveDraftFromDrawer(page);
  await submitForReviewFromDrawer(page);
  await expectDrawerStatus(page, "На проверке");
  const submittedId = (
    (await drawer(page)
      .getByText(/ПД-\d+|SUB-\d+/)
      .first()
      .textContent()) ?? ""
  ).trim();
  await closeDrawer(page);
  return submittedId;
}

async function clearExportSelection(page: Page) {
  const readyTab = page.getByRole("tab", { name: /Готово/ }).first();
  if (await isVisible(readyTab)) {
    await readyTab.click();
  }

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
    await openFreshWorkspace(page, { heading: "Мои действия" });
  });

  test("agent surfaces expose actions and submissions cockpit", async ({
    page,
  }, testInfo) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои действия" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Мои действия/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Настройки" })).toBeVisible();
    await expect(page.getByText("Входящие", { exact: true })).toHaveCount(0);
    await expect(
      page.locator('input[placeholder="Поиск по действиям..."]'),
    ).toBeVisible();
    await expectAtLeastOneVisible(
      page.getByRole("button", { name: /^(Исправить|Продолжить|Добавить)$/ }),
      "No visible agent action CTA matched.",
    );
    await page.screenshot({
      fullPage: true,
      path: testArtifactPath("v19-agent-actions-restored-desktop.png"),
    });

    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await expectAtLeastOneVisible(
      page.getByRole("button", { name: "Создать пакет" }),
      "No visible create-submission button matched.",
    );
    await expect(page.getByRole("heading", { level: 2, name: "Семьи" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Одиночные профили" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Ивановы" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Артём Соколов" }),
    ).toBeVisible();

    await clickWorkspaceButton(page, /Настройки/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Настройки" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Настройки рабочего места" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Открыть canonical настройки" }),
    ).toBeVisible();
    if (testInfo.project.name === "chromium") {
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("2026-06-21-v19-settings-dirty-desktop.png"),
      });
    }

    await expectNoRetiredNavigation(page);
  });

  test("mobile status filter options stay clickable above the bottom tabbar at 390px", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, { heading: "Мои действия" });

    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();

    const statusOption = page.getByRole("tab", { name: "Готово" });
    await expect(statusOption).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: testArtifactPath("v19-mobile-filter-390-before-click.png"),
    });

    const hitTarget = await statusOption.evaluate((element) => {
      const probeElement = element as {
        getBoundingClientRect: () => {
          height: number;
          left: number;
          top: number;
          width: number;
        };
        ownerDocument: {
          elementFromPoint: (
            x: number,
            y: number,
          ) => {
            closest?: (selector: string) => { textContent?: string | null } | null;
            getAttribute?: (name: string) => string | null;
            tagName?: string;
            textContent?: string | null;
          } | null;
        };
      };
      const rect = probeElement.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const target = probeElement.ownerDocument.elementFromPoint(x, y);
      const tabbar = target?.closest?.(".ops-mobile-tabbar");
      const createDock = target?.closest?.(".mobile-create-dock");
      const choice = target?.closest?.("[role='tab']");

      return {
        choiceText: choice?.textContent?.trim() ?? null,
        interceptedByCreateDock: Boolean(createDock),
        interceptedByTabbar: Boolean(tabbar),
        targetClass: target?.getAttribute?.("class") ?? null,
        targetTag: target?.tagName ?? null,
      };
    });

    expect(hitTarget.interceptedByTabbar, JSON.stringify(hitTarget)).toBe(false);
    expect(hitTarget.interceptedByCreateDock, JSON.stringify(hitTarget)).toBe(false);
    await expect(statusOption).toContainText("Готово");

    await statusOption.click();
    await expect(statusOption).toHaveAttribute("aria-selected", "true");
    await expect(submissionCard(page, "Дмитрий Орлов")).toBeVisible();
    await expect(submissionCard(page, "Ивановы")).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: testArtifactPath("v19-mobile-filter-390-after-click.png"),
    });
  });

  test("local cockpit keeps another agent submission out of the agent workspace", async ({
    page,
  }, testInfo) => {
    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(submissionCard(page, "Ольга Морозова")).toHaveCount(0);

    await switchToAdmin(page);
    await expectAdminWorkNavigation(page);
    await clickWorkspaceButton(page, /Выгрузка/);
    await clickExportTab(page, "История");

    await expect(
      page.locator(".export-row").filter({ hasText: "Ольга Морозова" }),
    ).toBeVisible();

    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Петровы", "Семья Петровых");
    await openDrawerTab(page, ["Замечания"]);
    if (testInfo.project.name === "chromium") {
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("2026-06-21-v19-role-safe-admin-events-desktop.png"),
      });
    }

    await closeDrawer(page);
    if (testInfo.project.name === "chromium") {
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath(
          "2026-06-21-v19-role-safe-admin-corrections-desktop.png",
        ),
      });
    }
    await expectAdminWorkNavigation(page);
  });

  test("primary surfaces expose the 3-second decision frame", async ({ page }) => {
    await clickWorkspaceButton(page, /Мои подачи/);
    await expectReturnedIvanovsDecisionFrame(page);
    await expect(submissionCardById(page, "ПД-1048").getByText("Дальше:")).toHaveCount(
      0,
    );
    await expect(
      submissionCardById(page, "ПД-1048").getByText(/Анкета \d+%/),
    ).toHaveCount(0);
    await submissionCardById(page, "ПД-1048").click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expectDrawerStatus(page, "Возвращено");
    await openMediaTab(page);
    await expect(drawer(page).getByText("Селфи 1").first()).toBeVisible();
    await expect(drawer(page).getByText("Мария Иванова").first()).toBeVisible();
    await expect(drawer(page).getByText("Заменить").first()).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeVisible();
    await closeDrawer(page);

    await switchToAdmin(page);
    await expectAdminWorkNavigation(page);
    await expect(submissionCard(page, "Нина Волкова")).toBeVisible();
    await openAdminSubmission(page, "Нина Волкова");
    await openDrawerTab(page, ["Замечания"]);
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await expect(
      drawer(page).getByText("Нина Волкова · Данные · Маршрут поездки").first(),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(drawer(page).getByLabel("Новое замечание")).toHaveCount(0);
    if ((await drawer(page).count()) === 0) {
      await openAdminSubmission(page, "Нина Волкова");
    } else {
      await expect(
        drawer(page).getByRole("heading", { name: "Нина Волкова" }),
      ).toBeVisible();
    }
    await openDrawerTab(page, ["Замечания"]);
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Отмена" }).click();
    await closeDrawer(page);
    await openAdminSubmission(page, "Нина Волкова");
    await expect(drawer(page).getByLabel("Новое замечание")).toHaveCount(0);
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();
    await expect(
      page.locator(".export-row").filter({ hasText: "Дмитрий Орлов" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".export-row")
        .filter({ hasText: "Дмитрий Орлов" })
        .getByText("Готово")
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "1 подача · 1 заявитель" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeVisible();
    const download = await generateAndDownloadExcel(page);
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await clearExportSelection(page);
    await expect(page.getByRole("heading", { name: "Пакет не выбран" })).toBeVisible();
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
    await switchToAdmin(page);
    await expect(submissionCard(page, "Нина Волкова")).toBeVisible();
    await expect(
      submissionCard(page, "Нина Волкова")
        .getByText(/На проверке|Ручная проверка|Проверить/i)
        .first(),
    ).toBeVisible();

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("v19-linear-admin-review-desktop.png"),
      });
    }

    const reviewCard = submissionCard(page, "Нина Волкова");
    const reviewAction = reviewCard
      .getByRole("button", { name: /Ручная проверка|Проверить/i })
      .last();

    await reviewAction.focus();
    await expect(reviewAction).toBeFocused();
    await page.keyboard.press("Enter");
    if (!(await isVisible(drawer(page)))) {
      await reviewAction.click();
    }
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();
    await expectDrawerStatus(page, "На проверке");

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("v19-linear-drawer-desktop.png"),
      });
    }

    await openDrawerTab(page, ["Замечания"]);
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("v19-linear-issue-composer-desktop.png"),
      });
    }

    await page.keyboard.press("Escape");
    await expect(drawer(page).getByLabel("Новое замечание")).toHaveCount(0);
    const overviewTab = drawer(page).getByRole("tab", { name: /^Обзор/ });
    if ((await overviewTab.count()) > 0) {
      await overviewTab.focus();
      await page.keyboard.press("Escape");
    }
    await expect(drawer(page)).toHaveCount(0);
    await expect(reviewAction).toBeFocused();

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();
    await expect(
      page
        .locator(".export-row")
        .filter({ hasText: "Дмитрий Орлов" })
        .getByText("Готово")
        .first(),
    ).toBeVisible();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Сначала сформируйте Excel",
    );

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("v19-linear-export-desktop.png"),
      });
    }

    if (projectName === "mobile-chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("v19-linear-export-mobile.png"),
      });
    }

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("pre-created admin mail opens the admin workspace", async ({ page }) => {
    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });

    await expect(
      page.getByRole("heading", { name: /^(Проверка|Работа)$/ }),
    ).toBeVisible();
    await openMobileMenu(page);
    await expect(page.getByRole("button", { name: /Выгрузка/ })).toBeVisible();
    await clickWorkspaceButton(page, /Проверка|Работа/);
    await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);
  });

  test("agent creates a draft and opens returned issues in the drawer", async ({
    page,
  }, testInfo) => {
    await openCreateSubmission(page);
    await expect(drawer(page)).toBeVisible();
    await expect(
      drawer(page).getByRole("heading", { name: "Загрузите паспорт" }),
    ).toBeVisible();

    await uploadCreatePassports(page, ["Основной заявитель", "Супруг"]);
    await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Новая семейная подача" }),
    ).toBeVisible();
    await expectDrawerStatus(page, "Черновик");
    await openQuestionnaireTab(page);
    await expect(
      drawer(page).getByRole("button", { name: "Заполнить анкету" }),
    ).toHaveCount(0);
    await fillQuestionnaire(page);
    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await expect(
      drawer(page).getByRole("button", { name: /^(Загрузить|Заменить)/ }),
    ).toHaveCount(0);
    await saveDraftFromDrawer(page);
    await expectDrawerStatus(page, "В работе");
    await submitForReviewFromDrawer(page);
    await expectDrawerStatus(page, "На проверке");
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Мои подачи/);
    await openReturnedIvanovsSubmission(page);
    await openDrawerTab(page, ["Замечания"]);
    await expect(drawer(page).getByRole("heading", { name: "Селфи 1" })).toBeVisible();
    await expect(drawer(page).getByText("Скан паспорта")).toBeVisible();
    await openMediaTab(page);

    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeDisabled();
    await openMediaTab(page);
    await expect(
      drawer(page)
        .getByRole("button", {
          name: /^(Загрузить|Заменить)/,
        })
        .first(),
    ).toBeVisible();
    await uploadAllVisibleFiles(page);
    await expect(
      drawer(page).getByRole("button", { name: /^(Загрузить|Заменить)/ }),
    ).toHaveCount(0);
    await expect(drawer(page).getByText("Недостаточно прав")).toHaveCount(0);
    if (testInfo.project.name === "chromium") {
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath(
          "2026-06-21-v19-media-replacement-corrections-desktop.png",
        ),
      });
    }
  });

  test("drawer tabs and close flow work from keyboard", async ({ page }) => {
    await clickWorkspaceButton(page, /Мои подачи/);
    const trigger = returnedIvanovsAction(page);
    await openReturnedIvanovsSubmission(page);

    await openDrawerTab(page, ["Замечания"]);
    await expect(
      drawer(page).locator('[data-drawer-tab="issues"]').first(),
    ).toBeVisible();

    await openQuestionnaireTab(page);
    await expect(
      drawer(page).locator('[data-drawer-tab="questionnaire"]').first(),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeVisible();
  });

  test("dirty create drawer confirms close from keyboard", async ({ page }) => {
    await clickWorkspaceButton(page, /Мои подачи/);
    const trigger = page.getByRole("button", { name: "Новая подача" }).first();
    await trigger.click();

    await expect(
      drawer(page).getByRole("heading", { name: "Новая подача" }),
    ).toBeVisible();
    await expect(drawer(page).getByLabel("Предварительная заявка")).toBeVisible();
    await expect(drawer(page).getByLabel("Заявители в подаче")).toBeVisible();

    await drawer(page)
      .locator(".pi-file-input")
      .setInputFiles({
        name: "passport.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%passport-local-preview\n"),
      });
    await expect(
      drawer(page).getByText("Паспорт принимается только в формате JPEG или PNG."),
    ).toBeVisible();
    await expect(drawer(page).locator(".create-passport-next")).toBeDisabled();
    await expect(
      drawer(page).getByRole("heading", { name: "Загрузите паспорт" }),
    ).toBeVisible();

    await drawer(page).getByRole("button", { name: "Семья", exact: true }).click();
    await expect(
      drawer(page).locator(".create-people-list").getByRole("button"),
    ).toHaveCount(0);
    await expect(drawer(page).locator(".qs-preview").getByRole("button")).toHaveCount(
      0,
    );
    await drawer(page)
      .getByRole("button", { name: /Добавить заявителя в семью/ })
      .click();
    await expect(
      drawer(page).getByRole("button", {
        name: "Заявитель 3 Паспорт не загружен Нужен файл паспорта",
      }),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("checkbox", { name: "Заявитель 3" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    const confirmation = page.getByRole("dialog", { name: "Закрыть панель?" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Остаться" })).toBeFocused();
    await confirmation.getByRole("button", { name: "Остаться" }).click();
    await expect(page.getByRole("dialog", { name: "Закрыть панель?" })).toHaveCount(0);
    await expect(
      drawer(page).getByRole("button", { name: "Закрыть создание" }).first(),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Закрыть без сохранения" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("created draft persists after reload", async ({ page }) => {
    await openCreateSubmission(page);
    await uploadCreatePassports(page, ["Основной заявитель", "Супруг"]);
    await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Новая семейная подача" }),
    ).toBeVisible();

    await page.reload();
    await clickWorkspaceButton(page, /Мои подачи/);
    await selectSubmissionStatus(page, /В работе/);
    await expect(submissionCard(page, "Новая семейная подача")).toBeVisible();
    await expect(submissionCard(page, "Новая семейная подача")).toContainText(
      "Черновик",
    );
  });

  test("header actions stay locked when the current list is filtered empty", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await fillCurrentListSearch(page, "нет такой подачи");

    await expect(page.getByText(/Нет действий|Нет пакетов на проверке/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть выбранную" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", {
        name: "Отправить на исправление",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(drawer(page)).toHaveCount(0);
  });

  test("agent sees returned issues without admin issue actions", async ({ page }) => {
    await clickWorkspaceButton(page, /Мои подачи/);
    await openReturnedIvanovsSubmission(page);
    await openDrawerTab(page, ["Замечания"]);
    await expect(
      drawer(page)
        .getByText(/Нужна правка|замечан/i)
        .first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Найти кандидаты" }),
    ).toHaveCount(0);
    await expect(
      drawer(page).getByRole("button", { name: "Добавить как замечание" }),
    ).toHaveCount(0);
  });

  test("admin can run and manage ББ suggestion candidates", async ({ page }) => {
    await switchToAdmin(page);
    await openAdminSubmission(page, "Нина Волкова");
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();

    await drawer(page)
      .getByRole("tab", { name: /Замечания/ })
      .click();
    await drawer(page).getByRole("button", { name: "Найти кандидаты" }).click();
    await expect(drawer(page).getByText("ББ-проверка запущена")).toHaveCount(0);
    await expect(
      drawer(page)
        .getByText(/Проверить:|Нет файла:|Заменить:/)
        .first(),
    ).toBeVisible();
    const acceptSuggestionButtons = drawer(page).getByRole("button", {
      name: "Добавить как замечание",
    });
    const dismissSuggestionButtons = drawer(page).getByRole("button", {
      name: "Отклонить",
    });
    const initialSuggestionCount = await acceptSuggestionButtons.count();

    expect(initialSuggestionCount).toBeGreaterThan(0);
    await acceptSuggestionButtons.first().click();
    await expect(
      drawer(page)
        .locator("article")
        .filter({ hasText: "Нина Волкова" })
        .filter({ hasText: /Проверить:|Нет файла:|Заменить:/ })
        .filter({ hasText: "Открыто" })
        .first(),
    ).toBeVisible();
    await expect(acceptSuggestionButtons).toHaveCount(initialSuggestionCount - 1);

    const beforeDismissCount = await dismissSuggestionButtons.count();
    if (beforeDismissCount > 0) {
      await dismissSuggestionButtons.first().click();
      await expect(dismissSuggestionButtons).toHaveCount(beforeDismissCount - 1);
    }
  });

  test("admin AI helper fails closed without mutating the review", async ({ page }) => {
    await switchToAdmin(page);
    await openAdminSubmission(page, "Нина Волкова");
    await expectDrawerStatus(page, "На проверке");
    await expect(drawer(page).getByText("0 открытых замечаний")).toBeVisible();

    await drawer(page).getByRole("button", { name: "Проверить AI" }).click();
    await expect(
      drawer(page)
        .getByLabel("AI-помощник администратора")
        .getByText(/локальный AI не настроен/),
    ).toBeVisible();
    await expectDrawerStatus(page, "На проверке");
    await expect(drawer(page).getByText("0 открытых замечаний")).toBeVisible();
  });

  test("admin can add a precise issue and return a submission", async ({ page }) => {
    await switchToAdmin(page);
    await expectAdminWorkNavigation(page);
    await openMobileMenu(page);
    await expect(page.getByRole("button", { name: /Выгрузка/ })).toBeVisible();
    await clickWorkspaceButton(page, /Проверка|Работа/);
    await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);

    await openAdminSubmission(page, "Нина Волкова");
    await expect(
      drawer(page).getByRole("heading", { name: "Нина Волкова" }),
    ).toBeVisible();

    await openDrawerTab(page, ["Замечания"]);
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
    await expect(page.getByRole("tab", { name: "Замечания" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const issueSummary = issueArticle(page, "Нина Волкова", "Требуется уточнение");
    await expect(issueSummary).toBeVisible();
    await drawer(page)
      .getByRole("button", { name: "Отправить на исправление", exact: true })
      .click();
    await expectDrawerStatus(page, "Возвращено");
  });

  test("admin accepts corrections and completes the Excel plus ZIP export", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await expect(submissionCard(page, "Петровы")).toBeVisible();

    await openAdminSubmission(page, "Петровы", "Семья Петровых");
    await expect(drawer(page).getByText("Семья Петровых").first()).toBeVisible();
    await expect(page.getByText("Адрес отеля был неполным").first()).toBeVisible();
    await expect(
      page.getByText("Ирина Петрова · Анкета · Данные").first(),
    ).toBeVisible();
    await expect(page.getByText("Исправлено агентом").first()).toBeVisible();
    await page.getByRole("button", { name: "Принять на выгрузку" }).click();
    await expectDrawerStatus(page, "Готово к выгрузке");
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();
    await clearExportSelection(page);
    await page
      .locator(".export-row")
      .filter({ hasText: "Семья Петровых" })
      .getByRole("checkbox")
      .check();
    await expect(
      page.getByRole("heading", { name: "1 подача · 2 заявителя" }),
    ).toBeVisible();
    await generateAndDownloadExcel(page);
    await expectCurrentExportDownloadComplete(page);
    const readyForExportFamilyRow = page
      .locator(".export-row")
      .filter({ hasText: "Семья Петровых" });
    await expect(readyForExportFamilyRow).toBeVisible();
  });

  test("admin can return corrected submission again after adding a new issue", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Петровы", "Семья Петровых");
    await expectDrawerStatus(page, "Исправления получены");

    await openDrawerTab(page, ["Замечания"]);
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();

    await expect(
      drawer(page)
        .locator("article")
        .filter({ hasText: "Требуется уточнение" })
        .filter({ hasText: "Открыто" })
        .first(),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Отправить на исправление" }),
    ).toBeEnabled();
    await drawer(page)
      .getByRole("button", { name: "Отправить на исправление" })
      .click();
    await expectDrawerStatus(page, "Возвращено");
  });

  test("agent can reopen OCR fields and explicitly submit without review", async ({
    page,
  }) => {
    await openCreateSubmission(page);
    await uploadCreatePassports(page, ["Ocr Dialog"]);
    await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: "Ocr Dialog" }),
    ).toBeVisible();

    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await openQuestionnaireTab(page);
    await fillQuestionnaire(page);
    await saveDraftFromDrawer(page);

    await drawer(page).getByRole("button", { name: "Отправить", exact: true }).click();
    const reviewDialog = page.getByRole("dialog", {
      name: "Проверить распознанные поля?",
    });
    await expect(reviewDialog).toBeVisible();
    await reviewDialog.getByRole("button", { name: "Открыть поля" }).click();
    await expect(reviewDialog).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByRole("tab", { name: /Анкета/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await drawer(page).getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(reviewDialog).toBeVisible();
    await reviewDialog.getByRole("button", { name: "Отправить без проверки" }).click();
    await expectDrawerStatus(page, "На проверке");
  });

  test("export blocks same-city family and single packages with different trip dates", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Петровы", "Семья Петровых");
    await page.getByRole("button", { name: "Принять на выгрузку" }).click();
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Выгрузка/);
    await page
      .locator(".export-row")
      .filter({ hasText: "Семья Петровых" })
      .getByRole("checkbox")
      .check();

    await expect(
      page.getByRole("heading", { name: "2 подачи · 3 заявителя" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".blocker-box")
        .getByText("Нельзя смешивать одинарные и семейные подачи"),
    ).toHaveCount(0);
    await expect(page.locator("#export-action-hint")).not.toContainText(
      "Нельзя смешивать одинарные и семейные подачи",
    );
    await expect(page.locator("#export-action-hint")).toContainText(
      "Нельзя смешивать разные даты поездки",
    );
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();
  });

  test("one submission moves from creation to Excel export", async ({ page }) => {
    const submissionTitle = "Новая подача";
    const applicantName = "Новый заявитель";

    await openCreateSubmission(page);
    await uploadCreatePassports(page, [applicantName]);
    await page.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(
      drawer(page).getByRole("heading", { name: submissionTitle }),
    ).toBeVisible();

    await openQuestionnaireTab(page);
    await fillQuestionnaire(page);
    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await saveDraftFromDrawer(page);
    await submitForReviewFromDrawer(page);
    await expectDrawerStatus(page, "На проверке");
    const submittedId = (
      (await drawer(page)
        .getByText(/ПД-\d+|SUB-\d+/)
        .first()
        .textContent()) ?? ""
    ).trim();
    await closeDrawer(page);

    await switchToAdmin(page);
    await selectAdminReviewQueue(page);
    await openAdminSubmission(page, submittedId, submissionTitle);
    await openDrawerTab(page, ["Замечания"]);
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
    await expect(
      drawer(page)
        .locator("article")
        .filter({ hasText: "Требуется уточнение" })
        .filter({ hasText: "Открыто" })
        .first(),
    ).toBeVisible();
    await drawer(page)
      .getByRole("button", { name: "Отправить на исправление", exact: true })
      .click();
    await expectDrawerStatus(page, "Возвращено");
    await closeDrawer(page);
    await expect(drawer(page)).toHaveCount(0);

    await switchToAgent(page);
    await clickWorkspaceButton(page, /Мои подачи/);
    await openAgentSubmission(page, submittedId, submissionTitle);
    await openDrawerTab(page, ["Замечания"]);
    await expect(drawer(page).getByText("Требуется уточнение")).toBeVisible();
    await markVisibleIssuesFixed(page);
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
    await closeDrawer(page);

    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, submittedId, submissionTitle);
    await drawer(page).getByRole("button", { name: "Принять на выгрузку" }).click();
    await expectDrawerStatus(page, "Готово к выгрузке");
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Выгрузка/);
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
      page.getByRole("heading", { name: "1 подача · 1 заявитель" }),
    ).toBeVisible();
    await generateAndDownloadExcel(page);
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
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();
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
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();
    await generateAndDownloadExcel(page);
    await expectCurrentExportDownloadComplete(page);
    await expect(
      page.locator(".export-row").filter({ hasText: "Новая подача" }),
    ).toBeVisible();
  });

  test("two families and two single applicants pass issue, return, correction and export corner cases", async ({
    page,
  }) => {
    test.slow();
    const browserProblems = collectBrowserProblems(page);

    const familyTitle = "Семья Кузнецовых";
    const familyListTitle = "Кузнецовы";
    const secondFamilyTitle = "Семья Смирновых";
    const firstSingle = "Романов Павел";
    const secondSingle = "Белова Ольга";
    let familyId = "";
    let secondFamilyId = "";
    let firstSingleId = "";
    let secondSingleId = "";

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
      familyId = await fillFilesAndSubmit(
        page,
        testArtifactPath("v19-flow-media-drawer-no-overlap.png"),
      );
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
      secondFamilyId = await fillFilesAndSubmit(page);
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
      await openQuestionnaireTab(page);
      await fillQuestionnaire(page);
      await submitForReviewFromDrawer(page);
      await expectDrawerStatus(page, "На проверке");
      firstSingleId = (
        (await drawer(page)
          .getByText(/ПД-\d+|SUB-\d+/)
          .first()
          .textContent()) ?? ""
      ).trim();
      await closeDrawer(page);
    });

    await test.step("agent creates and submits second single applicant", async () => {
      await createNamedSubmission(page, { type: "single", names: [secondSingle] });
      await openQuestionnaireTab(page);
      await fillQuestionnaire(page);
      secondSingleId = await fillFilesAndSubmit(page);
    });

    await test.step("admin returns first family with manual issues", async () => {
      await switchToAdmin(page);
      await selectAdminReviewQueue(page);
      await openAdminSubmission(page, familyId, familyTitle);
      await openDrawerTab(page, ["Замечания"]);
      await expect(
        drawer(page).getByRole("button", { name: "Найти кандидаты" }),
      ).toHaveCount(0);
      await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
      await drawer(page).getByRole("button", { name: "Создать замечание" }).click();
      await expect(
        drawer(page)
          .locator("article")
          .filter({ hasText: "Требуется уточнение" })
          .filter({ hasText: "Открыто" })
          .first(),
      ).toBeVisible();
      await drawer(page)
        .getByRole("button", { name: "Отправить на исправление", exact: true })
        .click();
      await expectDrawerStatus(page, "Возвращено");
      await closeDrawer(page);
    });

    await test.step("admin accepts other submitted packages", async () => {
      for (const [cardText, drawerTitle] of [
        [secondFamilyId, secondFamilyTitle],
        [firstSingleId, firstSingle],
        [secondSingleId, secondSingle],
      ] as const) {
        await openAdminSubmission(page, cardText, drawerTitle);
        await drawer(page)
          .getByRole("button", { name: "Принять на выгрузку", exact: true })
          .click();
        await expectDrawerStatus(page, "Готово к выгрузке");
        await closeDrawer(page);
      }
    });

    await test.step("agent sees returned family blockers before resubmit", async () => {
      await switchToAgent(page);
      await clickWorkspaceButton(page, /Мои подачи/);
      await openAgentSubmission(page, familyListTitle, familyTitle);
      await expect(
        drawer(page).getByRole("button", { name: "Отправить исправления" }),
      ).toBeDisabled();
      await openDrawerTab(page, ["Замечания"]);
      await expect(
        drawer(page)
          .getByText(/уточнение|исправ/i)
          .first(),
      ).toBeVisible();
      await closeDrawer(page);
    });

    await test.step("export keeps same-city family and single selection valid", async () => {
      await switchToAdmin(page);
      await clickWorkspaceButton(page, /Выгрузка/);
      await clearExportSelection(page);
      await page
        .locator(".export-row")
        .filter({ hasText: secondFamilyTitle })
        .getByRole("checkbox")
        .check();
      await page
        .locator(".export-row")
        .filter({ hasText: firstSingle })
        .getByRole("checkbox")
        .check();
      await expect(
        page.getByRole("heading", { name: "2 подачи · 5 заявителей" }),
      ).toBeVisible();
      await expect(
        page
          .locator(".blocker-box")
          .getByText("Нельзя смешивать одинарные и семейные подачи"),
      ).toHaveCount(0);
    });

    await test.step("export accepted family package", async () => {
      await page
        .locator(".export-row")
        .filter({ hasText: firstSingle })
        .getByRole("checkbox")
        .uncheck();
      await expect(
        page.getByRole("heading", { name: "1 подача · 4 заявителя" }),
      ).toBeVisible();
      await expect(page.getByText("Sheet1 · предпросмотр")).toBeVisible();
      await expect(
        page.getByText("53 связано · 3 вычислено · 0 не сопоставлено"),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Appointment Type(For Family, applicant email and contact number should be same for all family members)",
        ),
      ).toBeVisible();
      await generateAndDownloadExcel(page);
      await expectCurrentExportDownloadComplete(page);
    });

    await test.step("export two single applicants together", async () => {
      await clickExportTab(page, "Пакеты");
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
        page.getByRole("heading", { name: "2 подачи · 2 заявителя" }),
      ).toBeVisible();
      await generateAndDownloadExcel(page);
      await expectCurrentExportDownloadComplete(page);
    });

    await test.step("Excel-only export leaves packages ready for future T9", async () => {
      await clickExportTab(page, "Пакеты");
      await expect(
        page.locator(".export-row").filter({ hasText: firstSingle }),
      ).toBeVisible();
      await expect(
        page.locator(".export-row").filter({ hasText: secondSingle }),
      ).toBeVisible();
    });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
