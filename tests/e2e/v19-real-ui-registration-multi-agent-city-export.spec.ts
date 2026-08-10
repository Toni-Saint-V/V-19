import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { testArtifactPath } from "../support/artifacts";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  e2ePassportFile,
  expectDrawerStatus,
  isVisible,
  markVisibleIssuesFixed,
  openDrawerTab,
  submissionCard,
} from "./v19-pilot-helpers";

type City = "Москва" | "Санкт-Петербург" | "Казань";

const accessPassword = "secure-local-password";
const evidenceDir = testArtifactPath("real-ui-goal-20260630");

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

async function ensureLoginScreen(page: Page) {
  const loginHeading = page.getByRole("heading", { level: 1, name: "Вход" });
  const registrationHeading = page.getByRole("heading", {
    level: 1,
    name: "Заявка на доступ",
  });
  await expect(loginHeading.or(registrationHeading)).toBeVisible();
  if (await registrationHeading.isVisible()) {
    await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();
  }
  await expect(loginHeading).toBeVisible();
}

async function startFresh(page: Page, workspaceEmail: string) {
  await page.goto("/");
  await page.evaluate((email) => {
    localStorage.clear();
    localStorage.setItem("visaflow.workspaceEmail.v2", email);
  }, workspaceEmail);
  await page.reload();
  await ensureLoginScreen(page);
}

async function submitAccessRequest(page: Page, account: AgentAccount) {
  await page.getByRole("button", { name: "Запросить доступ" }).click();
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
  await page.getByRole("button", { name: /Войти/ }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Мои действия|Мои подачи|Очередь на проверку|Проверка|Выгрузка|Настройки)$/,
    }),
  ).toBeVisible();
}

async function logoutThroughUi(page: Page) {
  const statusLogout = page.getByRole("button", { name: "Выйти" }).first();
  if (await isVisible(statusLogout)) {
    await statusLogout.click();
    await ensureLoginScreen(page);
    return;
  }

  const workspaceLogout = page
    .getByRole("button", { name: "Выйти из рабочей области" })
    .first();
  if (await isVisible(workspaceLogout)) {
    await workspaceLogout.click();
    await ensureLoginScreen(page);
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
  await login(page, "2@2.ru", "22");
  await clickWorkspaceButton(page, /Пользователи/);
  const queue = page.getByRole("region", { name: "Заявки и роли" });
  await expect(queue).toBeVisible();

  for (const email of emails) {
    const row = queue.locator(".v19-access-row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Одобрить" }).click();
    await expect(row).toHaveCount(0);
  }

  await logoutThroughUi(page);
}

async function openCreateSubmission(page: Page): Promise<Locator> {
  await clickWorkspaceButton(page, /Мои подачи/);
  const createButton = page.getByRole("button", {
    name: /^(Создать пакет|Новая подача)$/,
  });
  await expect(createButton.first()).toBeVisible();
  await createButton.first().click();
  const workspace = page.locator('[data-agent-screen="create"]');
  await expect(workspace).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Новая подача" }),
  ).toBeVisible();
  return workspace;
}

async function openMySubmissions(page: Page) {
  await clickWorkspaceButton(page, /Мои подачи/);
  await expect(page.locator('[data-agent-screen="submissions"]')).toBeVisible();
  await page.getByRole("button", { name: /^Тип подачи:/ }).click();
  await page.getByRole("option", { name: "Все" }).click();
}

async function createFamilyAndSubmit(page: Page, family: FamilyDraft) {
  const workspace = await openCreateSubmission(page);
  await workspace.getByRole("radio", { name: "Семья" }).click();
  await workspace.getByLabel("Город подачи").click();
  await page.getByRole("option", { exact: true, name: family.city }).click();

  for (let index = 2; index < family.applicants.length; index += 1) {
    await workspace
      .getByRole("button", { name: /Добавить (следующего )?заявителя/ })
      .click();
  }

  await workspace
    .locator('input[type="file"]')
    .setInputFiles(family.applicants.map((name) => e2ePassportFile(name)));
  const assignment = page.getByRole("dialog", { name: "Назначьте паспорта" });
  await expect(assignment).toBeVisible();
  const ownerSelectors = assignment.getByRole("combobox", {
    name: /Заявитель для/,
  });
  await expect(ownerSelectors).toHaveCount(family.applicants.length);
  for (let index = 0; index < family.applicants.length; index += 1) {
    await ownerSelectors.nth(index).selectOption(String(index));
  }
  await assignment.getByRole("button", { name: "Распознать паспорта" }).click();
  await expect(assignment).toBeHidden();

  const createButton = workspace.getByRole("button", {
    name: "Создать и открыть анкету",
  });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  return saveQuestionnaireDraftAndReadId(page);
}

async function createSingleDraft(page: Page, city: City) {
  const workspace = await openCreateSubmission(page);
  const singleType = workspace.getByRole("radio", { name: "Заявитель" });
  await singleType.click();
  await expect(singleType).toHaveAttribute("aria-checked", "true");
  await workspace.getByLabel("Город подачи").click();
  await page.getByRole("option", { exact: true, name: city }).click();

  const continueButton = workspace.getByRole("button", {
    name: "Продолжить без паспорта",
  });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  return saveQuestionnaireDraftAndReadId(page);
}

function agentSubmissionCard(page: Page, submissionId: string) {
  return page.locator(`[data-submission-id="${submissionId}"]:visible`).first();
}

async function saveQuestionnaireDraftAndReadId(page: Page) {
  const questionnaire = page.locator(".v19-questionnaire-screen-shell");
  await expect(questionnaire).toBeVisible();
  const submissionId = await questionnaire.getAttribute("data-submission-id");
  expect(submissionId).toBeTruthy();
  if (!submissionId) throw new Error("Created submission id is unavailable");

  await questionnaire.getByRole("button", { name: "Сохранить и выйти" }).click();
  await expect(questionnaire).toHaveCount(0);
  await openMySubmissions(page);
  await expect(agentSubmissionCard(page, submissionId)).toBeVisible();

  return submissionId;
}

export async function openQuestionnaireTab(page: Page) {
  await openDrawerTab(page, ["Анкета", "Данные"]);
}

export async function openMediaTab(page: Page) {
  const filesTab = drawer(page)
    .locator('.v19-figma-drawer-tab, [data-drawer-tab="files"]')
    .filter({ hasText: "Файлы" })
    .first();
  await expect(filesTab).toBeVisible();
  await filesTab.click();
  await expect(
    drawer(page).getByRole("heading", { name: /Файлы подачи|Файлы/ }),
  ).toBeVisible();
}

export async function fillQuestionnaire(page: Page) {
  const modernQuestionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  const openQuestionnaireButton = drawer(page)
    .getByRole("button", { name: "Открыть анкету" })
    .first();

  if (await isVisible(modernQuestionnaire)) {
    await modernQuestionnaire
      .getByRole("button", { name: /Отправить на проверку|Отправить/ })
      .click();
    await expect(modernQuestionnaire).toHaveCount(0);
    return;
  }

  if (await isVisible(openQuestionnaireButton)) {
    await openQuestionnaireButton.click();
    await expect(modernQuestionnaire).toBeVisible();
    await modernQuestionnaire
      .getByRole("button", { name: /Отправить на проверку|Отправить/ })
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

export async function submitForReviewFromDrawer(page: Page) {
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

export async function returnWithIssue(
  page: Page,
  submissionId: string,
  drawerTitle: string,
) {
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
    .fill(
      "Откройте поле номера паспорта, исправьте значение и подтвердите исправление.",
    );
  await expect(
    drawer(page).getByText(/Переход агента[\s\S]*Паспорт \/ Номер паспорта/),
  ).toBeVisible();
  await drawer(page)
    .getByLabel("Новое замечание")
    .getByRole("button", { name: "Создать замечание", exact: true })
    .click();
  await expect(drawer(page).getByText("Нужно уточнить номер паспорта")).toBeVisible();
  await expect(drawer(page).getByText(/Анкета \/ Номер паспорта/)).toBeVisible();
  await drawer(page)
    .getByRole("button", { name: "Отправить на исправление", exact: true })
    .click();
  await expectDrawerStatus(page, "Возвращено");
  await closeDrawer(page);
}

export async function fixReturnedSubmission(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Мои подачи/);
  const targetCard = page
    .locator(`[data-submission-id="${submissionId}"]`)
    .first()
    .or(submissionCard(page, submissionId))
    .first();
  await expect(targetCard).toBeVisible();
  await targetCard.click();
  const questionnaireHeading = page.getByRole("heading", { name: /Анкета:/ });
  if (!(await isVisible(questionnaireHeading))) {
    const contextIssue = page.getByRole("button", { name: /Номер паспорта/ }).first();
    if (await isVisible(contextIssue)) {
      await contextIssue.click();
    } else {
      await openDrawerTab(page, ["Замечания"]);
      await expect(
        drawer(page)
          .getByText(/Номер паспорта/)
          .first(),
      ).toBeVisible();
      await drawer(page).getByRole("button", { name: "Исправить" }).click();
    }
  }
  await expect(questionnaireHeading).toBeVisible();
  await expect(
    page.locator('[aria-selected="true"]').filter({ hasText: "Паспорт" }).first(),
  ).toBeVisible();
  const passportNumberField = page
    .getByRole("textbox", { name: "Номер паспорта" })
    .first();
  await expect(passportNumberField).toBeVisible();
  await expect(
    page.locator('[data-field-label="Номер паспорта"][data-field-focused="true"]'),
  ).toBeVisible();
  await passportNumberField.fill("991234567");
  await expect(passportNumberField).toHaveValue("991234567");
  const completeQuestionnaireButton = page.getByRole("button", {
    name: /Отправить на проверку|Отправить/,
  });
  await completeQuestionnaireButton.click();
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
  if (!(await isVisible(drawer(page)))) {
    const backButton = page.getByRole("button", { name: "Назад" }).first();
    if (await isVisible(backButton)) {
      await backButton.click();
    }
    const openSubmissionButton = page
      .getByRole("button", { name: "Открыть подачу" })
      .first();
    if (await isVisible(openSubmissionButton)) {
      await openSubmissionButton.click();
    } else {
      await clickWorkspaceButton(page, /Мои подачи/);
      await targetCard.click();
    }
  }
  await expect(drawer(page)).toBeVisible();
  await openDrawerTab(page, ["Замечания"]);
  await markVisibleIssuesFixed(page);
  await expect(drawer(page).getByText("Исправлено").first()).toBeVisible();
  await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
  await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
  await closeDrawer(page);
}

export async function acceptSubmission(
  page: Page,
  submissionId: string,
  drawerTitle: string,
) {
  await openAdminSubmission(page, submissionId, drawerTitle);
  await drawer(page)
    .getByRole("button", { name: "Принять на выгрузку", exact: true })
    .click();
  await expectDrawerStatus(page, "Готово к выгрузке");
  await closeDrawer(page);
}

export async function exportFamilyExcel(page: Page, family: FamilyDraft) {
  await clickWorkspaceButton(page, /Выгрузка/);
  await page.getByRole("tab", { name: "Готово" }).click();
  await clearExportSelection(page);

  const row = page.locator(".export-row").filter({ hasText: family.title });
  await expect(row).toBeVisible();
  await expect(row).toContainText(family.city);
  await row.getByRole("checkbox").check();
  await expect(
    page.getByRole("heading", { name: /1 подача · \d+ заявител/ }),
  ).toBeVisible();
  mkdirSync(evidenceDir, { recursive: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
  await expect(download.failure()).resolves.toBeNull();
  const savedPath = `${evidenceDir}/${family.fileSlug}.xlsx`;
  await download.saveAs(savedPath);
  await expect(page.getByRole("button", { name: "Excel скачан" })).toBeDisabled();
  await expect(
    page.locator(".export-row").filter({ hasText: family.title }),
  ).toBeVisible();
  return savedPath;
}

test.describe("V-19 real UI multi-agent intake", () => {
  test("registers two agents and keeps their single and family drafts isolated", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    page.setDefaultTimeout(20_000);
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
        applicants: ["Кузнецова Ирина", "Кузнецов Олег", "Кузнецова Ника"],
        city: "Санкт-Петербург",
        fileSlug: "spb-kuzneczovy",
        ownerEmail: agents[1].email,
        title: "Семья Кузнецовых",
      },
    ];

    await startFresh(page, agents[0].email);
    for (const agent of agents) {
      await submitAccessRequest(page, agent);
      await logoutThroughUi(page);
    }

    await approveAccessRequests(
      page,
      agents.map((agent) => agent.email),
    );

    await login(page, agents[0].email);
    const singleSubmissionId = await createSingleDraft(page, "Москва");
    await logoutThroughUi(page);

    await login(page, agents[0].email);
    await openMySubmissions(page);
    await expect(agentSubmissionCard(page, singleSubmissionId)).toBeVisible();
    await logoutThroughUi(page);

    await login(page, families[0].ownerEmail);
    const familySubmissionId = await createFamilyAndSubmit(page, families[0]);
    await page.reload();
    await openMySubmissions(page);
    await expect(agentSubmissionCard(page, familySubmissionId)).toBeVisible();
    await logoutThroughUi(page);

    await login(page, agents[0].email);
    await openMySubmissions(page);
    await expect(agentSubmissionCard(page, singleSubmissionId)).toBeVisible();
    await expect(agentSubmissionCard(page, familySubmissionId)).toHaveCount(0);
    await logoutThroughUi(page);

    await login(page, agents[1].email);
    await openMySubmissions(page);
    await expect(agentSubmissionCard(page, familySubmissionId)).toBeVisible();
    await expect(agentSubmissionCard(page, singleSubmissionId)).toHaveCount(0);

    expect(singleSubmissionId).not.toBe(familySubmissionId);
    expect(browserProblems).toEqual([]);
  });
});
