import { readFileSync } from "node:fs";
import type { Download, Locator, Page } from "@playwright/test";
import JSZip from "jszip";
import { expect, takeLocalhostGuardProblems, test } from "./v19-localhost-only.fixture";
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
const adminWorkspaceHeading = /^(Очередь на проверку|Проверка|Работа|Центр выгрузки)$/;
const localSubmissionsStorageKey = "visaflow.v19.submissions.v1";
const e2ePassportBaseBytes = readFileSync(
  new URL("../../src/assets/export-demo/passport_scan.jpeg", import.meta.url),
);

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
  await expect(page.getByRole("main", { name: /Рабочая область/ })).toBeVisible();
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
  for (const label of [
    "Поиск по действиям",
    "Поиск в текущем списке",
    "ID, семья или агент",
  ]) {
    const search = page
      .getByLabel(label, { exact: true })
      .or(page.getByRole("textbox", { exact: true, name: label }))
      .first();

    if (await isVisible(search)) {
      await search.fill(value);
      return;
    }
  }

  const adminSearch = page
    .getByRole("textbox", { name: /ID, семья или агент/ })
    .or(page.locator('input[placeholder="ID, семья или агент"]'))
    .first();
  await expect(adminSearch).toBeVisible();
  await adminSearch.fill(value);
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

async function loginWorkspaceSession(
  page: Page,
  credentials: { email: string; password: string },
  expectedHeading: string | RegExp,
) {
  const signOut = page.getByRole("button", { exact: true, name: "Выйти" });
  await expect(signOut).toBeVisible();
  await signOut.click();

  const emailInput = page.locator("#workspace-email");
  const loginTab = page.getByRole("button", {
    exact: true,
    name: "Уже есть доступ? Войти",
  });
  await expect(emailInput.or(loginTab)).toBeVisible();
  if (await isVisible(loginTab)) {
    await loginTab.click();
  }

  await expect(emailInput).toBeVisible();
  await emailInput.fill(credentials.email);
  await page.locator("#workspace-password").fill(credentials.password);
  await page.getByRole("button", { exact: true, name: "Войти в кабинет" }).click();
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: expectedHeading,
    }),
  ).toBeVisible();
}

async function switchToAdmin(page: Page) {
  const adminHeading = page.getByRole("heading", {
    exact: true,
    level: 1,
    name: adminWorkspaceHeading,
  });
  if (await isVisible(adminHeading)) return;

  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: /^(Мои действия|Мои подачи|Новая подача|Настройки)$/,
    }),
  ).toBeVisible();
  const directRoleSwitch = page.getByRole("button", {
    name: /^(В админскую зону|Сменить роль|Переключиться в кабинет администратора)$/,
  });

  if (await hasAtLeastOneVisible(directRoleSwitch)) {
    await clickFirstVisible(directRoleSwitch);
  } else {
    await loginWorkspaceSession(
      page,
      { email: "2@2.ru", password: "22" },
      adminWorkspaceHeading,
    );
  }
  await expect(adminHeading).toBeVisible();
}

async function switchToAgent(page: Page) {
  const agentHeading = page.getByRole("heading", {
    exact: true,
    level: 1,
    name: /^(Мои действия|Мои подачи|Новая подача|Настройки)$/,
  });
  if (await isVisible(agentHeading)) return;

  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: adminWorkspaceHeading,
    }),
  ).toBeVisible();
  const directRoleSwitch = page.getByRole("button", {
    name: /^(В агентскую зону|Сменить роль|Переключиться в кабинет агента)$/,
  });

  if (await hasAtLeastOneVisible(directRoleSwitch)) {
    await clickFirstVisible(directRoleSwitch);
  } else {
    await loginWorkspaceSession(
      page,
      { email: "1@1.ru", password: "11" },
      /^(Мои действия|Мои подачи|Новая подача|Настройки)$/,
    );
  }
  await expect(agentHeading).toBeVisible();
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
    Смирновы: "ПД-1055",
    "Семья Смирновых": "ПД-1055",
  };
  const byText = page
    .locator(
      '.submission-card, .v17-admin-work-row, .v19-event-row, [data-submission-card], [data-testid="agent-submission-card"]',
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

function issueComposer(page: Page) {
  return page.getByRole("dialog", { name: /^(Новое|Добавить) замечание$/ }).last();
}

function exportControl(page: Page) {
  return page.getByRole("region", { name: "Панель контроля выгрузки" });
}

async function closeDrawer(page: Page) {
  const namedClose = drawer(page).getByRole("button", {
    name: /^(Закрыть (подачу|проверку)|Вернуться к очереди)$/,
  });

  if (await isVisible(namedClose.first())) {
    await namedClose.first().click();
  } else {
    await page.keyboard.press("Escape");
  }

  await expect(drawer(page)).toHaveCount(0);
}

async function expectDrawerStatus(page: Page, status: string) {
  const passportReview = page.getByRole("dialog", {
    exact: true,
    name: "Сверка паспорта",
  });
  if (await isVisible(passportReview)) {
    await expect(
      passportReview.getByRole("heading", { level: 1, name: "Сверка паспорта" }),
    ).toBeVisible();
    await expect(
      passportReview.getByText(/(?:ПД|SUB|VF)-(?:\d+|—)/).first(),
    ).toBeVisible();
    await expect(passportReview.getByTestId("review-workspace-status")).toHaveText(
      status,
    );
    if (status === "Исправления получены") {
      await expect(
        passportReview.getByRole("button", {
          name: "Закрыть исправления и принять",
        }),
      ).toBeVisible();
    } else if (status === "Готово к выгрузке") {
      await expect(
        passportReview.getByText("Подача принята и сохранена."),
      ).toBeVisible();
    }
    return;
  }

  const detailMeta = drawer(page).locator(".drawer-meta-line");
  if ((await detailMeta.count()) > 0) {
    await expect(detailMeta).toContainText(/(?:ПД|SUB|VF)-(?:\d+|—)/);
    await expect(drawer(page).locator(".drawer-status-chip")).toContainText(status);
    return;
  }

  await expect(drawer(page).getByText(status).first()).toBeVisible();
  await expect(
    drawer(page)
      .getByText(/(?:ПД|SUB|VF)-(?:\d+|—)/)
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
  const resetFilters = page.getByRole("button", { exact: true, name: "Все" }).first();
  if (await isVisible(resetFilters)) {
    await resetFilters.click();
  }
  const card = submissionCardById(page, "ПД-1048");

  await expect(card).toContainText("Возвращено");
  await expect(card).toContainText("4 человек");
  await expect(card).toContainText("Мария Иванова");
  await expect(card).toContainText("Антон Иванов");
  await expect(card).toContainText("София Иванова");
  await expect(card).toContainText("Марк Иванов");
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

async function expectDrawerHistoryEventCount(
  page: Page,
  eventText: string,
  count: number,
) {
  await openDrawerTab(page, ["История"]);
  await expect(drawer(page).getByText(eventText, { exact: true })).toHaveCount(count);
}

function questionnaireScreen(page: Page) {
  return page.locator(".vf-figma-questionnaire-screen").first();
}

async function openMediaTab(page: Page) {
  const dedicatedMediaTab = drawer(page)
    .getByRole("tab", { name: /^(Файлы|Селфи|Паспорт)/ })
    .first();

  if (await isVisible(dedicatedMediaTab)) {
    await dedicatedMediaTab.click();
    await expect(
      drawer(page).getByRole("heading", { name: /Файлы подачи|Файлы/ }),
    ).toBeVisible();
    return;
  }

  await openDrawerTab(page, ["Обзор"]);
  await expect(
    drawer(page).getByRole("region", { name: "Чеклист документов" }),
  ).toBeVisible();
}

async function openAdminSubmission(
  page: Page,
  cardText: string,
  drawerTitle = cardText,
) {
  const reviewAction = page
    .getByRole("button", {
      name: new RegExp(`^Ручная проверка заявки ${escapeRegex(drawerTitle)}(?:\\s|$)`),
    })
    .first();
  const targetCard = reviewAction.or(submissionCard(page, cardText)).first();
  await expect(
    targetCard,
    `No visible submission card matched ${cardText}.`,
  ).toBeVisible();
  await targetCard.click();
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
  const passportReview = page.getByRole("dialog", {
    exact: true,
    name: "Сверка паспорта",
  });
  if (await isVisible(passportReview)) {
    await expect(
      passportReview.getByRole("heading", { level: 1, name: "Сверка паспорта" }),
    ).toBeVisible();
    return;
  }

  await expectAtLeastOneVisible(
    drawer(page)
      .getByRole("heading", { name: drawerTitle })
      .or(drawer(page).getByText(drawerTitle))
      .or(drawer(page).getByText(cardText)),
    `Submission drawer did not expose ${drawerTitle} or ${cardText}.`,
  );
}

async function beginAdminIssue(page: Page) {
  let addIssueButton = drawer(page)
    .getByRole("button", { name: /^(Добавить замечание(?::|$)|Замечание$)/ })
    .first();

  if (!(await isVisible(addIssueButton))) {
    await openDrawerTab(page, ["Замечания"]);
    addIssueButton = drawer(page)
      .getByRole("button", { name: /^(Добавить замечание(?::|$)|Замечание$)/ })
      .first();
  }

  await expect(addIssueButton).toBeVisible();
  await addIssueButton.click();
}

async function submitAdminIssue(page: Page) {
  const composer = page
    .getByRole("dialog", { name: /^(Новое|Добавить) замечание$/ })
    .last();
  await expect(composer).toBeVisible();
  const submitButton = composer.getByRole("button", {
    name: /^(Создать|Отправить) замечание$/,
  });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
}

async function acceptAdminSubmissionForExport(page: Page) {
  const passportReview = page.getByRole("dialog", {
    exact: true,
    name: "Сверка паспорта",
  });
  if (await isVisible(passportReview)) {
    const applicantSelect = passportReview.getByRole("combobox", {
      name: "Заявитель для проверки",
    });
    const applicantValues =
      (await applicantSelect.count()) > 0
        ? await applicantSelect
            .locator("option")
            .evaluateAll((options) =>
              options.map((option) => (option as HTMLOptionElement).value),
            )
        : [""];

    for (const applicantValue of applicantValues) {
      if (applicantValue) {
        await applicantSelect.selectOption(applicantValue);
      }
      const mediaTabs = passportReview.getByRole("tablist", {
        name: "Выбор файла для проверки",
      });
      const applicantMediaTabs = mediaTabs.getByRole("tab");
      const applicantMediaCount = await applicantMediaTabs.count();
      expect(applicantMediaCount).toBeGreaterThan(0);
      for (let mediaIndex = 0; mediaIndex < applicantMediaCount; mediaIndex += 1) {
        const tab = applicantMediaTabs.nth(mediaIndex);
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        const visibleMediaPanel = passportReview
          .locator('[role="tabpanel"]:visible')
          .first();
        await expect(visibleMediaPanel).toBeVisible();
        const tabLabel = (await tab.innerText()).trim();
        if (/Селфи/i.test(tabLabel)) {
          await expect(visibleMediaPanel.locator("img")).toHaveCount(2);
          await expect(
            passportReview.getByTestId("protected-media-preview-passport_scan"),
          ).toBeVisible();
          await expect(
            passportReview.getByTestId(
              /Селфи 2/i.test(tabLabel)
                ? "protected-media-preview-selfie_2"
                : "protected-media-preview-selfie",
            ),
          ).toBeVisible();
        } else {
          await expect(visibleMediaPanel.locator("img")).toHaveCount(1);
          await expect(visibleMediaPanel.locator("img")).toBeVisible();
        }
      }

      const acceptSection = passportReview.getByRole("button", {
        exact: true,
        name: "Принять всё",
      });
      await expect(acceptSection).toBeEnabled();
      await acceptSection.click();
      await expect(
        passportReview.getByRole("button", {
          exact: true,
          name: "Секция подтверждена",
        }),
      ).toBeDisabled();
    }

    const acceptSubmission = passportReview.getByRole("button", {
      name: /^(Закрыть исправления и принять|Принять на выгрузку)$/,
    });
    await expect(acceptSubmission).toBeEnabled();
    await acceptSubmission.click();
    await expect(passportReview.getByText("Подача принята и сохранена.")).toBeVisible();
    return;
  }

  await drawer(page).getByRole("button", { name: "Принять на выгрузку" }).click();
}

async function openAgentSubmission(
  page: Page,
  cardText: string,
  drawerTitle = cardText,
) {
  let targetCard = submissionCard(page, cardText);
  if (!(await isVisible(targetCard))) {
    const resetFilters = page.getByRole("button", { exact: true, name: "Все" }).first();
    if (await isVisible(resetFilters)) {
      await resetFilters.click();
      targetCard = submissionCard(page, cardText);
    }
  }
  await expect(
    targetCard,
    `No visible agent submission card matched ${cardText}.`,
  ).toBeVisible();

  if ((await targetCard.getAttribute("data-testid")) === "agent-submission-card") {
    await targetCard.locator("h3").first().click();
  } else {
    const primaryButton = targetCard.getByRole("button").first();
    if (await isVisible(primaryButton)) {
      await primaryButton.click();
    } else {
      await clickFirstVisible(targetCard);
    }
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
  const correctionsTab = page
    .getByRole("tab", { name: /^(Правки|Исправления)/ })
    .first();

  if (await isVisible(correctionsTab)) {
    await correctionsTab.click();
    await expect(correctionsTab).toHaveAttribute("aria-selected", "true");
  }
}

function questionnaireValue(fieldId: string, index: number) {
  if (fieldId === "passport-no") {
    return String(900_000_000 + index).slice(0, 9);
  }
  if (fieldId === "email") {
    return `qa+${index}@example.com`;
  }

  const values: Record<string, string> = {
    "appointment-city": "Москва",
    "arrival-date": "01.09.2026",
    "birth-country": "Russian Federation",
    "birth-date": "01.01.1990",
    "birth-place": "MOSCOW",
    "contact-number": "+7 900 000 00 00",
    "departure-date": "10.09.2026",
    "desired-date-1": "01.09.2026",
    "desired-date-2": "10.09.2026",
    "employer-address": "Moscow, Tverskaya Street, 1",
    "employer-contact": "+7 900 000-00-01",
    "employer-name": "VisaFlow",
    "entry-count": "Однократная",
    "first-entry-country": "Spain",
    "first-name": "Новый",
    gender: "Мужской",
    "home-city": "Москва",
    "home-country": "Russian Federation",
    "home-house": "1",
    "home-street": "Тверская улица",
    "hotel-address": "Calle de Atocha, 23",
    "hotel-city": "Madrid",
    "hotel-country": "Spain",
    "hotel-name": "Hotel Europa",
    "hotel-postal-code": "28001",
    "inviting-party-type": "Гостиница/временное жилье",
    "lives-outside-citizenship": "Нет",
    "main-destination": "Spain",
    "marital-status": "Холост/не замужем",
    occupation: "Менеджер",
    "passport-expiry-date": "01.01.2030",
    "passport-issue-country": "Russian Federation",
    "passport-issue-date": "01.01.2020",
    "passport-issue-place": "MVD 770-001",
    "passport-type": "Ordinary Passport",
    "postal-code": "101000",
    "previous-biometrics": "Нет",
    purpose: "TOURISM",
    surname: "Заявитель",
  };
  const value = values[fieldId];
  if (!value) {
    throw new Error(
      `No canonical E2E questionnaire value for required field ${fieldId}.`,
    );
  }
  return value;
}

async function fillModernRequiredField(
  page: Page,
  field: Locator,
  fallbackIndex: number,
) {
  const fieldId = await field.getAttribute("data-model-field-id");
  if (!fieldId) {
    throw new Error("Required questionnaire field is missing data-model-field-id.");
  }
  const value = questionnaireValue(fieldId, fallbackIndex);
  const textControl = field
    .locator(
      'input:not([readonly]):not([type="hidden"]):not([type="checkbox"]), textarea:not([readonly])',
    )
    .first();

  if (await isVisible(textControl)) {
    await textControl.fill(value);
    await textControl.blur();
  } else {
    const checkbox = field.locator('input[type="checkbox"]').first();
    if (await isVisible(checkbox)) {
      if (!(await checkbox.isChecked())) await checkbox.check();
    } else {
      const combobox = field.getByRole("combobox").first();
      if (await isVisible(combobox)) {
        await combobox.click();
        await page
          .locator('[role="listbox"]:visible')
          .getByRole("option", { exact: true, name: value })
          .click();
      } else {
        const quickOption = field
          .getByRole("button", { exact: true, name: value })
          .first();
        await expect(quickOption).toBeVisible();
        await quickOption.click();
      }
    }
  }

  await expect(field).toHaveAttribute("data-field-filled", "true");
}

async function fillModernQuestionnaireAndReturnToDrawer(
  page: Page,
  questionnaire: Locator,
  applicantNames: readonly string[] = [],
  returnTarget: "drawer" | "list-or-drawer" = "list-or-drawer",
) {
  const submissionId = await questionnaire.getAttribute("data-submission-id");
  expect(submissionId).toBeTruthy();
  const submissionValueSeed = [...(submissionId ?? "")].reduce(
    (seed, character) => (seed * 31 + character.charCodeAt(0)) % 80_000_000,
    0,
  );

  const applicantButtons = questionnaire.locator(".v19-questionnaire-applicant-tab");
  const applicantCount = Math.max(await applicantButtons.count(), 1);
  if (applicantNames.length > 0) {
    await expect(applicantButtons).toHaveCount(applicantNames.length);
  }

  const switchApplicant = async (applicantIndex: number) => {
    const applicantButton = applicantButtons.nth(applicantIndex);
    if ((await applicantButton.getAttribute("aria-pressed")) === "true") return;

    const applicantSwitcher = questionnaire
      .getByRole("combobox", { name: "Выбрать туриста" })
      .first();
    await expect(applicantSwitcher).toBeVisible();
    await applicantSwitcher.click();
    await page
      .locator('[role="listbox"][aria-label="Выбрать туриста"]:visible')
      .getByRole("option")
      .nth(applicantIndex)
      .click();
    await expect(applicantButton).toHaveAttribute("aria-pressed", "true");
  };

  for (let applicantIndex = 0; applicantIndex < applicantCount; applicantIndex += 1) {
    if ((await applicantButtons.count()) > 0) {
      await switchApplicant(applicantIndex);
    }

    const requestedName = applicantNames[applicantIndex]?.trim();
    if (requestedName) {
      const [surname, ...givenNameParts] = requestedName.split(/\s+/);
      const givenName = givenNameParts.join(" ");
      const personalSection = questionnaire
        .locator(
          ".v19-questionnaire-section-list--sidebar .v19-questionnaire-section-tab",
        )
        .filter({ hasText: "Личные данные" })
        .first();
      if ((await personalSection.getAttribute("aria-pressed")) !== "true") {
        await personalSection.click();
        await expect(personalSection).toHaveAttribute("aria-pressed", "true");
      }
      for (const [fieldId, value] of [
        ["surname", surname],
        ["first-name", givenName],
      ] as const) {
        const field = questionnaire.locator(
          `[data-model-field-id=${JSON.stringify(fieldId)}]`,
        );
        const input = field.locator("input:not([readonly])").first();
        await expect(input).toBeVisible();
        await input.fill(value);
        await input.blur();
        await expect(field).toHaveAttribute("data-field-filled", "true");
      }
    }

    const sectionButtons = questionnaire.locator(
      ".v19-questionnaire-section-list--sidebar .v19-questionnaire-section-tab",
    );
    const sectionCount = await sectionButtons.count();
    expect(sectionCount).toBeGreaterThan(0);

    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      const sectionButton = sectionButtons.nth(sectionIndex);
      if ((await sectionButton.getAttribute("aria-pressed")) !== "true") {
        await sectionButton.click();
        await expect(sectionButton).toHaveAttribute("aria-pressed", "true");
      }

      const completedFieldIds = new Set<string>();
      while (true) {
        if ((await sectionButton.getAttribute("aria-pressed")) !== "true") {
          await sectionButton.click();
          await expect(sectionButton).toHaveAttribute("aria-pressed", "true");
        }

        const requiredUnfilledFields = questionnaire.locator(
          '.v19-questionnaire-work-panel [data-model-field-id]:has(.v19-questionnaire-required-mark):not([data-field-filled="true"]):visible',
        );
        const requiredUnfilledIds = await requiredUnfilledFields.evaluateAll((fields) =>
          fields.map((field) => field.getAttribute("data-model-field-id")),
        );
        expect(requiredUnfilledIds.every(Boolean)).toBe(true);
        const fieldId = requiredUnfilledIds.find(
          (candidate): candidate is string =>
            candidate !== null && !completedFieldIds.has(candidate),
        );
        if (!fieldId) {
          if (requiredUnfilledIds.length > 0) {
            throw new Error(
              `Required questionnaire fields did not become valid after one canonical update: ${requiredUnfilledIds.join(", ")}`,
            );
          }
          break;
        }
        completedFieldIds.add(fieldId);

        const field = questionnaire
          .locator(
            `.v19-questionnaire-work-panel [data-model-field-id=${JSON.stringify(
              fieldId,
            )}]`,
          )
          .first();
        await expect(field).toBeVisible();
        await fillModernRequiredField(
          page,
          field,
          submissionValueSeed +
            applicantIndex * 1_000 +
            sectionIndex * 100 +
            completedFieldIds.size,
        );
      }

      const reviewConfirmations = questionnaire
        .locator(".v19-questionnaire-work-panel")
        .getByRole("button", { name: /^Подтвердить поле:/ });
      while ((await reviewConfirmations.count()) > 0) {
        const confirmationCount = await reviewConfirmations.count();
        await reviewConfirmations.first().click();
        await expect(reviewConfirmations).toHaveCount(confirmationCount - 1);
      }
    }
  }

  await expect(
    questionnaire.getByRole("region", { name: "Готовность подачи" }),
  ).toContainText("100%");
  await expect(
    questionnaire.getByRole("region", { name: "Готовность подачи" }),
  ).toContainText("0 рисков");
  for (let applicantIndex = 0; applicantIndex < applicantCount; applicantIndex += 1) {
    await expect(applicantButtons.nth(applicantIndex)).toHaveAttribute(
      "aria-label",
      /готов$/,
    );
  }

  await questionnaire
    .getByRole("button", { exact: true, name: "Сохранить и выйти" })
    .click();
  await expect(questionnaire).toHaveCount(0);
  if (returnTarget === "drawer") {
    await expect(drawer(page)).toBeVisible();
    const questionnaireTab = drawer(page).getByRole("tab", { name: "Анкета" });
    await expect(questionnaireTab).toBeVisible();
    await expect(questionnaireTab).toHaveAttribute("aria-selected", "true");
    return;
  }

  if (await isVisible(drawer(page))) {
    const questionnaireTab = drawer(page).getByRole("tab", { name: "Анкета" });
    await expect(questionnaireTab).toBeVisible();
    await expect(questionnaireTab).toHaveAttribute("aria-selected", "true");
    return;
  }

  await expect(
    page.getByRole("heading", { level: 1, name: "Мои подачи" }),
  ).toBeVisible();
  const submissionCardAfterSave = page
    .locator(
      `[data-testid="agent-submission-card"][data-submission-id="${submissionId}"]`,
    )
    .first();
  await expect(submissionCardAfterSave).toBeVisible();
  await submissionCardAfterSave.click();
  await expect(drawer(page)).toBeVisible();
}

async function fillQuestionnaire(page: Page, applicantNames: readonly string[] = []) {
  const modernQuestionnaire = questionnaireScreen(page);
  const openQuestionnaireButton = drawer(page)
    .getByRole("button", { name: "Открыть анкету" })
    .first();

  if (await isVisible(modernQuestionnaire)) {
    await fillModernQuestionnaireAndReturnToDrawer(
      page,
      modernQuestionnaire,
      applicantNames,
    );
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
    await fillModernQuestionnaireAndReturnToDrawer(
      page,
      modernQuestionnaire,
      applicantNames,
      "drawer",
    );
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

async function completeNextQuestionnaireBlocker(page: Page) {
  const primaryAction = drawer(page).getByTestId("drawer-primary-action");
  const fillSectionAction = primaryAction.and(
    drawer(page).getByRole("button", { name: /^Заполнить раздел/ }),
  );
  if (!(await isVisible(fillSectionAction))) return;

  await fillSectionAction.click();
  const questionnaire = questionnaireScreen(page);
  await expect(questionnaire).toBeVisible();
  const completedTargets = new Set<string>();
  const navigationTargets = new Set<string>();
  let canonicalUpdates = 0;

  const activeContext = async () => {
    const applicant =
      (
        await questionnaire
          .locator('.v19-questionnaire-applicant-tab[aria-pressed="true"]')
          .first()
          .getAttribute("aria-label")
      )?.trim() ?? "unknown-applicant";
    const section =
      (
        await questionnaire
          .locator('.v19-questionnaire-section-tab[aria-pressed="true"]:visible')
          .first()
          .innerText()
      )
        .replace(/\s+/g, " ")
        .trim() || "unknown-section";
    return `${applicant} / ${section}`;
  };

  while (true) {
    const context = await activeContext();
    const requiredUnfilledField = questionnaire
      .locator(
        '.v19-questionnaire-work-panel [data-model-field-id]:has(.v19-questionnaire-required-mark):not([data-field-filled="true"]):visible',
      )
      .first();
    if ((await requiredUnfilledField.count()) > 0) {
      const fieldId = await requiredUnfilledField.getAttribute("data-model-field-id");
      if (!fieldId) {
        throw new Error("Questionnaire blocker is missing its canonical field id.");
      }
      const targetKey = `${context} / ${fieldId}`;
      if (completedTargets.has(targetKey)) {
        throw new Error(`Questionnaire blocker stayed incomplete: ${targetKey}`);
      }
      completedTargets.add(targetKey);
      await fillModernRequiredField(page, requiredUnfilledField, canonicalUpdates + 1);
      canonicalUpdates += 1;
      continue;
    }

    const reviewConfirmation = questionnaire
      .locator(".v19-questionnaire-work-panel")
      .getByRole("button", { name: /^Подтвердить поле:/ })
      .first();
    if ((await reviewConfirmation.count()) > 0) {
      const confirmationLabel =
        (await reviewConfirmation.getAttribute("aria-label")) ??
        (await reviewConfirmation.innerText());
      const targetKey = `${context} / ${confirmationLabel.trim()}`;
      if (completedTargets.has(targetKey)) {
        throw new Error(`Questionnaire review blocker stayed pending: ${targetKey}`);
      }
      completedTargets.add(targetKey);
      await reviewConfirmation.click();
      canonicalUpdates += 1;
      continue;
    }

    const readiness = questionnaire.getByRole("region", {
      name: "Готовность подачи",
    });
    const readinessText = (await readiness.innerText()).replace(/\s+/g, " ");
    if (readinessText.includes("100%") && readinessText.includes("0 рисков")) {
      break;
    }

    const nextBlocker = questionnaire.getByTestId("questionnaire-next-blocker");
    await expect(nextBlocker).toBeVisible();
    const blockerLabel =
      (await nextBlocker.getAttribute("aria-label")) ??
      (await nextBlocker.innerText());
    const navigationKey = `${context} / ${blockerLabel.replace(/\s+/g, " ").trim()}`;
    if (navigationTargets.has(navigationKey)) {
      throw new Error(
        `Questionnaire blocker navigation did not advance: ${navigationKey}`,
      );
    }
    navigationTargets.add(navigationKey);
    await nextBlocker.click();
  }

  expect(
    canonicalUpdates,
    "The questionnaire blocker did not expose any incomplete field or review confirmation.",
  ).toBeGreaterThan(0);
  await expect(
    questionnaire.getByRole("region", { name: "Готовность подачи" }),
  ).toContainText("100%");
  await expect(
    questionnaire.getByRole("region", { name: "Готовность подачи" }),
  ).toContainText("0 рисков");
  await questionnaire
    .getByRole("button", { exact: true, name: "Сохранить и выйти" })
    .click();
  await expect(questionnaire).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
  await expect(
    drawer(page)
      .getByTestId("drawer-primary-action")
      .and(drawer(page).getByRole("button", { name: /^Заполнить раздел/ })),
  ).toHaveCount(0);
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

    const pendingUpload = drawer(page)
      .getByRole("region", { name: "Чеклист документов" })
      .locator('button[data-v19-interaction-id="drawer.upload-file"]')
      .first();
    if (await isVisible(pendingUpload)) {
      const pendingLabel = (await pendingUpload.innerText()).trim();
      const fileChooserPromise = page.waitForEvent("filechooser");
      await pendingUpload.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(e2ePassportFile(`drawer-${pass}`));
      await expect(
        drawer(page)
          .getByRole("region", { name: "Чеклист документов" })
          .locator('button[data-v19-interaction-id="drawer.upload-file"]')
          .filter({ hasText: pendingLabel }),
      ).toHaveCount(0);
      continue;
    }

    return;
  }

  throw new Error("Не удалось загрузить все видимые файлы");
}

async function saveDraftFromDrawer(page: Page) {
  const saveDraft = drawer(page).getByRole("button", {
    name: "Сохранить черновик",
  });
  if (await isVisible(saveDraft)) {
    await saveDraft.click();
    return;
  }

  const startWork = drawer(page).getByRole("button", { name: "Начать работу" });
  await expect(startWork).toBeVisible();
  await startWork.click();
}

async function submitForReviewFromDrawer(page: Page) {
  let submitButton = drawer(page).getByTestId("drawer-primary-action");
  const confirmedApplicantIds = new Set<string>();
  for (let applicantIndex = 0; applicantIndex < 6; applicantIndex += 1) {
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveAccessibleName(
      /^(Отправить|Отправить на проверку|Отправить исправления|Подтвердите ручную проверку паспортных данных)$/,
    );
    const readyToSubmit = submitButton.and(
      drawer(page).getByRole("button", {
        name: /^(Отправить|Отправить на проверку|Отправить исправления)$/,
      }),
    );
    if (await isVisible(readyToSubmit)) {
      submitButton = readyToSubmit;
      break;
    }
    const manualPassportReview = submitButton.and(
      drawer(page).getByRole("button", {
        exact: true,
        name: "Подтвердите ручную проверку паспортных данных",
      }),
    );
    if (!(await isVisible(manualPassportReview))) {
      break;
    }

    await manualPassportReview.click();
    const questionnaire = questionnaireScreen(page);
    await expect(questionnaire).toBeVisible();
    await clickFirstVisible(
      questionnaire
        .locator(".v19-questionnaire-section-tab")
        .filter({ hasText: "Паспорт" }),
    );
    const confirmPassportReview = questionnaire.getByRole("button", {
      name: "Подтвердить ручную проверку паспорта",
    });
    await expect(confirmPassportReview).toBeEnabled();
    await confirmPassportReview.click();
    await expect(
      questionnaire.getByText("Ручная проверка паспорта подтверждена.").first(),
    ).toBeVisible();
    const submissionId = await questionnaire.getAttribute("data-submission-id");
    expect(submissionId).toBeTruthy();
    const persistedPassportReviewState = await page.evaluate(
      ({ id, key }) => {
        const submissions = JSON.parse(
          window.localStorage.getItem(key) ?? "[]",
        ) as Array<{
          applicants?: Array<{
            id: string;
            passportExtraction?: {
              status?: string;
              verifiedAtIso?: string;
            };
          }>;
          id: string;
        }>;
        const applicants =
          submissions.find((submission) => submission.id === id)?.applicants ?? [];
        return {
          pendingCount: applicants.filter(
            (applicant) =>
              applicant.passportExtraction?.status === "ready" &&
              !applicant.passportExtraction.verifiedAtIso,
          ).length,
          verifiedApplicantIds: applicants
            .filter((applicant) => applicant.passportExtraction?.verifiedAtIso)
            .map((applicant) => applicant.id),
        };
      },
      { id: submissionId!, key: localSubmissionsStorageKey },
    );
    const newlyConfirmedApplicantIds =
      persistedPassportReviewState.verifiedApplicantIds.filter(
        (applicantId) => !confirmedApplicantIds.has(applicantId),
      );
    expect(
      newlyConfirmedApplicantIds,
      `Passport confirmation was not durably persisted for submission ${submissionId}.`,
    ).not.toEqual([]);
    for (const applicantId of persistedPassportReviewState.verifiedApplicantIds) {
      confirmedApplicantIds.add(applicantId);
    }
    await questionnaire
      .getByRole("button", { exact: true, name: "Сохранить и выйти" })
      .click();
    await expect(questionnaire).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    submitButton = drawer(page).getByTestId("drawer-primary-action");
    await expect(submitButton).toHaveAccessibleName(
      persistedPassportReviewState.pendingCount > 0
        ? "Подтвердите ручную проверку паспортных данных"
        : /^(Отправить|Отправить на проверку|Отправить исправления)$/,
    );
  }
  const finalReadyToSubmit = submitButton.and(
    drawer(page).getByRole("button", {
      name: /^(Отправить|Отправить на проверку|Отправить исправления)$/,
    }),
  );
  if (!(await isVisible(finalReadyToSubmit))) {
    const availableActions = await drawer(page).getByRole("button").allTextContents();
    throw new Error(
      `Submit action is missing. Available drawer actions: ${availableActions
        .map((label) => label.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" | ")}`,
    );
  }
  submitButton = finalReadyToSubmit;
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
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

function e2ePassportBytes(name: string) {
  return Buffer.concat([
    e2ePassportBaseBytes,
    Buffer.from(`\nV19-E2E-UPLOAD:${name}`, "utf8"),
  ]);
}

function e2ePassportFile(name: string) {
  return {
    buffer: e2ePassportBytes(name),
    mimeType: "image/jpeg",
    name: `e2e-passport-${name}.jpg`,
  };
}

type LocalSubmissionExportEvidence = {
  exportPackage?: {
    contentFingerprint: string;
    fileName: string;
    format: string;
    idempotencyKey: string;
    rowCount: number;
    submissionIds: string[];
  };
  exportState?: string;
  files: Array<{
    applicantId: string;
    localDemoMediaStored?: true;
    originalFileName?: string;
    storagePath?: string;
    status: string;
    type: string;
  }>;
  history: Array<{ at: string; id: string; source: string; text: string }>;
  id: string;
  publicNumber?: string | number;
  status: string;
  updatedAt: string;
};

async function readLocalSubmission(
  page: Page,
  submissionId: string,
): Promise<LocalSubmissionExportEvidence> {
  return page.evaluate(
    ({ key, id }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error(`Local submissions are missing from ${key}.`);
      const submissions = JSON.parse(raw) as LocalSubmissionExportEvidence[];
      const submission = submissions.find(
        (candidate) =>
          candidate.id === id ||
          (candidate.publicNumber !== undefined &&
            `VF-${candidate.publicNumber}` === id),
      );
      if (!submission) throw new Error(`Submission ${id} is missing.`);
      return submission;
    },
    { id: submissionId, key: localSubmissionsStorageKey },
  );
}

async function expectLocalDemoMediaMatchesCanonicalState(page: Page) {
  const evidence = await page.evaluate(async (key) => {
    const submissions = JSON.parse(
      window.localStorage.getItem(key) ?? "[]",
    ) as Array<{
      files?: Array<{
        localDemoMediaStored?: true;
        storagePath?: string;
      }>;
    }>;
    const canonicalPaths = submissions
      .flatMap((submission) => submission.files ?? [])
      .filter(
        (file): file is { localDemoMediaStored: true; storagePath: string } =>
          file.localDemoMediaStored === true && Boolean(file.storagePath),
      )
      .map((file) => file.storagePath)
      .sort();

    const storedPaths = await new Promise<string[]>((resolve, reject) => {
      const openRequest = window.indexedDB.open("visaflow-local-demo-media-v1", 1);
      openRequest.onerror = () =>
        reject(openRequest.error ?? new Error("Local media database is unavailable."));
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        if (!database.objectStoreNames.contains("media")) {
          database.close();
          resolve([]);
          return;
        }
        const transaction = database.transaction("media", "readonly");
        const keysRequest = transaction.objectStore("media").getAllKeys();
        keysRequest.onerror = () =>
          reject(keysRequest.error ?? new Error("Local media keys are unavailable."));
        keysRequest.onsuccess = () => {
          database.close();
          resolve(
            keysRequest.result
              .filter((value): value is string => typeof value === "string")
              .sort(),
          );
        };
      };
    });

    return { canonicalPaths, storedPaths };
  }, localSubmissionsStorageKey);

  expect(new Set(evidence.canonicalPaths).size).toBe(evidence.canonicalPaths.length);
  expect(evidence.storedPaths).toEqual(evidence.canonicalPaths);
}

async function expectDownloadedSubmissionArchive(
  download: Download,
  submission: LocalSubmissionExportEvidence,
) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Downloaded ZIP stream is unavailable.");

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
  const manifestName = fileNames.find((name) => name.endsWith("/manifest.json"));
  if (!manifestName) throw new Error("Downloaded ZIP manifest is unavailable.");
  const manifest = JSON.parse(await zip.file(manifestName)!.async("string")) as {
    package: NonNullable<LocalSubmissionExportEvidence["exportPackage"]>;
    submissions: Array<{ id: string }>;
  };
  expect(manifest.submissions.map(({ id }) => id)).toEqual([submission.id]);

  const expectedFiles = submission.files.filter(
    (file) =>
      file.status === "accepted" &&
      ["passport_scan", "selfie", "selfie_2"].includes(file.type),
  );
  expect(expectedFiles.length).toBeGreaterThan(0);

  for (const file of expectedFiles) {
    expect(file.localDemoMediaStored).toBe(true);
    const originalName = file.originalFileName ?? "";
    const uploadName = /^e2e-passport-(.+)\.jpg$/.exec(originalName)?.[1];
    if (!uploadName) {
      throw new Error(`Unexpected local demo upload name: ${originalName}`);
    }
    const archiveType = file.type === "selfie" ? "selfie_1" : file.type;
    const entryName = fileNames.find((name) =>
      new RegExp(`_${archiveType}\\.(?:jpe?g|png|pdf)$`, "i").test(name),
    );
    if (!entryName) {
      throw new Error(`ZIP entry for ${archiveType} is missing.`);
    }
    const actual = Buffer.from(await zip.file(entryName)!.async("uint8array"));
    expect(actual.equals(e2ePassportBytes(uploadName))).toBe(true);
  }

  return manifest.package;
}

async function generateAndDownloadExcel(page: Page) {
  const generateButton = page.getByRole("button", { name: "Сформировать Excel" });

  if (!(await isVisible(generateButton))) {
    const openContractButton = page
      .getByRole("button", { name: "Открыть контракт выгрузки" })
      .first();

    if (await isVisible(openContractButton)) {
      await openContractButton.click();
      await expect(generateButton).toBeVisible();
    }
  }

  await generateButton.click();
  const downloadButton = page.getByRole("link", { name: "Скачать Excel" });
  await expect(downloadButton).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  await expect(download.failure()).resolves.toBeNull();
  return download;
}

async function generateDownloadAndConfirmZip(page: Page) {
  const prepareZip = page.getByRole("button", {
    name: "Сформировать ZIP с Excel",
  });
  await expect(prepareZip).toBeEnabled();
  await prepareZip.click();
  const downloadZip = page.getByRole("link", { name: "Скачать ZIP" });
  await expect(downloadZip).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await downloadZip.click();
  const download = await downloadPromise;
  await expect(download.failure()).resolves.toBeNull();
  await page.getByRole("button", { name: "Подтвердить скачивание" }).click();
  await expect(page.getByTestId("export-action-feedback")).toContainText(
    /пакет зафиксирован|Выгрузка завершена/i,
  );
  return download;
}

async function uploadCreatePassports(page: Page, names: string[]) {
  const createWorkspace = page.locator('[data-agent-screen="create"]');
  await expect(createWorkspace).toBeVisible();
  const type = names.length > 1 ? "Семья" : "Заявитель";
  const typeRadio = createWorkspace.getByRole("radio", { name: type });
  if ((await typeRadio.getAttribute("aria-checked")) !== "true") {
    await typeRadio.click();
  }

  const city = createWorkspace.getByRole("combobox", { name: "Город подачи" });
  await city.click();
  await page.getByRole("option", { name: "Москва" }).click();

  const passportInput = createWorkspace.locator(
    'input[data-v19-interaction-id="new-submission.choose-files"][type="file"]',
  );
  for (const [applicantIndex, name] of names.entries()) {
    const applicant = createWorkspace.getByRole("listitem").nth(applicantIndex);
    await applicant.getByRole("button").first().click();
    await passportInput.setInputFiles(e2ePassportFile(name));
    await expect(applicant).not.toContainText("Распознаём");
  }

  await expect(
    createWorkspace.getByRole("button", { name: "Создать и открыть анкету" }),
  ).toBeEnabled();
}

async function createNamedSubmission(
  page: Page,
  input: {
    fillQuestionnaire?: boolean;
    names: string[];
    type: "single" | "family";
  },
) {
  await openCreateSubmission(page);
  const createWorkspace = page.locator('[data-agent-screen="create"]');
  await expect(createWorkspace).toBeVisible();

  const submissionType = createWorkspace.getByRole("radio", {
    name: input.type === "family" ? "Семья" : "Заявитель",
  });
  await submissionType.click();
  await expect(submissionType).toHaveAttribute("aria-checked", "true");

  await createWorkspace.getByLabel("Город подачи").click();
  await page.getByRole("option", { exact: true, name: "Москва" }).click();

  if (input.type === "family") {
    for (let index = 2; index < input.names.length; index += 1) {
      await createWorkspace
        .getByRole("button", { name: /Добавить (следующего )?заявителя/ })
        .click();
    }
  }

  await createWorkspace
    .locator(
      'input[data-v19-interaction-id="new-submission.choose-files"][type="file"]',
    )
    .setInputFiles(input.names.map((name) => e2ePassportFile(name)));

  const assignment = page.getByRole("dialog", { name: "Назначьте паспорта" });
  if (input.names.length > 1) {
    await expect(assignment).toBeVisible();
    const ownerSelectors = assignment.getByRole("combobox", {
      name: /Заявитель для/,
    });
    await expect(ownerSelectors).toHaveCount(input.names.length);
    for (let index = 0; index < input.names.length; index += 1) {
      await ownerSelectors.nth(index).selectOption(String(index));
    }
    await assignment.getByRole("button", { name: "Распознать паспорта" }).click();
    await expect(assignment).toBeHidden();
  }

  const createButton = createWorkspace.getByRole("button", {
    name: "Создать и открыть анкету",
  });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  const createdQuestionnaire = questionnaireScreen(page);
  await expect(createdQuestionnaire).toBeVisible();
  if (input.fillQuestionnaire === false) {
    const submissionId = await createdQuestionnaire.getAttribute("data-submission-id");
    expect(submissionId).toBeTruthy();
    await createdQuestionnaire.getByRole("button", { name: "Назад" }).click();
    await expect(createdQuestionnaire).toHaveCount(0);
    if (!(await isVisible(drawer(page)))) {
      await expect(
        page.getByRole("heading", { level: 1, name: "Мои подачи" }),
      ).toBeVisible();
      const resetFilters = page
        .getByRole("button", { exact: true, name: "Все" })
        .first();
      if (await isVisible(resetFilters)) await resetFilters.click();
      const createdCard = page
        .locator(
          `[data-testid="agent-submission-card"][data-submission-id="${submissionId}"]`,
        )
        .first();
      await expect(createdCard).toBeVisible();
      await createdCard.click();
    }
  } else {
    await fillQuestionnaire(page, input.names);
  }
  await expect(drawer(page)).toBeVisible();
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

  test("localhost guard records blocked origins and browser failures", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/v19-localhost-guard-probe");
        return "external-request-resolved";
      } catch {
        return "blocked";
      }
    });

    expect(result).toBe("blocked");
    await page.route("**/__v19-localhost-guard-500__", async (route) => {
      await route.fulfill({ body: "guard failure probe", status: 500 });
    });
    const sameOriginStatus = await page.evaluate(async () => {
      const response = await fetch("/__v19-localhost-guard-500__");
      return response.status;
    });
    expect(sameOriginStatus).toBe(500);
    await page.evaluate(() => {
      console.error("v19-localhost-guard-console-probe");
    });
    const pageError = page.waitForEvent("pageerror");
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("v19-localhost-guard-pageerror-probe");
      }, 0);
    });
    await pageError;

    const guardProblems = takeLocalhostGuardProblems(page);
    expect(guardProblems).toEqual(
      expect.arrayContaining([
        "blocked-origin: GET https://example.com/v19-localhost-guard-probe",
        expect.stringMatching(
          /^network: HTTP 500 GET http:\/\/(?:127\.0\.0\.1|localhost):\d+\/__v19-localhost-guard-500__$/,
        ),
        "console: v19-localhost-guard-console-probe",
        "pageerror: v19-localhost-guard-pageerror-probe",
        expect.stringMatching(
          /^console: Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/,
        ),
      ]),
    );
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
      page.getByRole("textbox", { name: "ID, семья или город" }),
    ).toBeVisible();
    const firstAction = page.getByTestId("agent-action-queue-item").first();
    await expect(firstAction).toBeVisible();
    await expect(firstAction).toContainText(
      /Открыть анкету|Добавить файл|Заменить файл/,
    );
    await page.screenshot({
      fullPage: true,
      path: testArtifactPath("v19-agent-actions-restored-desktop.png"),
    });

    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await expectAtLeastOneVisible(
      page.getByRole("button", { name: "Новая подача" }),
      "No visible create-submission button matched.",
    );
    await expect(
      page.getByRole("heading", { level: 2, name: "Заявители" }),
    ).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Все" }).first().click();
    await expect(page.getByRole("heading", { level: 2, name: "Семьи" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Заявители" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Артём Соколов" }),
    ).toBeVisible();

    await clickWorkspaceButton(page, /Настройки/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Настройки" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Системные настройки" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Ощущение интерфейса" }),
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

    const statusOption = page.getByRole("button", {
      exact: true,
      name: "К выгрузке",
    });
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
      const choice = target?.closest?.("button");

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
    await expect(statusOption).toContainText("К выгрузке");

    await statusOption.click();
    await expect(statusOption).toHaveAttribute("aria-pressed", "true");
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
    await expect(submissionCard(page, "Ольга Фролова")).toHaveCount(0);

    await switchToAdmin(page);
    await expectAdminWorkNavigation(page);
    await clickWorkspaceButton(page, /Выгрузка/);

    await expect(
      page.locator(".export-row").filter({ hasText: "Ольга Фролова" }),
    ).toBeVisible();

    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Смирновы", "Семья Смирновых");
    await expect(drawer(page).getByText("Исправления к закрытию")).toBeVisible();
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
    await submissionCardById(page, "ПД-1048").click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expectDrawerStatus(page, "Возвращено");
    await openMediaTab(page);
    await expect(drawer(page).getByText("Селфи 1").first()).toBeVisible();
    await expect(drawer(page).getByText("Мария Иванова").first()).toBeVisible();
    await expect(
      drawer(page).getByRole("button", {
        name: "Загрузить: Мария Иванова • Селфи 1",
      }),
    ).toBeVisible();
    await expect(
      drawer(page).getByText("Исправьте замечания перед повторной отправкой."),
    ).toBeVisible();
    await closeDrawer(page);

    await switchToAdmin(page);
    await expectAdminWorkNavigation(page);
    await expect(submissionCard(page, "Нина Волкова")).toBeVisible();
    await openAdminSubmission(page, "Нина Волкова");
    await beginAdminIssue(page);
    await expect(issueComposer(page)).toBeVisible();
    await expect(
      issueComposer(page).getByText("Нина Волкова · Данные · Маршрут поездки").first(),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(issueComposer(page)).toHaveCount(0);
    await expect(
      drawer(page).getByRole("heading", { level: 1, name: "Сверка паспорта" }),
    ).toBeVisible();
    await beginAdminIssue(page);
    await expect(issueComposer(page)).toBeVisible();
    await issueComposer(page).getByRole("button", { name: "Отмена" }).click();
    await closeDrawer(page);
    await openAdminSubmission(page, "Нина Волкова");
    await expect(issueComposer(page)).toHaveCount(0);
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await expect(
      page.locator(".export-row").filter({ hasText: "Дмитрий Орлов" }),
    ).toBeVisible();
    const dmitryExportCheckbox = page.getByRole("checkbox", {
      name: "Выбрать Дмитрий Орлов",
    });
    await expect(dmitryExportCheckbox).toBeEnabled();
    await dmitryExportCheckbox.check();
    await expect(dmitryExportCheckbox).toBeChecked();
    await expect(exportControl(page)).toContainText(
      /Активный пакет\s*Дмитрий Орлов\s*готов/,
    );
    await expect(exportControl(page)).toContainText(/Excel rows\s*1 строка/);
    await expect(
      page.getByRole("button", { name: "Сформировать Excel" }),
    ).toBeVisible();
    await expect(page.locator("#export-action-hint")).toContainText(
      "ZIP включает Excel и обязательные документы",
    );
    const download = await generateAndDownloadExcel(page);
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await clearExportSelection(page);
    await expect(exportControl(page)).toContainText("Пакет не выбран");
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

    const reviewAction = page
      .getByRole("button", { name: /Ручная проверка заявки Нина Волкова/i })
      .first();

    await reviewAction.focus();
    await expect(reviewAction).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      drawer(page).getByRole("heading", { level: 1, name: "Сверка паспорта" }),
    ).toBeVisible();
    await expectDrawerStatus(page, "На проверке");

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("v19-linear-drawer-desktop.png"),
      });
    }

    await beginAdminIssue(page);
    await expect(issueComposer(page)).toBeVisible();

    if (projectName === "chromium") {
      await page.waitForTimeout(250);
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath("v19-linear-issue-composer-desktop.png"),
      });
    }

    await page.keyboard.press("Escape");
    await expect(issueComposer(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);
    await expect(reviewAction).toBeFocused();

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    const dmitryExportCheckbox = page.getByRole("checkbox", {
      name: "Выбрать Дмитрий Орлов",
    });
    await expect(dmitryExportCheckbox).toBeEnabled();
    await dmitryExportCheckbox.check();
    await expect(dmitryExportCheckbox).toBeChecked();
    await expect(exportControl(page)).toContainText(
      /Активный пакет\s*Дмитрий Орлов\s*готов/,
    );
    await expect(exportControl(page)).toContainText(/Excel rows\s*1 строка/);
    await expect(page.locator("#export-action-hint")).toContainText(
      "ZIP включает Excel и обязательные документы",
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
      heading: /^(Очередь на проверку|Проверка)$/,
      workspaceEmail: "admin@visaflow.local",
    });

    await expect(
      page.getByRole("heading", { name: /^(Очередь на проверку|Проверка|Работа)$/ }),
    ).toBeVisible();
    await openMobileMenu(page);
    await expect(page.getByRole("button", { name: /Выгрузка/ })).toBeVisible();
    await clickWorkspaceButton(page, /Проверка|Работа/);
    await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);
  });

  test("agent creates a draft and opens returned issues in the drawer", async ({
    page,
  }, testInfo) => {
    await createNamedSubmission(page, {
      names: ["Основной заявитель", "Супруг"],
      type: "family",
    });
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Основной" }),
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
    const issuesTab = drawer(page).getByRole("tab", { name: /Замечания/ });
    await expect(issuesTab).toHaveAttribute("aria-selected", "true");
    await expect(
      drawer(page).getByRole("tabpanel", { name: /Замечания/ }),
    ).toBeVisible();

    await openQuestionnaireTab(page);
    const questionnaireTab = drawer(page).getByRole("tab", { name: "Анкета" });
    await expect(questionnaireTab).toHaveAttribute("aria-selected", "true");
    await expect(drawer(page).getByRole("tabpanel", { name: "Анкета" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeVisible();
  });

  test("dirty create drawer confirms close from keyboard", async ({ page }) => {
    await clickWorkspaceButton(page, /Мои подачи/);
    const trigger = page.getByRole("button", { name: "Новая подача" }).first();
    await trigger.click();
    const createWorkspace = page.locator('[data-agent-screen="create"]');

    await expect(
      page.getByRole("heading", { level: 1, name: "Новая подача" }),
    ).toBeVisible();
    await expect(
      createWorkspace.getByRole("region", { name: "Данные подачи" }),
    ).toBeVisible();
    await expect(createWorkspace.getByRole("list")).toBeVisible();

    await createWorkspace
      .locator(
        'input[data-v19-interaction-id="new-submission.choose-files"][type="file"]',
      )
      .setInputFiles({
        name: "passport.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%passport-local-preview\n"),
      });
    await expect(
      createWorkspace.getByText(
        "Не удалось распознать паспорт. Сохраните его и заполните данные вручную.",
      ),
    ).toBeVisible();
    await expect(
      createWorkspace.getByRole("button", { name: "Распознать снова" }),
    ).toBeVisible();
    await expect(
      createWorkspace.getByRole("button", { name: "Создать и открыть анкету" }),
    ).toBeDisabled();

    await createWorkspace.getByRole("radio", { name: "Семья", exact: true }).click();
    await expect(
      createWorkspace.getByRole("group", { name: "Общие данные семьи" }),
    ).toBeVisible();
    await createWorkspace.getByTestId("preupload-family-add").click();
    await expect(createWorkspace.getByRole("listitem")).toHaveCount(3);
    const cancelCreate = page.getByRole("button", {
      name: "Отменить создание подачи",
    });
    await cancelCreate.focus();
    await page.keyboard.press("Enter");

    const confirmation = page.getByRole("alertdialog", {
      name: "Выйти без сохранения?",
    });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole("button", { name: "Вернуться к редактированию" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(cancelCreate).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Выйти без сохранения" }).click();

    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("created draft persists after reload", async ({ page }) => {
    await openCreateSubmission(page);
    await uploadCreatePassports(page, ["Основной заявитель", "Супруг"]);
    await page
      .locator('[data-agent-screen="create"]')
      .getByRole("button", { name: "Сохранить черновик" })
      .click();
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Все" }).first().click();
    await expect(submissionCard(page, "Семья Основной")).toContainText("Черновик");

    await page.reload();
    await clickWorkspaceButton(page, /Мои подачи/);
    const resetFilters = page.getByRole("button", { exact: true, name: "Все" }).first();
    if (await isVisible(resetFilters)) await resetFilters.click();
    await expect(submissionCard(page, "Семья Основной")).toBeVisible();
    await expect(submissionCard(page, "Семья Основной")).toContainText("Черновик");
  });

  test("header actions stay locked when the current list is filtered empty", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await fillCurrentListSearch(page, "нет такой подачи");

    await expect(page.getByText("Ничего не найдено", { exact: true })).toBeVisible();
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

  test("admin review keeps incomplete passport facts explicit and manual", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await openAdminSubmission(page, "Нина Волкова");
    await expect(
      drawer(page).getByRole("heading", { level: 1, name: "Сверка паспорта" }),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("article", { name: /Имя: не заполнено/ }),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Принять всё" }),
    ).toBeDisabled();
    await beginAdminIssue(page);
    const composer = issueComposer(page);
    await expect(composer).toBeVisible();
    await composer.getByRole("button", { name: "Отмена" }).click();
    await expect(composer).toHaveCount(0);
    await expect(
      drawer(page).getByRole("status", { name: "Состояние проверки" }),
    ).toContainText(/Открыто\s*0/);
  });

  test("admin review fails closed without automated mutation", async ({ page }) => {
    await switchToAdmin(page);
    await openAdminSubmission(page, "Нина Волкова");
    await expectDrawerStatus(page, "На проверке");
    await expect(
      drawer(page).getByRole("button", { name: "Проверить AI" }),
    ).toHaveCount(0);
    await expect(
      drawer(page).getByRole("button", { name: "Принять на выгрузку" }),
    ).toBeDisabled();
    await expect(
      drawer(page).getByRole("status", { name: "Состояние проверки" }),
    ).toContainText(/Открыто\s*0/);
    await closeDrawer(page);
    await page.reload();
    await openAdminSubmission(page, "Нина Волкова");
    await expect(
      drawer(page).getByRole("status", { name: "Состояние проверки" }),
    ).toContainText(/Открыто\s*0/);
  });

  test("admin can add a precise issue and return a submission", async ({ page }) => {
    await switchToAdmin(page);
    await expectAdminWorkNavigation(page);
    await openMobileMenu(page);
    await expect(page.getByRole("button", { name: /Выгрузка/ })).toBeVisible();
    await clickWorkspaceButton(page, /Проверка|Работа/);
    await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);

    await openAdminSubmission(page, "Нина Волкова");
    await beginAdminIssue(page);
    await submitAdminIssue(page);
    const reviewState = page.getByRole("status", {
      name: "Состояние проверки",
    });
    await expect(reviewState).toContainText("Открыто");
    await expect(reviewState).toContainText("1");
    await drawer(page)
      .getByRole("button", { name: "Отправить на исправление", exact: true })
      .click();
    await expect(page.getByText("Возврат на исправление сохранён.")).toBeVisible();
    await expect(
      drawer(page)
        .getByLabel("Готовность паспортной проверки")
        .getByText("Статус «returned» доступен только для чтения."),
    ).toBeVisible();
    await closeDrawer(page);

    await page.reload();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^(Мои действия|Очередь на проверку|Проверка|Работа)$/,
      }),
    ).toBeVisible();
    await switchToAgent(page);
    await clickWorkspaceButton(page, /Мои подачи/);
    await openAgentSubmission(page, "Нина Волкова");
    await expectDrawerStatus(page, "Возвращено");
  });

  test("admin accepts corrections and completes the export sequence", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await expect(submissionCard(page, "Смирновы")).toBeVisible();

    await openAdminSubmission(page, "Смирновы", "Семья Смирновых");
    await expect(drawer(page).getByText("Исправления к закрытию")).toBeVisible();
    await expect(drawer(page).getByText("Адрес отеля был неполным")).toBeVisible();
    await expect(drawer(page).getByText("Елена Смирнова · Данные")).toBeVisible();
    const correctedIssues = drawer(page).getByRole("region", {
      name: "Исправления к закрытию",
    });
    await expect(correctedIssues).toContainText("1");
    await expect(correctedIssues).toContainText("Адрес отеля был неполным");
    await expect(drawer(page).getByLabel("Lifecycle замечаний")).toContainText(
      /0\s*исправлено агентом/,
    );
    await acceptAdminSubmissionForExport(page);
    await expectDrawerStatus(page, "Готово к выгрузке");
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await clearExportSelection(page);
    const smirnovsExportCheckbox = page.getByRole("checkbox", {
      name: /Выбрать .*Смирнов/,
    });
    await expect(smirnovsExportCheckbox).toBeEnabled();
    await smirnovsExportCheckbox.check();
    await expect(smirnovsExportCheckbox).toBeChecked();
    await expect(exportControl(page)).toContainText(
      /Активный пакет\s*Смирновы\s*готов/,
    );
    await expect(exportControl(page)).toContainText(/Excel rows\s*2 строки/);
    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Excel сформирован:",
    );
    const excelLink = page.getByRole("link", { name: "Скачать Excel" });
    await expect(excelLink).toBeVisible();
    const excelDownloadPromise = page.waitForEvent("download");
    await excelLink.click();
    await excelDownloadPromise;
    await expect(page.locator("#export-action-hint")).toContainText(
      "Скачивание Excel начато:",
    );
    await page.getByRole("button", { name: "Сформировать ZIP с Excel" }).click();
    const zipLink = page.getByRole("link", { name: "Скачать ZIP" });
    await expect(zipLink).toBeVisible();
    const zipDownloadPromise = page.waitForEvent("download");
    await zipLink.click();
    await zipDownloadPromise;
    await page.getByRole("button", { name: "Подтвердить скачивание" }).click();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Скачивание подтверждено, пакет зафиксирован",
    );

    await clickExportTab(page, "История");
    await expect(
      page.locator(".export-history-table .export-row").filter({ hasText: "Смирнов" }),
    ).toBeVisible();

    const exportedFamilyRow = page
      .locator(".export-row")
      .filter({ hasText: "Смирнов" });
    await expect(
      exportedFamilyRow.getByRole("button", { name: /^(Открыть|Проверить) PDF$/ }),
    ).toHaveCount(0);
    await expect(exportedFamilyRow.getByText("Нужна проверка PDF")).toBeVisible();
    await expect(exportedFamilyRow.getByText("PDF записи отсутствует.")).toBeVisible();
    await exportedFamilyRow.getByRole("button", { name: /Смирнов/ }).click();
    await expect(drawer(page).getByText("Семья Смирновых").first()).toBeVisible();
    await expect(
      drawer(page).getByRole("button", {
        name: /Передача агентам недоступна:/,
      }),
    ).toHaveCount(0);
  });

  test("admin can return corrected submission again after adding a new issue", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Смирновы", "Семья Смирновых");
    await expectDrawerStatus(page, "Исправления получены");

    await beginAdminIssue(page);
    await expect(issueComposer(page)).toBeVisible();
    await submitAdminIssue(page);

    await expect(
      drawer(page).getByRole("status", { name: "Состояние проверки" }),
    ).toContainText(/Открыто\s*1/);
    await expect(
      drawer(page).getByRole("button", { name: "Отправить на исправление" }),
    ).toBeEnabled();
    await drawer(page)
      .getByRole("button", { name: "Отправить на исправление" })
      .click();
    await expect(page.getByText("Возврат на исправление сохранён.")).toBeVisible();
    await expect(
      drawer(page)
        .getByLabel("Готовность паспортной проверки")
        .getByText("Статус «returned» доступен только для чтения."),
    ).toBeVisible();
  });

  test("agent can reopen OCR fields and explicitly submit without review", async ({
    page,
  }) => {
    await createNamedSubmission(page, {
      names: ["Ocr Dialog"],
      type: "single",
    });
    await expect(
      drawer(page).getByRole("heading", { name: "Dialog Ocr" }),
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

  test("export warns on same-city packages with different trip dates without blocking", async ({
    page,
  }) => {
    await switchToAdmin(page);
    await clickWorkspaceButton(page, /Выгрузка/);
    await clearExportSelection(page);
    const familyRow = page.getByTestId("admin-export-row-ПД-1054");
    const singleRow = page.getByTestId("admin-export-row-ПД-1056");
    await familyRow.getByRole("checkbox", { name: "Выбрать Петровы" }).check();
    await singleRow.getByRole("checkbox", { name: "Выбрать Дмитрий Орлов" }).check();
    await expect(page.getByRole("button", { name: "Выбрано" })).toContainText("2");
    await expect(exportControl(page)).toContainText(/Состав выгрузки\s*2 пакета/);
    await expect(
      page
        .locator(".blocker-box")
        .getByText("Нельзя смешивать одинарные и семейные подачи"),
    ).toHaveCount(0);
    await expect(page.locator("#export-action-hint")).not.toContainText(
      "Нельзя смешивать одинарные и семейные подачи",
    );
    await expect(exportControl(page)).toContainText(
      "В одном городе разные даты поездки. Excel и ZIP доступны, проверьте слот/дату перед BLS выгрузкой.",
    );
    await expect(
      page.getByRole("button", { name: "Сформировать Excel" }),
    ).toBeEnabled();
    await expect(page.locator("#export-action-hint")).toContainText(
      "ZIP включает Excel и обязательные документы",
    );
    const workbookPreview = page.getByRole("region", {
      name: "Данные Excel Preview",
    });
    await expect(workbookPreview).toContainText("3 строки");
    await generateAndDownloadExcel(page);
    await generateDownloadAndConfirmZip(page);
    await expect(familyRow).toHaveCount(0);
    await expect(singleRow).toHaveCount(0);
  });

  test("one submission moves from creation to Excel export", async ({ page }) => {
    const applicantName = "Романов Павел";
    const submissionTitle = "Павел Романов";

    await createNamedSubmission(page, {
      names: [applicantName],
      type: "single",
    });
    await expect(
      drawer(page).getByRole("heading", { name: submissionTitle }),
    ).toBeVisible();

    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await saveDraftFromDrawer(page);
    await submitForReviewFromDrawer(page);
    await expectDrawerStatus(page, "На проверке");
    const submittedId = (
      (await drawer(page)
        .getByText(/(?:ПД|SUB|VF)-\d+/)
        .first()
        .textContent()) ?? ""
    ).trim();
    await closeDrawer(page);

    await switchToAdmin(page);
    await selectAdminReviewQueue(page);
    await openAdminSubmission(page, submittedId, submissionTitle);
    await beginAdminIssue(page);
    await submitAdminIssue(page);
    const reviewState = page.getByRole("status", {
      name: "Состояние проверки",
    });
    await expect(reviewState).toContainText("Открыто");
    await expect(reviewState).toContainText("1");
    await drawer(page)
      .getByRole("button", { name: "Отправить на исправление", exact: true })
      .click();
    await expect(page.getByText("Возврат на исправление сохранён.")).toBeVisible();
    await closeDrawer(page);
    await expect(drawer(page)).toHaveCount(0);

    await switchToAgent(page);
    await clickWorkspaceButton(page, /Мои подачи/);
    await openAgentSubmission(page, submittedId, submissionTitle);
    await openDrawerTab(page, ["Замечания"]);
    const replacementIssue = drawer(page).getByRole("article", {
      name: /Требуется заменить файл/,
    });
    await expect(replacementIssue).toBeVisible();
    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await expectLocalDemoMediaMatchesCanonicalState(page);
    await openDrawerTab(page, ["Замечания"]);
    await expect(replacementIssue).toContainText("Исправлено");
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
    await closeDrawer(page);

    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, submittedId, submissionTitle);
    await acceptAdminSubmissionForExport(page);
    await closeDrawer(page);

    await clickWorkspaceButton(page, /Выгрузка/);
    await clearExportSelection(page);
    const exportRow = page.locator(".export-row").filter({ hasText: submittedId });
    await expect(exportRow).toBeVisible();
    await exportRow.getByRole("checkbox").check();
    await expect(exportRow.getByRole("checkbox")).toBeChecked();
    const workbookPreview = page.getByRole("region", {
      name: "Данные Excel Preview",
    });
    await expect(workbookPreview).toBeVisible();
    await expect(
      workbookPreview.getByRole("heading", { name: "Excel Preview · Sheet1" }),
    ).toBeVisible();
    await expect(workbookPreview).toContainText("1 строка");
    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    const refreshedExcelLink = page.getByRole("link", { name: "Скачать Excel" });
    await expect(refreshedExcelLink).toBeVisible();
    const refreshedExcelDownload = page.waitForEvent("download");
    await refreshedExcelLink.click();
    await refreshedExcelDownload;
    await page.getByRole("button", { name: "Сформировать ZIP с Excel" }).click();
    const refreshedZipLink = page.getByRole("link", { name: "Скачать ZIP" });
    await expect(refreshedZipLink).toBeVisible();
    const readySubmission = await readLocalSubmission(page, submittedId);
    expect(readySubmission.status).toBe("ready_for_export");
    const refreshedZipDownload = page.waitForEvent("download");
    await refreshedZipLink.click();
    const downloadedZip = await refreshedZipDownload;
    await expect(downloadedZip.failure()).resolves.toBeNull();
    const downloadedPackage = await expectDownloadedSubmissionArchive(
      downloadedZip,
      readySubmission,
    );
    await page.getByRole("button", { name: "Подтвердить скачивание" }).click();
    await expect(page.getByTestId("export-action-feedback")).toContainText(
      /пакет зафиксирован|Выгрузка завершена/i,
    );
    await expect(exportRow).toHaveCount(0);

    const exportedSubmission = await readLocalSubmission(page, submittedId);
    expect(exportedSubmission.status).toBe("exported");
    expect(exportedSubmission.exportState).toBe("marked_exported");
    expect(exportedSubmission.exportPackage).toEqual(downloadedPackage);
    expect(Number.isNaN(Date.parse(exportedSubmission.updatedAt))).toBe(false);
    expect(exportedSubmission.history).toContainEqual(
      expect.objectContaining({
        at: exportedSubmission.updatedAt,
        source: "admin",
        text: expect.stringContaining(downloadedPackage.fileName),
      }),
    );

    await page.reload();
    const exportHeading = page.getByRole("heading", {
      level: 1,
      name: "Центр выгрузки",
    });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    if (!(await isVisible(exportHeading))) {
      const agentHeading = page.getByRole("heading", {
        exact: true,
        level: 1,
        name: /^(Мои действия|Мои подачи|Новая подача|Настройки)$/,
      });
      if (await isVisible(agentHeading)) {
        await switchToAdmin(page);
      }
      await clickWorkspaceButton(page, /Выгрузка/);
    }
    await expect(exportHeading).toBeVisible();
    await expect(
      page.locator(".export-row").filter({ hasText: submittedId }),
    ).toHaveCount(0);
    const reloadedSubmission = await readLocalSubmission(page, submittedId);
    expect(reloadedSubmission).toEqual(exportedSubmission);
    await expectLocalDemoMediaMatchesCanonicalState(page);

    await switchToAgent(page);
    await clickWorkspaceButton(page, /Мои подачи/);
    await openAgentSubmission(page, submittedId, submissionTitle);
    await expectDrawerStatus(page, "Выгружено");
    await expect(
      drawer(page).getByRole("button", {
        name: /^(Сохранить черновик|Отправить|Отправить на проверку)$/,
      }),
    ).toHaveCount(0);
    await closeDrawer(page);
  });

  test("four-person family passes correction, admin return and exact blocker", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await clickWorkspaceButton(page, /Мои подачи/);
    await expectReturnedIvanovsDecisionFrame(page);
    await openReturnedIvanovsSubmission(page);
    await expectDrawerStatus(page, "Возвращено");
    await openDrawerTab(page, ["Замечания"]);
    const replacementTargets = [
      "Мария Иванова • Селфи 1",
      "София Иванова • Скан паспорта",
    ] as const;
    for (const target of replacementTargets) {
      const issueInput = drawer(page).getByLabel(`Выбрать файл: ${target}`, {
        exact: true,
      });
      await expect(issueInput).toHaveCount(1);
      await issueInput.setInputFiles(e2ePassportFile(target));
      if (!(await isVisible(drawer(page)))) {
        await clickWorkspaceButton(page, /Мои подачи/);
        await openReturnedIvanovsSubmission(page);
        await openDrawerTab(page, ["Замечания"]);
      }
      await expect(
        drawer(page).getByLabel(`Выбрать файл: ${target}`, { exact: true }),
      ).toHaveCount(0);
    }
    await expectLocalDemoMediaMatchesCanonicalState(page);
    await expect(drawer(page).getByTestId("drawer-open-issues-count")).toHaveText(
      "Открыто: 0",
    );
    await expect(
      drawer(page).getByRole("heading", {
        exact: true,
        name: "Исправлено, ждёт проверки",
      }),
    ).toBeVisible();
    const requiredQuestionnaireAction = drawer(page)
      .getByTestId("drawer-primary-action")
      .and(drawer(page).getByRole("button", { name: /^Заполнить раздел/ }));
    if (await isVisible(requiredQuestionnaireAction)) {
      await completeNextQuestionnaireBlocker(page);
      await expect(drawer(page).getByTestId("drawer-open-issues-count")).toHaveText(
        "Открыто: 0",
      );
    }
    await submitForReviewFromDrawer(page);
    await expectDrawerStatus(page, "Исправления получены");
    await expectDrawerHistoryEventCount(
      page,
      "Статус изменен: Исправления получены: Агент отправил исправления",
      1,
    );
    await closeDrawer(page);

    await switchToAdmin(page);
    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Ивановы", "Семья Ивановых");
    await expectDrawerStatus(page, "Исправления получены");
    await expectDrawerHistoryEventCount(
      page,
      "Статус изменен: Исправления получены: Агент отправил исправления",
      1,
    );
    await closeDrawer(page);
    await page.reload();
    await openCorrectionsTab(page);
    await openAdminSubmission(page, "Ивановы", "Семья Ивановых");
    await expectDrawerStatus(page, "Исправления получены");
    await expectDrawerHistoryEventCount(
      page,
      "Статус изменен: Исправления получены: Агент отправил исправления",
      1,
    );
    await beginAdminIssue(page);
    await submitAdminIssue(page);
    await expect(
      drawer(page).getByRole("status", { name: "Состояние проверки" }),
    ).toContainText(/Открыто\s*1/);
    const returnForCorrection = drawer(page).getByRole("button", {
      name: "Отправить на исправление",
    });
    await expect(returnForCorrection).toBeEnabled();
    await returnForCorrection.click();
    await expect(page.getByText("Возврат на исправление сохранён.")).toBeVisible();
    await expectDrawerHistoryEventCount(page, "Статус изменен: Возвращено", 1);
    await closeDrawer(page);

    await switchToAgent(page);
    await page.reload();
    await clickWorkspaceButton(page, /Мои подачи/);
    await openReturnedIvanovsSubmission(page);
    await expectDrawerStatus(page, "Возвращено");
    await expect(
      drawer(page).getByText("Исправьте замечания перед повторной отправкой."),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", {
        exact: true,
        name: "Загрузить: Мария Иванова • Скан паспорта",
      }),
    ).toBeVisible();
    await openDrawerTab(page, ["Замечания"]);
    await expect(
      drawer(page)
        .getByText(/Паспорт не читается|Лицо обрезано/)
        .first(),
    ).toBeVisible();
    await expectDrawerHistoryEventCount(
      page,
      "Статус изменен: Исправления получены: Агент отправил исправления",
      1,
    );
    await expect(
      drawer(page).getByText("Администратор добавил точное замечание", {
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      drawer(page).getByText("Статус изменен: Возвращено", { exact: true }),
    ).toHaveCount(1);

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("incomplete single applicant fails closed until questionnaire completion", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    const singleName = "Романов Павел";
    const singleTitle = "Павел Романов";
    await createNamedSubmission(page, {
      fillQuestionnaire: false,
      type: "single",
      names: [singleName],
    });
    await expect(drawer(page)).toBeVisible();
    await expectDrawerStatus(page, "Черновик");
    await openMediaTab(page);
    await uploadAllVisibleFiles(page);
    await saveDraftFromDrawer(page);
    await expect(
      drawer(page).getByRole("region", { name: "Следующий шаг по подаче" }),
    ).toContainText("Есть незаполненные поля");
    await expect(
      drawer(page).getByTestId("drawer-primary-action"),
    ).toHaveAccessibleName(
      /^(Заполнить раздел|Подтвердите ручную проверку паспортных данных$|Проверить срок действия паспорта$)/,
    );
    await expect(drawer(page).getByRole("button", { name: "Отправить" })).toHaveCount(
      0,
    );
    await openQuestionnaireTab(page);
    await fillQuestionnaire(page, [singleName]);
    await expect(
      drawer(page).getByRole("heading", { name: singleTitle }),
    ).toBeVisible();
    await submitForReviewFromDrawer(page);
    await expectDrawerStatus(page, "На проверке");
    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("deselecting the active export moves preview to the remaining package", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await switchToAdmin(page);
    await clickWorkspaceButton(page, /Выгрузка/);
    await clearExportSelection(page);
    const familyRow = page.getByTestId("admin-export-row-ПД-1054");
    const singleRow = page.getByTestId("admin-export-row-ПД-1056");
    await familyRow.getByRole("checkbox").check();
    await singleRow.getByRole("checkbox").check();
    await expect(singleRow).toHaveClass(/is-active/);
    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    await expect(page.getByRole("link", { name: "Скачать Excel" })).toBeVisible();
    await singleRow.getByRole("checkbox").uncheck();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();
    await expect(familyRow.getByRole("checkbox")).toBeChecked();
    await expect(familyRow).toHaveClass(/is-active/);
    await expect(exportControl(page)).toContainText("1 пакет");
    await expect(exportControl(page)).toContainText(/Заявители\s*2/);
    await expect(
      page.getByRole("region", { name: "Данные Excel Preview" }),
    ).toContainText("2 строки");
    await singleRow.getByRole("checkbox").check();
    await expect(singleRow).toHaveClass(/is-active/);
    await familyRow.getByRole("checkbox").uncheck();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();
    await expect(familyRow.getByRole("checkbox")).not.toBeChecked();
    await expect(singleRow.getByRole("checkbox")).toBeChecked();
    await expect(singleRow).toHaveClass(/is-active/);
    await expect(exportControl(page)).toContainText("1 пакет");
    await expect(
      page.getByRole("region", { name: "Данные Excel Preview" }),
    ).toContainText("1 строка");
    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("two single applicants export together and clear the queue", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await switchToAdmin(page);
    await clickWorkspaceButton(page, /Выгрузка/);
    await clearExportSelection(page);
    const singleIds = ["ПД-1056", "SUB-1101"] as const;
    for (const submittedId of singleIds) {
      await page
        .getByTestId(`admin-export-row-${submittedId}`)
        .getByRole("checkbox")
        .check();
    }
    const exportControl = page.getByRole("complementary", {
      name: "Контроль пакета",
    });
    await expect(exportControl).toContainText("2 пакета");
    await expect(
      exportControl.getByText(
        "В строках выгрузки повторяется номер паспорта у разных заявителей",
      ),
    ).toHaveCount(0);
    await expect(
      exportControl.getByRole("button", { name: "Сформировать Excel" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("region", { name: "Данные Excel Preview" }),
    ).toContainText("2 строки");
    await generateAndDownloadExcel(page);
    await generateDownloadAndConfirmZip(page);

    for (const exportedId of singleIds) {
      await expect(page.getByTestId(`admin-export-row-${exportedId}`)).toHaveCount(0);
    }
    await expect(page.getByTestId("export-action-feedback")).toContainText(
      /пакет зафиксирован|Выгрузка завершена/i,
    );
    await page.reload();
    await clickWorkspaceButton(page, /Выгрузка/);
    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
    for (const exportedId of singleIds) {
      await expect(page.getByTestId(`admin-export-row-${exportedId}`)).toHaveCount(0);
    }
  });
});
