import { resolve } from "node:path";
import type { Page } from "@playwright/test";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { openFreshWorkspace } from "./v19-pilot-helpers";
import { expect, test } from "./v19-localhost-test";

const realFilledVisaPdf = resolve(
  process.cwd(),
  "tests/fixtures/reference-exports/Загрузка_Анкета.pdf",
);
const realPassportJpeg = resolve(
  process.cwd(),
  "tests/fixtures/production-media/passport.jpeg",
);

async function openEditableQuestionnaire(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });
  await page.evaluate((submissions) => {
    localStorage.setItem(
      "visaflow.v19.submissions.v1",
      JSON.stringify(
        submissions.map((submission) => ({
          ...submission,
          agentId: "local-agent-tony",
        })),
      ),
    );
  }, initialSubmissions);
  await page.reload();

  const questionnaireAction = page
    .getByRole("button", {
      name: /^Выбрать действие:.*Артём Соколов.*Следующее действие: Открыть анкету/,
    })
    .first();
  await expect(questionnaireAction).toBeVisible();
  await questionnaireAction.click();
  const openQuestionnaire = page
    .locator('[data-v19-interaction-id="actions.open-primary"]:visible')
    .first();
  await expect(openQuestionnaire).toBeVisible();
  await openQuestionnaire.click();

  const questionnaire = page.locator(".vf-figma-questionnaire-screen");
  await expect(questionnaire).toBeVisible();
  return questionnaire;
}

async function openSmartImport(page: Page) {
  const questionnaire = page.locator(".vf-figma-questionnaire-screen");
  await questionnaire.getByRole("button", { name: "Умный импорт" }).click();
  const dialog = page.getByRole("dialog", { name: "Умный импорт" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function assertRealFilledVisaPdfReview(page: Page) {
  const dialog = await openSmartImport(page);
  await dialog.getByLabel("Выбрать фото или PDF").setInputFiles(realFilledVisaPdf);
  await expect(dialog.getByText("BOGDANOV", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(dialog.getByText("ANATOLII", { exact: true })).toBeVisible();
  await expect(dialog.getByText("23.04.1956", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("Источник: заполненная анкета");
  await expect(dialog).not.toContainText("669308614");
  await expect(dialog).not.toContainText("HOTEL@INFO.RU");
  expect(
    await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  return dialog;
}

test.describe("smart import real document runtime", () => {
  test.setTimeout(120_000);

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
    { height: 900, width: 1440 },
  ]) {
    test(`reads the real filled PDF at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openEditableQuestionnaire(page);

      const dialog = await assertRealFilledVisaPdfReview(page);
      await dialog.getByRole("button", { name: "Отменить" }).click();
      await expect(dialog).toHaveCount(0);
    });
  }

  test("reads the real passport JPEG through the production local OCR adapter", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openEditableQuestionnaire(page);

    let dialog = await openSmartImport(page);
    await dialog.getByLabel("Выбрать фото или PDF").setInputFiles(realPassportJpeg);
    await expect(dialog.getByText("20.08.1990", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(dialog.getByText("USSR", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Russian Federation", { exact: true })).toBeVisible();
    await expect(dialog).toContainText("Источник: паспорт / документ личности");
    await expect(dialog).not.toContainText("AHTOH");
    await expect(dialog).not.toContainText("BORKOB");
    await expect(dialog).not.toContainText("VOLKOV");
    await expect(dialog).not.toContainText("LENINGRAD");
    await expect(dialog).not.toContainText("Мужской");
    await expect(dialog).not.toContainText("752869613");
    await expect(dialog).not.toContainText("26.02.2026");
    await expect(dialog).not.toContainText("ФМС 78039");

    await dialog.getByRole("button", { name: "Отменить" }).click();
    dialog = await openSmartImport(page);
    await expect(dialog.locator(".v19-smart-import-review-row")).toHaveCount(0);
    await expect(dialog).not.toContainText("20.08.1990");
  });
});
