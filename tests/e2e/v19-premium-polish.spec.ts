import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  openFreshWorkspace,
  openMobileMenu,
} from "./v19-pilot-helpers";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function expectVisibleControlsAtLeast(locator: Locator, minSize: number) {
  const undersized = await locator.evaluateAll(
    (elements, minimum) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" && style.visibility !== "hidden" && rect.width > 0
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            ariaLabel: element.getAttribute("aria-label"),
            className: element.getAttribute("class"),
            height: rect.height,
            tag: element.tagName,
            width: rect.width,
          };
        })
        .filter(
          (measurement) => measurement.height < minimum || measurement.width < minimum,
        ),
    minSize,
  );

  expect(undersized).toEqual([]);
}

test.describe("V-19 premium polish contract", () => {
  test("agent shell keeps premium responsive ergonomics", async ({ page }) => {
    const problems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page);
    await expectNoHorizontalOverflow(page);

    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--v19-polish-touch-target")
            .trim(),
        ),
      )
      .toBe("44px");

    await expectVisibleControlsAtLeast(
      page.locator(
        ".v19-topbar-menu, .v19-admin-list-header > button, .v19-admin-toolbar-select-trigger, .v19-city-filter-trigger, .v19-agent-filter",
      ),
      44,
    );

    const search = page.getByPlaceholder("ID, семья или город");
    await search.fill("нет-такого-действия");
    const emptyState = page
      .getByRole("status")
      .filter({ hasText: "Ничего не найдено" });
    await expect(
      emptyState.getByRole("heading", { name: "Ничего не найдено" }),
    ).toBeVisible();
    await emptyState.getByRole("button", { name: "Сбросить фильтры" }).click();

    await openMobileMenu(page);
    const menu = page.getByRole("dialog", { exact: true, name: "Меню агента" });
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox?.width).toBeGreaterThanOrEqual(320);
    expect(menuBox?.width).toBeLessThanOrEqual(366);
    expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(390);

    await expectVisibleControlsAtLeast(
      menu.getByRole("button", { name: "Закрыть меню" }),
      44,
    );
    await expectNoHorizontalOverflow(page);
    expect(problems).toEqual([]);
  });

  test("admin tools behave as complete responsive product surfaces", async ({
    page,
  }) => {
    const problems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, { workspaceEmail: "2@2.ru" });

    await clickWorkspaceButton(page, "Пользователи");
    await expect(
      page.getByRole("heading", { level: 1, name: "Управление пользователями" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Пользователи и заявки" }),
    ).toBeVisible();
    await expect(page.getByLabel("Сводка заявок")).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Статус заявки" })).toBeVisible();
    await expect(page.getByLabel("Найти пользователя или компанию")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await clickWorkspaceButton(page, "Настройки");
    await expect(
      page.getByRole("heading", { level: 1, name: "Системные настройки" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Системные настройки" }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "AI-контекст в работе" }),
    ).toBeVisible();
    await expect(page.getByLabel("Состояние системы")).toBeVisible();

    await page.setViewportSize({ height: 844, width: 390 });
    await expectNoHorizontalOverflow(page);
    await expectVisibleControlsAtLeast(
      page.locator(".v19-topbar-menu, .v19-admin-header-identity"),
      44,
    );

    await openMobileMenu(page);
    await expect(
      page.getByRole("dialog", { exact: true, name: "Меню администратора" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(problems).toEqual([]);
  });
});
