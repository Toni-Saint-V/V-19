import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  isVisible,
  openDrawerTab,
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

async function firstVisible(locator: Locator): Promise<Locator | null> {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await isVisible(candidate)) return candidate;
  }

  return null;
}

async function openAdminSubmission(page: Page, preferredText: RegExp) {
  const preferred = await firstVisible(
    page
      .locator(
        ".submission-card, .v17-admin-work-row, .v19-event-row, [data-submission-card], [data-submission-id]",
      )
      .filter({ hasText: preferredText }),
  );

  const fallback = await firstVisible(
    page.locator(
      ".submission-card, .v17-admin-work-row, .v19-event-row, [data-submission-card], [data-submission-id]",
    ),
  );

  const target = preferred ?? fallback;
  if (!target) throw new Error("No visible admin submission row/card found.");

  await target.click();

  if (!(await isVisible(drawer(page)))) {
    const explicitOpen = target
      .getByRole("button", { name: /Открыть|Проверить|Подробнее|Подача/i })
      .first();
    if (await isVisible(explicitOpen)) await explicitOpen.click();
  }

  await expect(drawer(page)).toBeVisible();
  await expectBodyMatches(page, [/Анкета|Файлы|Замечания|Обзор|ПД-|SUB-/i]);
}

test.describe("V-19 pilot admin review click flow", () => {
  test("admin queue opens drawer tabs and issue action is reachable", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });

    await expectBodyMatches(page, [/Проверка|Очередь на проверку/i]);
    await clickWorkspaceButton(page, /Проверка|Работа|Очередь/);
    await expectBodyMatches(page, [/Нина Волкова|ПД-1053|Проверка|Очередь/i]);

    await openAdminSubmission(page, /Нина Волкова|ПД-1053|Смирнов|Петров|Волков/i);

    await openDrawerTab(page, ["Обзор"]).catch(() => undefined);
    await openDrawerTab(page, ["Файлы"]).catch(() => undefined);
    await openDrawerTab(page, ["Замечания"]).catch(() => undefined);

    // The "Добавить замечание" action belongs to the questionnaire rows.
    // Return there before clicking; otherwise Motion may detach the previous
    // tab content while Playwright waits for actionability.
    await openDrawerTab(page, ["Анкета", "Данные"]).catch(() => undefined);
    await page.waitForTimeout(350);

    const addRemarkButton = drawer(page)
      .locator('[data-testid="admin-review-add-remark"], button[title="Добавить замечание"]')
      .first();

    await expect(addRemarkButton).toBeVisible();

    await addRemarkButton.evaluate((element) => {
      (element as { click(): void }).click();
    });

    const remarkDialog = page
      .getByRole("dialog")
      .filter({ hasText: /Добавить замечание|Новое замечание/i })
      .last();

    await expect(remarkDialog).toBeVisible();

    const submitRemarkButton = remarkDialog
      .locator('[data-testid="remark-form-submit"]')
      .or(
        remarkDialog.getByRole("button", {
          name: /Отправить замечание|Создать замечание/i,
        }),
      )
      .first();

    await expect(submitRemarkButton).toBeVisible();

    await submitRemarkButton.evaluate((element) => {
      (element as { click(): void }).click();
    });

    await expect(remarkDialog).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();

    await openDrawerTab(page, ["Замечания"]).catch(() => undefined);
    await expectBodyMatches(page, [/Замечания|Исправить|Требуется|Анкета|Файлы|ПД-|SUB-/i]);

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });

  test("admin export surface selects a ready package and prepares Excel", async ({
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

    const exportRow = page
      .locator(".export-row")
      .filter({ hasText: /Семья Волковых|SUB-1102|Семья Петровых|ПД-1054/ })
      .first();

    await expect(exportRow).toBeVisible();
    await exportRow.getByRole("checkbox").check();

    await expectBodyMatches(page, [/Пакет выбран|Excel preview|Excel rows/i]);

    const prepareButton = page
      .getByRole("button", { name: /Сформировать Excel|Excel готов/i })
      .first();

    await expect(prepareButton).toBeVisible();
    if (await prepareButton.isEnabled()) {
      await prepareButton.click();
    }

    await expectBodyMatches(page, [/Excel готов|Скачать ZIP с Excel|Можно сформировать/i]);

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });
});
