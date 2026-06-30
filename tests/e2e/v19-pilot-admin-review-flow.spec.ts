import { expect, test, type Page } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  expectDrawerStatus,
  openDrawerTab,
  openFreshWorkspace,
  submissionCard,
} from "./v19-pilot-helpers";

async function openAdminSubmission(
  page: Page,
  cardText: string,
  drawerTitle = cardText,
) {
  const targetCard = submissionCard(page, cardText);
  await expect(targetCard).toBeVisible();
  await targetCard.click();
  await expect(
    drawer(page)
      .getByRole("heading", { name: drawerTitle })
      .or(drawer(page).getByText(drawerTitle).first())
      .first(),
  ).toBeVisible();
}

test.describe("V-19 pilot admin review click flow", () => {
  test("admin queue opens drawer tabs and returns a precise field issue", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop pilot runs once");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });
    await expect(page.getByRole("button", { name: "Входящие" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Мои подачи" })).toHaveCount(0);

    await clickWorkspaceButton(page, /Проверка|Работа/);
    await expect(submissionCard(page, "Нина Волкова")).toBeVisible();
    await openAdminSubmission(page, "Нина Волкова");

    await openDrawerTab(page, ["Паспорт"]);
    await openDrawerTab(page, ["Селфи"]);
    await openDrawerTab(page, ["Анкета", "Данные"]);
    await openDrawerTab(page, ["Замечания"]);

    await openDrawerTab(page, ["Замечания"]);
    await drawer(page).getByRole("button", { name: "Добавить замечание" }).click();
    await expect(drawer(page).getByLabel("Новое замечание")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Создать замечание" }).click();

    const issueSummary = drawer(page)
      .locator("article")
      .filter({ hasText: "Требуется уточнение" })
      .filter({ hasText: "Нина Волкова" })
      .filter({ hasText: "Анкета" })
      .first();
    await expect(issueSummary).toBeVisible();
    await drawer(page).getByRole("button", { exact: true, name: "Вернуть" }).click();
    await expectDrawerStatus(page, "Возвращено");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("admin closes corrections and downloads Excel-only export", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop pilot runs once");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });
    await openAdminSubmission(page, "Петровы", "Семья Петровых");
    await expect(drawer(page).getByText("Исправлено агентом")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Закрыть и принять" }).click();
    await expectDrawerStatus(page, "Готово к выгрузке");
    await drawer(page)
      .getByRole("button", { name: /Закрыть (подачу|проверку)/ })
      .click();

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Выгрузка" }),
    ).toBeVisible();
    await clearExportSelection(page);
    await page
      .locator(".export-row")
      .filter({ hasText: "Семья Петровых" })
      .getByRole("checkbox")
      .check();
    await expect(
      page.getByRole("heading", { name: "1 подача · 2 заявителя" }),
    ).toBeVisible();
    await expect(page.getByText("Sheet1 · предпросмотр")).toBeVisible();
    await expect(page.getByText(/ZIP|zip/)).toHaveCount(0);

    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await expect(download.failure()).resolves.toBeNull();

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
