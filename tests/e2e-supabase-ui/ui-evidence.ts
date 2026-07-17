import { testArtifactPath } from "../support/artifacts";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

type UiEvidenceRole = "auth" | "agent" | "otherAgent" | "admin";

type CaptureUiEvidenceInput = {
  description: string;
  page: Page;
  role: UiEvidenceRole;
  step: string;
  submissionId?: string;
  testInfo: TestInfo;
};

export function uiEvidenceRunId(testInfo: TestInfo) {
  const runId = testInfo.config.metadata.uiEvidenceRunId;
  if (typeof runId !== "string" || !runId.trim()) {
    throw new Error("Playwright metadata.uiEvidenceRunId is required for screenshot evidence.");
  }
  return runId.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function uiEvidenceDirectory(testInfo: TestInfo) {
  const runId = uiEvidenceRunId(testInfo);
  if (!runId) {
    throw new Error("A fresh UI evidence run id is required.");
  }
  return testArtifactPath("supabase-production-pilot-10", `ui-e2e-full-flow-${runId}`);
}

function ensureEvidenceDirectory(testInfo: TestInfo) {
  const runId = uiEvidenceRunId(testInfo);
  const directory = uiEvidenceDirectory(testInfo);
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(
      resolve(directory, "MANIFEST.md"),
      [
        "# Sandbox full-flow UI evidence",
        "",
        `Run: \`${runId}\``,
        "",
        "Evidence rule: every row comes from a real browser state reached through UI interaction. Data is synthetic sandbox data; credentials are never captured.",
        "",
        "| Step | Role | Project / viewport | Submission | Description | Screenshot |",
        "| --- | --- | --- | --- | --- | --- |",
      ].join("\n") + "\n",
      { flag: "wx" },
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
  }
  return directory;
}

function safeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export async function captureUiEvidence({
  description,
  page,
  role,
  step,
  submissionId,
  testInfo,
}: CaptureUiEvidenceInput) {
  const directory = ensureEvidenceDirectory(testInfo);
  const safeStep = step.replace(/[^a-zA-Z0-9_-]/g, "-");
  const filename = `${testInfo.project.name}-${safeStep}.png`;
  const screenshotPath = resolve(directory, filename);
  const viewport = page.viewportSize();
  const viewportLabel = viewport ? `${viewport.width}x${viewport.height}` : "unknown";

  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: false,
    path: screenshotPath,
  });
  await testInfo.attach(`ui-evidence-${safeStep}`, {
    contentType: "image/png",
    path: screenshotPath,
  });
  appendFileSync(
    resolve(directory, "MANIFEST.md"),
    `| ${safeCell(step)} | ${role} | ${safeCell(`${testInfo.project.name} / ${viewportLabel}`)} | ${safeCell(submissionId ?? "-")} | ${safeCell(description)} | [${filename}](./${filename}) |\n`,
  );
}
