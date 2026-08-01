import { expect, test } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  expectNoHorizontalOverflow,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

function blockingBrowserProblems(problems: string[]) {
  return problems.filter(
    (problem) =>
      !/ResizeObserver loop|favicon|net::ERR_ABORTED|Download the React DevTools/i.test(
        problem,
      ),
  );
}

test.describe("V-19 admin document export proof", () => {
  test("admin downloads a verified family Excel package in one action", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "admin Excel export initial");

    await clearExportSelection(page);
    const targetRow = page.getByTestId("admin-export-row-SUB-1102");
    await expect(targetRow).toBeVisible();
    await targetRow.click();
    await expect(targetRow.getByRole("checkbox")).toBeChecked();

    const controlToggle = page.getByRole("button", { name: /^Контроль пакета/ });
    if (await controlToggle.isVisible()) {
      await controlToggle.click();
      await expect(
        page.locator(".v19-admin-export-rail-v2.is-mobile-open"),
      ).toBeVisible();
    }

    const controlRail = page.getByRole("complementary", {
      name: "Контроль пакета",
    });
    await expect(controlRail).toContainText("Текущая выгрузка");
    const excelButton = controlRail.getByRole("button", { name: "Скачать Excel" });
    await expect(excelButton).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await excelButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await expect(download.failure()).resolves.toBeNull();
    await expect(
      controlRail.getByRole("button", { name: "Excel скачан" }),
    ).toBeDisabled();
    await expect(controlRail.locator("#export-action-hint")).toContainText(
      "Excel скачан:",
    );
    await expectNoHorizontalOverflow(page, "admin Excel export complete");

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin downloads a verified single-applicant Excel package", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();

    await clearExportSelection(page);
    const targetRow = page.getByTestId("admin-export-row-SUB-1101");
    await expect(targetRow).toBeVisible();
    await targetRow.click();
    await expect(targetRow.getByRole("checkbox")).toBeChecked();

    const controlToggle = page.getByRole("button", { name: /^Контроль пакета/ });
    if (await controlToggle.isVisible()) {
      await controlToggle.click();
      await expect(
        page.locator(".v19-admin-export-rail-v2.is-mobile-open"),
      ).toBeVisible();
    }

    const controlRail = page.getByRole("complementary", {
      name: "Контроль пакета",
    });
    const excelButton = controlRail.getByRole("button", { name: "Скачать Excel" });
    await expect(excelButton).toBeEnabled();
    const excelDownloadPromise = page.waitForEvent("download");
    await excelButton.click();
    const excelDownload = await excelDownloadPromise;
    await expect(excelDownload.failure()).resolves.toBeNull();

    await expect(
      controlRail.getByRole("button", { name: "Excel скачан" }),
    ).toBeDisabled();
    await expect(controlRail.locator("#export-action-hint")).toContainText(
      "Excel скачан:",
    );

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });
});
