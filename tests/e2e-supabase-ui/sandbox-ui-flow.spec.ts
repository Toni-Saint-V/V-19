import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import {
  assertNoOverflow,
  clickAndWaitForSupabaseWrite,
  clickWorkspaceButton,
  collectBrowserProblems,
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

let runId = "";
let singleSubmissionId = "";
let familySubmissionId = "";

async function createAndSubmitSubmission(
  page: Parameters<typeof signIn>[0],
  assets: string[],
  type: "single" | "family",
) {
  await openCreateSubmission(page);
  const createDialog = drawer(page);

  if (type === "family") {
    await createDialog.getByRole("button", { name: "Семья" }).click();
  }

  await expect(createDialog.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
  await createDialog.locator(".pi-file-input").setInputFiles(type === "family" ? assets.slice(0, 2) : assets[0]);
  await expect(
    createDialog.getByRole("button", { name: "Создать и открыть анкету" }),
  ).toBeEnabled({ timeout: 60_000 });

  await clickAndWaitForSupabaseWrite(page, () =>
    createDialog.getByRole("button", { name: "Создать и открыть анкету" }).click(),
    /\/rest\/v1\/rpc\/save_submission_draft$/,
  );
  await expect(createDialog).toHaveCount(0);
  const submissionId = await fillQuestionnaire(page, `${runId}-${type}`);
  await clickWorkspaceButton(page, /Мои подачи/);
  await openSubmissionById(page, submissionId);
  await openDrawerTab(page, /Файлы/);
  await uploadVisibleRequiredFiles(page, assets);
  await openDrawerTab(page, /Анкета/);
  await drawer(page).getByRole("button", { name: "Открыть анкету" }).click();
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible();
  await expect(
    questionnaire.getByRole("button", { name: /Готово к проверке|Готово/ }),
  ).toBeEnabled({ timeout: 30_000 });
  await clickAndWaitForSupabaseWrite(page, () =>
    questionnaire.getByRole("button", { name: /Готово к проверке|Готово/ }).click(),
    /\/rest\/v1\/rpc\/save_submission_draft$/,
  );
  await questionnaire.getByRole("button", { name: "Назад" }).click();
  await expect(questionnaire).toHaveCount(0);
  await clickWorkspaceButton(page, /Мои подачи/);
  await openSubmissionById(page, submissionId);

  const passportReview = page.getByRole("button", { name: "Проверил, отправить" });
  if (await isVisible(passportReview)) {
    await clickAndWaitForSupabaseWrite(page, () => passportReview.click());
  }

  await expect(drawer(page)).toContainText(/На проверке|Отправлено на проверку/);
  return submissionId;
}

test.describe("V-19 Supabase sandbox UI-only closure", () => {
  test.describe.configure({ mode: "serial" });

  test("agent creates single and family submissions, completes them, and submits them through the UI", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("-desktop"), "Desktop lifecycle coverage only.");

    runId = `ui-${Date.now()}-${testInfo.workerIndex}`;
    const browserProblems = collectBrowserProblems(page);
    const assets = runAssets(runId, 6);

    await signIn(page, "agent");
    singleSubmissionId = await createAndSubmitSubmission(page, assets, "single");
    await page.keyboard.press("Escape");
    familySubmissionId = await createAndSubmitSubmission(page, assets.slice(2), "family");
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
    test.skip(!testInfo.project.name.endsWith("-desktop"), "Desktop role isolation coverage only.");

    expect(singleSubmissionId).not.toBe("");
    expect(familySubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "otherAgent");
    await clickWorkspaceButton(page, /Мои подачи/);
    const search = page.getByRole("searchbox").first();
    await expect(search).toBeVisible();
    await search.fill(singleSubmissionId);
    await expect(page.locator(`[data-submission-id="${singleSubmissionId}"]`)).toHaveCount(0);
    expect(browserProblems()).toEqual([]);
  });

  test("admin returns a real sandbox submission with a UI-created issue", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("-desktop"), "Desktop admin coverage only.");

    expect(singleSubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "admin");
    await expect(page.getByRole("heading", { level: 1, name: /Проверка|Очередь на проверку|Работа/ })).toBeVisible();
    await openSubmissionById(page, singleSubmissionId);
    await openDrawerTab(page, /Замечания/);
    await openDrawerTab(page, /Анкета/);
    await page.waitForTimeout(400);
    const fieldRemark = drawer(page).getByRole("button", { name: "Добавить замечание" }).first();
    await expect(fieldRemark).toBeVisible();
    await fieldRemark.scrollIntoViewIfNeeded();
    await fieldRemark.click({ force: true });
    const remark = page.getByRole("dialog", { name: "Новое замечание" });
    await expect(remark).toBeVisible();
    await remark.locator("textarea").nth(0).fill(`Проверить данные ${runId}`);
    await remark.locator("textarea").nth(1).fill(`Исправьте данные ${runId} и отправьте повторно.`);
    await clickAndWaitForSupabaseWrite(page, () =>
      remark.getByRole("button", { name: "Отправить замечание" }).click(),
    );
    await clickAndWaitForSupabaseWrite(page, () =>
      drawer(page).locator(".admin-review-primary").click(),
    );
    await expect(drawer(page)).toContainText(/Возвращено|Требуют действия/);
    expect(browserProblems()).toEqual([]);
  });

  test("agent fixes the returned submission and resubmits it through the UI", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("-desktop"), "Desktop correction coverage only.");

    expect(singleSubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Мои подачи/);
    await openSubmissionById(page, singleSubmissionId);
    await openDrawerTab(page, /Замечания/);

    const fixed = drawer(page).getByRole("button", {
      name: /Отметить (замечание )?исправленным/,
    });
    while ((await fixed.count()) > 0) {
      await clickAndWaitForSupabaseWrite(page, () => fixed.first().click());
    }

    await clickAndWaitForSupabaseWrite(page, () =>
      drawer(page).getByRole("button", { name: "Отправить исправления" }).click(),
    );
    await expect(drawer(page)).toContainText(/На проверке|Исправления отправлены/);
    expect(browserProblems()).toEqual([]);
  });

  test("admin accepts the corrected submission and downloads its export package through the UI", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("-desktop"), "Desktop export coverage only.");

    expect(singleSubmissionId).not.toBe("");
    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "admin");
    await openSubmissionById(page, singleSubmissionId);
    await clickAndWaitForSupabaseWrite(page, () =>
      drawer(page).locator(".admin-review-primary").click(),
    );
    await expect(drawer(page)).toContainText(/Готово к выгрузке|Готово/);

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(page.getByRole("heading", { level: 1, name: "Выгрузка" })).toBeVisible();
    const exportRow = page
      .locator(".export-row, .v19-admin-export-row")
      .filter({ hasText: singleSubmissionId })
      .first();
    await expect(exportRow).toBeVisible();
    await exportRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Сформировать Excel" }).click();
    const downloadButton = page.getByRole("button", { name: /Скачать ZIP файлов|Скачать ZIP с Excel/ });
    await expect(downloadButton).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    await expect(download.failure()).resolves.toBeNull();
    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+/);
    expect(browserProblems()).toEqual([]);
  });

  test("admin uploads and publishes the return package, then agent can download it", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("-desktop"), "Desktop PDF handoff coverage only.");

    const browserProblems = collectBrowserProblems(page);
    const pdfPath = resolve(process.cwd(), "docs/АнкетаPDF (1).pdf");
    await signIn(page, "admin");
    await clickWorkspaceButton(page, /Возврат/);
    await expect(page.getByRole("heading", { level: 1, name: "Возврат документов" })).toBeVisible();
    const returnScreen = page.getByTestId("admin-return-packages-screen");
    await expect(returnScreen).toBeVisible();
    const pdfInputs = returnScreen.locator('input[type="file"]');
    await expect(pdfInputs).toHaveCount(2);

    await clickAndWaitForSupabaseWrite(page, () => pdfInputs.nth(0).setInputFiles(pdfPath));
    await clickAndWaitForSupabaseWrite(page, () => pdfInputs.nth(1).setInputFiles(pdfPath));
    const publish = page.getByRole("button", { name: "Передать агенту" });
    await expect(publish).toBeEnabled();
    await clickAndWaitForSupabaseWrite(page, () => publish.click());
    await expect(returnScreen).toContainText(/Пакет опубликован|уже был передан/);

    await signOut(page);
    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Сбор документов|Документы/);
    const received = page.getByTestId("agent-return-packages-panel");
    await expect(received).toBeVisible();
    await expect(received).toContainText("PDF-список");
    await expect(received).toContainText("Готовая анкета");
    expect(browserProblems()).toEqual([]);
  });

  test("mobile sandbox navigation, drawer, and filters remain operable without overflow", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.endsWith("-desktop"), "Mobile-only interaction coverage.");

    const browserProblems = collectBrowserProblems(page);
    await signIn(page, "agent");
    await clickWorkspaceButton(page, /Мои подачи/);
    await expect(page.getByRole("heading", { level: 1, name: "Мои подачи" })).toBeVisible();

    const filter = page.getByRole("button", { name: /Фильтры подач|Фильтры/ }).first();
    if (await isVisible(filter)) {
      await filter.click();
      const dialog = page.getByRole("dialog").last();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
    }

    const firstSubmission = page.locator("[data-submission-id]").first();
    if (await isVisible(firstSubmission)) {
      await firstSubmission.click();
      await expect(drawer(page)).toBeVisible();
      await page.keyboard.press("Escape");
    }

    await assertNoOverflow(page);
    expect(browserProblems()).toEqual([]);
  });
});
