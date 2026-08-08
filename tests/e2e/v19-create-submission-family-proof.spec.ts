import { mkdirSync } from "node:fs";
import { type Locator, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  openFreshWorkspace,
} from "./v19-pilot-helpers";
import { expect, test } from "./v19-localhost-test";
import { testArtifactPath } from "../support/artifacts";

const qaDir = testArtifactPath("submission-intake-upgrade");

function e2ePassportFile(name: string) {
  return {
    buffer: Buffer.from([0x00, 0x00, 0x00, 0x18]),
    mimeType: "image/heic",
    name: `synthetic-passport-${name}.heic`,
  };
}

async function clickFirstVisible(locator: Locator) {
  let visibleIndex = -1;
  await expect
    .poll(async () => {
      for (let index = 0; index < (await locator.count()); index += 1) {
        if (await locator.nth(index).isVisible()) {
          visibleIndex = index;
          return index;
        }
      }
      return -1;
    })
    .not.toBe(-1);
  await locator.nth(visibleIndex).click();
}

async function openCreateSubmission(page: Page, mobile: boolean) {
  await openFreshWorkspace(page, { heading: "Мои действия" });
  if (mobile) {
    const menu = page.getByRole("button", { name: "Меню" });
    if (await menu.isVisible()) await menu.click();
  }
  await clickFirstVisible(page.getByRole("button", { name: /Мои подачи/ }));
  await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
  const createButton = page
    .locator("header.v19-page-header")
    .getByRole("button", { name: "Новая подача" });
  await expect(createButton).toBeVisible();
  await createButton.click();
  const workspace = page.locator('[data-agent-screen="create"]');
  await expect(workspace).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Новая подача" }),
  ).toBeVisible();
  return workspace;
}

async function expectActionInViewport(page: Page, button: Locator) {
  await expect(button).toBeInViewport({ ratio: 1 });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openQuestionnaireSection(page: Page, title: string) {
  const sectionTabs = page
    .locator(".v19-questionnaire-section-tab")
    .filter({ hasText: title });
  await clickFirstVisible(sectionTabs);
  await expect(sectionTabs.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect
    .poll(async () => {
      for (let index = 0; index < (await sectionTabs.count()); index += 1) {
        if ((await sectionTabs.nth(index).getAttribute("aria-pressed")) === "true") {
          return true;
        }
      }
      return false;
    })
    .toBe(true);
}

function questionnaireControl(page: Page, fieldId: string) {
  return page
    .locator(`[data-model-field-id="${fieldId}"]`)
    .locator("input, textarea")
    .first();
}

async function fillQuestionnaireField(page: Page, fieldId: string, value: string) {
  const control = questionnaireControl(page, fieldId);
  await expect(control).toBeVisible();
  await control.fill(value);
  await control.blur();
  await expect(control).toHaveValue(value);
}

async function switchQuestionnaireApplicant(page: Page, optionIndex: number) {
  const applicantSelect = page.getByRole("combobox", {
    name: "Выбрать туриста",
  });
  await applicantSelect.click();
  const options = page
    .locator('[role="listbox"][aria-label="Выбрать туриста"]:visible')
    .getByRole("option");
  await expect(options).toHaveCount(2);
  await options.nth(optionIndex).click();
}

async function reopenQuestionnaire(page: Page, submissionId: string) {
  const card = page
    .locator(
      `[data-testid="agent-submission-card"][data-submission-id="${submissionId}"]`,
    )
    .first();
  if (!(await card.isVisible().catch(() => false))) {
    const resetFilters = page.getByRole("button", { exact: true, name: "Все" }).first();
    await expect(resetFilters).toBeEnabled();
    await resetFilters.click();
  }
  await expect(card).toBeVisible();
  await card.click();

  const questionnaire = page.locator(".vf-figma-questionnaire-screen");
  if (await questionnaire.isVisible().catch(() => false)) return questionnaire;

  const submissionDrawer = page.getByRole("dialog").last();
  await expect(submissionDrawer).toBeVisible();
  const questionnaireTab = submissionDrawer
    .getByRole("tab", { name: /^Анкета/ })
    .first();
  if (await questionnaireTab.isVisible().catch(() => false)) {
    await questionnaireTab.click();
  }
  await submissionDrawer
    .getByRole("button", { name: "Открыть анкету" })
    .first()
    .click();
  await expect(questionnaire).toBeVisible();
  return questionnaire;
}

async function chooseCity(page: Page, workspace: Locator, city: string) {
  await workspace.getByLabel("Город подачи").click();
  await page.getByRole("option", { exact: true, name: city }).click();
  await expect(workspace.getByLabel("Город подачи")).toContainText(city);
}

async function verifyFamilyCreateFlow(page: Page, mobile: boolean) {
  const workspace = await openCreateSubmission(page, mobile);
  const saveButton = workspace.getByRole("button", {
    name: "Сохранить черновик",
  });
  const continueWithoutPassport = workspace.getByRole("button", {
    name: "Продолжить без паспорта",
  });
  await expect(saveButton).toBeDisabled();
  await expect(continueWithoutPassport).toBeDisabled();
  await expect(workspace.getByText("Выберите город подачи.")).toHaveCount(0);

  await chooseCity(page, workspace, "Казань");
  await expect(continueWithoutPassport).toBeEnabled();

  await workspace
    .locator('input[type="file"]')
    .setInputFiles([e2ePassportFile("main"), e2ePassportFile("spouse")]);
  const assignment = page.getByRole("dialog", { name: "Назначьте паспорта" });
  await expect(assignment).toBeVisible();
  const ownerSelectors = assignment.getByRole("combobox", {
    name: /Заявитель для/,
  });
  await ownerSelectors.nth(0).selectOption("0");
  await ownerSelectors.nth(1).selectOption("1");
  await assignment.getByRole("button", { name: "Распознать паспорта" }).click();
  await expect(assignment).toBeHidden();

  await expect(workspace.getByText("Вручную").first()).toBeVisible();
  const primary = workspace.getByRole("button", {
    name: "Создать и открыть анкету",
  });
  await expect(primary).toBeEnabled();
  await expectActionInViewport(page, saveButton);
  await expectActionInViewport(page, primary);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    fullPage: true,
    path: `${qaDir}/family-${mobile ? "mobile-390" : "desktop-1440"}.png`,
  });

  await primary.click();
  await expect(page.locator('[data-agent-screen="create"]')).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Разделы анкеты" })).toBeVisible();
  await clickFirstVisible(
    page.getByRole("combobox", {
      name: /Выбрать (туриста|заявителя)/,
    }),
  );
  await expect(
    page.locator('[role="listbox"]:visible').getByRole("option"),
  ).toHaveCount(2);
}

async function verifySingleCreateFlow(page: Page) {
  const workspace = await openCreateSubmission(page, false);
  const singleType = workspace.getByRole("radio", { name: "Заявитель" });
  await singleType.click();
  await expect(singleType).toHaveAttribute("aria-checked", "true");
  await chooseCity(page, workspace, "Москва");

  const continueWithoutPassport = workspace.getByRole("button", {
    name: "Продолжить без паспорта",
  });
  await expect(continueWithoutPassport).toBeEnabled();
  await continueWithoutPassport.click();

  await expect(page.locator('[data-agent-screen="create"]')).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Разделы анкеты" })).toBeVisible();
  const questionnaireHeading = page.getByRole("heading", {
    level: 1,
    name: /^Анкета:/,
  });
  await expect(questionnaireHeading).toBeVisible();
  await expect(questionnaireHeading).not.toContainText("Семья");
}

test.describe("V-19 canonical family intake", () => {
  test.beforeAll(() => mkdirSync(qaDir, { recursive: true }));

  test("shows complete family role labels without duplicated passport status", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    for (const viewport of [
      { height: 844, width: 390 },
      { height: 762, width: 759 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      const workspace = await openCreateSubmission(page, viewport.width < 1024);
      const familyGrid = workspace.getByTestId("preupload-family-grid");

      await expect(
        familyGrid.getByText("Основной заявитель", { exact: true }),
      ).toBeVisible();
      await expect(
        familyGrid.getByText("Супруг/супруга", { exact: true }),
      ).toBeVisible();
      const clippedApplicantNames = await familyGrid
        .locator(".v19-preupload-applicant-name")
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.scrollWidth > element.clientWidth)
            .map((element) => element.textContent),
        );
      expect(clippedApplicantNames).toEqual([]);
      await expect(familyGrid.locator(".v19-preupload-applicant-state")).toHaveCount(0);
      await expect(familyGrid.getByText("Без паспорта")).toHaveCount(0);
      await expect(
        workspace.getByRole("heading", { name: "Основной заявитель." }),
      ).toBeVisible();
      await expect(
        workspace.getByText(
          "Загрузите скан загранпаспорта. Это позволит вам меньше заполнять анкету за счет извлеченных данных.",
        ),
      ).toBeVisible();
      await expect(workspace.getByText("Город подачи", { exact: true })).toHaveCount(0);
      await expect(workspace.getByText("Выберите город подачи.")).toHaveCount(0);

      const cityTrigger = workspace.getByRole("combobox", {
        name: "Город подачи",
      });
      const applicantBackground = await familyGrid
        .locator("article")
        .nth(1)
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      await expect(cityTrigger).toHaveCSS("background-color", applicantBackground);

      const dropzone = workspace.getByRole("button", {
        name: "Выбрать файл",
      });
      await expect(dropzone).toHaveAccessibleDescription(
        "Основной заявитель. Загрузите скан загранпаспорта. Это позволит вам меньше заполнять анкету за счет извлеченных данных.",
      );
      const pickerLabel = dropzone.getByText("Выбрать файл", { exact: true });
      const [dropzoneBox, pickerBox] = await Promise.all([
        dropzone.boundingBox(),
        pickerLabel.boundingBox(),
      ]);
      expect(dropzoneBox).not.toBeNull();
      expect(pickerBox).not.toBeNull();
      expect(
        Math.abs(
          dropzoneBox!.x +
            dropzoneBox!.width / 2 -
            (pickerBox!.x + pickerBox!.width / 2),
        ),
      ).toBeLessThanOrEqual(1);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: `${qaDir}/family-labels-${viewport.width}x${viewport.height}.png`,
      });

      await page.getByRole("button", { name: "Отменить создание подачи" }).click();
      await expect(workspace).toHaveCount(0);
    }

    expect(browserProblems).toEqual([]);
  });

  test("creates a single submission on desktop", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 960, width: 1440 });
    await verifySingleCreateFlow(page);
    expect(browserProblems).toEqual([]);
  });

  test("creates a family submission on desktop", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 960, width: 1440 });
    await verifyFamilyCreateFlow(page, false);
    expect(browserProblems).toEqual([]);
  });

  test("creates a family submission on mobile", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await verifyFamilyCreateFlow(page, true);
    expect(browserProblems).toEqual([]);
  });

  test("copies only Russia, Spain and appointment data for default yes/yes and keeps it after reload", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    const workspace = await openCreateSubmission(page, false);
    await chooseCity(page, workspace, "Москва");
    await workspace
      .locator('input[type="file"]')
      .setInputFiles([e2ePassportFile("copy-main"), e2ePassportFile("copy-spouse")]);
    const assignment = page.getByRole("dialog", { name: "Назначьте паспорта" });
    const ownerSelectors = assignment.getByRole("combobox", {
      name: /Заявитель для/,
    });
    await ownerSelectors.nth(0).selectOption("0");
    await ownerSelectors.nth(1).selectOption("1");
    await assignment.getByRole("button", { name: "Распознать паспорта" }).click();
    await expect(assignment).toBeHidden();
    await workspace.getByRole("button", { name: "Создать и открыть анкету" }).click();

    const questionnaire = page.locator(".vf-figma-questionnaire-screen");
    await expect(questionnaire).toBeVisible();
    const submissionId = await questionnaire.getAttribute("data-submission-id");
    expect(submissionId).toBeTruthy();

    await openQuestionnaireSection(page, "Поездка");
    await expect(
      questionnaire.getByRole("button", { name: "Копировать для всех" }),
    ).toHaveCount(0);

    await openQuestionnaireSection(page, "Адрес и контакты");
    const copyRussia = questionnaire.getByRole("button", {
      name: "Копировать для всех",
    });
    await expect(copyRussia).toHaveAttribute(
      "title",
      "Копировать адрес в России для всех",
    );
    await fillQuestionnaireField(page, "home-city", "Москва");
    await fillQuestionnaireField(page, "home-street", "Тверская");
    await fillQuestionnaireField(page, "home-house", "10");
    await fillQuestionnaireField(page, "postal-code", "125009");
    await fillQuestionnaireField(page, "email", "primary.copy@example.com");

    await openQuestionnaireSection(page, "Отель / приглашение");
    const copySpain = questionnaire.getByRole("button", {
      name: "Копировать для всех",
    });
    await expect(copySpain).toHaveAttribute(
      "title",
      "Копировать адрес в Испании для всех",
    );
    await fillQuestionnaireField(page, "hotel-address", "Calle de Atocha, 23");
    await fillQuestionnaireField(page, "hotel-city", "Madrid");
    await fillQuestionnaireField(page, "hotel-postal-code", "28012");

    await openQuestionnaireSection(page, "Запись");
    const copyAppointment = questionnaire.getByRole("button", {
      name: "Копировать для всех",
    });
    await expect(copyAppointment).toHaveAttribute(
      "title",
      "Копировать данные записи для всех",
    );
    await fillQuestionnaireField(page, "desired-date-1", "01.09.2026");
    await fillQuestionnaireField(page, "desired-date-2", "10.09.2026");

    await switchQuestionnaireApplicant(page, 1);
    await openQuestionnaireSection(page, "Адрес и контакты");
    await expect(questionnaireControl(page, "home-city")).toHaveValue("Москва");
    await expect(questionnaireControl(page, "home-street")).toHaveValue("Тверская");
    await expect(questionnaireControl(page, "home-house")).toHaveValue("10");
    await expect(questionnaireControl(page, "postal-code")).toHaveValue("125009");
    await expect(questionnaireControl(page, "email")).not.toHaveValue(
      "primary.copy@example.com",
    );

    await openQuestionnaireSection(page, "Отель / приглашение");
    await expect(questionnaireControl(page, "hotel-address")).toHaveValue(
      "Calle de Atocha, 23",
    );
    await expect(questionnaireControl(page, "hotel-city")).toHaveValue("Madrid");
    await expect(questionnaireControl(page, "hotel-postal-code")).toHaveValue("28012");
    await openQuestionnaireSection(page, "Запись");
    await expect(questionnaireControl(page, "desired-date-1")).toHaveValue(
      "01.09.2026",
    );
    await expect(questionnaireControl(page, "desired-date-2")).toHaveValue(
      "10.09.2026",
    );
    await expectNoHorizontalOverflow(page);

    await questionnaire
      .getByRole("button", { name: "Сохранить и выйти", exact: true })
      .click();
    await expect(questionnaire).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: /^(Мои действия|Мои подачи)$/ }),
    ).toBeVisible();
    if (
      await page
        .getByRole("heading", { name: "Мои действия" })
        .isVisible()
        .catch(() => false)
    ) {
      await clickFirstVisible(page.getByRole("button", { name: /Мои подачи/ }));
    }
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    const reopened = await reopenQuestionnaire(page, submissionId!);
    await switchQuestionnaireApplicant(page, 1);
    await openQuestionnaireSection(page, "Адрес и контакты");
    await expect(questionnaireControl(page, "home-city")).toHaveValue("Москва");
    await expect(questionnaireControl(page, "email")).not.toHaveValue(
      "primary.copy@example.com",
    );
    await openQuestionnaireSection(page, "Отель / приглашение");
    await expect(questionnaireControl(page, "hotel-address")).toHaveValue(
      "Calle de Atocha, 23",
    );
    await openQuestionnaireSection(page, "Запись");
    await expect(questionnaireControl(page, "desired-date-1")).toHaveValue(
      "01.09.2026",
    );
    await expect(reopened).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(browserProblems).toEqual([]);
  });

  test("confirms manual passport review and keeps the decision across required viewports", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);

    for (const viewport of [
      { height: 844, width: 390 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      const workspace = await openCreateSubmission(page, viewport.width < 1024);
      const singleType = workspace.getByRole("radio", { name: "Заявитель" });
      await singleType.click();
      await chooseCity(page, workspace, "Москва");
      await workspace
        .locator('input[type="file"]')
        .setInputFiles(e2ePassportFile(`manual-${viewport.width}`));
      await workspace.getByRole("button", { name: "Создать и открыть анкету" }).click();

      const questionnaire = page.locator(".vf-figma-questionnaire-screen");
      await expect(questionnaire).toBeVisible();
      const submissionId = await questionnaire.getAttribute("data-submission-id");
      expect(submissionId).toBeTruthy();
      await openQuestionnaireSection(page, "Паспорт");
      const confirmPassportReview = questionnaire.getByRole("button", {
        name: "Подтвердить ручную проверку паспорта",
      });
      await expect(confirmPassportReview).toBeEnabled();
      await confirmPassportReview.click();
      await expect(
        questionnaire.getByText("Ручная проверка паспорта подтверждена."),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(
          `manual-passport-review-${viewport.width}x${viewport.height}.png`,
        ),
      });

      await clickFirstVisible(
        questionnaire.getByRole("button", { name: /Сохранить и выйти/ }),
      );
      await expect(questionnaire).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const submissionsHeading = page.getByRole("heading", {
        name: "Мои подачи",
      });
      if (!(await submissionsHeading.isVisible().catch(() => false))) {
        if (viewport.width < 1024) {
          const menu = page.getByRole("button", {
            exact: true,
            name: "Меню",
          });
          await expect(menu).toBeVisible();
          await menu.click();
          const menuDialog = page.getByRole("dialog", {
            exact: true,
            name: "Меню агента",
          });
          await expect(menuDialog).toBeVisible();
          await menuDialog.getByRole("button", { name: /Мои подачи/ }).click();
          await expect(menuDialog).toBeHidden();
        } else {
          await clickWorkspaceButton(page, /Мои подачи/);
        }
      }
      await expect(submissionsHeading).toBeVisible();
      const reopened = await reopenQuestionnaire(page, submissionId!);
      await openQuestionnaireSection(page, "Паспорт");
      await expect(
        reopened.getByText("Ручная проверка паспорта подтверждена."),
      ).toBeVisible();
      await expect(
        reopened.getByRole("button", {
          name: "Подтвердить ручную проверку паспорта",
        }),
      ).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }

    expect(browserProblems).toEqual([]);
  });

  test("keeps a dirty draft when command-palette navigation is cancelled", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    const workspace = await openCreateSubmission(page, false);
    await chooseCity(page, workspace, "Казань");

    await page.keyboard.press("Control+K");
    const palette = page.getByRole("dialog", { name: "Командная палитра агента" });
    await expect(palette).toBeVisible();
    await palette.getByText("Мои подачи", { exact: true }).click();

    const exitDialog = page.getByRole("alertdialog", {
      name: "Выйти без сохранения?",
    });
    await expect(exitDialog).toBeVisible();
    await exitDialog
      .getByRole("button", { name: "Вернуться к редактированию" })
      .click();

    await expect(workspace).toBeVisible();
    await expect(workspace.getByLabel("Город подачи")).toContainText("Казань");
  });
});
