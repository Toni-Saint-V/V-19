import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

import {
  compareReleaseSourcePaths,
  releaseBuildIdentity,
  releaseSourceSha256FromFileSystem,
  releaseSourceSha256FromGitHead,
} from "../../scripts/lib/release-source-identity.mjs";

describe("release source identity", () => {
  test("orders release paths bytewise without locale collation", () => {
    expect(["z", "ä"].sort(compareReleaseSourcePaths)).toEqual(["z", "ä"]);
  });

  test("hashes a clean checkout's production sources containing blobs larger than 1 MiB", () => {
    const repoRoot = process.cwd();
    const archiveRoot = mkdtempSync(join(tmpdir(), "v19-release-source-identity-"));
    const archivePath = join(archiveRoot, "source.tar");
    const largeCommittedAsset = resolve(
      repoRoot,
      "public/tesseract/core/tesseract-core-lstm.wasm",
    );

    expect(statSync(largeCommittedAsset).size).toBeGreaterThan(1024 * 1024);
    try {
      execFileSync(
        "git",
        ["archive", "--format=tar", `--output=${archivePath}`, "HEAD"],
        {
          cwd: repoRoot,
        },
      );
      execFileSync("tar", ["-xf", archivePath, "-C", archiveRoot]);
      rmSync(resolve(archiveRoot, "supabase"), { force: true, recursive: true });

      const gitSourceSha256 = releaseSourceSha256FromGitHead(repoRoot);
      const fileSourceSha256 = releaseSourceSha256FromFileSystem(archiveRoot);

      expect(gitSourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(fileSourceSha256).toBe(gitSourceSha256);
    } finally {
      rmSync(archiveRoot, { force: true, recursive: true });
    }
  });

  test("uses the supplied SHA pair only for a production archive and fails closed otherwise", () => {
    const archiveGitSha = "a".repeat(40);
    const archiveSourceSha256 = releaseSourceSha256FromFileSystem(process.cwd());

    expect(
      releaseBuildIdentity({
        archiveGitSha,
        archiveSourceSha256,
        isProductionArchive: true,
        root: process.cwd(),
      }),
    ).toEqual({
      dirty: false,
      gitSha: archiveGitSha,
      sourceSha256: archiveSourceSha256,
    });
    expect(() =>
      releaseBuildIdentity({
        archiveGitSha,
        isProductionArchive: true,
        root: process.cwd(),
      }),
    ).toThrow("V19_RELEASE_SOURCE_SHA256");
    expect(() =>
      releaseBuildIdentity({
        archiveGitSha: "not-a-sha",
        archiveSourceSha256,
        isProductionArchive: true,
        root: process.cwd(),
      }),
    ).toThrow("V19_RELEASE_GIT_SHA");
    expect(() =>
      releaseBuildIdentity({
        archiveGitSha,
        archiveSourceSha256: "b".repeat(64),
        isProductionArchive: true,
        root: process.cwd(),
      }),
    ).toThrow("must match the canonical production archive source");
  });
});
