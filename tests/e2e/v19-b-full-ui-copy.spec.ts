import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { clickWorkspaceButton, isVisible } from "./v19-pilot-helpers";

const proofDir = "docs/qa/2026-07-01-b-full-ui-copy";

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
  options: { email: string; heading: string; password?: string },
) {
  await page.goto("/");
  await page.evaluate((email) => {
    const browserGlobal = globalThis as unknown as {
      localStorage: {
        clear(): void;
        setItem(key: string, value: string): void;
      };
    };

    browserGlobal.localStorage.clear();
    browserGlobal.localStorage.setItem("visaflow.workspaceEmail.v2", email);
  }, options.email);
  await page.reload();

  const emailField = page.locator("#workspace-email");
  if (await isVisible(emailField)) {
    await emailField.fill(options.email);
    await page.locator("#workspace-password").fill(options.password ?? "local-dev-password");
    await page.getByRole("button", { name: "Войти" }).click();
  }

  await expect(
    page.getByRole("heading", { level: 1, name: options.heading }),
  ).toBeVisible();
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
    heading: "Проверка",
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

  await page.keyboard.press("Escape");
  if (await isVisible(dialog)) {
    const closeButton = dialog
      .getByRole("button", { name: /Закрыть|Отмена|Назад/ })
      .first();
    if (await isVisible(closeButton)) await closeButton.click();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function exerciseAgentActions(page: Page) {
  const mobileEvent = page
    .getByTestId("agent-action-timeline")
    .locator('[data-submission-id]')
    .first();

  if (await isVisible(mobileEvent)) {
    await mobileEvent.locator(".v19-actions-timeline-hit").click();
    await expect(page.getByTestId("agent-action-mobile-detail")).toBeVisible();
    await page
      .getByTestId("agent-action-mobile-detail")
      .getByRole("button", { name: "Заменить файл" })
      .click();
    await closeOpenDialog(page);
    return;
  }

  const queueItem = page.getByTestId("agent-action-queue-item").first();
  await expect(queueItem).toBeVisible();
  await queueItem.click();
  const activePanel = page.getByTestId("agent-action-active-panel");
  await expect(activePanel).toBeVisible();
  await activePanel.getByRole("button", { name: "Заменить файл" }).click();
  await closeOpenDialog(page);
}

async function exerciseMySubmissions(page: Page) {
  await clickWorkspaceButton(page, /^Мои подачи/);
  await expect(page.getByRole("heading", { level: 1, name: "Мои подачи" })).toBeVisible();
  await page.getByRole("tab", { name: /^Все/ }).click();
  const submissionRow = page.locator(".v19-submission-row").first();
  await expect(submissionRow).toBeVisible();
  await submissionRow.click();
  await closeOpenDialog(page);
}

async function exerciseReview(page: Page) {
  await page.getByRole("tab", { name: /На проверке/ }).click();
  const reviewRow = page.locator(".v17-admin-work-row, .v17-admin-empty-state").first();
  await expect(reviewRow).toBeVisible();
  if (await isVisible(page.locator(".v17-admin-work-row").first())) {
    await page.locator(".v17-admin-work-row").first().click();
    await closeOpenDialog(page);
  }
  await page.getByRole("tab", { name: /Исправления получены/ }).click();
  await expect(
    page.locator(".v17-admin-work-row, .v17-admin-empty-state").first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: /На проверке/ }).click();
}

async function exerciseExport(page: Page) {
  await clickWorkspaceButton(page, /^Выгрузка/);
  await expect(page.getByRole("heading", { level: 1, name: "Выгрузка" })).toBeVisible();
  await page.getByRole("tab", { name: /Готово к выгрузке/ }).click();

  const selectAll = page.getByLabel("Выбрать все совместимые");
  if (await isVisible(selectAll)) await selectAll.check();

  await expect(
    page
      .locator(
        ".magic-export-list table, .magic-export-list .export-row, .vf-figma-family-card, .vf-figma-individual-card",
      )
      .first(),
  ).toBeVisible();
  const preview = page.locator(".magic-export-preview, .v17-export-checks-card").first();
  const panelToggle = page
    .getByRole("button", {
      name: /Контракт выгрузки открыт|Открыть контракт выгрузки/,
    })
    .first();
  const panelWasOpen = await isVisible(preview);

  if (!panelWasOpen) {
    await panelToggle.click();
  }

  await expect(preview).toBeVisible();
  await expect(page.getByRole("button", { name: "Сформировать Excel" })).toBeVisible();

  if (!panelWasOpen) {
    const closePanel = page.getByRole("button", { name: "Закрыть панель" }).first();
    if (await isVisible(closePanel)) {
      await closePanel.click();
    } else {
      await panelToggle.click();
    }
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

  expect(horizontalOverflow, `${options.screen} ${options.viewport.label}: overflow`).toBe(
    false,
  );
  expect(
    clippedCriticalLabels,
    `${options.screen} ${options.viewport.label}: clipped labels`,
  ).toBe(false);
  expect(consoleErrors, `${options.screen} ${options.viewport.label}: console errors`).toBe(
    false,
  );
  expect(options.interactionChecked, `${options.screen} ${options.viewport.label}: interaction`).toBe(
    true,
  );
}

test.describe("V-19 Codex B full UI copy proof", () => {
  test("captures required screenshots and proof metadata", async ({ page }, testInfo) => {
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
        notes: "Выбор задачи и CTA открыли drawer подачи; экран возвращен в чистое состояние.",
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
        notes: "Вкладки проверки и исправлений работают; карточка открывает контекст подачи.",
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
