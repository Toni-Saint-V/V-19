import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  buildProductionCohortPlan,
  loadCohortResumeState,
  loadProductionCohortAccounts,
  requiredProductionRunMarker,
  signInCohortAccount,
  type ProductionCohortAccount,
} from "./production-cohort-helpers";
import { StrictProductionExportNetworkGate } from "./production-export-a1-f6-helpers";
import { clickWorkspaceButton, drawer, isVisible } from "./ui-helpers";

type ReadOnlySession = Awaited<ReturnType<typeof signInCohortAccount>> & {
  accountKey: string;
  context: BrowserContext;
  gate: StrictProductionExportNetworkGate;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseUrl(testInfo: TestInfo) {
  const value = testInfo.project.use.baseURL;
  invariant(
    typeof value === "string" && value.length > 0,
    "Production export final-state baseURL is required.",
  );
  return value;
}

async function openReadOnlySession(
  browser: Browser,
  testInfo: TestInfo,
  account: ProductionCohortAccount,
): Promise<ReadOnlySession> {
  const context = await browser.newContext({
    baseURL: baseUrl(testInfo),
    serviceWorkers: "block",
    viewport: testInfo.project.use.viewport,
  });
  const gate = new StrictProductionExportNetworkGate();
  await gate.attach(context);
  try {
    const session = await signInCohortAccount(context, account);
    gate.attachPage(session.page);
    gate.assertLoginCompleted();
    return { ...session, accountKey: account.key, context, gate };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function closeReadOnlySession(session: ReadOnlySession) {
  try {
    session.gate.assertReadOnly();
    session.ledger.assertNoOriginViolations();
    expect(session.browserProblems().count, `${session.accountKey} browser errors`).toBe(
      0,
    );
  } finally {
    await session.context.close();
  }
}

async function waitForWorkspaceData(page: Page) {
  await expect(page.locator('[aria-label="Загрузка подач"]')).toHaveCount(0, {
    timeout: 120_000,
  });
  const error = page
    .getByRole("alert")
    .filter({ hasText: /Не удалось загрузить подачи|Production data unavailable/i })
    .first();
  invariant(!(await isVisible(error)), "Production workspace data failed to load.");
}

async function setSearch(page: Page, submissionId: string) {
  const search = page
    .getByRole("searchbox")
    .or(page.getByRole("textbox"))
    .first();
  if (!(await isVisible(search))) return;
  await search.fill(submissionId);
  await page.waitForTimeout(300);
}

function exportRow(page: Page, submissionId: string) {
  return page
    .locator(".v19-admin-export-row-v2, .v19-admin-export-row")
    .filter({ hasText: submissionId })
    .first();
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.locator("html").evaluate((element) => {
    const root = element as unknown as { clientWidth: number; scrollWidth: number };
    return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe("production A1-F6 exported final state", () => {
  test("converges admin and owner to the durable exported record without writes", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(360_000);
    const runMarker = requiredProductionRunMarker();
    const cohortCase = buildProductionCohortPlan(runMarker).find(
      (candidate) => candidate.caseKey === "A1-F6",
    );
    invariant(cohortCase, "A1-F6 is absent from the production cohort plan.");
    const cohortState = await loadCohortResumeState(runMarker);
    const checkpoint = cohortState.cases["A1-F6"];
    invariant(
      checkpoint?.submissionId && checkpoint.caseMarker === cohortCase.caseMarker,
      "A1-F6 production checkpoint is incomplete or mismatched.",
    );
    const accounts = loadProductionCohortAccounts();
    const owner = accounts.agents.find(
      (account) => account.key === cohortCase.ownerKey,
    );
    invariant(owner, "A1-F6 owner account is unavailable.");

    const admin = await openReadOnlySession(browser, testInfo, accounts.admin);
    try {
      await clickWorkspaceButton(admin.page, /Выгрузка/);
      await expect(
        admin.page.getByRole("heading", { level: 1, name: "Выгрузка" }),
      ).toBeVisible();
      await waitForWorkspaceData(admin.page);
      await setSearch(admin.page, checkpoint.submissionId);
      await expect(exportRow(admin.page, checkpoint.submissionId)).toHaveCount(0);
      await assertNoHorizontalOverflow(admin.page);
    } finally {
      await closeReadOnlySession(admin);
    }

    const ownerSession = await openReadOnlySession(browser, testInfo, owner);
    try {
      await clickWorkspaceButton(ownerSession.page, /Мои подачи/);
      await expect(
        ownerSession.page.getByRole("heading", { level: 1, name: "Мои подачи" }),
      ).toBeVisible();
      await waitForWorkspaceData(ownerSession.page);
      await setSearch(ownerSession.page, checkpoint.submissionId);
      const card = ownerSession.page
        .locator(`[data-submission-id="${checkpoint.submissionId}"]`)
        .first();
      await expect(card).toBeVisible({ timeout: 45_000 });
      await card.click();
      const root = drawer(ownerSession.page);
      await expect(root).toBeVisible();
      await expect(root).toContainText(cohortCase.city);
      await expect(root.locator(".v20-status-pill")).toHaveText(/выгружено/i);
      await assertNoHorizontalOverflow(ownerSession.page);
    } finally {
      await closeReadOnlySession(ownerSession);
    }
  });
});
