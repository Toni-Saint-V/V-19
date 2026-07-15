import { expect, test, type Page } from "@playwright/test";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

async function openQuestionnaire(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const ownedByCurrentLocalAgent = initialSubmissions.map((submission) => ({
    ...submission,
    agentId: "local-agent-tony",
  }));
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
  await expect(page.getByRole("heading", { level: 1, name: "Мои действия" })).toBeVisible();

  const continueAction = page.getByRole("button", { exact: true, name: "Продолжить" });
  await expect(continueAction.first()).toBeVisible();
  await continueAction.first().click();

  await expect(
    page.getByRole("heading", { level: 1, name: /^Анкета:/ }),
  ).toBeVisible();
  await expect(page.locator(".vf-figma-questionnaire-screen")).toBeVisible();
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

test.describe("V-19 questionnaire live sanity", () => {
  test("desktop keeps the questionnaire actionable and autosaves a safe draft change", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openQuestionnaire(page);

    await expect(page.locator(".v19-questionnaire-screen-header")).toBeVisible();
    await expect(page.locator(".v19-questionnaire-applicant-bar")).toBeVisible();
    await expect(page.locator(".v19-questionnaire-section-nav")).toBeVisible();
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Следующее поле" })).toBeVisible();

    const editableField = page.locator(".v19-questionnaire-work-panel textarea").first();
    await expect(editableField).toBeVisible();
    await editableField.fill("QA local draft");
    await expect(page.locator("[role='status']:visible").filter({ hasText: "Сохранено" })).toBeVisible({
      timeout: 5_000,
    });

    await expectNoDocumentOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-desktop.png"),
    });
    expect(browserProblems).toEqual([]);
  });

  test("mobile keeps the header compact and exposes the next blocker", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await openQuestionnaire(page);

    const header = page.locator(".v19-questionnaire-screen-header");
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(844 * 0.15);

    await expect(page.locator(".v19-questionnaire-mobile-status")).toBeVisible();
    const blocker = page.getByRole("button", { name: /^Перейти к блокеру:/ });
    await expect(blocker).toBeVisible();
    await blocker.click();
    await expect(page.locator(".v19-questionnaire-work-panel")).toBeVisible();
    await expect(
      page
        .locator(".vf-figma-questionnaire-screen")
        .getByText("Санкт-Петербург", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".v19-questionnaire-complete-button")).toBeVisible();

    await expectNoDocumentOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("questionnaire-mobile.png"),
    });
    expect(browserProblems).toEqual([]);
  });
});
