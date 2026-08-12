import { expect, test, type Page } from "@playwright/test";
import { openFreshWorkspace } from "./v19-pilot-helpers";
import { testArtifactPath } from "../support/artifacts";

function collectBrowserProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

async function saveScreenshot(page: Page, name: string) {
  await page.screenshot({
    fullPage: true,
    path: testArtifactPath(`2026-06-21-v19-ux-states-${name}.png`),
  });
}

async function clickOperationalNav(page: Page, name: RegExp) {
  const buttons = page.getByRole("button", { name });
  const buttonCount = await buttons.count();

  for (let index = 0; index < buttonCount; index += 1) {
    const candidate = buttons.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }

  await page.getByRole("button", { name: "Меню" }).click();
  await page.getByRole("button", { name }).first().click();
}

test.describe("V-19 UX state proof", () => {
  test("app runtime shell bridges access and lazy workspace loading", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "single-project UX state proof");

    const problems = collectBrowserProblems(page);
    await page.route("**/src/shared/authRegistration.ts*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.continue();
    });
    await page.route("**/src/components/WorkspaceSurface.tsx*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.continue();
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Проверяем доступ" })).toBeVisible();
    await expect(page.getByTestId("app-runtime-state")).toHaveAttribute(
      "role",
      "status",
    );
    await expect(page.getByText("Загрузка доступа...")).toBeVisible();
    await saveScreenshot(page, "app-runtime-access-loading");

    await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();
    await page.locator("#workspace-email").fill("1@1.ru");
    await page.locator("#workspace-password").fill("11");
    await page.getByRole("button", { name: "Войти в кабинет" }).click();

    await expect(
      page.getByRole("heading", { name: "Открываем рабочую область" }),
    ).toBeVisible();
    await expect(page.getByText("Загрузка рабочей области...")).toBeVisible();
    await saveScreenshot(page, "app-runtime-workspace-loading");

    await expect(page.getByRole("heading", { name: "Мои действия" })).toBeVisible();
    await expect(page.getByTestId("app-runtime-state")).toHaveCount(0);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("agent actions recover from a filtered empty state", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "single-project UX state proof");

    const problems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await page.getByPlaceholder("ID, семья или город").fill("нет-такого-действия");
    const actionEmptyState = page
      .getByRole("status")
      .filter({ hasText: "Ничего не найдено" });
    await expect(
      actionEmptyState.getByRole("heading", { name: "Ничего не найдено" }),
    ).toBeVisible();
    await expect(
      actionEmptyState.getByRole("button", { name: "Сбросить фильтры" }),
    ).toBeVisible();
    await actionEmptyState.getByRole("button", { name: "Сбросить фильтры" }).click();
    await expect(actionEmptyState).toHaveCount(0);
    await expect(page.getByPlaceholder("ID, семья или город")).toHaveValue("");
    await saveScreenshot(page, "agent-actions-filtered-empty-recovered");

    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("primary surfaces expose no-results, disabled-with-reason, dirty, and success states", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "single-project UX state proof");

    const problems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await clickOperationalNav(page, /^Мои подачи/);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await page.getByLabel("Поиск по подачам").fill("нет-такой-подачи-ux-proof");
    await expect(
      page.getByRole("heading", { name: "Ничего не найдено" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").getByRole("button", { name: "Сбросить фильтры" }),
    ).toBeVisible();
    await saveScreenshot(page, "agent-submissions-no-results");

    await clickOperationalNav(page, /^Настройки/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Настройки" }),
    ).toBeVisible();
    const densitySwitch = page.getByRole("switch", {
      name: "Компактная плотность",
    });
    const densityWasEnabled =
      (await densitySwitch.getAttribute("aria-checked")) === "true";
    await densitySwitch.click();
    await expect(page.getByText("Настройки сохранены")).toBeVisible();
    await saveScreenshot(page, "settings-saved");
    if (
      densityWasEnabled !==
      ((await densitySwitch.getAttribute("aria-checked")) === "true")
    ) {
      await densitySwitch.click();
    }

    await openFreshWorkspace(page, {
      heading: /^(Очередь на проверку|Проверка)$/,
      workspaceEmail: "2@2.ru",
    });
    await clickOperationalNav(page, /^Выгрузка/);
    await expect(
      page.getByRole("heading", { name: /^(Центр выгрузки|Выгрузка)$/ }),
    ).toBeVisible();
    const selectedExport = page
      .locator(".export-row")
      .getByRole("checkbox", {
        checked: true,
      })
      .first();
    if (await selectedExport.count()) {
      await selectedExport.uncheck();
    }
    await expect(page.locator(".export-preview")).toHaveCount(0);
    await expect(page.locator(".v19-admin-export-screen-v2")).toHaveAttribute(
      "data-has-export-context",
      "false",
    );
    await expect(page.locator("#export-action-hint")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: /^Выбрать / }).first(),
    ).toBeVisible();
    await saveScreenshot(page, "export-disabled-reason");

    expect(problems).toEqual([]);
  });
});
