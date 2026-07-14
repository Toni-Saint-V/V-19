import { createHash } from "node:crypto";
import { expect, test, type Browser, type TestInfo } from "@playwright/test";

import {
  PRODUCTION_PROJECT_REF,
  assertPermittedQaAssets,
  assertProductionCohortWriteUnlock,
  buildProductionCohortPlan,
  createOrResumeCohortCase,
  loadCohortResumeState,
  loadProductionCohortAccounts,
  requiredProductionRunMarker,
  signInCohortAccount,
  verifyAdminDoesNotSeeReviewCase,
  verifyAdminSeesSubmittedCase,
  writeCohortEvidence,
  type BrowserProblemEvidence,
  type CohortCaseCompletion,
  type CohortMutationSummary,
} from "./production-cohort-helpers";

type CaseEvidence = {
  applicantCount: number;
  caseKey: string;
  city: string;
  stage: "exported" | "submitted";
  type: "family" | "single";
};

type AccountEvidence = {
  accountKey: string;
  applicantCount: number;
  browserProblems: BrowserProblemEvidence;
  cases: CaseEvidence[];
  city: string;
  mutationSummary: CohortMutationSummary[];
  submissionCount: number;
};

type CohortEvidence = {
  accounts: AccountEvidence[];
  admin: {
    browserProblems: BrowserProblemEvidence;
    verifiedExportedOutsideReview: number;
    verifiedSubmittedCards: number;
  };
  constraints: {
    credentialsPersistedInEvidence: false;
    directSupabaseWritesFromHarness: false;
    mockDemoFixtureDataLayerUsed: false;
    passportJpegUsed: false;
    qaAssetAllowlistOnly: true;
    sequentialWorkers: 1;
  };
  errorDigest?: string;
  finishedAt?: string;
  plannedApplicants: 27;
  plannedSubmissions: 12;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  result: "FAILED" | "PASS" | "RUNNING";
  runMarker: string;
  schemaVersion: 1;
  startedAt: string;
};

const viewports = [
  { height: 900, width: 1440 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
] as const;

function digestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return createHash("sha256").update(message).digest("hex").slice(0, 16);
}

function baseUrl(testInfo: TestInfo) {
  const candidate = testInfo.project.use.baseURL;
  if (typeof candidate !== "string" || !candidate) {
    throw new Error("The production cohort Playwright project requires a baseURL.");
  }
  return candidate;
}

async function isolatedContext(
  browser: Browser,
  testInfo: TestInfo,
  viewport: { height: number; width: number },
) {
  return browser.newContext({
    baseURL: baseUrl(testInfo),
    serviceWorkers: "block",
    viewport,
  });
}

test.describe("production Supabase cohort: three agents, nine applicants each", () => {
  test("creates, fills, uploads and submits the resumable 3x9 cohort through the UI", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(10_800_000);
    assertProductionCohortWriteUnlock();
    const runMarker = requiredProductionRunMarker();
    const accounts = loadProductionCohortAccounts();
    const plan = buildProductionCohortPlan(runMarker);
    const resumeState = await loadCohortResumeState(runMarker);
    await assertPermittedQaAssets();

    const evidence: CohortEvidence = {
      accounts: [],
      admin: {
        browserProblems: { count: 0, digests: [] },
        verifiedExportedOutsideReview: 0,
        verifiedSubmittedCards: 0,
      },
      constraints: {
        credentialsPersistedInEvidence: false,
        directSupabaseWritesFromHarness: false,
        mockDemoFixtureDataLayerUsed: false,
        passportJpegUsed: false,
        qaAssetAllowlistOnly: true,
        sequentialWorkers: 1,
      },
      plannedApplicants: 27,
      plannedSubmissions: 12,
      projectRef: PRODUCTION_PROJECT_REF,
      result: "RUNNING",
      runMarker,
      schemaVersion: 1,
      startedAt: new Date().toISOString(),
    };
    let failure: unknown;
    const caseCompletions = new Map<string, CohortCaseCompletion>();

    try {
      for (const [accountIndex, account] of accounts.agents.entries()) {
        const context = await isolatedContext(
          browser,
          testInfo,
          viewports[accountIndex]!,
        );
        try {
          const session = await signInCohortAccount(context, account);
          const accountCases = plan.filter(
            (cohortCase) => cohortCase.ownerKey === account.key,
          );
          const caseEvidence: CaseEvidence[] = [];

          for (const cohortCase of accountCases) {
            const completion = await createOrResumeCohortCase({
              account,
              cohortCase,
              ledger: session.ledger,
              page: session.page,
              resumeState,
            });
            caseCompletions.set(cohortCase.caseKey, completion);
            caseEvidence.push({
              applicantCount: cohortCase.applicantCount,
              caseKey: cohortCase.caseKey,
              city: cohortCase.city,
              stage: completion.lifecycle,
              type: cohortCase.type,
            });
          }

          const browserProblems = session.browserProblems();
          session.ledger.assertNoOriginViolations();
          expect(browserProblems.count, `${account.key} emitted browser errors`).toBe(
            0,
          );
          expect(caseEvidence).toHaveLength(4);
          expect(
            caseEvidence.reduce(
              (total, cohortCase) => total + cohortCase.applicantCount,
              0,
            ),
          ).toBe(9);
          evidence.accounts.push({
            accountKey: account.key,
            applicantCount: 9,
            browserProblems,
            cases: caseEvidence,
            city: accountCases[0]!.city,
            mutationSummary: session.ledger.summary(),
            submissionCount: 4,
          });
        } finally {
          await context.close();
        }
      }

      const adminContext = await isolatedContext(browser, testInfo, {
        height: 800,
        width: 1280,
      });
      try {
        const admin = await signInCohortAccount(adminContext, accounts.admin);
        for (const cohortCase of plan) {
          const completion = caseCompletions.get(cohortCase.caseKey);
          if (!completion) {
            throw new Error(`Cohort completion is absent (${cohortCase.caseKey}).`);
          }
          const checkpoint = resumeState.cases[cohortCase.caseKey];
          if (
            !checkpoint ||
            checkpoint.stage !== "submitted" ||
            !checkpoint.submissionId
          ) {
            throw new Error(`Submitted checkpoint is absent (${cohortCase.caseKey}).`);
          }
          if (completion.lifecycle === "exported") {
            await verifyAdminDoesNotSeeReviewCase(
              admin.page,
              completion.submissionId,
            );
            evidence.admin.verifiedExportedOutsideReview += 1;
            continue;
          }
          await verifyAdminSeesSubmittedCase(
            admin.page,
            cohortCase,
            completion.submissionId,
          );
          evidence.admin.verifiedSubmittedCards += 1;
        }
        evidence.admin.browserProblems = admin.browserProblems();
        admin.ledger.assertNoOriginViolations();
        expect(
          evidence.admin.browserProblems.count,
          "Admin emitted browser errors",
        ).toBe(0);
        expect(evidence.admin.verifiedSubmittedCards).toBe(
          [...caseCompletions.values()].filter(
            (completion) => completion.lifecycle === "submitted",
          ).length,
        );
        expect(evidence.admin.verifiedExportedOutsideReview).toBe(
          [...caseCompletions.values()].filter(
            (completion) => completion.lifecycle === "exported",
          ).length,
        );
      } finally {
        await adminContext.close();
      }

      expect(evidence.accounts).toHaveLength(3);
      expect(
        evidence.accounts.reduce((total, account) => total + account.applicantCount, 0),
      ).toBe(27);
      expect(
        evidence.accounts.reduce(
          (total, account) => total + account.submissionCount,
          0,
        ),
      ).toBe(12);
      evidence.result = "PASS";
    } catch (error) {
      failure = error;
      evidence.errorDigest = digestError(error);
      evidence.result = "FAILED";
    } finally {
      evidence.finishedAt = new Date().toISOString();
      await writeCohortEvidence(runMarker, evidence);
    }

    if (failure) throw failure;
  });
});
