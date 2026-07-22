import { expect, test, type Locator, type Page } from "@playwright/test";

const blockedText =
  /is blocked|doesn.t allow you to view this site|ERR_BLOCKED_BY_ADMINISTRATOR|ERR_BLOCKED_BY_CLIENT/i;

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
    exact: true,
    name: "Уже есть доступ? Войти",
  });
  await expect(loginTab).toBeVisible();
  await loginTab.click();
  await expect(page.locator("#workspace-email")).toBeVisible();
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await openLogin(page);

  const emailInput = page.locator("#workspace-email");
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await page.locator("#workspace-password").fill(password);
  await page.getByRole("button", { exact: true, name: "Войти в кабинет" }).click();
  await expect(page.locator("#v19-operational-side-menu")).toBeVisible();
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
  if (viewportWidth <= 1024) {
    await expect
      .poll(async () => {
        const style = await sideMenu.evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            motionX: computed.getPropertyValue("--v19-side-menu-motion-x").trim(),
            opacity: computed.opacity,
          };
        });
        return {
          motionX: style.motionX,
          opacity: style.opacity,
        };
      })
      .toEqual({ motionX: "0%", opacity: "1" });
  }

  const menuBox = await sideMenu.boundingBox();
  const minimumMenuWidth =
    viewportWidth >= 1025 ? 240 : Math.min(280, viewportWidth - 16);
  expect(menuBox).not.toBeNull();
  expect(menuBox?.x).toBeGreaterThanOrEqual(0);
  expect(menuBox?.width).toBeGreaterThanOrEqual(minimumMenuWidth);
  expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(viewportWidth);

  const brandLogo = sideMenu.locator("img.ops-brand-logo");
  await expect(brandLogo).toBeVisible();
  await expect(brandLogo).toHaveAttribute("alt", "VisaFlow");

  const createButton = sideMenu.getByRole("button", { name: "Новая подача" });
  if ((await createButton.count()) > 0) {
    await expect(createButton).toBeVisible();
    await expect(createButton.locator("strong")).toHaveText("Новая подача");
    await expect(createButton).toHaveCSS("background-color", "rgb(91, 96, 201)");
    await expect
      .poll(() =>
        createButton
          .locator("strong")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
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
      (navIconBox?.y ?? 0) +
        (navIconBox?.height ?? 0) / 2 -
        ((navTextBox?.y ?? 0) + (navTextBox?.height ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(1);

  await expect(sideMenu).toHaveCSS("opacity", "1");
  if (viewportWidth <= 1024) {
    expect(
      await sideMenu.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--v19-side-menu-motion-opacity")
          .trim(),
      ),
    ).toBe("1");
  }

  const inactiveItem = sideMenu
    .locator('.ops-nav-item:not([aria-current="page"])')
    .first();
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
      activeBackground: "rgb(39, 39, 43)",
      activeBorder: "rgba(0, 0, 0, 0)",
      inactiveText: "rgba(255, 255, 255, 0.7)",
      menuBackground: "rgb(22, 22, 23)",
      menuText: "rgba(255, 255, 255, 0.7)",
    });

  const session = sideMenu.getByRole("button", { name: "Открыть профиль" });
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
  await expect(activeItem).toHaveCSS("background-color", "rgb(39, 39, 43)");
  await expect(activeItem.locator(".ops-nav-copy strong")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
}

async function closeVisibleAgentMenu(page: Page): Promise<void> {
  const closeButtons = page.getByRole("button", { name: "Закрыть меню" });
  const count = await closeButtons.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = closeButtons.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }

  throw new Error("Visible agent menu close control was not found.");
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
    await closeVisibleAgentMenu(page);
    await expect(menuDialog).toBeHidden();

    for (const viewport of [
      { height: 740, width: 320 },
      { height: 932, width: 430 },
      { height: 1024, width: 768 },
      { height: 800, width: 1023 },
      { height: 800, width: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(menuTrigger).toBeVisible();
      await menuTrigger.click();
      await expect(menuDialog).toBeVisible();
      await expectUnifiedSideMenuFinish(page, menuDialog, viewport.width);
      await closeVisibleAgentMenu(page);
      await expect(menuDialog).toBeHidden();
    }

    await page.setViewportSize({ height: 800, width: 1025 });
    await expect(sideMenu).toBeVisible();
    await expect(menuTrigger).toBeHidden();
    await expectUnifiedSideMenuFinish(page, sideMenu, 1025);

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
