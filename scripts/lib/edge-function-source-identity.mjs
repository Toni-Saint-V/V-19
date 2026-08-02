import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, posix, relative, resolve, sep } from "node:path";

const localSpecifierPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

export function edgeFunctionSourceFiles(repoRoot, functionName) {
  const functionsRoot = resolve(repoRoot, "supabase/functions");
  const entryPath = resolve(functionsRoot, functionName, "index.ts");
  if (!existsSync(entryPath)) {
    throw new Error(`Edge Function entry is missing: ${functionName}/index.ts`);
  }

  const pending = [entryPath];
  const visited = new Set();
  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (!currentPath || visited.has(currentPath)) continue;
    assertInsideFunctionsRoot(currentPath, functionsRoot);
    visited.add(currentPath);

    const source = readFileSync(currentPath, "utf8");
    for (const specifier of localSpecifiers(source)) {
      const dependencyPath = resolveLocalModule(currentPath, specifier);
      if (!dependencyPath) {
        throw new Error(
          `Local Edge Function import cannot be resolved: ${specifier} from ${relative(functionsRoot, currentPath)}`,
        );
      }
      assertInsideFunctionsRoot(dependencyPath, functionsRoot);
      pending.push(dependencyPath);
    }
  }

  return [...visited].sort().map((path) => ({
    path,
    relativePath: relative(functionsRoot, path).split(sep).join("/"),
  }));
}

export function edgeFunctionSourceSha256(repoRoot, functionName) {
  const hash = createHash("sha256");
  for (const sourceFile of edgeFunctionSourceFiles(repoRoot, functionName)) {
    hash.update(sourceFile.relativePath);
    hash.update("\0");
    hash.update(readFileSync(sourceFile.path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function edgeFunctionSourceSha256FromGitHead(repoRoot, functionName) {
  const functionsRoot = "supabase/functions";
  const entryPath = `${functionsRoot}/${functionName}/index.ts`;
  const trackedPaths = new Set(
    execFileSync(
      "git",
      ["ls-tree", "-r", "-z", "--name-only", "HEAD", "--", functionsRoot],
      { cwd: repoRoot, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  );
  if (!trackedPaths.has(entryPath)) {
    throw new Error(
      `Committed Edge Function entry is missing: ${functionName}/index.ts`,
    );
  }

  const pending = [entryPath];
  const sources = new Map();
  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (!currentPath || sources.has(currentPath)) continue;
    assertGitPathInsideFunctionsRoot(currentPath, functionsRoot);
    const content = execFileSync("git", ["show", `HEAD:${currentPath}`], {
      cwd: repoRoot,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
    });
    sources.set(currentPath, content);
    for (const specifier of localSpecifiers(content.toString("utf8"))) {
      const dependencyPath = resolveGitLocalModule(
        currentPath,
        specifier,
        trackedPaths,
      );
      if (!dependencyPath) {
        throw new Error(
          `Committed local Edge Function import cannot be resolved: ${specifier} from ${currentPath}`,
        );
      }
      assertGitPathInsideFunctionsRoot(dependencyPath, functionsRoot);
      pending.push(dependencyPath);
    }
  }

  const hash = createHash("sha256");
  for (const [path, content] of [...sources].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update(posix.relative(functionsRoot, path));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function localSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of [localSpecifierPattern, dynamicImportPattern]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith(".")) specifiers.add(match[1]);
    }
  }
  return specifiers;
}

function resolveLocalModule(importerPath, specifier) {
  const candidate = resolve(dirname(importerPath), specifier);
  const candidates = extname(candidate)
    ? [candidate]
    : [
        candidate,
        `${candidate}.ts`,
        `${candidate}.tsx`,
        `${candidate}.js`,
        `${candidate}.mjs`,
        resolve(candidate, "index.ts"),
      ];
  return candidates.find((path) => existsSync(path)) ?? "";
}

function resolveGitLocalModule(importerPath, specifier, trackedPaths) {
  const candidate = posix.normalize(posix.join(posix.dirname(importerPath), specifier));
  const candidates = posix.extname(candidate)
    ? [candidate]
    : [
        candidate,
        `${candidate}.ts`,
        `${candidate}.tsx`,
        `${candidate}.js`,
        `${candidate}.mjs`,
        posix.join(candidate, "index.ts"),
      ];
  return candidates.find((path) => trackedPaths.has(path)) ?? "";
}

function assertInsideFunctionsRoot(path, functionsRoot) {
  const relation = relative(functionsRoot, path);
  if (relation === "" || (!relation.startsWith("..") && !relation.startsWith(sep))) {
    return;
  }
  throw new Error(`Edge Function import escapes supabase/functions: ${path}`);
}

function assertGitPathInsideFunctionsRoot(path, functionsRoot) {
  const relation = posix.relative(functionsRoot, path);
  if (relation === "" || (!relation.startsWith("..") && !posix.isAbsolute(relation))) {
    return;
  }
  throw new Error(`Edge Function import escapes supabase/functions: ${path}`);
}
