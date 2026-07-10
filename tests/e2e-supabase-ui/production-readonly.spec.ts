import { expect, test } from "@playwright/test";
import {
  assertNoOverflow,
  clickWorkspaceButton,
  collectBrowserProblems,
  signIn,
} from "./ui-helpers";

test.describe("V-19 production UI read-only smoke", () => {
  test("admin can inspect operational surfaces without mutating data", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);

    await signIn(page, "admin");
    await clickWorkspaceButton(page, /Проверка|Очередь на проверку|Работа/);
    await expect(page.getByRole("heading", { level: 1, name: /Проверка|Очередь на проверку|Работа/ })).toBeVisible();

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByRole("heading", { level: 1, name: "Выгрузка" })).toBeVisible();

    await clickWorkspaceButton(page, /Возврат/);
    await expect(page.getByRole("heading", { level: 1, name: "Возврат документов" })).toBeVisible();

    await assertNoOverflow(page);
    expect(browserProblems()).toEqual([]);
  });
});
