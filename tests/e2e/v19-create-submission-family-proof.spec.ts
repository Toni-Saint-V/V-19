import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const qaDir = "docs/qa/pipeline-premium-ui-mobile-20260628/fix-findings";

function e2ePassportFile(name: string) {
  return {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    mimeType: "image/jpeg",
    name: `e2e-passport-${name}.jpg`,
  };
}

async function clickFirstVisible(locator: Locator) {
  let visibleIndex = -1;
  await expect
    .poll(async () => {
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
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

async function openMySubmissions(page: Page, mobile: boolean) {
  await page.goto("/");

  if (mobile) {
    const menu = page.getByRole("button", { name: "Меню" });
    if (await menu.isVisible()) {
      await menu.click();
    }
  }

  await clickFirstVisible(
    page.getByRole("button", { name: /Мои подачи/ }),
  );
  await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
}

async function openCreateSubmission(page: Page, mobile: boolean) {
  await openMySubmissions(page, mobile);
  await clickFirstVisible(
    page.getByRole("button", { name: /^(Создать пакет|Новая подача)$/ }),
  );

  const dialog = page.getByRole("dialog").first();
  await expect(dialog.getByText("Новая подача")).toBeVisible();
  return dialog;
}

async function uploadPassportToApplicant(
  familyPanel: Locator,
  dialog: Locator,
  applicantLabel: string,
  fileName: string,
) {
  await familyPanel.locator("button").filter({ hasText: applicantLabel }).first().click();
  await dialog.locator(".pi-file-input").setInputFiles(e2ePassportFile(fileName));
  await expect(familyPanel.getByText(`e2e-passport-${fileName}.jpg`)).toBeVisible();
}

async function verifyFamilyCreateFlow(page: Page, mobile: boolean) {
  const dialog = await openCreateSubmission(page, mobile);
  const nextButton = dialog.locator(".create-passport-next");
  const familyPanel = dialog.getByLabel(
    mobile
      ? "Заявители семьи и общие ответы"
      : "Заявители и общие семейные ответы",
  );

  await dialog.getByRole("button", { exact: true, name: "Семья" }).click();
  await expect(dialog.getByText("2 чел.")).toBeVisible();
  await expect(familyPanel.getByText("Основной заявитель")).toBeVisible();
  await expect(familyPanel.getByText("Заявитель 2")).toBeVisible();
  await expect(
    familyPanel.getByText("Один адрес проживания в России у всех?"),
  ).toBeVisible();
  await expect(
    familyPanel.getByText("Одно проживание в Испании у всех?"),
  ).toBeVisible();
  await expect(familyPanel.getByRole("button", { name: "Да" }).first()).toBeVisible();
  await expect(familyPanel.getByRole("button", { name: "Нет" }).first()).toBeVisible();
  await expect(nextButton).toBeDisabled();

  await uploadPassportToApplicant(familyPanel, dialog, "Основной заявитель", "Ivan_Petrov");
  await expect(nextButton).toBeDisabled();

  await uploadPassportToApplicant(familyPanel, dialog, "Заявитель 2", "Anna_Petrova");
  await expect(nextButton).toBeEnabled();

  await dialog.getByRole("button", { exact: true, name: "Заявитель" }).click();
  await expect(dialog.getByText("1 чел.")).toBeVisible();
  await expect(dialog.getByText("e2e-passport-Anna_Petrova.jpg")).toHaveCount(0);
  await expect(nextButton).toBeEnabled();

  await dialog.getByRole("button", { exact: true, name: "Семья" }).click();
  await expect(dialog.getByText("2 чел.")).toBeVisible();
  await expect(nextButton).toBeDisabled();

  await uploadPassportToApplicant(familyPanel, dialog, "Заявитель 2", "Anna_Petrova");
  await expect(nextButton).toBeEnabled();

  await page.screenshot({
    fullPage: true,
    path: `${qaDir}/create-family-${mobile ? "mobile-390" : "desktop-1440"}.png`,
  });
  await expectHorizontalOverflow(page, 0);

  await nextButton.click();
  await expect(dialog.getByRole("button", { name: "Сохранить черновик" })).toBeVisible();
}

async function expectHorizontalOverflow(page: Page, expected: number) {
  const overflowX = await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      document: {
        body: { scrollWidth: number };
        documentElement: { scrollWidth: number };
      };
      innerWidth: number;
    };

    return (
      Math.max(
        0,
        browserGlobal.document.documentElement.scrollWidth,
        browserGlobal.document.body.scrollWidth,
      ) - browserGlobal.innerWidth
    );
  });
  expect(overflowX).toBe(expected);
}

test.describe("V-19 create submission family proof", () => {
  test.beforeAll(() => {
    mkdirSync(qaDir, { recursive: true });
  });

  test("family passports are required per applicant on desktop", async ({ page }) => {
    const consoleProblems = collectConsoleProblems(page);
    await page.setViewportSize({ height: 960, width: 1440 });
    await verifyFamilyCreateFlow(page, false);
    expect(consoleProblems).toEqual([]);
  });

  test("family passports are required per applicant on mobile", async ({ page }) => {
    const consoleProblems = collectConsoleProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await verifyFamilyCreateFlow(page, true);
    expect(consoleProblems).toEqual([]);
  });
});

function collectConsoleProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}
