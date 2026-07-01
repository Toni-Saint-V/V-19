import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clickFirstVisible,
  collectBrowserProblems,
  drawer,
  expectNoHorizontalOverflow,
  isVisible,
  openFreshWorkspace,
  openMobileMenu,
  submissionCardById,
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
  const button = page.getByRole("button", { name });

  if (!(await isVisible(button.first()))) {
    await openMobileMenu(page);
  }

  await clickFirstVisible(button);
}

async function expectCenterHitTarget(target: Locator, context: string) {
  await target.scrollIntoViewIfNeeded();
  await expect(target, context).toBeVisible();

  const hit = await target.evaluate((element) => {
    const browser = globalThis as unknown as BrowserGlobal;
    const targetElement = element as unknown as BrowserElement;
    const rect = targetElement.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), browser.innerWidth - 1);
    const y = Math.min(
      Math.max(rect.top + rect.height / 2, 0),
      browser.innerHeight - 1,
    );
    const top = browser.document.elementFromPoint(x, y);
    const cover = top?.closest?.(
      ".ops-mobile-tabbar, .mobile-create-dock, .v19-context-panel, .v19-context-backdrop, .ops-mobile-menu-backdrop",
    );

    return {
      coverClass: cover?.getAttribute("class") ?? null,
      ok: top === targetElement || targetElement.contains(top),
      targetText:
        targetElement.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
      topClass: top?.getAttribute("class") ?? null,
      topText: top?.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
    };
  });

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
  await expect(tabbar).toBeVisible();

  const metrics = await tabbar.evaluate((element) => {
    const browser = globalThis as unknown as BrowserGlobal;
    const targetElement = element as unknown as BrowserElement;
    const rect = targetElement.getBoundingClientRect();
    return {
      buttons: targetElement.querySelectorAll("button").length,
      columns: browser.getComputedStyle(targetElement).gridTemplateColumns.split(" ")
        .length,
      height: Math.round(rect.height),
    };
  });

  expect(metrics.columns, JSON.stringify(metrics)).toBe(metrics.buttons);
  expect(metrics.buttons, JSON.stringify(metrics)).toBeGreaterThanOrEqual(3);
  expect(metrics.height, JSON.stringify(metrics)).toBeLessThanOrEqual(82);
}

async function expectDisabledExportActionsExplainWhy(page: Page) {
  const buttonNames = ["Сформировать Excel", "Скачать Excel", "Отметить выгружено"];
  let disabledActionCount = 0;

  for (const buttonName of buttonNames) {
    const button = page.getByRole("button", { name: buttonName });
    await expect(button).toBeVisible();

    if (await button.isDisabled()) {
      disabledActionCount += 1;
      await expect(button).toHaveAttribute("aria-describedby", "export-action-hint");
    }
  }

  expect(disabledActionCount).toBeGreaterThan(0);
  await expect(page.locator("#export-action-hint")).toBeVisible();
}

function drawerCloseButton(page: Page) {
  return drawer(page)
    .getByRole("button", { name: /Закрыть (подачу|проверку)/ })
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
    await expectNoHorizontalOverflow(page, "390 agent inbox");
    await expectMobileTabbarCompact(page);
    await expectNoFixedLayerOverControls(page, "390 agent inbox");

    const lastEventAction = page
      .getByRole("button", { name: /^Открыть подачу:/ })
      .last();
    await expectCenterHitTarget(lastEventAction, "390 inbox last event action");
    await lastEventAction.click();
    await expect(drawer(page)).toBeVisible();
    await expectCenterHitTarget(
      drawerCloseButton(page),
      "390 drawer close from inbox event",
    );
    await drawerCloseButton(page).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await clickOperationalNav(page, /Мои подачи/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "390 agent submissions");
    await expectNoFixedLayerOverControls(page, "390 agent submissions");

    await page.getByRole("button", { name: "Фильтры подач" }).click();
    const statusDialog = page.getByRole("dialog", { name: "Статус подач" });
    const readyOption = statusDialog
      .locator(".v19-mobile-filter-options")
      .getByRole("button", { name: "Готово" });

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

    await submissionCardById(page, "ПД-1048").click();
    await expect(page.getByRole("dialog", { name: "Подача ПД-1048" })).toBeVisible();
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
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });
    await expectNoHorizontalOverflow(page, "390 admin review");
    await expectNoFixedLayerOverControls(page, "390 admin review");

    const firstReviewRow = page
      .getByRole("button", { name: /^Открыть подачу:/ })
      .first();
    await expectCenterHitTarget(firstReviewRow, "390 admin review row");
    await firstReviewRow.click();
    await expect(drawer(page)).toBeVisible();
    await expectCenterHitTarget(drawerCloseButton(page), "390 admin drawer close");
    await drawerCloseButton(page).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await openMobileMenu(page);
    await expect(page.locator(".ops-mobile-menu-backdrop")).toBeVisible();
    await page.setViewportSize({ height: 1024, width: 768 });
    await expect(page.locator(".ops-mobile-menu-backdrop")).toBeHidden();
    await expectNoHorizontalOverflow(page, "768 admin after mobile menu resize");
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
      page.getByRole("heading", { level: 1, name: "Выгрузка" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "390 export");
    await expectNoFixedLayerOverControls(page, "390 export");
    await expectDisabledExportActionsExplainWhy(page);

    const bulkSelect = page.getByRole("checkbox", {
      name: "Выбрать все совместимые",
    });
    await expectCenterHitTarget(bulkSelect, "390 export bulk select all");

    const firstExportRow = page.locator(".export-contract-row").first();
    await expect(firstExportRow).toBeVisible();
    await bulkSelect.check();
    await expect(firstExportRow.getByRole("checkbox").first()).toBeChecked();
    await expectCenterHitTarget(
      firstExportRow.getByRole("checkbox").first(),
      "390 export row checkbox",
    );
    await expectCenterHitTarget(
      firstExportRow.getByRole("button", { name: "Смотреть пакет" }).first(),
      "390 export row open action",
    );

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
      await expectNoHorizontalOverflow(page, `${viewport.label} agent inbox`);
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
        heading: "Проверка",
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
        page.getByRole("heading", { level: 1, name: "Выгрузка" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} export`);
      await expectNoFixedLayerOverControls(page, `${viewport.label} export`);
    }

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
