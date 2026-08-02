import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const sourceDirectories = ["config", "public", "scripts", "src", "supabase"];
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

export function releaseSourceSha256FromFileSystem(root) {
  const paths = [
    ...new Set([
      ...sourceFiles,
      ...sourceDirectories.flatMap((directory) => walk(resolve(root, directory), root)),
    ]),
  ]
    .filter(isReleaseSourcePath)
    .sort();
  return hashBlobEntries(
    paths.map((path) => [path, gitBlobSha1(readFileSync(resolve(root, path)))]),
  );
}

export function releaseSourceSha256FromGitHead(root) {
  const tree = execFileSync(
    "git",
    ["ls-tree", "-r", "-z", "HEAD", "--", ...sourceDirectories, ...sourceFiles],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const entries = tree
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t");
      const metadata = entry.slice(0, tab).split(" ");
      return [entry.slice(tab + 1), metadata[2]];
    })
    .filter(([path]) => isReleaseSourcePath(path))
    .sort(([left], [right]) => left.localeCompare(right));
  return hashBlobEntries(entries);
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
