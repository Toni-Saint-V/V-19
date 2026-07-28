import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  isPortableTrackedArtifactReference,
  resolveTestArtifactReference,
  testArtifactPath,
  testArtifactsRoot,
} from "../../scripts/lib/artifact-paths.mjs";

describe("production evidence artifact references", () => {
  test("resolves the tracked artifact-root placeholder", () => {
    expect(resolveTestArtifactReference("$V19_TEST_ARTIFACTS_DIR")).toBe(
      testArtifactsRoot,
    );
    expect(
      resolveTestArtifactReference(
        "$V19_TEST_ARTIFACTS_DIR/release/production-evidence.md",
      ),
    ).toBe(testArtifactPath("release", "production-evidence.md"));
  });

  test("keeps ordinary project-relative and absolute references supported", () => {
    const projectRoot = "/tmp/visaflow-project";
    const absolute = "/tmp/visaflow-evidence/proof.md";

    expect(resolveTestArtifactReference("evidence/proof.md", projectRoot)).toBe(
      resolve(projectRoot, "evidence/proof.md"),
    );
    expect(resolveTestArtifactReference(absolute, projectRoot)).toBe(absolute);
  });

  test("rejects placeholder traversal outside the evidence root", () => {
    expect(
      resolveTestArtifactReference("$V19_TEST_ARTIFACTS_DIR/../../outside-proof.md"),
    ).toBe("");
  });

  test("rejects host-specific absolute paths in tracked evidence packets", () => {
    expect(
      isPortableTrackedArtifactReference(
        "$V19_TEST_ARTIFACTS_DIR/release/production-evidence.md",
      ),
    ).toBe(true);
    expect(isPortableTrackedArtifactReference("docs/evidence/proof.md")).toBe(true);
    expect(
      isPortableTrackedArtifactReference("/Users/operator/evidence/proof.md"),
    ).toBe(false);
    expect(isPortableTrackedArtifactReference("C:\\evidence\\proof.md")).toBe(false);
  });
});
