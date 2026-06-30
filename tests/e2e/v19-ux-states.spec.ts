import { expect, test, type Page } from "@playwright/test";

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

async function openFreshWorkspace(
  page: Page,
  options: { heading?: string; workspaceEmail?: string } = {},
) {
  await page.goto("/");
  await page.evaluate(() => {
    (
      globalThis as unknown as { localStorage: { clear(): void } }
    ).localStorage.clear();
  });
  if (options.workspaceEmail) {
    await page.evaluate((workspaceEmail) => {
      (
        globalThis as unknown as {
          localStorage: { setItem(key: string, value: string): void };
        }
      ).localStorage.setItem("visaflow.workspaceEmail.v1", workspaceEmail);
    }, options.workspaceEmail);
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: options.heading ?? "Мои действия" }),
  ).toBeVisible();
}

async function saveScreenshot(page: Page, name: string) {
  await page.screenshot({
    fullPage: true,
    path: `docs/qa/2026-06-21-v19-ux-states-${name}.png`,
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
  test("primary surfaces expose no-results, disabled-with-reason, dirty, and success states", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "single-project UX state proof");

    const problems = collectBrowserProblems(page);

    await openFreshWorkspace(page);
    await clickOperationalNav(page, /^Мои подачи/);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await page.getByLabel("Поиск по подачам").fill("нет-такой-подачи-ux-proof");
    await expect(page.getByRole("heading", { name: "Ничего не найдено" })).toBeVisible();
    await expect(
      page.getByRole("status").getByRole("button", { name: "Сбросить фильтры" }),
    ).toBeVisible();
    await saveScreenshot(page, "agent-submissions-no-results");

    await clickOperationalNav(page, /^Настройки/);
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
    await page.getByLabel("Сводка по действиям").selectOption("daily");
    await expect(page.getByText("Есть несохранённые изменения")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сохранить" })).toBeEnabled();
    await saveScreenshot(page, "settings-dirty");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Настройки сохранены")).toBeVisible();

    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });
    await clickOperationalNav(page, /^Выгрузка/);
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    const selectedExport = page
      .locator(".export-row")
      .filter({ hasText: "Дмитрий Орлов" })
      .getByRole("checkbox");
    await expect(selectedExport).toBeChecked();
    await selectedExport.uncheck();
    await expect(page.locator(".export-preview").getByText("Пакет не выбран")).toBeVisible();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Выберите хотя бы одну подачу",
    );
    await expect(
      page.getByRole("button", { name: "Сформировать Эксель" }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Скачать" })).toBeDisabled();
    await saveScreenshot(page, "export-disabled-reason");

    expect(problems).toEqual([]);
  });
});
