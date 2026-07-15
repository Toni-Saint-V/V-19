import { expect, test, type Page } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
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
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Выгрузка" }),
    ).toBeVisible();

    await clearExportSelection(page);

    const targetRow = page
      .locator(".export-row")
      .filter({ hasText: /Семья Волковых|SUB-1102|Семья Петровых|ПД-1054/ })
      .first();

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

    const downloadButton = page
      .getByRole("button", {
        name: /Скачать ZIP с Excel|Скачать ZIP \+ Excel|Скачать ZIP файлов/i,
      })
      .first();

    await expect(downloadButton).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(download.failure()).resolves.toBeNull();

    await expectBodyMatches(page, [/ZIP скачан|Excel готов|Скачать ZIP с Excel/i]);

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });
});
