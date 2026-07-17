import { expect, test, type Locator, type Page } from "@playwright/test";
import { testArtifactPath } from "../support/artifacts";

import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const evidenceDirectory = testArtifactPath("admin-document-review-p0-2026-07-15");
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
  test("mobile review opens Files first and blocks confirmation without the protected original", async (
    { page },
    testInfo,
  ) => {
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

    const reviewDrawer = page.locator('[role="dialog"][data-admin-review-drawer-surface="workspace"]');
    await expect(reviewDrawer).toBeVisible();

    const filesTab = reviewDrawer.locator("#admin-review-tab-media");
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => isFullyWithinViewport(filesTab)).toBe(true);

    const verifyPassport = reviewDrawer.getByTestId("admin-review-verify-passport").first();
    await expect(verifyPassport).toBeVisible();
    const fileActions = reviewDrawer.locator(".admin-review-file-actions button");
    expect(await fileActions.count()).toBeGreaterThan(0);
    for (const action of await fileActions.all()) {
      await expect.poll(() => isFullyWithinViewport(action)).toBe(true);
    }
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/mobile-390-files-entry.png`,
    });

    await verifyPassport.click();
    const passportWorkspace = page.locator(".v19-admin-passport-workspace");
    await expect(passportWorkspace).toBeVisible();
    await expect(
      passportWorkspace.getByRole("heading", { name: "Сверка паспорта", exact: true }),
    ).toBeVisible();
    await expect(
      passportWorkspace.getByText("Предпросмотр оригинала недоступен"),
    ).toBeVisible();
    await expect(
      passportWorkspace.getByRole("img", { name: "Оригинал паспорта" }),
    ).toHaveCount(0);
    const confirmationButtons = passportWorkspace.getByRole("button", {
      name: /^Подтвердить:/,
    });
    expect(await confirmationButtons.count()).toBeGreaterThan(0);
    for (const button of await confirmationButtons.all()) {
      await expect(button).toBeDisabled();
    }
    await expect(
      passportWorkspace.getByRole("button", { name: "Завершить сверку паспорта" }),
    ).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/mobile-390-passport-fail-closed.png`,
    });

    expect(browserProblems).toEqual([]);
  });
});
