import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function read(file) {
  try {
    return readFileSync(path.join(root, file), "utf8");
  } catch {
    return "";
  }
}

const changed = git(["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD", "--"])
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

if (changed.length === 0) {
  process.exit(0);
}

const has = (predicate) => changed.some(predicate);
const touched = (needle) =>
  has((file) => file === needle || file.startsWith(`${needle}/`));

const uiTouched = has(
  (file) =>
    file === "src/App.tsx" ||
    file === "src/styles.css" ||
    file.startsWith("src/components/") ||
    file.startsWith("tests/e2e/"),
);

const promptTouched = has(
  (file) =>
    file === "AGENTS.md" ||
    file === "docs/CODEX_OPERATING_MEMO.md" ||
    file.startsWith(".codex/prompts/") ||
    file === ".codex/hooks.json",
);

const dependencyTouched = has((file) =>
  /^package(-lock)?\.json$|^pnpm-lock\.yaml$|^yarn\.lock$/.test(file),
);

const sensitiveTouched = has((file) =>
  [
    /^src\/services\/auth/i,
    /^src\/services\/storage/i,
    /^src\/lib\/supabase\//i,
    /(^|\/)(schema|migration|database|admin)(\/|\.|$)/i,
    /(^|\/)(vercel|netlify|deploy|deployment)(\/|\.|$)/i,
    /^\.env/i,
  ].some((pattern) => pattern.test(file)),
);

const srcTouched = touched("src") || touched("tests") || dependencyTouched;
const docsQaTouched = touched("docs/qa");

const changedTextFiles = changed.filter((file) =>
  /\.(md|mdx|txt|ts|tsx|js|jsx|json|css|html|mjs|cjs|toml|yml|yaml)$/.test(file),
);

const combinedText = changedTextFiles.map(read).join("\n");

const staleReportFields = /(^|\n)(Risks:|Readiness:|Next mode:)(\n|$)/.test(
  combinedText,
);
const trustCopyText = changedTextFiles
  .filter(
    (file) =>
      ![
        "AGENTS.md",
        "docs/CODEX_OPERATING_MEMO.md",
        ".codex/hooks.json",
        "scripts/codex-quality-radar.mjs",
      ].includes(file) && !file.startsWith(".codex/prompts/"),
  )
  .map(read)
  .join("\n");
const forbiddenTrustCopy =
  /\bofficial\b|официальн|approval probability|вероятност[ьи]\s+одобрени|visa guarantee|гарант[а-яё]*\s+виз/i.test(
    trustCopyText,
  );

const signals = [];
const proof = new Set();

if (promptTouched && staleReportFields) {
  signals.push(
    "old final-report fields detected; use QA findings, Readiness delta, Remaining risks, Next highest-impact task",
  );
  proof.add(
    'rg -n "Risks:|Readiness:|Next mode:" AGENTS.md docs/CODEX_OPERATING_MEMO.md .codex/prompts',
  );
}

if (uiTouched && !docsQaTouched) {
  signals.push(
    "UI/runtime files changed without new docs/qa screenshot evidence in the current diff",
  );
  proof.add(
    "Browser/Computer Use QA with desktop start/final and mobile final screenshots",
  );
  proof.add("npm run test:e2e");
}

if (sensitiveTouched) {
  signals.push(
    "scope-sensitive surface touched: auth/storage/supabase/schema/deploy/admin requires explicit scope confirmation",
  );
  proof.add("npm run verify:security");
}

if (dependencyTouched) {
  signals.push("dependency manifest changed; security and runtime proof required");
  proof.add("npm run verify:security");
  proof.add("npm run verify");
}

if (forbiddenTrustCopy) {
  signals.push(
    "possible trust-copy violation detected: official/probability/guarantee language needs safety review",
  );
  proof.add("npm run verify:safety");
}

if (srcTouched) {
  proof.add("npm run verify");
}

if (promptTouched) {
  proof.add("npm run format:check");
}

if (signals.length === 0) {
  process.exit(0);
}

console.log(`\nCODEX QUALITY RADAR`);
console.log(
  `Changed files: ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? `, +${changed.length - 8} more` : ""}`,
);
console.log("Signals:");
for (const signal of signals) {
  console.log(`- ${signal}`);
}
if (proof.size > 0) {
  console.log("Smallest useful proof:");
  for (const item of proof) {
    console.log(`- ${item}`);
  }
}
