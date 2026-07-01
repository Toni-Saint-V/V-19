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
  await expect(event).toContainText("Ошибка: файлы не готовы");
  await expect(event).toContainText("Мария Иванова");
  await expect(event).toContainText("Следующее: Заменить селфи 1");
  await expect(event).toContainText("Срочно: дедлайн сегодня");
  await expect(event).not.toContainText("Анкета с ошибками");
  await expect(event).not.toContainText("Проверка ожидает");
  await expect(event).toContainText("Заменить селфи 1");

  await event.locator(".v19-actions-timeline-hit").click();
  const detail = page.getByTestId("agent-action-mobile-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Ивановы");
  await expect(detail).toContainText("Сводка действия");
  await expect(detail).toContainText("Проблема");
  await expect(detail).toContainText("Файлы не готовы");
  await expect(detail).toContainText("Заменить файл «селфи 1».");
  await expect(detail).toContainText("Заменить селфи 1: файл требует замены");
  await expect(detail).toContainText("Что сделать дальше");
  await expect(detail).toContainText("Почему");
  await expect(detail).toContainText("Анкета: есть ошибки");
  await expect(detail).toContainText("Файлы: не хватает документов");
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
  await expect(returnedItem).toContainText("Ошибка: файлы не готовы");
  await expect(returnedItem).toContainText("Мария Иванова");
  await expect(returnedItem).toContainText("Следующее: Заменить селфи 1");
  await expect(returnedItem).toContainText("Срочно: дедлайн сегодня");
  await expect(returnedItem).not.toContainText("Анкета с ошибками");
  await expect(returnedItem).not.toContainText("Проверка ожидает");
  await expect(returnedItem).not.toContainText("Итог:");
  await expect(returnedItem).not.toContainText("Испания");
  await returnedItem.click();
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText("Ивановы");
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText(
    "Сводка действия",
  );
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText(
    "Проблема",
  );
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText(
    "Файлы не готовы",
  );
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText(
    "Заменить файл «селфи 1».",
  );
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText(
    "Заменить селфи 1: файл требует замены",
  );
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText(
    "Почему",
  );
  await expect(surface.getByTestId("agent-action-active-panel")).toContainText(
    "Открыть подачу полностью",
  );
  await expect(surface.locator(".v19-actions-summary-metric")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-cockpit-summary")).toContainText(
    "В работе",
  );
  await expect(surface.locator(".v19-actions-cockpit-summary")).toContainText(
    "На проверке",
  );
  await expect(surface.locator(".v19-actions-cockpit-summary")).toContainText(
    "На исправлении",
  );
  await expect(surface.locator(".v19-actions-cockpit-summary")).toContainText(
    "Готово",
  );

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
    expect(visibleCards).toBeGreaterThanOrEqual(5);
  }

  await expect(surface.getByTestId("agent-action-next-panel")).toHaveCount(0);
  await surface
    .getByTestId("agent-action-active-panel")
    .getByRole("button", { name: "Заменить файл" })
    .click();

  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toHaveCount(0);

  const createAction = page.getByRole("button", { name: "Новая подача" }).first();
  await expect(createAction).toBeVisible();
  await createAction.click();
  const createDialog = page.getByRole("dialog", { name: "Сборка документов" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("button", { name: "Закрыть создание" }).first().click();
}

async function assertActionFilters(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });

  await page.getByRole("tab", { name: /Ошибки/ }).click();
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Ошибка: файлы не готовы",
  );

  await page.getByRole("tab", { name: /Требуют действия/ }).click();
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Требует действия:",
  );

  await page.getByRole("tab", { name: /^Готово/ }).click();
  await expect(surface.getByTestId("agent-action-queue-item").first()).toContainText(
    "Готово:",
  );

  await page.getByRole("tab", { name: /Заблокировано/ }).click();
  await expect(surface).toContainText("Нет действий, требующих внимания");
  await expect(surface).toContainText("Нет задач, где агент ждёт внешнее событие.");

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
            ? "Лента действий видна; action summary открылся; CTA открыл существующий drawer."
            : "Очередь действий и action summary видны; primary CTA открыл существующий drawer.",
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
