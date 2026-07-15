import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const suiteDir = path.join(root, "tests/e2e-supabase-ui");
const suiteEntryPath = path.join(suiteDir, "sandbox-ui-flow.spec.ts");
const configPath = path.join(root, "playwright.supabase-ui.config.ts");
const violations = [];

const forbiddenPatterns = [
  [/@supabase\/supabase-js/, "imports the Supabase SDK"],
  [/\bcreateClient\s*\(/, "creates a Supabase client"],
  [/\bpage\.route\s*\(/, "intercepts browser requests"],
  [/\broute\.fulfill\s*\(/, "fulfills an intercepted browser request"],
  [/\broute\.abort\s*\(/, "aborts a browser request"],
  [/VITE_E2E_[A-Z_]+/, "uses an E2E bypass or mock flag"],
  [/VITE_SUPABASE_BACKEND_TARGET\s*[:=]\s*["']local-demo/, "selects local-demo"],
  [
    /\b(?:supabase|client|storage)\.(?:from|insert|upsert|delete|update|upload|remove)\s*\(/,
    "contains a direct data or storage operation",
  ],
];

if (!fs.existsSync(suiteDir)) {
  violations.push("tests/e2e-supabase-ui is missing");
} else if (!fs.existsSync(suiteEntryPath)) {
  violations.push("tests/e2e-supabase-ui/sandbox-ui-flow.spec.ts is missing");
} else {
  for (const file of collectTypeScriptDependencies(suiteEntryPath)) {
    const source = fs.readFileSync(file, "utf8");
    for (const [pattern, description] of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relative(file)} ${description}`);
      }
    }
  }
}

if (!fs.existsSync(configPath)) {
  violations.push("playwright.supabase-ui.config.ts is missing");
} else {
  const config = fs.readFileSync(configPath, "utf8");
  for (const required of [
    'VITE_SUPABASE_BACKEND_TARGET: "supabase"',
    'VITE_SUPABASE_ACTIVATION_TARGET: "sandbox"',
    'VITE_SUPABASE_RELEASE_ENABLED: "false"',
  ]) {
    if (!config.includes(required)) {
      violations.push(`sandbox config is missing ${required}`);
    }
  }

  if (/production|local-demo/.test(config)) {
    violations.push("sandbox config mentions a non-sandbox target");
  }
}

if (violations.length) {
  console.error("Supabase UI E2E contract failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Supabase UI E2E contract passed: UI-only sandbox suite is clean.");

function collectTypeScriptDependencies(entryPath) {
  const pending = [entryPath];
  const visited = new Set();

  while (pending.length) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const source = fs.readFileSync(file, "utf8");
    const importPattern = /(?:from\s+|import\s*\()\s*["'](\.[^"']+)["']/g;
    for (const match of source.matchAll(importPattern)) {
      const dependency = resolveTypeScriptImport(path.dirname(file), match[1]);
      if (dependency) pending.push(dependency);
    }
  }

  return [...visited];
}

function resolveTypeScriptImport(directory, specifier) {
  const base = path.resolve(directory, specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

function relative(filePath) {
  return path.relative(root, filePath);
}
