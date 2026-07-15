import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const evidenceDir = join(
  process.cwd(),
  "docs/qa/2026-07-15-submissions-pass-01",
);

const viewports = [
  { height: 844, label: "mobile-390", width: 390 },
  { height: 1024, label: "tablet-768", width: 768 },
  { height: 900, label: "desktop-1440", width: 1440 },
] as const;

function metricValue(page: Page, label: string) {
  return page
    .getByRole("button", { exact: true, name: label })
    .textContent()
    .then((text) => Number(text?.match(/\d+/)?.[0]));
}

async function openAgentSubmissions(page: Page) {
  await openFreshWorkspace(page, {
    heading: "Мои действия",
    workspaceEmail: "agent@visaflow.local",
  });

  const mobileMenu = page.getByRole("button", { exact: true, name: "Меню" });
  if (await mobileMenu.isVisible().catch(() => false)) {
    await mobileMenu.click();
    const menuDialog = page.getByRole("dialog", { name: "Меню агента" });
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name: "Мои подачи" }).click();
    await expect(menuDialog).toBeHidden();
  } else {
    await page.getByRole("button", { name: "Мои подачи" }).click();
  }

  await expect(page.getByLabel("Поиск по подачам")).toBeVisible();
}

test.describe("V-19 applicants toolbar lifecycle contract", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of viewports) {
    test(`${viewport.label}: filters, reset and drawer stay truthful`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "focused local UI proof");
      mkdirSync(evidenceDir, { recursive: true });
      await page.setViewportSize(viewport);

      const browserProblems = collectBrowserProblems(page);
      await openAgentSubmissions(page);

      const cards = page.locator("[data-submission-id]");
      const totalCards = await cards.count();
      const reviewCount = await metricValue(page, "Проверить");
      const readyCount = await metricValue(page, "К выгрузке");

      expect(totalCards).toBeGreaterThan(0);
      expect(reviewCount).toBeGreaterThan(0);
      expect(readyCount).toBeGreaterThan(0);
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDir, `${viewport.label}-baseline.png`),
      });

      await page.getByRole("button", { exact: true, name: "Проверить" }).click();
      await expect(page.getByRole("button", { exact: true, name: "Проверить" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(cards).toHaveCount(reviewCount);
      const reviewCardTexts = await cards.allTextContents();
      expect(
        reviewCardTexts.every(
          (text) => text.includes("Проверка") || text.includes("Исправление"),
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDir, `${viewport.label}-review-filter.png`),
      });

      const statusFilter = page.getByRole("button", {
        name: "Фильтр подач: Проверить",
      });
      await statusFilter.click();
      await expect(statusFilter).toHaveAttribute("aria-expanded", "true");
      const statusListbox = page.getByRole("listbox", { name: "Фильтр подач" });
      await expect(statusListbox).toBeVisible();
      await statusListbox.getByRole("option", { name: "К выгрузке" }).click();
      await expect(cards).toHaveCount(readyCount);
      await page.getByRole("button", { name: "Фильтр подач: К выгрузке" }).click();
      await expect(
        page.getByRole("option", { name: "К выгрузке" }),
      ).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Escape");

      await page.getByRole("button", { exact: true, name: "В очереди" }).click();
      const cityFilter = page.getByRole("button", {
        name: "Фильтр городов: Все города",
      });
      await cityFilter.click();
      await page.getByRole("listbox", { name: "Фильтр городов" }).getByRole("option", { name: "Казань" }).click();
      await expect(page.locator('[data-submission-id="ПД-1053"]')).toBeVisible();
      await expect(cards).toHaveCount(1);

      await page.getByLabel("Поиск по подачам").fill("__no_matching_submission__");
      const emptyState = page.getByRole("status").filter({ hasText: "Ничего не найдено" });
      await expect(emptyState).toBeVisible();
      await emptyState.getByRole("button", { name: "Сбросить фильтры" }).click();
      await expect(cards).toHaveCount(totalCards);

      await cards.first().click();
      await expect(drawer(page)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDir, `${viewport.label}-drawer.png`),
      });
      await drawer(page).getByRole("button", { name: /Закрыть (подачу|панель)/ }).click();

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(browserProblems, browserProblems.join("\n")).toEqual([]);
    });
  }
});
