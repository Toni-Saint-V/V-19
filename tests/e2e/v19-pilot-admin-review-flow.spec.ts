import { mkdirSync } from "node:fs";

import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { testRunArtifactPath } from "../support/artifacts";
import { expect, test } from "./v19-localhost-test";
import {
  clearExportSelection,
  clickFirstVisible,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  isVisible,
  openFreshWorkspace,
  openMobileMenu,
} from "./v19-pilot-helpers";

function blockingBrowserProblems(problems: string[]) {
  return problems;
}

async function expectBodyMatches(page: Page, patterns: RegExp[], timeout = 20_000) {
  await expect
    .poll(
      async () => {
        const text = await page
          .locator("body")
          .innerText()
          .catch(() => "");
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

async function openAdminSubmission(
  page: Page,
  preferredText: RegExp,
  expectedDrawerText: RegExp = preferredText,
) {
  const preferred = await firstVisible(
    page
      .locator(
        ".submission-card, .v17-admin-work-row, .v19-event-row, [data-submission-card], [data-submission-id]",
      )
      .filter({ hasText: preferredText }),
  );
  if (!preferred) {
    throw new Error(
      `No visible admin submission row/card matched ${preferredText.toString()}.`,
    );
  }

  await preferred.click();

  if (!(await isVisible(drawer(page)))) {
    const explicitOpen = preferred
      .getByRole("button", { name: /Открыть|Проверить|Подробнее|Подача/i })
      .first();
    if (await isVisible(explicitOpen)) await explicitOpen.click();
  }

  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText(expectedDrawerText);
}

async function signOutAndLogin(
  page: Page,
  credentials: { email: string; password: string },
  expectedHeading: RegExp | string,
) {
  await openMobileMenu(page);
  await clickFirstVisible(page.getByRole("button", { exact: true, name: "Выйти" }));

  const emailInput = page.locator("#workspace-email");
  const loginTab = page.getByRole("button", {
    exact: true,
    name: "Уже есть доступ? Войти",
  });
  await expect(emailInput.or(loginTab)).toBeVisible();
  if (await loginTab.isVisible()) await loginTab.click();

  await emailInput.fill(credentials.email);
  await page.locator("#workspace-password").fill(credentials.password);
  await page.getByRole("button", { exact: true, name: "Войти в кабинет" }).click();
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: expectedHeading }),
  ).toBeVisible();
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
    heading: "Очередь на проверку",
    workspaceEmail: "admin@visaflow.local",
  });

  await expectBodyMatches(page, [/Проверка|Очередь на проверку/i]);
  if (viewport.width >= 768) {
    await clickWorkspaceButton(page, /Проверка|Работа|Очередь/);
    const correctionsLane = page.getByRole("button", {
      exact: true,
      name: "Правки",
    });
    await expect(correctionsLane).toBeVisible();
    await correctionsLane.click();
    await expect(correctionsLane).toHaveAttribute("aria-pressed", "true");
  }
  const returnTarget =
    viewport.width >= 768
      ? {
          cardName: /Ручная проверка заявки Смирновы VF-1055/,
          drawer: /Елена Смирнова|ПД-1055/,
          open: /Смирновы|VF-1055/,
        }
      : {
          cardName: /Ручная проверка заявки Нина Волкова/,
          drawer: /Нина Волкова|ПД-1053/,
          open: /Нина Волкова|ПД-1053/,
        };
  await expectBodyMatches(page, [returnTarget.open, /Проверка|Очередь/i]);
  await expect(page.getByRole("button", { name: returnTarget.cardName })).toBeVisible();

  await openAdminSubmission(page, returnTarget.open, returnTarget.drawer);
  const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
  const addRemarkButton = reviewWorkspace.getByRole("button", {
    name: "Добавить замечание: Номер паспорта",
  });
  await expect(addRemarkButton).toBeVisible();
  await addRemarkButton.click();

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
  await expect(reviewWorkspace).toBeVisible();
  await expect(
    reviewWorkspace.getByRole("status", { name: "Состояние проверки" }),
  ).toContainText(/Открыто\s+1/);

  const returnForCorrection = reviewWorkspace.getByRole("button", {
    name: "Отправить на исправление",
  });
  await expect(returnForCorrection).toBeEnabled();
  await returnForCorrection.click();
  await expect(
    reviewWorkspace.getByText("Возврат на исправление сохранён."),
  ).toBeVisible();
  await expect(reviewWorkspace.getByText("Просмотр без изменений")).toBeVisible();
  const returnReadbackRoot = testRunArtifactPath("admin-return-readback");
  mkdirSync(returnReadbackRoot, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: `${returnReadbackRoot}/${evidenceLabel}-workspace.png`,
  });

  await reviewWorkspace.getByRole("button", { name: "Вернуться к очереди" }).click();
  await expect(
    page.getByRole("heading", { name: "Очередь на проверку" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Очередь на проверку" }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: `${returnReadbackRoot}/${evidenceLabel}.png`,
  });
  await expect(page.getByRole("button", { name: returnTarget.cardName })).toHaveCount(
    0,
  );

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
  const mediaTabs = [
    ["passport_scan", "Паспорт"],
    ["selfie", "Селфи 1"],
    ["selfie_2", "Селфи 2"],
  ] as const;

  await page.setViewportSize(viewport);
  await openFreshWorkspace(page, {
    heading: "Очередь на проверку",
    workspaceEmail: "admin@visaflow.local",
  });
  if (viewport.width >= 768) {
    await clickWorkspaceButton(page, /Проверка|Работа|Очередь/);
  }
  await openAdminSubmission(page, /Нина Волкова|ПД-1053/);

  const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
  await expect(reviewWorkspace).toBeVisible();
  await expectWithinViewport(page, reviewWorkspace);
  const mediaTablist = reviewWorkspace.getByRole("tablist", {
    name: "Выбор файла для проверки",
  });
  await expect(reviewWorkspace.locator("[data-passport-field-id]")).toHaveCount(8);
  await expect(mediaTablist.getByRole("tab")).toHaveCount(3);

  const passportTab = mediaTablist.getByRole("tab", { name: "Паспорт" });
  const firstSelfieTab = mediaTablist.getByRole("tab", { name: "Селфи 1" });
  const secondSelfieTab = mediaTablist.getByRole("tab", { name: "Селфи 2" });
  await passportTab.focus();
  await expect(passportTab).toBeFocused();
  await passportTab.press("ArrowRight");
  await expect(firstSelfieTab).toHaveAttribute("aria-selected", "true");
  await expect(firstSelfieTab).toBeFocused();
  await firstSelfieTab.press("End");
  await expect(secondSelfieTab).toHaveAttribute("aria-selected", "true");
  await expect(secondSelfieTab).toBeFocused();
  await secondSelfieTab.press("Home");
  await expect(passportTab).toHaveAttribute("aria-selected", "true");
  await expect(passportTab).toBeFocused();

  const screenshotRoot = testRunArtifactPath("admin-review-workspace");
  mkdirSync(screenshotRoot, { recursive: true });
  for (const [id, label] of mediaTabs) {
    const tab = mediaTablist.getByRole("tab", { name: label, exact: true });
    await expectWithinViewport(page, tab);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(reviewWorkspace.getByRole("tabpanel")).toBeVisible();
    await expect
      .poll(() =>
        reviewWorkspace
          .locator(".v19-review-preview-state.is-unavailable:visible")
          .count(),
      )
      .toBeGreaterThan(0);

    expect(
      await page.evaluate(() => {
        const browser = globalThis as unknown as {
          document: { documentElement: { scrollWidth: number } };
          innerWidth: number;
        };
        return browser.document.documentElement.scrollWidth <= browser.innerWidth;
      }),
    ).toBe(true);

    const screenshotPath = testRunArtifactPath(
      "admin-review-workspace",
      `admin-review-workspace-${viewport.width}x${viewport.height}-${id}.png`,
    );
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach(
      `admin-review-workspace-${viewport.width}x${viewport.height}-${id}`,
      {
        contentType: "image/png",
        path: screenshotPath,
      },
    );
  }

  expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
    [],
  );
}

test.describe("V-19 pilot admin review click flow", () => {
  test("admin queue recovers from an empty search and resets transient filters after reload", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    const queue = page.getByRole("list", {
      name: "Приоритетная очередь проверки",
    });
    const search = page.getByPlaceholder("ID, семья или агент");
    await expect(queue.getByRole("listitem").first()).toBeVisible();

    await search.fill("НЕСУЩЕСТВУЮЩАЯ-ПОДАЧА");
    await expect(queue.getByText("Ничего не найдено")).toBeVisible();
    await expect(queue.getByRole("listitem")).toHaveCount(0);
    await queue.getByRole("button", { name: "Показать всю очередь" }).click();
    await expect(search).toHaveValue("");
    await expect(queue.getByRole("listitem").first()).toBeVisible();

    await search.fill("НЕСУЩЕСТВУЮЩАЯ-ПОДАЧА");
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Очередь на проверку" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("ID, семья или агент")).toHaveValue("");
    await expect(
      page
        .getByRole("list", { name: "Приоритетная очередь проверки" })
        .getByRole("listitem")
        .first(),
    ).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin navigation reaches every local workspace surface on desktop, tablet and mobile", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const navigationEvidenceRoot = testRunArtifactPath("admin-navigation");
    mkdirSync(navigationEvidenceRoot, { recursive: true });
    const screens = [
      {
        fileName: "review",
        heading: "Очередь на проверку",
        nav: /^Проверка$/,
        readyText: "Очередь проверки",
      },
      {
        fileName: "export",
        heading: "Центр выгрузки",
        nav: /^Выгрузка$/,
        readyText: "Пакеты к выгрузке",
      },
      {
        fileName: "users",
        heading: "Управление пользователями",
        nav: /^Пользователи$/,
        readyText: "Пользователи и заявки",
      },
      {
        fileName: "settings",
        heading: "Системные настройки",
        nav: /^Настройки$/,
        readyText: "Ощущение интерфейса",
      },
    ] as const;

    for (const viewport of [
      { height: 900, width: 1440 },
      { height: 1024, width: 768 },
      { height: 844, width: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await openFreshWorkspace(page, {
        heading: "Очередь на проверку",
        workspaceEmail: "admin@visaflow.local",
      });

      for (const screen of screens) {
        await clickWorkspaceButton(page, screen.nav);
        await expect(
          page.getByRole("heading", { level: 1, name: screen.heading }),
        ).toBeVisible();
        await expect(
          page.getByText(screen.readyText, { exact: true }).first(),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);

        const screenshotPath = `${navigationEvidenceRoot}/admin-${viewport.width}-${screen.fileName}.png`;
        await page.screenshot({ path: screenshotPath });
        await testInfo.attach(`admin-${viewport.width}-${screen.fileName}`, {
          contentType: "image/png",
          path: screenshotPath,
        });
      }
    }

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin settings preferences persist across reload on desktop, tablet and mobile", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const settingsEvidenceRoot = testRunArtifactPath("admin-settings");
    mkdirSync(settingsEvidenceRoot, { recursive: true });

    for (const viewport of [
      { height: 900, width: 1440 },
      { height: 1024, width: 768 },
      { height: 844, width: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await openFreshWorkspace(page, {
        heading: "Очередь на проверку",
        workspaceEmail: "admin@visaflow.local",
      });
      await clickWorkspaceButton(page, /^Настройки$/);

      await expect(
        page.getByRole("heading", { level: 2, name: "Системные настройки" }),
      ).toBeVisible();
      const compactDensity = page.getByRole("switch", {
        name: "Компактная плотность",
      });
      await expect(compactDensity).toHaveAttribute("aria-checked", "false");
      await compactDensity.click();
      await expect(compactDensity).toHaveAttribute("aria-checked", "true");
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.v19Density))
        .toBe("compact");

      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Очередь на проверку" }),
      ).toBeVisible();
      await clickWorkspaceButton(page, /^Настройки$/);
      await expect(
        page.getByRole("switch", { name: "Компактная плотность" }),
      ).toHaveAttribute("aria-checked", "true");
      await page.getByRole("button", { name: "Сбросить" }).click();
      await expect(
        page.getByRole("switch", { name: "Компактная плотность" }),
      ).toHaveAttribute("aria-checked", "false");
      await expect(
        page.locator(".v19-settings-panel-footer").getByRole("status"),
      ).toContainText("Настройки сохранены");

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      const screenshotPath = `${settingsEvidenceRoot}/admin-settings-${viewport.width}-preferences.png`;
      await page.screenshot({ path: screenshotPath });
      await testInfo.attach(`admin-settings-${viewport.width}-preferences`, {
        contentType: "image/png",
        path: screenshotPath,
      });
    }

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin passport reconciliation rejects an unusable original and stays blocked on incomplete fields", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    const reviewAction = page
      .getByRole("button", { name: /Ручная проверка заявки Нина Волкова/ })
      .first();
    await expect(reviewAction).toBeVisible();
    await reviewAction.click();
    const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
    await expect(reviewWorkspace).toBeVisible();
    await expect(reviewWorkspace.getByText("Паспортная секция")).toBeVisible();
    await expect(
      reviewWorkspace.getByRole("alert").getByText("Оригинал нельзя принять"),
    ).toBeVisible();
    await expect(
      reviewWorkspace.getByRole("button", {
        name: "Принять всё",
      }),
    ).toBeDisabled();
    await expect(
      reviewWorkspace.getByRole("button", { name: /^Подтвердить:/ }),
    ).toHaveCount(0);

    expect(
      await page.evaluate(() => {
        const browser = globalThis as unknown as {
          document: { documentElement: { scrollWidth: number } };
          innerWidth: number;
        };
        return browser.document.documentElement.scrollWidth <= browser.innerWidth;
      }),
    ).toBe(true);

    await reviewWorkspace.getByRole("button", { name: "Вернуться к очереди" }).click();
    await expect(reviewWorkspace).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Очередь на проверку" }),
    ).toBeVisible();

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin review workspace opens every protected-media view without overflow on desktop, tablet and mobile", async ({
    page,
  }, testInfo) => {
    await verifyEveryAdminDrawerSubview(page, testInfo, {
      height: 900,
      width: 1440,
    });
    await verifyEveryAdminDrawerSubview(page, testInfo, {
      height: 1024,
      width: 768,
    });
    await verifyEveryAdminDrawerSubview(page, testInfo, {
      height: 844,
      width: 390,
    });
    await verifyEveryAdminDrawerSubview(page, testInfo, {
      height: 800,
      width: 360,
    });
  });

  for (const [label, viewport] of [
    ["desktop 1440x900", { height: 900, width: 1440 }],
    ["tablet 768x1024", { height: 1024, width: 768 }],
    ["mobile 390x844", { height: 844, width: 390 }],
  ] as const) {
    test(`admin queue issue submit is actionable at ${label}`, async ({
      page,
    }, testInfo) => {
      await verifyRemarkSubmitActionability(page, testInfo, label, viewport);
    });
  }

  test("admin closes corrected issues and accepts the package for export on desktop, tablet and mobile", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    const acceptReadbackRoot = testRunArtifactPath("admin-accept-readback");
    mkdirSync(acceptReadbackRoot, { recursive: true });

    for (const viewport of [
      { height: 900, width: 1440 },
      { height: 1024, width: 768 },
      { height: 844, width: 390 },
    ] as const) {
      await page.setViewportSize(viewport);
      await openFreshWorkspace(page, {
        heading: "Очередь на проверку",
        workspaceEmail: "admin@visaflow.local",
      });
      await openAdminSubmission(page, /Смирновы|ПД-1055/);

      const reviewWorkspace = page.getByRole("dialog", {
        name: "Сверка паспорта",
      });
      const correctedIssues = reviewWorkspace.getByRole("region", {
        name: "Исправления к закрытию",
      });
      await expect(correctedIssues).toBeVisible();
      await expect(correctedIssues).toContainText("Адрес отеля был неполным");
      const acceptButton = reviewWorkspace.getByRole("button", {
        name: "Закрыть исправления и принять",
      });

      const applicantSelect = reviewWorkspace.getByRole("combobox", {
        name: "Заявитель для проверки",
      });
      for (const mediaTab of await reviewWorkspace
        .getByRole("tablist", { name: "Выбор файла для проверки" })
        .getByRole("tab")
        .all()) {
        await mediaTab.click();
      }
      await expect(
        reviewWorkspace.getByRole("status", { name: "Состояние проверки" }),
      ).toContainText(/Оригиналы\s+3\/3/);
      await reviewWorkspace.getByRole("button", { name: "Принять всё" }).click();

      await applicantSelect.selectOption({ label: "Алексей Смирнов" });
      await expect(
        reviewWorkspace.getByRole("status", { name: "Состояние проверки" }),
      ).toContainText(/Оригиналы\s+1\/1/);
      await reviewWorkspace.getByRole("button", { name: "Принять всё" }).click();

      await expect(acceptButton).toBeEnabled();
      await acceptButton.click();
      await expect(
        reviewWorkspace.getByText("Подача принята и сохранена."),
      ).toBeVisible();
      await reviewWorkspace
        .getByRole("button", { name: "Вернуться к очереди" })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Очередь на проверку" }),
      ).toBeVisible();

      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Очередь на проверку" }),
      ).toBeVisible();
      await clickWorkspaceButton(page, /Выгрузка/);
      await expect(page.getByTestId("admin-export-row-ПД-1055")).toBeVisible();
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: `${acceptReadbackRoot}/accepted-${viewport.width}x${viewport.height}.png`,
      });
    }

    await signOutAndLogin(page, { email: "1@1.ru", password: "11" }, "Мои действия");
    await openMobileMenu(page);
    await expect(page.getByRole("button", { name: /^Выгрузка$/ })).toHaveCount(0);
    await expect(page.getByTestId("admin-export-row-ПД-1055")).toHaveCount(0);

    await signOutAndLogin(
      page,
      { email: "2@2.ru", password: "22" },
      "Очередь на проверку",
    );
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByTestId("admin-export-row-ПД-1055")).toBeVisible();

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin export surface selects a ready package and prepares Excel", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();

    await clearExportSelection(page);

    const exportRow = page.getByTestId("admin-export-row-SUB-1102");

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

    await expectBodyMatches(page, [
      /Excel готов|Сформировать ZIP с Excel|Можно сформировать/i,
    ]);

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });
});
