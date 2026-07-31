import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const configuredRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();

export const testArtifactsRoot = configuredRoot
  ? resolve(configuredRoot)
  : resolve(tmpdir(), "visaflow-v19");

const maxTestEvidenceRunIdLength = 120;

export function normalizeTestEvidenceRunId(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  if (!normalized) return "run";
  if (normalized.length <= maxTestEvidenceRunIdLength) return normalized;

  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  const prefix = normalized
    .slice(0, maxTestEvidenceRunIdLength - digest.length - 1)
    .replace(/[.-]+$/g, "");

  return `${prefix || "run"}-${digest}`;
}

const githubEvidenceRunId = [
  process.env.GITHUB_HEAD_REF?.trim() || process.env.GITHUB_REF_NAME?.trim(),
  process.env.GITHUB_SHA?.trim().slice(0, 12),
  process.env.GITHUB_RUN_ID?.trim(),
  process.env.GITHUB_RUN_ATTEMPT?.trim(),
]
  .filter(Boolean)
  .join("-");
const fallbackEvidenceRunId = `local-${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")}-${process.pid}`;

export const testEvidenceRunId = normalizeTestEvidenceRunId(
  process.env.V19_EVIDENCE_RUN_ID?.trim() ||
    githubEvidenceRunId ||
    fallbackEvidenceRunId,
);

export function testArtifactPath(...segments: string[]): string {
  return resolve(testArtifactsRoot, ...segments);
}

export function testRunArtifactPath(...segments: string[]): string {
  return testArtifactPath("runs", testEvidenceRunId, ...segments);
}
