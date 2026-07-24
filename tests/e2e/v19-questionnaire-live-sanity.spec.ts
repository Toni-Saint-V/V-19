import { expect, test, type Page } from "@playwright/test";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

async function openQuestionnaire(
  page: Page,
  options: { withSpouse?: boolean } = {},
) {
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const ownedByCurrentLocalAgent = initialSubmissions.map((submission) => {
    const applicants = submission.applicants.map((applicant) => ({
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
    }));
    const primaryApplicant = applicants[0];
    const withSpouse =
      options.withSpouse && submission.id === "ПД-1051" && primaryApplicant
        ? [
            ...applicants,
            {
              ...primaryApplicant,
              fullName: "Анна Соколова",
              id: "з-1051-e2e-spouse",
              role: "spouse" as const,
            },
          ]
        : applicants;

    return {
      ...submission,
      agentId: "local-agent-tony",
      applicants: withSpouse,
      type: withSpouse.length > 1 ? ("family" as const) : submission.type,
    };
  });
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
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();

  const openQuestionnaireAction = page
    .locator("button:visible")
    .filter({ hasText: /^Открыть анкету$/ })
    .first();
  if (await openQuestionnaireAction.isVisible({ timeout: 750 }).catch(() => false)) {
    await openQuestionnaireAction.click();
  } else {
    const mobileQuestionnaireAction = page
      .locator(
        'button:visible[aria-label^="Открыть действие:"][aria-label*="Артём Соколов"]',
      )
      .first();
    await expect(mobileQuestionnaireAction).toBeVisible();
    await mobileQuestionnaireAction.click();
  }

  const questionnaireScreen = page.locator(".vf-figma-questionnaire-screen");
  if (!(await questionnaireScreen.isVisible({ timeout: 1_000 }).catch(() => false))) {
    const submissionDrawer = page
      .locator('[data-v19-linear-drawer="true"], .v19-submission-detail-dialog')
      .last();
    await expect(submissionDrawer).toBeVisible();
    const questionnaireTab = submissionDrawer
      .getByRole("tab", { name: /^Анкета/ })
      .first();
    await expect(questionnaireTab).toBeVisible();
    await questionnaireTab.click();
    const openQuestionnaire = submissionDrawer
      .getByRole("button", { name: "Открыть анкету" })
      .first();
    await expect(openQuestionnaire).toBeVisible();
    await openQuestionnaire.click();
  }

  await expect(questionnaireScreen).toBeVisible();
  await expect(
    questionnaireScreen.locator('[role="combobox"]:visible').first(),
  ).toBeVisible();
}

function mobileQuestionnaireSection(page: Page, title: string) {
  return page
    .locator(".v19-questionnaire-section-list--pinned .v19-questionnaire-section-tab")
    .filter({ hasText: title });
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

async function expectMobileControlsAtLeast44(page: Page) {
  const undersizedControls = await page
    .locator(
      ".vf-figma-questionnaire-screen button:visible:not(:disabled), .vf-figma-questionnaire-screen select:visible:not(:disabled), .vf-figma-questionnaire-screen input:visible:not(:disabled)",
    )
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const box = control.getBoundingClientRect();
          return {
            height: box.height,
            label:
              control.getAttribute("aria-label") ??
              control.textContent?.replace(/\s+/g, " ").trim() ??
              control.tagName,
            width: box.width,
          };
        })
        .filter(({ height, width }) => height < 44 || width < 44),
    );
  expect(undersizedControls).toEqual([]);
}

async function expectMobileQuestionnaireLayout(
  page: Page,
  viewport: { height: number; width: number },
) {
  await expectFullscreenQuestionnaireShell(page, viewport);

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document
        .querySelector<HTMLElement>(selector)
        ?.getBoundingClientRect();

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
      applicantBarDisplay: getComputedStyle(
        document.querySelector<HTMLElement>(".v19-questionnaire-applicant-bar")!,
      ).display,
      borderRadius: shell ? getComputedStyle(shell).borderRadius : null,
      contentInset:
        shellBox && frameBox ? frameBox.left - shellBox.left : Number.NEGATIVE_INFINITY,
      footer: rect(".v19-questionnaire-mobile-footer"),
      footerApplicant: rect(
        ".v19-questionnaire-mobile-footer-applicant .v19-select-menu-trigger",
      ),
      footerSave: rect(".v19-questionnaire-mobile-footer-save"),
      header: rect(".v19-questionnaire-screen-header"),
      headerDisplay: getComputedStyle(
        document.querySelector<HTMLElement>(".v19-questionnaire-screen-header")!,
      ).display,
      scroll: rect(".v19-questionnaire-scroll"),
      scrollOverflowY: scroll ? getComputedStyle(scroll).overflowY : null,
      workPanel: rect(".v19-questionnaire-work-panel"),
      workPanelOverflowY: workPanel ? getComputedStyle(workPanel).overflowY : null,
    };
  });

  expect(geometry.borderRadius).toBe("0px");
  expect(geometry.headerDisplay).toBe("none");
  expect(geometry.applicantBarDisplay).toBe("none");
  expect(geometry.footer).not.toBeNull();
  expect(geometry.footer?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(geometry.footer?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(96);
  expect(geometry.header?.height ?? Number.POSITIVE_INFINITY).toBe(0);
  expect(geometry.scroll?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
  expect(geometry.scroll?.height ?? 0).toBeGreaterThan(viewport.height * 0.8);
  expect(
    (geometry.scroll?.y ?? 0) + (geometry.scroll?.height ?? 0),
  ).toBeLessThanOrEqual((geometry.footer?.y ?? viewport.height) + 1);
  expect(
    (geometry.footer?.y ?? 0) + (geometry.footer?.height ?? 0),
  ).toBeLessThanOrEqual(viewport.height + 1);
  expect(geometry.contentInset).toBeGreaterThanOrEqual(16);
  expect(geometry.workPanel?.height ?? 0).toBeGreaterThanOrEqual(
    viewport.height * 0.75 - 1,
  );
  expect(geometry.scrollOverflowY).toBe("auto");
  expect(geometry.workPanelOverflowY).toBe("visible");
  expect(geometry.footerSave?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(geometry.footerApplicant?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectMobileControlsAtLeast44(page);
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
    await expect(page.getByTestId("questionnaire-mobile-footer")).toBeHidden();
    await expect(page.locator(".v19-questionnaire-applicant-bar")).toBeHidden();
    await expect(page.locator(".v19-questionnaire-section-nav")).toBeVisible();
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { exact: true, name: "Следующее поле" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { exact: true, name: "Блокер" })).toHaveCount(
      0,
    );

    await page
      .getByRole("button", { name: /Личные данные/ })
      .first()
      .click();
    const reviewField = page
      .locator(".v19-questionnaire-field-control.is-review:visible")
      .first();
    const normalField = page
      .locator(".v19-questionnaire-field-control.is-normal:visible")
      .first();
    await expect(reviewField).toBeVisible();
    await expect(normalField).toBeVisible();
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
    expect(
      Math.abs((confirmReviewBox?.y ?? 0) - (reviewControlBox?.y ?? 0)),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-review-desktop.png"),
    });

    await page
      .getByRole("button", { name: /Адрес и контакты/ })
      .first()
      .click();
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
    await expect(
      page.locator("[role='status']:visible").filter({ hasText: "Сохранено" }),
    ).toBeVisible({
      timeout: 5_000,
    });

    await expectNoDocumentOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-desktop.png"),
    });
    expect(browserProblems).toEqual([]);
  });

  test("mobile keeps footer-first navigation and exposes one current issue surface", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await openQuestionnaire(page, { withSpouse: true });
    await expectMobileQuestionnaireLayout(page, { height: 844, width: 390 });

    await expect(page.locator(".v19-questionnaire-screen-header")).toBeHidden();
    await expect(page.locator(".v19-questionnaire-header-actions")).toBeHidden();
    const mobileFooter = page.getByTestId("questionnaire-mobile-footer");
    await expect(mobileFooter).toBeVisible();
    await expect(
      mobileFooter.getByRole("button", {
        name: "Предыдущий раздел недоступен",
      }),
    ).toBeDisabled();
    await expect(
      mobileFooter.getByRole("button", {
        name: "Сохранить и выйти — нижняя панель",
      }),
    ).toBeVisible();
    await expect(
      mobileFooter.getByRole("combobox", {
        name: "Выбрать заявителя — нижняя панель",
      }),
    ).toBeVisible();
    const touristMenu = mobileFooter.getByLabel("Выбрать заявителя — нижняя панель");
    const selectionPresentation = await page.evaluate(() => {
      const style = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        const computed = element ? getComputedStyle(element) : undefined;
        const box = element?.getBoundingClientRect();
        return computed && box
          ? {
              backgroundColor: computed.backgroundColor,
              borderColor: computed.borderColor,
              borderWidth: computed.borderWidth,
              boxShadow: computed.boxShadow,
              hasIcon: Boolean(element?.querySelector("svg")),
              height: box.height,
              width: box.width,
            }
          : null;
      };

      return {
        activeSection: style(".v19-questionnaire-section-tab.is-active"),
        issueSection: style(
          ".v19-questionnaire-section-tab.status-issue.is-active",
        ),
        pendingSection: style(
          ".v19-questionnaire-section-tab.status-pending:not(.is-active)",
        ),
      };
    });
    expect(selectionPresentation.activeSection?.backgroundColor).not.toBe(
      selectionPresentation.pendingSection?.backgroundColor,
    );
    expect(selectionPresentation.activeSection?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(selectionPresentation.activeSection?.boxShadow).toBe("none");
    expect(selectionPresentation.issueSection).not.toBeNull();
    const blocker = page.getByRole("button", {
      name: /^Перейти к следующему обязательному действию:/,
    });
    await expect(blocker).toHaveCount(0);
    await expect(
      page.locator(".v19-questionnaire-section-tab.status-issue").first(),
    ).toBeVisible();
    await expect(
      page.locator(".v19-questionnaire-field-control.is-review"),
    ).toBeVisible();
    await expect(page.getByTestId("questionnaire-current-issue")).toHaveCount(0);
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expect(
      mobileFooter.getByRole("button", {
        name: "Следующий раздел: Паспорт",
      }),
    ).toBeEnabled();

    await mobileFooter
      .getByRole("button", { name: "Следующий раздел: Паспорт" })
      .click();
    await expect(mobileQuestionnaireSection(page, "Паспорт")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await mobileFooter
      .getByRole("button", { name: "Предыдущий раздел: Личные данные" })
      .click();
    await expect(mobileQuestionnaireSection(page, "Личные данные")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const applicantNextButtons = page.locator(
      '[aria-label^="Следующее незаполненное:"]',
    );
    await expect(applicantNextButtons).toHaveCount(0);

    const mobileQuestionnaire = page.locator(".vf-figma-questionnaire-screen");
    await expect(mobileQuestionnaire).toHaveCount(1);
    const mobileSectionTabs = mobileQuestionnaire.locator(
      ".v19-questionnaire-section-list--pinned .v19-questionnaire-section-tab",
    );
    await expect(mobileSectionTabs).toHaveCount(7);
    const mobileSectionTitles = await mobileSectionTabs
      .locator(".v19-questionnaire-section-title")
      .allTextContents();

    await page
      .getByRole("button", { name: /Отель \/ приглашение/ })
      .first()
      .click();
    await expect(
      mobileFooter.getByRole("button", {
        name: "Следующий раздел недоступен",
      }),
    ).toBeDisabled();
    const nextApplicantAction = page.locator(
      ".v19-questionnaire-next-action-bar .v19-questionnaire-next-button",
    );
    await nextApplicantAction.scrollIntoViewIfNeeded();
    await expect(nextApplicantAction).toHaveAccessibleName("Далее: Анна Соколова");
    await nextApplicantAction.click();
    await expect(
      page.getByText("Контекст анкеты: заявитель Анна Соколова; раздел Личные данные."),
    ).toBeVisible();
    await expect(touristMenu).toContainText("Анна Соколова");
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-mobile-next-applicant.png"),
    });

    await touristMenu.click();
    const touristListbox = page.getByRole("listbox", {
      name: "Выбрать заявителя — нижняя панель",
    });
    const touristOptions = touristListbox.getByRole("option");
    await expect(touristListbox).toBeVisible();
    const listboxHitTargetIsOption = await touristListbox.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + Math.min(box.height / 2, 72),
      );
      return Boolean(hitTarget && element.contains(hitTarget));
    });
    expect(listboxHitTargetIsOption).toBe(true);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-mobile-applicant-menu.png"),
    });
    const firstOption = touristOptions.first();
    const firstLabel = await firstOption.innerText();
    await firstOption.click();
    await expect(touristMenu).toContainText(firstLabel.split("\n")[0] ?? "");
    await expect(
      page.getByText("Контекст анкеты: заявитель Артём Соколов; раздел Личные данные."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Отель \/ приглашение/ })
      .first()
      .click();

    const invitingPartyOptions = page.locator(
      '.v19-questionnaire-quick-options[data-wrap-options="true"]',
    );
    await expect(invitingPartyOptions).toBeVisible();
    const quickOptionsGeometry = await invitingPartyOptions.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(quickOptionsGeometry.scrollWidth).toBeLessThanOrEqual(
      quickOptionsGeometry.clientWidth,
    );

    await page
      .getByRole("button", { name: /Адрес и контакты/ })
      .first()
      .click();

    const pinnedSections = page.locator(".v19-questionnaire-section-list--pinned");
    await expect
      .poll(() =>
        pinnedSections.evaluate((element) => {
          const containerBox = element.getBoundingClientRect();
          const activeSectionBox = element
            .querySelector<HTMLElement>(".v19-questionnaire-section-tab.is-active")
            ?.getBoundingClientRect();
          return Boolean(
            activeSectionBox &&
            activeSectionBox.left >= containerBox.left - 1 &&
            activeSectionBox.right <= containerBox.right + 1,
          );
        }),
      )
      .toBe(true);
    const pinnedSectionLayout = await pinnedSections.evaluate((element) => {
      const style = getComputedStyle(element);
      const firstSection = element.querySelector<HTMLElement>(
        ".v19-questionnaire-section-tab",
      );
      const activeSection = element.querySelector<HTMLElement>(
        ".v19-questionnaire-section-tab.is-active",
      );
      const containerBox = element.getBoundingClientRect();
      const activeSectionBox = activeSection?.getBoundingClientRect();
      return {
        activeSectionRight: activeSectionBox?.right ?? 0,
        activeSectionX: activeSectionBox?.x ?? 0,
        containerRight: containerBox.right,
        containerX: containerBox.x,
        display: style.display,
        firstSectionHeight: firstSection?.getBoundingClientRect().height ?? 0,
        overflowX: style.overflowX,
      };
    });
    expect(pinnedSectionLayout.display).toBe("flex");
    expect(pinnedSectionLayout.firstSectionHeight).toBeLessThanOrEqual(48);
    expect(["auto", "scroll"]).toContain(pinnedSectionLayout.overflowX);
    expect(pinnedSectionLayout.activeSectionX).toBeGreaterThanOrEqual(
      pinnedSectionLayout.containerX - 1,
    );
    expect(pinnedSectionLayout.activeSectionRight).toBeLessThanOrEqual(
      pinnedSectionLayout.containerRight + 1,
    );
    const sectionTabBox = await page
      .locator(".v19-questionnaire-section-tab")
      .first()
      .boundingBox();
    expect(sectionTabBox).not.toBeNull();
    expect(sectionTabBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const topComposition = await page.evaluate(() => {
      const sectionScroller = document.querySelector<HTMLElement>(
        ".v19-questionnaire-section-list--pinned",
      );
      const visibleSectionCards = Array.from(
        sectionScroller?.querySelectorAll<HTMLElement>(
          ".v19-questionnaire-section-tab",
        ) ?? [],
      ).filter((card) => {
        const cardBox = card.getBoundingClientRect();
        const scrollerBox = sectionScroller?.getBoundingClientRect();
        return Boolean(
          scrollerBox &&
          cardBox.left >= scrollerBox.left - 1 &&
          cardBox.right <= scrollerBox.right + 1,
        );
      });
      const scrollBox = document
        .querySelector<HTMLElement>(".v19-questionnaire-scroll")
        ?.getBoundingClientRect();
      const workPanelBox = document
        .querySelector<HTMLElement>(".v19-questionnaire-work-panel")
        ?.getBoundingClientRect();

      return {
        visibleSectionCount: visibleSectionCards.length,
        topStackHeight:
          scrollBox && workPanelBox ? workPanelBox.top - scrollBox.top : 0,
      };
    });
    expect(topComposition.visibleSectionCount).toBeGreaterThanOrEqual(2);
    expect(topComposition.topStackHeight).toBeLessThanOrEqual(84);

    const [countryBox, cityBox] = await Promise.all([
      page.locator('[data-field-label="Страна проживания"]').evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, y: box.y };
      }),
      page.locator('[data-field-label="Город проживания"]').evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, y: box.y };
      }),
    ]);
    expect(cityBox.y).toBeGreaterThan(countryBox.y + 2);
    expect(Math.abs(countryBox.width - cityBox.width)).toBeLessThanOrEqual(2);

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

    await page
      .getByRole("button", { name: /Адрес и контакты/ })
      .first()
      .click();
    const street = page.getByRole("combobox", {
      name: "Улица / проспект / переулок",
    });
    await street.fill("ул");
    await expect(page.getByRole("option", { name: "улица" })).toBeVisible();
    await page.getByRole("option", { name: "улица" }).click();
    await expect(street).toHaveValue("улица ");

    const continueAction = page.locator(
      ".v19-questionnaire-next-action-bar .v19-questionnaire-next-button",
    );
    await continueAction.scrollIntoViewIfNeeded();
    await expect(continueAction).toBeVisible();
    const [continueActionBox, footerBox] = await Promise.all([
      continueAction.boundingBox(),
      mobileFooter.boundingBox(),
    ]);
    expect(continueActionBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    expect(
      (continueActionBox?.y ?? 0) + (continueActionBox?.height ?? 0),
    ).toBeLessThanOrEqual((footerBox?.y ?? Number.POSITIVE_INFINITY) + 1);

    await expectNoDocumentOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-mobile.png"),
    });

    const touchAuditSectionTitles = [
      ...mobileSectionTitles.filter((title) => title !== "Запись"),
      "Запись",
    ];
    for (const sectionTitle of touchAuditSectionTitles) {
      const sectionTab = mobileQuestionnaire
        .locator(
          ".v19-questionnaire-section-list--pinned .v19-questionnaire-section-tab",
        )
        .filter({ hasText: sectionTitle });
      expect(await sectionTab.count()).toBe(1);
      await sectionTab.evaluate((element) => {
        (element as HTMLButtonElement).click();
      });
      await expect(sectionTab).toHaveAttribute("aria-pressed", "true");
      await expectMobileControlsAtLeast44(page);
      await expectNoDocumentOverflow(page);
    }

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
      await page
        .locator(
          ".v19-questionnaire-section-list--pinned .v19-questionnaire-section-tab",
        )
        .filter({ hasText: "Адрес и контакты" })
        .click();
      const [countryBox, cityBox] = await Promise.all([
        page.locator('[data-model-field-id="home-country"]').boundingBox(),
        page.locator('[data-model-field-id="home-city"]').boundingBox(),
      ]);
      expect(countryBox).not.toBeNull();
      expect(cityBox).not.toBeNull();
      expect(cityBox?.y ?? 0).toBeGreaterThan((countryBox?.y ?? 0) + 2);
      expect(
        Math.abs((countryBox?.width ?? 0) - (cityBox?.width ?? 0)),
      ).toBeLessThanOrEqual(2);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`questionnaire-mobile-${viewport.width}.png`),
      });
      expect(browserProblems).toEqual([]);
    });
  }

  for (const viewport of [
    { height: 1024, width: 768 },
    { height: 900, width: 1024 },
  ]) {
    test(`viewport ${viewport.width} keeps the existing desktop composition`, async ({
      page,
    }, testInfo) => {
      const browserProblems = collectBrowserProblems(page);
      await page.setViewportSize(viewport);
      await openQuestionnaire(page);

      await expectFullscreenQuestionnaireShell(page, viewport);
      await expect(page.locator(".v19-questionnaire-screen-header")).toBeVisible();
      await expect(page.getByTestId("questionnaire-mobile-footer")).toBeHidden();
      await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
      await expectNoDocumentOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`questionnaire-desktop-${viewport.width}.png`),
      });
      expect(browserProblems).toEqual([]);
    });
  }
});
