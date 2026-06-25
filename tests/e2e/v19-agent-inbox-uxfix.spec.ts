import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { height: 900, label: "1440x900", width: 1440 },
  { height: 800, label: "1280x800", width: 1280 },
  { height: 768, label: "1024x768", width: 1024 },
  { height: 844, label: "390x844", width: 390 },
];

async function openFreshAgentInbox(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    (
      globalThis as unknown as { localStorage: { clear(): void } }
    ).localStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole("region", { name: "Входящие" })).toBeVisible();
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

async function expectInboxRailFits(page: Page) {
  const rail = page.locator(".v19-inbox-summary").first();
  await expect(rail).toBeVisible();
  await expect(rail).not.toContainText("Общее состояние всех подач");

  const metrics = await rail.evaluate((element) => {
    const railElement = element as unknown as {
      getBoundingClientRect(): { height: number };
      scrollHeight: number;
    };

    return {
      clientHeight: railElement.getBoundingClientRect().height,
      scrollHeight: railElement.scrollHeight,
    };
  });

  expect(metrics.scrollHeight, "desktop inbox rail should fit without inner scroll").toBeLessThanOrEqual(
    metrics.clientHeight + 1,
  );
}

test.describe("V-19 agent inbox triage UX", () => {
  test("row text is static and explicit row action opens drawer", async ({ page }) => {
    const browserProblems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserProblems.push(message.text());
    });
    page.on("pageerror", (error) => browserProblems.push(error.message));

    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshAgentInbox(page);

    const returnedRow = page
      .locator(".v19-event-row")
      .filter({ hasText: "Подачу «Семья Ивановых» вернули" })
      .first();
    const returnedAction = returnedRow.getByRole("button", { name: "Открыть" });

    await expect(returnedRow).toBeVisible();
    await expect(returnedRow).toContainText("Администратор");
    await expect(returnedRow).toContainText("12 мин назад");
    await expect(returnedRow.getByRole("button")).toHaveCount(1);
    await expect(returnedAction).toBeVisible();
    await expect(returnedRow).not.toHaveClass(/is-selected/);
    await expect(page.getByRole("button", { name: "Новая подача" })).toHaveClass(
      /secondary-button/,
    );

    await returnedRow.getByText("Подачу «Семья Ивановых» вернули").click();
    await expect(page.locator(".submission-drawer")).toHaveCount(0);

    await returnedAction.click();
    await expect(page.locator(".submission-drawer")).toBeVisible();
    await expect(page.locator(".submission-drawer")).toContainText("Семья Ивановых");
    await expect(returnedRow).toHaveCount(1);
    await expect(returnedRow).toHaveClass(/is-unread/);
    await expect(returnedRow).not.toHaveClass(/is-selected/);
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
      await openFreshAgentInbox(page);
      await expectNoHorizontalOverflow(page, viewport.label);
      if (viewport.width >= 1280) {
        await expectInboxRailFits(page);
      }
      await page.screenshot({
        fullPage: true,
        path: `docs/qa/2026-06-24-inbox-uxfix-${viewport.label}.png`,
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
      await openFreshAgentInbox(page);

      await page.getByRole("button", { name: "Мои действия. точные шаги" }).click();
      await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label}: agent actions`);

      await page.getByRole("button", { name: "Мои подачи. все рабочие подачи" }).click();
      await expect(page.getByRole("region", { name: /Рабочая область подач агента/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label}: agent submissions`);
    }

    expect(browserProblems).toEqual([]);
  });
});
