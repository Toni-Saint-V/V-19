import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { testArtifactPath } from "../support/artifacts";

import type { Page } from "@playwright/test";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { fillRequiredQuestionnaireForTest } from "../unit/helpers/questionnaireTestFill";

import {
  clickFirstVisible,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  openDrawerTab,
  openFreshWorkspace,
  openMobileMenu,
} from "./v19-pilot-helpers";
import { expect, test } from "./v19-localhost-test";

const evidenceDirectory = testArtifactPath("2026-07-15-my-actions-pass-01");
const syntheticSelfiePath = resolve(
  "tests/fixtures/production-media/E2E_TEST_PERSON_ONE_910000001.png",
);
const canonicalQuestionnaireFixture = (() => {
  const returned = initialSubmissions.find((submission) => submission.id === "ПД-1048");
  if (!returned) throw new Error("Expected returned questionnaire fixture.");
  const completed = fillRequiredQuestionnaireForTest(returned);
  return {
    applicants: completed.applicants,
    submissions: initialSubmissions.map((submission) => ({
      ...(submission.id === completed.id ? completed : submission),
      agentId:
        submission.agentId === "unassigned-agent-secondary"
          ? "local-agent-alex"
          : "local-agent-tony",
    })),
    tripDateFrom: completed.tripDateFrom,
    tripDateTo: completed.tripDateTo,
  };
})();

type ActionAnimationRecord = { delay: number; submissionId: string | null };

type EntranceMetrics = {
  animationRecords: ActionAnimationRecord[];
  documentWidth: { client: number; scroll: number };
  rowCount: number;
  rowOpacity: string[];
};

async function captureActionEntranceMetrics(page: Page): Promise<EntranceMetrics> {
  return page.evaluate((): EntranceMetrics => {
    const browserGlobal = globalThis as unknown as {
      __v19ActionRowAnimations?: ActionAnimationRecord[];
      document: {
        documentElement: { clientWidth: number; scrollWidth: number };
        querySelectorAll(selector: string): ArrayLike<unknown>;
      };
      getComputedStyle(element: unknown): { opacity: string };
    };

    const rows = Array.from(
      browserGlobal.document.querySelectorAll(
        '[data-testid="agent-action-queue-item"], .v19-actions-timeline-hit',
      ),
    ).filter((row) => {
      const element = row as {
        getClientRects(): { length: number };
      };
      return element.getClientRects().length > 0;
    });

    return {
      animationRecords: browserGlobal.__v19ActionRowAnimations ?? [],
      documentWidth: {
        client: browserGlobal.document.documentElement.clientWidth,
        scroll: browserGlobal.document.documentElement.scrollWidth,
      },
      rowCount: rows.length,
      rowOpacity: rows.map((row) => browserGlobal.getComputedStyle(row).opacity),
    };
  });
}

async function prepareAnimationMetrics(page: Page) {
  await page.addInitScript(() => {
    const browserGlobal = globalThis as unknown as {
      __v19ActionRowAnimations?: ActionAnimationRecord[];
      Element: {
        prototype: {
          animate(keyframes: unknown, options?: unknown): unknown;
        };
      };
    };
    const originalAnimate = browserGlobal.Element.prototype.animate;
    const records: ActionAnimationRecord[] = [];

    browserGlobal.Element.prototype.animate = function instrumentActionRowAnimation(
      this: unknown,
      keyframes: unknown,
      options?: number | { delay?: number },
    ) {
      const element = this as unknown as {
        closest?(selector: string): { dataset?: { agentActionId?: string } } | null;
      };
      const row = element.closest?.(
        '[data-testid="agent-action-queue-item"], .v19-actions-timeline-hit',
      );
      if (row) {
        const timing = typeof options === "number" ? { delay: 0 } : (options ?? {});
        records.push({
          delay: Number(timing.delay ?? 0),
          submissionId: row.dataset?.agentActionId ?? null,
        });
      }
      return Reflect.apply(originalAnimate, this, [keyframes, options]);
    };

    browserGlobal.__v19ActionRowAnimations = records;
  });
}

async function signOutAndLogin(
  page: Page,
  credentials: { email: string; password: string },
  expectedHeading: string | RegExp,
) {
  await openMobileMenu(page);
  await clickFirstVisible(page.getByRole("button", { exact: true, name: "Выйти" }));
  const loginTab = page.getByRole("button", {
    exact: true,
    name: "Уже есть доступ? Войти",
  });
  const emailInput = page.locator("#workspace-email");
  await expect(emailInput.or(loginTab)).toBeVisible();
  if (await loginTab.isVisible()) await loginTab.click();
  await emailInput.fill(credentials.email);
  await page.locator("#workspace-password").fill(credentials.password);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: expectedHeading }),
  ).toBeVisible();
}

async function completeReturnedQuestionnaireFixture(page: Page) {
  await page.evaluate((completedQuestionnaire) => {
    const storageKey = "visaflow.v19.submissions.v1";
    const storedSubmissions = JSON.parse(
      localStorage.getItem(storageKey) ?? "[]",
    ) as Array<{
      applicants?: typeof completedQuestionnaire.applicants;
      completeness?: { files?: number; questionnaire?: number; total?: number };
      id?: string;
      tripDateFrom?: string;
      tripDateTo?: string;
    }>;
    const submissions = storedSubmissions.length
      ? storedSubmissions
      : completedQuestionnaire.submissions;
    const target = submissions.find((submission) => submission.id === "ПД-1048");
    if (!target) throw new Error("Expected canonical returned questionnaire fixture.");
    target.applicants = completedQuestionnaire.applicants;
    target.tripDateFrom = completedQuestionnaire.tripDateFrom;
    target.tripDateTo = completedQuestionnaire.tripDateTo;
    target.completeness = {
      ...target.completeness,
      questionnaire: 100,
      total: Math.round((100 + (target.completeness?.files ?? 0)) / 2),
    };
    localStorage.setItem(storageKey, JSON.stringify(submissions));
  }, canonicalQuestionnaireFixture);
  await page.reload();
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: "Мои действия" }),
  ).toBeVisible();
}

test.describe("V-19 My Actions immediate queue", () => {
  test("makes every action immediately available and preserves the exact correction CTA", async ({
    page,
  }) => {
    mkdirSync(evidenceDirectory, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    await prepareAnimationMetrics(page);
    const results = [];

    for (const viewport of [
      { height: 740, label: "mobile-320", width: 320 },
      { height: 844, label: "mobile-390", width: 390 },
      { height: 932, label: "mobile-430", width: 430 },
      { height: 1024, label: "tablet-768", width: 768 },
      { height: 900, label: "desktop-1440", width: 1440 },
    ]) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openFreshWorkspace(page, { heading: "Мои действия" });

      const action = page
        .locator(
          [
            '[data-testid="agent-action-queue-item"][data-agent-action-id^="replace-ПД-1048-"]:visible',
            '.v19-actions-timeline-event[data-submission-id="ПД-1048"] .v19-actions-timeline-hit:visible',
          ].join(", "),
        )
        .first();
      await expect(action).toBeVisible();
      await expect(action).toHaveAccessibleName(
        /Выбрать действие: .*Мария Иванова.*Заменить селфи 1/,
      );
      await expect(action).toHaveAttribute("aria-controls", /agent-action-/);
      if (viewport.width >= 768) {
        await expect(action.locator(".v19-actions-cell-city")).toHaveText("Москва");
        await expect(
          action.locator('.v19-actions-cell-action [title="Заменить селфи 1"]'),
        ).toBeVisible();
      }
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: join(evidenceDirectory, `${viewport.label}-after.png`),
      });

      const metrics = await captureActionEntranceMetrics(page);
      results.push({ viewport: viewport.label, ...metrics });

      const correctionFilter = page.getByRole("button", {
        name: /^Исправления: \d+$/,
      });
      await expect(correctionFilter).toBeVisible();

      if (viewport.width === 1440) {
        await expect(page.getByText("Кабинет агента", { exact: true })).toBeVisible();
        await expect(page.getByText("Агент Тони", { exact: true })).toBeVisible();
        await expect(page.getByText("Команда VisaFlow", { exact: true })).toBeVisible();
      }

      if (viewport.width === 320 || viewport.width === 390 || viewport.width === 768) {
        await expect(
          page
            .getByRole("button", { name: /Сортировка действий: По приоритету/ })
            .locator(".v19-admin-toolbar-select-value"),
        ).toBeVisible();
        await expect(
          page
            .getByRole("button", { name: /Фильтр городов: Города/ })
            .locator(".v19-admin-toolbar-select-value"),
        ).toBeVisible();
      }

      if (viewport.width === 390) {
        await correctionFilter.click();
        await expect(correctionFilter).toHaveAttribute("aria-pressed", "true");
      }

      await action.click();
      const inlineDetail = page
        .locator(
          '[data-testid="agent-action-inline-detail"]:visible, [data-testid="agent-action-mobile-detail"]:visible',
        )
        .first();
      await expect(inlineDetail).toBeVisible();
      await inlineDetail
        .locator('[data-v19-interaction-id="actions.open-primary"]')
        .click();
      const submissionDrawer = drawer(page);
      await expect(submissionDrawer).toBeVisible();
      await expect(submissionDrawer).toContainText("VF-1048");
      await expect(submissionDrawer.getByTestId("drawer-next-step")).toHaveText(
        "Загрузить: Мария Иванова • Селфи 1",
      );
      await expect(
        page.locator('.vf-figma-questionnaire-screen[data-submission-id="ПД-1048"]'),
      ).toHaveCount(0);
      await expect
        .poll(async () => Math.round((await submissionDrawer.boundingBox())?.y ?? 999))
        .toBeLessThanOrEqual(viewport.width <= 1023 ? 48 : 8);
      await expect
        .poll(async () => {
          const box = await submissionDrawer.boundingBox();
          return box ? Math.ceil(box.x + box.width - viewport.width) : 999;
        })
        .toBeLessThanOrEqual(0);
      await expect(submissionDrawer.getByTestId("drawer-primary-action")).toBeVisible();

      if (viewport.width === 390 || viewport.width === 1440) {
        await page.screenshot({
          animations: "disabled",
          fullPage: false,
          path: join(evidenceDirectory, `${viewport.label}-exact-target-drawer.png`),
        });
      }

      expect(metrics.rowCount).toBeGreaterThan(0);
      expect(metrics.documentWidth.scroll).toBeLessThanOrEqual(
        metrics.documentWidth.client + 1,
      );
      expect(metrics.rowOpacity).toEqual(Array(metrics.rowCount).fill("1"));
      expect(metrics.animationRecords.filter((record) => record.delay > 0)).toEqual([]);
    }

    writeFileSync(
      join(evidenceDirectory, "postfix-animation-metrics.json"),
      JSON.stringify(results, null, 2),
    );
    expect(browserProblems).toEqual([]);
  });

  test("reconciles the canonical queue through document correction, handoff, reload, and relogin", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, { heading: "Мои действия" });
    await completeReturnedQuestionnaireFixture(page);

    const firstReplacement = page
      .locator(
        '[data-testid="agent-action-queue-item"][data-agent-action-id^="replace-ПД-1048-"]',
      )
      .filter({ hasText: "Мария Иванова" })
      .first();
    await expect(firstReplacement).toBeVisible();
    const firstReplacementId =
      await firstReplacement.getAttribute("data-agent-action-id");
    expect(firstReplacementId).toBeTruthy();
    await firstReplacement.click();
    const selectedDetail = page.getByTestId("agent-action-inline-detail");
    await expect(selectedDetail).toBeVisible();
    await selectedDetail
      .locator('[data-v19-interaction-id="actions.open-primary"]')
      .click();

    const submissionDrawer = drawer(page);
    await expect(submissionDrawer).toBeVisible();
    await expect(submissionDrawer.getByTestId("drawer-next-step")).toHaveText(
      "Загрузить: Мария Иванова • Селфи 1",
    );
    await openDrawerTab(page, ["Замечания"]);
    await expect(submissionDrawer.getByText("Лицо обрезано.")).toBeVisible();
    await expect(submissionDrawer.getByText("Паспорт не читается.")).toBeVisible();

    const issueUploadInputs = submissionDrawer.getByLabel(/^Выбрать файл:/);
    for (let safety = 0; safety < 4; safety += 1) {
      const pendingIssueCount = await issueUploadInputs.count();
      if (pendingIssueCount === 0) break;
      const upload = issueUploadInputs.first();
      await upload.setInputFiles(syntheticSelfiePath);
      await expect(issueUploadInputs).toHaveCount(pendingIssueCount - 1);
    }
    await expect(issueUploadInputs).toHaveCount(0);
    const canonicalPreview = submissionDrawer.getByTestId(
      "agent-protected-media-preview-panel",
    );
    await expect(
      canonicalPreview.getByTestId("agent-protected-media-preview"),
    ).toBeVisible();
    await expect(canonicalPreview.getByRole("alert")).toHaveCount(0);
    await expect(
      page.locator(`[data-agent-action-id="${firstReplacementId}"]`),
    ).toHaveCount(0);
    await expect(page.getByTestId("agent-action-inline-detail")).toHaveCount(0);
    await expect(
      page.locator(
        '[data-testid="agent-action-queue-item"][data-agent-action-id="submit-corrections-ПД-1048"]',
      ),
    ).toHaveCount(0);
    await expect(
      submissionDrawer.getByRole("button", { name: "Отправить исправления" }),
    ).toHaveCount(0);

    const primaryAction = submissionDrawer.getByTestId("drawer-primary-action");
    for (let safety = 0; safety < 8; safety += 1) {
      const label = (await primaryAction.innerText()).trim();
      if (label === "Отправить исправления") break;
      if (
        label === "Подтвердите ручную проверку паспортных данных" ||
        label === "Заполните паспортные данные вручную"
      ) {
        const verifiedBefore = await page.evaluate(() => {
          const submissions = JSON.parse(
            localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
          ) as Array<{
            applicants?: Array<{ passportExtraction?: { verifiedAtIso?: string } }>;
            id?: string;
          }>;
          return (
            submissions
              .find((submission) => submission.id === "ПД-1048")
              ?.applicants?.filter(
                (applicant) => applicant.passportExtraction?.verifiedAtIso,
              ).length ?? 0
          );
        });
        await primaryAction.click();
        const questionnaire = page.locator(".vf-figma-questionnaire-screen");
        await expect(questionnaire).toBeVisible();
        await clickFirstVisible(
          questionnaire
            .locator(".v19-questionnaire-section-tab")
            .filter({ hasText: "Паспорт" }),
        );
        const confirmPassportReview = questionnaire.getByRole("button", {
          name: "Подтвердить ручную проверку паспорта",
        });
        await expect(confirmPassportReview).toBeEnabled();
        await confirmPassportReview.click();
        await expect(
          questionnaire.getByText("Ручная проверка паспорта подтверждена.").first(),
        ).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(() => {
              const submissions = JSON.parse(
                localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
              ) as Array<{
                applicants?: Array<{
                  passportExtraction?: { verifiedAtIso?: string };
                }>;
                id?: string;
              }>;
              return (
                submissions
                  .find((submission) => submission.id === "ПД-1048")
                  ?.applicants?.filter(
                    (applicant) => applicant.passportExtraction?.verifiedAtIso,
                  ).length ?? 0
              );
            }),
          )
          .toBe(verifiedBefore + 1);
        await questionnaire.getByRole("button", { name: "Назад" }).first().click();
        await expect(submissionDrawer).toBeVisible();
        continue;
      }
      expect(label).toMatch(/^Загрузить:/);
      const fileChooserPromise = page.waitForEvent("filechooser");
      await primaryAction.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(syntheticSelfiePath);
      await expect.poll(() => primaryAction.innerText()).not.toBe(label);
    }

    await expect(
      page.locator(
        '[data-testid="agent-action-queue-item"][data-agent-action-id="submit-corrections-ПД-1048"]',
      ),
    ).toHaveCount(1);

    await expect(
      submissionDrawer.getByRole("button", { name: "Отправить исправления" }),
    ).toBeEnabled();
    await submissionDrawer
      .getByRole("button", { name: "Отправить исправления" })
      .click();
    await expect(submissionDrawer.getByText("Исправления получены")).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="agent-action-queue-item"][data-submission-id="ПД-1048"]',
      ),
    ).toHaveCount(0);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: join(evidenceDirectory, "desktop-canonical-handoff.png"),
    });

    await submissionDrawer.getByRole("button", { name: "Закрыть подачу" }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { exact: true, level: 1, name: "Мои действия" }),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="agent-action-queue-item"][data-submission-id="ПД-1048"]',
      ),
    ).toHaveCount(0);

    await signOutAndLogin(
      page,
      { email: "2@2.ru", password: "22" },
      /^(Очередь на проверку|Проверка)$/,
    );
    await clickWorkspaceButton(page, /Проверка|Работа/);
    const correctionsTab = page
      .getByRole("tab", { name: /^(Правки|Исправления)/ })
      .first();
    if (await correctionsTab.isVisible()) await correctionsTab.click();
    await expect(
      page.locator('[data-submission-id="ПД-1048"]:visible').first(),
    ).toBeVisible();

    await signOutAndLogin(page, { email: "1@1.ru", password: "11" }, "Мои действия");
    await page.locator('[data-action-filter="completed"]').click();
    const completedHandoff = page.locator(
      '[data-testid="agent-action-queue-item"][data-submission-id="ПД-1048"]',
    );
    await expect(completedHandoff).toHaveAccessibleName(/Исправления на проверке/);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: join(evidenceDirectory, "desktop-relogin-canonical-readback.png"),
    });

    expect(browserProblems).toEqual([]);
  });

  test("connects sidebar search and Cmd/Ctrl+K to the existing command palette", async ({
    page,
  }) => {
    mkdirSync(evidenceDirectory, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, { heading: "Мои действия" });

    const trigger = page
      .getByRole("button", { name: "Открыть командную палитру" })
      .last();
    await trigger.click();
    const palette = page.getByRole("dialog", { name: "Командная палитра агента" });
    await expect(palette).toBeVisible();
    await expect(
      palette.locator('input[aria-label="Найти команду, действие или подачу"]'),
    ).toBeFocused();
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: join(evidenceDirectory, "desktop-command-palette.png"),
    });

    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible();
    await palette.getByText("Мои подачи", { exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();
    expect(browserProblems).toEqual([]);
  });
});
