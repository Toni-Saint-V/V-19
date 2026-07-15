import { expect, test } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
  submissionCardById,
} from "./v19-pilot-helpers";

test.describe("V-19 release ops lists export flow", () => {
  test("admin filters lists, opens owner-aware drawer, and forms city-scoped export packages", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "focused desktop proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });

    await clickWorkspaceButton(page, /Проверка|Работа/);
    await expect(submissionCardById(page, "ПД-1053")).toBeVisible();
    await expect(submissionCardById(page, "ПД-1053")).toContainText(
      "local-agent-tony",
    );
    await submissionCardById(page, "ПД-1053").click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toContainText("Нина Волкова");
    await expect(drawer(page).getByRole("tab", { name: /Файлы/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      drawer(page)
        .getByText(/Нина Волкова/)
        .first(),
    ).toBeVisible();
    await drawer(page)
      .getByRole("button", { name: /Закрыть (подачу|проверку)/ })
      .click();

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Выгрузка" }),
    ).toBeVisible();

    const cityFilter = page.getByRole("button", { name: /^Фильтр городов:/ });
    await cityFilter.click();
    await page.getByRole("option", { name: "Москва" }).click();
    await expect(cityFilter).toHaveAccessibleName("Фильтр городов: Москва");
    await expect(
      page.locator(".export-row").filter({ hasText: "ПД-1054" }),
    ).toBeVisible();

    await cityFilter.click();
    await page.getByRole("option", { name: "Все города" }).click();
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
    await expect(
      page.locator(".export-row").filter({ hasText: "SUB-1102" }),
    ).toBeVisible();
    await expect(page.locator(".export-row")).toHaveCount(1);
    await page.getByLabel("ID, семья или агент").fill("");

    const familyRow = page.locator(".export-row").filter({ hasText: "SUB-1102" });
    const singleRow = page.locator(".export-row").filter({ hasText: "SUB-1101" });
    await expect(familyRow).toBeVisible();
    await expect(singleRow).toBeVisible();

    await clearExportSelection(page);
    await familyRow.getByRole("checkbox").check();
    await singleRow.getByRole("checkbox").check();
    await expect(page.getByRole("complementary", { name: "Контроль пакета" })).toContainText(
      /2 пакета/,
    );
    await expect(
      page.getByRole("button", { name: "Сформировать Excel" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();

    await clearExportSelection(page);
    await page.getByRole("button", { name: "Стоп" }).click();
    await expect(page.getByText("Пакетов с ограничениями нет")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сформировать Excel" })).toBeDisabled();

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
