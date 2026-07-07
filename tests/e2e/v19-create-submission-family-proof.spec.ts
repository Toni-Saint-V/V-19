import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

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
  await openFreshWorkspace(page, { heading: "Мои действия" });

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

async function verifyFamilyCreateFlow(page: Page, mobile: boolean) {
  const dialog = await openCreateSubmission(page, mobile);
  const nextButton = dialog.getByRole("button", { exact: true, name: "Далее" });
  const initialFooterTop = await footerTop(dialog);

  await expectActionButtonsInViewport(page, dialog);

  await dialog.getByRole("button", { exact: true, name: "Один" }).click();
  await expectActionButtonsInViewport(page, dialog);
  expect(Math.abs((await footerTop(dialog)) - initialFooterTop)).toBeLessThanOrEqual(4);

  await dialog.getByRole("button", { exact: true, name: "Семья" }).click();
  await expectActionButtonsInViewport(page, dialog);
  expect(Math.abs((await footerTop(dialog)) - initialFooterTop)).toBeLessThanOrEqual(4);
  await expect(
    dialog.getByText("У вас одинаковый адрес проживания в России?"),
  ).toBeVisible();
  await expect(dialog.getByText("В Испании?")).toBeVisible();
  if (!mobile) {
    await expect(dialog.getByText("Prefill-поля")).toBeVisible();
  }
  await expect(dialog.getByRole("button", { name: "Выбрать файлы" })).toBeVisible();

  await dialog.locator('input[type="file"]').setInputFiles(e2ePassportFile("family"));
  await expect(dialog.getByText("Заменить набор файлов")).toBeVisible();
  await expect(nextButton).toBeEnabled();
  await expectActionButtonsInViewport(page, dialog);

  await page.screenshot({
    fullPage: true,
    path: `${qaDir}/create-family-${mobile ? "mobile-390" : "desktop-1440"}.png`,
  });
  await expectHorizontalOverflow(page, 0);

  await nextButton.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Анкета: Семейный пакет" }),
  ).toBeVisible();
  if (mobile) {
    await expect(page.getByRole("button", { name: "2 Заявитель 2" })).toBeVisible();
  } else {
    await expect(page.getByText("Семья, 2 чел.")).toBeVisible();
    await expectQuestionnaireDesktopLayout(page);
  }
  await expect(dialog).toHaveCount(0);
}

async function footerTop(dialog: Locator) {
  const box = await dialog
    .getByRole("button", { exact: true, name: "Далее" })
    .boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? 0;
}

async function expectActionButtonsInViewport(page: Page, dialog: Locator) {
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  for (const name of ["Сохранить черновик", "Далее"]) {
    const button = dialog.getByRole("button", { exact: true, name });
    await expect(button).toBeVisible();

    const box = await button.boundingBox();
    expect(box, `${name} should have a layout box`).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight);
  }
}

async function expectQuestionnaireDesktopLayout(page: Page) {
  const applicantBar = page.locator(".v19-questionnaire-applicant-bar");
  const sectionNav = page.locator(".v19-questionnaire-section-nav");
  const workPanel = page.locator(".v19-questionnaire-work-panel");

  await expect(applicantBar).toBeVisible();
  await expect(sectionNav).toBeVisible();
  await expect(workPanel).toBeVisible();

  const pinnedDisplay = await page
    .locator(".v19-questionnaire-section-list--pinned")
    .evaluate((element) => getComputedStyle(element).display);
  expect(pinnedDisplay).toBe("none");

  const applicantBox = await applicantBar.boundingBox();
  const sectionBox = await sectionNav.boundingBox();
  const workBox = await workPanel.boundingBox();
  expect(applicantBox).not.toBeNull();
  expect(sectionBox).not.toBeNull();
  expect(workBox).not.toBeNull();

  expect(applicantBox?.y ?? 0).toBeLessThan(sectionBox?.y ?? 0);
  expect(sectionBox?.x ?? 0).toBeLessThan(workBox?.x ?? 0);

  const contentWidth = (workBox?.width ?? 0) + (sectionBox?.width ?? 0);
  expect((workBox?.width ?? 0) / contentWidth).toBeGreaterThanOrEqual(0.74);
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

  test("family upload opens the questionnaire on desktop", async ({ page }) => {
    const consoleProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 960, width: 1440 });
    await verifyFamilyCreateFlow(page, false);
    expect(consoleProblems).toEqual([]);
  });

  test("family upload opens the questionnaire on mobile", async ({ page }) => {
    const consoleProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await verifyFamilyCreateFlow(page, true);
    expect(consoleProblems).toEqual([]);
  });
});
