import { mkdirSync } from "node:fs";

import { type Locator, type Page } from "@playwright/test";
import { openFreshWorkspace } from "./v19-pilot-helpers";
import { expect, test } from "./v19-localhost-test";
import { testRunArtifactPath } from "../support/artifacts";

type ViewportProof = {
  height: number;
  label: string;
  maxCreateInnerOverflowPx?: number;
  width: number;
};

const responsiveEvidenceRoot = testRunArtifactPath("responsive-proof");

const responsiveViewports: ViewportProof[] = [
  { height: 900, label: "1440", width: 1440 },
  { height: 768, label: "1024", width: 1024 },
  { height: 1024, label: "768", width: 768 },
  { height: 844, label: "390", width: 390 },
  { height: 812, label: "375", width: 375 },
  {
    height: 800,
    label: "360",
    maxCreateInnerOverflowPx: 10,
    width: 360,
  },
];

function collectBrowserProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

async function expectNoHorizontalDocumentOverflow(page: Page, context: string) {
  const metrics = await page.evaluate(() => {
    const browserDocument = (
      globalThis as unknown as {
        document: { documentElement: { clientWidth: number; scrollWidth: number } };
      }
    ).document;
    const root = browserDocument.documentElement;

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });

  expect(metrics.scrollWidth, context).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectCreateContentFitsWithinOverflowBudget(
  page: Page,
  context: string,
  maxOverflowPx = 1,
) {
  const body = page.locator('[data-agent-screen="create"] .v19-preupload-card-body');
  await expect(body, `${context}: create content body`).toBeVisible();
  const metrics = await body.evaluate((element) => {
    const card = element.closest<HTMLElement>(".v19-preupload-card");
    const rect = card?.getBoundingClientRect();
    const ancestors: Array<{
      className: string;
      height: number;
      top: number;
    }> = [];
    let ancestor = card?.parentElement;
    while (ancestor && ancestors.length < 6) {
      const ancestorRect = ancestor.getBoundingClientRect();
      ancestors.push({
        className: ancestor.className,
        height: ancestorRect.height,
        top: ancestorRect.top,
      });
      ancestor = ancestor.parentElement;
    }
    return {
      ancestors,
      bodyClientHeight: element.clientHeight,
      bodyScrollHeight: element.scrollHeight,
      cardBottom: rect?.bottom ?? 0,
      cardHeight: rect?.height ?? 0,
      cardTop: rect?.top ?? 0,
    };
  });
  const overflowPx = Math.max(0, metrics.bodyScrollHeight - metrics.bodyClientHeight);
  expect(
    overflowPx,
    `${context}: create content inner overflow ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(maxOverflowPx);
}

async function expectAgentNoDocumentScroll(page: Page, context: string) {
  const metrics = await page.evaluate(() => {
    const browserDocument = (
      globalThis as unknown as {
        document: {
          documentElement: {
            clientHeight: number;
            clientWidth: number;
            scrollHeight: number;
            scrollWidth: number;
          };
          scrollingElement?: {
            clientHeight: number;
            scrollHeight: number;
          } | null;
        };
      }
    ).document;
    const scrolling =
      browserDocument.scrollingElement ?? browserDocument.documentElement;

    return {
      clientHeight: scrolling.clientHeight,
      clientWidth: browserDocument.documentElement.clientWidth,
      scrollHeight: scrolling.scrollHeight,
      scrollWidth: browserDocument.documentElement.scrollWidth,
    };
  });

  expect(
    metrics.scrollWidth,
    `${context}: horizontal document overflow`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(
    metrics.scrollHeight,
    `${context}: vertical document scroll`,
  ).toBeLessThanOrEqual(metrics.clientHeight + 1);
}

async function expectDrawerFitsViewport(
  page: Page,
  context: string,
  closeButtonName = "Закрыть подачу",
): Promise<{ closeButton: Locator; dialog: Locator }> {
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  const closeButton = dialog.getByRole("button", { name: closeButtonName }).first();
  await expect(closeButton).toBeVisible();

  const viewport = page.viewportSize();

  expect(viewport, `${context}: viewport`).not.toBeNull();
  await expect
    .poll(
      async () => {
        const box = await dialog.boundingBox();
        if (!box) return false;

        return (
          box.x >= -1 &&
          box.y >= -1 &&
          box.x + box.width <= viewport!.width + 1 &&
          box.y + box.height <= viewport!.height + 1
        );
      },
      { message: `${context}: drawer settles within the viewport` },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const box = await closeButton.boundingBox();
        if (!box) return false;

        return (
          box.x >= -1 &&
          box.y >= -1 &&
          box.x + box.width <= viewport!.width + 1 &&
          box.y + box.height <= viewport!.height + 1
        );
      },
      { message: `${context}: close control stays within the viewport` },
    )
    .toBe(true);

  return { closeButton, dialog };
}

async function screenshot(page: Page, viewport: ViewportProof, name: string) {
  mkdirSync(responsiveEvidenceRoot, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: testRunArtifactPath(
      "responsive-proof",
      `v19-responsive-${viewport.width}x${viewport.height}-${name}.png`,
    ),
  });
}

async function clickOperationalNav(page: Page, name: RegExp) {
  const buttons = page.getByRole("button", { name });
  const buttonCount = await buttons.count();

  for (let index = 0; index < buttonCount; index += 1) {
    const candidate = buttons.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }

  await page.getByRole("button", { name: "Меню" }).click();
  await page.getByRole("button", { name }).first().click();
}

async function expectSettingsReady(page: Page) {
  await expect(
    page.getByRole("heading", { level: 2, name: "Системные настройки" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Компактная плотность" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "AI-контекст в работе" }),
  ).toBeVisible();
}

async function selectAdminReviewLane(page: Page, name: "Ревью" | "Правки") {
  const lane = page.getByRole("button", { name, exact: true });

  await expect(lane).toBeVisible({ timeout: 5_000 });
  await lane.click();
  await expect(lane).toHaveAttribute("aria-pressed", "true");
}

async function selectReadyExportPackage(page: Page) {
  const packageCheckbox = page.getByRole("checkbox", { name: /^Выбрать / }).first();

  await expect(packageCheckbox).toBeEnabled();
  await packageCheckbox.check();
  await expect(packageCheckbox).toBeChecked();

  const controlRail = page.locator('aside[aria-label="Контроль пакета"]');
  if (!(await controlRail.isVisible())) {
    const controlToggle = page
      .getByRole("button", { name: /^Контроль пакета/ })
      .first();
    await expect(controlToggle).toBeVisible();
    await controlToggle.click();
  }

  await expect(controlRail).toBeVisible();
  return controlRail
    .locator("button")
    .filter({ hasText: /^Сформировать\s+Excel$/ })
    .first();
}

test.describe("V-19 responsive proof", () => {
  test("primary workflows satisfy the responsive contract at locked viewports", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "chromium", "single-project viewport proof");

    const problems = collectBrowserProblems(page);

    for (const viewport of responsiveViewports) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });

      await openFreshWorkspace(page);
      await expect(
        page.locator(".ops-nav").getByRole("button", { name: "Выгрузка" }),
      ).toHaveCount(0);
      await expect(
        page.locator(".ops-nav").getByRole("button", { name: /^Проверка/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "Мои действия" }),
      ).toBeVisible();
      await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
      await expectAgentNoDocumentScroll(page, `${viewport.label}: agent actions`);
      await screenshot(page, viewport, "agent-actions");

      await clickOperationalNav(page, /^Мои подачи/);
      await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
      await expect(page.locator('[data-agent-screen="submissions"]')).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Новая подача" }).first(),
      ).toBeVisible();
      await expectAgentNoDocumentScroll(page, `${viewport.label}: agent submissions`);
      await screenshot(page, viewport, "agent-submissions");

      await page.getByRole("button", { name: "Новая подача" }).first().click();
      const createWorkspace = page.locator('[data-agent-screen="create"]');
      await expect(createWorkspace).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "Новая подача" }),
      ).toBeVisible();
      await expect(createWorkspace.getByTestId("preupload-workspace")).toBeVisible();
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: create workspace`,
      );
      await expectCreateContentFitsWithinOverflowBudget(
        page,
        viewport.label,
        viewport.maxCreateInnerOverflowPx,
      );
      await screenshot(page, viewport, "create-submission-workspace");

      await createWorkspace.getByLabel("Город подачи").click();
      await page.getByRole("option", { exact: true, name: "Казань" }).click();
      await page.getByRole("button", { name: "Отменить создание подачи" }).click();
      const exitConfirmation = page.getByRole("alertdialog", {
        name: "Выйти без сохранения?",
      });
      await expect(exitConfirmation).toBeVisible();
      await exitConfirmation
        .getByRole("button", { name: "Вернуться к редактированию" })
        .click();
      await expect(createWorkspace).toBeVisible();
      await expect(createWorkspace.getByLabel("Город подачи")).toContainText("Казань");
      await page.getByRole("button", { name: "Отменить создание подачи" }).click();
      await page
        .getByRole("alertdialog", { name: "Выйти без сохранения?" })
        .getByRole("button", { name: "Выйти без сохранения" })
        .click();
      await expect(createWorkspace).toHaveCount(0);
      await expect(page.locator('[data-agent-screen="submissions"]')).toBeVisible();

      const submissionRow = page
        .locator('[data-agent-screen="submissions"]')
        .locator(".v19-agent-shared-card[data-submission-id]")
        .first();
      await expect(submissionRow).toBeVisible();
      await submissionRow.press("Enter");
      const { closeButton, dialog } = await expectDrawerFitsViewport(
        page,
        `${viewport.label}: submission drawer`,
      );
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: drawer`);
      const questionnaireTab = dialog.getByRole("tab", {
        exact: true,
        name: "Анкета",
      });
      await questionnaireTab.click();
      await expect(questionnaireTab).toHaveAttribute("aria-selected", "true");
      const overviewTab = dialog.getByRole("tab", {
        exact: true,
        name: "Обзор",
      });
      await overviewTab.click();
      await expect(overviewTab).toHaveAttribute("aria-selected", "true");
      await screenshot(page, viewport, "submission-drawer");
      await closeButton.click();
      await expect(dialog).toHaveCount(0);

      await clickOperationalNav(page, /^Настройки/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Настройки" }),
      ).toBeVisible();
      await expectSettingsReady(page);
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: agent settings`,
      );
      await screenshot(page, viewport, "agent-settings");

      await openFreshWorkspace(page, {
        heading: /^(Очередь на проверку|Проверка)$/,
        workspaceEmail: "admin@visaflow.local",
      });
      await expect(
        page.locator(".ops-nav").getByRole("button", { name: "Мои подачи" }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Новая подача" })).toHaveCount(0);
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: admin review`);
      await screenshot(page, viewport, "admin-review");

      await selectAdminReviewLane(page, "Ревью");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /^(Очередь на проверку|Проверка)$/,
        }),
      ).toBeVisible();
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: admin review tab`,
      );
      await screenshot(page, viewport, "admin-review-tab");

      await selectAdminReviewLane(page, "Правки");
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: admin corrections tab`,
      );
      await screenshot(page, viewport, "admin-corrections-tab");

      await selectAdminReviewLane(page, "Ревью");
      await expect(page.locator(".v19-admin-review-card").first()).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /^(Очередь на проверку|Проверка)$/,
        }),
      ).toBeVisible();
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: admin review filter`,
      );
      await screenshot(page, viewport, "admin-review-filter");

      await selectAdminReviewLane(page, "Правки");
      await expect(page.locator(".v19-admin-review-card").first()).toBeVisible();
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: admin corrections filter`,
      );
      await screenshot(page, viewport, "admin-corrections-filter");

      await clickOperationalNav(page, /^Выгрузка/);
      await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: export`);
      const generateButton = await selectReadyExportPackage(page);
      await generateButton.scrollIntoViewIfNeeded();
      await expect(generateButton).toBeEnabled();
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: selected export`,
      );
      await screenshot(page, viewport, "export");
    }

    expect(problems).toEqual([]);
  });
});
