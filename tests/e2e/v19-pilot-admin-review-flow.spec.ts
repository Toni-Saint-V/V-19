import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
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

async function expectWithinViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize();
  expect(viewport, "Playwright viewport must be available.").not.toBeNull();
  if (!viewport) return;

  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      return Boolean(
        box &&
          box.x >= -0.5 &&
          box.y >= -0.5 &&
          box.x + box.width <= viewport.width + 0.5 &&
          box.y + box.height <= viewport.height + 0.5,
      );
    })
    .toBe(true);
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

async function verifyRemarkSubmitActionability(
  page: Page,
  testInfo: TestInfo,
  evidenceLabel: string,
  viewport: { height: number; width: number },
) {
  await page.setViewportSize(viewport);
  const browserProblems = collectBrowserProblems(page);

  await openFreshWorkspace(page, {
    heading: "Проверка",
    workspaceEmail: "admin@visaflow.local",
  });

  await expectBodyMatches(page, [/Проверка|Очередь на проверку/i]);
  if (viewport.width >= 768) {
    await clickWorkspaceButton(page, /Проверка|Работа|Очередь/);
  }
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

  const collapsedQuestionnaireSection = await firstVisible(
    drawer(page).locator("details:not([open])"),
  );
  if (collapsedQuestionnaireSection) {
    await collapsedQuestionnaireSection.locator("summary").click();
  }

  const addRemarkButton = await firstVisible(
    drawer(page).locator(
      '[data-testid="admin-review-add-remark"], button[title="Добавить замечание"]',
    ),
  );
  if (!addRemarkButton) {
    throw new Error("No visible in-drawer remark action was rendered.");
  }

  await expect(addRemarkButton).toBeVisible();
  await addRemarkButton.evaluate((element) => {
    (element as { click(): void }).click();
  });

  const remarkDialog = page
    .getByRole("dialog")
    .filter({ hasText: /Добавить замечание|Новое замечание/i })
    .last();
  await expect(remarkDialog).toBeVisible();
  await expectWithinViewport(page, remarkDialog);

  const submitRemarkButton = remarkDialog
    .locator('[data-testid="remark-form-submit"]')
    .or(
      remarkDialog.getByRole("button", {
        name: /Отправить замечание|Создать замечание/i,
      }),
    )
    .first();

  await expect(submitRemarkButton).toBeVisible();
  await expectWithinViewport(page, submitRemarkButton);
  await testInfo.attach(`remark-submit-${evidenceLabel}`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await submitRemarkButton.click();

  await expect(remarkDialog).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
  await openDrawerTab(page, ["Замечания"]).catch(() => undefined);
  await expectBodyMatches(page, [/Замечания|Исправить|Требуется|Анкета|Файлы|ПД-|SUB-/i]);

  expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
    [],
  );
}

async function verifyEveryAdminDrawerSubview(
  page: Page,
  testInfo: TestInfo,
  viewport: { height: number; width: number },
) {
  const browserProblems = collectBrowserProblems(page);
  const tabs = [
    ["overview", "Обзор"],
    ["applicants", "Заявители"],
    ["questionnaire", "Анкета"],
    ["media", "Файлы"],
    ["issues", "Замечания"],
    ["history", "История"],
  ] as const;
  const captureTabs = new Set(tabs.map(([id]) => id));
  const expectedPanelContent: Record<(typeof tabs)[number][0], RegExp> = {
    overview: /Пакет на проверке/i,
    applicants: /Нина Волкова|Заявители пока нет/i,
    questionnaire: /Заявитель/i,
    media: /Скан паспорта|Файлов пока нет/i,
    issues: /Замечаний нет|Замечания не загружены/i,
    history: /15\.06|История пока пуста/i,
  };

  await page.setViewportSize(viewport);
  await openFreshWorkspace(page, {
    heading: "Проверка",
    workspaceEmail: "admin@visaflow.local",
  });
  if (viewport.width >= 768) {
    await clickWorkspaceButton(page, /Проверка|Работа|Очередь/);
  }
  await openAdminSubmission(page, /Нина Волкова|ПД-1053/);

  // The drawer uses manual activation: arrow keys must select the next tab
  // and keep keyboard focus on it on both the desktop and mobile tab strip.
  await openDrawerTab(page, ["Обзор"]);
  const overviewTab = drawer(page).getByRole("tab", { name: /Обзор/ });
  const applicantsTab = drawer(page).getByRole("tab", { name: /Заявители/ });
  const historyTab = drawer(page).getByRole("tab", { name: /История/ });
  await overviewTab.focus();
  await expect(overviewTab).toBeFocused();

  await overviewTab.press("ArrowRight");
  await expect(applicantsTab).toHaveAttribute("aria-selected", "true");
  await expect(applicantsTab).toBeFocused();

  await applicantsTab.press("End");
  await expect(historyTab).toHaveAttribute("aria-selected", "true");
  await expect(historyTab).toBeFocused();

  await historyTab.press("Home");
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(overviewTab).toBeFocused();

  for (const [id, label] of tabs) {
    await openDrawerTab(page, [label]);

    const panel = drawer(page).getByRole("tabpanel").first();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS("opacity", "1");
    await expect(panel).toContainText(expectedPanelContent[id]);

    expect(
      await page.evaluate(() => {
        const browser = globalThis as unknown as {
          document: { documentElement: { scrollWidth: number } };
          innerWidth: number;
        };
        return browser.document.documentElement.scrollWidth <= browser.innerWidth;
      }),
    ).toBe(true);

    if (captureTabs.has(id)) {
      const screenshotPath = testInfo.outputPath(
        `admin-drawer-${viewport.width}-${id}.png`,
      );
      await page.screenshot({ path: screenshotPath });
      await testInfo.attach(`admin-drawer-${viewport.width}-${id}`, {
        contentType: "image/png",
        path: screenshotPath,
      });
    }
  }

  await openDrawerTab(page, ["Обзор"]);
  const metricLabels = drawer(page).locator(
    ".admin-review-overview-metrics .admin-review-metric > span",
  );
  await expect(metricLabels).toHaveCount(4);
  expect(
    await metricLabels.evaluateAll((labels) =>
      labels.every((label) => {
        const card = label.parentElement;
        if (!card) return false;
        return (
          label.scrollWidth <= label.clientWidth &&
          label.getBoundingClientRect().width >=
            card.getBoundingClientRect().width / 2
        );
      }),
    ),
  ).toBe(true);

  expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
    [],
  );
}

test.describe("V-19 pilot admin review click flow", () => {
  test(
    "admin navigation reaches every local workspace surface on desktop and mobile",
    async ({ page }, testInfo) => {
      const browserProblems = collectBrowserProblems(page);
      const screens = [
        {
          fileName: "review",
          heading: "Проверка",
          nav: /^Проверка$/,
          readyText: "Очередь готова к проверке",
        },
        {
          fileName: "export",
          heading: "Выгрузка",
          nav: /^Выгрузка$/,
          readyText: "Пакеты к выгрузке",
        },
        {
          fileName: "users",
          heading: "Управление пользователями",
          nav: /^Пользователи$/,
          readyText: "Заявки на доступ",
        },
        {
          fileName: "settings",
          heading: "Системные настройки",
          nav: /^Настройки$/,
          readyText: "Уведомления",
        },
      ] as const;

      for (const viewport of [
        { height: 900, width: 1440 },
        { height: 844, width: 390 },
      ]) {
        await page.setViewportSize(viewport);
        await openFreshWorkspace(page, {
          heading: "Проверка",
          workspaceEmail: "admin@visaflow.local",
        });

        for (const screen of screens) {
          await clickWorkspaceButton(page, screen.nav);
          await expect(
            page.getByRole("heading", { level: 1, name: screen.heading }),
          ).toBeVisible();
          await expect(page.getByText(screen.readyText, { exact: true }).first()).toBeVisible();
          if (viewport.width < 768 && screen.fileName === "settings") {
            const activeSettingsTab = page.locator(
              ".settings-nav button[aria-current='page']",
            );
            await expect(activeSettingsTab).toHaveText("Уведомления");
            await expectWithinViewport(page, activeSettingsTab);
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);

          const screenshotPath = testInfo.outputPath(
            `admin-${viewport.width}-${screen.fileName}.png`,
          );
          await page.screenshot({ path: screenshotPath });
          await testInfo.attach(`admin-${viewport.width}-${screen.fileName}`, {
            contentType: "image/png",
            path: screenshotPath,
          });
        }
      }

      expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
        [],
      );
    },
  );

  test("admin settings subviews remain reachable on desktop and mobile", async ({ page }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const sections = [
      ["Профиль", "Профиль"],
      ["Входящие заявки на регистрацию", "Заявки на доступ"],
      ["Команда и роли", "Команда и роли"],
      ["Уведомления", "Уведомления"],
      ["Выгрузка", "Выгрузка"],
      ["Интерфейс", "Интерфейс"],
    ] as const;

    for (const viewport of [
      { height: 900, width: 1440 },
      { height: 844, width: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await openFreshWorkspace(page, {
        heading: "Проверка",
        workspaceEmail: "admin@visaflow.local",
      });
      await clickWorkspaceButton(page, /^Настройки$/);

      const navigation = page.getByRole("navigation", {
        name: "Разделы настроек",
      });
      await expect(navigation).toBeVisible();

      for (const [buttonLabel, heading] of sections) {
        const button = navigation.getByRole("button", { name: buttonLabel });
        await button.click();
        await expect(
          page.getByRole("heading", { level: 2, name: heading, exact: true }),
        ).toBeVisible();
        if (viewport.width < 768) {
          await expectWithinViewport(page, button);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }

      const screenshotPath = testInfo.outputPath(
        `admin-settings-${viewport.width}-interface.png`,
      );
      await page.screenshot({ path: screenshotPath });
      await testInfo.attach(`admin-settings-${viewport.width}-interface`, {
        contentType: "image/png",
        path: screenshotPath,
      });
    }

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });

  test("admin passport reconciliation stays blocked without protected evidence", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });

    const reviewAction = page
      .getByRole("button", { name: /Ручная проверка заявки Нина Волкова/ })
      .first();
    await expect(reviewAction).toBeVisible();
    await reviewAction.click();
    await expect(drawer(page)).toBeVisible();

    await openDrawerTab(page, ["Файлы"]);
    const verifyPassport = drawer(page)
      .getByTestId("admin-review-verify-passport")
      .first();
    await expect(verifyPassport).toBeVisible();
    await verifyPassport.click();

    const passportWorkspace = page.locator(".v19-admin-passport-workspace");
    await expect(passportWorkspace).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Сверка паспорта", exact: true }),
    ).toBeVisible();
    await expect(
      passportWorkspace.getByText("Предпросмотр оригинала недоступен"),
    ).toBeVisible();
    await expect(
      passportWorkspace.getByRole("button", { name: "Завершить сверку паспорта" }),
    ).toBeDisabled();

    expect(
      await page.evaluate(() => {
        const browser = globalThis as unknown as {
          document: { documentElement: { scrollWidth: number } };
          innerWidth: number;
        };
        return browser.document.documentElement.scrollWidth <= browser.innerWidth;
      }),
    ).toBe(true);

    await passportWorkspace.getByRole("button", { name: "Вернуться к подаче" }).click();
    await expect(drawer(page)).toBeVisible();

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });

  test("admin drawer opens every subview without overflow on desktop and mobile", async (
    { page },
    testInfo,
  ) => {
    await verifyEveryAdminDrawerSubview(page, testInfo, {
      height: 900,
      width: 1440,
    });
    await verifyEveryAdminDrawerSubview(page, testInfo, {
      height: 844,
      width: 390,
    });
  });

  for (const [label, viewport] of [
    ["desktop 1440x900", { height: 900, width: 1440 }],
    ["mobile 390x844", { height: 844, width: 390 }],
  ] as const) {
    test(
      `admin queue issue submit is actionable at ${label}`,
      async ({ page }, testInfo) => {
        await verifyRemarkSubmitActionability(page, testInfo, label, viewport);
      },
    );
  }

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

    if ((page.viewportSize()?.width ?? 0) < 768) {
      const controlToggle = page.getByRole("button", {
        name: /^Контроль пакета/,
      });
      await expect(controlToggle).toBeVisible();
      await controlToggle.click();
      await expect(
        page.locator(".v19-admin-export-rail-v2.is-mobile-open"),
      ).toBeVisible();
    }

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
