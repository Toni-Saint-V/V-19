import { expect, test } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
  submissionCard,
} from "./v19-pilot-helpers";

test.describe("V-19 release ops lists export flow", () => {
  test("admin filters lists, opens owner-aware drawer, and forms city-scoped export packages", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "focused desktop proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Работа",
      workspaceEmail: "admin@visaflow.local",
    });

    await clickWorkspaceButton(page, /Работа\. очередь проверки/);
    await expect(submissionCard(page, "Нина Волкова")).toBeVisible();
    await submissionCard(page, "Нина Волкова").click();
    await expect(drawer(page).getByText("Агент: Татьяна Николаева")).toBeVisible();
    await expect(drawer(page).getByText(/Нина Волкова/).first()).toBeVisible();
    await page.getByRole("button", { name: "Закрыть подачу" }).click();

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByRole("heading", { level: 1, name: "Выгрузка" })).toBeVisible();

    await page.getByRole("button", { name: /Фильтр по городу/ }).click();
    await page.getByRole("option", { name: "Санкт-Петербург" }).click();
    await expect(page.locator(".export-row").filter({ hasText: "Никита Морозов" })).toBeVisible();
    await expect(page.locator(".export-row").filter({ hasText: "Семья Волковых" })).toHaveCount(0);

    await page.getByRole("button", { name: /Фильтр по городу/ }).click();
    await page.getByRole("option", { name: "Все города" }).click();
    await page.getByLabel("Фильтр по агенту").selectOption({ label: "Алексей Морозов" });
    await expect(page.locator(".export-row").filter({ hasText: "Ольга Фролова" })).toBeVisible();
    await expect(page.locator(".export-row").filter({ hasText: "Дмитрий Орлов" })).toHaveCount(0);

    await page.getByLabel("Фильтр по агенту").selectOption({ label: "Все агенты" });
    await page.getByLabel("Поиск в текущем списке").fill("660011022");
    await expect(page.locator(".export-row").filter({ hasText: "Семья Волковых" })).toBeVisible();
    await expect(page.locator(".export-row").filter({ hasText: "Ольга Фролова" })).toHaveCount(0);
    await page.getByLabel("Поиск в текущем списке").fill("");

    const familyRow = page.locator(".export-row").filter({ hasText: "Семья Волковых" });
    const singleRow = page.locator(".export-row").filter({ hasText: "Ольга Фролова" });
    await expect(familyRow).toBeVisible();
    await expect(familyRow).toContainText("3");
    await expect(singleRow).toBeVisible();
    await expect(singleRow).toContainText("1");

    await clearExportSelection(page);
    await page
      .locator(".export-row")
      .filter({ hasText: "Семья Волковых" })
      .getByRole("checkbox")
      .check();
    await page
      .locator(".export-row")
      .filter({ hasText: "Ольга Фролова" })
      .getByRole("checkbox")
      .check();
    await expect(page.getByText(/разных агентов/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Сформировать Эксель" })).toBeEnabled();
    await page.getByRole("button", { name: "Сформировать Эксель" }).click();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();

    await clearExportSelection(page);
    await page
      .locator(".export-row")
      .filter({ hasText: "Семья Волковых" })
      .getByRole("checkbox")
      .check();
    await page
      .locator(".export-row")
      .filter({ hasText: "Никита Морозов" })
      .getByRole("checkbox")
      .check();
    await expect(page.getByText("Нельзя смешивать разные города").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Сформировать Эксель" })).toBeDisabled();

    await openFreshWorkspace(page, {
      heading: "Входящие",
      workspaceEmail: "agent@visaflow.local",
    });
    await clickWorkspaceButton(page, /Мои подачи/);
    await page.getByLabel("Поиск по подачам").fill("Ольга Фролова");
    await expect(page.getByText("Ольга Фролова")).toHaveCount(0);
    await expect(page.getByText(/appointment_list_pdf|application_form_pdf/)).toHaveCount(0);

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
