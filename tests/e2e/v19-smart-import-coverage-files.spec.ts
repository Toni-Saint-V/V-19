import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { type Page } from "@playwright/test";

import { testArtifactPath } from "../support/artifacts";
import { expect, test } from "./v19-localhost-test";

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/smart-import-coverage");
const coverageManifest = JSON.parse(
  readFileSync(resolve(fixtureDirectory, "expected-fields.manifest.json"), "utf8"),
) as {
  candidateUniverse: { excludedFieldIds: string[]; expectedCount: number };
  sources: {
    "dense-labelled-questionnaire": { expectedValues: Record<string, string> };
    "passport-style-safe": { expectedValues: Record<string, string> };
  };
};
const smartImportFieldLabels = Object.fromEntries(
  Array.from(
    readFileSync(
      resolve(process.cwd(), "src/modules/submissions/smartImport.ts"),
      "utf8",
    ).matchAll(/^\s+["']?([a-z][a-z0-9-]*)["']?: \{ label: "([^"]+)"/gmu),
    (match) => [match[1] ?? "", match[2] ?? ""],
  ),
) as Record<string, string>;
const pdfScreenshot = testArtifactPath(
  "screenshots",
  "smart-import-default-pdf-390.png",
);
const pngScreenshot = testArtifactPath(
  "screenshots",
  "smart-import-default-png-390.png",
);
const reviewViewports = [
  { height: 720, width: 320 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 1024, width: 768 },
  { height: 900, width: 1440 },
] as const;

function prepareScreenshot(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

async function signInThroughVisibleForm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();
  await page.locator("#workspace-email").fill("1@1.ru");
  await page.locator("#workspace-password").fill("11");
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();
}

async function openQuestionnaireThroughVisibleActions(page: Page) {
  const action = page
    .getByRole("button", {
      name: /^Выбрать действие:.*Артём Соколов/,
    })
    .first();
  await action.click();
  await page
    .locator('[data-v19-interaction-id="actions.open-secondary"]:visible')
    .first()
    .click();

  const screen = page.locator(".vf-figma-questionnaire-screen");
  if (!(await screen.isVisible({ timeout: 1_000 }).catch(() => false))) {
    const drawer = page
      .locator('[data-v19-linear-drawer="true"], .v19-submission-detail-dialog')
      .last();
    await drawer
      .getByRole("tab", { name: /^Анкета/ })
      .first()
      .click();
    await drawer.getByRole("button", { name: "Открыть анкету" }).first().click();
  }
  await expect(screen).toBeVisible();
  return screen;
}

async function openSection(page: Page, label: string, fieldId: string) {
  await page
    .locator(".v19-questionnaire-section-tab:visible")
    .filter({ hasText: label })
    .first()
    .click();
  return page.locator(`[data-model-field-id="${fieldId}"] input`);
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

async function expectExactReviewValues(
  dialog: ReturnType<Page["getByRole"]>,
  expectedValues: Readonly<Record<string, string>>,
) {
  await expect(dialog.locator(".v19-smart-import-review-row")).toHaveCount(
    Object.keys(expectedValues).length,
    { timeout: 75_000 },
  );
  for (const [fieldId, value] of Object.entries(expectedValues)) {
    const label = smartImportFieldLabels[fieldId];
    if (!label) throw new Error(`Missing Smart Import label for ${fieldId}`);
    const checkbox = dialog.getByLabel(`Применить ${label}`, { exact: true });
    await expect(checkbox).toHaveCount(1);
    await expect(
      checkbox.locator("xpath=..").locator(".v19-smart-import-review-value"),
    ).toHaveText(value);
  }
}

async function waitForFileReviewOrSurfaceError(
  page: Page,
  dialog: ReturnType<Page["getByRole"]>,
  sourceName: string,
) {
  const processing = dialog.getByRole("status");
  await expect(processing, `${sourceName}: processing begins`).toBeVisible({
    timeout: 5_000,
  });
  await expect(processing, `${sourceName}: processing resolves`).toBeHidden({
    timeout: 80_000,
  });

  const alert = dialog.getByRole("alert");
  if (await alert.count()) {
    const diagnostic = await diagnoseDefaultPdfExtractionCause(page, sourceName);
    throw new Error(
      `${sourceName}: local file extraction failed: ${(await alert.textContent())?.trim()}; diagnostic=${JSON.stringify(diagnostic)}`,
    );
  }
  await expect(alert, `${sourceName}: no fail-closed extraction alert`).toHaveCount(0);
}

async function diagnoseDefaultPdfExtractionCause(page: Page, sourceName: string) {
  if (sourceName !== "dense-labelled-questionnaire.pdf") {
    return { sourceName, status: "not-pdf" };
  }
  const bytes = readFileSync(resolve(fixtureDirectory, sourceName)).toString("base64");
  return page.evaluate(
    async ({ encoded, name }) => {
      const raw = Uint8Array.from(atob(encoded), (character) =>
        character.charCodeAt(0),
      );
      const file = new File([raw], name, { type: "application/pdf" });
      try {
        const modulePath = "/src/modules/submissions/smartImportFileExtraction.ts";
        const { extractSmartImportFromFile } = await import(
          /* @vite-ignore */ modulePath
        );
        const parsed = await extractSmartImportFromFile(file);
        return { candidateCount: parsed.candidates.length, status: "parsed" };
      } catch (error) {
        const metadata =
          error && typeof error === "object"
            ? (error as {
                cause?: unknown;
                code?: unknown;
                message?: unknown;
                name?: unknown;
              })
            : {};
        const cause = metadata.cause;
        const causeMetadata =
          cause && typeof cause === "object"
            ? (cause as { message?: unknown; name?: unknown })
            : {};
        return {
          causeMessage:
            typeof causeMetadata.message === "string"
              ? causeMetadata.message
              : undefined,
          causeName:
            typeof causeMetadata.name === "string" ? causeMetadata.name : undefined,
          code: typeof metadata.code === "string" ? metadata.code : undefined,
          message: typeof metadata.message === "string" ? metadata.message : undefined,
          name: typeof metadata.name === "string" ? metadata.name : undefined,
          status: "error",
        };
      }
    },
    { encoded: bytes, name: sourceName },
  );
}

async function setPassportIssueCountry(page: Page, value: string) {
  await page
    .locator(".v19-questionnaire-section-tab:visible")
    .filter({ hasText: "Паспорт" })
    .first()
    .click();
  const field = page.locator('[data-model-field-id="passport-issue-country"]');
  await field.getByRole("combobox").click();
  await field.getByRole("searchbox", { name: "Поиск: Страна выдачи" }).fill(value);
  await field.getByRole("option", { name: value, exact: true }).click();
  await expect(field.getByRole("combobox")).toContainText(value);
}

test.describe("Smart Import PII-free default file extraction", () => {
  test("reads the real PDF text layer and PNG locally, then applies only explicit choices", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(testInfo.project.name !== "chromium", "single-project browser proof");

    await page.setViewportSize({ width: 390, height: 844 });
    await signInThroughVisibleForm(page);
    const questionnaire = await openQuestionnaireThroughVisibleActions(page);
    await setPassportIssueCountry(page, "Spain");
    const importButton = questionnaire.getByRole("button", { name: "Умный импорт" });
    await importButton.click();

    const dialog = page.getByRole("dialog", { name: "Умный импорт" });
    const close = dialog.getByRole("button", { name: "Закрыть умный импорт" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(importButton).toBeFocused();

    await importButton.click();
    await dialog
      .getByLabel("Выбрать фото или PDF")
      .setInputFiles(resolve(fixtureDirectory, "dense-labelled-questionnaire.pdf"));
    const reviewRows = dialog.locator(".v19-smart-import-review-row");
    await waitForFileReviewOrSurfaceError(
      page,
      dialog,
      "dense-labelled-questionnaire.pdf",
    );
    await expectExactReviewValues(
      dialog,
      coverageManifest.sources["dense-labelled-questionnaire"].expectedValues,
    );
    await expect(
      dialog.getByRole("checkbox", { exact: true, name: "Применить Email" }),
    ).toBeVisible();
    await expect(dialog.getByTestId("smart-import-review-privacy")).toContainText(
      "Файл обработан локально и очищается",
    );
    await expect(dialog.getByLabel("Применить Текущее гражданство")).toHaveCount(0);

    for (const label of [
      "Тип паспорта",
      "Номер паспорта",
      "Дата выдачи паспорта",
      "Действителен до",
      "Страна выдачи паспорта",
      "Место выдачи паспорта",
    ]) {
      await expect(dialog.getByLabel(`Применить ${label}`)).not.toBeChecked();
    }

    await dialog.evaluate((element) => {
      const selector = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(",");
      const focusable = Array.from(element.querySelectorAll<HTMLElement>(selector));
      focusable.at(-1)?.focus();
    });
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Применить выбранное" }),
    ).toBeFocused();

    for (const viewport of reviewViewports) {
      await page.setViewportSize(viewport);
      await expect(dialog).toBeVisible();
      await expectNoHorizontalOverflow(page, `PDF review ${viewport.width}`);
      const screenshot = testArtifactPath(
        "screenshots",
        `smart-import-default-pdf-review-${viewport.width}.png`,
      );
      prepareScreenshot(screenshot);
      await page.screenshot({ path: screenshot, fullPage: true });
    }

    for (const viewport of reviewViewports.filter(({ width }) => width < 768)) {
      await page.setViewportSize(viewport);
      const lastReviewRow = reviewRows.last();
      const lastReviewCheckbox = lastReviewRow.locator('input[type="checkbox"]');
      await lastReviewRow.evaluate((row) => {
        row.scrollIntoView({ block: "center" });
      });
      await expect(lastReviewCheckbox).toBeVisible();
      await expect(lastReviewCheckbox).toBeEnabled();

      const assertLastRowClearsStickyFooter = async (state: string) => {
        const geometry = await lastReviewRow.evaluate((row) => {
          const footer = document.querySelector<HTMLElement>(
            ".v19-smart-import-footer",
          );
          const rowBounds = row.getBoundingClientRect();
          const checkboxBounds = row
            .querySelector<HTMLInputElement>('input[type="checkbox"]')
            ?.getBoundingClientRect();
          return {
            checkboxBottom: checkboxBounds?.bottom ?? Number.POSITIVE_INFINITY,
            footerTop: footer?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
            rowBottom: rowBounds.bottom,
          };
        });
        expect(
          geometry.checkboxBottom,
          `${viewport.width}: last checkbox ${state} is above sticky footer`,
        ).toBeLessThanOrEqual(geometry.footerTop);
        expect(
          geometry.rowBottom,
          `${viewport.width}: last row ${state} is above sticky footer`,
        ).toBeLessThanOrEqual(geometry.footerTop);
      };

      await assertLastRowClearsStickyFooter("before toggle");
      const wasChecked = await lastReviewCheckbox.isChecked();
      await lastReviewCheckbox.click();
      await expect(lastReviewCheckbox).toBeChecked({ checked: !wasChecked });
      await assertLastRowClearsStickyFooter("after toggle");

      const bottomStateScreenshot = testArtifactPath(
        "screenshots",
        `smart-import-default-pdf-last-review-${viewport.width}.png`,
      );
      prepareScreenshot(bottomStateScreenshot);
      await page.screenshot({ path: bottomStateScreenshot });

      await lastReviewCheckbox.click();
      await expect(lastReviewCheckbox).toBeChecked({ checked: wasChecked });
    }
    await page.setViewportSize({ width: 390, height: 844 });

    const email = dialog.getByRole("checkbox", {
      exact: true,
      name: "Применить Email",
    });
    if (!(await email.isChecked())) await email.check();
    await dialog.getByRole("button", { name: "Применить выбранное" }).click();
    await expect(dialog).toBeHidden();
    const emailInput = await openSection(page, "Адрес и контакты", "email");
    await expect(emailInput).toHaveValue("demo.applicant@example.test");
    await expect(questionnaire.getByText("Сохранено", { exact: true })).toHaveText(
      "Сохранено",
      {
        timeout: 15_000,
      },
    );
    await expectNoHorizontalOverflow(page, "PDF review and explicit apply");
    prepareScreenshot(pdfScreenshot);
    await page.screenshot({ path: pdfScreenshot, fullPage: true });

    await importButton.click();
    await dialog
      .getByLabel("Выбрать фото или PDF")
      .setInputFiles(resolve(fixtureDirectory, "dense-labelled-questionnaire.png"));
    await waitForFileReviewOrSurfaceError(
      page,
      dialog,
      "dense-labelled-questionnaire.png",
    );
    await expectExactReviewValues(
      dialog,
      coverageManifest.sources["dense-labelled-questionnaire"].expectedValues,
    );
    await expect(
      coverageManifest.candidateUniverse.excludedFieldIds.every(
        (fieldId) =>
          !Object.hasOwn(
            coverageManifest.sources["dense-labelled-questionnaire"].expectedValues,
            fieldId,
          ),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await importButton.click();
    await dialog
      .getByLabel("Выбрать фото или PDF")
      .setInputFiles(resolve(fixtureDirectory, "passport-style-safe.png"));
    await waitForFileReviewOrSurfaceError(page, dialog, "passport-style-safe.png");
    const passportExpectedValues =
      coverageManifest.sources["passport-style-safe"].expectedValues;
    await expectExactReviewValues(dialog, passportExpectedValues);
    for (const fieldId of Object.keys(passportExpectedValues)) {
      const label = smartImportFieldLabels[fieldId];
      if (!label) throw new Error(`Missing Smart Import label for ${fieldId}`);
      const passportField = dialog.getByLabel(`Применить ${label}`, { exact: true });
      await expect(passportField).toBeEnabled();
      await expect(passportField).not.toBeChecked();
      await passportField.check();
    }
    await dialog.getByRole("button", { name: "Применить выбранное" }).click();
    await expect(dialog).toBeHidden();
    await openSection(page, "Паспорт", "passport-no");
    for (const [fieldId, value] of Object.entries(passportExpectedValues)) {
      const field = page.locator(`[data-model-field-id="${fieldId}"]`);
      const combobox = field.getByRole("combobox");
      if (await combobox.count()) {
        await expect(combobox).toContainText(value);
      } else {
        await expect(field.locator("input")).toHaveValue(value);
      }
    }
    await expect(questionnaire.getByText("Сохранено", { exact: true })).toHaveText(
      "Сохранено",
      {
        timeout: 15_000,
      },
    );
    await expectNoHorizontalOverflow(page, "PNG review and explicit passport apply");
    prepareScreenshot(pngScreenshot);
    await page.screenshot({ path: pngScreenshot, fullPage: true });

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои действия" }),
    ).toBeVisible();
    await openQuestionnaireThroughVisibleActions(page);
    await expect(await openSection(page, "Адрес и контакты", "email")).toHaveValue(
      "demo.applicant@example.test",
    );
    await openSection(page, "Паспорт", "passport-no");
    for (const [fieldId, value] of Object.entries(passportExpectedValues)) {
      const field = page.locator(`[data-model-field-id="${fieldId}"]`);
      const combobox = field.getByRole("combobox");
      if (await combobox.count()) {
        await expect(combobox).toContainText(value);
      } else {
        await expect(field.locator("input")).toHaveValue(value);
      }
    }
  });
});
