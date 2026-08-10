import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const sourceDirectories = ["config", "public", "scripts", "src"];
const sourceSegmentNames = ["root", ...sourceDirectories];
const sourceFiles = [
  ".vercelignore",
  ".nvmrc",
  "index.html",
  "package-lock.json",
  "package.json",
  "postcss.config.js",
  "tailwind.config.js",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "vercel.json",
];
// Vercel materializes its own effective vercel.json before Vite executes. Keep
// the committed configuration in the canonical Git identity, but omit only
// that transformed build input from the archive identity emitted at runtime.
const archiveSourceFiles = sourceFiles.filter((path) => path !== "vercel.json");

export function releaseSourceSha256FromFileSystem(root) {
  return hashBlobEntries(releaseSourceEntriesFromFileSystem(root));
}

export function releaseSourceSegmentsFromFileSystem(root) {
  return hashSourceSegments(releaseSourceEntriesFromFileSystem(root));
}

export function releaseSourceRootFilesFromFileSystem(root) {
  return hashSourceRootFiles(releaseSourceEntriesFromFileSystem(root));
}

export function releaseArchiveSourceSha256FromFileSystem(root) {
  return hashBlobEntries(releaseSourceEntriesFromFileSystem(root, archiveSourceFiles));
}

export function releaseArchiveSourceSegmentsFromFileSystem(root) {
  return hashSourceSegments(
    releaseSourceEntriesFromFileSystem(root, archiveSourceFiles),
  );
}

export function releaseArchiveSourceRootFilesFromFileSystem(root) {
  return hashSourceRootFiles(
    releaseSourceEntriesFromFileSystem(root, archiveSourceFiles),
  );
}

function releaseSourceEntriesFromFileSystem(root, rootFiles = sourceFiles) {
  const paths = [
    ...new Set([
      ...rootFiles,
      ...sourceDirectories.flatMap((directory) => walk(resolve(root, directory), root)),
    ]),
  ]
    .filter(isReleaseSourcePath)
    .sort(compareReleaseSourcePaths);
  return paths.map((path) => [path, gitBlobSha1(readFileSync(resolve(root, path)))]);
}

export function releaseSourceSha256FromGitHead(root) {
  return hashBlobEntries(releaseSourceEntriesFromGitHead(root));
}

export function releaseSourceSegmentsFromGitHead(root) {
  return hashSourceSegments(releaseSourceEntriesFromGitHead(root));
}

export function releaseSourceRootFilesFromGitHead(root) {
  return hashSourceRootFiles(releaseSourceEntriesFromGitHead(root));
}

export function releaseArchiveSourceSha256FromGitHead(root) {
  return hashBlobEntries(releaseSourceEntriesFromGitHead(root, archiveSourceFiles));
}

export function releaseArchiveSourceSegmentsFromGitHead(root) {
  return hashSourceSegments(releaseSourceEntriesFromGitHead(root, archiveSourceFiles));
}

export function releaseArchiveSourceRootFilesFromGitHead(root) {
  return hashSourceRootFiles(releaseSourceEntriesFromGitHead(root, archiveSourceFiles));
}

function releaseSourceEntriesFromGitHead(root, rootFiles = sourceFiles) {
  const tree = execFileSync(
    "git",
    ["ls-tree", "-r", "-z", "HEAD", "--", ...sourceDirectories, ...rootFiles],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return tree
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t");
      const metadata = entry.slice(0, tab).split(" ");
      return [entry.slice(tab + 1), metadata[2]];
    })
    .filter(([path]) => isReleaseSourcePath(path))
    .sort(([left], [right]) => compareReleaseSourcePaths(left, right));
}

export function compareReleaseSourcePaths(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function releaseBuildIdentity({ root, isProductionArchive, vercelGitSha }) {
  if (isProductionArchive) {
    if (!isSha(vercelGitSha, 40)) {
      throw new Error(
        "VERCEL_GIT_COMMIT_SHA must be a 40-character hexadecimal SHA for a production build.",
      );
    }
    return {
      dirty: false,
      gitSha: vercelGitSha,
      sourceSha256: releaseSourceSha256FromFileSystem(root),
    };
  }

  const gitSha =
    vercelGitSha ||
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  return {
    dirty: vercelGitSha
      ? false
      : Boolean(
          execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
            cwd: root,
            encoding: "utf8",
          }).trim(),
        ),
    gitSha,
    sourceSha256: releaseSourceSha256FromFileSystem(root),
  };
}

function isReleaseSourcePath(path) {
  return (
    !path.startsWith("config/playwright/") &&
    !path.startsWith("supabase/.temp/") &&
    !path.startsWith("supabase/.branches/")
  );
}

function walk(directory, root) {
  const entries = [];
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const path = relative(root, absolute);
    const metadata = statSync(absolute);
    if (metadata.isDirectory()) entries.push(...walk(absolute, root));
    else if (metadata.isFile()) entries.push(path);
  }
  return entries;
}

function gitBlobSha1(content) {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

function hashBlobEntries(entries) {
  const hash = createHash("sha256");
  for (const [path, blobSha1] of entries) {
    hash.update(path);
    hash.update("\0");
    hash.update(blobSha1);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashSourceSegments(entries) {
  const segments = Object.fromEntries(sourceSegmentNames.map((name) => [name, []]));
  for (const entry of entries) {
    const [path] = entry;
    const segment = sourceDirectories.find(
      (directory) => path === directory || path.startsWith(`${directory}/`),
    );
    segments[segment ?? "root"].push(entry);
  }
  return Object.fromEntries(
    sourceSegmentNames.map((name) => [name, hashBlobEntries(segments[name])]),
  );
}

function hashSourceRootFiles(entries) {
  return Object.fromEntries(
    entries
      .filter(([path]) => !path.includes("/"))
      .map(([path, blobSha1]) => [path, hashBlobEntries([[path, blobSha1]])]),
  );
}

function isSha(value, length) {
  return (
    typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value)
  );
}
