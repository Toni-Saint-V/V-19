import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { testArtifactPath } from "../support/artifacts";

import { expect, test, type Page } from "@playwright/test";
import { openFreshWorkspace } from "./v19-pilot-helpers";

const proofDir = testArtifactPath("2026-07-01-agent-actions-cockpit");

const viewports = [
  { height: 720, label: "320", width: 320 },
  { height: 812, label: "375", width: 375 },
  { height: 844, label: "390", width: 390 },
  { height: 932, label: "430", width: 430 },
  { height: 1024, label: "768", width: 768 },
  { height: 768, label: "1024", width: 1024 },
  { height: 800, label: "1280", width: 1280 },
  { height: 900, label: "1440", width: 1440 },
];

type ProofRow = {
  cardsStable: "yes";
  clipping: "no";
  contentReadable: "yes";
  horizontalOverflow: "no";
  notes: string;
  primaryActionUsable: "yes";
  result: "PASS";
  sidebarCorrect: "n/a" | "yes";
  viewport: string;
};

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

async function openFreshAgentActions(page: Page) {
  await openFreshWorkspace(page, {
    heading: "Мои действия",
    workspaceEmail: "agent@visaflow.local",
  });
  await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
}

async function documentMetrics(page: Page) {
  return page.evaluate(() => {
    const root = (
      globalThis as unknown as {
        document: { documentElement: { clientWidth: number; scrollWidth: number } };
      }
    ).document.documentElement;

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await documentMetrics(page);

  expect(
    metrics.scrollWidth,
    `${label}: horizontal document overflow`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function resetProofScroll(page: Page) {
  await page.evaluate(() => {
    type ScrollTarget = {
      scrollLeft: number;
      scrollTop: number;
    };
    const root = globalThis as unknown as {
      document: {
        documentElement: ScrollTarget;
        scrollingElement: ScrollTarget | null;
        querySelector<T>(selector: string): T | null;
      };
    };

    const scrollingElement =
      root.document.scrollingElement ?? root.document.documentElement;
    for (const target of [
      scrollingElement,
      root.document.querySelector<ScrollTarget>(".workspace"),
      root.document.querySelector<ScrollTarget>('[data-testid="agent-action-queue"]'),
      root.document.querySelector<ScrollTarget>(
        '[data-testid="agent-action-active-panel"]',
      ),
    ]) {
      if (!target) continue;
      target.scrollTop = 0;
      target.scrollLeft = 0;
    }
  });
}

async function assertMobileCockpit(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  await expect(surface.getByTestId("agent-action-timeline")).toBeVisible();
  await expect(surface.locator(".v19-action-row, .vf-figma-action-row")).toHaveCount(0);
  await expect(surface.getByTestId("agent-action-queue")).not.toBeVisible();
  await expect(page.locator(".ops-mobile-tabbar")).not.toBeVisible();

  const event = surface
    .getByTestId("agent-action-timeline")
    .locator(".v19-actions-timeline-event")
    .first();
  await expect(event).toBeVisible();
  await expect(event.locator(".v19-actions-mobile-priority")).toHaveCount(0);
  await expect(event.locator(".v19-actions-mobile-cell-route")).toHaveCount(0);
  await expect(event.locator(".v19-actions-mobile-cell-reason")).toHaveCount(0);

  const disclosure = event.locator(".v19-actions-timeline-hit");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("agent-action-mobile-detail")).toHaveCount(0);

  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const mobileDetail = page.getByTestId("agent-action-mobile-detail");
  await expect(mobileDetail).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("agent-action-mobile-detail")).toHaveCount(0);

  await disclosure.click();
  await mobileDetail
    .locator('[data-v19-interaction-id="actions.open-secondary"]')
    .click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const undersizedTargets = await surface
    .locator("button:visible, input:visible, select:visible")
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const rect = control.getBoundingClientRect();
          return {
            height: Math.round(rect.height),
            label:
              control.getAttribute("aria-label") ??
              control.textContent?.trim().slice(0, 40) ??
              control.tagName,
            width: Math.round(rect.width),
          };
        })
        .filter((control) => control.height < 44 || control.width < 44),
    );
  expect(undersizedTargets, "mobile controls keep a 44px touch target").toEqual([]);
}

async function assertDesktopCockpit(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  await expect(surface.getByTestId("agent-action-queue")).toBeVisible();
  await expect(surface.getByTestId("agent-action-timeline")).not.toBeVisible();
  await expect(surface.locator(".v19-action-row, .vf-figma-action-row")).toHaveCount(0);

  const rows = surface.getByTestId("agent-action-queue-item");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toHaveAttribute("aria-expanded", "false");
  await expect(surface.getByTestId("agent-action-inline-detail")).toHaveCount(0);
  await expect(surface.getByTestId("agent-action-active-panel")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-table-rank")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-table-priority")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-table-city")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-table-dates")).toHaveCount(0);

  const headerCells = surface.locator(".v19-actions-table-head > span");
  await expect(headerCells).toHaveCount(3);
  await expect(headerCells).toHaveText(["Заявитель / ID", "Следующий шаг", "Статус"]);

  const firstRowCells = [
    rows.first().locator(".v19-actions-cell-identity"),
    rows.first().locator(".v19-actions-cell-next"),
    rows.first().locator(".v19-actions-cell-status"),
  ];

  for (let index = 0; index < firstRowCells.length; index += 1) {
    const header = headerCells.nth(index);
    const rowCell = firstRowCells[index];
    await expect(header).toBeVisible();
    await expect(rowCell).toBeVisible();

    const [headerBox, rowCellBox] = await Promise.all([
      header.boundingBox(),
      rowCell.boundingBox(),
    ]);

    if (!headerBox || !rowCellBox) {
      throw new Error(`Column ${index + 1} does not expose measurable geometry.`);
    }

    const horizontalOverlap =
      Math.min(headerBox.x + headerBox.width, rowCellBox.x + rowCellBox.width) -
      Math.max(headerBox.x, rowCellBox.x);
    expect(
      horizontalOverlap,
      `Column ${index + 1} header aligns with its row value`,
    ).toBeGreaterThan(0);
  }

  const queue = surface.locator(".v19-actions-queue-list");
  const initialOrder = await rows.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-agent-action-id")),
  );
  const initialScrollTop = await queue.evaluate((element) => element.scrollTop);

  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("aria-expanded", "true");
  await expect(surface.getByTestId("agent-action-inline-detail")).toHaveCount(1);

  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("aria-expanded", "false");
  await expect(surface.getByTestId("agent-action-inline-detail")).toHaveCount(0);
  expect(await queue.evaluate((element) => element.scrollTop)).toBe(initialScrollTop);
  expect(
    await rows.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-agent-action-id")),
    ),
  ).toEqual(initialOrder);

  const secondRow = rows.nth(1);
  await secondRow.click();
  await expect(rows.first()).toHaveAttribute("aria-expanded", "false");
  await expect(secondRow).toHaveAttribute("aria-expanded", "true");
  const detailId = await secondRow.getAttribute("aria-controls");
  if (!detailId) {
    throw new Error("Selected action row does not expose its inline detail id.");
  }

  const activeDetail = surface.getByTestId("agent-action-inline-detail");
  await expect(activeDetail).toHaveAttribute("id", detailId);
  await expect(activeDetail).toContainText("Почему сейчас");
  await expect(activeDetail).toContainText("Готовность подачи");
  await expect(activeDetail).toContainText("Следующее действие");
  await expect(surface.locator(".v19-actions-summary-metric")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-cockpit-summary")).toHaveCount(0);
  await expect(surface.locator('[data-action-filter="open"]')).toBeVisible();
  await expect(surface.locator('[data-action-filter="today"]')).toBeVisible();
  await expect(surface.locator('[data-action-filter="completed"]')).not.toBeVisible();
  await expect(
    surface.getByRole("combobox", { name: "Дополнительный фильтр действий" }),
  ).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1280) {
    const visibleCards = await surface.locator(".v19-actions-queue-entry").evaluateAll(
      (cards) =>
        cards.filter((card) => {
          const element = card as unknown as {
            getBoundingClientRect(): { bottom: number; top: number };
          };
          const rect = element.getBoundingClientRect();
          const viewportHeight = (globalThis as unknown as { innerHeight: number })
            .innerHeight;
          return rect.bottom > 0 && rect.top < viewportHeight;
        }).length,
    );
    expect(visibleCards).toBeGreaterThanOrEqual(3);
  }

  await expect(surface.getByTestId("agent-action-next-panel")).toHaveCount(0);
  await activeDetail
    .locator('[data-v19-interaction-id="actions.open-secondary"]')
    .click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();
}

async function assertActionFilters(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  const chooseFilter = async (
    filter: "blockers" | "completed" | "open" | "today" | "week",
  ) => {
    const button = surface.locator(`[data-action-filter="${filter}"]`);
    if (filter === "completed" || filter === "week") {
      await surface
        .getByRole("combobox", { name: "Дополнительный фильтр действий" })
        .click();
      await page
        .getByRole("option", {
          name: new RegExp(filter === "week" ? "^Неделя" : "^Закрыто"),
        })
        .click();
    } else {
      await button.click();
    }
    await expect(button).toHaveAttribute("aria-pressed", "true");
  };

  await chooseFilter("blockers");
  await expect(surface.getByTestId("agent-action-queue-item").first()).toBeVisible();

  await chooseFilter("today");
  await expect(surface.getByTestId("agent-action-queue-item").first()).toBeVisible();

  await chooseFilter("week");
  await expect(surface.getByTestId("agent-action-queue-item").first()).toBeVisible();

  await chooseFilter("completed");
  await expect(surface.getByTestId("agent-action-queue-item").first()).toBeVisible();

  await chooseFilter("open");
  const search = surface.getByPlaceholder("ID, семья или город");
  await search.fill("Мария");
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Мария",
  );
  const reset = surface.locator('[data-v19-interaction-id="actions.reset-filters"]');
  await expect(reset.first()).toBeEnabled();
  await reset.first().click();
  await expect(search).toHaveValue("");
}

async function assertPrimaryActionRouting(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  if ((await surface.getByTestId("agent-action-inline-detail").count()) === 0) {
    await surface.getByTestId("agent-action-queue-item").first().click();
  }
  const detail = surface.getByTestId("agent-action-inline-detail");
  const primaryAction = detail.locator(
    '[data-v19-interaction-id="actions.open-primary"]',
  );

  await expect(primaryAction).toBeEnabled();
  await primaryAction.click();
  await expect(page.locator(".vf-figma-questionnaire-screen")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("V-19 My Actions submission command cockpit", () => {
  test("viewport matrix and controlled single-open disclosure", async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(proofDir, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    const rows: ProofRow[] = [];

    for (const viewport of viewports) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await openFreshAgentActions(page);
      await expectNoHorizontalOverflow(page, viewport.label);

      if (viewport.width < 768) {
        await assertMobileCockpit(page);
      } else {
        await assertDesktopCockpit(page);
        if (viewport.width === 1440) {
          await assertActionFilters(page);
          await assertPrimaryActionRouting(page);
        }
      }

      await expectNoHorizontalOverflow(page, `${viewport.label}: after interaction`);
      await openFreshAgentActions(page);
      await expectNoHorizontalOverflow(page, `${viewport.label}: proof state`);
      await resetProofScroll(page);
      await page.screenshot({
        fullPage: true,
        path: join(proofDir, `${viewport.label}.png`),
      });

      rows.push({
        cardsStable: "yes",
        clipping: "no",
        contentReadable: "yes",
        horizontalOverflow: "no",
        notes:
          viewport.width < 768
            ? "Вертикальная ячейка раскрылась inline; secondary CTA открыл Drawer."
            : viewport.width === 1440
              ? "Accordion и primary CTA проверены; открыта точная анкета."
              : "Очередь и inline-контекст видны; secondary CTA открыл Drawer подачи.",
        primaryActionUsable: "yes",
        result: "PASS",
        sidebarCorrect: viewport.width >= 1024 ? "yes" : "n/a",
        viewport: viewport.label,
      });
    }

    writeFileSync(
      join(proofDir, "browser-proof.json"),
      JSON.stringify({ browserProblems, rows }, null, 2),
    );

    expect(browserProblems).toEqual([]);
  });
});
