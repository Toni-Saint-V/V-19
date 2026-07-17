import { expect, test, type Page } from "@playwright/test";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

async function openQuestionnaire(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const ownedByCurrentLocalAgent = initialSubmissions.map((submission) => ({
    ...submission,
    agentId: "local-agent-tony",
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) =>
          field.id === "birth-date"
            ? {
                ...field,
                reviewSource: "passport_ocr" as const,
                reviewState: "needs_review" as const,
              }
            : field,
        ),
      })),
    })),
  }));
  await page.evaluate((submissions) => {
    const browserGlobal = globalThis as unknown as {
      localStorage: { setItem(key: string, value: string): void };
    };
    browserGlobal.localStorage.setItem(
      "visaflow.v19.submissions.v1",
      JSON.stringify(submissions),
    );
  }, ownedByCurrentLocalAgent);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Мои действия" })).toBeVisible();

  const continueAction = page.getByRole("button", { exact: true, name: "Продолжить" });
  await expect(continueAction.first()).toBeVisible();
  await continueAction.first().click();

  await expect(page.locator(".vf-figma-questionnaire-screen")).toBeVisible();
  await expect(
    page.locator(
      ".v19-questionnaire-title-mobile:visible, .v19-questionnaire-title-desktop:visible",
    ),
  ).toBeVisible();
}

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      document: { documentElement: { clientWidth: number; scrollWidth: number } };
    };
    return {
      clientWidth: browserGlobal.document.documentElement.clientWidth,
      scrollWidth: browserGlobal.document.documentElement.scrollWidth,
    };
  });

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.describe("V-19 questionnaire live sanity", () => {
  test("desktop keeps the questionnaire actionable and autosaves a safe draft change", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openQuestionnaire(page);

    await expect(page.locator(".v19-questionnaire-screen-header")).toBeVisible();
    await expect(page.locator(".v19-questionnaire-applicant-bar")).toBeVisible();
    await expect(page.locator(".v19-questionnaire-section-nav")).toBeVisible();
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Следующее поле" })).toBeVisible();

    await page.getByRole("button", { name: /Личные данные/ }).first().click();
    const reviewField = page.locator(".v19-questionnaire-field-control.is-review:visible").first();
    const normalField = page.locator(".v19-questionnaire-field-control.is-normal:visible").first();
    await expect(reviewField).toBeVisible();
    await expect(normalField).toBeVisible();
    const [reviewBackground, normalBackground] = await Promise.all([
      reviewField.evaluate((element) => getComputedStyle(element).backgroundColor),
      normalField.evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    expect(reviewBackground).toBe(normalBackground);
    const confirmReview = page.getByRole("button", {
      name: "Подтвердить поле: Дата рождения",
    });
    await expect(confirmReview).toBeVisible();
    await expect(
      reviewField.locator("xpath=ancestor::*[@data-field-label='Дата рождения']"),
    ).toContainText("Подтвердить");
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-review-desktop.png"),
    });

    await page.getByRole("button", { name: /Адрес и контакты/ }).first().click();
    const address = page.getByRole("textbox", { name: "Домашний адрес" });
    await address.fill("прНовочеркаский56 2 34");
    await expect(address).toHaveValue("прНовочеркаский56 2 34");
    await expect(
      page.getByText("проспект Новочеркаский дом 56, корпус 2, квартира 34"),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-address-desktop.png"),
    });
    await page
      .getByRole("button", { name: "Подставить адрес: Домашний адрес" })
      .click();
    await expect(address).toHaveValue(
      "проспект Новочеркаский дом 56, корпус 2, квартира 34",
    );
    await expect(page.locator("[role='status']:visible").filter({ hasText: "Сохранено" })).toBeVisible({
      timeout: 5_000,
    });

    await expectNoDocumentOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-desktop.png"),
    });
    expect(browserProblems).toEqual([]);
  });

  test("mobile keeps the header compact and exposes the next blocker", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await openQuestionnaire(page);

    const header = page.locator(".v19-questionnaire-screen-header");
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(844 * 0.15);

    await expect(page.locator(".v19-questionnaire-header-actions")).toBeVisible();
    const blocker = page.getByRole("button", { name: /^Перейти к блокеру:/ });
    await expect(blocker).toBeVisible();
    await blocker.click();
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Сохранить и выйти" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Отправить на проверку" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Адрес и контакты/ }).first().click();
    const street = page.getByRole("combobox", {
      name: "Улица / проспект / переулок",
    });
    await street.fill("ул");
    await expect(page.getByRole("option", { name: "улица" })).toBeVisible();
    await page.getByRole("option", { name: "улица" }).click();
    await expect(street).toHaveValue("улица ");

    await expectNoDocumentOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-mobile.png"),
    });
    expect(browserProblems).toEqual([]);
  });
});
