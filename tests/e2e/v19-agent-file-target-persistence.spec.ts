import { mkdirSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import {
  clickFirstVisible,
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  openMobileMenu,
  openFreshWorkspace,
} from "./v19-pilot-helpers";
import { expect, test } from "./v19-localhost-test";
import { testRunArtifactPath } from "../support/artifacts";

const syntheticSelfiePath = path.resolve(
  "tests/fixtures/production-media/E2E_TEST_PERSON_ONE_910000001.png",
);

const viewportMatrix = [
  { height: 844, label: "390x844", width: 390 },
  { height: 1024, label: "768x1024", width: 768 },
  { height: 900, label: "1440x900", width: 1440 },
] as const;
const evidenceRoot = testRunArtifactPath("agent-protected-media");

async function saveEvidence(page: Page, fileName: string) {
  mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: testRunArtifactPath("agent-protected-media", fileName),
  });
}

async function openFamilySubmission(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Мои подачи/);

  await page.getByRole("button", { name: /Тип подачи:/ }).click();
  await page.getByRole("option", { name: "Семья", exact: true }).click();

  await page.locator(`[data-submission-id="${submissionId}"]`).click();
  return drawer(page);
}

function selfieIssue(submissionDrawer: ReturnType<typeof drawer>) {
  return submissionDrawer.locator("article").filter({ hasText: "Лицо обрезано" });
}

async function expectProtectedPreview(submissionDrawer: ReturnType<typeof drawer>) {
  const panel = submissionDrawer.getByTestId("agent-protected-media-preview-panel");
  const image = panel.getByTestId("agent-protected-media-preview");
  await expect(panel).toBeVisible();
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  await expect(panel.getByRole("alert")).toHaveCount(0);
}

async function clearLocalDemoMedia(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("visaflow-local-demo-media-v1", 1);
      request.onerror = () =>
        reject(request.error ?? new Error("Local media database is unavailable."));
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("media", "readwrite");
        transaction.objectStore("media").clear();
        transaction.onerror = () =>
          reject(
            transaction.error ?? new Error("Local media cleanup transaction failed."),
          );
        transaction.onabort = () =>
          reject(
            transaction.error ?? new Error("Local media cleanup transaction aborted."),
          );
        transaction.oncomplete = () => resolve();
      });
    } finally {
      database.close();
    }
  });
}

async function signOutAndLogin(
  page: Page,
  credentials: { email: string; password: string },
  expectedHeading: string | RegExp,
) {
  await openMobileMenu(page);
  await clickFirstVisible(page.getByRole("button", { exact: true, name: "Выйти" }));

  const emailInput = page.locator("#workspace-email");
  const loginTab = page.getByRole("button", {
    exact: true,
    name: "Уже есть доступ? Войти",
  });
  await expect(emailInput.or(loginTab)).toBeVisible();
  if (await loginTab.isVisible()) {
    await loginTab.click();
  }
  await emailInput.fill(credentials.email);
  await page.locator("#workspace-password").fill(credentials.password);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: expectedHeading,
    }),
  ).toBeVisible();
}

for (const viewport of viewportMatrix) {
  test(`keeps canonical protected media through reload and role isolation at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const browserProblems = collectBrowserProblems(page);
    await openFreshWorkspace(page, { heading: "Мои действия" });

    const submissionDrawer = await openFamilySubmission(page, "ПД-1048");
    await submissionDrawer.getByRole("tab", { name: /Замечания/ }).click();

    const issue = selfieIssue(submissionDrawer);
    await issue
      .getByLabel("Выбрать файл: Мария Иванова • Селфи 1")
      .setInputFiles(syntheticSelfiePath);

    const openFile = issue.getByRole("button", {
      name: "Открыть файл",
      exact: true,
    });
    await expect(openFile).toBeVisible();
    await openFile.click();

    await expect(submissionDrawer).toBeVisible();
    await expect(
      submissionDrawer.getByRole("tab", { name: "Обзор", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    const canonicalRow = submissionDrawer.locator("#workspace-media-з-1048-1-selfie");
    await expect(canonicalRow).toBeFocused();
    await expect(canonicalRow).toHaveClass(/is-complete/);
    await expectProtectedPreview(submissionDrawer);
    await saveEvidence(page, `${viewport.label}-canonical-readback.png`);

    await submissionDrawer.getByRole("button", { name: "Закрыть подачу" }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои действия" }),
    ).toBeVisible();

    const reloadedDrawer = await openFamilySubmission(page, "ПД-1048");
    await reloadedDrawer.getByRole("tab", { name: /Замечания/ }).click();
    const reloadedIssue = selfieIssue(reloadedDrawer);
    await reloadedIssue
      .getByRole("button", { name: "Открыть файл", exact: true })
      .click();
    await expect(
      reloadedDrawer.locator("#workspace-media-з-1048-1-selfie"),
    ).toHaveClass(/is-complete/);
    await expectProtectedPreview(reloadedDrawer);
    await saveEvidence(page, `${viewport.label}-reload-readback.png`);

    await reloadedDrawer.getByRole("button", { name: "Закрыть подачу" }).click();
    const otherSubmissionDrawer = await openFamilySubmission(page, "ПД-1054");
    await expect(
      otherSubmissionDrawer.getByTestId("agent-protected-media-preview-panel"),
    ).toHaveCount(0);
    await otherSubmissionDrawer.getByRole("button", { name: "Закрыть подачу" }).click();

    await signOutAndLogin(
      page,
      { email: "2@2.ru", password: "22" },
      /^(Очередь на проверку|Проверка)$/,
    );
    await expect(page.getByTestId("agent-protected-media-preview-panel")).toHaveCount(
      0,
    );

    await signOutAndLogin(page, { email: "1@1.ru", password: "11" }, "Мои действия");
    const roleReadbackDrawer = await openFamilySubmission(page, "ПД-1048");
    await roleReadbackDrawer.getByRole("tab", { name: /Замечания/ }).click();
    await selfieIssue(roleReadbackDrawer)
      .getByRole("button", { name: "Открыть файл", exact: true })
      .click();
    await expectProtectedPreview(roleReadbackDrawer);
    await saveEvidence(page, `${viewport.label}-role-readback.png`);

    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      )
      .toBe(true);
    expect(browserProblems).toEqual([]);
  });
}

test("fails closed when canonical metadata points to a missing protected object", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  const browserProblems = collectBrowserProblems(page);
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const submissionDrawer = await openFamilySubmission(page, "ПД-1048");
  await submissionDrawer.getByRole("tab", { name: /Замечания/ }).click();
  const issue = selfieIssue(submissionDrawer);
  await issue
    .getByLabel("Выбрать файл: Мария Иванова • Селфи 1")
    .setInputFiles(syntheticSelfiePath);
  const openFile = issue.getByRole("button", {
    name: "Открыть файл",
    exact: true,
  });
  await expect(openFile).toBeVisible();

  await clearLocalDemoMedia(page);
  await openFile.click();

  const panel = submissionDrawer.getByTestId("agent-protected-media-preview-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText("Защищённый объект отсутствует");
  await expect(panel.getByText("Файл не загружен", { exact: true })).toHaveCount(0);
  const retryReadback = panel.getByRole("button", {
    name: "Повторить чтение",
    exact: true,
  });
  await expect(retryReadback).toBeVisible();
  await retryReadback.click();
  await expect(panel.getByRole("alert")).toContainText("Защищённый объект отсутствует");
  await expect(
    submissionDrawer.locator("#workspace-media-з-1048-1-selfie"),
  ).toHaveClass(/is-complete/);
  await saveEvidence(page, "1440x900-missing-object-error.png");

  expect(browserProblems).toEqual([]);
});
