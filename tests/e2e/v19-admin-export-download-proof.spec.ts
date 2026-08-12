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
  test("admin downloads and confirms a verified family ZIP package", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ width: 1440, height: 900 });

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
    const downloadButton = controlRail.getByRole("button", {
      name: "Скачать ZIP + Excel",
    });
    await expect(downloadButton).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(download.failure()).resolves.toBeNull();
    const confirmDownload = controlRail.getByRole("button", {
      name: "Подтвердить скачивание",
    });
    await expect(confirmDownload).toBeEnabled();
    await expect(controlRail.locator("#export-action-hint")).toContainText(
      "ZIP с Excel передан браузеру.",
    );
    await confirmDownload.click();
    await expect(controlRail.getByTestId("export-action-feedback")).toContainText(
      "Скачивание подтверждено, пакет зафиксирован:",
    );
    await expectNoHorizontalOverflow(page, "admin Excel export complete");
    await page.setViewportSize({ width: 768, height: 1024 });
    await expectNoHorizontalOverflow(page, "admin ZIP export tablet");

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin downloads and confirms a verified single-applicant ZIP package", async ({
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
    const downloadButton = controlRail.getByRole("button", {
      name: "Скачать ZIP + Excel",
    });
    await expect(downloadButton).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(download.failure()).resolves.toBeNull();

    const confirmDownload = controlRail.getByRole("button", {
      name: "Подтвердить скачивание",
    });
    await expect(confirmDownload).toBeEnabled();
    await expect(controlRail.locator("#export-action-hint")).toContainText(
      "ZIP с Excel передан браузеру.",
    );
    await confirmDownload.click();
    await expect(controlRail.getByTestId("export-action-feedback")).toContainText(
      "Скачивание подтверждено, пакет зафиксирован:",
    );

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });
});
