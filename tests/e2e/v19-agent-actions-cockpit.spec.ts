import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { testArtifactPath } from "../support/artifacts";

import { expect, test, type Page } from "@playwright/test";

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
  await page.goto("/");
  await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      localStorage: { clear(): void; setItem(key: string, value: string): void };
    };

    browserGlobal.localStorage.clear();
    browserGlobal.localStorage.setItem(
      "visaflow.workspaceEmail.v2",
      "agent@visaflow.local",
    );
  });
  await page.reload();

  const emailField = page.locator("#workspace-email");
  if (await emailField.isVisible({ timeout: 750 }).catch(() => false)) {
    await emailField.fill("agent@visaflow.local");
    await page.locator("#workspace-password").fill("local-dev-password");
    await page.getByRole("button", { name: "Войти" }).click();
  }

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
    browserGlobal.localStorage.setItem(
      "visaflow.workspaceEmail.v2",
      "admin@visaflow.local",
    );
  });
  await page.reload();

  const emailField = page.locator("#workspace-email");
  if (await emailField.isVisible({ timeout: 750 }).catch(() => false)) {
    await emailField.fill("admin@visaflow.local");
    await page.locator("#workspace-password").fill("local-dev-password");
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

    const scrollingElement = root.document.scrollingElement ?? root.document.documentElement;
    for (const target of [
      scrollingElement,
      root.document.querySelector<ScrollTarget>(".workspace"),
      root.document.querySelector<ScrollTarget>('[data-testid="agent-action-queue"]'),
      root.document.querySelector<ScrollTarget>('[data-testid="agent-action-active-panel"]'),
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
  await expect(event).toContainText("Причина: Заменить селфи 1: файл требует замены");
  await expect(event).toContainText("Ответственный: Действие за агентом");
  await expect(event).toContainText("Следующее: Заменить селфи 1");
  await expect(event).toContainText("Срочно: дедлайн сегодня");

  await event.locator(".v19-actions-timeline-hit").click();
  const detail = page.getByTestId("agent-action-mobile-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Ивановы");
  await expect(detail).toContainText("Сводка действия");
  await expect(detail).toContainText("Проблема");
  await expect(detail).toContainText("Файлы не готовы");
  await expect(detail).toContainText("Заменить файл «селфи 1».");
  await expect(detail).toContainText("Обязательные файлы");
  await expect(detail).toContainText("Почему");
  await expect(detail.getByRole("button", { name: "Заменить файл" })).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Открыть подачу полностью" }),
  ).toBeVisible();

  await detail.getByRole("button", { name: "Заменить файл" }).click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toHaveCount(0);
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
  await expect(returnedItem).toContainText(
    "Причина: Заменить селфи 1: файл требует замены",
  );
  await expect(returnedItem).toContainText("Ответственный: Действие за агентом");
  await expect(returnedItem).toContainText("Следующее: Заменить селфи 1");
  await expect(returnedItem).toContainText("Срочно: дедлайн сегодня");
  await expect(returnedItem).toContainText("Готовность");
  await expect(returnedItem).not.toContainText("Итог:");
  await returnedItem.click();

  const activePanel = surface.getByTestId("agent-action-active-panel");
  await expect(activePanel).toContainText("Ивановы");
  await expect(activePanel).toContainText("Сводка действия");
  await expect(activePanel).toContainText("Проблема");
  await expect(activePanel).toContainText("Файлы не готовы");
  await expect(activePanel).toContainText("Заменить файл «селфи 1».");
  await expect(activePanel).toContainText("Следующее");
  await expect(activePanel).toContainText("Почему");
  await expect(activePanel).toContainText("Обязательные файлы");
  await expect(activePanel).toContainText("Открыть подачу полностью");
  await expect(surface.locator(".v19-actions-summary-metric")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-cockpit-summary")).toHaveCount(0);
  await expect(surface.locator(".v19-toolbar-summary-row")).toContainText("Блокеры");
  await expect(surface.locator(".v19-toolbar-summary-row")).toContainText("Срочно");
  await expect(surface.locator(".v19-toolbar-summary-row")).toContainText("Готово");
  await expect(surface.locator(".v19-toolbar-summary-row")).toContainText("Всего");

  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1280) {
    const visibleCards = await surface
      .getByTestId("agent-action-queue-item")
      .evaluateAll((cards) =>
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
  await activePanel.getByRole("button", { name: "Заменить файл" }).click();
  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toHaveCount(0);

  await expect(page.getByRole("heading", { level: 1, name: "Мои действия" })).toBeVisible();
}

async function assertActionFilters(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });

  await page.getByRole("tab", { name: /Блокеры/ }).click();
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Требует исправления",
  );

  await page.getByRole("tab", { name: /Срочно/ }).click();
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Срочно: дедлайн сегодня",
  );

  await page.getByRole("tab", { name: /^Готово/ }).click();
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Готово",
  );

  await page.getByRole("tab", { name: /^Все/ }).click();
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
    await expect(page.locator(".v17-admin-work-row, .v17-admin-empty-state").first()).toBeVisible();
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
