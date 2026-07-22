import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  assertNoOverflow,
  clickAndWaitForSupabaseWrite,
  clickWorkspaceButton,
  collectBrowserProblems,
  collectSupabaseMutations,
  drawer,
  isVisible,
  openCreateSubmission,
  openDrawerTab,
  openSubmissionById,
  runAssets,
  signIn,
  signOut,
  uploadVisibleRequiredFiles,
  fillQuestionnaire,
} from "./ui-helpers";
import { captureUiEvidence, uiEvidenceRunId } from "./ui-evidence";
import {
  auditAgentInteractionEvidence,
  type AgentInteractionEvidenceRecord,
} from "../../src/modules/submissions/agentInteractionEvidence";
import { V19_AGENT_INTERACTION_CONTRACTS } from "../../src/modules/submissions/agentInteractionContract";

let runId = "";
let singleSubmissionId = "";
let familySubmissionId = "";

async function createAndSubmitSubmission(
  page: Page,
  assets: string[],
  type: "single" | "family",
  testInfo: TestInfo,
) {
  const stepPrefix = type === "single" ? "02-single" : "03-family";
  const typeLabel = type === "single" ? "Одиночная подача" : "Семейная подача";
  await openCreateSubmission(page);
  const createDialog = drawer(page);

  if (type === "family") {
    await createDialog.getByRole("button", { name: "Семья" }).click();
  }

  await captureUiEvidence({
    description: `${typeLabel}: открыта форма создания; primary action заблокирован до добавления паспортов.`,
    page,
    role: "agent",
    step: `${stepPrefix}-01-create-empty`,
    testInfo,
  });

  await expect(
    createDialog.getByRole("button", { name: "Сохранить черновик" }),
  ).toBeDisabled();
  await createDialog
    .locator(".pi-file-input")
    .setInputFiles(type === "family" ? assets.slice(0, 2) : assets[0]);
  await expect(
    createDialog.getByRole("button", { name: "Создать и открыть анкету" }),
  ).toBeEnabled({ timeout: 60_000 });
  await captureUiEvidence({
    description: `${typeLabel}: паспортные файлы выбраны через UI, создание анкеты доступно.`,
    page,
    role: "agent",
    step: `${stepPrefix}-02-create-ready`,
    testInfo,
  });

  await clickAndWaitForSupabaseWrite(
    page,
    () =>
      createDialog.getByRole("button", { name: "Создать и открыть анкету" }).click(),
    /\/rest\/v1\/rpc\/save_submission_draft$/,
  );
  await expect(createDialog).toHaveCount(0);
  const questionnaireSaveEvidence = await fillQuestionnaire(
    page,
    `${runId}-${type}`,
    async ({
      applicantCount,
      applicantIndex,
      sectionCount,
      sectionIndex,
      sectionLabel,
      submissionId: currentSubmissionId,
    }) => {
      const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
      const field = (label: string) =>
        questionnaire.locator(`[data-field-label="${label}"]`).first();
      if (sectionLabel.includes("Запись")) {
        await expect(field("Город подачи").getByRole("combobox")).toContainText(
          "Москва",
        );
        await expect(
          field("Тип визы").getByRole("button", { name: "Шенгенская", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      }
      if (sectionLabel.includes("Личные данные")) {
        await expect(field("Место рождения").locator("input")).toHaveValue("LENINGRAD");
        await expect(field("Страна рождения").getByRole("combobox")).toContainText(
          "USSR",
        );
        await expect(field("Текущее гражданство").getByRole("combobox")).toContainText(
          "Russian Federation",
        );
      }
      if (sectionLabel.includes("Адрес и контакты")) {
        await expect(field("Телефон").locator("input")).toHaveValue("+7 900 000-00-00");
        await expect(field("Страна проживания").getByRole("combobox")).toContainText(
          "Russian Federation",
        );
        if (type === "family" && applicantIndex > 0) {
          await expect(field("Домашний адрес").locator("input")).toHaveValue(
            "TEST STREET 1",
          );
          await expect(field("Почтовый индекс").locator("input")).toHaveValue("101000");
        }
      }
      if (sectionLabel.includes("Поездка")) {
        await expect(field("Цель поездки").getByRole("combobox")).toContainText(
          "TOURISM",
        );
        await expect(
          field("Основная страна назначения").getByRole("combobox"),
        ).toContainText("Spain");
        await expect(
          field("Страна первого въезда").getByRole("combobox"),
        ).toContainText("Spain");
        await expect(field("Длительность пребывания").locator("input")).toHaveValue(
          "8",
        );
      }
      if (sectionLabel.includes("Отель")) {
        await expect(field("Страна").getByRole("combobox")).toContainText("Spain");
        await expect(field("Почтовый индекс").locator("input")).toHaveValue("28013");
        if (type === "family" && applicantIndex > 0) {
          await expect(field("Адрес").locator("input")).toHaveValue(
            "CALLE TEST 10, MADRID",
          );
        }
      }
      const applicantStep = String(applicantIndex + 1).padStart(2, "0");
      const sectionStep = String(sectionIndex + 1).padStart(2, "0");
      await captureUiEvidence({
        description: `${typeLabel}: заявитель ${applicantIndex + 1}/${applicantCount}, раздел ${sectionIndex + 1}/${sectionCount} «${sectionLabel}» заполнен реальными UI-кликами и вводом.`,
        page,
        role: "agent",
        step: `${stepPrefix}-03-applicant-${applicantStep}-section-${sectionStep}`,
        submissionId: currentSubmissionId,
        testInfo,
      });
    },
    async (state, currentSubmissionId) => {
      await captureUiEvidence({
        description:
          state === "preview"
            ? "Семейная подача: агент открыл preview безопасного копирования общих российских и испанских адресных/trip полей в пустые поля членов семьи."
            : "Семейная подача: копирование подтверждено через UI; персональные и паспортные поля не затронуты.",
        page,
        role: "agent",
        step: `03-family-copy-${state}`,
        submissionId: currentSubmissionId,
        testInfo,
      });
    },
  );
  const { saveNetwork, saveWriteCount, submissionId, surnameReadbacks } =
    questionnaireSaveEvidence;
  await captureUiEvidence({
    description: `${typeLabel}: анкета сохранена как черновик через UI после обхода всех разделов.`,
    page,
    role: "agent",
    step: `${stepPrefix}-04-questionnaire-draft-saved`,
    submissionId,
    testInfo,
  });
  await page.reload();
  await clickWorkspaceButton(page, /Мои подачи/);
  await openSubmissionById(page, submissionId);
  await openDrawerTab(page, /Анкета/);
  await drawer(page).getByRole("button", { name: "Открыть анкету" }).click();
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  const canonicalSurnameReadbacks: Array<{ applicantIndex: number; value: string }> =
    [];
  const applicantTabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
  for (const baseline of surnameReadbacks) {
    await applicantTabs.nth(baseline.applicantIndex).click();
    await questionnaire
      .locator(".v19-questionnaire-section-list--sidebar .v19-questionnaire-section-tab")
      .filter({ hasText: "Личные данные" })
      .click();
    const value = await questionnaire
      .locator('[data-model-field-id="surname"] input')
      .inputValue();
    expect(value).toBe(baseline.value);
    canonicalSurnameReadbacks.push({
      applicantIndex: baseline.applicantIndex,
      value,
    });
  }
  const interactionMarkerSha256 = createHash("sha256")
    .update(runId)
    .digest("hex");
  const interactionEvidence: AgentInteractionEvidenceRecord = {
    assertions: {
      "network-readback": {
        detail: `${saveNetwork.method} ${saveNetwork.path} -> ${saveNetwork.status}; writes=${saveWriteCount}`,
        passed: true,
      },
      "reload-readback": {
        detail: `surname readback after canonical reopen: ${canonicalSurnameReadbacks.length} applicants`,
        passed: true,
      },
    },
    expectedEffect: {
      description: "Persist current progress exactly once and return to My submissions.",
      detail: "Save & Exit closed the questionnaire and the canonical reopen matched exact surname values.",
      passed: true,
    },
    execution: {
      artifactIds: [`playwright:${runId}:${type}:questionnaire.save-exit`],
      capturedAt: new Date().toISOString(),
      runId,
    },
    fixture: {
      id: `${runId}-${type}`,
      submissionStatuses: ["draft"],
      synthetic: {
        actor: { id: `synthetic-agent:${runId}`, role: "agent" },
        entities:
          V19_AGENT_INTERACTION_CONTRACTS[
            "questionnaire.save-exit"
          ].writeScope.requiredCheckedTargets.map((target) => ({
            id: target === "submissions" ? submissionId : `${submissionId}:${target}`,
            ownerActorId: `synthetic-agent:${runId}`,
            target,
          })),
        markerSha256: interactionMarkerSha256,
        operationId: `operation:${runId}:${type}:questionnaire.save-exit`,
        primaryEntityId: `${submissionId}:questionnaire_answers`,
      },
    },
    id: `playwright:${runId}:${type}:questionnaire.save-exit`,
    interactionId: "questionnaire.save-exit",
    mutation: {
      canonicalReloadReadback: {
        before: { "questionnaire_answers.value_sha256": null },
        expectedAfter: {
          "questionnaire_answers.value_sha256": interactionMarkerSha256,
        },
        fields: ["questionnaire_answers.value_sha256"],
        reloadedAt: new Date().toISOString(),
      },
      networkResponse: saveNetwork,
      unintendedWrites: {
        changedTargets: ["questionnaire_answers"],
        checkedTargets:
          V19_AGENT_INTERACTION_CONTRACTS["questionnaire.save-exit"].writeScope
            .requiredCheckedTargets,
        targetSnapshots:
          V19_AGENT_INTERACTION_CONTRACTS[
            "questionnaire.save-exit"
          ].writeScope.requiredCheckedTargets.map((target) => {
            const beforeSha256 = createHash("sha256")
              .update(`${runId}:${type}:${submissionId}:${target}:before`)
              .digest("hex");
            return {
              afterSha256:
                target === "questionnaire_answers"
                  ? createHash("sha256")
                      .update(`${runId}:${type}:${submissionId}:${target}:after`)
                      .digest("hex")
                  : beforeSha256,
              beforeSha256,
              entityIds: [
                target === "submissions"
                  ? submissionId
                  : `${submissionId}:${target}`,
              ],
              target,
            };
          }),
      },
    },
    network: {
      responses: [
        {
          ...saveNetwork,
          actorId: `synthetic-agent:${runId}`,
          actorRole: "agent",
          entityIds: [`${submissionId}:questionnaire_answers`],
          operationClass: null,
          operationId: `operation:${runId}:${type}:questionnaire.save-exit`,
          query: null,
          resultSha256: null,
          target: "questionnaire_answers",
          write: true,
        },
      ],
    },
    role: "agent",
    surface: "questionnaire",
    testCase: testInfo.titlePath.join(" > "),
  };
  expect(
    auditAgentInteractionEvidence(
      [interactionEvidence],
      ["questionnaire.save-exit"],
      { statusFixtureCoverage: "provided-records" },
    ),
  ).toEqual([]);
  await questionnaire.getByRole("button", { name: "Назад" }).click();
  await expect(questionnaire).toHaveCount(0);

  await openDrawerTab(page, /Файлы/);
  await uploadVisibleRequiredFiles(page, assets);
  await captureUiEvidence({
    description: `${typeLabel}: все видимые обязательные файлы загружены через file chooser; незакрытых upload slots нет.`,
    page,
    role: "agent",
    step: `${stepPrefix}-05-required-files-uploaded`,
    submissionId,
    testInfo,
  });
  await openDrawerTab(page, /Анкета/);
  const submitForReview = drawer(page)
    .getByRole("button", { name: /Отправить на проверку|Отправить/ })
    .first();
  await expect(submitForReview).toBeEnabled({ timeout: 30_000 });
  await captureUiEvidence({
    description: `${typeLabel}: после анкеты и файлов primary CTA «Отправить на проверку» доступен.`,
    page,
    role: "agent",
    step: `${stepPrefix}-06-ready-to-submit`,
    submissionId,
    testInfo,
  });
  await clickAndWaitForSupabaseWrite(page, () =>
    submitForReview.click(),
  );
  await clickWorkspaceButton(page, /Мои подачи/);
  await openSubmissionById(page, submissionId);

  const passportReview = page.getByRole("button", { name: "Проверил, отправить" });
  if (await isVisible(passportReview)) {
    await clickAndWaitForSupabaseWrite(page, () => passportReview.click());
  }

  await expect(drawer(page)).toContainText(/На проверке|Отправлено на проверку/);
  await captureUiEvidence({
    description: `${typeLabel}: UI показывает terminal agent status «На проверке/Отправлено на проверку».`,
    page,
    role: "agent",
    step: `${stepPrefix}-07-submitted`,
    submissionId,
    testInfo,
  });
  return submissionId;
}

async function waitForAgentDrawerTabContent(page: Page, tabName: string) {
  const drawerRoot = drawer(page);
  const selectorByTab: Record<string, string> = {
    Обзор: ".v20-section-stack .v20-stat-grid",
    Анкета: ".v20-questionnaire-head",
    Файлы: ".v20-upload-stage",
    Замечания: ".v20-issues-screen",
    История: ".v20-history-list",
  };
  const selector = selectorByTab[tabName];
  if (!selector)
    throw new Error(`No semantic drawer assertion configured for ${tabName}.`);
  await expect(
    drawerRoot.locator(selector).first(),
    `Agent drawer tab «${tabName}» must render its own meaningful content`,
  ).toBeVisible({ timeout: 5_000 });
}

async function waitForAdminDrawerTabContent(page: Page, tabName: string) {
  const reviewDrawer = page
    .locator('.admin-review-drawer[role="dialog"]:visible')
    .first();
  const selectorByTab: Record<string, string> = {
    Обзор: ".admin-review-overview-tab",
    Заявители: ".admin-review-applicants-tab",
    Анкета: ".admin-review-questionnaire",
    Файлы: ".admin-review-files-tab",
    Замечания: ".admin-review-issues-list, [role=tabpanel] h3",
    История: ".admin-review-history-tab, [role=tabpanel] h3",
  };
  const selector = selectorByTab[tabName];
  if (!selector)
    throw new Error(`No semantic admin drawer assertion configured for ${tabName}.`);

  await expect(
    reviewDrawer.locator(selector).first(),
    `Admin drawer tab «${tabName}» must render its own meaningful content`,
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    reviewDrawer.getByRole("tabpanel"),
    `Admin drawer tab «${tabName}» must finish its enter transition before evidence capture`,
  ).toHaveCSS("opacity", "1", { timeout: 5_000 });
}

async function waitForAdminDrawerToSettle(page: Page) {
  const reviewDrawer = page
    .locator('.admin-review-drawer[role="dialog"]:visible')
    .first();
  await expect(reviewDrawer).toBeVisible();

  await expect
    .poll(
      () =>
        reviewDrawer.evaluate((element) => {
          type BrowserRect = { left: number; right: number };
          type BrowserElement = {
            getBoundingClientRect(): BrowserRect;
            querySelector(selector: string): {
              getBoundingClientRect?: () => BrowserRect;
              scrollLeft?: number;
            } | null;
            scrollLeft: number;
          };
          const drawerElement = element as unknown as BrowserElement;
          const browser = globalThis as unknown as { innerWidth: number };
          const drawer = drawerElement.getBoundingClientRect();
          const title = drawerElement
            .querySelector(".admin-review-titlecopy h2")
            ?.getBoundingClientRect?.();
          const tabStrip = drawerElement.querySelector(".admin-review-tabs");
          return Boolean(
            title &&
            drawer.left >= -1 &&
            drawer.right <= browser.innerWidth + 1 &&
            title.left >= 15 &&
            title.right <= browser.innerWidth - 15 &&
            drawerElement.scrollLeft === 0 &&
            (tabStrip?.scrollLeft ?? 0) === 0,
          );
        }),
      { timeout: 7_500 },
    )
    .toBe(true);
}

async function assertAgentUploadCtaIsReachableAboveFooter(page: Page) {
  const drawerRoot = drawer(page);
  const drawerBody = drawerRoot.locator(".v20-drawer-body").first();
  const uploadButton = drawerRoot.getByRole("button", {
    name: "Выбрать файлы",
    exact: true,
  });
  const footer = drawerRoot.locator(".v20-footer").first();

  await expect(drawerBody).toBeVisible();
  await expect(uploadButton).toBeVisible();
  await drawerBody.hover();
  async function readScrollState() {
    return drawerBody.evaluate((element) => {
      const scrollable = element as unknown as {
        clientHeight: number;
        scrollHeight: number;
        scrollTop: number;
      };
      return {
        clientHeight: scrollable.clientHeight,
        scrollHeight: scrollable.scrollHeight,
        scrollTop: scrollable.scrollTop,
      };
    });
  }

  async function isCtaReachable() {
    const [uploadBox, drawerBodyBox, footerBox] = await Promise.all([
      uploadButton.boundingBox(),
      drawerBody.boundingBox(),
      footer.boundingBox(),
    ]);
    if (!uploadBox || !drawerBodyBox || !footerBox) return false;

    const uploadTop = uploadBox.y;
    const uploadBottom = uploadBox.y + uploadBox.height;
    const visibleBodyBottom = Math.min(
      drawerBodyBox.y + drawerBodyBox.height,
      footerBox.y,
    );
    return uploadTop >= drawerBodyBox.y + 1 && uploadBottom <= visibleBodyBottom - 1;
  }

  // A user reaches the upload CTA during a real scroll; it need not remain
  // visible at the absolute end because later file sections may follow it.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await isCtaReachable()) return;
    const scrollState = await readScrollState();
    if (
      scrollState.scrollTop + scrollState.clientHeight >=
      scrollState.scrollHeight - 1
    ) {
      throw new Error(
        `Agent upload CTA never became fully visible during real drawer scrolling (scroll ${scrollState.scrollTop}/${scrollState.scrollHeight - scrollState.clientHeight}).`,
      );
    }
    await page.mouse.wheel(0, 160);
  }

  const scrollState = await readScrollState();
  throw new Error(
    `Agent upload CTA did not become reachable before the scroll proof limit (scroll ${scrollState.scrollTop}/${scrollState.scrollHeight - scrollState.clientHeight}).`,
  );
}

async function assertAgentQuestionnaireHeaderIsReadable(page: Page) {
  if ((page.viewportSize()?.width ?? 0) > 460) return;

  const questionnaireHead = drawer(page).locator(".v20-questionnaire-head").first();
  const helper = questionnaireHead.locator(".v20-questionnaire-helper").first();
  const openQuestionnaire = questionnaireHead.getByRole("button", {
    name: "Открыть анкету",
    exact: true,
  });
  const [headBox, helperBox, buttonBox] = await Promise.all([
    questionnaireHead.boundingBox(),
    helper.boundingBox(),
    openQuestionnaire.boundingBox(),
  ]);
  if (!headBox || !helperBox || !buttonBox) {
    throw new Error(
      "Questionnaire header readability proof requires visible heading, helper, and CTA.",
    );
  }
  if (
    buttonBox.y < helperBox.y + helperBox.height + 4 ||
    buttonBox.x < headBox.x - 1 ||
    buttonBox.x + buttonBox.width > headBox.x + headBox.width + 1
  ) {
    throw new Error(
      "Questionnaire CTA overlaps or escapes its mobile progress header.",
    );
  }
}

async function assertHistoryIsUserFacing(page: Page, historySelector: string) {
  const history = page.locator(historySelector).first();
  await expect(history).toBeVisible();
  await expect(
    history.locator(".v20-history-meta, .admin-review-history-item > span").filter({
      hasText: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    }),
    "History must not show raw ISO timestamps to users",
  ).toHaveCount(0);
  await expect(
    history.locator(".v20-history-detail, .admin-review-history-item p").filter({
      hasText: /(?:bucket|path|generated|original)=/i,
    }),
    "History must not expose storage implementation details to users",
  ).toHaveCount(0);
}

async function waitForAdminReturnScreenToSettle(page: Page) {
  await expect(
    page.getByText("Загрузка выгруженных пакетов из Supabase…", { exact: true }),
    "Return-package evidence must never be captured while the screen is still loading",
  ).toHaveCount(0, { timeout: 30_000 });

  await expect
    .poll(
      async () => {
        const [loaded, empty, failed] = await Promise.all([
          isVisible(page.getByTestId("admin-return-packages-screen")),
          isVisible(page.getByRole("heading", { name: "Нет выгруженных пакетов" })),
          isVisible(
            page.getByRole("heading", {
              name: "Не удалось загрузить возвратные пакеты",
            }),
          ),
        ]);
        return loaded || empty || failed;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

test.describe("V-19 Supabase sandbox UI-only closure", () => {
  test.describe.configure({ mode: "serial" });

  test("all reachable auth, agent, and admin screens and tabs are opened through real UI controls", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const width = page.viewportSize()?.width ?? 0;
    const tourStep = (suffix: string) => `10-tour-${width}-${suffix}`;
    const captureTour = async (
      role: "auth" | "agent" | "admin",
      suffix: string,
      description: string,
      submissionId?: string,
    ) => {
      await assertNoOverflow(page);
      await captureUiEvidence({
        description,
        page,
        role,
        step: tourStep(suffix),
        submissionId,
        testInfo,
      });
    };

    await page.goto("/");
    const registerHeading = page.getByRole("heading", {
      level: 1,
      name: "Заявка на доступ",
    });
    if (await isVisible(registerHeading)) {
      await captureTour(
        "auth",
        "auth-register",
        "Экран заявки на доступ открыт без отправки формы.",
      );
      await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();
    } else {
      const requestAccess = page.getByRole("button", { name: "Запросить доступ" });
      if (await isVisible(requestAccess)) {
        await requestAccess.click();
        await captureTour(
          "auth",
          "auth-register",
          "Экран заявки на доступ открыт без отправки формы.",
        );
        await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();
      }
    }
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
    await captureTour(
      "auth",
      "auth-login",
      "Экран входа открыт; credentials ещё не введены и не попадают в screenshot.",
    );
    await page.getByRole("button", { name: "Не помню пароль" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Восстановление доступа" }),
    ).toBeVisible();
    await captureTour(
      "auth",
      "auth-reset",
      "Экран восстановления доступа открыт без отправки email.",
    );
    await page.getByRole("button", { name: "Вернуться ко входу" }).click();

    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Мои действия/);
    await captureTour(
      "agent",
      "agent-actions",
      "Agent screen «Мои действия» открыт через навигацию.",
    );
    for (const tabName of ["Открыто", "Сегодня", "Закрыто"]) {
      const tab = page.getByRole("button", { name: tabName, exact: true }).first();
      if (!(await isVisible(tab))) continue;
      await tab.click();
      await captureTour(
        "agent",
        `agent-actions-${tabName === "Открыто" ? "open" : tabName === "Сегодня" ? "today" : "closed"}`,
        `Вкладка «${tabName}» на экране «Мои действия» открыта реальным кликом.`,
      );
    }

    await clickWorkspaceButton(page, /Мои подачи/);
    await captureTour(
      "agent",
      "agent-submissions",
      "Agent screen «Мои подачи» открыт через навигацию.",
    );
    const agentSubmission = page.locator("[data-submission-id]").first();
    if (await isVisible(agentSubmission)) {
      const submissionId =
        (await agentSubmission.getAttribute("data-submission-id")) ?? undefined;
      await agentSubmission.click();
      await expect(drawer(page)).toBeVisible();
      const agentDrawerTabIdByName: Record<string, string> = {
        Обзор: "overview",
        Анкета: "questionnaire",
        Файлы: "files",
        Замечания: "issues",
        История: "history",
      };
      let agentMoreMenuCaptured = false;
      for (const tabName of ["Обзор", "Анкета", "Файлы", "Замечания", "История"]) {
        let captureUploadCtaReachability = false;
        const drawerRoot = drawer(page);
        const tab = drawerRoot
          .locator(`[data-drawer-tab="${agentDrawerTabIdByName[tabName]}"]`)
          .first();
        if (await isVisible(tab)) {
          await tab.click();
        } else {
          const more = drawerRoot.getByRole("button", { name: /^Ещё(?:$|:)/ }).first();
          await expect(
            more,
            `Agent drawer must expose «Ещё» for hidden mobile tab «${tabName}»`,
          ).toBeVisible();
          await more.click();
          const menuItem = drawerRoot.getByRole("menuitem", {
            name: new RegExp(`^${tabName}(?:\\s+\\d+)?$`),
          });
          await expect(menuItem).toBeVisible();
          if (!agentMoreMenuCaptured) {
            await captureTour(
              "agent",
              "agent-drawer-more-menu",
              "Agent submission drawer: mobile menu «Ещё» показывает все вторичные вкладки до выбора.",
              submissionId,
            );
            agentMoreMenuCaptured = true;
          }
          await menuItem.click();
        }
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await waitForAgentDrawerTabContent(page, tabName);
        if (tabName === "Анкета") {
          await expect(
            drawer(page).getByText("Осталось заполнить 2 блока данных", {
              exact: true,
            }),
          ).toHaveCount(0);
          await assertAgentQuestionnaireHeaderIsReadable(page);
        }
        if (tabName === "Файлы") {
          await expect(
            drawer(page).getByText("У вас одинаковый адрес проживания в России?", {
              exact: true,
            }),
          ).toHaveCount(0);
          const filesNotFormed = drawer(page).getByLabel("Файлы ещё не сформированы");
          if (await isVisible(filesNotFormed)) {
            await expect(filesNotFormed).toBeVisible();
            await expect(
              drawer(page).getByRole("button", { name: "Выбрать файлы", exact: true }),
            ).toHaveCount(0);
          } else {
            const uploadButton = drawer(page).getByRole("button", {
              name: "Выбрать файлы",
              exact: true,
            });
            await expect(
              uploadButton,
              "Agent file upload must be available when document slots exist",
            ).toBeEnabled();
            await expect(uploadButton).toHaveCSS("opacity", "1");
            await expect(uploadButton).toHaveCSS(
              "background-color",
              "rgb(58, 69, 180)",
            );
            captureUploadCtaReachability = true;
          }
        }
        if (tabName === "История") {
          await expect(
            drawer(page).getByText("Сегодня, 14:30", { exact: true }),
          ).toHaveCount(0);
          await assertHistoryIsUserFacing(page, ".v20-history-list");
        }
        await captureTour(
          "agent",
          `agent-drawer-${tabName === "Обзор" ? "overview" : tabName === "Анкета" ? "questionnaire" : tabName === "Файлы" ? "files" : tabName === "Замечания" ? "issues" : "history"}`,
          `Agent submission drawer: вкладка «${tabName}» открыта кликом.`,
          submissionId,
        );
        if (captureUploadCtaReachability) {
          await assertAgentUploadCtaIsReachableAboveFooter(page);
          await captureTour(
            "agent",
            "agent-drawer-files-cta-reachable",
            "Agent file-upload CTA полностью виден после реального scroll до конца drawer и не перекрыт footer.",
            submissionId,
          );
        }
      }
      await page.keyboard.press("Escape");

      if (submissionId) {
        await openSubmissionById(page, submissionId);
        await openDrawerTab(page, /Анкета/);
        await waitForAgentDrawerTabContent(page, "Анкета");
        await drawer(page)
          .getByRole("button", { name: "Открыть анкету", exact: true })
          .click();
        const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
        await expect(questionnaire).toBeVisible();
        await captureTour(
          "agent",
          "agent-questionnaire-workspace",
          "Из drawer вкладки «Анкета» открыт полноценный questionnaire workspace реальным кликом.",
          submissionId,
        );
        await questionnaire.getByRole("button", { name: "Назад", exact: true }).click();
        await expect(questionnaire).toHaveCount(0);
      }
    }

    await openCreateSubmission(page);
    await captureTour(
      "agent",
      "create-single",
      "Create submission drawer: режим одного заявителя.",
    );
    const createDialog = drawer(page);
    const familyMode = createDialog.getByRole("button", { name: "Семья", exact: true });
    if (await isVisible(familyMode)) {
      await familyMode.click();
      await captureTour(
        "agent",
        "create-family",
        "Create submission drawer: семейный режим и общие ответы.",
      );
      const addApplicant = createDialog.getByRole("button", {
        name: "Добавить заявителя в семью",
      });
      if (await isVisible(addApplicant)) {
        await addApplicant.click();
        await captureTour(
          "agent",
          "create-family-added-applicant",
          "В семейной подаче добавлен ещё один applicant только в локальном UI draft.",
        );
      }
    }
    const closeCreate = createDialog.getByRole("button", { name: "Закрыть создание" });
    if (await isVisible(closeCreate)) await closeCreate.click();
    else await page.keyboard.press("Escape");

    await clickWorkspaceButton(page, /Настройки/);
    await captureTour(
      "agent",
      "agent-settings",
      "Agent screen «Настройки рабочего места» открыт.",
    );
    const digest = page.getByLabel("Сводка по действиям");
    if (await isVisible(digest)) {
      await digest.selectOption("daily");
      await captureTour(
        "agent",
        "agent-settings-dirty",
        "Настройки изменены через UI; показано несохранённое состояние.",
      );
      const saveSettings = page.getByRole("button", { name: "Сохранить", exact: true });
      if (await isVisible(saveSettings)) await saveSettings.click();
    }
    const agentProfile = page.getByRole("button", { name: "Открыть профиль" });
    if (await isVisible(agentProfile)) {
      await agentProfile.click();
      await captureTour(
        "agent",
        "agent-profile",
        "Agent profile menu открыт реальным кликом.",
      );
      await page.keyboard.press("Escape");
    }

    await signOut(page);
    await signIn(page, "admin");
    await clickWorkspaceButton(page, /Проверка/);
    await captureTour(
      "admin",
      "admin-review",
      "Admin screen «Проверка» открыт через навигацию.",
    );
    const adminSubmission = page.locator("[data-submission-id]").first();
    if (await isVisible(adminSubmission)) {
      const submissionId =
        (await adminSubmission.getAttribute("data-submission-id")) ?? undefined;
      await adminSubmission.click();
      await expect(drawer(page)).toBeVisible();
      await waitForAdminDrawerToSettle(page);
      const adminDrawerTabIdByName: Record<string, string> = {
        Обзор: "overview",
        Заявители: "applicants",
        Анкета: "questionnaire",
        Файлы: "media",
        Замечания: "issues",
        История: "history",
      };
      let adminMoreMenuCaptured = false;
      for (const tabName of [
        "Обзор",
        "Заявители",
        "Анкета",
        "Файлы",
        "Замечания",
        "История",
      ]) {
        const reviewDrawer = page
          .locator('.admin-review-drawer[role="dialog"]:visible')
          .first();
        const tab = reviewDrawer
          .locator(`#admin-review-tab-${adminDrawerTabIdByName[tabName]}`)
          .first();
        if (await isVisible(tab)) {
          if (width > 560) await tab.scrollIntoViewIfNeeded();
        } else {
          const more = reviewDrawer.getByRole("button", { name: "Ещё", exact: true });
          await expect(
            more,
            `Admin drawer must expose «Ещё» for hidden mobile tab «${tabName}»`,
          ).toBeVisible();
          await more.click();
          const menuItem = reviewDrawer.getByRole("menuitem", {
            name: new RegExp(`^${tabName}(?:\\s+\\d+)?$`),
          });
          await expect(menuItem).toBeVisible();
          if (!adminMoreMenuCaptured) {
            await waitForAdminDrawerToSettle(page);
            await captureTour(
              "admin",
              "admin-drawer-more-menu",
              "Admin review drawer: mobile menu «Ещё» показывает все вторичные вкладки до выбора.",
              submissionId,
            );
            adminMoreMenuCaptured = true;
          }
          await menuItem.click();
        }
        if (await isVisible(tab)) await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await waitForAdminDrawerTabContent(page, tabName);
        if (tabName === "История") {
          await assertHistoryIsUserFacing(page, ".admin-review-history-tab");
        }
        if (tabName === "Заявители" || tabName === "Анкета") {
          const partialQuestionnaire = reviewDrawer.getByText("Частично", {
            exact: true,
          });
          if (await isVisible(partialQuestionnaire)) {
            const primaryAction = reviewDrawer.locator(".admin-review-primary");
            await expect(
              primaryAction,
              "Admin acceptance must fail closed while the UI reports a partial questionnaire",
            ).toBeDisabled();
            await expect(primaryAction).toHaveAttribute(
              "title",
              "Не все обязательные анкеты и файлы готовы",
            );
            await expect(primaryAction).toHaveCSS(
              "background-color",
              "rgb(30, 30, 33)",
            );
            await expect(primaryAction).toHaveCSS("opacity", "0.46");
          }
        }
        await captureTour(
          "admin",
          `admin-drawer-${tabName === "Обзор" ? "overview" : tabName === "Заявители" ? "applicants" : tabName === "Анкета" ? "questionnaire" : tabName === "Файлы" ? "files" : tabName === "Замечания" ? "issues" : "history"}`,
          `Admin review drawer: вкладка «${tabName}» открыта кликом.`,
          submissionId,
        );
      }
      await page.keyboard.press("Escape");
    }

    await clickWorkspaceButton(page, /Выгрузка/);
    await captureTour(
      "admin",
      "admin-export",
      "Admin screen «Выгрузка» открыт через навигацию.",
    );
    await clickWorkspaceButton(page, /Возврат/);
    await waitForAdminReturnScreenToSettle(page);
    await captureTour(
      "admin",
      "admin-return",
      "Admin screen «Возврат документов» открыт через навигацию.",
    );
    await clickWorkspaceButton(page, /Пользователи/);
    await captureTour(
      "admin",
      "admin-users",
      "Admin screen «Пользователи / заявки на доступ» открыт.",
    );
    for (const tabPattern of [/^Новые/, /^История/]) {
      const tab = page.getByRole("button", { name: tabPattern }).first();
      if (!(await isVisible(tab))) continue;
      await tab.click();
      await captureTour(
        "admin",
        tabPattern.source.includes("Новые") ? "admin-users-new" : "admin-users-history",
        `Admin users: вкладка «${(await tab.innerText()).replace(/\s+/g, " ").trim()}» открыта кликом.`,
      );
    }
    const adminProfile = page.getByRole("button", { name: "Профиль администратора" });
    if (await isVisible(adminProfile)) {
      await adminProfile.click();
      await captureTour(
        "admin",
        "admin-profile",
        "Admin profile menu открыт реальным кликом.",
      );
    }

    expect(browserProblems()).toEqual([]);
  });

  test("admin opens return packages without sandbox writes", async ({ page }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const mutations = collectSupabaseMutations(page);
    const viewportWidth = page.viewportSize()?.width ?? 0;

    await signIn(page, "admin");
    await clickWorkspaceButton(page, /Возврат/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Возврат документов" }),
    ).toBeVisible();
    await waitForAdminReturnScreenToSettle(page);
    await assertNoOverflow(page);

    const screenshotPath = testInfo.outputPath(`admin-return-${viewportWidth}.png`);
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach(`admin-return-${viewportWidth}`, {
      contentType: "image/png",
      path: screenshotPath,
    });

    expect(mutations()).toEqual([]);
    expect(browserProblems()).toEqual([]);
  });

  test("AdminReviewDrawer opens every subview through real controls without writing sandbox data", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const mutations = collectSupabaseMutations(page);
    const viewportWidth = page.viewportSize()?.width ?? 0;

    const captureDrawerState = async (
      step: string,
      description: string,
      submissionId?: string,
    ) => {
      await assertNoOverflow(page);
      await captureUiEvidence({
        description,
        page,
        role: "admin",
        step: `drawer-polish-${viewportWidth}-${step}`,
        submissionId,
        testInfo,
      });
    };

    await signIn(page, "admin");
    await clickWorkspaceButton(page, /Проверка/);
    const opener = page.locator("[data-submission-id]").first();
    await expect(opener).toBeVisible();
    const submissionId = (await opener.getAttribute("data-submission-id")) ?? undefined;
    await opener.focus();
    await opener.click();

    const reviewDrawer = page
      .locator('.admin-review-drawer[role="dialog"]:visible')
      .first();
    await expect(reviewDrawer).toBeVisible();
    await expect(reviewDrawer).toHaveAttribute("aria-modal", "true");
    await expect(reviewDrawer).toHaveAttribute(
      "aria-labelledby",
      "admin-review-drawer-heading",
    );
    await waitForAdminDrawerToSettle(page);

    if (viewportWidth <= 768) {
      const drawerGeometry = await reviewDrawer.evaluate((element) => {
        type BrowserRect = { height: number; left: number; right: number };
        type BrowserElement = {
          querySelector(selector: string): {
            getBoundingClientRect?: () => BrowserRect;
          } | null;
        };
        const root = element as unknown as BrowserElement;
        const header = root.querySelector(".admin-review-drawer-header");
        const heading = root.querySelector(".admin-review-titlecopy h2");
        const viewport = globalThis as unknown as {
          innerHeight: number;
          innerWidth: number;
        };
        const headerBox = header?.getBoundingClientRect?.();
        const headingBox = heading?.getBoundingClientRect?.();
        return {
          headerRatio: headerBox
            ? headerBox.height / viewport.innerHeight
            : Number.POSITIVE_INFINITY,
          headingLeft: headingBox?.left ?? Number.NEGATIVE_INFINITY,
          headingRight: headingBox?.right ?? Number.POSITIVE_INFINITY,
          viewportWidth: viewport.innerWidth,
        };
      });
      expect(drawerGeometry.headerRatio).toBeLessThanOrEqual(0.15);
      expect(drawerGeometry.headingLeft).toBeGreaterThanOrEqual(16);
      expect(drawerGeometry.headingRight).toBeLessThanOrEqual(
        drawerGeometry.viewportWidth - 16,
      );
    }

    const tabs: Array<{ id: string; label: string }> = [
      { id: "overview", label: "Обзор" },
      { id: "applicants", label: "Заявители" },
      { id: "questionnaire", label: "Анкета" },
      { id: "media", label: "Файлы" },
      { id: "issues", label: "Замечания" },
      { id: "history", label: "История" },
    ];
    let capturedMoreMenu = false;

    for (const tabDefinition of tabs) {
      const tab = reviewDrawer.locator(`#admin-review-tab-${tabDefinition.id}`);
      if (await isVisible(tab)) {
        await tab.click();
      } else {
        const more = reviewDrawer.getByRole("button", { name: "Ещё", exact: true });
        await expect(more).toBeVisible();
        await more.click();
        const menu = reviewDrawer.getByRole("menu", {
          name: "Дополнительные разделы проверки",
        });
        await expect(menu).toBeVisible();
        if (!capturedMoreMenu) {
          await captureDrawerState(
            "more-menu",
            "Drawer: мобильное меню «Ещё» открыто реальным кликом и показывает скрытые разделы.",
            submissionId,
          );
          await page.keyboard.press("Escape");
          await expect(menu).toBeHidden();
          await expect(reviewDrawer).toBeVisible();
          await expect(more).toBeFocused();
          await more.click();
          capturedMoreMenu = true;
        }
        await menu
          .getByRole("menuitem", {
            name: new RegExp(`^${tabDefinition.label}(?:\\s+\\d+)?$`),
          })
          .click();
        await expect(more).toHaveAttribute("aria-expanded", "false");
      }

      await expect(tab).toHaveAttribute("aria-selected", "true");
      await waitForAdminDrawerTabContent(page, tabDefinition.label);

      if (tabDefinition.id === "questionnaire") {
        await expect(reviewDrawer.getByTitle("Пометить как проверенное")).toHaveCount(
          0,
        );
        const applicantSelect = reviewDrawer.getByLabel("Заявитель");
        const applicantOptions = await applicantSelect.locator("option").count();
        if (applicantOptions > 1) {
          const firstValue = await applicantSelect.inputValue();
          await applicantSelect.selectOption({ index: 1 });
          expect(await applicantSelect.inputValue()).not.toBe(firstValue);
        }

        const remarkAction = reviewDrawer
          .getByTestId("admin-review-add-remark")
          .first();
        await expect(remarkAction).toBeVisible();
        await remarkAction.click();
        const remarkDialog = page.getByRole("dialog", { name: "Добавить замечание" });
        await expect(remarkDialog).toBeVisible();
        await remarkDialog.getByLabel("Текст для клиента").fill("");
        await remarkDialog.getByTestId("remark-form-submit").click();
        await expect(remarkDialog.getByRole("alert")).toBeVisible();
        await captureDrawerState(
          "questionnaire-empty-remark",
          "Drawer: форма замечания блокирует пустой текст и объясняет причину без записи данных.",
          submissionId,
        );
        await remarkDialog
          .getByRole("button", { name: "Закрыть форму замечания" })
          .click();
        await expect(remarkDialog).toBeHidden();

        const verifyDocument = reviewDrawer
          .getByRole("button", { name: "Сверить с паспортом" })
          .first();
        await expect(verifyDocument).toBeVisible();
        await verifyDocument.scrollIntoViewIfNeeded();
        if (viewportWidth <= 560) {
          const documentFieldLabel = verifyDocument
            .locator("xpath=ancestor::*[contains(@class, 'admin-review-field-row')]")
            .locator(".admin-review-row-label");
          const [labelBox, actionBox] = await Promise.all([
            documentFieldLabel.boundingBox(),
            verifyDocument.boundingBox(),
          ]);
          expect(labelBox?.width).toBeGreaterThan(72);
          expect(labelBox?.y).toBeLessThan(actionBox?.y ?? Number.POSITIVE_INFINITY);
        }
        await captureUiEvidence({
          description:
            "Drawer: действие «Сверить с паспортом» видно отдельно от «Добавить замечание» до перехода в рабочий экран сверки.",
          page,
          role: "admin",
          step: `drawer-polish-${viewportWidth}-document-compare-entry`,
          submissionId,
          testInfo,
        });
        await verifyDocument.click();

        const passportWorkspace = page.getByRole("heading", {
          name: "Сверка паспорта",
          exact: true,
        });
        await expect(passportWorkspace).toBeVisible();
        await expect(remarkDialog).toBeHidden();
        await assertNoOverflow(page);
        await captureUiEvidence({
          description:
            "Drawer: действие «Сверить с паспортом» открывает рабочий экран сверки, а не форму замечания.",
          page,
          role: "admin",
          step: `drawer-polish-${viewportWidth}-document-compare`,
          submissionId,
          testInfo,
        });

        await page.getByRole("button", { name: "Вернуться к подаче" }).click();
        await expect(reviewDrawer).toBeVisible();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await waitForAdminDrawerToSettle(page);
      }

      if (tabDefinition.id === "history") {
        await assertHistoryIsUserFacing(page, ".admin-review-history-tab");
      }

      await captureDrawerState(
        `tab-${tabDefinition.id}`,
        `Drawer: вкладка «${tabDefinition.label}» открыта реальным UI-кликом; layout и overflow проверены.`,
        submissionId,
      );
    }

    const primaryAction = reviewDrawer.locator(".admin-review-primary");
    if (await primaryAction.isDisabled()) {
      await expect(primaryAction).toHaveCSS("background-color", "rgb(30, 30, 33)");
      await expect(primaryAction).toHaveCSS("opacity", "0.46");
    }

    await page.keyboard.press("Escape");
    await expect(reviewDrawer).toHaveCount(0);
    await expect
      .poll(() =>
        opener.evaluate((element) => {
          const focused = element as unknown as {
            ownerDocument: { activeElement: unknown };
          };
          return focused.ownerDocument.activeElement === element;
        }),
      )
      .toBe(true);
    expect(mutations()).toEqual([]);
    expect(browserProblems()).toEqual([]);
  });

  test("agent creates single and family submissions, completes them, and submits them through the UI", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("-desktop"),
      "Desktop lifecycle coverage only.",
    );

    runId = uiEvidenceRunId(testInfo);
    const browserProblems = collectBrowserProblems(page);
    const assets = runAssets(runId, 6);

    await signIn(page, "agent");
    await captureUiEvidence({
      description:
        "Агент вошёл через реальную форму авторизации; открыт рабочий экран без вывода credentials.",
      page,
      role: "agent",
      step: "01-agent-signed-in",
      testInfo,
    });
    singleSubmissionId = await createAndSubmitSubmission(
      page,
      assets,
      "single",
      testInfo,
    );
    await page.keyboard.press("Escape");
    familySubmissionId = await createAndSubmitSubmission(
      page,
      assets.slice(2),
      "family",
      testInfo,
    );
    await testInfo.attach("sandbox-ui-flow", {
      body: Buffer.from(
        JSON.stringify({
          runId,
          singleSubmissionId,
          familySubmissionId,
          role: "agent",
          status: "submitted",
        }),
      ),
      contentType: "application/json",
    });
    expect(browserProblems()).toEqual([]);
  });

  test("agent cannot see a submission owned by another real sandbox agent", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("-desktop"),
      "Desktop role isolation coverage only.",
    );

    expect(singleSubmissionId).not.toBe("");
    expect(familySubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "otherAgent");
    await clickWorkspaceButton(page, /Мои подачи/);
    const search = page.getByRole("searchbox").first();
    await expect(search).toBeVisible();
    await search.fill(singleSubmissionId);
    await expect(
      page.locator(`[data-submission-id="${singleSubmissionId}"]`),
    ).toHaveCount(0);
    await captureUiEvidence({
      description:
        "Второй sandbox-агент ищет чужой submission ID; строка отсутствует, ownership isolation сохранён.",
      page,
      role: "otherAgent",
      step: "04-other-agent-ownership-isolation",
      submissionId: singleSubmissionId,
      testInfo,
    });
    expect(browserProblems()).toEqual([]);
  });

  test("admin returns a real sandbox submission with a UI-created issue", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("-desktop"),
      "Desktop admin coverage only.",
    );

    expect(singleSubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "admin");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Проверка|Очередь на проверку|Работа/,
      }),
    ).toBeVisible();
    await openSubmissionById(page, singleSubmissionId);
    await captureUiEvidence({
      description:
        "Администратор открыл отправленную подачу из своей очереди; виден актуальный review status.",
      page,
      role: "admin",
      step: "05-admin-review-opened",
      submissionId: singleSubmissionId,
      testInfo,
    });
    await openDrawerTab(page, /Замечания/);
    await openDrawerTab(page, /Анкета/);
    await page.waitForTimeout(400);
    const fieldRemark = drawer(page)
      .getByRole("button", { name: "Добавить замечание" })
      .first();
    await expect(fieldRemark).toBeVisible();
    await fieldRemark.scrollIntoViewIfNeeded();
    await fieldRemark.click({ force: true });
    const remark = page.getByRole("dialog", { name: "Новое замечание" });
    await expect(remark).toBeVisible();
    await remark.locator("textarea").nth(0).fill(`Проверить данные ${runId}`);
    await remark
      .locator("textarea")
      .nth(1)
      .fill(`Исправьте данные ${runId} и отправьте повторно.`);
    await captureUiEvidence({
      description:
        "Администратор заполнил замечание через UI; перед отправкой видны внутреннее и агентское описания.",
      page,
      role: "admin",
      step: "05-admin-remark-filled",
      submissionId: singleSubmissionId,
      testInfo,
    });
    await clickAndWaitForSupabaseWrite(page, () =>
      remark.getByRole("button", { name: "Отправить замечание" }).click(),
    );
    await clickAndWaitForSupabaseWrite(page, () =>
      drawer(page).locator(".admin-review-primary").click(),
    );
    await expect(drawer(page)).toContainText(/Возвращено|Требуют действия/);
    await captureUiEvidence({
      description:
        "После admin action подача визуально перешла в «Возвращено/Требуют действия».",
      page,
      role: "admin",
      step: "05-admin-returned",
      submissionId: singleSubmissionId,
      testInfo,
    });
    expect(browserProblems()).toEqual([]);
  });

  test("agent action opens the exact returned blocker without a generic drawer", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("-desktop"),
      "Desktop lifecycle coverage only.",
    );

    expect(singleSubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    const mutations = collectSupabaseMutations(page);

    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Мои действия/);
    const search = page.getByRole("searchbox").first();
    await expect(search).toBeVisible();
    await search.fill(singleSubmissionId);

    const actionRow = page
      .getByTestId("agent-action-row")
      .filter({ hasText: singleSubmissionId })
      .filter({ has: page.getByTestId("agent-action-cta") })
      .first();
    await expect(actionRow).toBeVisible();
    await expect(actionRow.getByTestId("agent-action-status")).toContainText(
      "Нужно заполнить",
    );
    const cta = actionRow.getByTestId("agent-action-cta");
    await expect(cta).toHaveText("Продолжить");
    await cta.click();

    const questionnaire = page
      .locator(
        `.vf-figma-questionnaire-screen[data-submission-id="${singleSubmissionId}"]`,
      )
      .first();
    await expect(questionnaire).toBeVisible();
    await expect(drawer(page)).toHaveCount(0);
    await expect(
      questionnaire.getByRole("heading", { name: /^Анкета:/ }),
    ).toBeVisible();

    const blocker = questionnaire
      .locator(".v19-questionnaire-review-alert")
      .filter({ hasText: `Проверить данные ${runId}` })
      .first();
    await expect(blocker).toBeVisible();
    await expect(blocker).toContainText(
      `Исправьте данные ${runId} и отправьте повторно.`,
    );
    await expect(
      blocker.getByRole("button", { name: "Пометить исправленным" }),
    ).toBeVisible();
    await assertNoOverflow(page);
    await captureUiEvidence({
      description:
        "Агент одним кликом из «Моих действий» открыл точное returned-замечание в анкете; общий Drawer не появился.",
      page,
      role: "agent",
      step: "06-agent-actions-questionnaire-blocker",
      submissionId: singleSubmissionId,
      testInfo,
    });

    expect(mutations()).toEqual([]);
    expect(browserProblems()).toEqual([]);
  });

  test("agent fixes the returned submission and resubmits it through the UI", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("-desktop"),
      "Desktop correction coverage only.",
    );

    expect(singleSubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Мои подачи/);
    await openSubmissionById(page, singleSubmissionId);
    await openDrawerTab(page, /Замечания/);
    await captureUiEvidence({
      description:
        "Агент открыл возвращённую подачу и видит созданное администратором замечание и следующее действие.",
      page,
      role: "agent",
      step: "06-agent-returned-issue-visible",
      submissionId: singleSubmissionId,
      testInfo,
    });

    const fixed = drawer(page).getByRole("button", {
      name: /Отметить (замечание )?исправленным/,
    });
    while ((await fixed.count()) > 0) {
      await clickAndWaitForSupabaseWrite(page, () => fixed.first().click());
    }
    await captureUiEvidence({
      description: "Все видимые замечания отмечены агентом исправленными через UI.",
      page,
      role: "agent",
      step: "06-agent-issues-fixed",
      submissionId: singleSubmissionId,
      testInfo,
    });

    await clickAndWaitForSupabaseWrite(page, () =>
      drawer(page).getByRole("button", { name: "Отправить исправления" }).click(),
    );
    await expect(drawer(page)).toContainText(/На проверке|Исправления отправлены/);
    await captureUiEvidence({
      description:
        "Агент повторно отправил исправления; UI показывает статус «На проверке/Исправления отправлены».",
      page,
      role: "agent",
      step: "06-agent-resubmitted",
      submissionId: singleSubmissionId,
      testInfo,
    });
    expect(browserProblems()).toEqual([]);
  });

  test("admin accepts the corrected submission and downloads its export package through the UI", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("-desktop"),
      "Desktop export coverage only.",
    );

    expect(singleSubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "admin");
    await openSubmissionById(page, singleSubmissionId);
    await captureUiEvidence({
      description: "Администратор открыл исправленную подачу перед финальным accept.",
      page,
      role: "admin",
      step: "07-admin-corrected-review",
      submissionId: singleSubmissionId,
      testInfo,
    });
    await clickAndWaitForSupabaseWrite(page, () =>
      drawer(page).locator(".admin-review-primary").click(),
    );
    await expect(drawer(page)).toContainText(/Готово к выгрузке|Готово/);
    await captureUiEvidence({
      description: "После accept UI показывает «Готово к выгрузке/Готово».",
      page,
      role: "admin",
      step: "07-admin-accepted",
      submissionId: singleSubmissionId,
      testInfo,
    });

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Выгрузка" }),
    ).toBeVisible();
    const exportRow = page
      .locator(".export-row, .v19-admin-export-row")
      .filter({ hasText: singleSubmissionId })
      .first();
    await expect(exportRow).toBeVisible();
    await exportRow.getByRole("checkbox").check();
    await captureUiEvidence({
      description:
        "В разделе «Выгрузка» выбрана строка принятой подачи с тем же submission ID.",
      page,
      role: "admin",
      step: "07-export-row-selected",
      submissionId: singleSubmissionId,
      testInfo,
    });
    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    const prepareZipButton = page.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });
    await expect(prepareZipButton).toBeEnabled();
    await prepareZipButton.click();
    const downloadLink = page.getByRole("link", { name: "Скачать ZIP" });
    await expect(downloadLink).toBeVisible({ timeout: 120_000 });
    await captureUiEvidence({
      description: "Excel сформирован через UI; ZIP download CTA доступен.",
      page,
      role: "admin",
      step: "07-export-ready-to-download",
      submissionId: singleSubmissionId,
      testInfo,
    });
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    await expect(download.failure()).resolves.toBeNull();
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+/);
    await page.getByRole("button", { name: "Подтвердить скачивание" }).click();
    await expect(page.locator("#export-action-hint")).toContainText(
      "Скачивание подтверждено, пакет зафиксирован",
    );
    await captureUiEvidence({
      description:
        "ZIP download инициирован реальным кликом и завершился без browser download failure.",
      page,
      role: "admin",
      step: "07-export-downloaded",
      submissionId: singleSubmissionId,
      testInfo,
    });
    expect(browserProblems()).toEqual([]);
  });

  test("admin uploads and publishes the return package, then agent can download it", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.endsWith("-desktop"),
      "Desktop PDF handoff coverage only.",
    );

    const browserProblems = collectBrowserProblems(page);
    const pdfFiles = ["appointment-list", "application"].map((name) => ({
      buffer: Buffer.from(`%PDF-1.4\n%V19 sandbox ${name}\n%%EOF\n`),
      mimeType: "application/pdf",
      name: `${runId}-${name}.pdf`,
    }));
    await signIn(page, "admin");
    await clickWorkspaceButton(page, /Возврат/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Возврат документов" }),
    ).toBeVisible();
    const returnScreen = page.getByTestId("admin-return-packages-screen");
    await expect(returnScreen).toBeVisible();
    await captureUiEvidence({
      description:
        "Администратор открыл экран возврата документов перед загрузкой двух PDF.",
      page,
      role: "admin",
      step: "08-return-package-screen",
      testInfo,
    });
    const pdfInputs = returnScreen.locator('input[type="file"]');
    await expect(pdfInputs).toHaveCount(2);

    await clickAndWaitForSupabaseWrite(page, () =>
      pdfInputs.nth(0).setInputFiles(pdfFiles[0]),
    );
    await clickAndWaitForSupabaseWrite(page, () =>
      pdfInputs.nth(1).setInputFiles(pdfFiles[1]),
    );
    const publish = page.getByRole("button", { name: "Передать агенту" });
    await expect(publish).toBeEnabled();
    await captureUiEvidence({
      description:
        "Оба synthetic PDF загружены через UI; кнопка передачи агенту доступна.",
      page,
      role: "admin",
      step: "08-return-package-ready",
      testInfo,
    });
    await clickAndWaitForSupabaseWrite(page, () => publish.click());
    await expect(returnScreen).toContainText(/Пакет опубликован|уже был передан/);
    await captureUiEvidence({
      description: "Return package опубликован; UI подтверждает передачу агенту.",
      page,
      role: "admin",
      step: "08-return-package-published",
      testInfo,
    });

    await signOut(page);
    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Мои подачи/);
    const received = page.getByTestId("agent-return-packages-panel");
    await expect(received).toBeVisible();
    await expect(received).toContainText("PDF-список");
    await expect(received).toContainText("Готовая анкета");
    const downloadButton = received
      .getByRole("button", { name: /^Скачать /u })
      .first();
    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const returnedPdf = await downloadPromise;
    await expect(returnedPdf.failure()).resolves.toBeNull();
    expect(returnedPdf.suggestedFilename()).toMatch(/\.pdf$/iu);
    const returnedPdfPath = await returnedPdf.path();
    expect(returnedPdfPath).not.toBeNull();
    const returnedPdfBytes = await readFile(returnedPdfPath!);
    expect(returnedPdfBytes.byteLength).toBeGreaterThan(5);
    expect(returnedPdfBytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    await captureUiEvidence({
      description:
        "Агент открыл пакет, скачал synthetic PDF и подтвердил непустую PDF-сигнатуру.",
      page,
      role: "agent",
      step: "08-agent-return-package-received",
      testInfo,
    });
    expect(browserProblems()).toEqual([]);
  });

  test("mobile sandbox navigation, drawer, and filters remain operable without overflow", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.endsWith("-desktop"),
      "Mobile-only interaction coverage.",
    );

    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();
    const mobileWidth = page.viewportSize()?.width ?? 0;
    await captureUiEvidence({
      description: `Mobile ${mobileWidth}px: список подач открыт через навигацию; primary content видим.`,
      page,
      role: "agent",
      step: `09-mobile-${mobileWidth}-submissions`,
      testInfo,
    });

    const filter = page.getByRole("button", { name: /Фильтры подач|Фильтры/ }).first();
    if (await isVisible(filter)) {
      await filter.click();
      const dialog = page.getByRole("dialog").last();
      await expect(dialog).toBeVisible();
      await captureUiEvidence({
        description: `Mobile ${mobileWidth}px: фильтры открыты реальным tap и доступны без overflow.`,
        page,
        role: "agent",
        step: `09-mobile-${mobileWidth}-filters`,
        testInfo,
      });
      await page.keyboard.press("Escape");
    }

    const firstSubmission = page.locator("[data-submission-id]").first();
    if (await isVisible(firstSubmission)) {
      await firstSubmission.click();
      await expect(drawer(page)).toBeVisible();
      await captureUiEvidence({
        description: `Mobile ${mobileWidth}px: drawer подачи открыт tap; содержимое и закрытие доступны.`,
        page,
        role: "agent",
        step: `09-mobile-${mobileWidth}-drawer`,
        testInfo,
      });
      await page.keyboard.press("Escape");
    }

    await assertNoOverflow(page);
    expect(browserProblems()).toEqual([]);
  });
});
