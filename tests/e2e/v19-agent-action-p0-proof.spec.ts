import type { Page } from "@playwright/test";
import { testArtifactPath } from "../support/artifacts";

import { expect, test } from "./v19-localhost-test";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const evidenceDirectory = testArtifactPath("agent-action-p0-2026-07-15");
const returnedSubmissionId = "ПД-1048";
const returnedSubmissionPublicId = "VF-1048";

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

async function openReturnedSubmission(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const action = page
    .locator(
      [
        `[data-testid="agent-action-queue-item"][data-agent-action-id^="replace-${returnedSubmissionId}-"]:visible`,
        `.v19-actions-timeline-event[data-submission-id="${returnedSubmissionId}"] .v19-actions-timeline-hit:visible`,
      ].join(", "),
    )
    .first();
  await expect(action).toBeVisible();
  await expect(action).toHaveAccessibleName(
    /Выбрать действие: .*Мария Иванова.*Заменить селфи 1/,
  );
  await action.click();
  const detail = page
    .locator(
      '[data-testid="agent-action-inline-detail"]:visible, [data-testid="agent-action-mobile-detail"]:visible',
    )
    .first();
  await expect(detail).toBeVisible();
  await detail.locator('[data-v19-interaction-id="actions.open-primary"]').click();

  const submissionDrawer = page.getByRole("dialog", { name: "Семья Ивановых" });
  await expect(submissionDrawer).toBeVisible();
  await expect(submissionDrawer).toContainText(returnedSubmissionPublicId);
  await expect(submissionDrawer.getByTestId("drawer-next-step")).toHaveText(
    "Загрузить: Мария Иванова • Селфи 1",
  );
  await expect(
    submissionDrawer.locator("#workspace-media-з-1048-1-selfie"),
  ).toBeFocused();
  await expect(
    page.locator(
      `.vf-figma-questionnaire-screen[data-submission-id="${returnedSubmissionId}"]`,
    ),
  ).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await submissionDrawer.boundingBox())?.y ?? 999))
    .toBeLessThanOrEqual(48);
  await expect
    .poll(async () => {
      const box = await submissionDrawer.boundingBox();
      const viewport = page.viewportSize();
      return box && viewport ? Math.ceil(box.x + box.width - viewport.width) : 999;
    })
    .toBeLessThanOrEqual(0);
  await expect(submissionDrawer.getByTestId("drawer-primary-action")).toBeVisible();

  return submissionDrawer;
}

test.describe("V-19 P0 agent action routing", () => {
  test("desktop CTA opens the exact file correction without a generic drawer", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openReturnedSubmission(page);
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
    await openReturnedSubmission(page);
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
