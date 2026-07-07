import { expect, test } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

test.describe("V-19 admin export downloads", () => {
  test("admin downloads Excel plus media ZIP with photos and passport scans", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await page.getByRole("button", { name: "В админскую зону" }).click();
    await expect(
      page.getByRole("heading", { name: "Очередь на проверку" }),
    ).toBeVisible();
    await clickWorkspaceButton(page, "Выгрузка");
    await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();
    await expect(page.getByText("SUB-1102").first()).toBeVisible();

    const downloads: string[] = [];
    page.on("download", (download) => {
      downloads.push(download.suggestedFilename());
    });

    await page.getByRole("button", { name: "Скачать Excel + ZIP" }).click();
    await expect
      .poll(() => downloads, { timeout: 20_000 })
      .toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^visaflow-export-.+\.xlsx$/),
          expect.stringMatching(/^visaflow-media-.+\.zip$/),
        ]),
      );

    await expect(page.getByText("Excel и ZIP файлов формируются fail-closed")).toBeVisible();
    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
