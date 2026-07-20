import { expect, test, type Locator, type Page } from "@playwright/test";

const blockedText =
  /is blocked|doesn.t allow you to view this site|ERR_BLOCKED_BY_ADMINISTRATOR|ERR_BLOCKED_BY_CLIENT/i;

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
  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
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
  await page.addInitScript(
    "window.localStorage.clear(); window.sessionStorage.clear();",
  );
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
        const text = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        return patterns.some((pattern) => pattern.test(text));
      },
      { timeout: 25_000 },
    )
    .toBe(true);
}

async function expectUnifiedSideMenuFinish(
  page: Page,
  sideMenu: Locator,
  viewportWidth: number,
): Promise<void> {
  const menuBox = await sideMenu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox?.x).toBeGreaterThanOrEqual(8);
  expect(menuBox?.width).toBeGreaterThanOrEqual(Math.min(280, viewportWidth - 16));
  expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(
    viewportWidth,
  );

  await expect(sideMenu.locator(".ops-brand-letter")).toHaveText("V");
  await expect(sideMenu.locator(".ops-brand-logo img")).toHaveCount(0);

  const createButton = sideMenu.getByRole("button", { name: "Новая подача" });
  if ((await createButton.count()) > 0) {
    await expect(createButton).toBeVisible();
    await expect(createButton.locator("strong")).toHaveText("Новая подача");
    await expect(createButton).toHaveCSS("background-color", "rgb(91, 96, 201)");
    await expect
      .poll(() =>
        createButton.locator("strong").evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true);
  }

  const activeItem = sideMenu.locator('.ops-nav-item[aria-current="page"]');
  const navIconBox = await activeItem.locator(".ops-nav-icon").boundingBox();
  const navTextBox = await activeItem.locator(".ops-nav-copy strong").boundingBox();
  expect(navIconBox).not.toBeNull();
  expect(navTextBox).not.toBeNull();
  expect(
    Math.abs(
      (navIconBox?.y ?? 0) + (navIconBox?.height ?? 0) / 2 -
        ((navTextBox?.y ?? 0) + (navTextBox?.height ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(1);

  await expect(sideMenu).toHaveCSS("opacity", "1");
  expect(
    await sideMenu.evaluate((element) =>
      getComputedStyle(element).transitionProperty.includes("opacity"),
    ),
  ).toBe(true);

  const inactiveItem = sideMenu.locator(
    '.ops-nav-item:not([aria-current="page"])',
  ).first();
  await expect
    .poll(async () => {
      const [menuColors, activeColors, inactiveText] = await Promise.all([
        sideMenu.evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          text: getComputedStyle(element).color,
        })),
        activeItem.evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          border: getComputedStyle(element).borderLeftColor,
        })),
        inactiveItem.evaluate((element) => getComputedStyle(element).color),
      ]);

      return {
        activeBackground: activeColors.background,
        activeBorder: activeColors.border,
        inactiveText,
        menuBackground: menuColors.background,
        menuText: menuColors.text,
      };
    })
    .toEqual({
      activeBackground: "rgb(57, 60, 127)",
      activeBorder: "rgb(96, 165, 250)",
      inactiveText: "rgba(242, 243, 245, 0.62)",
      menuBackground: "rgb(16, 16, 17)",
      menuText: "rgba(242, 243, 245, 0.62)",
    });

  const session = sideMenu.getByRole("button", { name: "Выйти" });
  const avatarBox = await session.locator(":scope > span").boundingBox();
  const sessionTextBox = await session.locator(":scope > div").boundingBox();
  expect(avatarBox).not.toBeNull();
  expect(sessionTextBox).not.toBeNull();
  expect(sessionTextBox?.x).toBeGreaterThanOrEqual(
    (avatarBox?.x ?? 0) + (avatarBox?.width ?? 0),
  );
}

async function expectMyActionsActiveMenuState(sideMenu: Locator): Promise<void> {
  const activeItem = sideMenu.locator('.ops-nav-item[aria-current="page"]');
  await expect(activeItem).toHaveCSS("background-color", "rgb(57, 60, 127)");
  await expect(activeItem.locator(".ops-nav-copy strong")).toHaveCSS(
    "color",
    "rgb(181, 202, 242)",
  );
}

test.describe("V-19 local-demo smoke", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("agent login opens CommandCenter surface", async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await login(page, "1@1.ru", "11");

    await expectWorkspace(page, [
      /Мои действия/i,
      /Мои заявки/i,
      /Заявки/i,
      /Документы/i,
      /Локальный демо-режим/i,
    ]);

    const sideMenu = page.locator("#v19-operational-side-menu");
    await expect(sideMenu).toHaveCount(1);
    await expect(sideMenu).toBeVisible();
    await expect(sideMenu).toHaveAttribute("data-side-menu-mode", "regular");
    await expectMyActionsActiveMenuState(sideMenu);
    const desktopMenuTrigger = page.getByRole("button", {
      exact: true,
      name: "Меню",
    });
    await expect(desktopMenuTrigger).toBeHidden();

    await sideMenu.getByRole("button", { exact: true, name: "Мои подачи" }).click();
    await expect(page.locator(".v19-page-header h1")).toHaveText("Мои подачи");
    await expect(sideMenu).toHaveCount(1);

    await page.setViewportSize({ height: 844, width: 390 });
    const menuTrigger = page.getByRole("button", { exact: true, name: "Меню" });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();

    const menuDialog = page.getByRole("dialog", { name: "Меню агента" });
    await expect(menuDialog).toBeVisible();
    await expect(sideMenu).toHaveCount(1);
    await expectUnifiedSideMenuFinish(page, menuDialog, 390);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      fullPage: false,
      path: testInfo.outputPath("agent-mobile-menu.png"),
    });
    await menuDialog.getByRole("button", { name: "Закрыть меню" }).click();
    await expect(menuDialog).toBeHidden();

    for (const viewport of [
      { height: 740, width: 320 },
      { height: 932, width: 430 },
      { height: 1024, width: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(menuTrigger).toBeVisible();
      await menuTrigger.click();
      await expect(menuDialog).toBeVisible();
      await expectUnifiedSideMenuFinish(page, menuDialog, viewport.width);
      await menuDialog.getByRole("button", { name: "Закрыть меню" }).click();
      await expect(menuDialog).toBeHidden();
    }

    await page.setViewportSize({ height: 900, width: 1440 });
    await expect(sideMenu).toBeVisible();
    await expect(menuTrigger).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test("admin login opens AdminWorkspace surface", async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await login(page, "2@2.ru", "22");

    await expectWorkspace(page, [
      /Проверка/i,
      /Очередь/i,
      /Выгрузка/i,
      /Экспорт/i,
      /Локальный демо-режим/i,
    ]);

    const sideMenu = page.locator("#v19-operational-side-menu");
    await expect(sideMenu).toHaveCount(1);
    await expect(sideMenu).toBeVisible();
    await expect(sideMenu).toHaveAttribute("data-side-menu-mode", "regular");
    await expectMyActionsActiveMenuState(sideMenu);
    await page.screenshot({
      fullPage: false,
      path: testInfo.outputPath("admin-desktop-menu.png"),
    });
    await expect(
      page.getByRole("button", { name: "Открыть меню администратора" }),
    ).toBeHidden();

    await sideMenu.getByRole("button", { exact: true, name: "Выгрузка" }).click();
    await expect(page.locator(".v19-page-header h1")).toHaveText("Центр выгрузки");
    await expect(sideMenu).toHaveCount(1);

    await page.setViewportSize({ height: 844, width: 390 });
    const menuTrigger = page.getByRole("button", {
      name: "Открыть меню администратора",
    });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();

    const menuDialog = page.getByRole("dialog", { name: "Меню администратора" });
    await expect(menuDialog).toBeVisible();
    await expect(sideMenu).toHaveCount(1);
    await expectUnifiedSideMenuFinish(page, menuDialog, 390);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      fullPage: false,
      path: testInfo.outputPath("admin-mobile-menu.png"),
    });
    await menuDialog.getByRole("button", { exact: true, name: "Проверка" }).click();
    await expect(menuDialog).toBeHidden();
    await expect(page.locator(".v19-page-header h1")).toHaveText("Очередь на проверку");
    expect(consoleErrors).toEqual([]);
  });
});
