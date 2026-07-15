import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const evidenceDirectory = "docs/qa/2026-07-15-my-actions-pass-01";

type ActionAnimationRecord = { delay: number; submissionId: string | null };

type EntranceMetrics = {
  animationRecords: ActionAnimationRecord[];
  documentWidth: { client: number; scroll: number };
  rowCount: number;
  rowOpacity: string[];
};

async function captureActionEntranceMetrics(page: Page): Promise<EntranceMetrics> {
  return page.evaluate((): EntranceMetrics => {
    const browserGlobal = globalThis as unknown as {
      __v19ActionRowAnimations?: ActionAnimationRecord[];
      document: {
        documentElement: { clientWidth: number; scrollWidth: number };
        querySelectorAll(selector: string): ArrayLike<unknown>;
      };
      getComputedStyle(element: unknown): { opacity: string };
    };

    const rows = Array.from(
      browserGlobal.document.querySelectorAll('[data-testid="agent-action-row"]'),
    );

    return {
      animationRecords: browserGlobal.__v19ActionRowAnimations ?? [],
      documentWidth: {
        client: browserGlobal.document.documentElement.clientWidth,
        scroll: browserGlobal.document.documentElement.scrollWidth,
      },
      rowCount: rows.length,
      rowOpacity: rows.map((row) => browserGlobal.getComputedStyle(row).opacity),
    };
  });
}

async function prepareAnimationMetrics(page: Page) {
  await page.addInitScript(() => {
    const browserGlobal = globalThis as unknown as {
      __v19ActionRowAnimations?: ActionAnimationRecord[];
      Element: {
        prototype: {
          animate(keyframes: unknown, options?: unknown): unknown;
        };
      };
    };
    const originalAnimate = browserGlobal.Element.prototype.animate;
    const records: ActionAnimationRecord[] = [];

    browserGlobal.Element.prototype.animate = function instrumentActionRowAnimation(
      this: unknown,
      keyframes: unknown,
      options?: number | { delay?: number },
    ) {
      const element = this as unknown as {
        closest?(selector: string): { dataset?: { agentActionId?: string } } | null;
      };
      const row = element.closest?.('[data-testid="agent-action-row"]');
      if (row) {
        const timing = typeof options === "number" ? { delay: 0 } : options ?? {};
        records.push({
          delay: Number(timing.delay ?? 0),
          submissionId: row.dataset?.agentActionId ?? null,
        });
      }
      return Reflect.apply(originalAnimate, this, [keyframes, options]);
    };

    browserGlobal.__v19ActionRowAnimations = records;
  });
}

test.describe("V-19 My Actions immediate queue", () => {
  test("makes every action immediately available and preserves the exact correction CTA", async ({
    page,
  }) => {
    mkdirSync(evidenceDirectory, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    await prepareAnimationMetrics(page);
    const results = [];

    for (const viewport of [
      { height: 740, label: "mobile-320", width: 320 },
      { height: 844, label: "mobile-390", width: 390 },
      { height: 932, label: "mobile-430", width: 430 },
      { height: 1024, label: "tablet-768", width: 768 },
      { height: 900, label: "desktop-1440", width: 1440 },
    ]) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openFreshWorkspace(page, { heading: "Мои действия" });

      const action = page
        .locator('[data-testid="agent-action-row"][data-agent-action-id^="replace-ПД-1048-"]')
        .first();
      await expect(action).toBeVisible();
      await expect(action.locator(".v19-legacy-action-city-label")).toHaveText(/\S+/);
      await expect(action.locator(".v19-legacy-action-context")).toHaveText(
        "Заменить селфи 1",
      );
      await expect(
        page
          .getByTestId("agent-action-row")
          .filter({ hasText: "Добавить селфи 2" })
          .first(),
      ).toBeVisible();
      const actionId = await action.getAttribute("data-agent-action-id");
      expect(actionId).toBeTruthy();
      const targetFileId = actionId!.replace("replace-ПД-1048-", "");
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: join(evidenceDirectory, `${viewport.label}-after.png`),
      });

      const metrics = await captureActionEntranceMetrics(page);
      results.push({ viewport: viewport.label, ...metrics });

      const priorityAction = page.getByRole("button", {
        name: /Открыть приоритетные действия/,
      });
      await expect(priorityAction).toContainText("К блокерам");

      if (viewport.width === 1440) {
        await expect(page.getByText("Кабинет агента", { exact: true })).toBeVisible();
        await expect(page.getByText("Агент Тони", { exact: true })).toBeVisible();
        await expect(page.getByText("Команда VisaFlow", { exact: true })).toBeVisible();
      }

      if (viewport.width === 320 || viewport.width === 390 || viewport.width === 768) {
        const statusFilter = page.getByRole("button", {
          name: /Фильтр действий: Открыто/,
        });
        await expect(statusFilter.locator(".v19-admin-toolbar-select-value")).toBeVisible();
        await expect(
          page
            .getByRole("button", { name: /Сортировка действий: По дате вылета/ })
            .locator(".v19-admin-toolbar-select-value"),
        ).toBeVisible();
        await expect(
          page
            .getByRole("button", { name: /Фильтр городов: Все города/ })
            .locator(".v19-admin-toolbar-select-value"),
        ).toBeVisible();
      }

      if (viewport.width === 390) {
        await priorityAction.click();
        await expect(
          page.getByRole("button", { name: /Фильтр действий: Блокеры/ }),
        ).toBeVisible();
      }

      await action.getByTestId("agent-action-cta").click();
      const questionnaire = page
        .locator('.vf-figma-questionnaire-screen[data-submission-id="ПД-1048"]')
        .first();
      await expect(questionnaire).toBeVisible();
      const targetSlot = questionnaire.locator(
        `[data-file-id="${targetFileId}"][data-file-focused="true"]`,
      );
      await expect(targetSlot).toBeVisible();
      await expect(targetSlot).toBeFocused();

      if (viewport.width === 390 || viewport.width === 1440) {
        await page.screenshot({
          animations: "disabled",
          fullPage: false,
          path: join(evidenceDirectory, `${viewport.label}-exact-file-after.png`),
        });
      }

      expect(metrics.rowCount).toBeGreaterThan(0);
      expect(metrics.documentWidth.scroll).toBeLessThanOrEqual(metrics.documentWidth.client + 1);
      expect(metrics.rowOpacity).toEqual(Array(metrics.rowCount).fill("1"));
      expect(metrics.animationRecords.filter((record) => record.delay > 0)).toEqual([]);

      if (viewport.width === 320) {
        const cityLayout = await action
          .locator(".v19-legacy-action-city-label")
          .evaluate((node) => {
            const element = node as HTMLElement;
            return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
          });
        expect(cityLayout.scrollWidth).toBeLessThanOrEqual(cityLayout.clientWidth + 1);

        const selfieOneContext = page
          .getByTestId("agent-action-row")
          .filter({ hasText: "Добавить селфи 1" })
          .first()
          .locator(".v19-legacy-action-context");
        const selfieTwoContext = page
          .getByTestId("agent-action-row")
          .filter({ hasText: "Добавить селфи 2" })
          .first()
          .locator(".v19-legacy-action-context");
        await expect(selfieOneContext).toHaveText("Добавить селфи 1");
        await expect(selfieTwoContext).toHaveText("Добавить селфи 2");
        for (const context of [selfieOneContext, selfieTwoContext]) {
          const layout = await context.evaluate((node) => {
            const element = node as HTMLElement;
            return {
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              textOverflow: getComputedStyle(element).textOverflow,
              whiteSpace: getComputedStyle(element).whiteSpace,
            };
          });
          expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
          expect(layout.textOverflow).toBe("clip");
          expect(layout.whiteSpace).toBe("normal");
        }

        const compactFilterValues = page.locator(
          ".v19-admin-toolbar-select-value",
        );
        const filterLayouts = await compactFilterValues.evaluateAll((nodes) =>
          nodes.map((node) => {
            const element = node as HTMLElement;
            return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
          }),
        );
        for (const filter of filterLayouts) {
          expect(filter.scrollWidth).toBeLessThanOrEqual(filter.clientWidth + 1);
        }
      }
    }

    writeFileSync(
      join(evidenceDirectory, "postfix-animation-metrics.json"),
      JSON.stringify(results, null, 2),
    );
    expect(browserProblems).toEqual([]);
  });

  test("connects sidebar search and Cmd/Ctrl+K to the existing command palette", async ({
    page,
  }) => {
    mkdirSync(evidenceDirectory, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, { heading: "Мои действия" });

    const trigger = page.getByRole("button", { name: "Открыть командную палитру" }).last();
    await trigger.click();
    const palette = page.getByRole("dialog", { name: "Командная палитра" });
    await expect(palette).toBeVisible();
    await expect(palette.locator('input[aria-label="Найти команду или подачу"]')).toBeFocused();
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: join(evidenceDirectory, "desktop-command-palette.png"),
    });

    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible();
    await palette.getByText("Мои подачи", { exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Мои подачи" })).toBeVisible();
    expect(browserProblems).toEqual([]);
  });
});
