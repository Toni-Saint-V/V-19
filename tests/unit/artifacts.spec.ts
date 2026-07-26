import { sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeTestEvidenceRunId,
  testEvidenceRunId,
  testRunArtifactPath,
} from "../support/artifacts";

describe("test evidence artifact provenance", () => {
  it("normalizes branch, commit, and run metadata into a filesystem-safe id", () => {
    expect(
      normalizeTestEvidenceRunId(
        " codex/handoff-ui-360@3fe1e039 run:2026-07-26T18:30:00Z ",
      ),
    ).toBe("codex-handoff-ui-360-3fe1e039-run-2026-07-26T18-30-00Z");
  });

  it.each([".", "..", "..."])(
    "rejects the reserved path segment %s",
    (reservedSegment) => {
      expect(normalizeTestEvidenceRunId(reservedSegment)).toBe("run");
    },
  );

  it("bounds the run id to a portable path-segment length", () => {
    const normalized = normalizeTestEvidenceRunId(`branch/${"x".repeat(300)}`);

    expect(normalized.length).toBeLessThanOrEqual(120);
    expect(normalized).not.toMatch(/[.-]$/);
  });

  it("keeps long run ids distinct when their branch prefixes match", () => {
    const sharedBranch = `feature/${"x".repeat(180)}`;
    const firstRun = normalizeTestEvidenceRunId(`${sharedBranch}-aaaaaaaaaaaa-100-1`);
    const secondRun = normalizeTestEvidenceRunId(`${sharedBranch}-bbbbbbbbbbbb-101-1`);

    expect(firstRun).not.toBe(secondRun);
  });

  it("places evidence under the active run id", () => {
    const expectedSuffix = [
      "runs",
      testEvidenceRunId,
      "responsive-proof",
      "360x800.png",
    ].join(sep);

    expect(
      testRunArtifactPath("responsive-proof", "360x800.png").endsWith(expectedSuffix),
    ).toBe(true);
  });
});
