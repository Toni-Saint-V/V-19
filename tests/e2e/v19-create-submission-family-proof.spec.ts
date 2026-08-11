import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  openFreshWorkspace,
} from "./v19-pilot-helpers";
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

async function openCreateSubmission(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });
  await clickWorkspaceButton(page, /^Мои подачи$/);
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

async function chooseCity(page: Page, workspace: Locator, city: string) {
  await workspace.getByLabel("Город подачи").click();
  await page.getByRole("option", { exact: true, name: city }).click();
  await expect(workspace.getByLabel("Город подачи")).toContainText(city);
}

async function verifyFamilyCreateFlow(
  page: Page,
  { screenshotLabel }: { screenshotLabel: string },
) {
  const workspace = await openCreateSubmission(page);
  const saveButton = workspace.getByRole("button", {
    name: "Сохранить черновик",
  });
  const continueWithoutPassport = workspace.getByRole("button", {
    name: "Продолжить без паспорта",
  });
  await expect(saveButton).toBeDisabled();
  await expect(continueWithoutPassport).toBeDisabled();
  await expect(workspace.getByText("Выберите город подачи.")).toBeHidden();

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
    path: `${qaDir}/family-${screenshotLabel}.png`,
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
  const workspace = await openCreateSubmission(page);
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

  test("creates a single submission on desktop", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 960, width: 1440 });
    await verifySingleCreateFlow(page);
    expect(browserProblems).toEqual([]);
  });

  test("keeps a newly created draft out of My Actions", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 960, width: 1440 });
    const workspace = await openCreateSubmission(page);
    await workspace.getByRole("radio", { name: "Заявитель" }).click();
    await chooseCity(page, workspace, "Москва");
    await workspace.getByRole("button", { name: "Сохранить черновик" }).click();

    const draftId = await page.evaluate(() => {
      const submissions = JSON.parse(
        localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
      ) as Array<{ id?: string; status?: string }>;
      return submissions.find((submission) => submission.status === "draft")?.id;
    });
    expect(draftId).toBeTruthy();

    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await clickWorkspaceButton(page, /^Мои действия$/);
    await expect(
      page.locator(
        `[data-testid="agent-action-queue-item"][data-submission-id="${draftId}"]`,
      ),
    ).toHaveCount(0);
    expect(browserProblems).toEqual([]);
  });

  test("creates a family submission on desktop", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 960, width: 1440 });
    await verifyFamilyCreateFlow(page, {
      screenshotLabel: "desktop-1440",
    });
    expect(browserProblems).toEqual([]);
  });

  test("creates a family submission on mobile", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await verifyFamilyCreateFlow(page, { screenshotLabel: "mobile-390" });
    expect(browserProblems).toEqual([]);
  });

  for (const viewport of [
    { height: 720, width: 320 },
    { height: 932, width: 430 },
    { height: 1024, width: 768 },
  ] as const) {
    test(`keeps the family intake rhythm at ${viewport.width}px`, async ({ page }) => {
      const browserProblems = collectBrowserProblems(page);
      await page.setViewportSize(viewport);
      await verifyFamilyCreateFlow(page, {
        screenshotLabel: `responsive-${viewport.width}`,
      });
      expect(browserProblems).toEqual([]);
    });
  }

  test("keeps a dirty draft when command-palette navigation is cancelled", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    const workspace = await openCreateSubmission(page);
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
