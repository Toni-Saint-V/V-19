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

  test("keeps contained project-relative references supported", () => {
    const projectRoot = "/tmp/visaflow-project";

    expect(resolveTestArtifactReference("evidence/proof.md", projectRoot)).toBe(
      resolve(projectRoot, "evidence/proof.md"),
    );
  });

  test.each([
    "$V19_TEST_ARTIFACTS_DIR/../../outside-proof.md",
    "../outside-proof.md",
    "docs/../../outside-proof.md",
    "..\\outside-proof.md",
    "/tmp/visaflow-evidence/proof.md",
    "C:\\evidence\\proof.md",
    "\\\\server\\share\\proof.md",
    "~/proof.md",
    "file:///tmp/proof.md",
  ])("rejects non-portable or escaping reference %s", (reference) => {
    expect(resolveTestArtifactReference(reference, "/tmp/visaflow-project")).toBe("");
    expect(isPortableTrackedArtifactReference(reference)).toBe(false);
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
