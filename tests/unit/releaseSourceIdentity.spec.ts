import { statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  releaseSourceSha256FromFileSystem,
  releaseSourceSha256FromGitHead,
} from "../../scripts/lib/release-source-identity.mjs";

describe("release source identity", () => {
  test("hashes committed production sources containing blobs larger than 1 MiB", () => {
    const repoRoot = process.cwd();
    const largeCommittedAsset = resolve(
      repoRoot,
      "public/tesseract/core/tesseract-core-lstm.wasm",
    );

    expect(statSync(largeCommittedAsset).size).toBeGreaterThan(1024 * 1024);
    expect(releaseSourceSha256FromGitHead(repoRoot)).toMatch(/^[0-9a-f]{64}$/);
    expect(releaseSourceSha256FromFileSystem(repoRoot)).toMatch(/^[0-9a-f]{64}$/);
  });
});
