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
  buildProductionCohortPlan,
  isPermittedCohortStaticRuntimeRequest,
  loadProductionCohortAccounts,
  productionCohortContactEmail,
  requiredProductionRunMarker,
  signInCohortAccount,
  type BrowserProblemEvidence,
  type CohortMutationSummary,
  type ProductionCohortAccount,
  type ProductionNetworkLedger,
} from "./production-cohort-helpers";
import {
  resolveProductionCohortDraftPayloadIdentity,
  resolveProductionFamilyContactReadback,
  resolveProductionLifecycleMarkerReadback,
} from "./production-export-a1-s1-helpers";
import {
  assertProductionFamilyContactWriteUnlock,
  loadOrCreateProductionFamilyContactState,
  productionFamilyContactRecoveryState,
  productionFamilyContactIssueMarker,
  requiredProductionFamilyContactCaseKey,
  saveProductionFamilyContactState,
  type ProductionFamilyContactState,
} from "./production-family-contact-helpers";
import {
  acquireProductionLifecycleLock,
  assertProductionLifecycleMutationAudit,
  createProductionMutationDiagnosticError,
  createProductionResponseDiagnosticError,
  evidenceDigest,
  productionDraftValueDigest,
  productionLifecycleMutationPayloadMismatchCode,
  productionLifecycleMutationPayloadMatches,
  runWithFailurePreservingCleanup,
  type ProductionDraftSnapshotMutationIntent,
  type ProductionLifecycleMutationContract,
} from "./production-lifecycle-helpers";
import { clickWorkspaceButton, isVisible } from "./ui-helpers";

const saveDraftRpcPath = "/rest/v1/rpc/save_agent_submission_if_current";
const submitCorrectionsRpcPath = "/rest/v1/rpc/save_agent_submission_if_current";
const familyEmailFieldId = "email";
const familyEmailFieldLabel = "Email";
const familyEmailSectionLabel = "Адрес и контакты";
const familyEmailIssueReason = "Требуется исправить поле «Email»";

type FamilySession = Awaited<ReturnType<typeof signInCohortAccount>> & {
  accountKey: string;
  context: BrowserContext;
  mutationGate: StrictFamilyContactMutationGate;
  role: "admin" | "agent";
};

type SessionEvidence = {
  accountKey: string;
  browserProblems: BrowserProblemEvidence;
  mutationSummary: CohortMutationSummary[];
  role: "admin" | "agent";
};

type FamilyEvidence = {
  caseKey: string;
  constraints: {
    directSupabaseWritesFromHarness: false;
    exactRegisteredCaseOnly: true;
    screenshotsPersisted: false;
    tracesPersisted: false;
    videosPersisted: false;
  };
  errorDigest?: string;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  result: "FAILED" | "PASS" | "RUNNING";
  runMarker: string;
  sessions: SessionEvidence[];
  stage?: ProductionFamilyContactState["stage"];
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class StrictFamilyContactMutationGate {
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
      if (isProductionRead || isPasswordLogin || isLocalStaticAsset) {
        if (isPasswordLogin) this.#authPasswordRequests += 1;
        await route.continue();
        return;
      }

      const active = this.#window;
      const isCandidate =
        active !== null &&
        method === "POST" &&
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        url.pathname === active.path &&
        active.observed === 0;
      const payloadMatches =
        isCandidate &&
        productionLifecycleMutationPayloadMatches(request.postData(), active.contract);
      if (isCandidate) {
        this.#diagnosticCode = payloadMatches
          ? "match"
          : productionLifecycleMutationPayloadMismatchCode(
              request.postData(),
              active.contract,
            );
      }
      const allowed = isCandidate && payloadMatches;
      if (!allowed) {
        this.#violations.push(
          evidenceDigest(
            `${method}:${url.origin}:${url.pathname}:${
              active ? "payload-contract" : "route-contract"
            }`,
          ),
        );
        await route.abort("blockedbyclient");
        return;
      }
      active.observed += 1;
      await route.continue();
    });
  }

  assertLoginCompleted() {
    invariant(
      this.#authPasswordRequests >= 1 && this.#authPasswordRequests <= 6,
      "Family-contact session must use bounded password authentication.",
    );
  }

  authAttemptCount() {
    return this.#authPasswordRequests;
  }

  diagnosticCode() {
    return this.#diagnosticCode;
  }

  begin(label: string, path: string, contract: ProductionLifecycleMutationContract) {
    invariant(!this.#window, "A family-contact mutation window is already active.");
    this.#diagnosticCode = "not_observed";
    this.#window = { contract, label, observed: 0, path };
  }

  finish(label: string) {
    const active = this.#window;
    this.#window = null;
    invariant(active?.label === label, "Family-contact mutation label mismatch.");
    invariant(
      active.observed === 1,
      `${label}: exactly one allowlisted production mutation must be sent.`,
    );
  }

  assertIdleAndClean() {
    invariant(!this.#window, "Family-contact mutation window remained active.");
    invariant(
      this.#violations.length === 0,
      "A non-allowlisted family-contact mutation was blocked before send.",
    );
  }
}

function baseUrl(testInfo: TestInfo) {
  const value = testInfo.project.use.baseURL;
  invariant(typeof value === "string" && value, "Production baseURL is required.");
  return value;
}

async function openSession(
  browser: Browser,
  testInfo: TestInfo,
  account: ProductionCohortAccount,
): Promise<FamilySession> {
  const context = await browser.newContext({
    baseURL: baseUrl(testInfo),
    serviceWorkers: "block",
    viewport: { height: 900, width: 1440 },
  });
  try {
    const mutationGate = new StrictFamilyContactMutationGate();
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

async function closeSession(session: FamilySession, evidence: FamilyEvidence) {
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

async function successfulProductionMutation(
  page: Page,
  ledger: ProductionNetworkLedger,
  mutationGate: StrictFamilyContactMutationGate,
  path: string,
  label: string,
  contract: ProductionLifecycleMutationContract,
  action: () => Promise<void>,
) {
  const checkpoint = ledger.checkpoint();
  mutationGate.begin(label, path, contract);
  let response;
  let operationFailure: unknown;
  let gateFailure: unknown;
  try {
    [response] = await Promise.all([
      page.waitForResponse(
        (candidate) => {
          const url = new URL(candidate.url());
          return (
            candidate.request().method() === "POST" &&
            url.origin === PRODUCTION_SUPABASE_ORIGIN &&
            url.pathname === path
          );
        },
        { timeout: 60_000 },
      ),
      action(),
    ]);
  } catch (error) {
    operationFailure = error;
  } finally {
    try {
      mutationGate.finish(label);
    } catch (error) {
      gateFailure = error;
    }
  }
  if (operationFailure) {
    const alerts = page.getByRole("alert");
    const alertTexts: string[] = [];
    for (let index = 0; index < (await alerts.count()); index += 1) {
      const alert = alerts.nth(index);
      if (!(await isVisible(alert))) continue;
      const text = (await alert.textContent())?.trim();
      if (text) alertTexts.push(text);
    }
    throw createProductionMutationDiagnosticError({
      alertTexts,
      gateCode: mutationGate.diagnosticCode(),
      gateMessage: gateFailure instanceof Error ? gateFailure.message : "none",
      label,
      operationMessage:
        operationFailure instanceof Error ? operationFailure.message : "none",
      phase: "action",
      remarkFormVisible: await isVisible(page.getByTestId("remark-form-submit")),
    });
  }
  if (gateFailure) throw gateFailure;
  invariant(response, `${label}: production response is absent.`);
  if (!response.ok()) {
    throw createProductionResponseDiagnosticError({
      label,
      responseBody: await response.text().catch(() => "unavailable"),
      status: response.status(),
    });
  }
  ledger.assertHealthySince(checkpoint, label);
}

function drawer(page: Page) {
  return page.locator('[role="dialog"]:visible').first();
}

async function waitForWorkspaceData(page: Page) {
  await expect(page.locator('[aria-label="Загрузка подач"]')).toHaveCount(0, {
    timeout: 120_000,
  });
  invariant(
    !(await isVisible(
      page
        .getByRole("alert")
        .filter({ hasText: /Не удалось загрузить подачи|Production data unavailable/i })
        .first(),
    )),
    "Production workspace data failed to load.",
  );
}

async function reloadWorkspace(session: FamilySession) {
  await session.page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    session.page.getByRole("heading", {
      level: 1,
      name:
        session.role === "admin"
          ? /^(Проверка|Очередь на проверку|Работа|Выгрузка)$/
          : /^(Мои действия|Мои подачи)$/,
    }),
  ).toBeVisible({ timeout: 120_000 });
  await waitForWorkspaceData(session.page);
}

function reviewCard(page: Page, submissionId: string) {
  return page
    .locator(
      ".v19-admin-review-card[data-submission-id]:visible, .v19-admin-cockpit-card[data-submission-id]:visible",
    )
    .filter({ hasText: submissionId })
    .first();
}

async function adminReviewPresence(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Проверка|Работа/);
  await waitForWorkspaceData(page);
  return isVisible(reviewCard(page, submissionId));
}

async function openAdminReviewDrawer(page: Page, submissionId: string) {
  invariant(
    await adminReviewPresence(page, submissionId),
    "Family-contact case is absent from admin Review.",
  );
  await reviewCard(page, submissionId).click();
  await expect(drawer(page)).toBeVisible();
  return drawer(page);
}

async function openDrawerTab(root: Locator, name: RegExp) {
  const roleTab = root.getByRole("tab", { name }).first();
  const control = (await isVisible(roleTab))
    ? roleTab
    : root.getByRole("button", { name }).first();
  await expect(control).toBeVisible();
  await control.click();
}

async function openAgentSubmissionDrawer(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Мои подачи/);
  await waitForWorkspaceData(page);
  const card = page.locator(`[data-submission-id="${submissionId}"]:visible`).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(drawer(page)).toBeVisible();
  return drawer(page);
}

function familySnapshotMutationIntent(
  state: ProductionFamilyContactState,
  applicantId: string,
  mode: "add_issue" | "mark_issue_fixed",
): ProductionDraftSnapshotMutationIntent {
  return {
    applicantId,
    comment: productionFamilyContactIssueMarker(state),
    fieldId: familyEmailFieldId,
    fieldLabel: familyEmailFieldLabel,
    mode,
    reason: familyEmailIssueReason,
  };
}

type FamilyMutationExpectation = {
  actorSource: "admin" | "agent";
  correctionMode: "append" | "existing";
  emailReplacement?: { applicantId: string; email: string };
  snapshotMutation?: "add_issue" | "mark_issue_fixed";
  snapshotStatus: ProductionLifecycleMutationContract["history"]["snapshotStatus"];
  transition?: NonNullable<
    ProductionLifecycleMutationContract["history"]["transition"]
  >;
};

function mutationTimestampWindow() {
  const now = Date.now();
  return {
    notAfter: new Date(now + 120_000).toISOString(),
    notBefore: new Date(now - 1_000).toISOString(),
  };
}

async function familyMutationContract(
  state: ProductionFamilyContactState,
  submissionStatus: ProductionLifecycleMutationContract["submissionStatus"],
  correctionStatus: ProductionLifecycleMutationContract["correction"]["status"],
  expectation: FamilyMutationExpectation,
) {
  const accounts = loadProductionCohortAccounts();
  const owner = accounts.agents.find((account) => account.key === state.case.ownerKey);
  invariant(owner, "Family-contact owner account is absent.");
  const actorId =
    expectation.actorSource === "admin" ? accounts.admin.authUserId : owner.authUserId;
  const baseline = await resolveProductionCohortDraftPayloadIdentity({
    admin: accounts.admin,
    applicantEmailReplacement: expectation.emailReplacement,
    applicantSerializerProjection: {
      actorId,
      allowedDriftFields: ["email", "questionnaire_percent"],
    },
    correctionMarker: productionFamilyContactIssueMarker(state),
    expectedApplicantCount: 6,
    ownerId: owner.authUserId,
    questionnaireSerializerProjection: {
      allowedLabelDriftFieldIds: ["hotel-name"],
    },
    submissionId: state.case.submissionId,
  });
  const issueApplicantId = baseline.applicantIdsInSnapshotOrder[0];
  invariant(issueApplicantId, "Family-contact issue applicant cannot be resolved.");
  const snapshotMutationIntent = expectation.snapshotMutation
    ? familySnapshotMutationIntent(
        state,
        issueApplicantId,
        expectation.snapshotMutation,
      )
    : undefined;
  const submissionProjectionIntent = snapshotMutationIntent
    ? {
        actorId,
        intent: snapshotMutationIntent,
        mode: "snapshot_mutation" as const,
      }
    : expectation.emailReplacement
      ? {
          actorId,
          applicantId: expectation.emailReplacement.applicantId,
          fieldId: "email" as const,
          mode: "questionnaire_replace" as const,
          value: expectation.emailReplacement.email,
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
          : undefined;
  const resolved = submissionProjectionIntent
    ? await resolveProductionCohortDraftPayloadIdentity({
        admin: accounts.admin,
        applicantEmailReplacement: expectation.emailReplacement,
        applicantSerializerProjection: {
          actorId,
          allowedDriftFields: ["email", "questionnaire_percent"],
        },
        correctionMarker: productionFamilyContactIssueMarker(state),
        expectedApplicantCount: 6,
        ownerId: owner.authUserId,
        questionnaireSerializerProjection: {
          allowedLabelDriftFieldIds: ["hotel-name"],
        },
        snapshotMutationIntent,
        submissionProjectionIntent,
        submissionId: state.case.submissionId,
      })
    : baseline;
  let questionnaire: ProductionLifecycleMutationContract["questionnaire"] = {
    mode: "exact",
  };
  if (expectation.emailReplacement) {
    const target = resolved.draft.questionnaireAnswers.filter(
      (answer) =>
        answer.applicantId === expectation.emailReplacement?.applicantId &&
        answer.fieldId === familyEmailFieldId,
    );
    const expectedValueDigest = productionDraftValueDigest(
      expectation.emailReplacement.email,
    );
    invariant(
      target.length === 1 && expectedValueDigest,
      "Family-contact replacement must resolve one exact personal Email field.",
    );
    questionnaire = {
      applicantId: target[0]!.applicantId,
      expectedValueDigest,
      fieldId: target[0]!.fieldId,
      mode: "replace",
      sectionId: target[0]!.sectionId,
    };
  }
  return {
    applicantIdsInSnapshotOrder: resolved.applicantIdsInSnapshotOrder,
    contract: {
      applicantProjection: resolved.applicantProjection ?? { mode: "exact" },
      correction: {
        ...(expectation.correctionMode === "append"
          ? {
              applicantId: issueApplicantId,
              baseReason: familyEmailIssueReason,
              fieldKey: familyEmailFieldLabel,
            }
          : {}),
        mode: expectation.correctionMode,
        reasonIncludes: productionFamilyContactIssueMarker(state),
        status: correctionStatus,
      },
      draft: resolved.draft,
      history: {
        actorId,
        actorSource: expectation.actorSource,
        snapshotStatus: expectation.snapshotStatus,
        transition: resolved.historyTransition ?? expectation.transition,
      },
      historyProjection: resolved.historyProjection,
      mode: "lifecycle",
      ownerId: owner.authUserId,
      questionnaire,
      questionnaireProjection: resolved.questionnaireProjection,
      snapshotMutation: resolved.snapshotMutation,
      snapshotHistoryProjection: resolved.snapshotHistoryProjection,
      snapshotProjection: resolved.snapshotProjection,
      submissionId: state.case.submissionId,
      submissionProjection: resolved.submissionProjection,
      submissionStatus,
      timestampWindow: mutationTimestampWindow(),
    } satisfies ProductionLifecycleMutationContract,
  };
}

async function familyMarkerIssueExists(state: ProductionFamilyContactState) {
  const accounts = loadProductionCohortAccounts();
  const owner = accounts.agents.find((account) => account.key === state.case.ownerKey);
  invariant(owner, "Family-contact owner account is absent for marker readback.");
  const resolved = await resolveProductionCohortDraftPayloadIdentity({
    admin: accounts.admin,
    correctionMarker: productionFamilyContactIssueMarker(state),
    expectedApplicantCount: 6,
    ownerId: owner.authUserId,
    submissionId: state.case.submissionId,
  });
  const markers = resolved.draft.corrections.filter(
    (correction) => correction.targetMarker,
  );
  invariant(markers.length <= 1, "Family-contact marker issue is duplicated.");
  return markers.length === 1;
}

async function addFamilyContactIssue(
  session: FamilySession,
  state: ProductionFamilyContactState,
) {
  const mutation = await familyMutationContract(state, "waiting_review", "open", {
    actorSource: "admin",
    correctionMode: "append",
    snapshotMutation: "add_issue",
    snapshotStatus: "submitted_for_review",
  });
  const root = drawer(session.page);
  await openDrawerTab(root, /Анкета/);
  const applicantTrigger = root.getByRole("button", {
    name: /^Выбранный заявитель:/,
  });
  await expect(applicantTrigger).toBeVisible();
  await applicantTrigger.click();
  const applicantListbox = root.getByRole("listbox", {
    name: "Выберите заявителя",
  });
  await expect(applicantListbox.getByRole("option")).toHaveCount(
    mutation.applicantIdsInSnapshotOrder.length,
  );
  await expect(applicantListbox.getByRole("option", { selected: true })).toHaveCount(1);
  await applicantTrigger.click();
  const section = root
    .locator(".admin-review-field-section")
    .filter({ hasText: familyEmailSectionLabel })
    .first();
  if (!(await section.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await section.locator("summary").click();
  }
  const emailRow = section
    .locator('.admin-review-field-row:has(.admin-review-row-label:text-is("Email"))')
    .first();
  const addRemark = emailRow.getByRole("button", {
    name: `Добавить замечание: ${familyEmailFieldLabel}`,
  });
  await expect(addRemark).toBeVisible();
  await addRemark.click();
  const remark = session.page
    .getByRole("dialog")
    .filter({ hasText: "Добавить замечание" })
    .last();
  await expect(remark).toBeVisible();
  await remark.getByRole("button", { exact: true, name: "Критично" }).click();
  await remark
    .getByPlaceholder("Опишите, что именно нужно исправить...")
    .fill(productionFamilyContactIssueMarker(state));
  state.stage = "adding_issue";
  await saveProductionFamilyContactState(state);
  await successfulProductionMutation(
    session.page,
    session.ledger,
    session.mutationGate,
    saveDraftRpcPath,
    "add exact family-contact issue",
    mutation.contract,
    () => remark.getByRole("button", { name: "Отправить замечание" }).click(),
  );
  state.stage = "issue_added";
  await saveProductionFamilyContactState(state);
}

async function ensureAdminReturned(input: {
  admin: ProductionCohortAccount;
  browser: Browser;
  evidence: FamilyEvidence;
  state: ProductionFamilyContactState;
  testInfo: TestInfo;
}) {
  const { admin, browser, evidence, state, testInfo } = input;
  if (
    !["pending_review", "adding_issue", "issue_added", "returning"].includes(
      state.stage,
    )
  ) {
    return;
  }
  const session = await openSession(browser, testInfo, admin);
  await runWithFailurePreservingCleanup(
    async () => {
      const inReview = await adminReviewPresence(session.page, state.case.submissionId);
      if (!inReview) {
        invariant(
          state.stage === "returning",
          "Family-contact case left Review without a saved return intent.",
        );
        state.stage = "returned";
        await saveProductionFamilyContactState(state);
        return;
      }
      let root = await openAdminReviewDrawer(session.page, state.case.submissionId);
      if (["pending_review", "adding_issue"].includes(state.stage)) {
        const issueAlreadyExists = await familyMarkerIssueExists(state);
        if (issueAlreadyExists) {
          state.stage = "issue_added";
          await saveProductionFamilyContactState(state);
        } else {
          await addFamilyContactIssue(session, state);
          await reloadWorkspace(session);
          root = await openAdminReviewDrawer(session.page, state.case.submissionId);
        }
      }
      await openDrawerTab(root, /Анкета/);
      await expect(
        root.getByRole("button", { name: /\d+ замечани(?:е|я|й)/i }).first(),
      ).toBeVisible();
      const returnButton = root.getByRole("button", {
        exact: true,
        name: "Отправить на исправление",
      });
      await expect(returnButton).toBeEnabled();
      const mutation = await familyMutationContract(state, "returned", "open", {
        actorSource: "admin",
        correctionMode: "existing",
        snapshotStatus: "returned",
        transition: {
          comment:
            "Статус изменен: Возвращено: Администратор вернул подачу с замечаниями",
          fromStatus: "submitted_for_review",
          note: "Администратор вернул подачу с замечаниями",
          toStatus: "returned",
        },
      });
      state.stage = "returning";
      await saveProductionFamilyContactState(state);
      await successfulProductionMutation(
        session.page,
        session.ledger,
        session.mutationGate,
        saveDraftRpcPath,
        "return family contact for correction",
        mutation.contract,
        () => returnButton.click(),
      );
      state.stage = "returned";
      await saveProductionFamilyContactState(state);
    },
    () => closeSession(session, evidence),
  );
}

async function openFamilyIssueQuestionnaire(
  session: FamilySession,
  state: ProductionFamilyContactState,
) {
  const root = await openAgentSubmissionDrawer(session.page, state.case.submissionId);
  await openDrawerTab(root, /Замечания/);
  const issueCard = root
    .locator(".v20-issue-card, .v19-drawer-issue-card, article")
    .filter({ hasText: productionFamilyContactIssueMarker(state) })
    .first();
  await expect(issueCard).toBeVisible();
  const issueIsFixed = await isVisible(
    issueCard.getByText(/Исправлено|Ждет проверки/).first(),
  );
  let open: Locator;
  if (issueIsFixed) {
    await openDrawerTab(root, /Анкета/);
    open = root
      .getByRole("button", {
        name: /^(?:Открыть|Смотреть|Исправить) анкету$/,
      })
      .first();
  } else {
    open = issueCard
      .getByRole("button", { name: /Открыть|Исправить в анкете|Исправить/ })
      .first();
  }
  await expect(open).toBeVisible();
  await open.click();
  const questionnaire = session.page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  return { issueCard, questionnaire };
}

async function selectQuestionnaireSection(questionnaire: Locator, name: RegExp) {
  const section = questionnaire
    .locator(".v19-questionnaire-section-tab:visible")
    .filter({ hasText: name })
    .first();
  await expect(section).toBeVisible();
  await section.click();
}

async function resolveFamilyContactRecoveryState(state: ProductionFamilyContactState) {
  const accounts = loadProductionCohortAccounts();
  const cohortCase = buildProductionCohortPlan(state.runMarker).find(
    (candidate) => candidate.caseKey === state.case.caseKey,
  );
  invariant(cohortCase, "Family-contact cohort case is absent from the plan.");
  const contact = await resolveProductionFamilyContactReadback({
    admin: accounts.admin,
    expectedEmail: productionCohortContactEmail(cohortCase, 0),
    expectedIssueReason: familyEmailIssueReason,
    submissionId: state.case.submissionId,
  });
  const lifecycle = await resolveProductionLifecycleMarkerReadback({
    admin: accounts.admin,
    marker: productionFamilyContactIssueMarker(state),
    submissionId: state.case.submissionId,
  });
  return productionFamilyContactRecoveryState({
    contact,
    lifecycle,
  });
}

async function ensureAgentCorrectedAndResubmitted(input: {
  applicantIds: string[];
  browser: Browser;
  evidence: FamilyEvidence;
  owner: ProductionCohortAccount;
  state: ProductionFamilyContactState;
  testInfo: TestInfo;
}) {
  const { applicantIds, browser, evidence, owner, state, testInfo } = input;
  if (state.stage === "verified") return;
  if (["resubmitting", "resubmitted"].includes(state.stage)) {
    const recoveryState = await resolveFamilyContactRecoveryState(state);
    if (recoveryState === "returned") {
      state.stage = "agent_fixed";
      await saveProductionFamilyContactState(state);
    } else {
      invariant(
        recoveryState === "resubmitted",
        "Family-contact resumable checkpoint is not proven by exact durable readback.",
      );
      state.nextApplicantIndex = 6;
      state.stage = "resubmitted";
      await saveProductionFamilyContactState(state);
      return;
    }
  }
  const session = await openSession(browser, testInfo, owner);
  await runWithFailurePreservingCleanup(
    async () => {
      const { questionnaire } = await openFamilyIssueQuestionnaire(session, state);
      const cohortCase = buildProductionCohortPlan(state.runMarker).find(
        (candidate) => candidate.caseKey === state.case.caseKey,
      );
      invariant(cohortCase, "Family-contact cohort case is absent from the plan.");
      const canonicalEmail = productionCohortContactEmail(cohortCase, 0);
      const applicantTabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
      await expect(applicantTabs).toHaveCount(6);

      while (state.nextApplicantIndex < 6) {
        const index = state.nextApplicantIndex;
        const applicantId = applicantIds[index];
        invariant(applicantId, "Family-contact applicant order is incomplete.");
        await applicantTabs.nth(index).click();
        await selectQuestionnaireSection(questionnaire, /Адрес и контакты/);
        const emailField = questionnaire
          .locator(`[data-field-label="${familyEmailFieldLabel}"]`)
          .first();
        const emailControl = emailField
          .locator("input:not([readonly]), textarea:not([readonly])")
          .first();
        await expect(emailControl).toBeVisible();
        if ((await emailControl.inputValue()) !== canonicalEmail) {
          const mutation = await familyMutationContract(state, "returned", "open", {
            actorSource: "agent",
            correctionMode: "existing",
            emailReplacement: { applicantId, email: canonicalEmail },
            snapshotStatus: "returned",
          });
          state.stage = "correcting_emails";
          await saveProductionFamilyContactState(state);
          await successfulProductionMutation(
            session.page,
            session.ledger,
            session.mutationGate,
            saveDraftRpcPath,
            `replace family contact email ${index + 1} of 6`,
            mutation.contract,
            async () => {
              await emailControl.fill(canonicalEmail);
              await emailControl.press("Tab");
            },
          );
          await expect(
            questionnaire.locator('.v19-questionnaire-screen-header [role="status"]'),
          ).toContainText("Сохранено", { timeout: 45_000 });
        }
        state.nextApplicantIndex = index + 1;
        await saveProductionFamilyContactState(state);
      }

      await questionnaire.getByRole("button", { name: "Назад" }).click();
      const root = await openAgentSubmissionDrawer(
        session.page,
        state.case.submissionId,
      );
      await openDrawerTab(root, /Замечания/);
      const issueCard = root
        .locator(".v20-issue-card, .v19-drawer-issue-card, article")
        .filter({ hasText: productionFamilyContactIssueMarker(state) })
        .first();
      const markFixed = issueCard.getByRole("button", {
        name: /^(?:Отметить|Пометить) исправленным$/,
      });
      const alreadyFixed = await isVisible(
        issueCard.getByText(/Исправлено|Ждет проверки/i).first(),
      );
      if (!alreadyFixed) {
        await expect(markFixed).toBeVisible();
        const mutation = await familyMutationContract(state, "returned", "fixed", {
          actorSource: "agent",
          correctionMode: "existing",
          snapshotMutation: "mark_issue_fixed",
          snapshotStatus: "returned",
        });
        state.stage = "marking_issue_fixed";
        await saveProductionFamilyContactState(state);
        await successfulProductionMutation(
          session.page,
          session.ledger,
          session.mutationGate,
          saveDraftRpcPath,
          "mark family-contact issue fixed",
          mutation.contract,
          () => markFixed.click(),
        );
      }
      state.stage = "agent_fixed";
      await saveProductionFamilyContactState(state);
      await root.getByLabel("Закрыть", { exact: true }).click();

      const reopened = await openFamilyIssueQuestionnaire(session, state);
      const resubmit = reopened.questionnaire.getByRole("button", {
        name: "Отправить исправления",
      });
      await expect(resubmit).toBeEnabled();
      const mutation = await familyMutationContract(state, "waiting_review", "fixed", {
        actorSource: "agent",
        correctionMode: "existing",
        snapshotStatus: "corrections_received",
        transition: {
          comment: "Статус изменен: Исправления получены: Агент отправил исправления",
          fromStatus: "returned",
          note: "Агент отправил исправления",
          toStatus: "corrections_received",
        },
      });
      state.stage = "resubmitting";
      await saveProductionFamilyContactState(state);
      await successfulProductionMutation(
        session.page,
        session.ledger,
        session.mutationGate,
        submitCorrectionsRpcPath,
        "resubmit corrected family contact",
        mutation.contract,
        () => resubmit.click(),
      );
      invariant(
        (await resolveFamilyContactRecoveryState(state)) === "resubmitted",
        "Family-contact resubmission was not proven by exact durable readback.",
      );
      state.stage = "resubmitted";
      await saveProductionFamilyContactState(state);
      await expect(
        reopened.questionnaire.getByTestId("questionnaire-read-only-status"),
      ).toContainText("Исправления на проверке", { timeout: 60_000 });
    },
    () => closeSession(session, evidence),
  );
}

async function verifyFamilyContactReadBack(input: {
  browser: Browser;
  evidence: FamilyEvidence;
  owner: ProductionCohortAccount;
  state: ProductionFamilyContactState;
  testInfo: TestInfo;
}) {
  const { browser, evidence, owner, state, testInfo } = input;
  invariant(
    (await resolveFamilyContactRecoveryState(state)) === "resubmitted",
    "Family-contact verification requires exact durable readback.",
  );
  const session = await openSession(browser, testInfo, owner);
  await runWithFailurePreservingCleanup(
    async () => {
      const canonicalEmail = `v19qa.${state.case.caseKey.toLowerCase()}.family@example.invalid`;
      const root = await openAgentSubmissionDrawer(
        session.page,
        state.case.submissionId,
      );
      await openDrawerTab(root, /Анкета/);
      await root
        .getByRole("button", {
          name: /^(?:Открыть|Смотреть|Исправить) анкету$/,
        })
        .first()
        .click();
      const questionnaire = session.page
        .locator(".vf-figma-questionnaire-screen")
        .first();
      const tabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
      await expect(tabs).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        await tabs.nth(index).click();
        await selectQuestionnaireSection(questionnaire, /Адрес и контакты/);
        await expect(
          questionnaire
            .locator(`[data-field-label="${familyEmailFieldLabel}"]`)
            .first()
            .locator("input, textarea")
            .first(),
        ).toHaveValue(canonicalEmail);
      }
      state.stage = "verified";
      await saveProductionFamilyContactState(state);
    },
    () => closeSession(session, evidence),
  );
}

async function assertFamilyContractPreflight(state: ProductionFamilyContactState) {
  const accounts = loadProductionCohortAccounts();
  const owner = accounts.agents.find((account) => account.key === state.case.ownerKey);
  invariant(owner, "Family-contact owner account is absent in preflight.");
  const resolved = await resolveProductionCohortDraftPayloadIdentity({
    admin: accounts.admin,
    correctionMarker: productionFamilyContactIssueMarker(state),
    expectedApplicantCount: 6,
    ownerId: owner.authUserId,
    submissionId: state.case.submissionId,
  });
  invariant(
    resolved.applicantIdsInSnapshotOrder.length === 6 &&
      resolved.draft.applicants.length === 6 &&
      resolved.draft.mediaAssets.length === 18 &&
      resolved.draft.questionnaireAnswers.length === 462 &&
      resolved.applicantIdsInSnapshotOrder.every(
        (applicantId) =>
          resolved.draft.questionnaireAnswers.filter(
            (answer) =>
              answer.applicantId === applicantId &&
              answer.fieldId === familyEmailFieldId,
          ).length === 1,
      ),
    "Family-contact read-only preflight did not resolve the exact 6/18/462 contract.",
  );
  return resolved.applicantIdsInSnapshotOrder;
}

async function assertAdminFamilyContactTargetPreflight(input: {
  admin: ProductionCohortAccount;
  applicantIds: string[];
  browser: Browser;
  evidence: FamilyEvidence;
  state: ProductionFamilyContactState;
  testInfo: TestInfo;
}) {
  const { admin, applicantIds, browser, evidence, state, testInfo } = input;
  const session = await openSession(browser, testInfo, admin);
  await runWithFailurePreservingCleanup(
    async () => {
      const root = await openAdminReviewDrawer(session.page, state.case.submissionId);
      await openDrawerTab(root, /Анкета/);
      const applicantTrigger = root.getByRole("button", {
        name: /^Выбранный заявитель:/,
      });
      await expect(applicantTrigger).toBeVisible();
      await applicantTrigger.click();
      const applicantListbox = root.getByRole("listbox", {
        name: "Выберите заявителя",
      });
      await expect(applicantListbox.getByRole("option")).toHaveCount(
        applicantIds.length,
      );
      await expect(
        applicantListbox.getByRole("option", { selected: true }),
      ).toHaveCount(1);
      await applicantTrigger.click();
      const section = root
        .locator(".admin-review-field-section")
        .filter({ hasText: familyEmailSectionLabel })
        .first();
      if (
        !(await section.evaluate((element) => (element as HTMLDetailsElement).open))
      ) {
        await section.locator("summary").click();
      }
      const emailRow = section
        .locator(
          '.admin-review-field-row:has(.admin-review-row-label:text-is("Email"))',
        )
        .first();
      await expect(emailRow).toBeVisible();
      if (["pending_review", "adding_issue"].includes(state.stage)) {
        await expect(
          emailRow.getByRole("button", {
            name: `Добавить замечание: ${familyEmailFieldLabel}`,
          }),
        ).toBeVisible();
      } else {
        await expect(emailRow).toHaveAttribute("data-review-state", "error");
      }
    },
    () => closeSession(session, evidence),
  );
}

test.describe("production family contact remediation", () => {
  test("repairs one exact registered technical family through UI lifecycle", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(1_800_000);
    assertProductionFamilyContactWriteUnlock();
    const runMarker = requiredProductionRunMarker();
    const caseKey = requiredProductionFamilyContactCaseKey();
    const accounts = loadProductionCohortAccounts();
    const evidence: FamilyEvidence = {
      caseKey,
      constraints: {
        directSupabaseWritesFromHarness: false,
        exactRegisteredCaseOnly: true,
        screenshotsPersisted: false,
        tracesPersisted: false,
        videosPersisted: false,
      },
      projectRef: PRODUCTION_PROJECT_REF,
      result: "RUNNING",
      runMarker,
      sessions: [],
    };
    let releaseLock: (() => Promise<void>) | undefined;
    let state: ProductionFamilyContactState | undefined;
    try {
      releaseLock = await acquireProductionLifecycleLock(runMarker);
      const resolved = await loadOrCreateProductionFamilyContactState();
      state = resolved.state;
      const owner = accounts.agents.find(
        (account) => account.key === state?.case.ownerKey,
      );
      invariant(owner, "Family-contact owner account is absent.");
      const applicantIds = await assertFamilyContractPreflight(state);
      if (
        ["pending_review", "adding_issue", "issue_added", "returning"].includes(
          state.stage,
        )
      ) {
        await assertAdminFamilyContactTargetPreflight({
          admin: accounts.admin,
          applicantIds,
          browser,
          evidence,
          state,
          testInfo,
        });
      }
      if (process.env.V19_PRODUCTION_FAMILY_CONTACT_PREFLIGHT_ONLY === "1") {
        evidence.result = "PASS";
        evidence.stage = state.stage;
        return;
      }
      await ensureAdminReturned({
        admin: accounts.admin,
        browser,
        evidence,
        state,
        testInfo,
      });
      await ensureAgentCorrectedAndResubmitted({
        applicantIds,
        browser,
        evidence,
        owner,
        state,
        testInfo,
      });
      await verifyFamilyContactReadBack({
        browser,
        evidence,
        owner,
        state,
        testInfo,
      });
      evidence.result = "PASS";
      evidence.stage = state.stage;
    } catch (error) {
      evidence.result = "FAILED";
      evidence.stage = state?.stage;
      evidence.errorDigest = evidenceDigest(
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      await releaseLock?.();
      await testInfo.attach("production-family-contact-evidence", {
        body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
        contentType: "application/json",
      });
    }
  });
});
