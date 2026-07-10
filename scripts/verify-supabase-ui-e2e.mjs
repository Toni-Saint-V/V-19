import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const suiteDir = path.join(root, "tests/e2e-supabase-ui");
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
} else {
  for (const file of listFiles(suiteDir).filter((candidate) => /\.(?:ts|tsx)$/.test(candidate))) {
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

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function relative(filePath) {
  return path.relative(root, filePath);
}
