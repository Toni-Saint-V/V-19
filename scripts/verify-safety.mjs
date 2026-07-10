import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  ".playwright-mcp",
  "codex-context-export",
  "codex-plugin-export",
]);
const ignoredFiles = new Set([
  "codex-context-export.zip",
  "install-all-codex-plugins.zsh",
  "package-lock.json",
  "verify-safety.mjs",
]);
const ignoredSecretScanFiles = new Set([
  "scripts/verify-production-readiness.mjs",
  "tests/e2e-supabase/browser-key-audit.spec.ts",
]);
const ignoredExtensions = /\.(png|jpe?g|webp|gif|ico|zip|pdf|mp4|mov|xlsx?)$/i;

const copyScanRoots = ["index.html", "src", "supabase", join("docs", "prototypes")];

const forbiddenCopy = [
  ["одобрение", "визы"],
  ["шанс", "визы"],
  ["вероятность", "визы"],
  ["официальная", "проверка"],
  ["официальная", "подача"],
  ["официальная", "валидация"],
  ["official", "verification"],
  ["official", "validation"],
  ["visa", "guarantee"],
  ["approval", "probability"],
  ["automatic", "booking"],
  ["автоматическая", "запись"],
  ["интеграция", "с", "визовым", "центром"],
  ["гарантия", "результата"],
].map((parts) => parts.join(" "));

const secretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /SUPABASE_SERVICE_ROLE(?:_KEY)?["']?\s*[:=]\s*["'`]?[A-Za-z0-9._-]{20,}/i,
  /(?:service[_-]?role[_-]?key|serviceRoleKey)\s*[:=]/i,
  /BEGIN PRIVATE KEY/,
];

const failures = [];

function isCopyScanTarget(rel) {
  return copyScanRoots.some((target) => rel === target || rel.startsWith(`${target}/`));
}

function isLocalEnvFile(rel) {
  return rel === ".env.local" || /^\.env(?:\.[^.]+)+\.local$/.test(rel);
}

function walk(dir, mode) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    const rel = relative(root, path);

    if (stat.isDirectory()) {
      walk(path, mode);
      continue;
    }

    if (
      ignoredFiles.has(entry) ||
      ignoredExtensions.test(entry) ||
      isLocalEnvFile(rel)
    ) {
      continue;
    }

    const text = readFileSync(path, "utf8");
    const lower = text.toLowerCase();

    if (mode === "copy" && isCopyScanTarget(rel)) {
      for (const phrase of forbiddenCopy) {
        if (lower.includes(phrase.toLowerCase())) {
          failures.push(`${rel}: forbidden copy match`);
        }
      }
    }

    if (mode === "secrets" && !ignoredSecretScanFiles.has(rel)) {
      for (const pattern of secretPatterns) {
        if (pattern.test(text)) {
          failures.push(`${rel}: possible secret match`);
        }
      }
    }
  }
}

walk(root, "secrets");
walk(root, "copy");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Safety scan passed");
