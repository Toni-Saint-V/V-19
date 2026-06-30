import { expect, test } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  expectNoHorizontalOverflow,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

test.describe("V-19 export click and section matrix", () => {
  test("admin export actions move through package, download, history, and PDF context", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop export proof");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { workspaceEmail: "admin@visaflow.local" });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByRole("heading", { level: 1, name: "Выгрузка" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "desktop export initial");
    await page.screenshot({
      fullPage: true,
      path: "docs/qa/export-click-section-matrix-20260629/export-desktop-initial.png",
    });

    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Отметить выгружено" })).toBeDisabled();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Сначала сформируйте Эксель",
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
    await expect(page.locator("#export-action-hint")).toContainText(
      "Сначала сформируйте Эксель",
    );
    await expect(page.getByRole("button", { name: "Сформировать Эксель" })).toBeEnabled();

    await page.getByRole("button", { name: "Сформировать Эксель" }).click();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Файл сформирован. Теперь скачайте его.",
    );
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await expect(download.failure()).resolves.toBeNull();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Файл скачан. Можно отметить подачу выгруженной.",
    );

    await page.getByRole("button", { name: "Отметить выгружено" }).click();
    await expect(page.getByRole("tab", { name: /История/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator(".submission-list").getByText("Ольга Фролова")).toBeVisible();
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
    await expect(exportedHistoryRow.getByText("PDF handoff: через файлы подачи")).toBeVisible();
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

    await expect(page.locator("#export-action-hint")).toContainText(
      "Нельзя смешивать разные города",
    );
    await expect(page.getByRole("button", { name: "Сформировать Эксель" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Сформировать Эксель" })).toHaveAttribute(
      "aria-describedby",
      "export-action-hint",
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
    await expect(page.getByRole("heading", { level: 1, name: "Выгрузка" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile export");

    const bulkSelect = page.getByRole("checkbox", {
      name: "Выбрать все совместимые",
    });
    await expect(bulkSelect).toBeVisible();
    await bulkSelect.check();
    await expect(
      page.locator(".export-contract-row").first().getByRole("checkbox"),
    ).toBeChecked();
    await page
      .locator(".export-contract-row")
      .first()
      .getByRole("button", { name: "Смотреть пакет" })
      .click();
    await expect(page.getByLabel("Контекст выгрузки")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: "docs/qa/export-click-section-matrix-20260629/export-mobile-390.png",
    });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
