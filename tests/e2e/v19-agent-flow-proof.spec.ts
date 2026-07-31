import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { testArtifactPath } from "../support/artifacts";
import {
  clickFirstVisible,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  isVisible,
  openFreshWorkspace,
  openDrawerTab,
} from "./v19-pilot-helpers";

const evidenceDirectory = testArtifactPath("agent-flow-2026-07-29");

test.use({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });
test.beforeAll(() => mkdirSync(evidenceDirectory, { recursive: true }));

type ApplicantInput = {
  birthDate: string;
  birthPlace: string;
  firstName: string;
  gender: "Женский" | "Мужской";
  passportNumber: string;
  surname: string;
};

type PersistedAgentPackage = {
  applicants?: Array<{
    fullName?: string;
    id?: string;
    role?: string;
    sections?: Array<{
      fields?: Array<{ error?: string; id?: string; value?: string }>;
    }>;
  }>;
  city?: string;
  completeness?: {
    files?: number;
    questionnaire?: number;
    total?: number;
  };
  createdAt?: string;
  files?: Array<{
    applicantId?: string;
    originalFileName?: string;
    status?: string;
    type?: string;
  }>;
  history?: Array<{
    fromStatus?: string;
    source?: string;
    toStatus?: string;
  }>;
  id?: string;
  status?: string;
  type?: string;
  updatedAt?: string;
};

const singleApplicant: ApplicantInput = {
  birthDate: "01.01.1990",
  birthPlace: "MOSCOW",
  firstName: "ANTON",
  gender: "Мужской",
  passportNumber: "910000001",
  surname: "VOLKOV",
};

const familyApplicants: ApplicantInput[] = [
  {
    birthDate: "02.02.1991",
    birthPlace: "MOSCOW",
    firstName: "MARIA",
    gender: "Женский",
    passportNumber: "920000001",
    surname: "ORLOVA",
  },
  {
    birthDate: "03.03.1989",
    birthPlace: "KAZAN",
    firstName: "ALEXEY",
    gender: "Мужской",
    passportNumber: "920000002",
    surname: "ORLOV",
  },
  {
    birthDate: "04.04.2014",
    birthPlace: "KAZAN",
    firstName: "NIKITA",
    gender: "Мужской",
    passportNumber: "920000003",
    surname: "ORLOV",
  },
];

function passportFile(name: string) {
  return {
    buffer: Buffer.from([0x00, 0x00, 0x00, 0x18]),
    mimeType: "image/heic",
    name: `${name}-passport.heic`,
  };
}

function selfieFile(name: string) {
  return {
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]),
    mimeType: "image/png",
    name,
  };
}

async function openAllAgentSubmissions(page: Page) {
  const submissionsScreen = page.locator('[data-agent-screen="submissions"]');
  if (!(await isVisible(submissionsScreen))) {
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^(Мои действия|Мои подачи)$/,
      }),
    ).toBeVisible();
    await clickWorkspaceButton(page, /Мои подачи/);
  }
  await expect(submissionsScreen).toBeVisible();
  const typeFilter = page.getByRole("button", { name: /^Тип подачи:/ });
  if (await isVisible(typeFilter)) {
    await typeFilter.click();
    await page.getByRole("option", { name: "Все" }).click();
  }
}

function agentSubmissionCard(page: Page, submissionId: string) {
  return page.locator(
    `[data-testid="agent-submission-card"][data-submission-id="${submissionId}"]`,
  );
}

async function openCreateSubmission(page: Page) {
  await openAllAgentSubmissions(page);
  const create = page
    .locator("header.v19-page-header")
    .getByRole("button", { name: /^(Создать пакет|Новая подача)$/ })
    .first();
  await expect(create).toBeVisible();
  await create.click();
  const workspace = page.locator('[data-agent-screen="create"]');
  await expect(workspace).toBeVisible();
  return workspace;
}

async function createSubmission(
  page: Page,
  input: {
    applicants: ApplicantInput[];
    city: "Москва" | "Санкт-Петербург";
    type: "family" | "single";
  },
) {
  const workspace = await openCreateSubmission(page);
  await workspace
    .getByRole("radio", {
      name: input.type === "family" ? "Семья" : "Заявитель",
    })
    .click();
  await workspace.getByLabel("Город подачи").click();
  await page.getByRole("option", { exact: true, name: input.city }).click();

  if (input.type === "family") {
    for (let index = 2; index < input.applicants.length; index += 1) {
      await workspace
        .getByRole("button", { name: /Добавить (следующего )?заявителя/ })
        .click();
    }
  }

  await workspace
    .locator('input[type="file"]')
    .setInputFiles(
      input.applicants.map((applicant) =>
        passportFile(`${applicant.surname}-${applicant.firstName}`),
      ),
    );
  const assignment = page.getByRole("dialog", { name: "Назначьте паспорта" });
  if (await isVisible(assignment)) {
    const owners = assignment.getByRole("combobox", { name: /Заявитель для/ });
    await expect(owners).toHaveCount(input.applicants.length);
    for (let index = 0; index < input.applicants.length; index += 1) {
      await owners.nth(index).selectOption(String(index));
    }
    const recognize = assignment.getByRole("button", {
      name: "Распознать паспорта",
    });
    await recognize.focus();
    await expect(recognize).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(assignment).toBeHidden();
  }

  const createButton = workspace.getByRole("button", {
    name: "Создать и открыть анкету",
  });
  await expect(createButton).toBeEnabled({ timeout: 30_000 });
  await createButton.click();

  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  const submissionId = await questionnaire.getAttribute("data-submission-id");
  if (!submissionId) throw new Error("Created submission ID is missing.");
  return { questionnaire, submissionId };
}

async function clickQuestionnaireSection(
  questionnaire: Locator,
  name: RegExp | string,
) {
  const section = questionnaire
    .locator(".v19-questionnaire-section-tab")
    .filter({ hasText: name });
  await clickFirstVisible(section);
  await expect(questionnaire.locator(".v19-questionnaire-work-panel")).toBeVisible();
}

async function questionnaireField(questionnaire: Locator, label: string) {
  return questionnaire
    .locator(`[data-field-label="${label.replaceAll('"', '\\"')}"]`)
    .first();
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
  applicantCount: number,
  input: ApplicantInput,
  email: string,
  city: "Москва" | "Санкт-Петербург",
) {
  const applicantTabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
  await expect(applicantTabs).toHaveCount(applicantCount);
  if (applicantIndex > 0) {
    const applicantTab = applicantTabs.nth(applicantIndex);
    if (await isVisible(applicantTab)) {
      await applicantTab.click();
    } else {
      const applicantSelector = questionnaire.getByRole("combobox", {
        name: /Выбрать (туриста|заявителя)/,
      });
      await clickFirstVisible(applicantSelector);
      const options = questionnaire
        .page()
        .locator('[role="listbox"]:visible')
        .getByRole("option");
      await expect(options).toHaveCount(applicantCount);
      await options.nth(applicantIndex).click();
    }
  }

  await clickQuestionnaireSection(questionnaire, /Запись/);
  await chooseQuestionnaireField(questionnaire, "Город подачи", city);
  await fillQuestionnaireField(questionnaire, "С какого числа", "10.12.2026");
  await fillQuestionnaireField(questionnaire, "По какое число", "12.12.2026");

  await clickQuestionnaireSection(questionnaire, /Личные данные/);
  await fillQuestionnaireField(questionnaire, "Фамилия", input.surname);
  await fillQuestionnaireField(questionnaire, "Предыдущие фамилии", "NONE");
  await fillQuestionnaireField(questionnaire, "Имя", input.firstName);
  await fillQuestionnaireField(questionnaire, "Дата рождения", input.birthDate);
  await fillQuestionnaireField(questionnaire, "Место рождения", input.birthPlace);
  await chooseQuestionnaireField(
    questionnaire,
    "Страна рождения",
    "Russian Federation",
  );
  await chooseQuestionnaireField(questionnaire, "Пол", input.gender);
  await chooseQuestionnaireField(
    questionnaire,
    "Семейное положение",
    "Холост/не замужем",
  );
  const revealGuardian = questionnaire.getByRole("button", {
    name: "Добавить родителя или опекуна",
  });
  if (await isVisible(revealGuardian)) {
    await revealGuardian.click();
    await fillQuestionnaireField(
      questionnaire,
      "Родитель/опекун несовершеннолетнего",
      "IVAN ORLOV, FATHER",
    );
  }

  await clickQuestionnaireSection(questionnaire, /Паспорт/);
  await chooseQuestionnaireField(questionnaire, "Тип документа", "Ordinary Passport");
  await fillQuestionnaireField(questionnaire, "Номер паспорта", input.passportNumber);
  await fillQuestionnaireField(questionnaire, "Дата выдачи", "01.01.2024");
  await fillQuestionnaireField(questionnaire, "Действителен до", "01.01.2034");
  await chooseQuestionnaireField(questionnaire, "Страна выдачи", "Russian Federation");
  await fillQuestionnaireField(questionnaire, "Место выдачи", input.birthPlace);

  await clickQuestionnaireSection(questionnaire, /Адрес и контакты/);
  await chooseQuestionnaireField(
    questionnaire,
    "Страна проживания",
    "Russian Federation",
  );
  await fillQuestionnaireField(questionnaire, "Город проживания", "MOSCOW");
  await fillQuestionnaireField(
    questionnaire,
    "Улица / проспект / переулок",
    "TEST STREET",
  );
  await fillQuestionnaireField(questionnaire, "Дом", "1");
  await fillQuestionnaireField(questionnaire, "Корпус / строение", "2");
  await fillQuestionnaireField(questionnaire, "Квартира / офис / помещение", "12");
  await fillQuestionnaireField(questionnaire, "Почтовый индекс", "101000");
  await fillQuestionnaireField(questionnaire, "Email", email);
  await fillQuestionnaireField(questionnaire, "Телефон", "+7 900 111-22-33");
  await chooseQuestionnaireField(
    questionnaire,
    "Есть вид на жительство в другой стране",
    "Нет",
  );

  await clickQuestionnaireSection(questionnaire, /Работа \/ учеба/);
  await fillQuestionnaireField(questionnaire, "Должность", "IT PROFESSIONAL");
  await fillQuestionnaireField(
    questionnaire,
    "Работодатель / учебное заведение",
    "AGENT FLOW QA",
  );
  await fillQuestionnaireField(
    questionnaire,
    "Телефон работодателя / учебного заведения",
    "+7 900 222-33-44",
  );
  await fillQuestionnaireField(
    questionnaire,
    "Адрес работодателя / учебного заведения",
    "QA OFFICE STREET 2",
  );

  await clickQuestionnaireSection(questionnaire, /Поездка/);
  await chooseQuestionnaireField(questionnaire, "Цель поездки", "TOURISM");
  await chooseQuestionnaireField(questionnaire, "Основная страна назначения", "Spain");
  await chooseQuestionnaireField(questionnaire, "Страна первого въезда", "Spain");
  await chooseQuestionnaireField(questionnaire, "Количество въездов", "Однократная");
  await fillQuestionnaireField(questionnaire, "Дата въезда", "15.01.2027");
  await fillQuestionnaireField(questionnaire, "Дата выезда", "22.01.2027");
  await chooseQuestionnaireField(questionnaire, "Отпечатки ранее сдавались", "Нет");

  await clickQuestionnaireSection(questionnaire, /Отель \/ приглашение/);
  await chooseQuestionnaireField(
    questionnaire,
    "Тип принимающей стороны",
    "Гостиница/временное жилье",
  );
  await fillQuestionnaireField(
    questionnaire,
    "ФИО приглашающего лица или название отеля/компании",
    "HOTEL AGENT FLOW",
  );
  await fillQuestionnaireField(questionnaire, "Адрес", "CALLE TEST 10, MADRID");
  await chooseQuestionnaireField(questionnaire, "Страна", "Spain");
  await fillQuestionnaireField(questionnaire, "Город", "Madrid");
  await fillQuestionnaireField(questionnaire, "Почтовый индекс", "28001");
  await fillQuestionnaireField(questionnaire, "Email", "hotel@example.test");
  await fillQuestionnaireField(questionnaire, "Телефон", "+34 600 123 456");
}

async function saveQuestionnaireAndExit(questionnaire: Locator) {
  const save = questionnaire.getByRole("button", {
    name: /^Сохранить и выйти(?: — нижняя панель)?$/,
  });
  await clickFirstVisible(save);
  await expect(questionnaire).toHaveCount(0);
}

async function openSubmission(page: Page, submissionId: string) {
  await openAllAgentSubmissions(page);
  const card = agentSubmissionCard(page, submissionId);
  await expect(card).toBeVisible();
  await card.focus();
  await expect(card).toBeFocused();
  await card.press("Enter");
  await expect(drawer(page)).toBeVisible();
}

async function openQuestionnaireFromDrawer(page: Page) {
  await openDrawerTab(page, ["Анкета", "Данные"]);
  await clickFirstVisible(drawer(page).getByRole("button", { name: "Открыть анкету" }));
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  return questionnaire;
}

async function uploadMissingDocuments(
  page: Page,
  submissionId: string,
  submissionSlug: string,
) {
  await openAllAgentSubmissions(page);
  const card = agentSubmissionCard(page, submissionId);
  await expect(card).toBeVisible();
  const primaryDocuments = card.getByRole("group", { name: /Документы:/ }).first();

  for (const [index, label] of ["Селфи 1", "Селфи 2"].entries()) {
    const input = primaryDocuments.getByLabel(new RegExp(`^Выбрать файл: ${label},`));
    await expect(input).toHaveCount(1);
    await input.setInputFiles(selfieFile(`${submissionSlug}-selfie-${index + 1}.png`));
    await expect
      .poll(() =>
        page.evaluate(
          ({ id, type }) => {
            const submissions = JSON.parse(
              localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
            ) as PersistedAgentPackage[];
            return submissions
              .find((submission) => submission.id === id)
              ?.files?.find((file) => file.type === type)?.status;
          },
          {
            id: submissionId,
            type: index === 0 ? "selfie" : "selfie_2",
          },
        ),
      )
      .toBe("uploaded");
  }
}

async function submitFromCard(page: Page, submissionId: string) {
  await openAllAgentSubmissions(page);
  const card = agentSubmissionCard(page, submissionId);
  await expect(card).toBeVisible();
  const submit = card.getByRole("button", {
    name: /^Отправить на проверку:/,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  const confirmation = page.getByRole("dialog", {
    name: "Отправить на проверку администратору?",
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Отправить" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(card).toContainText(/На проверке|Отправлено/);
}

async function persistedPackage(
  page: Page,
  submissionId: string,
): Promise<PersistedAgentPackage> {
  return page.evaluate((id) => {
    const submissions = JSON.parse(
      localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
    ) as PersistedAgentPackage[];
    const submission = submissions.find((candidate) => candidate.id === id);
    if (!submission) throw new Error(`Submission ${id} is absent from readback.`);
    return submission;
  }, submissionId);
}

function questionnaireValue(
  submission: PersistedAgentPackage,
  applicantIndex: number,
  fieldId: string,
) {
  return submission.applicants?.[applicantIndex]?.sections
    ?.flatMap((section) => section.fields ?? [])
    .find((field) => field.id === fieldId)?.value;
}

function expectPersistedPackage(
  submission: PersistedAgentPackage,
  input: {
    applicants: ApplicantInput[];
    city: string;
    type: "family" | "single";
  },
) {
  expect(submission.id).toMatch(/^ПД-/);
  expect(submission.type).toBe(input.type);
  expect(submission.city).toBe(input.city);
  expect(submission.status).toBe("submitted_for_review");
  expect(Date.parse(submission.createdAt ?? "")).not.toBeNaN();
  expect(submission.updatedAt).toBeTruthy();
  expect(
    submission.updatedAt === "сейчас" ||
      !Number.isNaN(Date.parse(submission.updatedAt ?? "")),
  ).toBe(true);
  expect(submission.completeness).toEqual({
    files: 100,
    questionnaire: 100,
    total: 100,
  });
  expect(submission.applicants).toHaveLength(input.applicants.length);
  expect(new Set(submission.applicants?.map((applicant) => applicant.id)).size).toBe(
    input.applicants.length,
  );
  expect(submission.applicants?.map((applicant) => applicant.role)).toEqual(
    input.type === "single" ? ["main"] : ["main", "spouse", "child"],
  );
  for (const [index, applicant] of input.applicants.entries()) {
    expect(questionnaireValue(submission, index, "surname")).toBe(applicant.surname);
    expect(questionnaireValue(submission, index, "first-name")).toBe(
      applicant.firstName,
    );
    expect(questionnaireValue(submission, index, "passport-no")).toBe(
      applicant.passportNumber,
    );
  }
  expect(submission.files?.map((file) => file.type).sort()).toEqual(
    input.type === "single"
      ? ["passport_scan", "selfie", "selfie_2"]
      : ["passport_scan", "passport_scan", "passport_scan", "selfie", "selfie_2"],
  );
  expect(submission.files?.every((file) => file.status === "pending_review")).toBe(
    true,
  );
  expect(
    submission.history?.some(
      (item) =>
        item.fromStatus === "draft" &&
        item.toStatus === "in_progress" &&
        item.source === "agent",
    ),
  ).toBe(true);
  expect(
    submission.history?.some(
      (item) =>
        item.fromStatus === "in_progress" &&
        item.toStatus === "submitted_for_review" &&
        item.source === "agent",
    ),
  ).toBe(true);
}

async function createCompletePackage(
  page: Page,
  input: {
    applicants: ApplicantInput[];
    city: "Москва" | "Санкт-Петербург";
    slug: string;
    type: "family" | "single";
  },
) {
  const created = await createSubmission(page, input);
  for (const [index, applicant] of input.applicants.entries()) {
    await fillApplicantQuestionnaire(
      created.questionnaire,
      index,
      input.applicants.length,
      applicant,
      "agent-flow@example.test",
      input.city,
    );
  }
  await saveQuestionnaireAndExit(created.questionnaire);
  await uploadMissingDocuments(page, created.submissionId, input.slug);

  await page.reload();
  await openSubmission(page, created.submissionId);
  const questionnaire = await openQuestionnaireFromDrawer(page);
  const surname = await questionnaireField(questionnaire, "Фамилия");
  await expect(surname.locator("input")).toHaveValue(input.applicants[0]!.surname);
  await saveQuestionnaireAndExit(questionnaire);
  await submitFromCard(page, created.submissionId);

  await page.reload();
  await openAllAgentSubmissions(page);
  await expect(agentSubmissionCard(page, created.submissionId)).toContainText(
    /На проверке|Отправлено/,
  );
  return created.submissionId;
}

async function expectAdminPackage(
  page: Page,
  submissionId: string,
  applicants: ApplicantInput[],
  documentNames: string[],
  screenshotPath?: string,
) {
  await clickWorkspaceButton(page, /Проверка|Работа/);
  const target = page.locator(`[data-submission-id="${submissionId}"]`).first();
  await expect(target).toBeVisible();
  await target.click();
  const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
  await expect(reviewWorkspace).toBeVisible();
  await expect(reviewWorkspace.getByTitle(submissionId)).toHaveText(submissionId);

  const applicantSelect = reviewWorkspace.getByRole("combobox", {
    name: "Заявитель для проверки",
  });
  const mediaTablist = reviewWorkspace.getByRole("tablist", {
    name: "Выбор файла для проверки",
  });
  const selfieNames = documentNames.filter((name) => name.includes("selfie"));

  for (const [index, applicant] of applicants.entries()) {
    const fullName = `${applicant.firstName} ${applicant.surname}`;
    if (applicants.length > 1) {
      await applicantSelect.selectOption({ label: fullName });
    }

    await expect(reviewWorkspace).toContainText(fullName);
    await expect(
      reviewWorkspace.locator('[data-passport-field-id="passport-no"]'),
    ).toContainText(applicant.passportNumber);

    const passportName = `${applicant.surname}-${applicant.firstName}-passport.heic`;
    await mediaTablist.getByRole("tab", { name: "Паспорт" }).click();
    await expect(reviewWorkspace).toContainText(passportName);

    const mediaTabs = mediaTablist.getByRole("tab");
    if (index === 0) {
      await expect(mediaTabs).toHaveCount(3);
      await mediaTablist.getByRole("tab", { name: "Селфи 1" }).click();
      await expect(reviewWorkspace).toContainText(selfieNames[0]!);
      await mediaTablist.getByRole("tab", { name: "Селфи 2" }).click();
      await expect(reviewWorkspace).toContainText(selfieNames[1]!);
      if (screenshotPath) {
        await page.screenshot({ fullPage: true, path: screenshotPath });
      }
    } else {
      await expect(mediaTabs).toHaveCount(1);
    }
  }

  await reviewWorkspace.getByRole("button", { name: "Вернуться к очереди" }).click();
  await expect(reviewWorkspace).toBeHidden();
}

test.describe("V-19 full Agent Flow browser proof", () => {
  test("fresh workspace persists single and family packages for Admin readback", async ({
    page,
  }, testInfo) => {
    test.setTimeout(600_000);
    page.setDefaultTimeout(25_000);
    const browserProblems = collectBrowserProblems(page);

    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, { heading: "Мои действия" });

    const singleId = await createCompletePackage(page, {
      applicants: [singleApplicant],
      city: "Москва",
      slug: "single",
      type: "single",
    });
    const singleScreenshot = `${evidenceDirectory}/single-1440x900.png`;
    await page.screenshot({ fullPage: true, path: singleScreenshot });
    await testInfo.attach("single-1440x900", {
      contentType: "image/png",
      path: singleScreenshot,
    });

    await page.setViewportSize({ height: 844, width: 390 });
    const familyId = await createCompletePackage(page, {
      applicants: familyApplicants,
      city: "Санкт-Петербург",
      slug: "family",
      type: "family",
    });
    const familyScreenshot = `${evidenceDirectory}/family-390x844.png`;
    await page.screenshot({ fullPage: true, path: familyScreenshot });
    await testInfo.attach("family-390x844", {
      contentType: "image/png",
      path: familyScreenshot,
    });

    await page.setViewportSize({ height: 1024, width: 768 });
    await page.reload();
    await openAllAgentSubmissions(page);
    await expect(agentSubmissionCard(page, singleId)).toBeVisible();
    await expect(agentSubmissionCard(page, familyId)).toBeVisible();
    const singleReadback = await persistedPackage(page, singleId);
    const familyReadback = await persistedPackage(page, familyId);
    expectPersistedPackage(singleReadback, {
      applicants: [singleApplicant],
      city: "Москва",
      type: "single",
    });
    expectPersistedPackage(familyReadback, {
      applicants: familyApplicants,
      city: "Санкт-Петербург",
      type: "family",
    });

    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, {
      heading: /^(Проверка|Очередь на проверку)$/,
      workspaceEmail: "admin@visaflow.local",
    });
    await page.evaluate(
      (packages) => {
        localStorage.setItem("visaflow.v19.submissions.v1", JSON.stringify(packages));
      },
      [singleReadback, familyReadback],
    );
    await page.reload();
    await expectAdminPackage(
      page,
      singleId,
      [singleApplicant],
      ["VOLKOV-ANTON-passport.heic", "single-selfie-1.png", "single-selfie-2.png"],
    );
    await expectAdminPackage(
      page,
      familyId,
      familyApplicants,
      [
        "ORLOVA-MARIA-passport.heic",
        "ORLOV-ALEXEY-passport.heic",
        "ORLOV-NIKITA-passport.heic",
        "family-selfie-1.png",
        "family-selfie-2.png",
      ],
      `${evidenceDirectory}/admin-family-readback-1440x900.png`,
    );

    const readbackBody = JSON.stringify(
      {
        family: familyReadback,
        single: singleReadback,
      },
      null,
      2,
    );
    writeFileSync(`${evidenceDirectory}/agent-flow-readback.json`, readbackBody);
    await testInfo.attach("agent-flow-readback", {
      body: readbackBody,
      contentType: "application/json",
    });
    expect(singleId).not.toBe(familyId);
    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
