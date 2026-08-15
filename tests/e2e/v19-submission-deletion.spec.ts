import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { normalizeTestEvidenceRunId, testArtifactPath } from "../support/artifacts";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

function deletionProofPath(fileName: string) {
  const proofRunId = normalizeTestEvidenceRunId(
    process.env.V19_PROOF_RUN_ID?.trim() || `run-${Date.now()}-${process.pid}`,
  );
  const proofDirectory = testArtifactPath("submission-deletion-proof", proofRunId);
  mkdirSync(proofDirectory, { recursive: true });
  return join(proofDirectory, fileName);
}

test("agent confirms and deletes an owned draft from My submissions", async ({
  page,
}) => {
  const browserProblems = collectBrowserProblems(page);
  await page.setViewportSize({ height: 900, width: 1440 });
  await openFreshWorkspace(page, { heading: "Мои действия" });

  const source = initialSubmissions.find((submission) => submission.type === "single");
  if (!source) throw new Error("single submission fixture is required");
  const draft = {
    ...source,
    agentId: "local-agent-tony",
    id: "ПД-E2E-DELETE",
    publicNumber: null,
    status: "draft" as const,
    title: "Черновик для удаления",
  };
  await page.evaluate((submission) => {
    localStorage.setItem(
      "visaflow.v19.submissions.v1",
      JSON.stringify([submission]),
    );
  }, draft);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Мои действия" })).toBeVisible();
  await page.getByRole("button", { name: "Мои подачи" }).click();
  await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();

  const card = page.locator(`[data-submission-id="${draft.id}"]`);
  const deleteButton = page.getByRole("button", { name: /Удалить подачу:/ });
  await expect(card).toBeVisible();
  await deleteButton.click();
  const dialog = page.getByRole("dialog", { name: "Удалить эту подачу?" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({
    fullPage: true,
    path: deletionProofPath("delete-confirmation.png"),
  });
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(card).toBeVisible();

  await deleteButton.click();
  await dialog.getByRole("button", { name: "Удалить" }).click();
  await expect(card).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate((submissionId) => {
        const raw = localStorage.getItem("visaflow.v19.submissions.v1");
        if (!raw) return false;
        const submissions = JSON.parse(raw) as Array<{ id?: string }>;
        return submissions.some((submission) => submission.id === submissionId);
      }, draft.id),
    )
    .toBe(false);
  await page.screenshot({
    fullPage: true,
    path: deletionProofPath("submission-deleted.png"),
  });
  expect(browserProblems).toEqual([]);
});
