import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/production-agent-evidence-attestation.yml",
);

describe("production agent evidence attestation workflow", () => {
  test("fails closed until a protected runner captures provider-backed v2 evidence", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("blocked-until-runner-capture:");
    expect(workflow).toContain("Block assertion-only attestation");
    expect(workflow).toContain("trusted v2 evidence must be captured");
    expect(workflow).toContain("exit 1");
  });

  test("cannot mint provenance from owner-uploaded summaries", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).not.toContain("attest-build-provenance");
    expect(workflow).not.toContain("attestations: write");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toContain("gh release download");
    expect(workflow).not.toContain("V19_AGENT_INTERACTION_EVIDENCE_FILE");
  });
});
