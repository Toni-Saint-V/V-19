import { expect, test } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  openFreshWorkspace,
  submissionCardById,
} from "./v19-pilot-helpers";

test.describe("V-19 release ops lists export flow", () => {
  test("admin filters lists, opens owner-aware review workspace, and forms city-scoped export packages", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "focused desktop proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    await clickWorkspaceButton(page, /Проверка|Работа/);
    await expect(submissionCardById(page, "ПД-1053")).toBeVisible();
    await expect(submissionCardById(page, "ПД-1053")).toContainText("Агент VisaFlow");
    await submissionCardById(page, "ПД-1053").click();
    const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
    await expect(reviewWorkspace).toBeVisible();
    await expect(reviewWorkspace).toContainText("Нина Волкова");
    await expect(
      reviewWorkspace.getByRole("tab", { name: "Паспорт", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(reviewWorkspace.getByText(/Нина Волкова/).first()).toBeVisible();
    await reviewWorkspace.getByRole("button", { name: "Вернуться к очереди" }).click();

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();

    const cityFilter = page.getByRole("button", { name: /^Фильтр городов:/ });
    await cityFilter.click();
    await page.getByRole("option", { name: "Москва" }).click();
    await expect(cityFilter).toHaveAccessibleName("Фильтр городов: Москва");
    await expect(page.getByTestId("admin-export-row-ПД-1054")).toBeVisible();

    await cityFilter.click();
    await page.getByRole("option", { name: "Города", exact: true }).click();
    const agentFilter = page.getByRole("button", { name: /^Агент:/ });
    await agentFilter.click();
    const firstConcreteAgent = page
      .getByRole("option")
      .filter({ hasNotText: "Все агенты" })
      .first();
    await expect(firstConcreteAgent).toBeVisible();
    await firstConcreteAgent.click();
    await expect(agentFilter).not.toHaveAccessibleName("Агент: Все агенты");
    await expect(page.locator(".export-row").first()).toBeVisible();

    await agentFilter.click();
    await page.getByRole("option", { name: "Все агенты" }).click();
    await page.getByLabel("ID, семья или агент").fill("SUB-1102");
    await expect(page.getByTestId("admin-export-row-SUB-1102")).toBeVisible();
    await expect(page.locator(".export-row")).toHaveCount(1);
    await page.getByLabel("ID, семья или агент").fill("");

    const familyRow = page.getByTestId("admin-export-row-SUB-1102");
    const singleRow = page.getByTestId("admin-export-row-SUB-1101");
    await expect(familyRow).toBeVisible();
    await expect(singleRow).toBeVisible();

    await clearExportSelection(page);
    await familyRow.getByRole("checkbox").check();
    await singleRow.getByRole("checkbox").check();
    await expect(
      page.getByRole("complementary", { name: "Контроль пакета" }),
    ).toContainText(/2 пакета/);
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();
    const excelDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать Excel" }).click();
    await excelDownload;
    await expect(page.getByRole("button", { name: "Excel скачан" })).toBeDisabled();

    await clearExportSelection(page);
    await page.getByRole("button", { name: "Стоп" }).click();
    await expect(page.getByText("Пакетов с ограничениями нет")).toBeVisible();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();

    await openFreshWorkspace(page, {
      heading: "Мои действия",
      workspaceEmail: "agent@visaflow.local",
    });
    await clickWorkspaceButton(page, /Мои подачи/);
    await page.getByLabel("Поиск по подачам").fill("Ольга Фролова");
    await expect(
      page.getByRole("status").filter({ hasText: "Ничего не найдено" }).first(),
    ).toContainText("Ничего не найдено");
    await expect(
      page.locator("[data-submission-card]").filter({ hasText: "Ольга Фролова" }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/appointment_list_pdf|application_form_pdf/),
    ).toHaveCount(0);

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
