import { expect, test, type Locator, type Page } from "@playwright/test";

const blockedText = /is blocked|doesn.t allow you to view this site|ERR_BLOCKED_BY_ADMINISTRATOR|ERR_BLOCKED_BY_CLIENT/i;

const emailSelector = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[autocomplete="username"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="почт" i]',
  'input[aria-label*="email" i]',
  'input[aria-label*="почт" i]',
  "#workspace-email",
].join(", ");

const passwordSelector = [
  'input[type="password"]',
  'input[name*="password" i]',
  'input[autocomplete="current-password"]',
  'input[placeholder*="password" i]',
  'input[placeholder*="парол" i]',
  'input[aria-label*="password" i]',
  'input[aria-label*="парол" i]',
  "#workspace-password",
].join(", ");

async function assertNotPolicyBlocked(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (blockedText.test(bodyText)) {
    throw new Error(
      `Browser policy blocked E2E URL "${page.url()}". Use PW_BASE_HOST=localhost, not 127.0.0.1. Body: ${bodyText.slice(0, 300)}`,
    );
  }
}

async function firstVisible(locator: Locator): Promise<Locator> {
  await expect.poll(async () => locator.count()).toBeGreaterThan(0);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const count = await locator.count();

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await expect(locator.first()).toBeVisible();
  return locator.first();
}

async function clearBrowserState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.addInitScript("window.localStorage.clear(); window.sessionStorage.clear();");
}

async function openLogin(page: Page): Promise<void> {
  await clearBrowserState(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await assertNotPolicyBlocked(page);

  const loginTab = page.getByRole("button", {
    name: /уже есть доступ|вход|войти|login|sign in/i,
  });

  if ((await loginTab.count()) > 0) {
    const button = await firstVisible(loginTab);
    await button.click().catch(() => undefined);
  }
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await openLogin(page);

  const emailInput = await firstVisible(page.locator(emailSelector));
  await emailInput.fill(email);

  const passwordInput = await firstVisible(page.locator(passwordSelector));
  await passwordInput.fill(password);

  const submitButton = await firstVisible(
    page.getByRole("button", {
      name: /войти|login|sign in|продолжить|continue|доступ|access/i,
    }),
  );

  await submitButton.click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await assertNotPolicyBlocked(page);
}

async function expectWorkspace(page: Page, patterns: RegExp[]): Promise<void> {
  await expect
    .poll(
      async () => {
        await assertNotPolicyBlocked(page);
        const text = await page.locator("body").innerText().catch(() => "");
        return patterns.some((pattern) => pattern.test(text));
      },
      { timeout: 25_000 },
    )
    .toBe(true);
}

test.describe("V-19 local-demo smoke", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("agent login opens CommandCenter surface", async ({ page }) => {
    await login(page, "1@1.ru", "11");

    await expectWorkspace(page, [
      /Мои действия/i,
      /Мои заявки/i,
      /Заявки/i,
      /Документы/i,
      /Локальный демо-режим/i,
    ]);
  });

  test("admin login opens AdminWorkspace surface", async ({ page }) => {
    await login(page, "2@2.ru", "22");

    await expectWorkspace(page, [
      /Проверка/i,
      /Очередь/i,
      /Выгрузка/i,
      /Экспорт/i,
      /Локальный демо-режим/i,
    ]);
  });
});
