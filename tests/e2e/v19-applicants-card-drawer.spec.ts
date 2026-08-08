import { mkdirSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { testArtifactPath } from "../support/artifacts";
import {
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const evidenceDir = testArtifactPath("2026-07-19-applicants-card-drawer");

const viewports = [
  { height: 740, label: "mobile-320", width: 320 },
  { height: 844, label: "mobile-390", width: 390 },
  { height: 932, label: "mobile-430", width: 430 },
  { height: 1024, label: "tablet-768", width: 768 },
  { height: 900, label: "desktop-1440", width: 1440 },
] as const;

async function openAgentSubmissions(page: Parameters<typeof openFreshWorkspace>[0]) {
  const mobileMenu = page.getByRole("button", { exact: true, name: "Меню" });
  if (await mobileMenu.isVisible().catch(() => false)) {
    await mobileMenu.click();
    const menuDialog = page.getByRole("dialog", { name: "Меню агента" });
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name: "Мои подачи" }).click();
    await expect(menuDialog).toBeHidden();
    return;
  }

  await page.getByRole("button", { name: "Мои подачи" }).click();
}

test("opens the submission drawer from the card surface at every locked viewport", async ({
  page,
}) => {
  test.setTimeout(120_000);
  mkdirSync(evidenceDir, { recursive: true });
  const browserProblems = collectBrowserProblems(page);

  for (const viewport of viewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await openFreshWorkspace(page);
    await openAgentSubmissions(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();

    const card = page.locator(".v19-agent-shared-card").first();
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox, `${viewport.label}: card geometry`).not.toBeNull();
    expect(cardBox!.x, `${viewport.label}: left card inset`).toBeGreaterThanOrEqual(16);
    expect(
      viewport.width - (cardBox!.x + cardBox!.width),
      `${viewport.label}: right card inset`,
    ).toBeGreaterThanOrEqual(16);

    if (viewport.width <= 768) {
      const headerBox = await page
        .locator("header.v19-page-header")
        .first()
        .boundingBox();
      expect(headerBox, `${viewport.label}: header geometry`).not.toBeNull();
      expect(
        headerBox!.height / viewport.height,
        `${viewport.label}: header height ratio`,
      ).toBeLessThanOrEqual(0.15);
    }

    const expectedDrawerName = (await card.getAttribute("aria-label"))?.replace(
      /^Подача\s+/,
      "",
    );
    expect(expectedDrawerName).toBeTruthy();
    await page.screenshot({
      fullPage: true,
      path: `${evidenceDir}/${viewport.label}-before.png`,
    });

    await card.click({ position: { x: 24, y: 24 } });

    const submissionDrawer = drawer(page);
    await expect(submissionDrawer).toBeVisible();
    await expect(submissionDrawer).toHaveAccessibleName(expectedDrawerName!);
    await expect
      .poll(async () => {
        const before = await submissionDrawer.boundingBox();
        await page.waitForTimeout(80);
        const after = await submissionDrawer.boundingBox();
        if (!before || !after) return viewport.height;
        return Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y));
      })
      .toBeLessThanOrEqual(0.5);
    const drawerBox = await submissionDrawer.boundingBox();
    expect(drawerBox, `${viewport.label}: drawer geometry`).not.toBeNull();
    expect(drawerBox!.x, `${viewport.label}: drawer left edge`).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      drawerBox!.x + drawerBox!.width,
      `${viewport.label}: drawer right edge`,
    ).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.width >= 1024) {
      expect(
        drawerBox!.x + drawerBox!.width,
        `${viewport.label}: drawer is anchored right`,
      ).toBeGreaterThanOrEqual(viewport.width - 9);
    }
    expect(
      drawerBox!.y + drawerBox!.height,
      `${viewport.label}: drawer bottom edge`,
    ).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({
      fullPage: true,
      path: `${evidenceDir}/${viewport.label}-drawer.png`,
    });

    const primaryDrawerAction = submissionDrawer.getByRole("button", {
      name: /^(Начать работу|Сохранить черновик|Отправить на проверку|Отправить исправления)$/,
    });
    await primaryDrawerAction.scrollIntoViewIfNeeded();
    await expect(primaryDrawerAction).toBeVisible();

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${viewport.label}: horizontal overflow`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    await page.keyboard.press("Escape");
    await expect(submissionDrawer).toBeHidden();

    if (viewport.width === 1440) {
      await card.focus();
      await expect(card).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(drawer(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer(page)).toBeHidden();
    }
  }

  expect(browserProblems).toEqual([]);
});
