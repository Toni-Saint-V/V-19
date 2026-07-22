import { expect, test, type Page } from "@playwright/test";
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

async function expectBodyMatches(page: Page, patterns: RegExp[], timeout = 20_000) {
  await expect
    .poll(
      async () => {
        const text = await page.locator("body").innerText().catch(() => "");
        return patterns.some((pattern) => pattern.test(text));
      },
      { timeout },
    )
    .toBe(true);
}

test.describe("V-19 admin export download proof", () => {
  test("admin downloads the generated Excel+documents ZIP package", async ({
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

    const targetRow = page.getByTestId("admin-export-row-SUB-1102");

    await expect(targetRow).toBeVisible();
    await targetRow.getByRole("checkbox").check();

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
    await expect(controlRail).toContainText(/Пакет выбран|Excel preview|Excel rows/i);

    const prepareButton = page
      .getByRole("button", { name: /Сформировать Excel|Excel готов/i })
      .first();

    await expect(prepareButton).toBeVisible();
    if (await prepareButton.isEnabled()) {
      await prepareButton.click();
    }

    const prepareArchiveButton = page.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });

    await expect(prepareArchiveButton).toBeEnabled();
    await prepareArchiveButton.click();
    const downloadLink = page.getByRole("link", { name: "Скачать ZIP" });
    await expect(downloadLink).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(download.failure()).resolves.toBeNull();

    await page.getByRole("button", { name: "Подтвердить скачивание" }).click();
    await expectBodyMatches(page, [/пакет зафиксирован|Выгрузка завершена/i]);

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });

  test("mobile admin completes the ZIP download through the control sheet", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile export queue");

    await clearExportSelection(page);
    const targetRow = page.getByTestId("admin-export-row-SUB-1102");
    await expect(targetRow).toBeVisible();
    await targetRow.getByRole("checkbox").check();

    const controlToggle = page.getByRole("button", { name: /^Контроль пакета/ });
    await expect(controlToggle).toContainText(/1 пакет/);
    await controlToggle.click();

    const controlRail = page.getByRole("complementary", {
      name: "Контроль пакета",
    });
    await expect(controlRail).toBeVisible();
    await expect(controlRail).toContainText(/Пакет выбран|Excel preview|Excel rows/i);
    await expectNoHorizontalOverflow(page, "mobile export control sheet");

    const prepareButton = controlRail
      .getByRole("button", { name: /Сформировать Excel|Excel готов/i })
      .first();
    await expect(prepareButton).toBeVisible();
    if (await prepareButton.isEnabled()) {
      await prepareButton.click();
    }

    const prepareArchiveButton = controlRail.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });
    await expect(prepareArchiveButton).toBeEnabled();
    await prepareArchiveButton.click();

    const downloadLink = controlRail.getByRole("link", { name: "Скачать ZIP" });
    await expect(downloadLink).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(download.failure()).resolves.toBeNull();

    await controlRail
      .getByRole("button", { name: "Подтвердить скачивание" })
      .click();
    await expectBodyMatches(page, [/пакет зафиксирован|Выгрузка завершена/i]);

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });
});
