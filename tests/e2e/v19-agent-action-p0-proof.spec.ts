import { expect, test, type Page } from "@playwright/test";
import { testArtifactPath } from "../support/artifacts";

import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const evidenceDirectory = testArtifactPath("agent-action-p0-2026-07-15");
const returnedSubmissionId = "ПД-1048";

async function assertNoHorizontalOverflow(page: Page) {
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

async function openReturnedFileCollection(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const action = page
    .locator(
      `[data-testid="agent-action-row"][data-agent-action-id^="replace-${returnedSubmissionId}-"]`,
    )
    .first();
  await expect(action).toBeVisible();
  const cta = action.getByTestId("agent-action-cta");
  await expect(cta).toHaveText("Исправить");
  await cta.click();

  const documents = page
    .getByRole("heading", { name: "Сбор документов", exact: true })
    .first();
  await expect(documents).toBeVisible();
  await expect(page.getByTestId("document-collection-matrix")).toBeVisible();
  await expect(
    page.locator(`[data-document-submission-id="${returnedSubmissionId}"]:visible`).first(),
  ).toBeVisible();
  await expect(
    page.locator(`.vf-figma-questionnaire-screen[data-submission-id="${returnedSubmissionId}"]`),
  ).toHaveCount(0);
  await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0);

  return documents;
}

test.describe("V-19 P0 agent action routing", () => {
  test("desktop CTA opens the exact file correction without a generic drawer", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openReturnedFileCollection(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/desktop-returned-file-action.png`,
    });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/desktop-returned-next-blocker.png`,
    });
    expect(browserProblems).toEqual([]);
  });

  test("mobile CTA opens the exact file correction without a generic drawer", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await openReturnedFileCollection(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/mobile-returned-file-action.png`,
    });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/mobile-returned-next-blocker.png`,
    });
    expect(browserProblems).toEqual([]);
  });
});
