import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

const configuredRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();

export const testArtifactsRoot = configuredRoot
  ? resolve(configuredRoot)
  : resolve(tmpdir(), "visaflow-v19");

export function testArtifactPath(...segments) {
  return resolve(testArtifactsRoot, ...segments);
}

const testArtifactsPlaceholder = "$V19_TEST_ARTIFACTS_DIR";
const windowsAbsolutePathPattern = /^[A-Za-z]:[\\/]/;

export function isPortableTrackedArtifactReference(reference) {
  const value = typeof reference === "string" ? reference.trim() : "";
  return !value || (!value.startsWith("/") && !windowsAbsolutePathPattern.test(value));
}

export function resolveTestArtifactReference(reference, baseDir = process.cwd()) {
  const value = typeof reference === "string" ? reference.trim() : "";
  if (!value) return "";

  if (value === testArtifactsPlaceholder) return testArtifactsRoot;
  if (value.startsWith(`${testArtifactsPlaceholder}/`)) {
    const suffix = value.slice(testArtifactsPlaceholder.length + 1);
    const resolved = resolve(testArtifactsRoot, suffix);
    const rootPrefix = testArtifactsRoot.endsWith(sep)
      ? testArtifactsRoot
      : `${testArtifactsRoot}${sep}`;

    return resolved === testArtifactsRoot || resolved.startsWith(rootPrefix)
      ? resolved
      : "";
  }

  return resolve(baseDir, value);
}
