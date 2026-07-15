import { expect, test, type Page } from "@playwright/test";

import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const evidenceDirectory = "docs/qa/agent-action-p0-2026-07-15";
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

async function openExactReturnedFileAction(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const action = page
    .locator(
      `[data-testid="agent-action-row"][data-agent-action-id^="replace-${returnedSubmissionId}-"]`,
    )
    .first();
  await expect(action).toBeVisible();
  const actionId = await action.getAttribute("data-agent-action-id");
  expect(actionId).toBeTruthy();
  const targetFileId = actionId!.replace(`replace-${returnedSubmissionId}-`, "");
  const cta = action.getByTestId("agent-action-cta");
  await expect(cta).toHaveText("Исправить");
  await cta.click();

  const questionnaire = page
    .locator(`.vf-figma-questionnaire-screen[data-submission-id="${returnedSubmissionId}"]`)
    .first();
  await expect(questionnaire).toBeVisible();
  await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0);
  await expect(questionnaire.getByRole("region", { name: "Файлы заявителя" })).toBeVisible();
  const targetSlot = questionnaire.locator(
    `[data-file-id="${targetFileId}"][data-file-focused="true"]`,
  );
  await expect(targetSlot).toBeVisible();
  await expect(targetSlot).toBeFocused();
  await expect(targetSlot).toContainText("Нужна замена");
  await expect(targetSlot).toContainText("Лицо обрезано. Загрузите селфи 1.");

  return questionnaire;
}

async function showBlockedCorrectionGuidance(page: Page, questionnaire: ReturnType<Page["locator"]>) {
  const completeButton = questionnaire.getByRole("button", {
    name: "Отправить исправления",
  });
  await expect(completeButton).toBeEnabled();
  await completeButton.click();

  await expect(questionnaire.getByTestId("questionnaire-next-blocker")).toContainText(
    "Сначала:",
  );
  await expect(
    questionnaire.locator("input:focus, textarea:focus, button:focus"),
  ).toHaveCount(1);
}

test.describe("V-19 P0 agent action routing", () => {
  test("desktop CTA opens the exact file correction without a generic drawer", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    const questionnaire = await openExactReturnedFileAction(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/desktop-returned-file-action.png`,
    });
    await showBlockedCorrectionGuidance(page, questionnaire);
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
    const questionnaire = await openExactReturnedFileAction(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/mobile-returned-file-action.png`,
    });
    await showBlockedCorrectionGuidance(page, questionnaire);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: `${evidenceDirectory}/mobile-returned-next-blocker.png`,
    });
    expect(browserProblems).toEqual([]);
  });
});
