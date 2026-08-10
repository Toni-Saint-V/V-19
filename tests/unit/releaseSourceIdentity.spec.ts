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

  test("uses only the trusted Vercel Git SHA for a production archive and fails closed otherwise", () => {
    const vercelGitSha = "a".repeat(40);
    const archiveSourceSha256 = releaseSourceSha256FromFileSystem(process.cwd());

    expect(
      releaseBuildIdentity({
        isProductionArchive: true,
        root: process.cwd(),
        vercelGitSha,
      }),
    ).toEqual({
      dirty: false,
      gitSha: vercelGitSha,
      sourceSha256: archiveSourceSha256,
    });
    expect(() =>
      releaseBuildIdentity({
        isProductionArchive: true,
        root: process.cwd(),
        vercelGitSha: "not-a-sha",
      }),
    ).toThrow("VERCEL_GIT_COMMIT_SHA");
  });
});
