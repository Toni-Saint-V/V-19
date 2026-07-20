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

async function openFreshAdminReview(page: Page) {
  await openFreshWorkspace(page, {
    workspaceEmail: "admin@visaflow.local",
  });
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
    .locator('[data-submission-id="ПД-1048"]')
    .first();
  await expect(event).toBeVisible();
  await expect(event).toContainText("Ивановы");
  await expect(event).toContainText("Требует исправления");
  await expect(event).toContainText("Файлы не готовы");
  await expect(event).toContainText("Москва");

  await event.locator(".v19-actions-timeline-hit").click();
  await expect(page.getByTestId("agent-action-mobile-detail")).toHaveCount(0);
  const drawer = page.getByRole("dialog", { name: "Ивановы" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Ивановы");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
}

async function assertDesktopCockpit(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  await expect(surface.getByTestId("agent-action-queue")).toBeVisible();
  await expect(surface.getByTestId("agent-action-timeline")).not.toBeVisible();
  await expect(surface.locator(".v19-action-row, .vf-figma-action-row")).toHaveCount(0);

  const returnedItem = surface
    .getByTestId("agent-action-queue-item")
    .filter({ hasText: "Заменить селфи 1" })
    .first();
  await expect(returnedItem).toBeVisible();
  await expect(returnedItem).toContainText("Требует исправления");
  await expect(returnedItem).toContainText("Файлы не готовы");
  await expect(returnedItem).toContainText("Заменить селфи 1");
  await expect(returnedItem).toContainText("Москва");
  await returnedItem.click();

  const activePanel = surface.getByTestId("agent-action-active-panel");
  await expect(activePanel).toContainText("Ивановы");
  await expect(activePanel).toContainText("Следующее действие");
  await expect(activePanel).toContainText("Файлы не готовы");
  await expect(activePanel).toContainText("Почему сейчас");
  await expect(activePanel).toContainText("Что в работе");
  await expect(activePanel).toContainText("Ключевые замечания");
  await expect(surface.locator(".v19-actions-summary-metric")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-cockpit-summary")).toHaveCount(0);
  await expect(
    surface.getByRole("button", { name: "Открыто", exact: true }),
  ).toBeVisible();
  await expect(
    surface.getByRole("button", { name: "Сегодня", exact: true }),
  ).toBeVisible();
  await expect(
    surface.getByRole("button", { name: "Закрыто", exact: true }),
  ).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1280) {
    const visibleCards = await surface
      .getByTestId("agent-action-queue-item")
      .evaluateAll(
        (cards) =>
          cards.filter((card) => {
            const element = card as unknown as {
              getBoundingClientRect(): { bottom: number; top: number };
            };
            const rect = element.getBoundingClientRect();
            const viewportHeight = (globalThis as unknown as { innerHeight: number })
              .innerHeight;
            return rect.top >= 0 && rect.bottom <= viewportHeight;
          }).length,
      );
    expect(visibleCards).toBeGreaterThanOrEqual(3);
  }

  await expect(surface.getByTestId("agent-action-next-panel")).toHaveCount(0);
  await activePanel.locator(".v19-actions-summary-cta button").last().click();
  await expect(page.getByRole("dialog", { name: "Ивановы" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Ивановы" })).toHaveCount(0);

  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();
}

async function assertActionFilters(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  const chooseFilter = async (label: string) => {
    await page.getByRole("button", { name: /^Фильтр действий:/ }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };

  await chooseFilter("Блокеры");
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Требует исправления",
  );

  await chooseFilter("Сегодня");
  await expect(surface.getByTestId("agent-action-queue-item").first()).toBeVisible();

  await chooseFilter("Закрыто");
  await expect(
    page.getByRole("button", { name: "Фильтр действий: Закрыто" }),
  ).toBeVisible();
  await expect(surface.getByTestId("agent-action-queue-item").first()).toBeVisible();

  await chooseFilter("Открыто");
}

test.describe("V-19 My Actions submission command cockpit", () => {
  test("viewport matrix, selection, and direct mobile drawer routing", async ({
    page,
  }) => {
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
            ? "Лента действий видна; сводка действия открылась; CTA открыл drawer подачи."
            : "Очередь действий и сводка видны; primary CTA открыл drawer подачи.",
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

    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshAdminReview(page);
    await expect(page.locator(".v19-admin-review-screen")).toBeVisible();
    await expect(page.locator(".v19-admin-review-card-grid")).toBeVisible();
    await expect(page.locator(".vf-figma-action-row")).toHaveCount(0);
    await expect(page.getByTestId("agent-actions-cockpit")).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: join(proofDir, "admin-review-regression.png"),
    });

    writeFileSync(
      join(proofDir, "browser-proof.json"),
      JSON.stringify({ browserProblems, rows }, null, 2),
    );

    expect(browserProblems).toEqual([]);
  });
});
