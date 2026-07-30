import { expect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";

const blockedText =
  /is blocked|doesn.t allow you to view this site|ERR_BLOCKED_BY_ADMINISTRATOR|ERR_BLOCKED_BY_CLIENT/i;

function evidencePath(
  testInfo: { outputPath: (name: string) => string },
  name: string,
) {
  const externalRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();
  return externalRoot ? join(externalRoot, name) : testInfo.outputPath(name);
}

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

  const profileAvatar = sideMenu.locator(".v19-side-menu-avatar");
  const profileCopy = sideMenu.locator(".v19-side-menu-profile-copy");
  await expect(profileAvatar).toBeVisible();
  await expect(profileCopy).toBeVisible();

  const createButton = sideMenu.getByRole("button", { name: "Новая подача" });
  if ((await createButton.count()) > 0) {
    await expect(createButton).toBeVisible();
    await expect(createButton.locator("strong")).toHaveText("Начать новую подачу");
    await expect(createButton.locator(".v19-side-menu-create-action")).toHaveCSS(
      "background-color",
      "rgb(91, 96, 201)",
    );
    await expect(
      sideMenu
        .getByRole("navigation", { name: "Операционные разделы" })
        .getByRole("button", { name: "Новая подача" }),
    ).toHaveCount(0);
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
  const navCopyBox = await activeItem.locator(".ops-nav-copy").boundingBox();
  expect(navIconBox).not.toBeNull();
  expect(navCopyBox).not.toBeNull();
  expect(
    Math.abs(
      (navIconBox?.y ?? 0) +
        (navIconBox?.height ?? 0) / 2 -
        ((navCopyBox?.y ?? 0) + (navCopyBox?.height ?? 0) / 2),
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
      activeBackground: "rgba(91, 96, 201, 0.16)",
      activeBorder: "rgba(173, 182, 255, 0.36)",
      inactiveText: "rgba(242, 243, 245, 0.62)",
      menuBackground: "rgb(22, 22, 23)",
      menuText: "rgba(242, 243, 245, 0.92)",
    });

  const session = sideMenu.getByRole("button", { name: "Открыть профиль" });
  const avatarBox = await session.locator(".v19-side-menu-avatar").boundingBox();
  const sessionTextBox = await session
    .locator(".v19-side-menu-profile-copy")
    .boundingBox();
  expect(avatarBox).not.toBeNull();
  expect(sessionTextBox).not.toBeNull();
  expect(sessionTextBox?.x).toBeGreaterThanOrEqual(
    (avatarBox?.x ?? 0) + (avatarBox?.width ?? 0),
  );
}

async function expectMyActionsActiveMenuState(sideMenu: Locator): Promise<void> {
  const activeItem = sideMenu.locator('.ops-nav-item[aria-current="page"]');
  await expect(activeItem).toHaveCSS("background-color", "rgba(91, 96, 201, 0.16)");
  await expect(activeItem.locator(".ops-nav-copy strong")).toHaveCSS(
    "color",
    "rgb(242, 243, 245)",
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
    await page.screenshot({
      fullPage: false,
      path: evidencePath(testInfo, "agent-desktop-menu.png"),
    });
    const collapseMenu = sideMenu.getByRole("button", {
      name: "Свернуть меню",
    });
    await expect(collapseMenu).toBeVisible();
    await collapseMenu.click();
    await expect(sideMenu).toHaveAttribute("data-side-menu-mode", "compact");
    await expect
      .poll(async () => Math.round((await sideMenu.boundingBox())?.width ?? 0))
      .toBe(104);
    await expect(sideMenu.locator(".ops-nav-copy").first()).toBeHidden();
    const compactActionsItem = sideMenu.getByRole("button", {
      exact: true,
      name: "Мои действия",
    });
    await compactActionsItem.hover();
    await expect(
      compactActionsItem.locator(".v19-side-menu-compact-flyout"),
    ).toBeVisible();
    await page.screenshot({
      fullPage: false,
      path: evidencePath(testInfo, "agent-desktop-menu-compact.png"),
    });
    await sideMenu.getByRole("button", { name: "Развернуть меню" }).click();
    await expect(sideMenu).toHaveAttribute("data-side-menu-mode", "regular");
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
    await menuTrigger.focus();
    await menuTrigger.click();

    const menuDialog = page.getByRole("dialog", { name: "Меню агента" });
    await expect(menuDialog).toBeVisible();
    await expect(sideMenu).toHaveCount(1);
    await expectUnifiedSideMenuFinish(page, menuDialog, 390);
    const firstMenuControl = menuDialog.getByRole("button", {
      name: "Открыть профиль",
    });
    const lastMenuControl = menuDialog.getByRole("button", { name: "Выйти" });
    const workspace = page.locator(".workspace");
    await expect(firstMenuControl).toBeFocused();
    await expect(workspace).toHaveAttribute("aria-hidden", "true");
    await expect(workspace).toHaveAttribute("inert", "");
    await page.keyboard.press("Shift+Tab");
    await expect(lastMenuControl).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(firstMenuControl).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menuDialog).toBeHidden();
    await expect(menuTrigger).toBeFocused();
    await expect(workspace).not.toHaveAttribute("aria-hidden");
    await expect(workspace).not.toHaveAttribute("inert");
    await menuTrigger.click();
    await expect(menuDialog).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      fullPage: false,
      path: evidencePath(testInfo, "agent-mobile-menu.png"),
    });
    await closeVisibleAgentMenu(page);
    await expect(menuDialog).toBeHidden();
    await menuTrigger.click();
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name: "Открыть командную палитру" }).click();
    await expect(menuDialog).toBeHidden();
    const agentPalette = page.getByRole("dialog", {
      name: "Командная палитра агента",
    });
    await expect(agentPalette).toBeVisible();
    await expect(agentPalette.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(agentPalette).toBeHidden();
    await expect(menuDialog).toBeHidden();
    await expect(menuTrigger).toBeFocused();
    await menuTrigger.click();
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name: "Открыть командную палитру" }).click();
    await expect(agentPalette).toBeVisible();
    await page.keyboard.press("Control+K");
    await expect(agentPalette).toBeHidden();
    await expect(menuDialog).toBeHidden();
    await expect(menuTrigger).toBeFocused();

    await page.setViewportSize({ height: 390, width: 844 });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();
    await expect(menuDialog).toBeVisible();
    await expectUnifiedSideMenuFinish(page, menuDialog, 844);

    const shortLandscapeNav = menuDialog.getByRole("navigation", {
      name: "Операционные разделы",
    });
    const lastShortLandscapeNavItem = shortLandscapeNav.locator(".ops-nav-item").last();
    const shortLandscapeNavMetrics = await shortLandscapeNav.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        overflowY: computed.overflowY,
        scrollHeight: element.scrollHeight,
      };
    });
    expect(shortLandscapeNavMetrics.overflowY).toBe("auto");
    expect(shortLandscapeNavMetrics.scrollHeight).toBeGreaterThan(
      shortLandscapeNavMetrics.clientHeight,
    );
    await shortLandscapeNav.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(() => shortLandscapeNav.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(lastShortLandscapeNavItem).toBeInViewport();

    await expect(
      menuDialog.getByRole("button", { name: "Новая подача" }),
    ).toBeVisible();
    await expect(menuDialog.locator(".v19-side-menu-create-copy")).toBeHidden();
    await expect(menuDialog.getByRole("button", { name: "Выйти" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.body.scrollWidth <= innerWidth &&
            document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      fullPage: false,
      path: evidencePath(testInfo, "agent-short-landscape-menu.png"),
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

    await page.setViewportSize({ height: 800, width: 1024 });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name: "Закрыть меню" }).focus();
    await page.setViewportSize({ height: 800, width: 1025 });
    await expect(menuDialog).toBeHidden();
    await expect(menuTrigger).toBeHidden();
    await expect(
      sideMenu.getByRole("button", { name: "Открыть профиль" }),
    ).toBeFocused();

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
      path: evidencePath(testInfo, "admin-desktop-menu.png"),
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
      path: evidencePath(testInfo, "admin-mobile-menu.png"),
    });
    await menuDialog.getByRole("button", { name: "Открыть командную палитру" }).click();
    await expect(menuDialog).toBeHidden();
    const adminPalette = page.getByRole("dialog", {
      name: "Командная палитра администратора",
    });
    await expect(adminPalette).toBeVisible();
    await expect(adminPalette.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(adminPalette).toBeHidden();
    await expect(menuTrigger).toBeFocused();
    await menuTrigger.click();
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name: "Открыть командную палитру" }).click();
    await expect(adminPalette).toBeVisible();
    await page.keyboard.press("Control+K");
    await expect(adminPalette).toBeHidden();
    await expect(menuDialog).toBeHidden();
    await expect(menuTrigger).toBeFocused();
    await menuTrigger.click();
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { exact: true, name: "Проверка" }).click();
    await expect(menuDialog).toBeHidden();
    await expect(page.locator(".v19-page-header h1")).toHaveText("Очередь на проверку");
    expect(consoleErrors).toEqual([]);
  });
});
