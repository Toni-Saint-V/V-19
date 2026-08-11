import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { finishPassportExtraction } from "../../src/modules/submissions/passportExtraction";
import {
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "../unit/helpers/questionnaireTestFill";
import {
  clickFirstVisible,
  collectBrowserProblems,
  clickWorkspaceButton,
  drawer,
  expectAtLeastOneVisible,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const canonicalStorageKey = "visaflow.v19.submissions.v1";
const legacyIntakeStorageKey = "visaflow.v19.productIntakeDrafts.v1";

function evidencePath(
  testInfo: { outputPath: (name: string) => string },
  name: string,
) {
  const externalRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();
  return externalRoot
    ? join(externalRoot, "screenshots", name)
    : testInfo.outputPath(name);
}

function readySubmissionWithPendingPassportOcr(): Submission {
  const draft = createDraftSubmission({
    agentId: "local-agent-tony",
    applicantNames: ["Паспорт OCR"],
    city: "Самара",
    familyCount: 1,
    submissions: [],
    type: "single",
  });
  const ready = {
    ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft)),
    status: "in_progress" as const,
  };
  const passport = ready.files.find((file) => file.type === "passport_scan");
  if (!passport) throw new Error("Expected an uploaded passport fixture.");

  return finishPassportExtraction(ready, passport, {
    fields: [
      {
        confidence: "high",
        key: "passportNumber",
        needsManualReview: true,
        value: "765432100",
      },
    ],
    guardrails: [],
    source: "local-ocr",
    status: "extracted",
    summary: "Паспортные данные ожидают проверки администратора.",
  });
}

test.describe("V-19 privacy-safe passport intake proof", () => {
  test("keeps the review handoff actionable after all documents are ready", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const submission = readySubmissionWithPendingPassportOcr();

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await page.evaluate((currentSubmission) => {
      localStorage.setItem(
        "visaflow.v19.submissions.v1",
        JSON.stringify([currentSubmission]),
      );
    }, submission);
    await page.reload();
    await clickWorkspaceButton(page, /Мои подачи/);

    const card = page.locator(`[data-submission-id="${submission.id}"]`);
    await expect(card).toBeVisible();
    await card.click();

    const submissionDrawer = drawer(page);
    const submit = submissionDrawer.getByRole("button", {
      exact: true,
      name: "Отправить на проверку",
    });
    for (const viewport of [
      { height: 720, width: 320 },
      { height: 844, width: 390 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeVisible();
      await expect(submit).toBeEnabled();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
      await submissionDrawer.screenshot({
        path: evidencePath(testInfo, `submit-for-review-${viewport.width}.png`),
      });
    }

    await submit.click();
    await expect
      .poll(() =>
        page.evaluate((submissionId) => {
          const stored = JSON.parse(
            localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
          ) as Array<{ id?: string; status?: string }>;
          return stored.find((candidate) => candidate.id === submissionId)?.status;
        }, submission.id),
      )
      .toBe("submitted_for_review");
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate((submissionId) => {
          const stored = JSON.parse(
            localStorage.getItem("visaflow.v19.submissions.v1") ?? "[]",
          ) as Array<{ id?: string; status?: string }>;
          return stored.find((candidate) => candidate.id === submissionId)?.status;
        }, submission.id),
      )
      .toBe("submitted_for_review");

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("stores a synthetic manual-review passport only in the canonical draft", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await openFreshWorkspace(page, { heading: "Мои действия" });
    const createButton = page.getByRole("button", {
      name: /^(Создать пакет|Новая подача)$/,
    });
    await expectAtLeastOneVisible(createButton, "No visible create button matched.");
    await clickFirstVisible(createButton);

    const workspace = page.locator('[data-agent-screen="create"]');
    await expect(workspace).toBeVisible();
    await workspace.getByRole("radio", { name: "Заявитель" }).click();
    await workspace.getByLabel("Город подачи").click();
    await page.getByRole("option", { exact: true, name: "Самара" }).click();
    await workspace.locator('input[type="file"]').setInputFiles({
      buffer: Buffer.from([0x00, 0x00, 0x00, 0x18]),
      mimeType: "image/heic",
      name: "synthetic-passport.heic",
    });

    await expect(workspace.getByText("Вручную", { exact: true })).toBeVisible();
    await workspace.getByRole("button", { name: "Создать и открыть анкету" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /Анкета:/ }),
    ).toBeVisible();
    const questionnaire = page.locator(".vf-figma-questionnaire-screen");
    const passportSection = questionnaire
      .getByRole("button", { name: /^Паспорт/ })
      .first();
    await expect(passportSection).toBeVisible();
    await passportSection.click();
    const confirmPassportReview = questionnaire.getByRole("button", {
      name: "Подтвердить проверку паспорта",
    });
    await expect(confirmPassportReview).toBeVisible();
    for (const viewport of [
      { height: 720, width: 320 },
      { height: 844, width: 390 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await confirmPassportReview.scrollIntoViewIfNeeded();
      await expect(confirmPassportReview).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
      await questionnaire.screenshot({
        path: evidencePath(
          testInfo,
          `passport-review-confirmation-${viewport.width}.png`,
        ),
      });
    }
    await confirmPassportReview.click();

    await expect
      .poll(() =>
        page.evaluate(
          ({ canonicalKey, legacyKey }) => {
            const canonical = JSON.parse(
              localStorage.getItem(canonicalKey) ?? "[]",
            ) as Array<{
              city?: string;
              files?: Array<{
                originalFileName?: string;
                storageAdapter?: string;
                type?: string;
              }>;
            }>;
            const created = canonical.find((submission) =>
              submission.files?.some(
                (file) => file.originalFileName === "synthetic-passport.heic",
              ),
            );
            return {
              city: created?.city,
              legacyDraftExists: localStorage.getItem(legacyKey) !== null,
              storageAdapter: created?.files?.find(
                (file) => file.type === "passport_scan",
              )?.storageAdapter,
            };
          },
          { canonicalKey: canonicalStorageKey, legacyKey: legacyIntakeStorageKey },
        ),
      )
      .toEqual({
        city: "Самара",
        legacyDraftExists: false,
        storageAdapter: "local-dev",
      });

    await expect
      .poll(() =>
        page.evaluate(
          ({ canonicalKey }) => {
            const canonical = JSON.parse(
              localStorage.getItem(canonicalKey) ?? "[]",
            ) as Array<{
              applicants?: Array<{
                passportExtraction?: { verifiedAtIso?: string };
              }>;
              files?: Array<{ originalFileName?: string }>;
            }>;
            const created = canonical.find((submission) =>
              submission.files?.some(
                (file) => file.originalFileName === "synthetic-passport.heic",
              ),
            );
            return Boolean(created?.applicants?.[0]?.passportExtraction?.verifiedAtIso);
          },
          { canonicalKey: canonicalStorageKey },
        ),
      )
      .toBe(true);

    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(
          ({ canonicalKey }) => {
            const canonical = JSON.parse(
              localStorage.getItem(canonicalKey) ?? "[]",
            ) as Array<{
              applicants?: Array<{
                passportExtraction?: { verifiedAtIso?: string };
              }>;
              files?: Array<{ originalFileName?: string }>;
            }>;
            const created = canonical.find((submission) =>
              submission.files?.some(
                (file) => file.originalFileName === "synthetic-passport.heic",
              ),
            );
            return Boolean(created?.applicants?.[0]?.passportExtraction?.verifiedAtIso);
          },
          { canonicalKey: canonicalStorageKey },
        ),
      )
      .toBe(true);

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
