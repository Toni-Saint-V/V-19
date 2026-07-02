import { expect, test, type Page } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  expectNoHorizontalOverflow,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

function exportStatus(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text }).first();
}

test.describe("V-19 export click and section matrix", () => {
  test("admin export actions move through package, download, history, and PDF context", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop export proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { workspaceEmail: "admin@visaflow.local" });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Выгрузка" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "desktop export initial");
    await page.screenshot({
      fullPage: true,
      path: "docs/qa/export-click-section-matrix-20260629/export-desktop-initial.png",
    });

    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Отметить выгружено" }),
    ).toBeDisabled();
    await expect(exportStatus(page, "Сначала сформируйте Excel")).toContainText(
      "Сначала сформируйте Excel",
    );

    await page.getByRole("button", { name: "Закрыть панель" }).click();
    await expect(page.getByLabel("Контекст выгрузки")).toHaveCount(0);
    await page.getByRole("button", { name: "Открыть контракт выгрузки" }).click();
    await expect(page.getByLabel("Контекст выгрузки")).toBeVisible();

    await clearExportSelection(page);
    await page
      .locator(".export-row")
      .filter({ hasText: "Семья Волковых" })
      .getByRole("button", { name: /Семья Волковых/ })
      .first()
      .click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByText("Семья Волковых")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Закрыть проверку" }).click();
    await expect(drawer(page)).toHaveCount(0);

    await page
      .locator(".export-row")
      .filter({ hasText: "Ольга Фролова" })
      .getByRole("checkbox")
      .check();
    await expect(exportStatus(page, "Сначала сформируйте Excel")).toContainText(
      "Сначала сформируйте Excel",
    );
    await expect(
      page.getByRole("button", { name: "Сформировать Excel" }),
    ).toBeEnabled();

    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    await expect(
      exportStatus(page, "Файл сформирован. Теперь скачайте его."),
    ).toContainText(
      "Файл сформирован. Теперь скачайте его.",
    );
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await expect(download.failure()).resolves.toBeNull();
    await expect(
      exportStatus(page, "Файл скачан. Можно отметить подачу выгруженной."),
    ).toContainText(
      "Файл скачан. Можно отметить подачу выгруженной.",
    );

    await page.getByRole("button", { name: "Отметить выгружено" }).click();
    await expect(page.getByRole("tab", { name: /История/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.locator(".export-history-table").getByText("Ольга Фролова"),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: "docs/qa/export-click-section-matrix-20260629/export-desktop-history.png",
    });

    const exportedHistoryRow = page
      .locator(".export-row")
      .filter({ hasText: "Ольга Фролова" });
    await expect(
      exportedHistoryRow.getByRole("button", { name: /^(Открыть|Проверить) PDF$/ }),
    ).toHaveCount(0);
    await expect(exportedHistoryRow.getByText("Нужна проверка PDF")).toBeVisible();
    await expect(
      exportedHistoryRow.getByText("PDF записи отсутствует."),
    ).toBeVisible();
    await exportedHistoryRow.getByRole("button", { name: /Ольга Фролова/ }).click();
    await expect(drawer(page)).toBeVisible();

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("admin export blockers explain why disabled actions are blocked", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop blocker proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { workspaceEmail: "admin@visaflow.local" });
    await clickWorkspaceButton(page, /Выгрузка/);
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

    await expect(exportStatus(page, "Нельзя смешивать разные города")).toContainText(
      "Нельзя смешивать разные города",
    );
    const generateButton = page.getByRole("button", { name: "Сформировать Excel" });
    await expect(generateButton).toBeDisabled();
    const disabledReasonId = await generateButton.getAttribute("aria-describedby");

    expect(disabledReasonId, "generate disabled reason id").toBeTruthy();
    await expect(page.locator(`[id="${disabledReasonId}"]`)).toContainText(
      "Нельзя смешивать разные города",
    );
    await page.screenshot({
      fullPage: true,
      path: "docs/qa/export-click-section-matrix-20260629/export-desktop-blocked.png",
    });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("mobile export controls remain visible and hittable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile export proof");
    const browserProblems = collectBrowserProblems(page);

    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, { workspaceEmail: "admin@visaflow.local" });
    await clickWorkspaceButton(page, /Выгрузка\. готово к Excel|Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Выгрузка" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile export");

    await expect(page.getByText(/1 \/ 4\s+Выбрать пакет/)).toBeVisible();
    const olgaPackage = page
      .locator(".v19-export-mobile-package")
      .filter({ hasText: "Ольга Фролова" });

    await expect(olgaPackage).toBeVisible();
    await olgaPackage.getByRole("button", { name: "Выбрать пакет" }).click();
    await expect(page.getByText(/2 \/ 4\s+Проверить условия/)).toBeVisible();
    await expect(page.getByText("Пакет экспортируем")).toBeVisible();

    const continueButton = page.getByRole("button", { name: "Продолжить" });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page.getByText(/3 \/ 4\s+Предпросмотр строк/)).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: "docs/qa/export-click-section-matrix-20260629/export-mobile-390.png",
    });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
