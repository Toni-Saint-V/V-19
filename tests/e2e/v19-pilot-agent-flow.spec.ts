import { expect, test } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  e2ePassportFile,
  expectAtLeastOneVisible,
  expectDrawerStatus,
  markVisibleIssuesFixed,
  openDrawerTab,
  openFreshWorkspace,
  selectSubmissionStatus,
  submissionCard,
  submissionCardById,
  uploadAllVisibleFiles,
} from "./v19-pilot-helpers";

test.describe("V-19 pilot agent click flow", () => {
  test("access gate, agent navigation, filters, and create drawer clicks stay wired", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop pilot runs once");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });

    await clickWorkspaceButton(page, /Мои действия/);
    await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
    const agentActionSurface = page.getByRole("region", { name: "Мои действия" });
    const agentActionSearch = page.getByRole("searchbox", {
      name: "Поиск по действиям",
    });

    await agentActionSurface.getByRole("tab", { name: /На проверке/ }).click();
    await expect(
      agentActionSurface.locator('[data-submission-id="ПД-1053"]').first(),
    ).toBeVisible();
    await agentActionSurface.getByRole("tab", { name: /Все действия/ }).click();

    await agentActionSurface
      .getByRole("button", { name: "Показать колонками" })
      .click();
    const reviewColumn = agentActionSurface
      .locator(".vf-figma-column")
      .filter({ hasText: "На проверке" });
    const readyColumn = agentActionSurface
      .locator(".vf-figma-column")
      .filter({ hasText: "Готово" });
    await expect(reviewColumn.locator('[data-submission-id="ПД-1053"]').first()).toBeVisible();
    await expect(readyColumn.locator('[data-submission-id="ПД-1053"]')).toHaveCount(0);
    await expect(
      agentActionSurface
        .locator(".vf-figma-column-card")
        .filter({ hasText: "София Иванова" })
        .filter({ hasText: "Заполнить анкету" })
      .first(),
    ).toBeVisible();

    await agentActionSurface
      .getByRole("button", { name: "Показать списком" })
      .click();

    await agentActionSearch.fill("ПД-1048");
    await expect(
      agentActionSurface.locator('[data-submission-id="ПД-1048"]').first(),
    ).toBeVisible();
    await expect(agentActionSurface.locator('[data-submission-id="ПД-1051"]')).toHaveCount(
      0,
    );
    await agentActionSearch.fill("");

    await expect(agentActionSurface.locator("[data-submission-id]").first()).toBeVisible();

    await agentActionSurface.locator('[data-submission-id="ПД-1048"]').first().click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(drawer(page).getByText("ПД-1048").first()).toBeVisible();
    await expect(drawer(page).getByRole("heading", { name: "Файлы подачи" })).toBeVisible();
    await drawer(page).getByRole("button", { name: "Закрыть подачу" }).click();

    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(page.getByRole("heading", { level: 1, name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Новая подача" })).toBeVisible();

    await selectSubmissionStatus(page, "В работе");
    await expect(submissionCard(page, "Ивановы")).toHaveCount(0);

    await selectSubmissionStatus(page, "Требуют действия");
    await expect(submissionCardById(page, "ПД-1048")).toBeVisible();
    await expect(
      submissionCardById(page, "ПД-1048").getByText(/2 блокера · 4 из 12/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Новая подача" }).first().click();
    await expect(drawer(page).getByText("Новая подача")).toBeVisible();
    const createNextButton = drawer(page).getByRole("button", { name: "Дальше" });
    await expect(createNextButton).toBeDisabled();

    await drawer(page).getByRole("button", { exact: true, name: "Семья" }).click();
    await expect(drawer(page).getByText("2 чел.")).toBeVisible();
    await expect(
      drawer(page).getByRole("button", {
        name: /Основной заявитель Паспорт не загружен/,
      }),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: /Заявитель 2 Паспорт не загружен/ }),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Добавить заявителя в семью" }).click();
    await expect(drawer(page).getByText("3 чел.")).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: /Заявитель 3 Паспорт не загружен/ }),
    ).toBeVisible();

    await drawer(page)
      .locator(".pi-file-input")
      .setInputFiles([
        e2ePassportFile("Ivan_Petrov"),
        e2ePassportFile("Anna_Petrova"),
        e2ePassportFile("Child_Petrov"),
      ]);
    await expectAtLeastOneVisible(
      drawer(page).getByText("e2e-passport-Ivan_Petrov.jpg"),
      "uploaded passport file is visible in create drawer",
    );
    await expect(createNextButton).toBeEnabled();

    await drawer(page).getByRole("button", { exact: true, name: "Заявитель" }).click();
    await expect(drawer(page).getByText("1 чел.")).toBeVisible();
    await expect(drawer(page).getByText("e2e-passport-Anna_Petrova.jpg")).toHaveCount(0);
    await expect(createNextButton).toBeEnabled();

    await drawer(page).getByRole("button", { exact: true, name: "Семья" }).click();
    await expect(drawer(page).getByText("2 чел.")).toBeVisible();
    await expect(createNextButton).toBeDisabled();
    await drawer(page).getByRole("button", { name: "Закрыть создание" }).first().click();
    await expect(page.getByRole("dialog", { name: "Закрыть панель?" })).toBeVisible();
    await page.getByRole("button", { name: "Закрыть без сохранения" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("returned issue can be opened, fixed, and resubmitted by the agent", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop pilot runs once");
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await clickWorkspaceButton(page, /Мои подачи/);
    await selectSubmissionStatus(page, "Требуют действия");
    await submissionCardById(page, "ПД-1048").click();

    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: /Замечания/ }).click();
    await expect(drawer(page).getByText(/Нужна правка|замечан/i).first()).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeDisabled();

    await expect(
      drawer(page).getByRole("heading", { name: "Скан паспорта" }),
    ).toBeVisible();
    await expect(drawer(page).getByText(/София Иванова · Файлы/)).toBeVisible();

    await openDrawerTab(page, ["Файлы", "Селфи", "Паспорт"]);
    await uploadAllVisibleFiles(page);
    await markVisibleIssuesFixed(page);
    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeEnabled();
    await drawer(page).getByRole("button", { name: "Отправить исправления" }).click();
    await expect(drawer(page).getByText("Исправления получены")).toBeVisible();
    await expectDrawerStatus(page, "Исправления получены");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
