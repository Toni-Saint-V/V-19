import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  PRODUCTION_COHORT_APP_ORIGIN,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SUPABASE_ORIGIN,
  isPermittedCohortStaticRuntimeRequest,
  loadProductionCohortAccounts,
  requiredProductionRunMarker,
  signInCohortAccount,
  type BrowserProblemEvidence,
  type CohortMutationSummary,
  type ProductionCohortAccount,
  type ProductionNetworkLedger,
} from "./production-cohort-helpers";
import { resolveProductionCohortDraftPayloadIdentity } from "./production-export-a1-s1-helpers";
import {
  acquireProductionLifecycleLock,
  assertProductionLifecycleAcceptanceProof,
  assertProductionLifecycleMutationAudit,
  assertProductionLifecycleWriteUnlock,
  createProductionMutationDiagnosticError,
  createProductionResponseDiagnosticError,
  evidenceDigest,
  loadOrCreateProductionLifecycleState,
  productionDraftValueDigest,
  productionLifecycleMutationPayloadMismatchCode,
  productionLifecycleMutationPayloadMatches,
  productionLifecycleCorrectedNote,
  productionLifecycleIssueMarker,
  RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY,
  recordProductionLifecycleAcceptanceProof,
  runWithFailurePreservingCleanup,
  saveProductionLifecycleState,
  writeProductionLifecycleEvidence,
  type ProductionLifecycleMutationContract,
  type ProductionLifecycleState,
} from "./production-lifecycle-helpers";
import { clickWorkspaceButton, isVisible } from "./ui-helpers";

type LifecycleSession = Awaited<ReturnType<typeof signInCohortAccount>> & {
  accountKey: string;
  context: BrowserContext;
  mutationGate: StrictProductionMutationGate;
  role: "admin" | "agent";
};

type SessionEvidence = {
  accountKey: string;
  browserProblems: BrowserProblemEvidence;
  mutationSummary: CohortMutationSummary[];
  role: "admin" | "agent";
};

type LifecycleEvidence = {
  case?: {
    caseKey: string;
    submissionDigest: string;
  };
  constraints: {
    credentialsPersistedInEvidence: false;
    directSupabaseWritesFromHarness: false;
    existingCheckpointRecordsOnly: true;
    mockDemoFixtureDataLayerUsed: false;
    screenshotsPersisted: false;
    tracesPersisted: false;
    videosPersisted: false;
  };
  errorDigest?: string;
  finishedAt?: string;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  result: "FAILED" | "PASS" | "RUNNING";
  runMarker: string;
  schemaVersion: 1;
  sessions: SessionEvidence[];
  stage?: ProductionLifecycleState["stage"];
  startedAt: string;
};

const saveDraftRpcPath = "/rest/v1/rpc/save_submission_draft";
const submitCorrectionsRpcPath = "/rest/v1/rpc/submit_corrections_handoff";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class StrictProductionMutationGate {
  #authPasswordRequests = 0;
  #diagnosticCode = "not_observed";
  readonly #violations: string[] = [];
  #window: {
    contract: ProductionLifecycleMutationContract;
    label: string;
    observed: number;
    path: string;
  } | null = null;

  async attach(context: BrowserContext) {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      const resourceType = request.resourceType();
      const url = new URL(request.url());
      const isProductionRead =
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        /^(GET|HEAD|OPTIONS)$/.test(method);
      const isPasswordLogin =
        method === "POST" &&
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        url.pathname === "/auth/v1/token" &&
        url.searchParams.get("grant_type") === "password" &&
        this.#authPasswordRequests < 6 &&
        this.#window === null;
      const isLocalStaticAsset =
        method === "GET" &&
        url.origin === PRODUCTION_COHORT_APP_ORIGIN &&
        (url.pathname === "/" ||
          /^\/assets\/[a-zA-Z0-9._-]+\.(?:css|gif|ico|jpe?g|js|json|png|svg|webp|woff2?)$/.test(
            url.pathname,
          ) ||
          isPermittedCohortStaticRuntimeRequest(url, method)) &&
        !/^(fetch|xhr)$/.test(resourceType);

      if (isProductionRead || isLocalStaticAsset) {
        await route.continue();
        return;
      }

      if (isPasswordLogin) {
        this.#authPasswordRequests += 1;
        await route.continue();
        return;
      }

      const activeWindow = this.#window;
      const isCandidate =
        activeWindow !== null &&
        method === "POST" &&
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        url.pathname === activeWindow.path &&
        activeWindow.observed === 0;
      const payloadMatches =
        isCandidate &&
        productionLifecycleMutationPayloadMatches(
          request.postData(),
          activeWindow.contract,
        );
      if (isCandidate) {
        this.#diagnosticCode = payloadMatches
          ? "match"
          : productionLifecycleMutationPayloadMismatchCode(
              request.postData(),
              activeWindow.contract,
            );
      }
      const allowedMutation = isCandidate && payloadMatches;
      if (!allowedMutation) {
        this.#violations.push(
          evidenceDigest(
            `${method}:${url.origin}:${url.pathname}:${
              activeWindow ? "payload-contract" : "route-contract"
            }`,
          ),
        );
        await route.abort("blockedbyclient");
        return;
      }

      activeWindow.observed += 1;
      await route.continue();
    });
  }

  assertLoginCompleted() {
    invariant(
      this.#authPasswordRequests >= 1 && this.#authPasswordRequests <= 6,
      "Production lifecycle session must use one to six bounded password-auth attempts.",
    );
  }

  authAttemptCount() {
    return this.#authPasswordRequests;
  }

  diagnosticCode() {
    return this.#diagnosticCode;
  }

  begin(
    label: string,
    path: string,
    contract: ProductionLifecycleMutationContract,
  ) {
    invariant(!this.#window, "A production mutation window is already active.");
    this.#diagnosticCode = "not_observed";
    this.#window = { contract, label, observed: 0, path };
  }

  finish(label: string) {
    const active = this.#window;
    this.#window = null;
    invariant(active?.label === label, "Production mutation window label mismatch.");
    invariant(
      active.observed === 1,
      `${label}: exactly one allowlisted production mutation must be sent.`,
    );
  }

  assertIdleAndClean() {
    invariant(!this.#window, "Production mutation window remained active.");
    invariant(
      this.#violations.length === 0,
      "A non-allowlisted production mutation was blocked before send.",
    );
  }
}

function baseUrl(testInfo: TestInfo) {
  const value = testInfo.project.use.baseURL;
  invariant(
    typeof value === "string" && value.length > 0,
    "Production lifecycle Playwright baseURL is required.",
  );
  return value;
}

function drawer(page: Page) {
  return page.locator('[role="dialog"]:visible').first();
}

async function openSession(
  browser: Browser,
  testInfo: TestInfo,
  account: ProductionCohortAccount,
): Promise<LifecycleSession> {
  const context = await browser.newContext({
    baseURL: baseUrl(testInfo),
    serviceWorkers: "block",
    viewport: { height: 900, width: 1440 },
  });
  try {
    const mutationGate = new StrictProductionMutationGate();
    await mutationGate.attach(context);
    const session = await signInCohortAccount(context, account);
    mutationGate.assertLoginCompleted();
    return {
      ...session,
      accountKey: account.key,
      context,
      mutationGate,
      role: account.role,
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function closeSession(session: LifecycleSession, evidence: LifecycleEvidence) {
  try {
    const browserProblems = session.browserProblems();
    const mutationSummary = session.ledger.summary();
    evidence.sessions.push({
      accountKey: session.accountKey,
      browserProblems,
      mutationSummary,
      role: session.role,
    });
    session.mutationGate.assertIdleAndClean();
    session.ledger.assertNoOriginViolations();
    expect(browserProblems.count, `${session.accountKey} emitted browser errors`).toBe(
      0,
    );
    assertProductionLifecycleMutationAudit(
      mutationSummary,
      session.mutationGate.authAttemptCount(),
    );
  } finally {
    await session.context.close();
  }
}

async function waitForWorkspaceData(page: Page) {
  await expect(page.locator('[aria-label="Загрузка подач"]')).toHaveCount(0, {
    timeout: 120_000,
  });
  const loadError = page
    .getByRole("alert")
    .filter({ hasText: /Не удалось загрузить подачи|Production data unavailable/i })
    .first();
  invariant(!(await isVisible(loadError)), "Production workspace data failed to load.");
}

async function reloadCanonicalWorkspace(session: LifecycleSession) {
  await session.page.reload({ waitUntil: "domcontentloaded" });
  const headingName =
    session.role === "admin"
      ? /^(Проверка|Очередь на проверку|Работа|Выгрузка)$/
      : /^(Мои действия|Мои подачи)$/;
  await expect(
    session.page.getByRole("heading", { level: 1, name: headingName }),
  ).toBeVisible({ timeout: 120_000 });
  const requiredNavigation =
    session.role === "admin"
      ? session.page.getByRole("button", { exact: true, name: "Выгрузка" })
      : session.page.getByRole("button", { exact: true, name: "Мои подачи" });
  await expect(requiredNavigation.first()).toBeVisible({ timeout: 120_000 });
  await waitForWorkspaceData(session.page);
}

async function setSearch(page: Page, submissionId: string) {
  const search = page.getByRole("searchbox").first();
  if (await isVisible(search)) {
    await search.fill(submissionId);
    await page.waitForTimeout(300);
  }
}

function reviewCard(page: Page, submissionId: string) {
  return page
    .locator(
      ".v19-admin-review-card[data-submission-id], .v19-admin-cockpit-card[data-submission-id]",
    )
    .filter({ hasText: submissionId })
    .first();
}

function exportRow(page: Page, submissionId: string) {
  return page
    .locator(".v19-admin-export-row-v2, .v19-admin-export-row")
    .filter({ hasText: submissionId })
    .first();
}

function agentSubmissionCard(page: Page, submissionId: string) {
  return page.locator(`[data-submission-id="${submissionId}"]`).first();
}

async function adminReviewPresence(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Проверка|Работа/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Проверка|Очередь на проверку|Работа)$/,
    }),
  ).toBeVisible();
  await waitForWorkspaceData(page);
  await setSearch(page, submissionId);
  return isVisible(reviewCard(page, submissionId));
}

async function adminExportPresence(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Выгрузка/);
  await expect(page.getByRole("heading", { level: 1, name: "Центр выгрузки" })).toBeVisible();
  await waitForWorkspaceData(page);
  await setSearch(page, submissionId);
  return isVisible(exportRow(page, submissionId));
}

async function assertAdminReviewPresence(
  page: Page,
  submissionId: string,
  expected: boolean,
) {
  expect(
    await adminReviewPresence(page, submissionId),
    expected
      ? "Selected lifecycle card must be visible in Review."
      : "Selected lifecycle card must be absent from Review.",
  ).toBe(expected);
}

async function assertAdminExportPresence(
  page: Page,
  submissionId: string,
  expected: boolean,
) {
  expect(
    await adminExportPresence(page, submissionId),
    expected
      ? "Selected lifecycle card must be visible in Export."
      : "Selected lifecycle card must be absent from Export.",
  ).toBe(expected);
}

async function agentSubmissionPresence(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Мои подачи/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои подачи" }),
  ).toBeVisible();
  await waitForWorkspaceData(page);
  await setSearch(page, submissionId);
  return isVisible(agentSubmissionCard(page, submissionId));
}

async function agentActionPresence(
  page: Page,
  submissionId: string,
  queueName: "Закрыто" | "Открыто",
) {
  await clickWorkspaceButton(page, /Мои действия/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();
  await waitForWorkspaceData(page);
  await setSearch(page, submissionId);
  const queue = page.getByRole("button", { exact: true, name: queueName });
  await expect(queue).toBeVisible();
  await queue.click();
  await expect(queue).toHaveAttribute("aria-pressed", "true");
  const matchingRows = page
    .getByTestId("agent-action-row")
    .filter({ hasText: submissionId });
  const completedStatus = page
    .getByTestId("agent-action-status")
    .filter({ hasText: /^Выполнено$/ });
  const queueSpecificRows =
    queueName === "Закрыто"
      ? matchingRows.filter({ has: completedStatus })
      : matchingRows.filter({ hasNot: completedStatus });
  return isVisible(queueSpecificRows.first());
}

async function openAdminReviewDrawer(page: Page, submissionId: string) {
  await assertAdminReviewPresence(page, submissionId, true);
  await reviewCard(page, submissionId).click();
  await expect(drawer(page)).toBeVisible();
  await expect(
    drawer(page).getByRole("heading", { name: "Проверка пакета" }),
  ).toBeVisible();
  return drawer(page);
}

async function assertAdminExportCaseReady(
  page: Page,
  submissionId: string,
) {
  await assertAdminExportPresence(page, submissionId, true);
  const row = exportRow(page, submissionId);
  await expect(row).toContainText(submissionId);
  await expect(row).not.toHaveClass(/is-blocked/);
  await expect(row.locator('input[type="checkbox"]')).toBeEnabled();
}

async function assertDrawerCaseMarker(
  root: Locator,
  caseMarker: string,
  submissionId: string,
) {
  await openDrawerTab(root, /Файлы/);
  if ((await root.innerText()).includes(caseMarker)) return;
  await openDrawerTab(root, /Анкета/);
  if ((await root.innerText()).includes(caseMarker)) return;
  const page = root.page();
  const isAdminDrawer =
    (await root.getAttribute("data-admin-review-drawer-surface")) ===
    "workspace";
  if (isAdminDrawer) {
    await expect(root).toContainText(caseMarker, { timeout: 45_000 });
    return;
  }
  const inlineSurname = root
    .locator('[data-field-label="Фамилия"] input')
    .first();
  if ((await inlineSurname.count()) > 0) {
    await expect(inlineSurname).toHaveValue(new RegExp(caseMarker));
    return;
  }
  const open = root
    .getByRole("button", {
      name: /Открыть анкету|Смотреть анкету|Исправить анкету/,
    })
    .first();
  await expect(open).toBeVisible();
  await open.click();
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  const personalSection = questionnaire
    .locator(".v19-questionnaire-section-tab:visible")
    .filter({ hasText: /Личные данные/ })
    .first();
  await expect(personalSection).toBeVisible();
  await personalSection.click();
  await expect(
    questionnaire.locator('[data-field-label="Фамилия"] input').first(),
  ).toHaveValue(new RegExp(caseMarker));
  await questionnaire.getByRole("button", { name: "Назад" }).click();
  await expect(questionnaire).toHaveCount(0);
  await openAgentSubmissionDrawer(page, submissionId);
}

async function openAgentSubmissionDrawer(page: Page, submissionId: string) {
  expect(
    await agentSubmissionPresence(page, submissionId),
    "Returned lifecycle card must remain visible in My submissions.",
  ).toBe(true);
  await agentSubmissionCard(page, submissionId).click();
  await expect(drawer(page)).toBeVisible();
  return drawer(page);
}

async function openDrawerTab(root: Locator, name: string | RegExp) {
  const roleTab = root.getByRole("tab", { name }).first();
  const control = (await isVisible(roleTab))
    ? roleTab
    : root.getByRole("button", { name }).first();
  await expect(control).toBeVisible();
  await control.click();
}

async function productionMutationUiDiagnostic(page: Page) {
  const alerts = page.getByRole("alert");
  const alertTexts: string[] = [];
  for (let index = 0; index < (await alerts.count()); index += 1) {
    const alert = alerts.nth(index);
    if (!(await isVisible(alert))) continue;
    const text = (await alert.textContent())?.trim();
    if (text) alertTexts.push(text);
  }
  const remarkFormVisible = await isVisible(page.getByTestId("remark-form-submit"));
  return { alertTexts, remarkFormVisible };
}

async function successfulProductionMutation(
  page: Page,
  ledger: ProductionNetworkLedger,
  mutationGate: StrictProductionMutationGate,
  expectedPath: string,
  label: string,
  contract: ProductionLifecycleMutationContract,
  action: () => Promise<void>,
) {
  const checkpoint = ledger.checkpoint();
  mutationGate.begin(label, expectedPath, contract);
  const responsePromise = page.waitForResponse(
    (response) => {
      const request = response.request();
      const url = new URL(response.url());
      return (
        /^(POST|PUT|PATCH|DELETE)$/.test(request.method()) &&
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        request.method() === "POST" &&
        url.pathname === expectedPath &&
        productionLifecycleMutationPayloadMatches(request.postData(), contract)
      );
    },
    { timeout: 45_000 },
  );
  void responsePromise.catch(() => undefined);
  let failurePhase: "action" | "response" = "action";
  let operationFailure: unknown;
  let response: Awaited<typeof responsePromise> | undefined;
  try {
    await action();
    failurePhase = "response";
    response = await responsePromise;
  } catch (error) {
    operationFailure = error;
  }
  let gateFailure: unknown;
  try {
    mutationGate.finish(label);
  } catch (error) {
    gateFailure = error;
  }
  if (operationFailure) {
    const operationMessage =
      operationFailure instanceof Error
        ? operationFailure.message
        : String(operationFailure);
    const gateMessage =
      gateFailure instanceof Error ? gateFailure.message : String(gateFailure ?? "none");
    const uiDiagnostic = await productionMutationUiDiagnostic(page);
    throw createProductionMutationDiagnosticError({
      ...uiDiagnostic,
      gateCode: mutationGate.diagnosticCode(),
      gateMessage,
      label,
      operationMessage,
      phase: failurePhase,
    });
  }
  if (gateFailure) throw gateFailure;
  invariant(response, `${label}: production response is absent.`);
  if (!response.ok()) {
    const responseBody = await response.text().catch(() => "unavailable");
    throw createProductionResponseDiagnosticError({
      label,
      responseBody,
      status: response.status(),
    });
  }
  ledger.assertHealthySince(checkpoint, label);
}

async function persistLifecycleStage(state: ProductionLifecycleState) {
  await saveProductionLifecycleState(state);
}

type LifecycleMutationExpectation = {
  actorSource: "admin" | "agent";
  correctionMode: "append" | "existing";
  correctedQuestionnaireValue?: string;
  snapshotMutation?: "add_issue" | "mark_issue_fixed";
  snapshotStatus: ProductionLifecycleMutationContract["history"]["snapshotStatus"];
  transition?: NonNullable<ProductionLifecycleMutationContract["history"]["transition"]>;
};

function lifecycleSnapshotMutationIntent(
  state: ProductionLifecycleState,
  requested: LifecycleMutationExpectation["snapshotMutation"],
): {
  applicantId?: string;
  comment: string;
  fieldId: string;
  fieldLabel: string;
  mode: "add_issue" | "mark_issue_fixed";
  reason: string;
} | undefined {
  if (!requested) return undefined;
  return {
    comment: productionLifecycleIssueMarker(state),
    fieldId: "appointment-note",
    fieldLabel: "Примечание",
    mode: requested,
    reason: "Требуется исправить поле «Примечание»",
  };
}

function lifecycleTimestampWindow() {
  const now = Date.now();
  return {
    notAfter: new Date(now + 120_000).toISOString(),
    notBefore: new Date(now - 1_000).toISOString(),
  };
}

async function lifecycleMutationContract(
  state: ProductionLifecycleState,
  submissionStatus: ProductionLifecycleMutationContract["submissionStatus"],
  correctionStatus: ProductionLifecycleMutationContract["correction"]["status"],
  expectation: LifecycleMutationExpectation,
): Promise<ProductionLifecycleMutationContract> {
  const accounts = loadProductionCohortAccounts();
  const owner = accounts.agents.find(
    (account) => account.key === state.case.ownerKey,
  );
  invariant(owner, "Lifecycle mutation owner account is absent.");
  const expectedApplicantCount = state.case.caseKey === "A1-F6" ? 6 : 1;
  const actorId =
    expectation.actorSource === "admin"
      ? accounts.admin.authUserId
      : owner.authUserId;
  const baseline = await resolveProductionCohortDraftPayloadIdentity({
    admin: accounts.admin,
    applicantSerializerProjection: {
      actorId,
      allowedDriftFields: ["email", "questionnaire_percent"],
    },
    correctionMarker: productionLifecycleIssueMarker(state),
    expectedApplicantCount,
    ownerId: owner.authUserId,
    questionnaireSerializerProjection: {
      allowedLabelDriftFieldIds: ["hotel-name"],
    },
    submissionId: state.case.submissionId,
  });
  const issueApplicantId = baseline.applicantIdsInSnapshotOrder[0];
  invariant(issueApplicantId, "Lifecycle issue applicant cannot be resolved.");
  const snapshotMutationIntent = lifecycleSnapshotMutationIntent(
    state,
    expectation.snapshotMutation,
  );
  if (snapshotMutationIntent) snapshotMutationIntent.applicantId = issueApplicantId;
  const submissionProjectionIntent = snapshotMutationIntent
    ? {
        actorId,
        intent: snapshotMutationIntent,
        mode: "snapshot_mutation" as const,
      }
    : expectation.correctedQuestionnaireValue !== undefined
      ? {
          actorId,
          applicantId: issueApplicantId,
          fieldId: "appointment-note",
          mode: "questionnaire_replace" as const,
          value: expectation.correctedQuestionnaireValue,
        }
    : expectation.transition?.toStatus === "returned"
      ? {
          action: "return_with_issues" as const,
          actorId,
          mode: "submission_action" as const,
          role: "admin" as const,
        }
      : expectation.transition?.toStatus === "corrections_received"
        ? {
            action: "submit_corrections" as const,
            actorId,
            mode: "submission_action" as const,
            role: "agent" as const,
          }
        : expectation.transition?.toStatus === "ready_for_export"
          ? {
              action: "close_issues_accept" as const,
              actorId,
              mode: "submission_action" as const,
              role: "admin" as const,
            }
          : undefined;
  const resolved = submissionProjectionIntent
    ? await resolveProductionCohortDraftPayloadIdentity({
        admin: accounts.admin,
        applicantSerializerProjection: {
          actorId,
          allowedDriftFields: ["email", "questionnaire_percent"],
        },
        correctionMarker: productionLifecycleIssueMarker(state),
        expectedApplicantCount,
        ownerId: owner.authUserId,
        questionnaireSerializerProjection: {
          allowedLabelDriftFieldIds: ["hotel-name"],
        },
        snapshotMutationIntent,
        submissionProjectionIntent,
        submissionId: state.case.submissionId,
      })
    : baseline;
  const { draft, snapshotMutation } = resolved;
  let questionnaire: ProductionLifecycleMutationContract["questionnaire"] = {
    mode: "exact",
  };
  if (expectation.correctedQuestionnaireValue !== undefined) {
    const noteLabelDigest = productionDraftValueDigest("Примечание");
    const expectedValueDigest = productionDraftValueDigest(
      expectation.correctedQuestionnaireValue,
    );
    const targets = draft.questionnaireAnswers.filter(
      (answer) =>
        answer.applicantId === issueApplicantId &&
        answer.labelDigest === noteLabelDigest,
    );
    invariant(
      noteLabelDigest && expectedValueDigest && targets.length === 1,
      "Lifecycle note correction must resolve one exact questionnaire field.",
    );
    const target = targets[0]!;
    questionnaire = {
      applicantId: target.applicantId,
      expectedValueDigest,
      fieldId: target.fieldId,
      mode: "replace",
      sectionId: target.sectionId,
    };
  }
  return {
    correction: {
      ...(expectation.correctionMode === "append"
        ? { applicantId: issueApplicantId }
        : {}),
      mode: expectation.correctionMode,
      reasonIncludes: productionLifecycleIssueMarker(state),
      status: correctionStatus,
    },
    draft,
    history: {
      actorId,
      actorSource: expectation.actorSource,
      snapshotStatus: expectation.snapshotStatus,
      transition: resolved.historyTransition ?? expectation.transition,
    },
    applicantProjection: resolved.applicantProjection ?? { mode: "exact" },
    historyProjection: resolved.historyProjection,
    mediaProjection: resolved.mediaProjection,
    mode: "lifecycle",
    ownerId: owner.authUserId,
    questionnaire,
    questionnaireProjection: resolved.questionnaireProjection,
    snapshotMutation,
    snapshotHistoryProjection: resolved.snapshotHistoryProjection,
    snapshotProjection: resolved.snapshotProjection,
    submissionId: state.case.submissionId,
    submissionProjection: resolved.submissionProjection,
    submissionStatus,
    timestampWindow: lifecycleTimestampWindow(),
  };
}

async function verifyInitialOwnerCaseBeforeFirstWrite(input: {
  browser: Browser;
  caseMarker: string;
  evidence: LifecycleEvidence;
  owner: ProductionCohortAccount;
  state: ProductionLifecycleState;
  testInfo: TestInfo;
}) {
  const { browser, caseMarker, evidence, owner, state, testInfo } = input;
  invariant(
    state.stage === "pending_review",
    "Initial focused-case preflight is valid only before the first lifecycle write.",
  );
  const submissionId = state.case.submissionId;

  const ownerSession = await openSession(browser, testInfo, owner);
  await runWithFailurePreservingCleanup(async () => {
    await reloadCanonicalWorkspace(ownerSession);
    expect(
      await agentSubmissionPresence(ownerSession.page, submissionId),
      `${state.case.caseKey} must belong to the checkpoint owner before the first lifecycle write.`,
    ).toBe(true);
    expect(
      await agentActionPresence(ownerSession.page, submissionId, "Закрыто"),
      `${state.case.caseKey} must be in the completed agent queue while submitted for review.`,
    ).toBe(true);
    expect(
      await agentActionPresence(ownerSession.page, submissionId, "Открыто"),
      `${state.case.caseKey} must not already carry an open agent action before the lifecycle starts.`,
    ).toBe(false);
    const root = await openAgentSubmissionDrawer(ownerSession.page, submissionId);
    await assertDrawerCaseMarker(root, caseMarker, submissionId);
    await expect(root.locator(".v20-status-pill")).toHaveText("проверка");
  }, () => closeSession(ownerSession, evidence));

}

async function addLifecycleIssue(
  session: LifecycleSession,
  state: ProductionLifecycleState,
) {
  const root = drawer(session.page);
  await openDrawerTab(root, /Анкета/);
  const noteLabel = root.getByText("Примечание", { exact: true }).first();
  await expect(noteLabel).toBeVisible();
  const noteFieldRow = noteLabel.locator(
    "xpath=ancestor::div[.//*[@data-testid='admin-review-add-remark']][1]",
  );
  const addRemark = noteFieldRow.getByTestId("admin-review-add-remark").first();
  await expect(addRemark).toBeVisible();
  await addRemark.click();
  const remark = session.page
    .getByRole("dialog")
    .filter({ hasText: "Добавить замечание" })
    .last();
  await expect(remark).toBeVisible();
  await remark.getByRole("button", { exact: true, name: "Критично" }).click();
  const issueMarker = productionLifecycleIssueMarker(state);
  await remark
    .getByPlaceholder("Опишите, что именно нужно исправить...")
    .fill(issueMarker);
  state.stage = "adding_issue";
  await persistLifecycleStage(state);
  await successfulProductionMutation(
    session.page,
    session.ledger,
    session.mutationGate,
    saveDraftRpcPath,
    "add lifecycle issue",
    await lifecycleMutationContract(state, "waiting_review", "open", {
      actorSource: "admin",
      correctionMode: "append",
      snapshotMutation: "add_issue",
      snapshotStatus: "submitted_for_review",
    }),
    () => remark.getByRole("button", { name: "Отправить замечание" }).click(),
  );
  await expect(remark).toHaveCount(0);
  await openDrawerTab(root, /Анкета/);
  await expect(
    root
      .getByRole("button", { name: /\d+ замечани(?:е|я|й)/i })
      .first(),
  ).toBeVisible();
  state.stage = "issue_added";
  await persistLifecycleStage(state);
}

async function ensureAdminReturned(input: {
  admin: ProductionCohortAccount;
  browser: Browser;
  caseMarker: string;
  evidence: LifecycleEvidence;
  state: ProductionLifecycleState;
  testInfo: TestInfo;
}) {
  const { admin, browser, caseMarker, evidence, state, testInfo } = input;
  if (
    !["pending_review", "adding_issue", "issue_added", "returning"].includes(
      state.stage,
    )
  ) {
    return;
  }

  const session = await openSession(browser, testInfo, admin);
  await runWithFailurePreservingCleanup(async () => {
    const submissionId = state.case.submissionId;
    if (state.stage === "pending_review") {
      await assertAdminExportPresence(session.page, submissionId, false);
    }
    const inReview = await adminReviewPresence(session.page, submissionId);
    if (!inReview) {
      const inExport = await adminExportPresence(session.page, submissionId);
      invariant(
        !inExport,
        `${state.case.caseKey} reached Export before the mandatory return/fix/resubmit lifecycle completed.`,
      );
      invariant(
        state.stage === "returning",
        `${state.case.caseKey} disappeared from Review before the return action was checkpointed.`,
      );
      return;
    }

    await assertAdminExportPresence(session.page, submissionId, false);
    let root = await openAdminReviewDrawer(session.page, submissionId);
    await assertDrawerCaseMarker(root, caseMarker, submissionId);
    if (state.stage === "pending_review") {
      await expect(root).toContainText("На проверке");
      await expect(
        root.getByRole("button", { exact: true, name: "Принять на выгрузку" }),
      ).toBeEnabled();
    }

    let returnButton = root.getByRole("button", {
      exact: true,
      name: "Отправить на исправление",
    });
    if (!(await isVisible(returnButton))) {
      const accept = root.getByRole("button", {
        exact: true,
        name: "Принять на выгрузку",
      });
      invariant(
        ["pending_review", "adding_issue"].includes(state.stage) &&
          (await isVisible(accept)),
        "Return lifecycle card has an unexpected admin action state.",
      );
      await addLifecycleIssue(session, state);
      await reloadCanonicalWorkspace(session);
      root = await openAdminReviewDrawer(session.page, submissionId);
      await assertDrawerCaseMarker(root, caseMarker, submissionId);
      returnButton = root.getByRole("button", {
        exact: true,
        name: "Отправить на исправление",
      });
    }

    await openDrawerTab(root, /Анкета/);
    await expect(
      root
        .getByRole("button", { name: /\d+ замечани(?:е|я|й)/i })
        .first(),
    ).toBeVisible();
    state.stage = "issue_added";
    await persistLifecycleStage(state);
    await expect(returnButton).toBeEnabled();
    state.stage = "returning";
    await persistLifecycleStage(state);
    await successfulProductionMutation(
      session.page,
      session.ledger,
      session.mutationGate,
      saveDraftRpcPath,
      "return with lifecycle issue",
      await lifecycleMutationContract(state, "returned", "open", {
        actorSource: "admin",
        correctionMode: "existing",
        snapshotStatus: "returned",
        transition: {
          comment: "Статус изменен: Возвращено: Администратор вернул подачу с замечаниями",
          fromStatus: "submitted_for_review",
          note: "Администратор вернул подачу с замечаниями",
          toStatus: "returned",
        },
      }),
      () => returnButton.click(),
    );
    state.stage = "returned";
    await persistLifecycleStage(state);
    await reloadCanonicalWorkspace(session);
    await assertAdminReviewPresence(session.page, submissionId, false);
    await assertAdminExportPresence(session.page, submissionId, false);
  }, () => closeSession(session, evidence));
}

async function showLifecycleIssueInQuestionnaire(
  questionnaire: Locator,
  issueMarker: string,
) {
  const marker = questionnaire.getByText(issueMarker, { exact: false }).first();
  const fixed = questionnaire
    .getByText(/Исправление.*отправлено, ожидает проверки администратора/)
    .first();
  if (await isVisible(marker)) return "open" as const;
  if (await isVisible(fixed)) return "fixed" as const;

  const sectionTabs = questionnaire.locator(
    ".v19-questionnaire-section-tab:visible",
  );
  for (let index = 0; index < (await sectionTabs.count()); index += 1) {
    await sectionTabs.nth(index).click();
    if (await isVisible(marker)) return "open" as const;
    if (await isVisible(fixed)) return "fixed" as const;
  }
  throw new Error("Lifecycle issue is not visible in the returned questionnaire.");
}

async function openExactLifecycleIssueCard(
  session: LifecycleSession,
  state: ProductionLifecycleState,
) {
  const root = await openAgentSubmissionDrawer(session.page, state.case.submissionId);
  await expect(root.locator(".v20-status-pill")).toHaveText("возвращено");
  await openDrawerTab(root, /Замечания/);
  const issueCard = root
    .locator(".v20-issue-card, .v19-drawer-issue-card, article")
    .filter({ hasText: productionLifecycleIssueMarker(state) })
    .first();
  await expect(issueCard).toBeVisible();
  await expect(issueCard).toContainText(productionLifecycleIssueMarker(state));
  const issueIsFixed = await isVisible(
    issueCard.getByText(/Исправлено|Ждет проверки/).first(),
  );
  return { issueCard, issueIsFixed, root };
}

async function openExactLifecycleIssueQuestionnaire(
  session: LifecycleSession,
  state: ProductionLifecycleState,
) {
  const { issueCard, issueIsFixed, root } = await openExactLifecycleIssueCard(
    session,
    state,
  );
  let openQuestionnaire: Locator;
  if (issueIsFixed) {
    await openDrawerTab(root, /Анкета/);
    openQuestionnaire = root.getByRole("button", { name: "Открыть анкету" }).first();
  } else {
    await expect(issueCard).toContainText(/Blocker|Критич/);
    openQuestionnaire = issueCard
      .getByRole("button", {
        name: /Открыть|Исправить в анкете|Исправить|Перезагрузить файл/,
      })
      .first();
  }
  await expect(openQuestionnaire).toBeVisible();
  await openQuestionnaire.click();

  const questionnaire = session.page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  const issueState = await showLifecycleIssueInQuestionnaire(
    questionnaire,
    productionLifecycleIssueMarker(state),
  );
  return { issueState, questionnaire };
}

async function ensureAgentResubmitted(input: {
  account: ProductionCohortAccount;
  browser: Browser;
  caseMarker: string;
  evidence: LifecycleEvidence;
  state: ProductionLifecycleState;
  testInfo: TestInfo;
}) {
  const { account, browser, caseMarker, evidence, state, testInfo } = input;
  if (["resubmitted", "accepting", "accepted"].includes(state.stage)) return;

  const session = await openSession(browser, testInfo, account);
  await runWithFailurePreservingCleanup(async () => {
    const submissionId = state.case.submissionId;
    const inIssueActions = await agentActionPresence(
      session.page,
      submissionId,
      "Открыто",
    );
    if (!inIssueActions) {
      const alreadyResubmitted = await agentActionPresence(
        session.page,
        submissionId,
        "Закрыто",
      );
      if (alreadyResubmitted) {
        invariant(
          [
            "fixing_issue",
            "marking_issue_fixed",
            "agent_fixed",
            "resubmitting",
          ].includes(state.stage),
          `${state.case.caseKey} reached the completed agent queue without a resubmission intent checkpoint.`,
        );
        state.stage = "resubmitted";
        await persistLifecycleStage(state);
        return;
      }
      invariant(
        ["fixing_issue", "marking_issue_fixed", "agent_fixed", "resubmitting"].includes(
          state.stage,
        ),
        `${state.case.caseKey} is absent from the open agent queue before a saved issue-fix intent checkpoint.`,
      );
      expect(
        await agentActionPresence(session.page, submissionId, "Открыто"),
        `${state.case.caseKey} must remain in agent actions while a saved fix is awaiting resubmission.`,
      ).toBe(true);
    } else {
      invariant(
        [
          "returning",
          "returned",
          "fixing_issue",
          "marking_issue_fixed",
          "agent_fixed",
          "resubmitting",
        ].includes(state.stage),
        `${state.case.caseKey} is in the open agent queue after an incompatible lifecycle checkpoint.`,
      );
    }

    const { issueState, questionnaire } = await openExactLifecycleIssueQuestionnaire(
      session,
      state,
    );

    if (issueState === "open") {
      invariant(
        !["agent_fixed", "resubmitting"].includes(state.stage),
        "Lifecycle checkpoint says fixed/resubmitting but the exact production issue remains open.",
      );
      if (state.stage === "returning") {
        state.stage = "returned";
        await persistLifecycleStage(state);
      }
      state.stage = "fixing_issue";
      await persistLifecycleStage(state);
      const noteField = questionnaire
        .locator('[data-field-label="Примечание"]')
        .first();
      await expect(noteField).toBeVisible();
      const noteControl = noteField
        .locator("input:not([readonly]), textarea:not([readonly])")
        .first();
      await expect(noteControl).toBeVisible();
      const correctedNote = productionLifecycleCorrectedNote(state);
      if ((await noteControl.inputValue()) !== correctedNote) {
        await successfulProductionMutation(
          session.page,
          session.ledger,
          session.mutationGate,
          saveDraftRpcPath,
          "agent saves lifecycle audit-note correction",
          await lifecycleMutationContract(state, "returned", "open", {
            actorSource: "agent",
            correctionMode: "existing",
            correctedQuestionnaireValue: correctedNote,
            snapshotStatus: "returned",
          }),
          async () => {
            await noteControl.fill(correctedNote);
            await noteControl.press("Tab");
          },
        );
        await expect(
          questionnaire.locator('.v19-questionnaire-screen-header [role="status"]'),
        ).toContainText("Сохранено", { timeout: 45_000 });
      }
      await questionnaire.getByRole("button", { name: "Назад" }).click();
      await expect(questionnaire).toHaveCount(0);

      const issueContext = await openExactLifecycleIssueCard(session, state);
      expect(
        issueContext.issueIsFixed,
        "The exact lifecycle issue must remain open until the agent confirms the saved correction.",
      ).toBe(false);
      const markFixed = issueContext.issueCard.getByRole("button", {
        name: "Отметить исправленным",
      });
      await expect(markFixed).toBeEnabled();
      state.stage = "marking_issue_fixed";
      await persistLifecycleStage(state);
      await successfulProductionMutation(
        session.page,
        session.ledger,
        session.mutationGate,
        saveDraftRpcPath,
        "agent marks lifecycle issue fixed",
        await lifecycleMutationContract(state, "returned", "fixed", {
          actorSource: "agent",
          correctionMode: "existing",
          snapshotMutation: "mark_issue_fixed",
          snapshotStatus: "returned",
        }),
        () => markFixed.click(),
      );
      await expect(issueContext.issueCard).toContainText(/Исправлено|Ждет проверки/);
      state.stage = "agent_fixed";
      await persistLifecycleStage(state);
      await issueContext.root
        .getByLabel("Закрыть", { exact: true })
        .click();
      await expect(drawer(session.page)).toHaveCount(0);
    } else {
      invariant(
        ["fixing_issue", "marking_issue_fixed", "agent_fixed", "resubmitting"].includes(
          state.stage,
        ),
        "The exact lifecycle issue is fixed without a saved fix intent checkpoint.",
      );
      await expect(
        questionnaire.getByText(
          /Исправление.*отправлено, ожидает проверки администратора/,
        ),
      ).toBeVisible();
      state.stage = "agent_fixed";
      await persistLifecycleStage(state);
      await questionnaire.getByRole("button", { name: "Назад" }).click();
      await expect(questionnaire).toHaveCount(0);
    }

    expect(
      await agentActionPresence(session.page, submissionId, "Открыто"),
      "Fixed lifecycle record must remain in the open agent queue until resubmission.",
    ).toBe(true);

    const reopened = await openExactLifecycleIssueQuestionnaire(session, state);
    await expect(reopened.questionnaire).toBeVisible();
    expect(
      reopened.issueState,
      "The exact lifecycle issue must remain fixed before resubmission.",
    ).toBe("fixed");
    const resubmit = reopened.questionnaire.getByRole("button", {
      name: /^(?:Отправить на проверку|Отправить исправления)$/,
    });
    await expect(resubmit).toBeEnabled();
    state.stage = "resubmitting";
    await persistLifecycleStage(state);
    await successfulProductionMutation(
      session.page,
      session.ledger,
      session.mutationGate,
      submitCorrectionsRpcPath,
      "agent resubmits lifecycle corrections",
      await lifecycleMutationContract(state, "waiting_review", "fixed", {
        actorSource: "agent",
        correctionMode: "existing",
        snapshotStatus: "corrections_received",
        transition: {
          comment: "Статус изменен: Исправления получены: Агент отправил исправления",
          fromStatus: "returned",
          note: "Агент отправил исправления",
          toStatus: "corrections_received",
        },
      }),
      () => resubmit.click(),
    );
    state.stage = "resubmitted";
    await persistLifecycleStage(state);
    await expect(
      reopened.questionnaire.getByTestId("questionnaire-read-only-status"),
    ).toContainText(/Исправления на проверке|Отправлено на проверку/, {
      timeout: 60_000,
    });

    await reopened.questionnaire.getByRole("button", { name: "Назад" }).click();
    await reloadCanonicalWorkspace(session);
    expect(
      await agentActionPresence(session.page, submissionId, "Открыто"),
      "Resubmitted lifecycle record must leave the open agent queue.",
    ).toBe(false);
    expect(
      await agentActionPresence(session.page, submissionId, "Закрыто"),
      "Resubmitted lifecycle record must move to the completed agent queue.",
    ).toBe(true);
    const resubmittedRoot = await openAgentSubmissionDrawer(session.page, submissionId);
    await assertDrawerCaseMarker(resubmittedRoot, caseMarker, submissionId);
    await expect(resubmittedRoot.locator(".v20-status-pill")).toHaveText(
      /проверка|исправлен/,
    );
  }, () => closeSession(session, evidence));
}

async function ensureReturnedAccepted(input: {
  admin: ProductionCohortAccount;
  browser: Browser;
  caseMarker: string;
  evidence: LifecycleEvidence;
  state: ProductionLifecycleState;
  testInfo: TestInfo;
}) {
  const { admin, browser, caseMarker, evidence, state, testInfo } = input;
  if (state.stage === "accepted") return;

  const session = await openSession(browser, testInfo, admin);
  await runWithFailurePreservingCleanup(async () => {
    const submissionId = state.case.submissionId;
    const inReview = await adminReviewPresence(session.page, submissionId);
    if (!inReview) {
      invariant(
        await adminExportPresence(session.page, submissionId),
        "Corrected lifecycle card is absent from both Review and Export.",
      );
      invariant(
        state.stage === "accepting",
        `${state.case.caseKey} reached Export without a saved acceptance intent checkpoint.`,
      );
      assertProductionLifecycleAcceptanceProof(state, caseMarker);
      await assertAdminExportCaseReady(session.page, submissionId);
      state.stage = "accepted";
      await persistLifecycleStage(state);
      return;
    }

    invariant(
      ["resubmitted", "accepting"].includes(state.stage),
      `${state.case.caseKey} returned to admin Review before a resubmission checkpoint.`,
    );
    state.stage = "resubmitted";
    await persistLifecycleStage(state);
    await assertAdminExportPresence(session.page, submissionId, false);
    const root = await openAdminReviewDrawer(session.page, submissionId);
    await assertDrawerCaseMarker(root, caseMarker, submissionId);
    await openDrawerTab(root, /Анкета/);
    await expect(root).toContainText(productionLifecycleCorrectedNote(state));
    await expect(
      root
        .getByRole("button", { name: /\d+ замечани(?:е|я|й)/i })
        .first(),
    ).toBeVisible();
    const accept = root.getByRole("button", {
      exact: true,
      name: "Принять на выгрузку",
    });
    await expect(accept).toBeEnabled();
    recordProductionLifecycleAcceptanceProof(state, caseMarker);
    state.stage = "accepting";
    await persistLifecycleStage(state);
    await successfulProductionMutation(
      session.page,
      session.ledger,
      session.mutationGate,
      saveDraftRpcPath,
      "accept corrected lifecycle record",
      await lifecycleMutationContract(state, "ready_for_excel", "closed", {
        actorSource: "admin",
        correctionMode: "existing",
        snapshotStatus: "ready_for_export",
        transition: {
          comment:
            "Статус изменен: Готово к выгрузке: Администратор закрыл исправления и принял подачу",
          fromStatus: "corrections_received",
          note: "Администратор закрыл исправления и принял подачу",
          toStatus: "ready_for_export",
        },
      }),
      () => accept.click(),
    );
    state.stage = "accepted";
    await persistLifecycleStage(state);

    await reloadCanonicalWorkspace(session);
    await assertAdminReviewPresence(session.page, submissionId, false);
    await assertAdminExportCaseReady(session.page, submissionId);
  }, () => closeSession(session, evidence));
}

async function verifyFinalStateAfterFreshRelogin(input: {
  admin: ProductionCohortAccount;
  browser: Browser;
  caseMarker: string;
  evidence: LifecycleEvidence;
  owner: ProductionCohortAccount;
  state: ProductionLifecycleState;
  testInfo: TestInfo;
}) {
  const { admin, browser, caseMarker, evidence, owner, state, testInfo } = input;
  const adminSession = await openSession(browser, testInfo, admin);
  await runWithFailurePreservingCleanup(async () => {
    await reloadCanonicalWorkspace(adminSession);
    await assertAdminReviewPresence(adminSession.page, state.case.submissionId, false);
    assertProductionLifecycleAcceptanceProof(state, caseMarker);
    await assertAdminExportCaseReady(
      adminSession.page,
      state.case.submissionId,
    );
  }, () => closeSession(adminSession, evidence));

  const ownerSession = await openSession(browser, testInfo, owner);
  await runWithFailurePreservingCleanup(async () => {
    await reloadCanonicalWorkspace(ownerSession);
    expect(
      await agentSubmissionPresence(ownerSession.page, state.case.submissionId),
      `Accepted ${state.case.caseKey} must remain visible in owner My submissions.`,
    ).toBe(true);
    expect(
      await agentActionPresence(ownerSession.page, state.case.submissionId, "Открыто"),
      `Accepted ${state.case.caseKey} must be absent from the owner open queue.`,
    ).toBe(false);
    expect(
      await agentActionPresence(ownerSession.page, state.case.submissionId, "Закрыто"),
      `Accepted ${state.case.caseKey} must remain visible in the completed owner queue.`,
    ).toBe(true);
    const root = await openAgentSubmissionDrawer(
      ownerSession.page,
      state.case.submissionId,
    );
    await assertDrawerCaseMarker(root, caseMarker, state.case.submissionId);
    await expect(root.locator(".v20-status-pill")).toHaveText("готово");
    await openDrawerTab(root, /Замечания/);
    await expect(root).not.toContainText(productionLifecycleIssueMarker(state));
    await expect(root).toContainText("Нет открытых действий");
    await openDrawerTab(root, /Анкета/);
    await root.getByRole("button", { name: "Открыть анкету" }).first().click();
    const questionnaire = ownerSession.page
      .locator(".vf-figma-questionnaire-screen")
      .first();
    await expect(questionnaire).toBeVisible();
    await questionnaire
      .locator(".v19-questionnaire-section-tab:visible")
      .filter({ hasText: "Запись" })
      .first()
      .click();
    const noteControl = questionnaire
      .locator('[data-field-label="Примечание"]')
      .locator("input, textarea")
      .first();
    await expect(noteControl).toHaveValue(productionLifecycleCorrectedNote(state));
    await expect(
      questionnaire.getByText(
        /Исправление.*отправлено, ожидает проверки администратора/,
      ),
    ).toHaveCount(0);
    await questionnaire.getByRole("button", { name: "Назад" }).click();
  }, () => closeSession(ownerSession, evidence));
}

test.describe("production lifecycle for existing audit cohort records", () => {
  test(`resumes ${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY} admin-return-agent-fix-admin-accept through UI only`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(1_800_000);
    assertProductionLifecycleWriteUnlock();
    const runMarker = requiredProductionRunMarker();
    const accounts = loadProductionCohortAccounts();
    const evidence: LifecycleEvidence = {
      constraints: {
        credentialsPersistedInEvidence: false,
        directSupabaseWritesFromHarness: false,
        existingCheckpointRecordsOnly: true,
        mockDemoFixtureDataLayerUsed: false,
        screenshotsPersisted: false,
        tracesPersisted: false,
        videosPersisted: false,
      },
      projectRef: PRODUCTION_PROJECT_REF,
      result: "RUNNING",
      runMarker,
      schemaVersion: 1,
      sessions: [],
      startedAt: new Date().toISOString(),
    };
    let failure: unknown;
    let releaseLifecycleLock: (() => Promise<void>) | undefined;
    let state: ProductionLifecycleState | undefined;

    try {
      releaseLifecycleLock = await acquireProductionLifecycleLock(runMarker);
      const resolved = await loadOrCreateProductionLifecycleState();
      state = resolved.state;
      const ownerAccount = accounts.agents.find(
        (account) => account.key === state?.case.ownerKey,
      );
      invariant(ownerAccount, "Return lifecycle owner account is absent.");
      evidence.case = {
        caseKey: state.case.caseKey,
        submissionDigest: evidenceDigest(state.case.submissionId),
      };
      if (state.stage === "pending_review") {
        await verifyInitialOwnerCaseBeforeFirstWrite({
          browser,
          caseMarker: resolved.cohortCase.caseMarker,
          evidence,
          owner: ownerAccount,
          state,
          testInfo,
        });
      }
      await ensureAdminReturned({
        admin: accounts.admin,
        browser,
        caseMarker: resolved.cohortCase.caseMarker,
        evidence,
        state,
        testInfo,
      });
      await ensureAgentResubmitted({
        account: ownerAccount,
        browser,
        caseMarker: resolved.cohortCase.caseMarker,
        evidence,
        state,
        testInfo,
      });
      await ensureReturnedAccepted({
        admin: accounts.admin,
        browser,
        caseMarker: resolved.cohortCase.caseMarker,
        evidence,
        state,
        testInfo,
      });
      await verifyFinalStateAfterFreshRelogin({
        admin: accounts.admin,
        browser,
        caseMarker: resolved.cohortCase.caseMarker,
        evidence,
        owner: ownerAccount,
        state,
        testInfo,
      });

      expect(state.stage).toBe("accepted");
      evidence.result = "PASS";
    } catch (error) {
      failure = error;
      evidence.errorDigest = evidenceDigest(
        error instanceof Error ? error.message : String(error),
      );
      evidence.result = "FAILED";
    } finally {
      if (state) {
        evidence.stage = state.stage;
      }
      evidence.finishedAt = new Date().toISOString();
      if (releaseLifecycleLock) {
        try {
          await writeProductionLifecycleEvidence(runMarker, evidence);
        } finally {
          await releaseLifecycleLock();
        }
      }
    }

    if (failure) throw failure;
  });
});
