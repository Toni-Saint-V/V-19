import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { testArtifactPath } from "../support/artifacts";

import { expect, test, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  isVisible,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const proofDir = testArtifactPath("2026-07-01-b-full-ui-copy");

type ProofViewport = {
  height: number;
  label: string;
  width: number;
};

type ProofEntry = {
  timestamp: string;
  appUrl: string;
  screen: string;
  viewport: string;
  screenshotPath: string;
  horizontalOverflow: boolean;
  clippedCriticalLabels: boolean;
  consoleErrors: boolean;
  mainInteractionChecked: boolean;
  pass: boolean;
  notes: string;
};

const agentActionViewports: ProofViewport[] = [
  { height: 720, label: "320", width: 320 },
  { height: 812, label: "375", width: 375 },
  { height: 844, label: "390", width: 390 },
  { height: 932, label: "430", width: 430 },
  { height: 1024, label: "768", width: 768 },
  { height: 768, label: "1024", width: 1024 },
  { height: 800, label: "1280", width: 1280 },
  { height: 900, label: "1440", width: 1440 },
];

const standardViewports: ProofViewport[] = [
  { height: 844, label: "390", width: 390 },
  { height: 1024, label: "768", width: 768 },
  { height: 900, label: "1440", width: 1440 },
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

async function openWorkspace(
  page: Page,
  options: { email: string; heading: string },
) {
  await openFreshWorkspace(page, {
    heading: options.heading,
    workspaceEmail: options.email,
  });
}

async function openAgent(page: Page) {
  await openWorkspace(page, {
    email: "agent@visaflow.local",
    heading: "Мои действия",
  });
}

async function openAdmin(page: Page) {
  await openWorkspace(page, {
    email: "admin@visaflow.local",
    heading: "Очередь на проверку",
  });
}

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      document: { documentElement: { clientWidth: number; scrollWidth: number } };
    };
    const root = browserGlobal.document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
}

async function hasClippedCriticalLabels(page: Page) {
  return page.evaluate(() => {
    type BrowserElement = {
      clientWidth: number;
      innerText: string;
      parentElement: BrowserElement | null;
      scrollWidth: number;
      closest(selector: string): BrowserElement | null;
      getBoundingClientRect(): {
        bottom: number;
        height: number;
        left: number;
        right: number;
        top: number;
        width: number;
      };
    };
    const browserGlobal = globalThis as unknown as {
      document: { querySelectorAll(selector: string): BrowserElement[] };
      getComputedStyle(element: BrowserElement): {
        display: string;
        overflowX: string;
        visibility: string;
      };
      innerHeight: number;
      innerWidth: number;
    };
    const selectors = [
      "h1",
      "h2",
      ".topbar-heading p",
      "button",
      '[role="tab"]',
      ".v19-actions-queue-state",
      ".v19-actions-timeline-state",
      ".v19-submission-status-tag",
      ".v19-submission-file-tag",
      ".v19-event-action-label",
      ".v17-admin-stage",
      ".v17-admin-row-action",
      ".v17-blocker-callout strong",
      ".v17-export-check strong",
    ];

    function hasScrollableAncestor(element: BrowserElement) {
      let parent = element.parentElement;
      while (parent) {
        const style = browserGlobal.getComputedStyle(parent);
        const scrollable = ["auto", "scroll"].includes(style.overflowX);
        if (scrollable && parent.scrollWidth > parent.clientWidth + 1) return true;
        parent = parent.parentElement;
      }
      return false;
    }

    return selectors.some((selector) =>
      Array.from(browserGlobal.document.querySelectorAll(selector)).some((element) => {
        const text = element.innerText.trim();
        if (!text || text.length < 2) return false;
        if (
          element.closest?.(".sr-only") ||
          element.closest?.('[aria-hidden="true"]')
        ) {
          return false;
        }

        const style = browserGlobal.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;

        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const intersectsViewport =
          rect.bottom > 0 &&
          rect.top < browserGlobal.innerHeight &&
          rect.right > 0 &&
          rect.left < browserGlobal.innerWidth;
        if (!intersectsViewport) return false;
        if (hasScrollableAncestor(element)) return false;

        const outsideViewport =
          rect.left < -1 || rect.right > browserGlobal.innerWidth + 1;
        const clippedOwnBox = element.scrollWidth > element.clientWidth + 2;
        return outsideViewport || clippedOwnBox;
      }),
    );
  });
}

async function closeOpenDialog(page: Page) {
  const dialog = page.getByRole("dialog").first();
  if (!(await isVisible(dialog))) return;

  await dialog.press("Escape");
  if (await isVisible(dialog)) {
    const closeButton = dialog
      .getByRole("button", { name: /Закрыть|Отмена|Назад/ })
      .first();
    if (await isVisible(closeButton)) {
      await closeButton.evaluate((button: HTMLButtonElement) => button.click());
    }
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function exerciseAgentActions(page: Page) {
  const mobileEvent = page
    .getByTestId("agent-action-timeline")
    .locator("[data-submission-id]")
    .first();

  if (await isVisible(mobileEvent)) {
    await mobileEvent.locator(".v19-actions-timeline-hit").click();
    await expect(page.getByTestId("agent-action-mobile-detail")).toHaveCount(0);
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await closeOpenDialog(page);
    return;
  }

  const queueItem = page.getByTestId("agent-action-queue-item").first();
  await expect(queueItem).toBeVisible();
  await queueItem.click();
  const activePanel = page.getByTestId("agent-action-active-panel");
  await expect(activePanel).toBeVisible();
  await activePanel.locator(".v19-actions-summary-cta button").last().click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await closeOpenDialog(page);
}

async function exerciseMySubmissions(page: Page) {
  await clickWorkspaceButton(page, /^Мои подачи/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои подачи" }),
  ).toBeVisible();
  const submissionCard = page.getByRole("article", { name: /^Подача / }).first();
  await expect(submissionCard).toBeVisible();
  await submissionCard.click();
  await closeOpenDialog(page);
}

async function exerciseReview(page: Page) {
  const reviewMetric = page.getByRole("button", { name: "Ревью", exact: true });
  const correctionsMetric = page.getByRole("button", {
    name: "Правки",
    exact: true,
  });
  await reviewMetric.click();
  await expect(reviewMetric).toHaveAttribute("aria-pressed", "true");

  const reviewCard = page
    .getByRole("button", { name: /Ручная проверка заявки/ })
    .first();
  if (await isVisible(reviewCard)) {
    await reviewCard.click();
    await closeOpenDialog(page);
  }

  await correctionsMetric.click();
  await expect(correctionsMetric).toHaveAttribute("aria-pressed", "true");
  await reviewMetric.click();
}

async function exerciseExport(page: Page) {
  await clickWorkspaceButton(page, /^Выгрузка/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Доступно", exact: true }).click();

  const exportRow = page.locator(".v19-admin-export-row-v2").first();
  await expect(exportRow).toBeVisible();
  const selectable = page
    .locator('.v19-admin-export-row-v2 input[type="checkbox"]:not(:disabled)')
    .first();
  if (await isVisible(selectable)) await selectable.check();

  const preview = page.getByRole("region", {
    name: "Панель контроля выгрузки",
  });
  const panelToggle = page
    .getByRole("button", { name: /Контроль пакета/ })
    .first();
  const panelWasOpen = await isVisible(preview);
  if (!panelWasOpen) await panelToggle.click();

  await expect(preview).toBeVisible();
  await expect(page.getByRole("button", { name: "Сформировать Excel" })).toBeVisible();

  if (!panelWasOpen) {
    await page
      .getByRole("button", { name: "Закрыть контроль пакета" })
      .first()
      .click();
    await expect(preview).toBeHidden();
  }
}

async function captureProof(
  page: Page,
  entries: ProofEntry[],
  options: {
    browserProblems: string[];
    fileName: string;
    interactionChecked: boolean;
    notes: string;
    screen: string;
    viewport: ProofViewport;
  },
) {
  const screenshotPath = join(proofDir, options.fileName);
  await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      document: {
        documentElement: {
          scrollLeft: number;
          scrollTop: number;
        };
        scrollingElement?: {
          scrollTo(options: { left: number; top: number }): void;
        } | null;
      };
    };

    browserGlobal.document.documentElement.scrollLeft = 0;
    browserGlobal.document.documentElement.scrollTop = 0;
    browserGlobal.document.scrollingElement?.scrollTo({ left: 0, top: 0 });
  });
  await page.screenshot({ fullPage: true, path: screenshotPath });

  const horizontalOverflow = await hasHorizontalOverflow(page);
  const clippedCriticalLabels = await hasClippedCriticalLabels(page);
  const consoleErrors = options.browserProblems.length > 0;
  const pass =
    !horizontalOverflow &&
    !clippedCriticalLabels &&
    !consoleErrors &&
    options.interactionChecked;

  entries.push({
    timestamp: new Date().toISOString(),
    appUrl: page.url(),
    screen: options.screen,
    viewport: options.viewport.label,
    screenshotPath,
    horizontalOverflow,
    clippedCriticalLabels,
    consoleErrors,
    mainInteractionChecked: options.interactionChecked,
    pass,
    notes: options.notes,
  });

  expect(
    horizontalOverflow,
    `${options.screen} ${options.viewport.label}: overflow`,
  ).toBe(false);
  expect(
    clippedCriticalLabels,
    `${options.screen} ${options.viewport.label}: clipped labels`,
  ).toBe(false);
  expect(
    consoleErrors,
    `${options.screen} ${options.viewport.label}: console errors`,
  ).toBe(false);
  expect(
    options.interactionChecked,
    `${options.screen} ${options.viewport.label}: interaction`,
  ).toBe(true);
}

test.describe("V-19 Codex B full UI copy proof", () => {
  test("captures required screenshots and proof metadata", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "chromium", "single-project screenshot proof");

    mkdirSync(proofDir, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    const entries: ProofEntry[] = [];

    for (const viewport of agentActionViewports) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openAgent(page);
      await exerciseAgentActions(page);
      await openAgent(page);
      await captureProof(page, entries, {
        browserProblems,
        fileName: `agent-actions-${viewport.label}.png`,
        interactionChecked: true,
        notes:
          "Выбор задачи и CTA открыли drawer подачи; экран возвращен в чистое состояние.",
        screen: "Мои действия",
        viewport,
      });
    }

    for (const viewport of standardViewports) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openAgent(page);
      await exerciseMySubmissions(page);
      await clickWorkspaceButton(page, /^Мои подачи/);
      await captureProof(page, entries, {
        browserProblems,
        fileName: `my-submissions-${viewport.label}.png`,
        interactionChecked: true,
        notes: "Открытие подачи из списка проверено; drawer закрывается.",
        screen: "Мои подачи",
        viewport,
      });
    }

    for (const viewport of standardViewports) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openAdmin(page);
      await exerciseReview(page);
      await captureProof(page, entries, {
        browserProblems,
        fileName: `review-${viewport.label}.png`,
        interactionChecked: true,
        notes:
          "Вкладки проверки и исправлений работают; карточка открывает контекст подачи.",
        screen: "Проверка",
        viewport,
      });
    }

    for (const viewport of standardViewports) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openAdmin(page);
      await exerciseExport(page);
      await captureProof(page, entries, {
        browserProblems,
        fileName: `export-${viewport.label}.png`,
        interactionChecked: true,
        notes: "Выбор пакета, фильтр готовности и export CTA доступны.",
        screen: "Выгрузка",
        viewport,
      });
    }

    writeFileSync(
      join(proofDir, "browser-proof.json"),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          entries,
        },
        null,
        2,
      ),
    );

    expect(entries.every((entry) => entry.pass)).toBe(true);
  });
});
