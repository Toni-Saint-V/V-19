import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

const configuredRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();

export const testArtifactsRoot = configuredRoot
  ? resolve(configuredRoot)
  : resolve(tmpdir(), "visaflow-v19");

export function testArtifactPath(...segments) {
  return resolve(testArtifactsRoot, ...segments);
}

const testArtifactsPlaceholder = "$V19_TEST_ARTIFACTS_DIR";
const windowsAbsolutePathPattern = /^[A-Za-z]:[\\/]/;
const uriSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function isContainedPath(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

export function isPortableTrackedArtifactReference(reference) {
  const value = typeof reference === "string" ? reference.trim() : "";
  if (!value) return true;
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.startsWith("~") ||
    value.includes("\\") ||
    windowsAbsolutePathPattern.test(value) ||
    uriSchemePattern.test(value)
  ) {
    return false;
  }

  const normalized =
    value === testArtifactsPlaceholder
      ? ""
      : value.startsWith(`${testArtifactsPlaceholder}/`)
        ? value.slice(testArtifactsPlaceholder.length + 1)
        : value;
  return !normalized.split("/").some((segment) => segment === "..");
}

export function resolveTestArtifactReference(reference, baseDir = process.cwd()) {
  const value = typeof reference === "string" ? reference.trim() : "";
  if (!value) return "";
  if (!isPortableTrackedArtifactReference(value)) return "";

  if (value === testArtifactsPlaceholder) return testArtifactsRoot;
  if (value.startsWith(`${testArtifactsPlaceholder}/`)) {
    const suffix = value.slice(testArtifactsPlaceholder.length + 1);
    const resolved = resolve(testArtifactsRoot, suffix);
    return isContainedPath(testArtifactsRoot, resolved) ? resolved : "";
  }

  const root = resolve(baseDir);
  const resolved = resolve(root, value);
  return isContainedPath(root, resolved) ? resolved : "";
}
