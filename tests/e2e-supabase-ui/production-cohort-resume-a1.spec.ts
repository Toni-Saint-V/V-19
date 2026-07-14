import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

import {
  PRODUCTION_PROJECT_REF,
  assertProductionCohortWriteUnlock,
  buildProductionCohortPlan,
  createOrResumeCohortCase,
  loadCohortResumeState,
  loadProductionCohortAccounts,
  requiredProductionRunMarker,
  signInCohortAccount,
} from "./production-cohort-helpers";

const targetCaseKey = "A1-F6";

function errorDigest(error: unknown) {
  return createHash("sha256")
    .update(error instanceof Error ? error.message : String(error))
    .digest("hex")
    .slice(0, 16);
}

async function writeEvidence(runMarker: string, value: unknown) {
  const path = resolve(
    process.cwd(),
    "output",
    "playwright",
    "production-cohort",
    runMarker,
    "resume-a1-evidence.json",
  );
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

test("resumes the existing six-person family and submits it for admin review", async ({
  browser,
}, testInfo) => {
  test.setTimeout(1_800_000);
  assertProductionCohortWriteUnlock();
  const runMarker = requiredProductionRunMarker();
  const accounts = loadProductionCohortAccounts();
  const plan = buildProductionCohortPlan(runMarker);
  const cohortCase = plan.find((candidate) => candidate.caseKey === targetCaseKey);
  if (!cohortCase) throw new Error("Focused production cohort case is absent.");
  const account = accounts.agents.find(
    (candidate) => candidate.key === cohortCase.ownerKey,
  );
  if (!account) throw new Error("Focused production cohort owner is absent.");
  const resumeState = await loadCohortResumeState(runMarker);
  const initialCheckpoint = resumeState.cases[targetCaseKey];
  if (
    !initialCheckpoint ||
    !initialCheckpoint.submissionId ||
    !["questionnaire_saved", "submitted"].includes(initialCheckpoint.stage)
  ) {
    throw new Error(
      "Focused resume requires the existing questionnaire_saved/submitted checkpoint.",
    );
  }

  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string" || !baseURL) {
    throw new Error("Focused production cohort requires baseURL.");
  }
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: "block",
    viewport: { height: 900, width: 1440 },
  });
  const startedAt = new Date().toISOString();
  let failure: unknown;
  let browserProblems = { count: 0, digests: [] as string[] };
  let mutationSummary: Array<{
    count: number;
    method: string;
    path: string;
    status: number;
  }> = [];
  let session: Awaited<ReturnType<typeof signInCohortAccount>> | undefined;
  try {
    session = await signInCohortAccount(context, account);
    await createOrResumeCohortCase({
      account,
      cohortCase,
      ledger: session.ledger,
      page: session.page,
      resumeState,
    });
    browserProblems = session.browserProblems();
    mutationSummary = session.ledger.summary();
    session.ledger.assertNoOriginViolations();
    expect(browserProblems.count).toBe(0);
    expect(resumeState.cases[targetCaseKey]?.stage).toBe("submitted");
  } catch (error) {
    failure = error;
  } finally {
    if (session) {
      browserProblems = session.browserProblems();
      mutationSummary = session.ledger.summary();
    }
    await context.close();
    await writeEvidence(runMarker, {
      browserProblems,
      caseKey: targetCaseKey,
      credentialsPersistedInEvidence: false,
      directSupabaseWritesFromHarness: false,
      errorDigest: failure ? errorDigest(failure) : undefined,
      finishedAt: new Date().toISOString(),
      markerPersistedInEvidence: false,
      mutationSummary,
      projectRef: PRODUCTION_PROJECT_REF,
      result: failure ? "FAILED" : "PASS",
      startedAt,
      stage: resumeState.cases[targetCaseKey]?.stage ?? "missing",
    });
  }

  if (failure) throw failure;
});
