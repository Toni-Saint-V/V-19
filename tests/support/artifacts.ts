import { tmpdir } from "node:os";
import { resolve } from "node:path";

const configuredRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();

export const testArtifactsRoot = configuredRoot
  ? resolve(configuredRoot)
  : resolve(tmpdir(), "visaflow-v19");

export function testArtifactPath(...segments: string[]): string {
  return resolve(testArtifactsRoot, ...segments);
}
