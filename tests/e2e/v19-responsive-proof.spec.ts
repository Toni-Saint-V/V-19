import { mkdirSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickWorkspaceButton, openFreshWorkspace } from "./v19-pilot-helpers";
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
  { height: 932, label: "430", width: 430 },
  { height: 844, label: "390", width: 390 },
  { height: 812, label: "375", width: 375 },
  {
    height: 800,
    label: "360",
    maxCreateInnerOverflowPx: 10,
    width: 360,
  },
  {
    height: 720,
    label: "320",
    maxCreateInnerOverflowPx: 10,
    width: 320,
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
  const activeAgentSurface = page.locator(
    '[data-testid="agent-screen-transition"]:visible',
  );
  if ((await activeAgentSurface.count()) > 0) {
    await expect
      .poll(
        () =>
          activeAgentSurface.first().evaluate((element) => {
            const style = getComputedStyle(element);
            const transform = new DOMMatrixReadOnly(style.transform);
            return (
              Number.parseFloat(style.opacity || "0") >= 0.99 &&
              Math.abs(transform.m41) <= 0.1 &&
              Math.abs(transform.m42) <= 0.1
            );
          }),
        { message: `${name}: agent screen transition is visually settled` },
      )
      .toBe(true);
  }

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
  await clickWorkspaceButton(page, name);
  const backdrop = page.locator(".ops-mobile-menu-backdrop").first();

  if ((await backdrop.count()) > 0) {
    await expect
      .poll(async () => {
        if ((await backdrop.count()) === 0) return 0;
        return backdrop.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).opacity || "0"),
        );
      })
      .toBeLessThanOrEqual(0.03);
  }
}

async function expectSettingsReady(page: Page) {
  await expect(
    page.getByRole("heading", { level: 2, name: "Интерфейс и помощники" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Компактная плотность" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "AI-контекст в работе" }),
  ).toBeVisible();
}

async function expectCreateStageRhythm(page: Page, context: string) {
  const operational = page.locator(
    '[data-agent-screen="create"] .v19-preupload-operational-card',
  );
  const upload = page.locator(
    '[data-agent-screen="create"] .v19-preupload-upload-panel',
  );
  await expect(operational).toBeVisible();
  await expect(upload).toBeVisible();

  const [operationalBox, uploadBox] = await Promise.all([
    operational.boundingBox(),
    upload.boundingBox(),
  ]);
  expect(operationalBox, `${context}: operational stage geometry`).not.toBeNull();
  expect(uploadBox, `${context}: upload stage geometry`).not.toBeNull();

  const gap = uploadBox!.y - (operationalBox!.y + operationalBox!.height);
  expect(gap, `${context}: adjacent create stage gap`).toBeGreaterThanOrEqual(0);
  expect(gap, `${context}: adjacent create stage gap`).toBeLessThanOrEqual(24);
  await expect(page.locator("#preupload-disabled-reason")).toBeVisible();
}

async function expectMobileActionDensity(page: Page, context: string) {
  const cards = page.locator(
    '[data-agent-screen="actions"] .v19-actions-timeline-event:visible',
  );
  await expect(cards).toHaveCount(8);
  await expect(
    page.locator('[data-agent-screen="actions"] .v19-actions-timeline-node:visible'),
  ).toHaveCount(0);
  await expect(
    page.locator(
      '[data-agent-screen="actions"] .v19-agent-action-status-button > svg:visible',
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(
      '[data-agent-screen="actions"] .v19-agent-action-status-more > svg:first-child:visible',
    ),
  ).toHaveCount(0);

  const viewport = page.viewportSize();
  expect(viewport, `${context}: viewport`).not.toBeNull();
  const firstThree = await cards.evaluateAll((elements) =>
    elements.slice(0, 3).map((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, top: rect.top };
    }),
  );
  expect(firstThree, `${context}: first three action cards`).toHaveLength(3);
  for (const [index, box] of firstThree.entries()) {
    expect(box.top, `${context}: action card ${index + 1} top`).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      box.bottom,
      `${context}: action card ${index + 1} fits first viewport`,
    ).toBeLessThanOrEqual(viewport!.height + 1);
  }

  const nextStepStyle = await cards
    .first()
    .locator(".v19-actions-mobile-next")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
        borderRightWidth: style.borderRightWidth,
      };
    });
  expect(nextStepStyle, `${context}: next step is not a nested card`).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    borderRightWidth: "0px",
  });
}

async function expectSettingsPanelsDoNotOverlap(page: Page, context: string) {
  const panels = page.locator(
    ".v19-system-settings.is-agent-workstation .v19-settings-grid > *",
  );
  await expect(panels).toHaveCount(2);
  const boxes = await panels.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    }),
  );
  const horizontalSeparation =
    boxes[0].right <= boxes[1].left + 1 || boxes[1].right <= boxes[0].left + 1;
  const verticalSeparation =
    boxes[0].bottom <= boxes[1].top + 1 || boxes[1].bottom <= boxes[0].top + 1;
  expect(
    horizontalSeparation || verticalSeparation,
    `${context}: settings panels do not overlap`,
  ).toBe(true);
}

async function expectQuestionnaireFooterClear(page: Page, context: string) {
  const scroll = page.locator(".v19-questionnaire-scroll");
  const fields = page.locator(".v19-questionnaire-field-cell:visible");
  const footer = page.locator(".v19-questionnaire-mobile-footer:visible");
  await expect(scroll).toBeVisible();
  await expect(fields.first()).toBeVisible();
  await expect(footer).toBeVisible();

  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  const [lastFieldBox, footerBox] = await Promise.all([
    fields.last().boundingBox(),
    footer.boundingBox(),
  ]);
  expect(lastFieldBox, `${context}: last questionnaire field`).not.toBeNull();
  expect(footerBox, `${context}: questionnaire footer`).not.toBeNull();
  expect(
    lastFieldBox!.y + lastFieldBox!.height,
    `${context}: footer does not cover last questionnaire field`,
  ).toBeLessThanOrEqual(footerBox!.y + 1);
}

async function expectElementStartsAbove(
  page: Page,
  locator: Locator,
  maxTop: number,
  context: string,
) {
  await expect(locator, context).toBeVisible();
  const box = await locator.boundingBox();

  expect(box, `${context}: bounding box`).not.toBeNull();
  expect(box!.y, `${context}: top position`).toBeLessThanOrEqual(maxTop);
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

async function expectMobileSheetKeyboardContract(
  page: Page,
  {
    closeName,
    dialogName,
    toggleName,
  }: {
    closeName: string;
    dialogName: string;
    toggleName: RegExp;
  },
) {
  const toggle = page.getByRole("button", { name: toggleName }).first();
  if (!(await toggle.isVisible())) return;

  await toggle.focus();
  await toggle.press("Enter");

  const dialog = page.getByRole("dialog", { name: dialogName });
  const closeButton = dialog.getByRole("button", { name: closeName });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      dialog.evaluate((element) =>
        element.contains(element.ownerDocument.activeElement),
      ),
    )
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(toggle).toBeFocused();
}

async function expectModalDeactivatesAcrossBreakpoint(
  page: Page,
  {
    desktopViewport,
    dialogName,
    mobileViewport,
    toggleName,
  }: {
    desktopViewport: { height: number; width: number };
    dialogName: string;
    mobileViewport: { height: number; width: number };
    toggleName: RegExp;
  },
) {
  const toggle = page.getByRole("button", { name: toggleName }).first();
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await toggle.press("Enter");

  const rail = page.locator(`aside[aria-label="${dialogName}"]`);
  await expect(rail).toHaveAttribute("role", "dialog");
  await expect(rail).toHaveAttribute("aria-modal", "true");

  await page.setViewportSize(desktopViewport);
  await expect(rail).not.toHaveAttribute("role", "dialog");
  await expect(rail).not.toHaveAttribute("aria-modal", "true");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement && active.getClientRects().length > 0;
      }),
    )
    .toBe(true);

  await page.setViewportSize(mobileViewport);
  await expect(rail).not.toHaveAttribute("role", "dialog");
  await expect(toggle).toBeVisible();
}

test.describe("V-19 responsive proof", () => {
  test("primary workflows satisfy the responsive contract at locked viewports", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
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
      if (viewport.width < 768) {
        await expectMobileActionDensity(page, `${viewport.label}: agent actions`);
      }
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
      await expectCreateStageRhythm(page, viewport.label);
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
      const openQuestionnaire = dialog
        .getByRole("button", { name: "Открыть анкету" })
        .first();
      await expect(openQuestionnaire).toBeVisible();
      await openQuestionnaire.click();
      const questionnaire = page.locator(".vf-figma-questionnaire-screen");
      await expect(questionnaire).toBeVisible();
      await expect(
        questionnaire.getByRole("heading", {
          level: 1,
          name: /^Анкета:/,
        }),
      ).toBeVisible();
      await expect(
        questionnaire.locator(".v19-questionnaire-progress-shimmer"),
      ).toHaveCount(0);
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: questionnaire`,
      );
      await screenshot(page, viewport, "questionnaire");
      if (viewport.width < 768) {
        await expectQuestionnaireFooterClear(page, `${viewport.label}: questionnaire`);
      }
      await questionnaire.getByRole("button", { name: "Назад" }).click();
      await expect(questionnaire).toHaveCount(0);
      await expect(dialog).toBeVisible();
      const overviewTab = dialog.getByRole("tab", {
        exact: true,
        name: "Обзор",
      });
      await overviewTab.click();
      await expect(overviewTab).toHaveAttribute("aria-selected", "true");
      const overviewPanel = dialog.locator(
        '#submission-drawer-panel-overview[role="tabpanel"]',
      );
      await expect(overviewPanel).toBeVisible();
      await expect
        .poll(() =>
          overviewPanel.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).opacity || "0"),
          ),
        )
        .toBeGreaterThanOrEqual(0.99);
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
      await expectSettingsPanelsDoNotOverlap(page, `${viewport.label}: agent settings`);
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
      await expectMobileSheetKeyboardContract(page, {
        closeName: "Закрыть контекст проверки",
        dialogName: "Контекст проверки",
        toggleName: /^Контекст проверки/,
      });
      if (viewport.width === 768) {
        await expectModalDeactivatesAcrossBreakpoint(page, {
          desktopViewport: { height: 768, width: 1024 },
          dialogName: "Контекст проверки",
          mobileViewport: { height: viewport.height, width: viewport.width },
          toggleName: /^Контекст проверки/,
        });
      }

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

      await clickOperationalNav(page, /^Пользователи/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Пользователи и доступ",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Заявки и роли" }),
      ).toBeVisible();
      await expectElementStartsAbove(
        page,
        page.locator(".v19-access-board"),
        Math.floor(viewport.height * 0.5),
        `${viewport.label}: admin access controls`,
      );
      const allAccessRequests = page.getByRole("tab", { name: /^Все/ }).first();
      const pendingAccessRequests = page.getByRole("tab", { name: /^Ожидают/ }).first();
      if (viewport.width > 767) {
        const allMetric = page.getByRole("button", { exact: true, name: "Всего" });
        await allMetric.click();
        await expect(allMetric).toHaveAttribute("aria-pressed", "true");
        await expect(allAccessRequests).toHaveAttribute("aria-selected", "true");

        const pendingMetric = page.getByRole("button", {
          exact: true,
          name: "Ожидают",
        });
        await pendingMetric.click();
        await expect(pendingMetric).toHaveAttribute("aria-pressed", "true");
        await expect(pendingAccessRequests).toHaveAttribute("aria-selected", "true");
      } else {
        await allAccessRequests.click();
        await expect(allAccessRequests).toHaveAttribute("aria-selected", "true");
        await pendingAccessRequests.click();
        await expect(pendingAccessRequests).toHaveAttribute("aria-selected", "true");
      }
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: admin users`);
      await screenshot(page, viewport, "admin-users");

      await clickOperationalNav(page, /^Настройки/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Настройки" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Интерфейс и доступность",
        }),
      ).toBeVisible();
      await expectElementStartsAbove(
        page,
        page.locator(".v19-settings-grid"),
        280,
        `${viewport.label}: admin workstation controls`,
      );
      const contrastSwitch = page.getByRole("switch", {
        name: "Повышенный контраст",
      });
      const initialContrast = await contrastSwitch.getAttribute("aria-checked");
      await contrastSwitch.click();
      await expect(contrastSwitch).toHaveAttribute(
        "aria-checked",
        initialContrast === "true" ? "false" : "true",
      );
      await contrastSwitch.click();
      await expect(contrastSwitch).toHaveAttribute(
        "aria-checked",
        initialContrast ?? "false",
      );
      const preferenceSwitches = page.getByRole("switch");
      for (let index = 0; index < (await preferenceSwitches.count()); index += 1) {
        const target = preferenceSwitches.nth(index);
        const box = await target.boundingBox();
        expect(box, `${viewport.label}: preference target ${index}`).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      if (viewport.width === 1440) {
        const preferenceRow = page.locator(".v19-preference-row").first();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect
          .poll(() =>
            preferenceRow.evaluate((element) => {
              const durations = getComputedStyle(element)
                .transitionDuration.split(",")
                .map((value) => value.trim())
                .map((value) =>
                  value.endsWith("ms")
                    ? Number.parseFloat(value)
                    : Number.parseFloat(value) * 1_000,
                );
              return Math.max(...durations);
            }),
          )
          .toBeLessThanOrEqual(0.011);
        await page.emulateMedia({ reducedMotion: "no-preference" });

        const motionSwitch = page.getByRole("switch", {
          name: "Минимум анимации",
        });
        await motionSwitch.click();
        await expect(motionSwitch).toHaveAttribute("aria-checked", "true");
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.dataset.v19ReducedMotion),
          )
          .toBe("on");
        await expect
          .poll(() =>
            preferenceRow.evaluate((element) => {
              const durations = getComputedStyle(element)
                .transitionDuration.split(",")
                .map((value) => value.trim())
                .map((value) =>
                  value.endsWith("ms")
                    ? Number.parseFloat(value)
                    : Number.parseFloat(value) * 1_000,
                );
              return Math.max(...durations);
            }),
          )
          .toBeLessThanOrEqual(0.011);
        await motionSwitch.click();
        await expect(motionSwitch).toHaveAttribute("aria-checked", "false");
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.dataset.v19ReducedMotion),
          )
          .toBe("off");
        await expect
          .poll(() =>
            motionSwitch.locator("span").evaluate((element) => {
              const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
              return matrix.m41;
            }),
          )
          .toBe(0);
      }
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: admin settings`,
      );
      await screenshot(page, viewport, "admin-settings");

      await clickOperationalNav(page, /^Выгрузка/);
      await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: export`);
      await expectMobileSheetKeyboardContract(page, {
        closeName: "Закрыть контроль пакета",
        dialogName: "Контроль пакета",
        toggleName: /^Контроль пакета/,
      });
      if (viewport.width === 1024) {
        await expectModalDeactivatesAcrossBreakpoint(page, {
          desktopViewport: { height: 800, width: 1280 },
          dialogName: "Контроль пакета",
          mobileViewport: { height: viewport.height, width: viewport.width },
          toggleName: /^Контроль пакета/,
        });
      }
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
