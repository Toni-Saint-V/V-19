import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
  "resolutions",
];

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function repoRoot() {
  return git(["rev-parse", "--show-toplevel"], process.cwd()) || process.cwd();
}

function readFromRoot(root, file) {
  try {
    return readFileSync(path.join(root, file), "utf8");
  } catch {
    return "";
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }

  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value ?? {}));
}

function packageDependenciesChanged(root, changed) {
  const packageChanged = changed.includes("package.json");
  const lockfileChanged = changed.some((file) =>
    /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(file),
  );

  if (lockfileChanged) {
    return true;
  }

  if (!packageChanged) {
    return false;
  }

  const before = parseJson(git(["show", "HEAD:package.json"], root));
  const after = parseJson(readFromRoot(root, "package.json"));

  if (!before || !after) {
    return true;
  }

  return DEPENDENCY_FIELDS.some(
    (field) => stableJson(before[field]) !== stableJson(after[field]),
  );
}

function packageScriptsChanged(root, changed) {
  if (!changed.includes("package.json")) {
    return false;
  }

  const before = parseJson(git(["show", "HEAD:package.json"], root));
  const after = parseJson(readFromRoot(root, "package.json"));

  if (!before || !after) {
    return true;
  }

  return stableJson(before.scripts) !== stableJson(after.scripts);
}

function isTextFile(file) {
  return /\.(md|mdx|txt|ts|tsx|js|jsx|json|css|html|mjs|cjs|toml|yml|yaml)$/.test(file);
}

function analyze({ changed, readFile, dependencyChanged, scriptsChanged }) {
  const has = (predicate) => changed.some(predicate);
  const touched = (needle) =>
    has((file) => file === needle || file.startsWith(`${needle}/`));

  const uiTouched = has(
    (file) =>
      file === "src/App.tsx" ||
      file === "src/styles.css" ||
      file.startsWith("src/components/"),
  );

  const workflowTouched = has(
    (file) =>
      file === "AGENTS.md" ||
      file === "docs/CODEX_OPERATING_MEMO.md" ||
      file.startsWith(".codex/prompts/") ||
      file === ".codex/hooks.json" ||
      file === "scripts/codex-quality-radar.mjs" ||
      scriptsChanged,
  );

  const sensitiveTouched = has((file) =>
    [
      /^src\/services\/auth/i,
      /^src\/services\/storage/i,
      /^src\/lib\/supabase\//i,
      /^supabase\//i,
      /(^|\/)(schema|migration|database|admin)(\/|\.|$)/i,
      /(^|\/)(vercel|netlify|deploy|deployment)(\/|\.|$)/i,
      /^\.env/i,
    ].some((pattern) => pattern.test(file)),
  );

  const sourceTouched = touched("src") || touched("tests");
  const docsQaTouched = touched("docs/qa");
  const changedTextFiles = changed.filter(isTextFile);
  const combinedText = changedTextFiles.map(readFile).join("\n");

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
    .map(readFile)
    .join("\n");

  const forbiddenTrustCopy =
    /\bofficial\b|официальн|approval probability|вероятност[ьи]\s+одобрени|visa guarantee|гарант[а-яё]*\s+виз/i.test(
      trustCopyText,
    );

  const signals = [];
  const proof = new Set();

  if (workflowTouched) {
    signals.push("Codex workflow or hook changed; prove the operating rules still run");
    proof.add("npm run verify:codex-hook");
    proof.add("npm run format:check");
  }

  if (workflowTouched && staleReportFields) {
    signals.push(
      "old final-report fields detected; use QA findings, Readiness delta, Remaining risks, Next highest-impact task",
    );
    proof.add(
      'rg -n "Risks:|Readiness:|Next mode:" AGENTS.md docs/CODEX_OPERATING_MEMO.md .codex/prompts',
    );
  }

  if (uiTouched && !docsQaTouched) {
    signals.push(
      "UI files changed without new docs/qa screenshot evidence in the current diff",
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

  if (dependencyChanged) {
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

  if (sourceTouched) {
    proof.add("npm run verify");
  }

  return {
    changed,
    proof: [...proof],
    signals,
  };
}

function collectRuntimeInput(root) {
  const changed = git(
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD", "--"],
    root,
  )
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  return {
    changed,
    dependencyChanged: packageDependenciesChanged(root, changed),
    readFile: (file) => readFromRoot(root, file),
    scriptsChanged: packageScriptsChanged(root, changed),
  };
}

function printReport(result) {
  if (result.signals.length === 0) {
    return;
  }

  console.log("\nCODEX QUALITY RADAR");
  console.log(
    `Changed files: ${result.changed.slice(0, 8).join(", ")}${
      result.changed.length > 8 ? `, +${result.changed.length - 8} more` : ""
    }`,
  );
  console.log("Signals:");
  for (const signal of result.signals) {
    console.log(`- ${signal}`);
  }
  if (result.proof.length > 0) {
    console.log("Smallest useful proof:");
    for (const item of result.proof) {
      console.log(`- ${item}`);
    }
  }
}

function selfTest() {
  if (stableJson({ z: { b: "2", a: "1" } }) !== stableJson({ z: { a: "1", b: "2" } })) {
    throw new Error("stableJson: equivalent nested objects should match");
  }

  if (stableJson({ z: { a: "1" } }) === stableJson({ z: { a: "2" } })) {
    throw new Error("stableJson: nested value changes should differ");
  }

  const scenarios = [
    {
      name: "clean diff stays silent",
      input: { changed: [] },
      absent: ["Codex workflow", "UI files", "dependency manifest"],
    },
    {
      name: "ui diff requires screenshots",
      input: { changed: ["src/App.tsx"] },
      present: ["UI files changed"],
      proof: ["Browser/Computer Use QA", "npm run test:e2e", "npm run verify"],
    },
    {
      name: "ui diff with screenshots removes screenshot warning",
      input: { changed: ["src/App.tsx", "docs/qa/intake-mobile.png"] },
      absent: ["UI files changed"],
      proof: ["npm run verify"],
    },
    {
      name: "auth diff requires scope and security proof",
      input: { changed: ["src/services/authService.ts"] },
      present: ["scope-sensitive surface"],
      proof: ["npm run verify:security", "npm run verify"],
    },
    {
      name: "schema diff requires scope and security proof",
      input: { changed: ["supabase/migrations/001_schema.sql"] },
      present: ["scope-sensitive surface"],
      proof: ["npm run verify:security"],
    },
    {
      name: "dependency diff requires security proof",
      input: { changed: ["package.json"], dependencyChanged: true },
      present: ["dependency manifest changed"],
      proof: ["npm run verify:security", "npm run verify"],
    },
    {
      name: "package script-only diff is workflow, not dependency",
      input: { changed: ["package.json"], scriptsChanged: true },
      present: ["Codex workflow"],
      absent: ["dependency manifest changed"],
      proof: ["npm run verify:codex-hook", "npm run format:check"],
    },
    {
      name: "prompt diff catches old report fields",
      input: {
        changed: [".codex/prompts/go.md"],
        files: { ".codex/prompts/go.md": "Risks:\nReadiness:\nNext mode:\n" },
      },
      present: ["old final-report fields"],
      proof: ['rg -n "Risks:|Readiness:|Next mode:"'],
    },
    {
      name: "trust copy in product file requires safety proof",
      input: {
        changed: ["src/App.tsx"],
        files: { "src/App.tsx": "official verification and visa guarantee" },
      },
      present: ["possible trust-copy violation"],
      proof: ["npm run verify:safety"],
    },
    {
      name: "trust copy in operating docs is not a product-copy warning",
      input: {
        changed: ["AGENTS.md"],
        files: { "AGENTS.md": "Fake official verification is forbidden." },
      },
      present: ["Codex workflow"],
      absent: ["possible trust-copy violation"],
    },
  ];

  for (const scenario of scenarios) {
    const files = scenario.input.files ?? {};
    const result = analyze({
      changed: scenario.input.changed,
      dependencyChanged: scenario.input.dependencyChanged ?? false,
      readFile: (file) => files[file] ?? "",
      scriptsChanged: scenario.input.scriptsChanged ?? false,
    });

    const output = [...result.signals, ...result.proof].join("\n");

    for (const expected of scenario.present ?? []) {
      if (!output.includes(expected)) {
        throw new Error(`${scenario.name}: missing "${expected}"`);
      }
    }

    for (const unexpected of scenario.absent ?? []) {
      if (output.includes(unexpected)) {
        throw new Error(`${scenario.name}: unexpected "${unexpected}"`);
      }
    }

    for (const expectedProof of scenario.proof ?? []) {
      if (!result.proof.some((item) => item.includes(expectedProof))) {
        throw new Error(`${scenario.name}: missing proof "${expectedProof}"`);
      }
    }
  }

  console.log(`codex-quality-radar self-test passed (${scenarios.length} scenarios)`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const root = repoRoot();
const input = collectRuntimeInput(root);

if (input.changed.length === 0) {
  process.exit(0);
}

printReport(analyze(input));
