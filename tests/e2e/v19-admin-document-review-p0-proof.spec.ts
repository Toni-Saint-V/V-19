import { expect, test, type Locator, type Page } from "@playwright/test";

import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const submissionId = "ПД-1053";

async function expectNoHorizontalOverflow(page: Page) {
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

async function isFullyWithinViewport(locator: Locator) {
  return locator.evaluate((element) => {
    const browserGlobal = globalThis as unknown as {
      innerHeight: number;
      innerWidth: number;
    };
    const bounds = (
      element as {
        getBoundingClientRect(): {
          bottom: number;
          left: number;
          right: number;
          top: number;
        };
      }
    ).getBoundingClientRect();
    return (
      bounds.left >= 0 &&
      bounds.right <= browserGlobal.innerWidth &&
      bounds.top >= 0 &&
      bounds.bottom <= browserGlobal.innerHeight
    );
  });
}

test.describe("V-19 P0 admin document review", () => {
  test("mobile review opens Files and blocks the single section confirmation without protected originals", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "The explicit 390px proof runs once in Chromium.",
    );

    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });

    const submission = page
      .locator(`[data-submission-card][data-submission-id="${submissionId}"]`)
      .or(page.locator(`[data-submission-id="${submissionId}"]`))
      .first();
    await expect(submission).toBeVisible();
    await submission.click();

    const reviewDrawer = page.locator(
      '[role="dialog"][data-admin-review-drawer-surface="workspace"]',
    );
    await expect(reviewDrawer).toBeVisible();

    const filesTab = reviewDrawer.getByRole("tab", { name: "Файлы", exact: true });
    await filesTab.click();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => isFullyWithinViewport(filesTab)).toBe(true);

    const passportRow = reviewDrawer
      .locator(".v19-drawer-file-item")
      .filter({ hasText: "Скан паспорта" })
      .first();
    const verifyPassport = passportRow.getByRole("button", {
      name: "Проверить",
      exact: true,
    });
    await expect(verifyPassport).toBeVisible();
    const fileActions = reviewDrawer.locator(".v19-drawer-file-item button");
    expect(await fileActions.count()).toBeGreaterThan(0);
    for (const action of await fileActions.all()) {
      await action.scrollIntoViewIfNeeded();
      await expect.poll(() => isFullyWithinViewport(action)).toBe(true);
    }
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("mobile-390-files-entry.png"),
    });

    await verifyPassport.click();
    const passportWorkspace = page.locator(".v19-admin-passport-workspace");
    await expect(passportWorkspace).toBeVisible();
    const backToSubmission = passportWorkspace.getByRole("button", {
      name: "Вернуться к подаче",
    });
    await expect(backToSubmission).toBeFocused();
    await expect(
      passportWorkspace.getByRole("heading", { name: /Паспортная секция/ }),
    ).toBeVisible();
    await expect(
      passportWorkspace
        .locator('[data-review-media="passport_scan"]')
        .getByText(/Защищённый оригинал недоступен|Файл не загружен/),
    ).toBeVisible();
    await expect(
      passportWorkspace.getByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveCount(0);
    await expect(
      passportWorkspace.getByRole("button", {
        name: "Подтвердить паспортную секцию",
      }),
    ).toBeDisabled();
    await expect(
      passportWorkspace.getByRole("button", { name: /^Подтвердить:/ }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("mobile-390-passport-fail-closed.png"),
    });

    await page.keyboard.press("Escape");
    await expect(passportWorkspace).toBeHidden();
    await expect(reviewDrawer).toBeVisible();

    expect(browserProblems).toEqual([]);
  });

  test("desktop passport workspace shows exactly eight fields, three protected originals, and one section action", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });

    const submission = page
      .locator(`[data-submission-card][data-submission-id="${submissionId}"]`)
      .or(page.locator(`[data-submission-id="${submissionId}"]`))
      .first();
    await expect(submission).toBeVisible();
    await submission.click();

    const reviewDrawer = page.locator(
      '[role="dialog"][data-admin-review-drawer-surface="workspace"]',
    );
    await expect(reviewDrawer).toBeVisible();
    await reviewDrawer.getByRole("tab", { name: "Файлы", exact: true }).click();

    const passportRow = reviewDrawer
      .locator(".v19-drawer-file-item")
      .filter({ hasText: "Скан паспорта" })
      .first();
    await passportRow.getByRole("button", { name: "Проверить", exact: true }).click();

    const passportWorkspace = page.locator(".v19-admin-passport-workspace");
    await expect(passportWorkspace).toBeVisible();
    const backToSubmission = passportWorkspace.getByRole("button", {
      name: "Вернуться к подаче",
    });
    await expect(backToSubmission).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        passportWorkspace.evaluate((workspace) =>
          workspace.contains(workspace.ownerDocument.activeElement),
        ),
      )
      .toBe(true);
    await expect(passportWorkspace.locator("[data-passport-field-id]")).toHaveCount(8);
    await expect(passportWorkspace.locator("[data-review-media]")).toHaveCount(3);
    await expect(
      passportWorkspace.getByRole("button", {
        name: "Подтвердить паспортную секцию",
      }),
    ).toHaveCount(1);
    await passportWorkspace
      .getByRole("button", { name: "Добавить замечание: Номер паспорта" })
      .click();
    const remarkDialog = page.getByRole("dialog", { name: "Добавить замечание" });
    const remarkTextarea = remarkDialog.getByLabel("Текст для клиента");
    await expect(remarkDialog).toBeVisible();
    await expect(remarkTextarea).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const workspace = document.querySelector<HTMLElement>(
            ".v19-admin-passport-workspace",
          );
          const backdrop = document.querySelector<HTMLElement>(
            ".v19-remark-form-backdrop",
          );
          const dialog = document.querySelector<HTMLElement>(
            ".v19-remark-form-dialog",
          );
          if (!workspace || !backdrop || !dialog) return false;
          const workspaceZ = Number(getComputedStyle(workspace).zIndex);
          const backdropZ = Number(getComputedStyle(backdrop).zIndex);
          const dialogZ = Number(getComputedStyle(dialog).zIndex);
          return backdropZ > workspaceZ && dialogZ > backdropZ;
        }),
      )
      .toBe(true);
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        remarkDialog.evaluate((dialog) =>
          dialog.contains(dialog.ownerDocument.activeElement),
        ),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(remarkDialog).toBeHidden();
    await expect(passportWorkspace).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("desktop-1440-passport-fail-closed.png"),
    });

    expect(browserProblems).toEqual([]);
  });
});
