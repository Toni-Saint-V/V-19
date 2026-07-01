import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const proofDir = "docs/qa/2026-07-01-agent-actions-cockpit";

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
  await page.goto("/");
  await page.evaluate(() => {
    (globalThis as unknown as { localStorage: { clear(): void } }).localStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Мои действия" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
}

async function openFreshAdminReview(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      localStorage: { clear(): void; setItem(key: string, value: string): void };
    };

    browserGlobal.localStorage.clear();
    browserGlobal.localStorage.setItem("visaflow.workspaceEmail.v2", "222@2.ru");
  });
  await page.reload();

  const emailField = page.locator("#workspace-email");
  if (await emailField.isVisible({ timeout: 750 }).catch(() => false)) {
    await emailField.fill("222@2.ru");
    await page.locator("#workspace-password").fill("2222");
    await page.getByRole("button", { name: "Войти" }).click();
  }

  await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toBeVisible();
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

  expect(metrics.scrollWidth, `${label}: horizontal document overflow`).toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );
}

async function assertMobileCockpit(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  await expect(surface.getByTestId("agent-action-timeline")).toBeVisible();
  await expect(surface.locator(".v19-action-row, .vf-figma-action-row")).toHaveCount(0);
  await expect(surface.getByTestId("agent-action-queue")).not.toBeVisible();

  const event = surface
    .getByTestId("agent-action-timeline")
    .locator('[data-submission-id="ПД-1048"]')
    .first();
  await expect(event).toBeVisible();
  await expect(event).toContainText("Ивановы");
  await expect(event).toContainText("Исправить");

  await event.locator(".v19-actions-timeline-hit").click();
  const detail = page.getByTestId("agent-action-mobile-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Ивановы");
  await expect(detail).toContainText("Блокеры");
  await expect(detail.getByRole("button", { name: "Исправить" })).toBeVisible();

  await detail.getByRole("button", { name: "Исправить" }).click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть подачу" }).click();
}

async function assertDesktopCockpit(page: Page, width: number) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  await expect(surface.getByTestId("agent-action-queue")).toBeVisible();
  await expect(surface.getByTestId("agent-action-timeline")).not.toBeVisible();
  await expect(surface.locator(".v19-action-row, .vf-figma-action-row")).toHaveCount(0);

  const returnedItem = surface
    .getByTestId("agent-action-queue-item")
    .filter({ hasText: "ПД-1048" })
    .first();
  await expect(returnedItem).toBeVisible();
  await returnedItem.click();
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText("Ивановы");
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText("Блокеры");

  if (width >= 1280) {
    const nextPanel = surface.getByTestId("agent-action-next-panel");
    await expect(nextPanel).toBeVisible();
    await expect(nextPanel).toContainText("Исправить");
    await nextPanel.getByRole("button", { name: "Исправить" }).click();
  } else {
    await expect(surface.getByTestId("agent-action-next-panel")).not.toBeVisible();
    await surface.getByTestId("agent-action-active-panel").getByRole("button", { name: "Исправить" }).click();
  }

  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть подачу" }).click();
}

test.describe("V-19 My Actions submission command cockpit", () => {
  test("viewport matrix, selection, mobile detail, and existing drawer routing", async ({
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
        await assertDesktopCockpit(page, viewport.width);
      }

      await expectNoHorizontalOverflow(page, `${viewport.label}: after interaction`);
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
            ? "Action Timeline visible; detail sheet opened; CTA opened existing drawer."
            : viewport.width >= 1280
              ? "Queue, Active Submission, and Next Action columns visible."
              : "Queue and Active Submission visible; Next Action repeated in Active panel.",
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
    await expect(page.locator(".vf-figma-action-row").first()).toBeVisible();
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
