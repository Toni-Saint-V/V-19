import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  EXPECTED_EXPORT_CONTRACT_HEADERS,
  EXPORT_WORKBOOK_COLUMN_COUNT,
} from "../../src/lib/export/exportContractCore";
import {
  EXPORT_WORKBOOK_CONTENT_TYPE,
  parseExportWorkbookBlob,
} from "../../src/lib/export/exportWorkbookCore";
import { testArtifactPath } from "../support/artifacts";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  e2ePassportFile,
  expectDrawerStatus,
  fillRequiredQuestionnaireAndExit,
  isVisible,
  openDrawerTab,
  uploadAllAgentDrawerChecklistFiles,
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
  correctedPassport?: string;
  fileSlug: string;
  listTitle?: string;
  ownerEmail: string;
  title: string;
  type?: "family" | "single";
};

type WorkbookProof = {
  dataRowCount: number;
  passports: string[];
  savedPath: string;
};

type ExpectedWorkbookApplicant = {
  email: string;
  firstName: string;
  mobile: string;
  passport: string;
  surname: string;
};

function expectedWorkbookApplicant(name: string) {
  const [surname = "", ...firstNameParts] = name.trim().split(/\s+/);
  return { firstName: firstNameParts.join(" "), surname };
}

function expectedDrawerApplicant(name: string) {
  const { firstName, surname } = expectedWorkbookApplicant(name);
  return [firstName, surname].filter(Boolean).join(" ");
}

async function readExpectedWorkbookApplicants(
  page: Page,
  submissionId: string,
  family: FamilyDraft,
): Promise<ExpectedWorkbookApplicant[]> {
  const applicants = await page.evaluate((id) => {
    const submissions = JSON.parse(
      localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
    ) as Array<{
      applicants?: Array<{
        sections?: Array<{ fields?: Array<{ id?: string; value?: string }> }>;
      }>;
      id?: string;
    }>;
    const submission = submissions.find((candidate) => candidate.id === id);
    return (submission?.applicants ?? []).map((applicant) => {
      const fields =
        applicant.sections?.flatMap((section) => section.fields ?? []) ?? [];
      const field = (fieldId: string) =>
        fields.find((candidate) => candidate.id === fieldId)?.value?.trim() ?? "";
      const mobileDigits = field("contact-number").replace(/\D+/g, "");
      return {
        email: field("email"),
        firstName: field("first-name"),
        mobile:
          mobileDigits.length === 11 && /^[78]/.test(mobileDigits)
            ? mobileDigits.slice(1)
            : mobileDigits,
        passport: field("passport-no")
          .normalize("NFKC")
          .toLocaleUpperCase("en-US")
          .replace(/[^\p{L}\p{N}]+/gu, ""),
        surname: field("surname"),
      };
    });
  }, submissionId);

  expect(applicants).toHaveLength(family.applicants.length);
  expect(applicants.map(({ firstName, surname }) => ({ firstName, surname }))).toEqual(
    family.applicants.map(expectedWorkbookApplicant),
  );
  return applicants;
}

const exportLocationByCity: Record<City, string> = {
  Москва: "MOW",
  "Санкт-Петербург": "SPB",
  Казань: "KZN",
};

function workbookColumn(headers: string[], header: string) {
  const index = headers.indexOf(header);
  expect(index, `Missing workbook column: ${header}`).toBeGreaterThanOrEqual(0);
  return index;
}

async function inspectFamilyWorkbook(
  savedPath: string,
  family: FamilyDraft,
  expectedApplicants: ExpectedWorkbookApplicant[],
): Promise<WorkbookProof> {
  const bytes = await readFile(savedPath);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const workbook = await parseExportWorkbookBlob(
    new Blob([arrayBuffer], { type: EXPORT_WORKBOOK_CONTENT_TYPE }),
  );
  const headers = workbook.rows[0] ?? [];
  const rows = workbook.rows.slice(1);

  expect(workbook.sheetName).toBe("Sheet1");
  expect(workbook.dimension).toBe(`A1:BD${family.applicants.length + 1}`);
  expect(headers).toEqual(EXPECTED_EXPORT_CONTRACT_HEADERS);
  expect(headers).toHaveLength(EXPORT_WORKBOOK_COLUMN_COUNT);
  expect(rows).toHaveLength(family.applicants.length);
  expect(rows.every((row) => row.length === EXPORT_WORKBOOK_COLUMN_COUNT)).toBe(true);

  const locationColumn = workbookColumn(headers, "Location");
  const passportColumn = workbookColumn(headers, "Passport No");
  const surnameColumn = workbookColumn(headers, "Surname (Family Name)");
  const firstNameColumn = workbookColumn(headers, "FirstName");
  const appointmentTypeColumn = workbookColumn(
    headers,
    "Appointment Type(For Family, applicant email and contact number should be same for all family members)",
  );
  const emailColumn = workbookColumn(headers, "Applicant Email");
  const mobileColumn = workbookColumn(
    headers,
    "Applicant Mobile(10 Digit, No space or -,leading zero)",
  );
  const passports = rows.map((row) => row[passportColumn] ?? "");

  expect(
    rows.every((row) => row[locationColumn] === exportLocationByCity[family.city]),
  ).toBe(true);
  expect(
    rows.every(
      (row) =>
        row[appointmentTypeColumn] ===
        (family.type === "single" ? "Individual" : "Family"),
    ),
  ).toBe(true);
  expect(rows.every((row) => Boolean(row[firstNameColumn] && row[surnameColumn]))).toBe(
    true,
  );
  expect(passports.every((passport) => /^\d{9}$/.test(passport))).toBe(true);
  expect(new Set(passports).size).toBe(family.applicants.length);
  expect(
    rows.map((row) => ({
      email: row[emailColumn] ?? "",
      firstName: row[firstNameColumn] ?? "",
      mobile: row[mobileColumn] ?? "",
      passport: row[passportColumn] ?? "",
      surname: row[surnameColumn] ?? "",
    })),
  ).toEqual(expectedApplicants);
  if (family.type !== "single") {
    expect(new Set(rows.map((row) => row[emailColumn] ?? "")).size).toBe(1);
    expect(new Set(rows.map((row) => row[mobileColumn] ?? "")).size).toBe(1);
  }
  if (family.correctedPassport) expect(passports).toContain(family.correctedPassport);

  return { dataRowCount: rows.length, passports, savedPath };
}

async function writeSubmissionStateEvidence(
  page: Page,
  submissionId: string,
  fileName: string,
) {
  const submission = await page.evaluate((id) => {
    const submissions = JSON.parse(
      localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
    ) as Array<Record<string, unknown> & { id?: string }>;
    return submissions.find((candidate) => candidate.id === id) ?? null;
  }, submissionId);
  mkdirSync(evidenceDir, { recursive: true });
  await writeFile(
    `${evidenceDir}/${fileName}`,
    `${JSON.stringify(submission, null, 2)}\n`,
    "utf8",
  );
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
  const statusLogout = page.getByRole("button", { exact: true, name: "Выйти" });
  for (let index = 0; index < (await statusLogout.count()); index += 1) {
    if (await isVisible(statusLogout.nth(index))) {
      await statusLogout.nth(index).click();
      await ensureLoginScreen(page);
      return;
    }
  }

  const workspaceLogout = page.getByRole("button", {
    name: "Выйти из рабочей области",
  });
  for (let index = 0; index < (await workspaceLogout.count()); index += 1) {
    if (await isVisible(workspaceLogout.nth(index))) {
      await workspaceLogout.nth(index).click();
      await ensureLoginScreen(page);
      return;
    }
  }

  await clickWorkspaceButton(page, /Настройки/);
  const profileButton = page.getByRole("button", { name: "Профиль" }).first();
  if (await isVisible(profileButton)) {
    await profileButton.click();
  }
  const settingsLogout = page.getByRole("button", {
    name: /^(Сбросить почту|Выйти)$/,
  });
  for (let index = 0; index < (await settingsLogout.count()); index += 1) {
    if (await isVisible(settingsLogout.nth(index))) {
      await settingsLogout.nth(index).click();
      await ensureLoginScreen(page);
      return;
    }
  }
  throw new Error("No visible logout control was available.");
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
  const headerCreateButton = page.locator("button.v19-action-surface-create:visible");
  if (await isVisible(headerCreateButton)) {
    await headerCreateButton.click();
  } else {
    const createButton = page.getByRole("button", {
      name: /^(Создать пакет|Новая подача)$/,
    });
    let opened = false;
    for (let index = 0; index < (await createButton.count()); index += 1) {
      if (await isVisible(createButton.nth(index))) {
        await createButton.nth(index).click();
        opened = true;
        break;
      }
    }
    if (!opened) throw new Error("No visible create-submission control was available.");
  }
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

async function createFamilyQuestionnaire(page: Page, family: FamilyDraft) {
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
  const questionnaire = page.locator(".v19-questionnaire-screen-shell");
  await expect(questionnaire).toBeVisible();
  return questionnaire;
}

async function createFamilyAndSubmit(page: Page, family: FamilyDraft) {
  await createFamilyQuestionnaire(page, family);
  const submissionId = await saveQuestionnaireDraftAndReadId(page);
  await agentSubmissionCard(page, submissionId).click();
  await expect(drawer(page)).toBeVisible();
  await openQuestionnaireTab(page);
  await fillQuestionnaire(page, family.applicants);
  await uploadAllAgentDrawerChecklistFiles(page);
  const primaryAction = drawer(page).getByTestId("drawer-primary-action");
  await expect(primaryAction).toHaveText("Начать работу");
  await primaryAction.click();
  await expect(primaryAction).toHaveText("Отправить на проверку");
  await primaryAction.click();
  const verifyPassportButton = page.getByRole("button", {
    name: "Проверил, отправить",
  });
  if (await isVisible(verifyPassportButton)) await verifyPassportButton.click();
  await expectDrawerStatus(page, "На проверке");
  await closeDrawer(page);

  return submissionId;
}

async function completeDraftAndSubmit(
  page: Page,
  submissionId: string,
  expectedApplicantNames?: readonly string[],
) {
  await agentSubmissionCard(page, submissionId).click();
  await expect(drawer(page)).toBeVisible();
  await openQuestionnaireTab(page);
  await fillQuestionnaire(page, expectedApplicantNames);
  await uploadAllAgentDrawerChecklistFiles(page);
  const primaryAction = drawer(page).getByTestId("drawer-primary-action");
  await expect(primaryAction).toHaveText("Начать работу");
  await primaryAction.click();
  await expect(primaryAction).toHaveText("Отправить на проверку");
  await primaryAction.click();
  const verifyPassportButton = page.getByRole("button", {
    name: "Проверил, отправить",
  });
  if (await isVisible(verifyPassportButton)) await verifyPassportButton.click();
  await expectDrawerStatus(page, "На проверке");
  await closeDrawer(page);
}

async function createSingleAndSubmit(
  page: Page,
  city: City,
  expectedApplicantNames: readonly string[],
) {
  const submissionId = await createSingleDraft(page, city);
  await completeDraftAndSubmit(page, submissionId, expectedApplicantNames);
  return submissionId;
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

  await questionnaire.getByRole("button", { name: "Сохранить и продолжить" }).click();
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

export async function fillQuestionnaire(
  page: Page,
  expectedApplicantNames?: readonly string[],
) {
  const modernQuestionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  const openQuestionnaireButton = drawer(page)
    .getByRole("button", { name: "Открыть анкету" })
    .first();

  if (await isVisible(modernQuestionnaire)) {
    const submissionId = await fillRequiredQuestionnaireAndExit(
      page,
      `real-ui-${Date.now()}`,
      expectedApplicantNames,
    );
    await agentSubmissionCard(page, submissionId).click();
    await expect(drawer(page)).toBeVisible();
    return;
  }

  if (await isVisible(openQuestionnaireButton)) {
    const submissionId = await fillRequiredQuestionnaireAndExit(
      page,
      `real-ui-${Date.now()}`,
      expectedApplicantNames,
    );
    await agentSubmissionCard(page, submissionId).click();
    await expect(drawer(page)).toBeVisible();
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

async function openAdminSubmission(
  page: Page,
  submissionId: string,
  drawerApplicant: string,
  listTitle = drawerApplicant,
) {
  await clickWorkspaceButton(page, /Проверка|Работа/);
  const targetCard = page
    .locator(`[data-submission-card][data-submission-id="${submissionId}"]:visible`)
    .first();
  await expect(
    targetCard,
    `Ожидалась карточка администратора «${listTitle}» (${submissionId}).`,
  ).toBeVisible();
  await expect(targetCard).toContainText(listTitle);
  await targetCard.click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText(submissionId);
  await expect(drawer(page)).toContainText(drawerApplicant);
}

export async function returnWithIssue(
  page: Page,
  submissionId: string,
  drawerApplicant: string,
  listTitle?: string,
) {
  await openAdminSubmission(page, submissionId, drawerApplicant, listTitle);
  const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
  await expect(reviewWorkspace).toBeVisible();
  await reviewWorkspace
    .getByRole("button", { name: "Добавить замечание: Номер паспорта" })
    .click();
  const remarkDialog = page.getByRole("dialog", { name: "Добавить замечание" });
  await expect(remarkDialog).toBeVisible();
  await remarkDialog
    .getByLabel("Текст для клиента")
    .fill(
      "Нужно уточнить номер паспорта: откройте поле, исправьте значение и подтвердите исправление.",
    );
  await expect(remarkDialog).toContainText("Номер паспорта");
  await remarkDialog.getByRole("button", { name: "Отправить замечание" }).click();
  await expect(remarkDialog).toHaveCount(0);
  await expect(reviewWorkspace).toBeVisible();
  await reviewWorkspace
    .getByRole("button", { name: "Отправить на исправление" })
    .click();
  await expect(reviewWorkspace).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Очередь на проверку" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const submissions = JSON.parse(
          localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
        ) as Array<{ id?: string; status?: string }>;
        return submissions.find((submission) => submission.id === id)?.status;
      }, submissionId),
    )
    .toBe("returned");
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const submissions = JSON.parse(
          localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
        ) as Array<{ id?: string; status?: string }>;
        return submissions.find((submission) => submission.id === id)?.status;
      }, submissionId),
    )
    .toBe("returned");
}

export async function fixReturnedSubmission(page: Page, submissionId: string) {
  await openMySubmissions(page);
  const targetCard = agentSubmissionCard(page, submissionId);
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
      await drawer(page).getByRole("button", { name: "Исправить в анкете" }).click();
    }
  }
  await expect(questionnaireHeading).toBeVisible();
  await expect(
    page
      .locator('.v19-questionnaire-section-tab[aria-pressed="true"]:visible')
      .filter({ hasText: "Паспорт" })
      .first(),
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
  const confirmField = page
    .locator('[data-field-label="Номер паспорта"]')
    .getByRole("button", { name: /^Подтвердить поле:/ })
    .first();
  if (await isVisible(confirmField)) await confirmField.click();
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  const markFixed = questionnaire.getByRole("button", {
    name: "Пометить исправленным",
  });
  await expect(markFixed).toBeEnabled();
  await markFixed.click();
  await expect(questionnaire.getByTestId("questionnaire-current-issue")).toContainText(
    "ожидает проверки администратора",
  );
  await questionnaire
    .getByRole("button", { name: "Сохранить и продолжить", exact: true })
    .click();
  await expect(questionnaire).toHaveCount(0);
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
  await clickWorkspaceButton(page, /Мои подачи/);
  await agentSubmissionCard(page, submissionId).click();
  await expect(drawer(page)).toBeVisible();
  await openDrawerTab(page, ["Замечания"]);
  await expect(
    drawer(page)
      .getByText(/Исправлено|ждёт проверки/)
      .first(),
  ).toBeVisible();
  const submitCorrections = drawer(page).getByRole("button", {
    name: "Отправить исправления",
  });
  await expect(submitCorrections).toBeEnabled();
  await submitCorrections.click();
  await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const submissions = JSON.parse(
          localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
        ) as Array<{ id?: string; status?: string }>;
        return submissions.find((submission) => submission.id === id)?.status;
      }, submissionId),
    )
    .toBe("corrections_received");
  await closeDrawer(page);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const submissions = JSON.parse(
          localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
        ) as Array<{ id?: string; status?: string }>;
        return submissions.find((submission) => submission.id === id)?.status;
      }, submissionId),
    )
    .toBe("corrections_received");
}

export async function acceptSubmission(
  page: Page,
  submissionId: string,
  drawerApplicant: string,
  listTitle?: string,
) {
  await openAdminSubmission(page, submissionId, drawerApplicant, listTitle);
  const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
  await expect(reviewWorkspace).toBeVisible();
  const applicantSelect = reviewWorkspace.getByRole("combobox", {
    name: "Заявитель для проверки",
  });
  const applicantValues = await page.evaluate((id) => {
    const submissions = JSON.parse(
      localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
    ) as Array<{ applicants?: Array<{ id?: string }>; id?: string }>;
    return (
      submissions
        .find((submission) => submission.id === id)
        ?.applicants?.map((applicant) => applicant.id ?? "")
        .filter(Boolean) ?? []
    );
  }, submissionId);
  expect(applicantValues.length).toBeGreaterThan(0);
  const hasApplicantSelect = (await applicantSelect.count()) > 0;
  const exactMediaHashes = new Set<string>();

  for (const applicantValue of applicantValues) {
    if (hasApplicantSelect) {
      await applicantSelect.selectOption(applicantValue);
      await expect(applicantSelect).toHaveValue(applicantValue);
    }
    const mediaTabs = reviewWorkspace
      .getByRole("tablist", { name: "Выбор файла для проверки" })
      .getByRole("tab");
    for (let index = 0; index < (await mediaTabs.count()); index += 1) {
      const mediaTab = mediaTabs.nth(index);
      const mediaType = await mediaTab.getAttribute("data-review-media");
      if (!mediaType) throw new Error("Review media tab has no canonical media type.");
      await mediaTab.click();
      await expect(mediaTab).toHaveAttribute("aria-selected", "true");
      await expect(
        reviewWorkspace.getByTestId(`protected-media-preview-${mediaType}`),
      ).toHaveClass(/is-ready/, { timeout: 20_000 });
      await expect(mediaTab.locator(".v19-review-media-tab-visited")).toBeVisible({
        timeout: 20_000,
      });
      const previewUrl = await reviewWorkspace
        .getByRole("link", { name: "Скачать файл" })
        .getAttribute("href");
      expect(previewUrl).toMatch(/^blob:/);
      const exactMediaProof = await page.evaluate(
        async ({ applicantId, mediaType, previewUrl, submissionId }) => {
          const submissions = JSON.parse(
            localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
          ) as Array<{
            files?: Array<{
              applicantId?: string;
              localDemoMediaStored?: boolean;
              sizeBytes?: number;
              storagePath?: string;
              type?: string;
            }>;
            id?: string;
          }>;
          const file = submissions
            .find((submission) => submission.id === submissionId)
            ?.files?.find(
              (candidate) =>
                candidate.applicantId === applicantId && candidate.type === mediaType,
            );
          if (!file?.localDemoMediaStored || !file.storagePath || !previewUrl) {
            return null;
          }
          const storagePath = file.storagePath;
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("visaflow-local-demo-media-v1");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          const stored = await new Promise<Blob | null>((resolve, reject) => {
            const transaction = database.transaction("media", "readonly");
            const request = transaction.objectStore("media").get(storagePath);
            request.onerror = () => reject(request.error);
            request.onsuccess = () =>
              resolve(request.result instanceof Blob ? request.result : null);
          }).finally(() => database.close());
          if (!stored) return null;
          const previewResponse = await fetch(previewUrl);
          if (!previewResponse.ok) return null;
          const preview = await previewResponse.blob();
          const digest = async (blob: Blob) =>
            Array.from(
              new Uint8Array(
                await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
              ),
            )
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("");
          return {
            expectedSize: file.sizeBytes,
            previewHash: await digest(preview),
            previewSize: preview.size,
            storedHash: await digest(stored),
            storedSize: stored.size,
          };
        },
        {
          applicantId: applicantValue,
          mediaType,
          previewUrl,
          submissionId,
        },
      );
      expect(exactMediaProof).not.toBeNull();
      expect(exactMediaProof?.previewHash).toBe(exactMediaProof?.storedHash);
      expect(exactMediaProof?.previewSize).toBe(exactMediaProof?.storedSize);
      expect(exactMediaProof?.storedSize).toBe(exactMediaProof?.expectedSize);
      exactMediaHashes.add(exactMediaProof?.storedHash ?? "");
    }
    const confirmSection = reviewWorkspace.locator("#passport-review-confirm-button");
    await expect(confirmSection).toHaveAttribute(
      "aria-label",
      "Подтвердить паспортную секцию",
      { timeout: 20_000 },
    );
    await confirmSection.click();
    await expect(confirmSection).toContainText("Секция подтверждена");
    await expect
      .poll(() =>
        page.evaluate(
          ({ applicantId, submissionId }) => {
            const submissions = JSON.parse(
              localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
            ) as Array<{
              applicants?: Array<{
                id?: string;
                passportExtraction?: { verifiedAtIso?: string };
              }>;
              files?: Array<{
                applicantId?: string;
                reviewStatus?: string;
                status?: string;
                type?: string;
              }>;
              id?: string;
            }>;
            const submission = submissions.find(
              (candidate) => candidate.id === submissionId,
            );
            const applicant = submission?.applicants?.find(
              (candidate) => candidate.id === applicantId,
            );
            const passport = submission?.files?.find(
              (file) =>
                file.applicantId === applicantId && file.type === "passport_scan",
            );
            return {
              passportReviewStatus: passport?.reviewStatus,
              passportStatus: passport?.status,
              verified: Boolean(applicant?.passportExtraction?.verifiedAtIso),
            };
          },
          { applicantId: applicantValue, submissionId },
        ),
      )
      .toEqual({
        passportReviewStatus: "accepted",
        passportStatus: "accepted",
        verified: true,
      });
  }

  expect(exactMediaHashes.size).toBe(
    applicantValues.length + (applicantValues.length > 0 ? 2 : 0),
  );

  const acceptButton = reviewWorkspace.locator(".v19-review-accept");
  await expect(acceptButton).toBeEnabled();
  await acceptButton.click();
  await expect(reviewWorkspace).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const submissions = JSON.parse(
          localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
        ) as Array<{ id?: string; status?: string }>;
        return submissions.find((submission) => submission.id === id)?.status;
      }, submissionId),
    )
    .toBe("ready_for_export");
}

export async function exportFamilyExcel(
  page: Page,
  submissionId: string,
  family: FamilyDraft,
) {
  await clickWorkspaceButton(page, /Выгрузка/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
  ).toBeVisible();
  await clearExportSelection(page);

  const row = page.getByTestId(`admin-export-row-${submissionId}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(family.city);
  await row.getByRole("checkbox").check();
  const controlRail = page.getByRole("complementary", { name: "Контроль пакета" });
  await expect(controlRail).toContainText(/1 пакет/);
  await expect(
    controlRail.getByText("Заявители", { exact: true }).locator(".."),
  ).toContainText(String(family.applicants.length));
  const expectedApplicants = await readExpectedWorkbookApplicants(
    page,
    submissionId,
    family,
  );
  mkdirSync(evidenceDir, { recursive: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
  await expect(download.failure()).resolves.toBeNull();
  const savedPath = `${evidenceDir}/${family.fileSlug}.xlsx`;
  await download.saveAs(savedPath);
  const acknowledgeWorkbook = page.getByRole("button", {
    name: "Excel сохранён — зафиксировать",
  });
  await expect(acknowledgeWorkbook).toBeEnabled();
  await acknowledgeWorkbook.click();
  await expect(page.getByRole("button", { name: "Завершить выгрузку" })).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const submissions = JSON.parse(
          localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
        ) as Array<{
          exportPackage?: { rowCount?: number; submissionIds?: string[] };
          exportState?: string;
          id?: string;
          status?: string;
        }>;
        const submission = submissions.find((candidate) => candidate.id === id);
        return submission
          ? {
              exportState: submission.exportState,
              rowCount: submission.exportPackage?.rowCount,
              status: submission.status,
              submissionIds: submission.exportPackage?.submissionIds,
            }
          : null;
      }, submissionId),
    )
    .toEqual({
      exportState: "file_downloaded",
      rowCount: family.applicants.length,
      status: "ready_for_export",
      submissionIds: [submissionId],
    });
  const proof = await inspectFamilyWorkbook(savedPath, family, expectedApplicants);

  await page.reload();
  await clickWorkspaceButton(page, /Выгрузка/);
  await clearExportSelection(page);
  const reloadedRow = page.getByTestId(`admin-export-row-${submissionId}`);
  await expect(reloadedRow).toBeVisible();
  await reloadedRow.getByRole("checkbox").check();
  const completeWorkbook = page.getByRole("button", { name: "Завершить выгрузку" });
  await expect(completeWorkbook).toBeEnabled();
  await completeWorkbook.click();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const submissions = JSON.parse(
          localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
        ) as Array<{ exportState?: string; id?: string; status?: string }>;
        const submission = submissions.find((candidate) => candidate.id === id);
        return [submission?.status, submission?.exportState];
      }, submissionId),
    )
    .toEqual(["exported", "marked_exported"]);
  return proof;
}

test.describe("V-19 real UI registration to city Excel export", () => {
  test("keeps the editable family tourist selector above the questionnaire shell", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(20_000);
    const browserProblems = collectBrowserProblems(page);
    const viewports = [
      { height: 900, label: "1440x900", width: 1440 },
      { height: 1024, label: "768x1024", width: 768 },
      { height: 844, label: "390x844", width: 390 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await startFresh(page, "1@1.ru");
      await login(page, "1@1.ru", "11");
      const questionnaire = await createFamilyQuestionnaire(page, {
        applicants: ["Тестова Анна", "Тестов Иван"],
        city: "Москва",
        fileSlug: `tourist-selector-${viewport.label}`,
        listTitle: "Тестовы",
        ownerEmail: "1@1.ru",
        title: "Семья Тестовых",
      });
      const touristMenuLabel =
        viewport.width < 768 ? "Выбрать заявителя — нижняя панель" : "Выбрать туриста";
      const touristMenu = page
        .locator(".vf-figma-questionnaire-screen:visible")
        .getByRole("combobox", { name: touristMenuLabel });
      await expect(touristMenu, viewport.label).toBeEnabled({ timeout: 20_000 });
      await touristMenu.click();
      const listbox = page.getByRole("listbox", { name: touristMenuLabel });
      await expect(listbox).toBeVisible();
      const stacking = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>(
          ".v19-questionnaire-screen-shell",
        );
        const popover = document.querySelector<HTMLElement>(
          ".v19-select-menu-popover.is-questionnaire-tourist",
        );
        return {
          popover: Number.parseInt(getComputedStyle(popover!).zIndex, 10),
          shell: Number.parseInt(getComputedStyle(shell!).zIndex, 10),
        };
      });
      expect(stacking.popover, viewport.label).toBeGreaterThan(stacking.shell);
      const options = listbox.getByRole("option");
      await expect(options).toHaveCount(2);
      await options.nth(1).click();
      await expect(
        questionnaire.locator(".v19-questionnaire-applicant-tab").nth(1),
      ).toHaveAttribute("aria-pressed", "true");
      await questionnaire.getByRole("button", { name: "Сохранить и продолжить" }).click();
      await expect(questionnaire).toHaveCount(0);
    }

    expect(browserProblems).toEqual([]);
  });

  test("keeps a dynamically created family reviewable after return and correction", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(20_000);
    const family: FamilyDraft = {
      applicants: ["Петрова Анна", "Петров Иван"],
      city: "Москва",
      correctedPassport: "991234567",
      fileSlug: "targeted-moscow-petrovy",
      listTitle: "Петровы",
      ownerEmail: "1@1.ru",
      title: "Семья Петровых",
    };

    await startFresh(page, "1@1.ru");
    await login(page, "1@1.ru", "11");
    const submissionId = await createFamilyAndSubmit(page, family);
    await logoutThroughUi(page);
    await login(page, "2@2.ru", "22");
    await returnWithIssue(
      page,
      submissionId,
      expectedDrawerApplicant(family.applicants[0] ?? ""),
      family.listTitle,
    );
    await logoutThroughUi(page);
    await login(page, "1@1.ru", "11");
    await fixReturnedSubmission(page, submissionId);
    await logoutThroughUi(page);
    await login(page, "2@2.ru", "22");
    await writeSubmissionStateEvidence(
      page,
      submissionId,
      "targeted-pre-admin-accept-submission.json",
    );
    await acceptSubmission(
      page,
      submissionId,
      expectedDrawerApplicant(family.applicants[0] ?? ""),
      family.listTitle,
    );
    const workbook = await exportFamilyExcel(page, submissionId, family);
    expect(workbook.dataRowCount).toBe(2);
  });

  test("persists admin verification for a single passport uploaded after draft creation", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(20_000);
    const single: FamilyDraft = {
      applicants: ["Соколова Ольга"],
      city: "Москва",
      fileSlug: "targeted-late-passport-single",
      ownerEmail: "1@1.ru",
      title: "Ольга Соколова",
      type: "single",
    };

    await startFresh(page, single.ownerEmail);
    await login(page, single.ownerEmail, "11");
    const submissionId = await createSingleAndSubmit(
      page,
      single.city,
      single.applicants,
    );
    await logoutThroughUi(page);
    await login(page, "2@2.ru", "22");
    await acceptSubmission(
      page,
      submissionId,
      expectedDrawerApplicant(single.applicants[0] ?? ""),
    );
    const workbook = await exportFamilyExcel(page, submissionId, single);
    expect(workbook.dataRowCount).toBe(1);
  });

  test("registers two agents, processes one applicant and three city families with corrections, and downloads eleven tourists", async ({
    page,
  }) => {
    test.setTimeout(600_000);
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
        applicants: ["Сергеева Анна", "Сергеев Иван", "Сергеева Маша", "Сергеев Лев"],
        city: "Москва",
        correctedPassport: "991234567",
        fileSlug: "moscow-sergeevy",
        listTitle: "Сергеевы",
        ownerEmail: agents[0].email,
        title: "Семья Сергеевых",
      },
      {
        applicants: ["Кузнецова Ирина", "Кузнецов Олег", "Кузнецова Ника"],
        city: "Санкт-Петербург",
        correctedPassport: "991234567",
        fileSlug: "spb-kuzneczovy",
        listTitle: "Кузнецовы",
        ownerEmail: agents[1].email,
        title: "Семья Кузнецовых",
      },
      {
        applicants: ["Романова Елена", "Романов Павел", "Романов Артём"],
        city: "Казань",
        fileSlug: "kazan-romanovy",
        listTitle: "Романовы",
        ownerEmail: agents[0].email,
        title: "Семья Романовых",
      },
    ];
    const single: FamilyDraft = {
      applicants: ["Соколова Ольга"],
      city: "Москва",
      fileSlug: "moscow-single-applicant",
      ownerEmail: agents[0].email,
      title: "Ольга Соколова",
      type: "single",
    };
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

    await login(page, agents[0].email);
    const singleSubmissionId = await createSingleAndSubmit(
      page,
      single.city,
      single.applicants,
    );
    await page.reload();
    await openMySubmissions(page);
    await expect(agentSubmissionCard(page, singleSubmissionId)).toBeVisible();
    await logoutThroughUi(page);

    for (const family of families) {
      await login(page, family.ownerEmail);
      const submissionId = await createFamilyAndSubmit(page, family);
      submissionIds.set(family.title, submissionId);
      await page.reload();
      await openMySubmissions(page);
      await expect(agentSubmissionCard(page, submissionId)).toBeVisible();
      await logoutThroughUi(page);
    }

    await login(page, agents[0].email);
    await openMySubmissions(page);
    await expect(agentSubmissionCard(page, singleSubmissionId)).toBeVisible();
    await expect(
      agentSubmissionCard(page, submissionIds.get(families[0].title) ?? ""),
    ).toBeVisible();
    await expect(
      agentSubmissionCard(page, submissionIds.get(families[1].title) ?? ""),
    ).toHaveCount(0);
    await logoutThroughUi(page);

    await login(page, agents[1].email);
    await openMySubmissions(page);
    await expect(
      agentSubmissionCard(page, submissionIds.get(families[1].title) ?? ""),
    ).toBeVisible();
    await expect(agentSubmissionCard(page, singleSubmissionId)).toHaveCount(0);
    await expect(
      agentSubmissionCard(page, submissionIds.get(families[0].title) ?? ""),
    ).toHaveCount(0);
    await logoutThroughUi(page);

    await login(page, "2@2.ru", "22");
    await returnWithIssue(
      page,
      submissionIds.get(families[0].title) ?? "",
      expectedDrawerApplicant(families[0].applicants[0] ?? ""),
      families[0].listTitle,
    );
    await returnWithIssue(
      page,
      submissionIds.get(families[1].title) ?? "",
      expectedDrawerApplicant(families[1].applicants[0] ?? ""),
      families[1].listTitle,
    );
    await logoutThroughUi(page);

    await login(page, families[0].ownerEmail);
    await fixReturnedSubmission(page, submissionIds.get(families[0].title) ?? "");
    await logoutThroughUi(page);

    await login(page, families[1].ownerEmail);
    await fixReturnedSubmission(page, submissionIds.get(families[1].title) ?? "");
    await logoutThroughUi(page);

    await login(page, "2@2.ru", "22");
    await acceptSubmission(
      page,
      singleSubmissionId,
      expectedDrawerApplicant(single.applicants[0] ?? ""),
    );
    for (const family of families) {
      await acceptSubmission(
        page,
        submissionIds.get(family.title) ?? "",
        expectedDrawerApplicant(family.applicants[0] ?? ""),
        family.listTitle,
      );
    }
    await page.reload();

    const savedFiles = [await exportFamilyExcel(page, singleSubmissionId, single)];
    for (const family of families) {
      savedFiles.push(
        await exportFamilyExcel(page, submissionIds.get(family.title) ?? "", family),
      );
    }

    expect(savedFiles).toHaveLength(4);
    expect(savedFiles.reduce((total, proof) => total + proof.dataRowCount, 0)).toBe(11);

    await logoutThroughUi(page);
    await login(page, "2@2.ru", "22");
    await expect
      .poll(() =>
        page.evaluate(
          (ids) => {
            const submissions = JSON.parse(
              localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
            ) as Array<{ exportState?: string; id?: string; status?: string }>;
            return ids.map((id) => {
              const submission = submissions.find((candidate) => candidate.id === id);
              return [submission?.status, submission?.exportState];
            });
          },
          [
            singleSubmissionId,
            ...families.map((family) => submissionIds.get(family.title) ?? ""),
          ],
        ),
      )
      .toEqual(
        Array.from({ length: 4 }, () => ["exported", "marked_exported"]),
      );
    await logoutThroughUi(page);

    await login(page, agents[0].email);
    await openMySubmissions(page);
    await expect(agentSubmissionCard(page, singleSubmissionId)).toBeVisible();
    await expect(
      agentSubmissionCard(page, submissionIds.get(families[0].title) ?? ""),
    ).toBeVisible();
    await expect(
      agentSubmissionCard(page, submissionIds.get(families[1].title) ?? ""),
    ).toHaveCount(0);
    expect(browserProblems).toEqual([]);
  });
});
