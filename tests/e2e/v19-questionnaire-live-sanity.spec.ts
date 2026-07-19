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

  const continueQuestionnaire = page.getByRole("button", {
    exact: true,
    name: "Продолжить: Артём Соколов",
  });
  await expect(continueQuestionnaire).toBeVisible();
  await continueQuestionnaire.click();

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

async function expectFullscreenQuestionnaireShell(
  page: Page,
  viewport: { height: number; width: number },
) {
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(
      ".vf-figma-questionnaire-screen.v19-questionnaire-screen-shell",
    );
    const shellBox = shell?.getBoundingClientRect();
    const shellStyle = shell ? getComputedStyle(shell) : undefined;

    return shellBox && shellStyle
      ? {
          borderRadius: shellStyle.borderRadius,
          height: shellBox.height,
          width: shellBox.width,
          x: shellBox.x,
          y: shellBox.y,
        }
      : null;
  });

  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry?.x ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry?.y ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
  expect(geometry?.width ?? 0).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(geometry?.height ?? 0).toBeGreaterThanOrEqual(viewport.height - 1);
}

async function expectMobileQuestionnaireLayout(
  page: Page,
  viewport: { height: number; width: number },
) {
  await expectFullscreenQuestionnaireShell(page, viewport);

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();

      return box
        ? {
            height: box.height,
            width: box.width,
            x: box.x,
            y: box.y,
          }
        : null;
    };
    const scroll = document.querySelector<HTMLElement>(".v19-questionnaire-scroll");
    const workPanel = document.querySelector<HTMLElement>(
      ".v19-questionnaire-work-panel",
    );
    const shell = document.querySelector<HTMLElement>(
      ".vf-figma-questionnaire-screen.v19-questionnaire-screen-shell",
    );
    const scrollFrame = document.querySelector<HTMLElement>(
      ".v19-questionnaire-scroll-frame",
    );

    const shellBox = shell?.getBoundingClientRect();
    const frameBox = scrollFrame?.getBoundingClientRect();

    return {
      backButton: rect(".v19-questionnaire-back-button"),
      borderRadius: shell ? getComputedStyle(shell).borderRadius : null,
      contentInset:
        shellBox && frameBox ? frameBox.left - shellBox.left : Number.NEGATIVE_INFINITY,
      header: rect(".v19-questionnaire-screen-header"),
      saveButton: rect(".v19-questionnaire-save-button"),
      scrollOverflowY: scroll ? getComputedStyle(scroll).overflowY : null,
      workPanel: rect(".v19-questionnaire-work-panel"),
      workPanelOverflowY: workPanel ? getComputedStyle(workPanel).overflowY : null,
    };
  });

  expect(geometry.borderRadius).toBe("0px");
  expect(geometry.header?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    viewport.height * 0.15,
  );
  expect(geometry.contentInset).toBeGreaterThanOrEqual(16);
  expect(geometry.workPanel?.height ?? 0).toBeGreaterThanOrEqual(viewport.height * 0.75 - 1);
  expect(geometry.scrollOverflowY).toBe("auto");
  expect(geometry.workPanelOverflowY).toBe("visible");
  expect(geometry.backButton?.width ?? 0).toBeGreaterThanOrEqual(40);
  expect(geometry.backButton?.height ?? 0).toBeGreaterThanOrEqual(40);
  expect(geometry.saveButton?.height ?? 0).toBeGreaterThanOrEqual(40);
  await expectNoDocumentOverflow(page);
}

test.describe("V-19 questionnaire live sanity", () => {
  test("desktop keeps the questionnaire actionable and autosaves a safe draft change", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openQuestionnaire(page);
    await expectFullscreenQuestionnaireShell(page, { height: 900, width: 1440 });

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
    const reviewCell = reviewField.locator(
      "xpath=ancestor::*[@data-field-label='Дата рождения']",
    );
    await expect(reviewCell).toContainText("Подтвердить");
    const [reviewControlBox, confirmReviewBox] = await Promise.all([
      reviewField.boundingBox(),
      confirmReview.boundingBox(),
    ]);
    expect(reviewControlBox).not.toBeNull();
    expect(confirmReviewBox).not.toBeNull();
    expect(
      Math.abs(
        (confirmReviewBox?.x ?? 0) -
          ((reviewControlBox?.x ?? 0) + (reviewControlBox?.width ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs((confirmReviewBox?.y ?? 0) - (reviewControlBox?.y ?? 0))).toBeLessThanOrEqual(
      1,
    );
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-review-desktop.png"),
    });

    await page.getByRole("button", { name: /Адрес и контакты/ }).first().click();
    const street = page.getByRole("combobox", {
      name: "Улица / проспект / переулок",
    });
    await street.fill("ул");
    await expect(page.getByRole("option", { name: "улица" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-address-desktop.png"),
    });
    await page.getByRole("option", { name: "улица" }).click();
    await expect(street).toHaveValue("улица ");
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
    await expectMobileQuestionnaireLayout(page, { height: 844, width: 390 });

    const header = page.locator(".v19-questionnaire-screen-header");
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(844 * 0.15);

    await expect(page.locator(".v19-questionnaire-header-actions")).toBeVisible();
    const blocker = page.getByRole("button", {
      name: /^Перейти к следующему обязательному действию:/,
    });
    await expect(blocker).toBeVisible();
    await blocker.click();
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Сохранить и выйти" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Адрес и контакты/ }).first().click();

    const applicantNextButtons = page.locator(
      '[aria-label^="Следующее незаполненное:"]',
    );
    expect(await applicantNextButtons.count()).toBeGreaterThan(0);
    await expect(applicantNextButtons.first()).toBeHidden();

    const pinnedSections = page.locator(
      ".v19-questionnaire-section-list--pinned",
    );
    const pinnedSectionLayout = await pinnedSections.evaluate((element) => {
      const style = getComputedStyle(element);
      const firstSection = element.querySelector<HTMLElement>(
        ".v19-questionnaire-section-tab",
      );
      return {
        display: style.display,
        firstSectionHeight: firstSection?.getBoundingClientRect().height ?? 0,
        overflowX: style.overflowX,
      };
    });
    expect(pinnedSectionLayout.display).toBe("flex");
    expect(pinnedSectionLayout.firstSectionHeight).toBeLessThanOrEqual(48);
    expect(["auto", "scroll"]).toContain(pinnedSectionLayout.overflowX);
    const [applicantTabBox, sectionTabBox] = await Promise.all([
      page.locator(".v19-questionnaire-applicant-tab").first().boundingBox(),
      page.locator(".v19-questionnaire-section-tab").first().boundingBox(),
    ]);
    expect(applicantTabBox).not.toBeNull();
    expect(sectionTabBox).not.toBeNull();
    expect(
      Math.abs((applicantTabBox?.height ?? 0) - (sectionTabBox?.height ?? 0)),
    ).toBeLessThanOrEqual(1);

    const [countryBox, cityBox] = await Promise.all([
      page.locator('[data-field-label="Страна проживания"]').boundingBox(),
      page.locator('[data-field-label="Город проживания"]').boundingBox(),
    ]);
    expect(countryBox).not.toBeNull();
    expect(cityBox).not.toBeNull();
    expect(cityBox?.y ?? 0).toBeGreaterThan((countryBox?.y ?? 0) + 2);
    expect(Math.abs((countryBox?.width ?? 0) - (cityBox?.width ?? 0))).toBeLessThanOrEqual(2);

    const [houseBox, buildingBox] = await Promise.all([
      page.locator('[data-field-label="Дом"]').boundingBox(),
      page.locator('[data-field-label="Корпус / строение"]').boundingBox(),
    ]);
    expect(houseBox).not.toBeNull();
    expect(buildingBox).not.toBeNull();
    expect(buildingBox?.y ?? 0).toBeGreaterThan((houseBox?.y ?? 0) + 2);

    const [unitBox, postalBox] = await Promise.all([
      page.locator('[data-field-label="Квартира / офис / помещение"]').boundingBox(),
      page.locator('[data-field-label="Почтовый индекс"]').boundingBox(),
    ]);
    expect(unitBox).not.toBeNull();
    expect(postalBox).not.toBeNull();
    expect(postalBox?.y ?? 0).toBeGreaterThan((unitBox?.y ?? 0) + 2);

    await page.getByRole("button", { name: /Личные данные/ }).first().click();
    const [surnameBox, previousSurnameBox] = await Promise.all([
      page.locator('[data-field-label="Фамилия"]').boundingBox(),
      page.locator('[data-field-label="Предыдущие фамилии"]').boundingBox(),
    ]);
    expect(surnameBox).not.toBeNull();
    expect(previousSurnameBox).not.toBeNull();
    expect(previousSurnameBox?.y ?? 0).toBeGreaterThan((surnameBox?.y ?? 0) + 2);
    await expect(page.locator('[data-field-label="Предыдущие фамилии"]')).toBeVisible();

    const reviewControl = page.locator(
      '[data-field-label="Дата рождения"] .v19-questionnaire-control-shell.has-confirmation',
    );
    const reviewInput = reviewControl.locator(".v19-questionnaire-field-control");
    const reviewConfirmation = reviewControl.getByRole("button", {
      name: "Подтвердить поле: Дата рождения",
    });
    await expect(reviewControl).toBeVisible();
    await expect(reviewConfirmation).toBeVisible();
    const [reviewShellBox, reviewInputBox, reviewConfirmationBox] = await Promise.all([
      reviewControl.boundingBox(),
      reviewInput.boundingBox(),
      reviewConfirmation.boundingBox(),
    ]);
    expect(reviewShellBox).not.toBeNull();
    expect(reviewInputBox).not.toBeNull();
    expect(reviewConfirmationBox).not.toBeNull();
    expect(Math.abs((reviewInputBox?.y ?? 0) - (reviewConfirmationBox?.y ?? 0))).toBeLessThanOrEqual(
      1,
    );
    expect((reviewConfirmationBox?.x ?? 0) + (reviewConfirmationBox?.width ?? 0)).toBeLessThanOrEqual(
      (reviewShellBox?.x ?? 0) + (reviewShellBox?.width ?? 0) + 1,
    );

    const displayedPlaceholders = await page
      .locator(
        ".v19-questionnaire-work-panel input[placeholder], .v19-questionnaire-work-panel textarea[placeholder]",
      )
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("placeholder")));
    expect(displayedPlaceholders.every((placeholder) => !/^Например,/iu.test(placeholder ?? ""))).toBe(
      true,
    );
    const placeholderPresentation = await page
      .locator(
        ".v19-questionnaire-work-panel input[placeholder], .v19-questionnaire-work-panel textarea[placeholder]",
      )
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element, "::placeholder");
        return {
          color: style.color,
          fontSize: Number.parseFloat(style.fontSize),
          textTransform: style.textTransform,
        };
      });
    expect(placeholderPresentation.fontSize).toBeLessThanOrEqual(10);
    expect(placeholderPresentation.textTransform).toBe("lowercase");
    expect(placeholderPresentation.color).not.toBe("rgb(255, 255, 255)");

    const maleChoice = page.getByRole("button", { exact: true, name: "Мужской" });
    const femaleChoice = page.getByRole("button", { exact: true, name: "Женский" });
    await maleChoice.click();
    const [maleBackground, femaleBackground] = await Promise.all([
      maleChoice.evaluate((element) => getComputedStyle(element).backgroundColor),
      femaleChoice.evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    expect(maleBackground).not.toBe(femaleBackground);
    await expect(maleChoice).toHaveAttribute("aria-pressed", "true");

    const applicantTabs = page.locator(".v19-questionnaire-applicant-tab");
    if ((await applicantTabs.count()) > 1) {
      await applicantTabs.nth(1).click();
      await expect(applicantTabs.nth(1)).toHaveAttribute("aria-pressed", "true");
    }

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

  for (const viewport of [
    { height: 740, width: 320 },
    { height: 812, width: 375 },
    { height: 932, width: 430 },
  ]) {
    test(`mobile ${viewport.width} keeps a fullscreen shell and a 75dvh work area`, async ({
      page,
    }, testInfo) => {
      const browserProblems = collectBrowserProblems(page);
      await page.setViewportSize(viewport);
      await openQuestionnaire(page);

      await expectMobileQuestionnaireLayout(page, viewport);
      const [countryBox, cityBox] = await Promise.all([
        page.locator('[data-field-label="Страна проживания"]').boundingBox(),
        page.locator('[data-field-label="Город проживания"]').boundingBox(),
      ]);
      expect(countryBox).not.toBeNull();
      expect(cityBox).not.toBeNull();
      expect(cityBox?.y ?? 0).toBeGreaterThan((countryBox?.y ?? 0) + 2);
      expect(Math.abs((countryBox?.width ?? 0) - (cityBox?.width ?? 0))).toBeLessThanOrEqual(2);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`questionnaire-mobile-${viewport.width}.png`),
      });
      expect(browserProblems).toEqual([]);
    });
  }

  test("tablet keeps the existing fullscreen desktop composition", async ({ page }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const viewport = { height: 1024, width: 768 };
    await page.setViewportSize(viewport);
    await openQuestionnaire(page);

    await expectFullscreenQuestionnaireShell(page, viewport);
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expectNoDocumentOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-tablet-768.png"),
    });
    expect(browserProblems).toEqual([]);
  });
});
