import { expect, test } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  e2ePassportFile,
  expectAtLeastOneVisible,
  expectDrawerStatus,
  loginThroughAccessGate,
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

    await openFreshWorkspace(page, { workspaceEmail: "unknown@visaflow.local" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Вход в рабочий кабинет" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Почта не найдена");

    await loginThroughAccessGate(page, "agent@visaflow.local", "Входящие");
    await expect(page.getByRole("region", { name: "Входящие" })).toBeVisible();

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

    await agentActionSurface.getByRole("button", { name: "Фильтр и вид" }).click();
    await page
      .getByRole("menu", { name: "Фильтр и вид" })
      .getByRole("menuitemradio", { name: "Колонки" })
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

    await agentActionSurface.getByRole("button", { name: "Фильтр и вид" }).click();
    await page
      .getByRole("menu", { name: "Фильтр и вид" })
      .getByRole("menuitemradio", { name: "Список" })
      .click();

    await agentActionSearch.fill("ПД-1048");
    await expect(
      agentActionSurface.locator('[data-submission-id="ПД-1048"]').first(),
    ).toBeVisible();
    await expect(agentActionSurface.locator('[data-submission-id="ПД-1051"]')).toHaveCount(
      0,
    );
    await agentActionSearch.fill("");

    await agentActionSurface.getByRole("button", { name: "Фильтр и вид" }).click();
    await page
      .getByRole("menu", { name: "Фильтр и вид" })
      .getByRole("menuitemradio", { name: "Санкт-Петербург" })
      .click();
    await expect(
      agentActionSurface.locator('[data-submission-id="ПД-1051"]').first(),
    ).toBeVisible();
    await expect(agentActionSurface.locator('[data-submission-id="ПД-1048"]')).toHaveCount(
      0,
    );

    await agentActionSurface.getByRole("button", { name: "Фильтр и вид" }).click();
    await page
      .getByRole("menu", { name: "Фильтр и вид" })
      .getByRole("menuitemradio", { name: "Создано" })
      .click();
    await expect(agentActionSurface.locator("[data-submission-id]").first()).toBeVisible();

    await agentActionSurface.getByRole("button", { name: "Фильтр и вид" }).click();
    await page
      .getByRole("menu", { name: "Фильтр и вид" })
      .getByRole("menuitemradio", { name: "Все города" })
      .click();
    await agentActionSurface.locator('[data-submission-id="ПД-1048"]').first().click();
    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(drawer(page).locator(".drawer-meta-line")).toContainText("ПД-1048");
    await expect(page.getByRole("tab", { name: "Файлы" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await drawer(page).getByRole("button", { name: "Закрыть подачу" }).click();

    await clickWorkspaceButton(page, /Входящие/);
    await expect(page.getByRole("region", { name: "Входящие" })).toBeVisible();
    await page.getByRole("tab", { name: /Мои действия/ }).click();
    await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();

    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(page.getByRole("heading", { level: 1, name: "Мои подачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Новая подача" })).toBeVisible();

    await selectSubmissionStatus(page, "В работе");
    await expect(submissionCard(page, "Артём Соколов")).toBeVisible();
    await expect(submissionCard(page, "Ивановы")).toHaveCount(0);

    await selectSubmissionStatus(page, "Готово");
    await expect(submissionCard(page, "Дмитрий Орлов")).toBeVisible();
    await expect(submissionCard(page, "Ивановы")).toHaveCount(0);

    await selectSubmissionStatus(page, "Действия");
    await expect(submissionCardById(page, "ПД-1048")).toBeVisible();
    await expect(
      submissionCardById(page, "ПД-1048").getByText(/2 блокера · 4 из 12/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Новая подача" }).first().click();
    await expect(drawer(page).getByText("Сборка документов")).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Дальше" })).toBeDisabled();

    await drawer(page).getByRole("button", { exact: true, name: "Семья" }).click();
    await expect(drawer(page).getByText("2 чел.")).toBeVisible();
    await expect(
      drawer(page).getByRole("button", {
        name: "Основной заявитель Паспорт не загружен",
      }),
    ).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Заявитель 2 Паспорт не загружен" }),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Добавить заявителя в семью" }).click();
    await expect(drawer(page).getByText("3 чел.")).toBeVisible();
    await expect(
      drawer(page).getByRole("button", { name: "Заявитель 3 Паспорт не загружен" }),
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
    await expect(drawer(page).getByRole("button", { name: "Дальше" })).toBeEnabled();

    await drawer(page).getByRole("button", { exact: true, name: "Заявитель" }).click();
    await expect(drawer(page).getByText("1 чел.")).toBeVisible();
    await expect(drawer(page).getByText("e2e-passport-Anna_Petrova.jpg")).toHaveCount(0);
    await expect(drawer(page).getByRole("button", { name: "Дальше" })).toBeEnabled();

    await drawer(page).getByRole("button", { exact: true, name: "Семья" }).click();
    await expect(drawer(page).getByText("2 чел.")).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: "Дальше" })).toBeDisabled();
    await drawer(page).getByRole("button", { name: "Закрыть создание" }).click();
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

    await openFreshWorkspace(page, { heading: "Входящие" });
    await clickWorkspaceButton(page, /Мои подачи/);
    await selectSubmissionStatus(page, "Действия");
    await submissionCardById(page, "ПД-1048").click();

    await expect(
      drawer(page).getByRole("heading", { name: "Семья Ивановых" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Замечания" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      drawer(page).getByRole("button", { name: "Отправить исправления" }),
    ).toBeDisabled();

    const fileIssue = drawer(page)
      .getByRole("button", { name: /София Иванова.*Загранпаспорт/ })
      .first();
    await expect(fileIssue).toBeVisible();
    await fileIssue.click();
    await expect(
      drawer(page).getByRole("article", { name: /Загранпаспорт: София Иванова/ }),
    ).toBeVisible();

    await openDrawerTab(page, ["Файлы", "Документы", "Медиа"]);
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
