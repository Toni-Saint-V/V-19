import { expect, test, type Page } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  expectNoHorizontalOverflow,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

function exportRowById(page: Page, submissionId: string) {
  return page.getByTestId(`admin-export-row-${submissionId}`);
}

function exportRail(page: Page) {
  return page.getByRole("complementary", { name: "Контроль пакета" });
}

async function selectExportPackage(page: Page, submissionId: string) {
  const row = exportRowById(page, submissionId);
  await expect(row).toBeVisible();
  await row.click();
  await expect(row.getByRole("checkbox")).toBeChecked();
}

async function openMobileExportControl(page: Page) {
  const controlToggle = page.getByRole("button", { name: /^Контроль пакета/ });
  await expect(controlToggle).toBeVisible();
  await controlToggle.click();
  await expect(page.locator(".v19-admin-export-rail-v2.is-mobile-open")).toBeVisible();
}

test.describe("V-19 export click and section matrix", () => {
  test("admin export keeps the current one-click Excel contract actionable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop export proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { workspaceEmail: "admin@visaflow.local" });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "desktop export initial");

    const rail = exportRail(page);
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();
    await expect(rail).toContainText("Выберите хотя бы одну подачу");

    const activeRow = exportRowById(page, "ПД-1054");
    await expect(activeRow).toBeVisible();
    await activeRow.click();
    await expect(rail).toContainText("Текущая выгрузка");
    await expect(rail).toContainText("1 пакет");

    await clearExportSelection(page);
    await selectExportPackage(page, "ПД-1054");
    await expect(rail).toContainText("1 пакет");
    await expect(rail).toContainText("готово");
    const excelButton = rail.getByRole("button", { name: "Скачать Excel" });
    await expect(excelButton).toBeEnabled();
    const excelDownloadPromise = page.waitForEvent("download");
    await excelButton.click();
    const excelDownload = await excelDownloadPromise;
    expect(excelDownload.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await expect(excelDownload.failure()).resolves.toBeNull();
    await expect(rail.getByRole("button", { name: "Excel скачан" })).toBeDisabled();
    await expect(rail.locator("#export-action-hint")).toContainText("Excel скачан:");
    await expectNoHorizontalOverflow(page, "desktop export after Excel");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("admin export queue tabs and filters keep empty states truthful", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop queue-state proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { workspaceEmail: "admin@visaflow.local" });
    await clickWorkspaceButton(page, /Выгрузка/);
    await clearExportSelection(page);

    await page.getByRole("button", { name: "Выбрано" }).click();
    await expect(page.getByText("Пакеты не выбраны")).toBeVisible();

    await page.getByRole("button", { name: "Стоп" }).click();
    await expect(page.getByText("Пакетов с ограничениями нет")).toBeVisible();
    await expect(
      exportRail(page).getByRole("button", { name: "Скачать Excel" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Доступно" }).click();
    const typeFilter = page.getByRole("button", { name: /^Тип:/ });
    await typeFilter.click();
    await page.getByRole("option", { name: "Семьи" }).click();
    await expect(page.locator(".export-row").first()).toBeVisible();

    await page.getByLabel("ID, семья или агент").fill("SUB-1102");
    await expect(exportRowById(page, "SUB-1102")).toBeVisible();
    await expect(page.locator(".export-row")).toHaveCount(1);

    await page.getByLabel("ID, семья или агент").fill("");
    await typeFilter.click();
    await page.getByRole("option", { name: "Все типы" }).click();
    await expect(typeFilter).toHaveAccessibleName("Тип: Все типы");
    await expectNoHorizontalOverflow(page, "desktop export queue tabs and filters");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("mobile export control sheet stays reachable and closable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile export proof");
    const browserProblems = collectBrowserProblems(page);

    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, { workspaceEmail: "admin@visaflow.local" });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile export initial");

    await clearExportSelection(page);
    await selectExportPackage(page, "ПД-1054");
    await expect(page.getByRole("button", { name: /^Контроль пакета/ })).toContainText(
      /1 пакет/,
    );

    await openMobileExportControl(page);
    const rail = exportRail(page);
    await expect(rail).toContainText("Текущая выгрузка");
    await expect(rail.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();
    await expectNoHorizontalOverflow(page, "mobile export control sheet");

    const screenshotPath = testInfo.outputPath("admin-export-mobile-control.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("admin-export-mobile-control", {
      contentType: "image/png",
      path: screenshotPath,
    });

    await rail.getByRole("button", { name: "Закрыть контроль пакета" }).click();
    await expect(rail).not.toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile export control closed");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
