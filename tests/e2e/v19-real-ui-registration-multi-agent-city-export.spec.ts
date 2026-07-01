import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  e2ePassportFile,
  expectDrawerStatus,
  expectVisibleText,
  isVisible,
  markVisibleIssuesFixed,
  openDrawerTab,
  submissionCard,
  uploadAllVisibleFiles,
} from "./v19-pilot-helpers";

type City = "Москва" | "Санкт-Петербург" | "Казань";

const accessPassword = "secure-local-password";
const evidenceDir = "docs/qa/real-ui-goal-20260630";

type AgentAccount = {
  city: string;
  company: string;
  email: string;
  fullName: string;
  phone: string;
};

type FamilyDraft = {
  applicants: string[];
  city: City;
  fileSlug: string;
  ownerEmail: string;
  title: string;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function startFresh(page: Page, workspaceEmail: string) {
  await page.goto("/");
  await page.evaluate((email) => {
    localStorage.clear();
    localStorage.setItem("visaflow.workspaceEmail.v1", email);
  }, workspaceEmail);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
}

async function submitAccessRequest(page: Page, account: AgentAccount) {
  await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Заявка на доступ" }),
  ).toBeVisible();
  await page.getByLabel("Имя и фамилия").fill(account.fullName);
  await page.getByLabel("Агентство / компания").fill(account.company);
  await page.getByLabel("Город").fill(account.city);
  await page.getByLabel("Телефон").fill(account.phone);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Пароль", { exact: true }).fill(accessPassword);
  await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ожидает подтверждения" }),
  ).toBeVisible();
}

async function login(page: Page, email: string, password = accessPassword) {
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Мои действия|Проверка|Выгрузка|Настройки)$/,
    }),
  ).toBeVisible();
}

async function logoutThroughUi(page: Page) {
  const statusLogout = page.getByRole("button", { name: "Выйти" }).first();
  if (await isVisible(statusLogout)) {
    await statusLogout.click();
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
    return;
  }

  const workspaceLogout = page
    .getByRole("button", { name: "Выйти из рабочей области" })
    .first();
  if (await isVisible(workspaceLogout)) {
    await workspaceLogout.click();
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
    return;
  }

  await clickWorkspaceButton(page, /Настройки/);
  const profileButton = page.getByRole("button", { name: "Профиль" }).first();
  if (await isVisible(profileButton)) {
    await profileButton.click();
  }
  await page.getByRole("button", { name: /^(Сбросить почту|Выйти)$/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
}

async function approveAccessRequests(page: Page, emails: string[]) {
  await login(page, "admin@visaflow.local", "local-dev-password");
  await clickWorkspaceButton(page, /Настройки/);
  await page.getByRole("button", { name: "Входящие заявки" }).click();
  const queue = page.getByTestId("admin-access-queue");
  await expect(queue).toBeVisible();

  for (const email of emails) {
    const row = queue.locator(".settings-access-row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Одобрить" }).click();
    await expect(row).toHaveCount(0);
  }

  await logoutThroughUi(page);
}

async function openCreateSubmission(page: Page) {
  await clickWorkspaceButton(page, /Мои подачи/);
  const createButton = page.getByRole("button", {
    name: /^(Создать пакет|Новая подача)$/,
  });
  await expect(createButton.first()).toBeVisible();
  await createButton.first().click();
  await expect(drawer(page).getByRole("heading", { name: /Паспорт/ })).toBeVisible();
}

async function createFamilyAndSubmit(page: Page, family: FamilyDraft) {
  await openCreateSubmission(page);
  await drawer(page).getByRole("button", { name: "Семья" }).click();
  await drawer(page).locator("#create-submission-city").selectOption(family.city);

  for (let index = 2; index < family.applicants.length; index += 1) {
    await drawer(page).getByRole("button", { name: /Добавить заявителя/ }).click();
  }

  await drawer(page)
    .locator(".pi-file-input")
    .setInputFiles(family.applicants.map((name) => e2ePassportFile(name)));
  await expectVisibleText(
    drawer(page),
    family.applicants[0],
    `Uploaded passport applicant ${family.applicants[0]} was not visible.`,
  );
  await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(drawer(page).getByRole("heading", { name: family.title })).toBeVisible();

  await openQuestionnaireTab(page);
  await fillQuestionnaire(page);
  await openMediaTab(page);
  await uploadAllVisibleFiles(page);
  await drawer(page).getByRole("button", { name: "Сохранить черновик" }).click();
  await submitForReviewFromDrawer(page);
  await expectDrawerStatus(page, "На проверке");
  const submittedId = (
    (await drawer(page)
      .getByText(/ПД-\d+|VF-\d+|SUB-\d+/)
      .first()
      .textContent()) ?? ""
  ).trim();
  await closeDrawer(page);
  return submittedId;
}

async function openQuestionnaireTab(page: Page) {
  await openDrawerTab(page, ["Анкета", "Данные"]);
}

async function openMediaTab(page: Page) {
  await openDrawerTab(page, ["Файлы", "Селфи", "Паспорт"]);
  await expect(drawer(page).getByRole("heading", { name: /Файлы подачи|Файлы/ })).toBeVisible();
}

async function fillQuestionnaire(page: Page) {
  const modernQuestionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  const openQuestionnaireButton = drawer(page)
    .getByRole("button", { name: "Открыть анкету" })
    .first();

  if (await isVisible(modernQuestionnaire)) {
    await modernQuestionnaire
      .getByRole("button", { name: /Готово к проверке|Готово/ })
      .click();
    await expect(modernQuestionnaire).toHaveCount(0);
    return;
  }

  if (await isVisible(openQuestionnaireButton)) {
    await openQuestionnaireButton.click();
    await expect(modernQuestionnaire).toBeVisible();
    await modernQuestionnaire
      .getByRole("button", { name: /Готово к проверке|Готово/ })
      .click();
    await expect(modernQuestionnaire).toHaveCount(0);
    return;
  }

  const sectionButtons = drawer(page).locator(".questionnaire-section-heading");
  await expect(sectionButtons.first()).toBeVisible();
  const sectionCount = await sectionButtons.count();

  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const sectionButton = sectionButtons.nth(sectionIndex);
    await sectionButton.scrollIntoViewIfNeeded();
    if ((await sectionButton.getAttribute("aria-expanded")) !== "true") {
      await sectionButton.click();
    }

    const fields = drawer(page).locator(
      ".questionnaire-fields:not([hidden]) .questionnaire-field input:not([disabled])",
    );
    const count = await fields.count();
    for (let index = 0; index < count; index += 1) {
      const input = fields.nth(index);
      const label = (await input.getAttribute("aria-label")) ?? "";
      await input.fill(questionnaireValue(label, sectionIndex + index));
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

async function submitForReviewFromDrawer(page: Page) {
  await drawer(page).getByRole("button", { name: "Отправить", exact: true }).click();
  const verifyPassportButton = page.getByRole("button", {
    name: "Проверил, отправить",
  });
  if (await isVisible(verifyPassportButton)) {
    await verifyPassportButton.focus();
    await page.keyboard.press("Enter");
  }
}

async function closeDrawer(page: Page) {
  const closeButton = drawer(page).getByRole("button", {
    name: /Закрыть (подачу|проверку)/,
  });
  if (await isVisible(closeButton.first())) {
    await closeButton.first().click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(drawer(page)).toHaveCount(0);
}

async function openAdminSubmission(page: Page, cardText: string, drawerTitle: string) {
  await clickWorkspaceButton(page, /Проверка|Работа/);
  const actionButton = page
    .getByRole("button", { name: new RegExp(escapeRegex(cardText)) })
    .first();
  const targetCard = page
    .locator(`[data-submission-id="${cardText}"]`)
    .first()
    .or(actionButton)
    .or(submissionCard(page, cardText))
    .or(submissionCard(page, drawerTitle))
    .first();
  await expect(targetCard).toBeVisible();
  await targetCard.click();
  await expect(
    drawer(page)
      .getByRole("heading", { name: drawerTitle })
      .or(drawer(page).getByText(drawerTitle).first())
      .first(),
  ).toBeVisible();
}

async function returnWithIssue(page: Page, submissionId: string, drawerTitle: string) {
  await page.getByRole("tab", { name: /К проверке|На проверке/ }).click();
  await openAdminSubmission(page, submissionId, drawerTitle);
  await openDrawerTab(page, ["Паспорт"]);
  await drawer(page)
    .getByRole("button", { name: "Создать замечание: Номер паспорта" })
    .click();
  await page
    .getByPlaceholder("Что именно не так...")
    .fill("Нужно уточнить номер паспорта для семейной подачи.");
  await page
    .getByPlaceholder("Конкретное действие для агента")
    .fill("Откройте поле номера паспорта, исправьте значение и подтвердите исправление.");
  await expect(
    drawer(page).getByText(/Переход агента[\s\S]*Паспорт \/ Номер паспорта/),
  ).toBeVisible();
  await drawer(page)
    .getByRole("button", { name: "Создать замечание", exact: true })
    .click();
  await expect(drawer(page).getByText("Нужно уточнить номер паспорта")).toBeVisible();
  await expect(drawer(page).getByText(/Анкета \/ Номер паспорта/)).toBeVisible();
  await drawer(page).getByRole("button", { name: "Вернуть", exact: true }).click();
  await expectDrawerStatus(page, "Возвращено");
  await closeDrawer(page);
}

async function fixReturnedSubmission(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Мои подачи/);
  const targetCard = page
    .locator(`[data-submission-id="${submissionId}"]`)
    .first()
    .or(submissionCard(page, submissionId))
    .first();
  await expect(targetCard).toBeVisible();
  await targetCard.click();
  await openDrawerTab(page, ["Замечания"]);
  await expect(drawer(page).getByText(/Номер паспорта/).first()).toBeVisible();
  await drawer(page).getByRole("button", { name: "Исправить" }).click();
  await expect(page.getByRole("heading", { name: /Анкета:/ })).toBeVisible();
  await expect(
    page.locator('[aria-selected="true"]').filter({ hasText: "Паспорт" }).first(),
  ).toBeVisible();
  const passportNumberField = page.getByLabel("Номер паспорта").first();
  await expect(passportNumberField).toBeVisible();
  await expect(page.locator('[data-field-label="Номер паспорта"][data-field-focused="true"]')).toBeVisible();
  await passportNumberField.fill("991234567");
  await expect(passportNumberField).toHaveValue("991234567");
  const completeQuestionnaireButton = page.getByRole("button", {
    name: /Готово к проверке|Готово/,
  });
  await completeQuestionnaireButton.click();
  await expect(drawer(page)).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        ({ submissionId: id }) => {
          const submissions = JSON.parse(
            localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
          ) as Array<{
            applicants?: Array<{
              sections?: Array<{
                fields?: Array<{ id?: string; value?: string }>;
              }>;
            }>;
            id?: string;
          }>;
          const submission = submissions.find((candidate) => candidate.id === id);
          return (
            submission?.applicants
              ?.map(
                (applicant) =>
                  applicant.sections
                    ?.flatMap((section) => section.fields ?? [])
                    .find((field) => field.id === "passport-no")?.value ?? "",
              )
              .join("|") ?? ""
          );
        },
        { submissionId },
      ),
    )
    .toContain("991234567");
  await openDrawerTab(page, ["Замечания"]);
  await markVisibleIssuesFixed(page);
  await expect(drawer(page).getByText("Исправлено").first()).toBeVisible();
  await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
  await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
  await closeDrawer(page);
}

async function acceptSubmission(page: Page, submissionId: string, drawerTitle: string) {
  await openAdminSubmission(page, submissionId, drawerTitle);
  await drawer(page)
    .getByRole("button", { name: /^(Принять|Закрыть и принять)$/ })
    .click();
  await expectDrawerStatus(page, "Готово к выгрузке");
  await closeDrawer(page);
}

async function exportFamilyExcel(page: Page, family: FamilyDraft) {
  await clickWorkspaceButton(page, /Выгрузка/);
  await page.getByRole("tab", { name: "Готово" }).click();
  await clearExportSelection(page);

  const row = page.locator(".export-row").filter({ hasText: family.title });
  await expect(row).toBeVisible();
  await expect(row).toContainText(family.city);
  await row.getByRole("checkbox").check();
  await expect(page.getByRole("heading", { name: /1 подача · \d+ заявител/ })).toBeVisible();
  await page.getByRole("button", { name: "Сформировать Excel" }).click();
  await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();

  mkdirSync(evidenceDir, { recursive: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
  await expect(download.failure()).resolves.toBeNull();
  const savedPath = `${evidenceDir}/${family.fileSlug}.xlsx`;
  await download.saveAs(savedPath);
  await page.getByRole("button", { name: "Отметить выгружено" }).click();
  await page.getByRole("tab", { name: "История" }).click();
  await expect(page.locator(".submission-panel").getByText(family.title)).toBeVisible();
  return savedPath;
}

test.describe("V-19 real UI registration to city Excel export", () => {
  test("registers two agents, creates three city families with corrections, and downloads Excel files", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const browserProblems = collectBrowserProblems(page);
    const suffix = Date.now();
    const agents: AgentAccount[] = [
      {
        city: "Санкт-Петербург",
        company: "North Visa",
        email: `real-ui-agent-1-${suffix}@example.com`,
        fullName: "Мария Орлова",
        phone: "+7 900 100-00-01",
      },
      {
        city: "Казань",
        company: "Volga Travel",
        email: `real-ui-agent-2-${suffix}@example.com`,
        fullName: "Алексей Морозов",
        phone: "+7 900 100-00-02",
      },
    ];
    const families: FamilyDraft[] = [
      {
        applicants: ["Сергеева Анна", "Сергеев Иван", "Сергеева Маша", "Сергеев Лев"],
        city: "Москва",
        fileSlug: "moscow-sergeevy",
        ownerEmail: agents[0].email,
        title: "Семья Сергеевых",
      },
      {
        applicants: ["Кузнецова Ирина", "Кузнецов Олег", "Кузнецова Ника"],
        city: "Санкт-Петербург",
        fileSlug: "spb-kuzneczovy",
        ownerEmail: agents[1].email,
        title: "Семья Кузнецовых",
      },
      {
        applicants: ["Романова Елена", "Романов Павел", "Романов Артём"],
        city: "Казань",
        fileSlug: "kazan-romanovy",
        ownerEmail: agents[0].email,
        title: "Семья Романовых",
      },
    ];
    const submissionIds = new Map<string, string>();

    await startFresh(page, agents[0].email);
    for (const agent of agents) {
      await submitAccessRequest(page, agent);
      await logoutThroughUi(page);
    }

    await approveAccessRequests(
      page,
      agents.map((agent) => agent.email),
    );

    for (const family of families) {
      await login(page, family.ownerEmail);
      const submittedId = await createFamilyAndSubmit(page, family);
      submissionIds.set(family.title, submittedId);
      await logoutThroughUi(page);
    }

    await login(page, "admin@visaflow.local", "local-dev-password");
    await returnWithIssue(page, submissionIds.get(families[0].title) ?? "", families[0].title);
    await logoutThroughUi(page);

    await login(page, families[0].ownerEmail);
    await fixReturnedSubmission(page, submissionIds.get(families[0].title) ?? "");
    await logoutThroughUi(page);

    await login(page, "admin@visaflow.local", "local-dev-password");
    await acceptSubmission(
      page,
      submissionIds.get(families[0].title) ?? "",
      families[0].title,
    );
    for (const family of families.slice(1)) {
      await acceptSubmission(page, submissionIds.get(family.title) ?? "", family.title);
    }

    const savedFiles = [];
    for (const family of families) {
      savedFiles.push(await exportFamilyExcel(page, family));
    }

    expect(savedFiles).toHaveLength(3);
    expect(families.reduce((total, family) => total + family.applicants.length, 0)).toBe(10);
    expect(browserProblems).toEqual([]);
  });
});
