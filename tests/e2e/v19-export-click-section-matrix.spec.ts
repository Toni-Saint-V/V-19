import { expect, test, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  expectNoHorizontalOverflow,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

async function clearCurrentExportSelection(page: Page) {
  const removeButtons = page.getByRole("button", { name: /^Убрать .+ из выгрузки$/ });

  for (let safety = 0; safety < 12 && (await removeButtons.count()) > 0; safety += 1) {
    await removeButtons.first().click();
  }
}

async function selectExportPackage(page: Page, name: string) {
  await page.getByRole("button", { name: `Выбрать ${name}` }).click();
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
      page.getByRole("heading", { level: 1, name: /^(Выгрузка|Центр выгрузки)$/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "desktop export initial");

    await expect(page.getByRole("button", { name: /^(Скачать Excel|Скачать)$/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^(Отметить выгружено|Отметить)$/ })).toBeDisabled();
    await expect(page.getByText("Сначала сформируйте Excel").first()).toBeVisible();
    await expect(page.getByLabel("Контекст выгрузки")).toBeVisible();

    await page
      .getByRole("button", { name: /Семья ВолковыхSUB-1102/ })
      .first()
      .click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByText("Семья Волковых")).toBeVisible();
    await drawer(page).getByRole("button", { name: /Закрыть (проверку|подачу)/ }).click();
    await expect(drawer(page)).toHaveCount(0);

    await clearCurrentExportSelection(page);
    await selectExportPackage(page, "Ольга Фролова");
    await expect(page.getByText("Сначала сформируйте Excel").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Сформировать Excel" }),
    ).toBeEnabled();

    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    await expect(
      page.getByText("Файл сформирован. Теперь скачайте его.").first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Скачать Excel|Скачать)$/ })).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^(Скачать Excel|Скачать)$/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await expect(download.failure()).resolves.toBeNull();
    await expect(
      page.getByText("Файл скачан. Можно отметить подачу выгруженной.").first(),
    ).toBeVisible();

    await page.getByRole("button", { name: /^(Отметить выгружено|Отметить)$/ }).click();
    await expect(page.getByRole("tab", { name: /История/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.locator(".export-history-table").getByText("Ольга Фролова"),
    ).toBeVisible();

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
    await clearCurrentExportSelection(page);
    await selectExportPackage(page, "Семья Волковых");
    await selectExportPackage(page, "Никита Морозов");

    await expect(page.getByText("Нельзя смешивать разные города").first()).toBeVisible();
    const generateButton = page.getByRole("button", { name: "Сформировать Excel" });
    await expect(generateButton).toBeDisabled();
    const disabledReasonId = await generateButton.getAttribute("aria-describedby");

    expect(disabledReasonId, "generate disabled reason id").toBeTruthy();
    await expect(page.locator(`[id="${disabledReasonId}"]`)).toContainText(
      "Нельзя смешивать разные города",
    );

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

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
