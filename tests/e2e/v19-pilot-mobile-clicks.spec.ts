import { expect, test } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  expectNoHorizontalOverflow,
  openDrawerTab,
  openFreshWorkspace,
  submissionCardById,
} from "./v19-pilot-helpers";

test.describe("V-19 pilot mobile clicks", () => {
  test("390px create drawer and submission drawer tabs are usable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile pilot runs once");
    const browserProblems = collectBrowserProblems(page);

    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, { heading: "Мои действия" });
    await expectNoHorizontalOverflow(page, "mobile actions");

    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(page.getByRole("heading", { level: 1, name: "Мои подачи" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile submissions");

    await page.getByRole("button", { name: "Новая подача" }).first().click();
    await expect(drawer(page).getByText("Новая подача")).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Сохранить черновик" })).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Дальше" })).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Дальше" })).toBeDisabled();
    await expectNoHorizontalOverflow(page, "mobile create drawer");
    await drawer(page).getByRole("button", { name: "Закрыть создание" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await submissionCardById(page, "ПД-1048").click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await openDrawerTab(page, ["Обзор"]);
    await openDrawerTab(page, ["Анкета", "Данные"]);
    await openDrawerTab(page, ["Файлы", "Селфи", "Паспорт"]);
    await openDrawerTab(page, ["Замечания"]);
    await openDrawerTab(page, ["История"]);
    await expectNoHorizontalOverflow(page, "mobile submission drawer tabs");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
