import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  expectNoHorizontalOverflow,
  openFreshWorkspace,
  openMobileMenu,
} from "./v19-pilot-helpers";

const breakpointMatrix = [
  { height: 844, label: "390", width: 390 },
  { height: 1024, label: "768", width: 768 },
  { height: 768, label: "1024", width: 1024 },
  { height: 900, label: "1440", width: 1440 },
];

type BrowserRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type BrowserStyle = {
  display: string;
  gridTemplateColumns: string;
  pointerEvents: string;
  visibility: string;
};

type BrowserElement = {
  closest?: (selector: string) => BrowserElement | null;
  contains: (element: BrowserElement | null) => boolean;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => BrowserRect;
  querySelectorAll: (selector: string) => ArrayLike<BrowserElement>;
  tagName: string;
  textContent: string | null;
};

type BrowserGlobal = {
  document: {
    elementFromPoint: (x: number, y: number) => BrowserElement | null;
    querySelectorAll: (selector: string) => ArrayLike<BrowserElement>;
  };
  getComputedStyle: (element: BrowserElement) => BrowserStyle;
  innerHeight: number;
  innerWidth: number;
};

async function clickOperationalNav(page: Page, name: string | RegExp) {
  await clickWorkspaceButton(page, name);
}

async function expectCenterHitTarget(target: Locator, context: string) {
  await target.scrollIntoViewIfNeeded();
  await expect(target, context).toBeVisible();

  const readHit = () => target.evaluate((element) => {
    const browser = globalThis as unknown as BrowserGlobal;
    const targetElement = element as unknown as BrowserElement;
    const rect = targetElement.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), browser.innerWidth - 1);
    const y = Math.min(
      Math.max(rect.top + rect.height / 2, 0),
      browser.innerHeight - 1,
    );
    const top = browser.document.elementFromPoint(x, y);
    const footer = targetElement.closest?.("footer");
    const dialogElement = targetElement.closest?.('[role="dialog"]');
    const cover = top?.closest?.(
      ".ops-mobile-tabbar, .mobile-create-dock, .v19-context-panel, .v19-context-backdrop, .ops-mobile-menu-backdrop",
    );

    return {
      coverClass: cover?.getAttribute("class") ?? null,
      ok: top === targetElement || targetElement.contains(top),
      dialogRect: dialogElement?.getBoundingClientRect() ?? null,
      footerRect: footer?.getBoundingClientRect() ?? null,
      targetRect: rect,
      targetPointerEvents: browser.getComputedStyle(targetElement).pointerEvents,
      targetText:
        targetElement.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
      topClass: top?.getAttribute("class") ?? null,
      topText: top?.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
      viewport: { height: browser.innerHeight, width: browser.innerWidth },
    };
  });

  let hit = await readHit();
  if (!hit.ok) {
    await expect
      .poll(
        async () => {
          hit = await readHit();
          return hit.ok;
        },
        { message: `${context}: wait for the animated surface to settle`, timeout: 3_000 },
      )
      .toBe(true);
  }

  expect(hit.ok, `${context}: ${JSON.stringify(hit)}`).toBe(true);
}

async function expectNoFixedLayerOverControls(page: Page, context: string) {
  const blockers = await page.evaluate(() => {
    const browser = globalThis as unknown as BrowserGlobal;
    const fixedCoverSelector =
      ".ops-mobile-tabbar, .mobile-create-dock, .v19-context-panel, .v19-context-backdrop, .ops-mobile-menu-backdrop";
    const expectedFixedControlContainer =
      ".ops-mobile-tabbar, .mobile-create-dock, .v19-context-panel, .v19-mobile-filter-sheet, .submission-drawer, .create-drawer, .ops-sidebar";
    const controls = Array.from(
      browser.document.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [role="button"], [role="tab"], [role="checkbox"]',
      ),
    );

    function isVisible(element: BrowserElement) {
      const rect = element.getBoundingClientRect();
      const style = browser.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < browser.innerHeight &&
        rect.left < browser.innerWidth &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.pointerEvents !== "none"
      );
    }

    function label(element: BrowserElement) {
      return (
        element.getAttribute("aria-label") ??
        element.textContent ??
        element.getAttribute("name") ??
        element.tagName
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 120);
    }

    return controls.flatMap((control) => {
      if (!isVisible(control) || control.closest?.(expectedFixedControlContainer)) {
        return [];
      }

      const rect = control.getBoundingClientRect();
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, 0),
        browser.innerWidth - 1,
      );
      const y = Math.min(
        Math.max(rect.top + rect.height / 2, 0),
        browser.innerHeight - 1,
      );
      const clip = control.closest?.(
        ".v19-submission-grouped-list, .v19-submission-list, .v19-event-list, .magic-export-list, .table-wrap",
      );

      if (clip) {
        const clipRect = clip.getBoundingClientRect();
        if (
          x < clipRect.left ||
          x > clipRect.right ||
          y < clipRect.top ||
          y > clipRect.bottom
        ) {
          return [];
        }
      }

      const top = browser.document.elementFromPoint(x, y);

      if (!top || top === control || control.contains(top)) {
        return [];
      }

      const cover = top.closest?.(fixedCoverSelector);

      if (!cover) {
        return [];
      }

      return [
        {
          control: label(control),
          cover: cover.getAttribute("class") ?? cover.tagName,
          top: label(top),
        },
      ];
    });
  });

  expect(blockers, `${context}: fixed layer over controls`).toEqual([]);
}

async function expectMobileTabbarCompact(page: Page) {
  const tabbar = page.locator(".ops-mobile-tabbar");
  await expect(tabbar).toBeHidden();
  await expect(page.locator(".mobile-create-dock")).toBeHidden();
}

function drawerCloseButton(page: Page) {
  return drawer(page)
    .locator(
      '[data-v19-interaction-id="drawer.close"]:visible, button[aria-label="Закрыть проверку"]:visible, button[aria-label="Вернуться к очереди"]:visible',
    )
    .first();
}

test.describe("V-19 mobile click real logic", () => {
  test("390px agent cards, filters, drawer, and bottom actions stay clickable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile hit-test runs once");
    const browserProblems = collectBrowserProblems(page);

    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, { heading: "Мои действия" });
    await expectNoHorizontalOverflow(page, "390 agent actions");
    await expectMobileTabbarCompact(page);
    await expectNoFixedLayerOverControls(page, "390 agent actions");

    const lastEventAction = page
      .getByRole("button", { name: /^Выбрать действие:/ })
      .last();
    await expectCenterHitTarget(lastEventAction, "390 actions last row action");
    await lastEventAction.click();
    const mobileActionDetail = page.getByTestId("agent-action-mobile-detail");
    await expect(mobileActionDetail).toBeVisible();
    const primaryAction = mobileActionDetail.locator(
      '[data-v19-interaction-id="actions.open-primary"]',
    );
    await expectCenterHitTarget(primaryAction, "390 actions inline primary action");
    await expect(primaryAction).toBeEnabled();
    await primaryAction.click();
    const questionnaireWorkspace = page.locator(".v19-questionnaire-screen-shell");
    const submissionsWorkspace = page.getByRole("heading", {
      level: 1,
      name: "Мои подачи",
    });
    await expect
      .poll(async () => {
        if (await drawer(page).isVisible().catch(() => false)) return "drawer";
        if (await questionnaireWorkspace.isVisible().catch(() => false)) {
          return "questionnaire";
        }
        if (await submissionsWorkspace.isVisible().catch(() => false)) {
          return "submissions";
        }
        return "none";
      })
      .toMatch(/drawer|questionnaire|submissions/);

    if (await drawer(page).isVisible().catch(() => false)) {
      await expectCenterHitTarget(
        drawerCloseButton(page),
        "390 drawer close from action row",
      );
      await drawerCloseButton(page).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } else if (await questionnaireWorkspace.isVisible().catch(() => false)) {
      const backToActions = page.getByRole("button", { name: "Назад" });
      await expectCenterHitTarget(backToActions, "390 questionnaire back to actions");
      await backToActions.click();
      await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
    }

    await clickOperationalNav(page, /Мои подачи/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "390 agent submissions");
    await expectNoFixedLayerOverControls(page, "390 agent submissions");

    await page.getByRole("button", { name: /^Фильтр подач:/ }).click();
    const statusDialog = page.getByRole("listbox", { name: "Фильтр подач" });
    const readyOption = statusDialog.getByRole("option", { name: "К выгрузке" });

    await expect(statusDialog).toBeVisible();
    await expectCenterHitTarget(readyOption, "390 submission filter option");
    await page.keyboard.press("Escape");
    await expect(statusDialog).toHaveCount(0);

    await clickOperationalNav(page, /Настройки/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Настройки" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "390 agent settings");
    await expectNoFixedLayerOverControls(page, "390 agent settings");

    await clickOperationalNav(page, /Мои подачи/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();

    const visibleSubmissionCard = page.locator(".v19-agent-shared-card").first();
    await expectCenterHitTarget(visibleSubmissionCard, "390 visible submission card");
    await visibleSubmissionCard.click();
    await expect(drawer(page)).toBeVisible();
    await expect(page.locator(".ops-mobile-tabbar")).toBeHidden();
    await expect(page.locator(".mobile-create-dock")).toBeHidden();
    await expectCenterHitTarget(
      drawerCloseButton(page),
      "390 submission drawer close",
    );
    await expectNoHorizontalOverflow(page, "390 submission drawer");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("390px admin review, mobile menu, and export cards are usable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile hit-test runs once");
    const browserProblems = collectBrowserProblems(page);

    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, {
      workspaceEmail: "admin@visaflow.local",
    });
    await expectNoHorizontalOverflow(page, "390 admin review");
    await expectNoFixedLayerOverControls(page, "390 admin review");

    const firstReviewAction = page
      .locator(".v19-review-queue-list [data-submission-card]")
      .first();
    await expectCenterHitTarget(firstReviewAction, "390 admin review card action");
    await firstReviewAction.click();
    await expect(drawer(page)).toBeVisible();
    await expectCenterHitTarget(drawerCloseButton(page), "390 admin drawer close");
    await drawerCloseButton(page).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await openMobileMenu(page);
    await expect(page.locator(".ops-mobile-menu-backdrop")).toBeVisible();
    await page.setViewportSize({ height: 1024, width: 768 });
    await expect(page.locator(".ops-mobile-menu-backdrop")).toBeVisible();
    await page.setViewportSize({ height: 800, width: 1024 });
    await expect(page.locator(".ops-mobile-menu-backdrop")).toBeVisible();
    await page.setViewportSize({ height: 800, width: 1025 });
    await expect(page.locator(".ops-mobile-menu-backdrop")).toBeHidden();
    await expectNoHorizontalOverflow(page, "1025 admin after mobile menu resize");
    await page.setViewportSize({ height: 844, width: 390 });
    await page.keyboard.press("Escape");
    await expect(page.locator(".ops-mobile-menu-backdrop")).toHaveCount(0);

    await openMobileMenu(page);
    await expectCenterHitTarget(
      page.getByRole("button", { name: /^Выгрузка$/ }),
      "390 admin mobile menu export nav",
    );
    await clickOperationalNav(page, /^Выгрузка$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^(Выгрузка|Центр выгрузки)$/,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "390 export");
    await expectNoFixedLayerOverControls(page, "390 export");

    const exportScreen = page.locator(".v19-admin-export-screen-v2");
    await expect(
      exportScreen.getByText("Пакеты к выгрузке", { exact: true }),
    ).toBeVisible();
    const olgaPackage = exportScreen
      .locator(".v19-admin-export-row-v2")
      .filter({ hasText: "Ольга Фролова" });
    const choosePackage = olgaPackage.getByRole("checkbox", {
      name: "Выбрать Ольга Фролова",
    });

    await expectCenterHitTarget(choosePackage, "390 export choose package");
    await choosePackage.click();
    await expect(choosePackage).toBeChecked();

    const summaryButton = page.getByRole("button", { name: /^Контроль пакета/ });
    await expectCenterHitTarget(summaryButton, "390 export control sheet");
    await summaryButton.click();
    const controlPanel = page.getByRole("complementary", {
      name: "Контроль пакета",
    });
    await expect(controlPanel).toBeVisible();
    const continueExport = controlPanel.getByRole("button", {
      name: "Сформировать Excel",
    });
    await expectCenterHitTarget(
      continueExport,
      "390 Excel export generate CTA",
    );
    await expectCenterHitTarget(
      controlPanel.getByRole("button", {
        name: "Сформировать ZIP с Excel",
      }),
      "390 ZIP export CTA",
    );
    await controlPanel
      .getByRole("button", { name: "Закрыть контроль пакета" })
      .click();
    await expect(controlPanel).toBeHidden();

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("locked breakpoints have no horizontal overflow or fixed-layer click covers", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "viewport matrix runs once");
    const browserProblems = collectBrowserProblems(page);

    for (const viewport of breakpointMatrix) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });

      await openFreshWorkspace(page, { heading: "Мои действия" });
      await expectNoHorizontalOverflow(page, `${viewport.label} agent actions`);
      await clickOperationalNav(page, /Настройки/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Настройки" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} agent settings`);
      await expectNoFixedLayerOverControls(page, `${viewport.label} agent settings`);
      await clickOperationalNav(page, /Мои подачи/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Мои подачи" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} agent submissions`);
      await expectNoFixedLayerOverControls(page, `${viewport.label} agent submissions`);

      await openFreshWorkspace(page, {
        heading: /^(Очередь на проверку|Проверка)$/,
        workspaceEmail: "admin@visaflow.local",
      });
      await expectNoHorizontalOverflow(page, `${viewport.label} admin review`);
      await expectNoFixedLayerOverControls(page, `${viewport.label} admin review`);
      await clickOperationalNav(page, /Настройки/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Настройки" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} admin settings`);
      await expectNoFixedLayerOverControls(page, `${viewport.label} admin settings`);
      await clickOperationalNav(page, /^Выгрузка$/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /^(Выгрузка|Центр выгрузки)$/,
        }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} export`);
      await expectNoFixedLayerOverControls(page, `${viewport.label} export`);
    }

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
