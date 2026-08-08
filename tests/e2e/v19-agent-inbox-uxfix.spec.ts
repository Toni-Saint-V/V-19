import { expect, test, type Page } from "@playwright/test";
import { testArtifactPath } from "../support/artifacts";
import { openFreshWorkspace } from "./v19-pilot-helpers";

const viewports = [
  { height: 900, label: "1440x900", width: 1440 },
  { height: 800, label: "1280x800", width: 1280 },
  { height: 768, label: "1024x768", width: 1024 },
  { height: 844, label: "390x844", width: 390 },
];

async function isVisible(locator: ReturnType<Page["getByRole"]>) {
  return locator.isVisible({ timeout: 750 }).catch(() => false);
}

async function openMobileMenu(page: Page) {
  const menuButton = page.getByRole("button", { name: "Меню" });

  if (await isVisible(menuButton)) {
    await menuButton.click();
  }
}

async function clickWorkspaceButton(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name });

  if (!(await isVisible(button.first()))) {
    await openMobileMenu(page);
    const menuDialog = page.getByRole("dialog", { name: "Меню агента" });
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name }).click();
    return;
  }

  await button.first().click();
}

async function openFreshAgentActions(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });
  await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const metrics = await page.evaluate(() => {
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

  expect(metrics.scrollWidth, context).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectActionBoardFits(page: Page) {
  const board = page.getByRole("region", { name: "Мои действия" });
  await expect(board).toBeVisible();

  const metrics = await board.evaluate((element) => {
    const boardElement = element as unknown as {
      clientWidth: number;
      scrollWidth: number;
    };

    return {
      clientWidth: boardElement.clientWidth,
      scrollWidth: boardElement.scrollWidth,
    };
  });

  expect(
    metrics.scrollWidth,
    "agent actions board should not clip horizontally",
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test.describe("V-19 agent actions triage UX", () => {
  test("action row stays explicit and opens the real submission drawer", async ({
    page,
  }) => {
    const browserProblems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserProblems.push(message.text());
    });
    page.on("pageerror", (error) => browserProblems.push(error.message));

    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshAgentActions(page);

    const agentActionSurface = page.getByRole("region", { name: "Мои действия" });
    const returnedRow = agentActionSurface
      .locator('[data-testid="agent-action-queue-item"][data-submission-id="ПД-1048"]')
      .first();

    await expect(returnedRow).toBeVisible();
    await expect(returnedRow).toContainText("VF-1048");
    await expect(returnedRow).toHaveAttribute(
      "aria-label",
      /Выбрать действие: .*Мария Иванова.*Заменить селфи 1/,
    );

    await returnedRow.click();
    const inlineDetail = agentActionSurface.getByTestId("agent-action-inline-detail");
    await expect(inlineDetail).toBeVisible();
    await inlineDetail
      .locator('[data-v19-interaction-id="actions.open-secondary"]')
      .click();
    const openedDrawer = page.getByRole("dialog").first();
    await expect(openedDrawer).toBeVisible();
    await expect(
      openedDrawer.getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    expect(browserProblems).toEqual([]);
  });

  test("locked screenshots have no horizontal overflow", async ({ page }) => {
    const browserProblems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserProblems.push(message.text());
    });
    page.on("pageerror", (error) => browserProblems.push(error.message));

    for (const viewport of viewports) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await openFreshAgentActions(page);
      await expectNoHorizontalOverflow(page, viewport.label);
      if (viewport.width >= 1280) {
        await expectActionBoardFits(page);
      }
      await page.screenshot({
        fullPage: true,
        path: testArtifactPath(`2026-06-30-agent-actions-uxfix-${viewport.label}.png`),
      });
    }

    expect(browserProblems).toEqual([]);
  });

  test("adjacent agent screens keep their layout after shared row changes", async ({
    page,
  }) => {
    const browserProblems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserProblems.push(message.text());
    });
    page.on("pageerror", (error) => browserProblems.push(error.message));

    for (const viewport of [
      { height: 900, label: "1440x900", width: 1440 },
      { height: 844, label: "390x844", width: 390 },
    ]) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await openFreshAgentActions(page);

      await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label}: agent actions`);

      await clickWorkspaceButton(page, /Мои подачи/);
      await expect(page.getByRole("region", { name: "Мои подачи" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label}: agent submissions`);
    }

    expect(browserProblems).toEqual([]);
  });
});
