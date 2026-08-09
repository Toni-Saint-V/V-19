import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { type Page } from "@playwright/test";

import { testArtifactPath } from "../support/artifacts";
import { clickWorkspaceButton } from "./v19-pilot-helpers";
import { expect, test } from "./v19-localhost-test";

const smartImportPreviewScreenshot = testArtifactPath(
  "screenshots",
  "smart-import-preview-390.png",
);
const smartImportAppliedScreenshot = testArtifactPath(
  "screenshots",
  "smart-import-applied-1440.png",
);
const exportTabletScreenshot = testArtifactPath("screenshots", "export-idle-768.png");
const exportDesktopScreenshot = testArtifactPath("screenshots", "export-idle-1440.png");

function prepareScreenshot(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

async function signInThroughVisibleForm(
  page: Page,
  credentials: { email: string; password: string; heading: RegExp | string },
) {
  await page.goto("/");

  const signInSwitch = page.getByRole("button", { name: "Уже есть доступ? Войти" });
  await expect(signInSwitch).toBeVisible();
  await signInSwitch.click();

  await expect(page.locator("#workspace-email")).toBeVisible();
  await page.locator("#workspace-email").fill(credentials.email);
  await page.locator("#workspace-password").fill(credentials.password);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: credentials.heading }),
  ).toBeVisible();
}

async function openQuestionnaireThroughVisibleActions(page: Page) {
  const action = page
    .getByRole("button", {
      name: /^Выбрать действие:.*Артём Соколов.*Следующее действие: Открыть анкету/,
    })
    .first();
  await expect(action).toBeVisible();
  await action.click();

  const openPrimary = page
    .locator('[data-v19-interaction-id="actions.open-primary"]:visible')
    .first();
  await expect(openPrimary).toBeVisible();
  await openPrimary.click();

  const screen = page.locator(".vf-figma-questionnaire-screen");
  if (!(await screen.isVisible({ timeout: 1_000 }).catch(() => false))) {
    const drawer = page
      .locator('[data-v19-linear-drawer="true"], .v19-submission-detail-dialog')
      .last();
    await expect(drawer).toBeVisible();
    await drawer
      .getByRole("tab", { name: /^Анкета/ })
      .first()
      .click();
    await drawer.getByRole("button", { name: "Открыть анкету" }).first().click();
  }

  await expect(screen).toBeVisible();
  return screen;
}

async function openContactsSection(page: Page) {
  const contacts = page
    .locator(".v19-questionnaire-section-tab:visible")
    .filter({ hasText: "Адрес и контакты" })
    .first();
  await expect(contacts).toBeVisible();
  await contacts.click();
  await expect(page.locator('[data-model-field-id="email"] input')).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${context}: horizontal overflow`).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

test.describe("smart import and export visual UI proof", () => {
  test("applies explicitly selected questionnaire data through the visible agent flow", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "chromium", "single-project browser proof");

    await page.setViewportSize({ width: 390, height: 844 });
    await signInThroughVisibleForm(page, {
      email: "1@1.ru",
      heading: "Мои действия",
      password: "11",
    });
    const questionnaire = await openQuestionnaireThroughVisibleActions(page);

    const importButton = questionnaire.getByRole("button", { name: "Умный импорт" });
    await expect(importButton).toBeVisible();
    const mobileButtonBox = await importButton.boundingBox();
    expect(
      mobileButtonBox?.height ?? 0,
      "390: import control height",
    ).toBeGreaterThanOrEqual(40);
    expect(
      mobileButtonBox?.width ?? 0,
      "390: import control width",
    ).toBeGreaterThanOrEqual(40);
    await importButton.click();

    const dialog = page.getByRole("dialog", { name: "Умный импорт" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel("Вставить текст")
      .fill("Email: smart-import-ui@example.com");
    await dialog.getByRole("button", { name: "Распознать текст" }).click();
    await expect(dialog.getByText("Раздел: Контакты")).toBeVisible();
    const previewValue = dialog.getByText("smart-import-ui@example.com");
    await expect(previewValue).toBeVisible();
    const review = dialog.getByRole("region", { name: "Проверка распознанных полей" });
    await expect(review).toBeFocused();
    await expect(dialog.getByLabel("Вставить текст")).toBeHidden();
    await expect(
      dialog.getByText(/Фото, PDF и исходный текст не сохраняются/i),
    ).toBeHidden();
    await expect(dialog).toHaveAttribute("data-has-review", "true");
    await expectNoHorizontalOverflow(page, "390: smart import preview");
    prepareScreenshot(smartImportPreviewScreenshot);
    await page.screenshot({ path: smartImportPreviewScreenshot, fullPage: true });

    await dialog.getByRole("button", { name: "Отменить" }).click();
    await expect(dialog).toBeHidden();

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(importButton.locator("span")).toHaveText("Умный импорт");
    await importButton.click();
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(page, "768: smart import dialog");
    await dialog.getByRole("button", { name: "Отменить" }).click();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(importButton.locator("span")).toHaveText("Умный импорт");
    await importButton.click();
    await dialog
      .getByLabel("Вставить текст")
      .fill("Email: smart-import-ui@example.com");
    await dialog.getByRole("button", { name: "Распознать текст" }).click();
    const applyEmail = dialog.getByRole("checkbox", { name: "Применить Email" });
    await expect(applyEmail).toBeVisible();
    if (!(await applyEmail.isChecked())) await applyEmail.check();
    await dialog.getByRole("button", { name: "Применить выбранное" }).click();
    await expect(dialog).toBeHidden();

    await openContactsSection(page);
    const emailInput = page.locator('[data-model-field-id="email"] input');
    await expect(emailInput).toHaveValue("smart-import-ui@example.com");
    await expect(questionnaire.getByText("Сохранено", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, "1440: smart import applied");
    prepareScreenshot(smartImportAppliedScreenshot);
    await page.screenshot({ path: smartImportAppliedScreenshot, fullPage: true });

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои действия" }),
    ).toBeVisible();
    await openQuestionnaireThroughVisibleActions(page);
    await openContactsSection(page);
    await expect(page.locator('[data-model-field-id="email"] input')).toHaveValue(
      "smart-import-ui@example.com",
    );
  });

  test("keeps export filters readable and removes the empty desktop rail through the visible admin flow", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(testInfo.project.name !== "chromium", "single-project browser proof");

    await signInThroughVisibleForm(page, {
      email: "2@2.ru",
      heading: /^(Очередь на проверку|Проверка)$/,
      password: "22",
    });

    for (const viewport of [
      { height: 1024, label: "768", path: exportTabletScreenshot, width: 768 },
      { height: 900, label: "1440", path: exportDesktopScreenshot, width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await clickWorkspaceButton(page, /^Выгрузка/);
      await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();

      const screen = page.locator(".v19-admin-export-screen-v2");
      const triggers = page.locator(
        ".v19-admin-export-workspace-v2 .v19-inline-filter-buttons .v19-admin-toolbar-select-trigger",
      );
      await expect(triggers).toHaveCount(3);
      await expect(screen).toHaveAttribute("data-has-export-context", "false");
      await expect(page.locator('aside[aria-label="Контроль пакета"]')).toHaveCount(0);
      for (let index = 0; index < 3; index += 1) {
        await expect(
          triggers.nth(index).locator(".v19-admin-toolbar-select-label"),
        ).toBeVisible();
        await expect(
          triggers.nth(index).locator(".v19-admin-toolbar-select-value"),
        ).toBeVisible();
      }
      await expectNoHorizontalOverflow(page, `${viewport.label}: idle export`);
      prepareScreenshot(viewport.path);
      await page.screenshot({ path: viewport.path, fullPage: true });
    }
  });
});
