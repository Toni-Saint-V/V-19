import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const root = process.cwd();
const canonicalRoot = realpathSync(root);
const failures = [];
const guardedCompilerPackageRoots = [
  "@playwright/test",
  "@supabase/auth-js",
  "@supabase/functions-js",
  "@supabase/phoenix",
  "@supabase/postgrest-js",
  "@supabase/realtime-js",
  "@supabase/storage-js",
  "@supabase/supabase-js",
  "@types/node",
  "iceberg-js",
  "playwright",
  "playwright-core",
  "tslib",
  "undici-types",
];

const requiredFiles = [
  "AGENTS.md",
  "docs/agent-workflow/README.md",
  "docs/staging/specs/2026-07-27-codex-workflow-hardening-v1.md",
  ".agents/skills/browser-runtime-proof/SKILL.md",
  ".agents/skills/independent-diff-review/SKILL.md",
];

for (const path of requiredFiles) {
  if (!existsSync(join(root, path))) fail(`required file is missing: ${path}`);
}

if (exists("AGENTS.md")) {
  checkIncludes("AGENTS.md", [
    "TONY_REPOSITORY_RULES_V1",
    "## Source of truth",
    "## Pre-work report",
    "## Scope and no-go",
    "## Runtime and package manager",
    "## Ownership",
    "## Cross-repository lock",
    "## Completion gate",
    "PASS",
    "BLOCKED",
    "FAIL",
  ]);
}

if (exists("docs/agent-workflow/README.md")) {
  checkIncludes("docs/agent-workflow/README.md", [
    "## TASK CONTRACT",
    "## BROWSER RECEIPT",
    "## VERIFICATION LEDGER",
    "## REVIEW FINDING",
    "APPLY_MANUALLY",
    "REQUIRES_MANUAL_REVIEW",
    "TONY_CODEX_BIN=/opt/homebrew/bin/codex",
    "MCP 2026-07-28 default-off canary",
    "ru-text",
    "codebase-recon",
    "spec-driven",
    "tool-advisor",
    "Duplicate resolution",
    "unshadowed named `defineConfig`",
    "unaliased named value imports",
    "sanctioned composition positions",
    "direct/indirect/computed `eval`/`require`/`Function`/`import()` code",
    "`createRequire`/`getBuiltinModule`",
    "rejected by reference",
    "TypeScript type-aware callable check",
    "recursively parses every relative value, type-only, or side-effect",
    "`.env*` imports are rejected without reading",
    "guarded CompilerHost",
    "host-read audit probe",
    "Every I/O-capable CompilerHost surface",
    "drives an actual guarded TypeScript program",
    "closed method inventory",
    "unaliased `expect` value",
    "unknown package or path alias",
    "`process.env`, `process.cwd`, and `process.pid`",
    "symlinked config paths",
    "PASS",
    "BLOCKED",
    "FAIL",
    "Task ID:",
    "Objective:",
    "Definition of done:",
    "Repository:",
    "Exact base:",
    "Worktree:",
    "Branch:",
    "Primary writer:",
    "Read-only reviewers:",
    "Authoritative sources:",
    "Allowed behavior:",
    "Forbidden behavior:",
    "Allowed files:",
    "Forbidden files:",
    "Dependency policy:",
    "Package manager and runtime:",
    "External evidence directory:",
    "Browser target and roles:",
    "Verification commands:",
    "Manual approvals:",
    "Known baseline failures:",
    "Rollback:",
    "Unresolved assumptions:",
    "Repository/base/diff:",
    "Timestamp and timezone:",
    "Localhost URL:",
    "Approved network origins:",
    "Server command:",
    "Playwright version:",
    "Browser binary path:",
    "Artifact root:",
    "Official fixture:",
    "Start state:",
    "Expected backend/domain effect:",
    "Canonical readback:",
    "Reload readback:",
    "Role-isolation check:",
    "Failed requests:",
    "Network requests:",
    "Network responses:",
    "Blocked origin attempts:",
    "WebSocket requests:",
    "Relevant responses:",
    "Persistence:",
    "Horizontal overflow:",
    "Final Playwright command:",
    "HTML report:",
    "Trace/video/screenshot policy:",
    "Evidence gaps:",
    "Residual risk:",
    "Severity: BLOCKER | HIGH | MEDIUM | LOW",
    "Reviewer: VERIFIER | RED-TEAM",
    "File and line:",
    "Requirement:",
    "Problem:",
    "Impact:",
    "Reproduction/evidence:",
    "Minimal fix:",
    "Disposition: OPEN | FIXED | ACCEPTED",
  ]);
}

if (exists("docs/staging/specs/2026-07-27-codex-workflow-hardening-v1.md")) {
  checkIncludes("docs/staging/specs/2026-07-27-codex-workflow-hardening-v1.md", [
    "af640895ea1bddfa463f22369573af666c430de8",
    "## Requirements",
    "## Acceptance criteria",
    "## Rollback",
    "browser-runtime-proof",
    "independent-diff-review",
    "scope-lock",
    "verification-before-completion",
    "shadowed `defineConfig`",
    "aliased Playwright imports",
    "imported-config mutation",
    "device-policy mutation",
    "parenthesized, aliased, computed-property",
    "`createRequire` device mutation",
    "computed process module",
    "`.join()` and",
    "side-effect helper mutation",
    "lexical module escape",
    "dynamic code",
    "canonical path escape",
  ]);
}

verifyRepositorySkills();
verifyPromptSurface();
verifyPackageContract();
verifyPlaywrightContract();
verifyPlaywrightNegativeProbes();
verifySensitivePolicyNegativeProbes();

if (failures.length > 0) {
  console.error("Agent workflow verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Agent workflow verification passed");

function verifyRepositorySkills() {
  const skillsRoot = join(root, ".agents", "skills");
  if (!existsSync(skillsRoot)) {
    fail("repository skills directory is missing: .agents/skills");
    return;
  }

  const skillFiles = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsRoot, entry.name, "SKILL.md"))
    .filter((path) => existsSync(path))
    .sort();

  const seenNames = new Map();
  const seenDescriptions = new Map();

  for (const path of skillFiles) {
    const displayPath = relative(root, path);
    const source = readFileSync(path, "utf8");
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) {
      fail(`${displayPath} has no YAML frontmatter`);
      continue;
    }

    const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();

    if (!name) fail(`${displayPath} has no frontmatter name`);
    if (!description) fail(`${displayPath} has no frontmatter description`);

    if (name) {
      if (seenNames.has(name)) {
        fail(
          `duplicate repository skill name "${name}": ${seenNames.get(name)} and ${displayPath}`,
        );
      } else {
        seenNames.set(name, displayPath);
      }
    }

    if (description) {
      if (seenDescriptions.has(description)) {
        fail(
          `duplicate repository skill description: ${seenDescriptions.get(description)} and ${displayPath}`,
        );
      } else {
        seenDescriptions.set(description, displayPath);
      }
    }

    for (const heading of [
      "## When to use",
      "## Do not use",
      "## Inputs",
      "## Outputs",
    ]) {
      if (!source.includes(heading)) {
        fail(`${displayPath} is missing required section: ${heading}`);
      }
    }
  }

  for (const requiredName of ["browser-runtime-proof", "independent-diff-review"]) {
    if (!seenNames.has(requiredName)) {
      fail(`required repository skill is missing: ${requiredName}`);
    }
  }

  for (const duplicateName of ["scope-lock", "verification-before-completion"]) {
    if (seenNames.has(duplicateName)) {
      fail(`duplicate-resolution violation: repository skill ${duplicateName}`);
    }
  }
}

function verifyPromptSurface() {
  const promptsRoot = join(root, ".agents", "prompts");
  if (!existsSync(promptsRoot)) return;

  for (const prompt of listFiles(promptsRoot)) {
    fail(`new repository prompt is forbidden: ${relative(root, prompt)}`);
  }
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}

function verifyPackageContract() {
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  if (!packageJson || !packageLock) return;

  if (packageJson.devDependencies?.["@playwright/test"] !== "1.62.0") {
    fail('package.json must pin @playwright/test exactly to "1.62.0"');
  }

  if (
    packageJson.scripts?.["verify:agent-workflow"] !==
    "node scripts/verify-agent-workflow.mjs"
  ) {
    fail("package.json must expose verify:agent-workflow");
  }

  const verifySteps = packageJson.scripts?.verify
    ?.split("&&")
    .map((step) => step.trim());
  if (!verifySteps?.includes("npm run verify:agent-workflow")) {
    fail("package.json verify must include verify:agent-workflow");
  } else if (verifySteps[0] !== "npm run verify:agent-workflow") {
    fail("package.json verify must run verify:agent-workflow first");
  }

  if (packageLock.packages?.[""]?.devDependencies?.["@playwright/test"] !== "1.62.0") {
    fail("package-lock root must pin @playwright/test exactly to 1.62.0");
  }

  if (packageLock.packages?.["node_modules/@playwright/test"]?.version !== "1.62.0") {
    fail("package-lock must resolve @playwright/test to 1.62.0");
  }

  if (packageLock.packages?.["node_modules/playwright"]?.version !== "1.62.0") {
    fail("package-lock must resolve playwright to 1.62.0");
  }

  if (packageLock.packages?.["node_modules/playwright-core"]?.version !== "1.62.0") {
    fail("package-lock must resolve playwright-core to 1.62.0");
  }
}

function verifyPlaywrightContract() {
  if (!exists("playwright.config.ts")) return;

  checkIncludes("playwright.config.ts", [
    "V19_TEST_ARTIFACTS_DIR",
    'resolve(tmpdir(), "visaflow-v19")',
    'outputDir: testArtifactPath("playwright", "local-e2e")',
    'preserveOutput: "failures-only"',
    "retries: process.env.CI ? 2 : 0",
    'retryStrategy: "isolated"',
    'screenshot: "only-on-failure"',
    'trace: "retain-on-failure"',
    'video: "retain-on-failure"',
    'const denyExternalProxy = "http://127.0.0.1:1"',
    "bypass: `${e2eHost}:${e2ePort}`",
    "server: denyExternalProxy",
    'serviceWorkers: "block"',
    '["list"]',
    '"html"',
    'outputFolder: testArtifactPath("playwright", "html-report")',
    'open: "never"',
    'process.env.PW_BASE_HOST ?? "127.0.0.1"',
    'process.env.PW_SERVER_HOST ?? "127.0.0.1"',
    "V19_TEST_ARTIFACTS_DIR must resolve outside the repository",
    "PW_BASE_HOST",
    "PW_SERVER_HOST",
    "PW_BASE_PORT",
    "canonicalizeBoundaryPath",
    "requireLocalhost",
    "requirePort",
  ]);

  if (exists("tests/e2e/v19-responsive-proof.spec.ts")) {
    checkIncludes("tests/e2e/v19-responsive-proof.spec.ts", [
      '{ height: 900, label: "1440", width: 1440 }',
      '{ height: 1024, label: "768", width: 768 }',
      '{ height: 844, label: "390", width: 390 }',
    ]);
  } else {
    fail("targeted responsive proof is missing");
  }

  const configRoot = validateRepositoryDirectoryPath(
    join("config", "playwright"),
    failures,
  );
  if (!configRoot) {
    return;
  }

  const sensitiveConfigs = readdirSync(join(root, configRoot))
    .filter((name) => name.endsWith(".config.ts") && /supabase|production/.test(name))
    .sort();

  const graphAnalysis = analyzeSensitiveExecutableModuleGraph(
    sensitiveConfigs.map((name) => join("config", "playwright", name)),
  );
  for (const error of graphAnalysis.errors) fail(error);
  for (const requiredModule of [
    join("src", "modules", "submissions", "submissionActions.ts"),
    join("tests", "e2e-supabase-ui", "production-cohort-helpers.ts"),
    join("tests", "support", "artifacts.ts"),
  ]) {
    if (!graphAnalysis.modulePaths.has(requiredModule)) {
      fail(`sensitive executable module graph is incomplete: ${requiredModule}`);
    }
  }

  for (const name of sensitiveConfigs) {
    const path = join("config", "playwright", name);
    const analysis = analyzeSensitivePlaywrightConfig(path);
    for (const error of analysis.errors) fail(error);

    for (const [setting, expected] of [
      ["preserveOutput", "never"],
      ["screenshot", "off"],
      ["trace", "off"],
      ["video", "off"],
    ]) {
      const values = analysis.values.get(setting) ?? [];
      if (values.length === 0 || values.some((value) => value !== expected)) {
        fail(`${path} must keep effective ${setting} exactly "${expected}"`);
      }
    }
  }
}

function verifyPlaywrightNegativeProbes() {
  const cli = join(root, "node_modules", "@playwright", "test", "cli.js");
  if (!existsSync(cli)) {
    fail("Playwright CLI is missing; run npm ci before verify:agent-workflow");
    return;
  }

  const probes = [
    {
      environment: { PW_BASE_HOST: "example.com" },
      expectedError: "PW_BASE_HOST must be exactly 127.0.0.1 or localhost",
      name: "remote base host",
    },
    {
      environment: { PW_SERVER_HOST: "127.0.0.1;touch-forbidden" },
      expectedError: "PW_SERVER_HOST must be exactly 127.0.0.1 or localhost",
      name: "server-host command injection",
    },
    {
      environment: { PW_BASE_PORT: "4207;touch-forbidden" },
      expectedError: "PW_BASE_PORT must be a decimal port",
      name: "port command injection",
    },
    {
      environment: { V19_TEST_ARTIFACTS_DIR: root },
      expectedError: "V19_TEST_ARTIFACTS_DIR must resolve outside the repository",
      name: "repository-local artifact root",
    },
  ];

  for (const probe of probes) {
    const result = spawnSync(
      process.execPath,
      [cli, "test", "--list", "--config", join(root, "playwright.config.ts")],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...probe.environment },
        timeout: 30_000,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    if (result.error) {
      fail(`Playwright negative probe failed to execute (${probe.name})`);
    } else if (result.status === 0) {
      fail(`Playwright negative probe was accepted (${probe.name})`);
    } else if (!output.includes(probe.expectedError)) {
      fail(`Playwright negative probe failed for the wrong reason (${probe.name})`);
    }
  }
}

function verifySensitivePolicyNegativeProbes() {
  const commentAndComputedKeyProbe = analyzeSensitivePlaywrightConfig(
    "<computed-key-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      export default defineConfig({
        preserveOutput: "never",
        use: {
          // screenshot: "off"
          ["screen" + "shot"]: "on",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    !commentAndComputedKeyProbe.errors.some((error) =>
      error.includes("computed property"),
    )
  ) {
    fail("sensitive policy AST probe accepted a comment/computed-key bypass");
  }

  const helperProbe = analyzeSensitivePlaywrightConfig(
    "<helper-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      const makeUse = () => ({
        screenshot: "on",
        trace: "off",
        video: "off",
      });
      export default defineConfig({
        preserveOutput: "never",
        use: makeUse(),
      });
    `,
  );
  if (
    !helperProbe.errors.some((error) => error.includes("use must be an object literal"))
  ) {
    fail("sensitive policy AST probe accepted helper-generated use policy");
  }

  const shadowedDefineConfigProbe = analyzeSensitivePlaywrightConfig(
    "<shadowed-define-config-negative-probe>",
    new Set(),
    `
      const defineConfig = (config) => ({
        ...config,
        use: {
          ...config.use,
          screenshot: "on",
        },
      });
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    !shadowedDefineConfigProbe.errors.some((error) =>
      error.includes(
        "must use the unshadowed named defineConfig import from @playwright/test",
      ),
    )
  ) {
    fail("sensitive policy AST probe accepted a shadowed defineConfig binding");
  }

  const aliasedImportProbe = analyzeSensitivePlaywrightConfig(
    "<aliased-import-negative-probe>",
    new Set(),
    `
      import { defineConfig as localDefineConfig } from "@playwright/test";
      export default localDefineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    !aliasedImportProbe.errors.some((error) =>
      error.includes("unsupported or aliased Playwright policy import"),
    )
  ) {
    fail("sensitive policy AST probe accepted an aliased Playwright import");
  }

  const importedConfigMutationProbe = analyzeSensitivePlaywrightConfig(
    "<imported-config-mutation-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      import baseConfig from "./safe.config";
      baseConfig.use = {
        ...baseConfig.use,
        screenshot: "on",
      };
      export default defineConfig(baseConfig);
    `,
  );
  if (
    !importedConfigMutationProbe.errors.some((error) =>
      error.includes(
        "policy identifier baseConfig is used outside sanctioned config composition",
      ),
    )
  ) {
    fail("sensitive policy AST probe accepted imported config mutation");
  }

  const deviceMutationProbe = analyzeSensitivePlaywrightConfig(
    "<device-mutation-negative-probe>",
    new Set(),
    `
      import { defineConfig, devices } from "@playwright/test";
      devices["Desktop Chrome"].screenshot = "on";
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
        projects: [{
          name: "desktop",
          use: { ...devices["Desktop Chrome"] },
        }],
      });
    `,
  );
  if (
    !deviceMutationProbe.errors.some((error) =>
      error.includes(
        "policy identifier devices is used outside sanctioned config composition",
      ),
    )
  ) {
    fail("sensitive policy AST probe accepted Playwright device mutation");
  }

  const dynamicCodeProbe = analyzeSensitivePlaywrightConfig(
    "<dynamic-code-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      eval('globalThis.__unsafePlaywrightPolicy = "on"');
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    !dynamicCodeProbe.errors.some((error) =>
      error.includes("dynamic policy code is forbidden: eval"),
    )
  ) {
    fail("sensitive policy AST probe accepted dynamic code");
  }

  const indirectEvalProbe = analyzeSensitivePlaywrightConfig(
    "<indirect-eval-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      const run = eval;
      (eval)('globalThis.__unsafePlaywrightPolicy = "on"');
      (0, run)('globalThis.__unsafePlaywrightPolicy = "on"');
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    !indirectEvalProbe.errors.some((error) =>
      error.includes("dynamic policy code is forbidden: eval"),
    )
  ) {
    fail("sensitive policy AST probe accepted indirect or aliased eval");
  }

  const computedFunctionProbe = analyzeSensitivePlaywrightConfig(
    "<computed-function-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      globalThis["eval"]('globalThis.__unsafePlaywrightPolicy = "on"');
      globalThis["Function"]('return "blocked"')();
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    !["eval", "Function"].every((kind) =>
      computedFunctionProbe.errors.some((error) =>
        error.includes(`dynamic policy code is forbidden: ${kind}`),
      ),
    )
  ) {
    fail("sensitive policy AST probe accepted computed eval/Function access");
  }

  const createRequireProbe = analyzeSensitivePlaywrightConfig(
    "<create-require-negative-probe>",
    new Set(),
    `
      import { createRequire } from "node:module";
      import { defineConfig, devices } from "@playwright/test";
      const load = createRequire(import.meta.url);
      load("@playwright/test")["devices"]["Desktop Chrome"]["screenshot"] = "on";
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
        projects: [{
          name: "desktop",
          use: {
            screenshot: "off",
            trace: "off",
            video: "off",
            ...devices["Desktop Chrome"],
          },
        }],
      });
    `,
  );
  if (
    !createRequireProbe.errors.some((error) =>
      error.includes("dynamic policy code is forbidden: createRequire"),
    )
  ) {
    fail("sensitive policy AST probe accepted createRequire device mutation");
  }

  const processLoaderProbe = analyzeSensitivePlaywrightConfig(
    "<process-loader-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      process["get" + "BuiltinModule"]("module");
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    !processLoaderProbe.errors.some((error) =>
      error.includes(
        "dynamic policy code is forbidden: process access outside env/cwd/pid",
      ),
    )
  ) {
    fail("sensitive policy AST probe accepted computed process module loader");
  }

  const runtimeBuiltCallableProbe = analyzeSensitivePlaywrightConfig(
    "<runtime-built-callable-negative-probe>",
    new Set(),
    `
      import { defineConfig } from "@playwright/test";
      const joinedProperty = ["con", "structor"].join("");
      const encodedProperty = String.fromCharCode(
        99, 111, 110, 115, 116, 114, 117, 99, 116, 111, 114,
      );
      const joinedExecute = ((() => {}) as any)[joinedProperty];
      const encodedExecute = ((() => {}) as any)[encodedProperty];
      joinedExecute('return "blocked"')();
      encodedExecute('return "blocked"')();
      export default defineConfig({
        preserveOutput: "never",
        use: {
          screenshot: "off",
          trace: "off",
          video: "off",
        },
      });
    `,
  );
  if (
    runtimeBuiltCallableProbe.errors.filter((error) =>
      error.includes(
        "forbidden dynamic callable surface: computed access on callable or unknown value",
      ),
    ).length < 2
  ) {
    fail("sensitive policy AST probe accepted runtime-built callable properties");
  }

  const virtualGraphSources = new Map([
    [
      join("virtual", "root.config.ts"),
      `
        import "./side-effect-mutator";
        import { mutatePolicy } from "./named-mutator";
        import { defineConfig } from "@playwright/test";
        mutatePolicy();
        export default defineConfig({
          preserveOutput: "never",
          use: {
            screenshot: "off",
            trace: "off",
            video: "off",
          },
        });
      `,
    ],
    [
      join("virtual", "side-effect-mutator.ts"),
      `
        import { devices } from "@playwright/test";
        devices["Desktop Chrome"].screenshot = "on";
      `,
    ],
    [
      join("virtual", "named-mutator.ts"),
      `
        import { devices } from "@playwright/test";
        export function mutatePolicy() {
          devices["Desktop Chrome"].trace = "on";
        }
      `,
    ],
  ]);
  const relativeGraphProbe = analyzeSensitiveExecutableModuleGraph(
    [join("virtual", "root.config.ts")],
    virtualGraphSources,
  );
  for (const helperPath of [
    join("virtual", "side-effect-mutator.ts"),
    join("virtual", "named-mutator.ts"),
  ]) {
    if (
      !relativeGraphProbe.errors.some(
        (error) =>
          error.includes(helperPath) &&
          error.includes(
            "helper modules may import only Playwright types and unaliased expect",
          ),
      )
    ) {
      fail(`sensitive policy graph probe accepted helper mutation: ${helperPath}`);
    }
  }

  const graphEscapeProbe = analyzeSensitiveExecutableModuleGraph(
    [join("virtual", "escape.config.ts")],
    new Map([
      [
        join("virtual", "escape.config.ts"),
        `
          import "../../../../outside-policy";
          import { defineConfig } from "@playwright/test";
          export default defineConfig({
            preserveOutput: "never",
            use: {
              screenshot: "off",
              trace: "off",
              video: "off",
            },
          });
        `,
      ],
    ]),
  );
  if (
    !graphEscapeProbe.errors.some((error) =>
      error.includes("relative module import escapes the repository"),
    )
  ) {
    fail("sensitive policy graph probe accepted a lexical module escape");
  }

  const syntheticRoot = resolve(sep, "locked-repository");
  const lexicalCandidate = resolve(syntheticRoot, "config", "playwright", "base.ts");
  const escapedCanonicalCandidate = resolve(sep, "external-repository", "base.ts");
  if (
    hasSafeConfigBoundary(
      syntheticRoot,
      lexicalCandidate,
      syntheticRoot,
      escapedCanonicalCandidate,
    )
  ) {
    fail("sensitive policy path probe accepted a canonical symlink escape");
  }

  verifyGuardedCompilerHostReadProbe(fail);
}

function analyzeSensitiveExecutableModuleGraph(entryPaths, virtualSources = new Map()) {
  const errors = [];
  const modules = new Map();
  const entrySet = new Set(entryPaths.map(normalizeGraphPath));
  const allowedExternalModules = new Set([
    "@playwright/test",
    "@supabase/supabase-js",
    "node:crypto",
    "node:fs",
    "node:fs/promises",
    "node:os",
    "node:path",
  ]);

  for (const entryPath of entrySet) loadModule(entryPath);

  let program = null;
  let checker = null;
  if (virtualSources.size === 0 && modules.size > 0) {
    program = createGuardedTypeProgram(modules, errors);
    checker = program?.getTypeChecker() ?? null;
  }

  for (const [modulePath, moduleRecord] of modules) {
    const programSource = program?.getSourceFile(resolve(root, modulePath));
    const sourceFile = programSource ?? moduleRecord.sourceFile;
    const moduleChecker = programSource ? checker : null;

    verifyNoDynamicPolicyCode(sourceFile, modulePath, errors);
    verifyComputedCallableSurface(sourceFile, modulePath, errors, moduleChecker);
    verifyGraphPlaywrightImportSurface(
      sourceFile,
      modulePath,
      errors,
      moduleRecord.isConfig,
    );
  }

  return { errors, modulePaths: new Set(modules.keys()) };

  function loadModule(requestedPath) {
    const modulePath = normalizeGraphPath(requestedPath);
    if (modules.has(modulePath)) return;

    let source;
    if (virtualSources.has(modulePath)) {
      source = virtualSources.get(modulePath);
    } else {
      const validatedPath = validateRepositoryModulePath(modulePath, errors);
      if (!validatedPath) return;
      source = read(validatedPath);
    }

    const sourceFile = ts.createSourceFile(
      modulePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      modulePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const isConfig = entrySet.has(modulePath);
    modules.set(modulePath, { isConfig, source, sourceFile });

    for (const statement of sourceFile.statements) {
      if (
        (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) ||
        !statement.moduleSpecifier
      ) {
        continue;
      }

      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        errors.push(`${modulePath} has a non-literal module reference`);
        continue;
      }

      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) {
        if (!allowedExternalModules.has(specifier)) {
          errors.push(
            `${modulePath} executable graph imports an unapproved module: ${specifier}`,
          );
        }
        continue;
      }
      const importedPath = resolveGraphRelativeModule(
        modulePath,
        specifier,
        errors,
        virtualSources,
      );
      if (importedPath) loadModule(importedPath);
    }
  }
}

function guardedCompilerOptions() {
  return {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2023,
    types: ["node"],
  };
}

function createGuardedTypeProgram(modules, errors) {
  const options = guardedCompilerOptions();
  const { host } = createGuardedCompilerHost(modules, options, errors);
  return ts.createProgram({
    host,
    options,
    rootNames: [...modules.keys()].map((path) => resolve(root, path)),
  });
}

function createGuardedCompilerHost(
  modules,
  options,
  errors,
  {
    allowedPhysicalRoots = buildGuardedCompilerPhysicalRoots(errors),
    baseHost = ts.createCompilerHost(options, true),
  } = {},
) {
  const memorySources = new Map(
    [...modules].map(([modulePath, moduleRecord]) => [
      resolve(root, modulePath),
      moduleRecord.source,
    ]),
  );
  const deniedIo = new Set();
  const delegatedIo = [];
  const explicitlyGuardedHostMethods = new Set([
    "createDirectory",
    "directoryExists",
    "fileExists",
    "getCurrentDirectory",
    "getDirectories",
    "getEnvironmentVariable",
    "getSourceFile",
    "readDirectory",
    "readFile",
    "realpath",
    "trace",
    "writeFile",
  ]);
  const auditedPureHostMethods = new Set([
    "createHash",
    "getCanonicalFileName",
    "getDefaultLibFileName",
    "getDefaultLibLocation",
    "getNewLine",
    "useCaseSensitiveFileNames",
  ]);

  for (const [methodName, method] of Object.entries(baseHost)) {
    if (
      typeof method === "function" &&
      !explicitlyGuardedHostMethods.has(methodName) &&
      !auditedPureHostMethods.has(methodName)
    ) {
      errors.push("guarded CompilerHost encountered an unclassified host method");
    }
  }

  function denyBeforeIo(fileName, operation) {
    const category = hasEnvironmentPathSegment(fileName)
      ? "environment-like path"
      : "unapproved path";
    const key = `${category}:${operation}`;
    if (!deniedIo.has(key)) {
      errors.push(`guarded CompilerHost refused ${category} before ${operation} I/O`);
      deniedIo.add(key);
    }
  }

  function getMemorySource(fileName) {
    return memorySources.get(resolve(root, fileName));
  }

  function mayDelegatePhysicalRead(fileName) {
    return validateGuardedCompilerPhysicalFile(fileName, allowedPhysicalRoots);
  }

  const host = {
    ...baseHost,
    createDirectory(directoryName) {
      denyBeforeIo(directoryName, "create-directory");
    },
    directoryExists(directoryName) {
      const absoluteDirectory = resolve(root, directoryName);
      if (hasEnvironmentPathSegment(absoluteDirectory)) return false;
      if (
        validateGuardedCompilerPhysicalDirectory(
          absoluteDirectory,
          allowedPhysicalRoots,
        )
      ) {
        return true;
      }
      return [
        ...memorySources.keys(),
        ...allowedPhysicalRoots.map(({ lexical }) => lexical),
      ]
        .map((path) => (memorySources.has(path) ? dirname(path) : path))
        .some((knownDirectory) => isWithinBoundary(absoluteDirectory, knownDirectory));
    },
    fileExists(fileName) {
      if (getMemorySource(fileName) !== undefined) return true;
      if (!mayDelegatePhysicalRead(fileName)) return false;
      delegatedIo.push(`fileExists:${resolve(root, fileName)}`);
      return baseHost.fileExists(fileName);
    },
    getCurrentDirectory() {
      return root;
    },
    getDirectories(directoryName) {
      const absoluteDirectory = resolve(root, directoryName);
      if (
        validateGuardedCompilerPhysicalDirectory(
          absoluteDirectory,
          allowedPhysicalRoots,
        )
      ) {
        delegatedIo.push(`getDirectories:${absoluteDirectory}`);
        return (baseHost.getDirectories?.(absoluteDirectory) ?? [])
          .map((path) => (isAbsolute(path) ? path : resolve(absoluteDirectory, path)))
          .filter((path) =>
            validateGuardedCompilerPhysicalDirectory(path, allowedPhysicalRoots),
          );
      }
      return listGuardedCompilerChildDirectories(
        absoluteDirectory,
        memorySources,
        allowedPhysicalRoots,
      );
    },
    getEnvironmentVariable() {
      return "";
    },
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
      const memorySource = getMemorySource(fileName);
      if (memorySource !== undefined) {
        return ts.createSourceFile(
          resolve(root, fileName),
          memorySource,
          languageVersion,
          true,
          scriptKindForPath(fileName),
        );
      }
      if (!mayDelegatePhysicalRead(fileName)) {
        denyBeforeIo(fileName, "source-file");
        return undefined;
      }
      delegatedIo.push(`getSourceFile:${resolve(root, fileName)}`);
      return baseHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    },
    readDirectory(directoryName, extensions, excludes, includes, depth) {
      const absoluteDirectory = resolve(root, directoryName);
      if (
        validateGuardedCompilerPhysicalDirectory(
          absoluteDirectory,
          allowedPhysicalRoots,
        )
      ) {
        delegatedIo.push(`readDirectory:${absoluteDirectory}`);
        return (
          baseHost.readDirectory?.(
            absoluteDirectory,
            extensions,
            excludes,
            includes,
            depth,
          ) ?? []
        ).filter((path) =>
          validateGuardedCompilerPhysicalFile(path, allowedPhysicalRoots),
        );
      }
      if (hasEnvironmentPathSegment(absoluteDirectory)) return [];
      return [...memorySources.keys()].filter(
        (path) =>
          isWithinBoundary(absoluteDirectory, path) &&
          (!extensions?.length ||
            extensions.some((extension) => path.endsWith(extension))),
      );
    },
    readFile(fileName) {
      const memorySource = getMemorySource(fileName);
      if (memorySource !== undefined) return memorySource;
      if (!mayDelegatePhysicalRead(fileName)) {
        denyBeforeIo(fileName, "read-file");
        return undefined;
      }
      delegatedIo.push(`readFile:${resolve(root, fileName)}`);
      return baseHost.readFile(fileName);
    },
    realpath(fileName) {
      const absolutePath = resolve(root, fileName);
      if (memorySources.has(absolutePath)) return absolutePath;
      if (!mayDelegatePhysicalRead(absolutePath)) return absolutePath;
      delegatedIo.push(`realpath:${absolutePath}`);
      return baseHost.realpath?.(absolutePath) ?? absolutePath;
    },
    trace() {},
    writeFile(fileName) {
      denyBeforeIo(fileName, "write-file");
    },
  };

  return { audit: { delegatedIo, deniedIo }, host };
}

function buildGuardedCompilerPhysicalRoots(errors) {
  const requestedRoots = [
    join(root, "node_modules", "typescript", "lib"),
    ...guardedCompilerPackageRoots.map((packageName) =>
      join(root, "node_modules", ...packageName.split("/")),
    ),
  ];
  const validatedRoots = [];

  for (const requestedRoot of requestedRoots) {
    if (!existsSync(requestedRoot)) {
      errors.push("guarded CompilerHost dependency allowlist root is missing");
      continue;
    }
    const relativeRoot = relative(root, requestedRoot);
    let current = root;
    let valid = true;
    for (const segment of relativeRoot.split(sep).filter(Boolean)) {
      current = join(current, segment);
      if (lstatSync(current).isSymbolicLink()) {
        errors.push(
          "guarded CompilerHost dependency allowlist must not contain symlinks",
        );
        valid = false;
        break;
      }
    }
    if (!valid || !lstatSync(requestedRoot).isDirectory()) {
      if (valid) {
        errors.push(
          "guarded CompilerHost dependency allowlist root must be a directory",
        );
      }
      continue;
    }
    const canonicalRequestedRoot = realpathSync(requestedRoot);
    if (!isWithinBoundary(canonicalRoot, canonicalRequestedRoot)) {
      errors.push(
        "guarded CompilerHost dependency allowlist escapes the canonical repository",
      );
      continue;
    }
    validatedRoots.push({
      canonical: canonicalRequestedRoot,
      lexical: requestedRoot,
    });
  }

  return validatedRoots;
}

function validateGuardedCompilerPhysicalFile(fileName, allowedPhysicalRoots) {
  const lexicalCandidate = resolve(root, fileName);
  if (hasEnvironmentPathSegment(lexicalCandidate)) return false;

  const allowedRoot = allowedPhysicalRoots.find(({ lexical }) =>
    isWithinBoundary(lexical, lexicalCandidate),
  );
  if (!allowedRoot || !existsSync(lexicalCandidate)) return false;

  const relativeCandidate = relative(allowedRoot.lexical, lexicalCandidate);
  let current = allowedRoot.lexical;
  for (const segment of relativeCandidate.split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (lstatSync(current).isSymbolicLink()) return false;
  }
  if (!lstatSync(lexicalCandidate).isFile()) return false;
  if (
    lexicalCandidate.endsWith("package.json") === false &&
    !/\.d\.(?:c|m)?ts$/.test(lexicalCandidate)
  ) {
    return false;
  }

  return isWithinBoundary(allowedRoot.canonical, realpathSync(lexicalCandidate));
}

function validateGuardedCompilerPhysicalDirectory(directoryName, allowedPhysicalRoots) {
  const lexicalCandidate = resolve(root, directoryName);
  if (hasEnvironmentPathSegment(lexicalCandidate)) return false;
  const allowedRoot = allowedPhysicalRoots.find(({ lexical }) =>
    isWithinBoundary(lexical, lexicalCandidate),
  );
  if (!allowedRoot || !existsSync(lexicalCandidate)) return false;

  const relativeCandidate = relative(allowedRoot.lexical, lexicalCandidate);
  let current = allowedRoot.lexical;
  for (const segment of relativeCandidate.split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (lstatSync(current).isSymbolicLink()) return false;
  }
  return (
    lstatSync(lexicalCandidate).isDirectory() &&
    isWithinBoundary(allowedRoot.canonical, realpathSync(lexicalCandidate))
  );
}

function listGuardedCompilerChildDirectories(
  directoryName,
  memorySources,
  allowedPhysicalRoots,
) {
  if (hasEnvironmentPathSegment(directoryName)) return [];
  const knownDirectories = [
    ...[...memorySources.keys()].map((path) => dirname(path)),
    ...allowedPhysicalRoots.map(({ lexical }) => lexical),
  ];
  const children = new Set();
  for (const knownDirectory of knownDirectories) {
    if (!isWithinBoundary(directoryName, knownDirectory)) continue;
    const [child] = relative(directoryName, knownDirectory).split(sep).filter(Boolean);
    if (child) children.add(join(directoryName, child));
  }
  return [...children].sort();
}

function hasEnvironmentPathSegment(path) {
  return resolve(root, path)
    .split(sep)
    .filter(Boolean)
    .some((segment) => segment.startsWith(".env"));
}

function scriptKindForPath(path) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function verifyGuardedCompilerHostReadProbe(reportFailure) {
  const options = {
    ...guardedCompilerOptions(),
    noLib: true,
    types: [],
  };
  const memoryPath = join("virtual", "guarded-host-probe.ts");
  const memoryTypePath = join("virtual", "guarded-host-type.ts");
  const memorySource = `
    import type { GuardedHostType } from "./guarded-host-type";
    export const guardedHostProbe: GuardedHostType = { guarded: true };
  `;
  const modules = new Map([
    [memoryPath, { source: memorySource }],
    [
      memoryTypePath,
      {
        source: "export type GuardedHostType = Readonly<{ guarded: boolean }>;",
      },
    ],
  ]);
  const probeErrors = [];
  const delegatedIo = [];
  const recordDelegation = (operation) => {
    delegatedIo.push(operation);
  };
  const baseHost = {
    ...ts.createCompilerHost(options, true),
    createDirectory() {
      recordDelegation("createDirectory");
    },
    directoryExists() {
      recordDelegation("directoryExists");
      return false;
    },
    fileExists() {
      recordDelegation("fileExists");
      return false;
    },
    getDirectories() {
      recordDelegation("getDirectories");
      return [];
    },
    getEnvironmentVariable() {
      recordDelegation("getEnvironmentVariable");
      return "";
    },
    getSourceFile() {
      recordDelegation("getSourceFile");
      return undefined;
    },
    readDirectory() {
      recordDelegation("readDirectory");
      return [];
    },
    readFile() {
      recordDelegation("readFile");
      return undefined;
    },
    realpath(fileName) {
      recordDelegation("realpath");
      return fileName;
    },
    writeFile() {
      recordDelegation("writeFile");
    },
  };
  const { host } = createGuardedCompilerHost(modules, options, probeErrors, {
    allowedPhysicalRoots: [],
    baseHost,
  });

  const program = ts.createProgram({
    host,
    options,
    rootNames: [resolve(root, memoryPath)],
  });
  program.getTypeChecker();

  if (host.readFile(resolve(root, memoryPath)) !== memorySource) {
    reportFailure("guarded CompilerHost probe could not read its memory source");
  }

  const environmentLikePath = resolve(root, [".e", "nv-guarded-host-probe"].join(""));
  const unapprovedProjectPath = resolve(
    root,
    "src",
    "guarded-host-unapproved-probe.ts",
  );
  host.readFile(environmentLikePath);
  host.getSourceFile(unapprovedProjectPath, ts.ScriptTarget.ES2023, undefined, false);
  host.fileExists(environmentLikePath);
  host.directoryExists(unapprovedProjectPath);
  host.getDirectories(unapprovedProjectPath);
  host.readDirectory(unapprovedProjectPath, [".ts"], [], ["**/*"], 1);
  host.realpath(unapprovedProjectPath);
  host.getEnvironmentVariable("GUARDED_COMPILER_HOST_PROBE");
  host.writeFile(unapprovedProjectPath, "blocked");
  host.createDirectory(unapprovedProjectPath);

  if (delegatedIo.length > 0) {
    reportFailure(
      `guarded CompilerHost host-read audit probe delegated denied I/O: ${[
        ...new Set(delegatedIo),
      ].join(", ")}`,
    );
  }
  if (
    !probeErrors.some((error) => error.includes("environment-like path")) ||
    !probeErrors.some((error) => error.includes("unapproved path"))
  ) {
    reportFailure("guarded CompilerHost host-read audit probe missed a denied path");
  }
}

function verifyGraphPlaywrightImportSurface(sourceFile, path, errors, isConfig) {
  if (isConfig) {
    verifyPlaywrightImportSurface(sourceFile, path, errors);
    return;
  }

  for (const statement of sourceFile.statements) {
    if (
      (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const moduleName = statement.moduleSpecifier.text;
    const isPlaywrightModule =
      moduleName === "@playwright/test" ||
      moduleName.startsWith("@playwright/test/") ||
      moduleName === "playwright" ||
      moduleName === "playwright-core";
    if (!isPlaywrightModule || isTypeOnlyModuleReference(statement)) continue;

    if (
      moduleName === "@playwright/test" &&
      ts.isImportDeclaration(statement) &&
      statement.importClause &&
      !statement.importClause.name &&
      statement.importClause.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const valueBindings = statement.importClause.namedBindings.elements.filter(
        (element) => !element.isTypeOnly,
      );
      if (
        valueBindings.length > 0 &&
        valueBindings.every(
          (element) => !element.propertyName && element.name.text === "expect",
        )
      ) {
        continue;
      }
    }

    errors.push(
      `${path} helper modules may import only Playwright types and unaliased expect`,
    );
  }
}

function verifyComputedCallableSurface(sourceFile, path, errors, checker) {
  const reported = new Set();
  visit(sourceFile);

  function report(node, kind) {
    const key = `${node.pos}:${kind}`;
    if (reported.has(key)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    errors.push(`${path}:${line + 1} has forbidden dynamic callable surface: ${kind}`);
    reported.add(key);
  }

  function visit(node) {
    if (ts.isElementAccessExpression(node)) {
      const base = unwrapExpression(node.expression);
      const staticKey = node.argumentExpression
        ? readStaticStringExpression(node.argumentExpression)
        : null;
      const rootName = ts.isIdentifier(base) ? base.text : null;

      if (
        rootName &&
        ["global", "globalThis", "module", "self", "window"].includes(rootName)
      ) {
        report(node, `computed ${rootName} access`);
      } else if (
        staticKey === null &&
        expressionMayBeCallable(base, sourceFile, checker)
      ) {
        report(node, "computed access on callable or unknown value");
      }
    } else if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (ts.isElementAccessExpression(callee)) {
        report(node, "computed call target");
      } else if (
        ts.isCallExpression(callee) ||
        ts.isConditionalExpression(callee) ||
        ts.isBinaryExpression(callee) ||
        ts.isClassExpression(callee)
      ) {
        report(node, "unrecognized call target");
      } else if (
        ts.isIdentifier(callee) &&
        callee.text !== "defineConfig" &&
        identifierCallIsUnknown(callee, sourceFile, checker)
      ) {
        report(node, `unknown identifier call ${callee.text}`);
      }
    } else if (ts.isNewExpression(node)) {
      const constructor = unwrapExpression(node.expression);
      if (
        ts.isElementAccessExpression(constructor) ||
        ts.isCallExpression(constructor) ||
        ts.isConditionalExpression(constructor) ||
        ts.isBinaryExpression(constructor)
      ) {
        report(node, "computed constructor target");
      }
    } else if (
      checker &&
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node))
    ) {
      const sourceType = checker.getTypeAtLocation(node.expression);
      const assertedType = checker.getTypeAtLocation(node);
      const sourceCallable = typeHasCallableSignatures(sourceType, checker);
      const assertedCallable = typeHasCallableSignatures(assertedType, checker);
      const sourceUnknown =
        (sourceType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
      if (
        (sourceCallable && !assertedCallable) ||
        (assertedCallable && (sourceUnknown || !sourceCallable))
      ) {
        report(node, "callable type assertion");
      }
    } else if (ts.isTaggedTemplateExpression(node)) {
      report(node, "tagged template execution");
    }
    ts.forEachChild(node, visit);
  }
}

function expressionMayBeCallable(expression, sourceFile, checker, seen = new Set()) {
  if (checker) {
    if (typeMayBeCallable(checker.getTypeAtLocation(expression), checker)) {
      return true;
    }
    const unwrapped = unwrapExpression(expression);
    if (ts.isIdentifier(unwrapped) && !seen.has(unwrapped.text)) {
      seen.add(unwrapped.text);
      const symbol = checker.getSymbolAtLocation(unwrapped);
      for (const declaration of symbol?.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          if (
            expressionMayBeCallable(
              declaration.initializer,
              declaration.getSourceFile(),
              checker,
              seen,
            )
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  const unwrapped = unwrapExpression(expression);
  if (
    ts.isArrowFunction(unwrapped) ||
    ts.isFunctionExpression(unwrapped) ||
    ts.isClassExpression(unwrapped) ||
    ts.isCallExpression(unwrapped) ||
    ts.isNewExpression(unwrapped) ||
    ts.isPropertyAccessExpression(unwrapped) ||
    ts.isElementAccessExpression(unwrapped) ||
    ts.isAwaitExpression(unwrapped)
  ) {
    return true;
  }

  if (!ts.isIdentifier(unwrapped) || seen.has(unwrapped.text)) return false;
  seen.add(unwrapped.text);
  const declaration = findTopLevelBindingDeclaration(sourceFile, unwrapped.text);
  if (!declaration) return true;
  if (
    ts.isFunctionDeclaration(declaration) ||
    ts.isClassDeclaration(declaration) ||
    ts.isImportClause(declaration) ||
    ts.isImportSpecifier(declaration) ||
    ts.isNamespaceImport(declaration)
  ) {
    return true;
  }
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return expressionMayBeCallable(declaration.initializer, sourceFile, checker, seen);
  }
  return false;
}

function identifierCallIsUnknown(identifier, sourceFile, checker) {
  if (checker) {
    const type = checker.getTypeAtLocation(identifier);
    return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
  }

  const declaration = findTopLevelBindingDeclaration(sourceFile, identifier.text);
  if (!declaration) return true;
  if (
    ts.isFunctionDeclaration(declaration) ||
    ts.isImportSpecifier(declaration) ||
    ts.isImportClause(declaration)
  ) {
    return false;
  }
  return (
    ts.isVariableDeclaration(declaration) &&
    !!declaration.initializer &&
    (ts.isElementAccessExpression(unwrapExpression(declaration.initializer)) ||
      ts.isCallExpression(unwrapExpression(declaration.initializer)) ||
      expressionMayBeCallable(declaration.initializer, sourceFile, checker))
  );
}

function typeMayBeCallable(type, checker) {
  if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return true;
  return typeHasCallableSignatures(type, checker);
}

function typeHasCallableSignatures(type, checker) {
  if (type.isUnionOrIntersection()) {
    return type.types.some((member) => typeHasCallableSignatures(member, checker));
  }
  return (
    checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0
  );
}

function findTopLevelBindingDeclaration(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return statement;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
          return declaration;
        }
      }
    }
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      if (statement.importClause.name?.text === name) {
        return statement.importClause;
      }
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) {
        return bindings;
      }
      if (bindings && ts.isNamedImports(bindings)) {
        const element = bindings.elements.find(
          (candidate) => candidate.name.text === name,
        );
        if (element) return element;
      }
    }
  }
  return null;
}

function isTypeOnlyModuleReference(statement) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    return (
      !clause.name &&
      !!clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.length > 0 &&
      clause.namedBindings.elements.every((element) => element.isTypeOnly)
    );
  }

  if (!ts.isExportDeclaration(statement)) return false;
  if (statement.isTypeOnly) return true;
  return (
    !!statement.exportClause &&
    ts.isNamedExports(statement.exportClause) &&
    statement.exportClause.elements.length > 0 &&
    statement.exportClause.elements.every((element) => element.isTypeOnly)
  );
}

function resolveGraphRelativeModule(importerPath, specifier, errors, virtualSources) {
  const lexicalBase = resolve(root, dirname(importerPath), specifier);
  if (!isWithinBoundary(root, lexicalBase)) {
    errors.push(`${importerPath} relative module import escapes the repository`);
    return null;
  }

  const candidates = [
    lexicalBase,
    `${lexicalBase}.ts`,
    `${lexicalBase}.tsx`,
    `${lexicalBase}.js`,
    `${lexicalBase}.mjs`,
    `${lexicalBase}.cjs`,
    join(lexicalBase, "index.ts"),
    join(lexicalBase, "index.tsx"),
    join(lexicalBase, "index.js"),
  ];

  for (const candidate of [...new Set(candidates)]) {
    const candidateRelative = relative(root, candidate);
    if (
      candidateRelative
        .split(sep)
        .filter(Boolean)
        .some((segment) => segment.startsWith(".env"))
    ) {
      errors.push(`${importerPath} must not import an environment file`);
      return null;
    }

    if (virtualSources.has(candidateRelative)) return candidateRelative;
    if (!existsSync(candidate)) continue;
    if (lstatSync(candidate).isDirectory()) continue;

    if (![".cjs", ".js", ".mjs", ".ts", ".tsx"].includes(extname(candidate))) {
      errors.push(`${candidateRelative} has an unsupported executable module type`);
      return null;
    }
    return validateRepositoryModulePath(candidateRelative, errors);
  }

  errors.push(`${importerPath} relative module import is missing: ${specifier}`);
  return null;
}

function normalizeGraphPath(path) {
  return relative(root, resolve(root, path));
}

function analyzeSensitivePlaywrightConfig(
  path,
  activePaths = new Set(),
  sourceOverride,
) {
  const values = new Map(
    ["preserveOutput", "screenshot", "trace", "video"].map((setting) => [setting, []]),
  );
  const errors = [];

  if (sourceOverride === undefined) {
    const validatedPath = validateRepositoryConfigPath(path, errors);
    if (!validatedPath) return { errors, values };
    path = validatedPath;
  }

  if (activePaths.has(path)) {
    errors.push(`${path} has a cyclic Playwright config import`);
    return { errors, values };
  }

  const source = sourceOverride ?? read(path);
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const restrictedDefaultImportNames = new Set();
  const importedConfigReferenceCounts = new Map();
  const allowedPolicyReferences = new Set();
  let allowedDeviceReferenceCount = 0;

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (
        statement.moduleSpecifier.text.startsWith(".") &&
        statement.importClause?.name
      ) {
        const name = statement.importClause.name.text;
        restrictedDefaultImportNames.add(name);
        importedConfigReferenceCounts.set(name, 0);
        allowedPolicyReferences.add(statement.importClause.name);
      }

      if (
        statement.moduleSpecifier.text === "@playwright/test" &&
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements) {
          if (element.name.text === "defineConfig" || element.name.text === "devices") {
            allowedPolicyReferences.add(element.name);
          }
        }
      }
    }
  }

  verifyPlaywrightImportSurface(sourceFile, path, errors);
  verifyRelativeDefaultImportSurface(sourceFile, path, errors);
  verifyNoDynamicPolicyCode(sourceFile, path, errors);
  if (sourceOverride !== undefined) {
    verifyComputedCallableSurface(sourceFile, path, errors, null);
  }

  const nextActivePaths = new Set(activePaths);
  nextActivePaths.add(path);

  const defaultExport = sourceFile.statements.find(
    (statement) => ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (!defaultExport) {
    errors.push(`${path} must have one default Playwright config export`);
    return { errors, values };
  }

  const exportExpression = unwrapExpression(defaultExport.expression);
  if (
    !ts.isCallExpression(exportExpression) ||
    !ts.isIdentifier(exportExpression.expression) ||
    exportExpression.expression.text !== "defineConfig" ||
    exportExpression.arguments.length === 0
  ) {
    errors.push(`${path} must export defineConfig(...) directly`);
    return { errors, values };
  }

  if (!hasDirectPlaywrightDefineConfigBinding(sourceFile)) {
    errors.push(
      `${path} must use the unshadowed named defineConfig import from @playwright/test`,
    );
  }
  allowedPolicyReferences.add(exportExpression.expression);

  for (const argument of exportExpression.arguments) {
    analyzeConfigExpression(argument, "config");
  }
  verifyRestrictedPolicyReferences();

  return { errors, values };

  function analyzeConfigExpression(expression, context) {
    const unwrapped = unwrapExpression(expression);
    if (ts.isObjectLiteralExpression(unwrapped)) {
      analyzeObjectLiteral(unwrapped, context);
      return;
    }

    if (ts.isIdentifier(unwrapped)) {
      const importedPath = resolveDefaultImport(unwrapped.text);
      if (!importedPath) {
        errors.push(`${path} has unsupported ${context} identifier: ${unwrapped.text}`);
        return;
      }
      allowedPolicyReferences.add(unwrapped);
      importedConfigReferenceCounts.set(
        unwrapped.text,
        (importedConfigReferenceCounts.get(unwrapped.text) ?? 0) + 1,
      );

      const importedAnalysis = analyzeSensitivePlaywrightConfig(
        importedPath,
        nextActivePaths,
      );
      errors.push(...importedAnalysis.errors);
      for (const [setting, importedValues] of importedAnalysis.values) {
        values.get(setting).push(...importedValues);
      }
      return;
    }

    errors.push(
      `${path} has unsupported ${context} composition: ${unwrapped.getText(sourceFile)}`,
    );
  }

  function analyzeObjectLiteral(objectLiteral, context) {
    for (const property of objectLiteral.properties) {
      if (ts.isSpreadAssignment(property)) {
        if (context === "config") {
          analyzeConfigExpression(property.expression, "config spread");
        } else if (
          context === "use" &&
          isPlaywrightDeviceDescriptor(property.expression)
        ) {
          continue;
        } else {
          errors.push(
            `${path} has unsupported ${context} spread: ${property.expression.getText(
              sourceFile,
            )}`,
          );
        }
        continue;
      }

      const propertyName = getStaticPropertyName(property.name);
      if (propertyName === "<computed>") {
        errors.push(`${path} has a computed property in effective ${context} policy`);
        continue;
      }

      if (!ts.isPropertyAssignment(property)) {
        if (
          propertyName &&
          [
            "preserveOutput",
            "screenshot",
            "trace",
            "video",
            "use",
            "projects",
          ].includes(propertyName)
        ) {
          errors.push(
            `${path} has unsupported ${context} property form: ${propertyName}`,
          );
        }
        continue;
      }

      if (values.has(propertyName)) {
        const literal = readStringLiteral(property.initializer);
        values.get(propertyName).push(literal ?? "<nonliteral>");
        continue;
      }

      if (propertyName === "use") {
        const initializer = unwrapExpression(property.initializer);
        if (!ts.isObjectLiteralExpression(initializer)) {
          errors.push(`${path} use must be an object literal`);
        } else {
          analyzeObjectLiteral(initializer, "use");
        }
        continue;
      }

      if (propertyName === "projects") {
        analyzeProjects(property.initializer);
      }
    }
  }

  function analyzeProjects(expression) {
    const unwrapped = unwrapExpression(expression);
    if (!ts.isArrayLiteralExpression(unwrapped)) {
      errors.push(`${path} projects must be an array literal`);
      return;
    }

    for (const project of unwrapped.elements) {
      const unwrappedProject = unwrapExpression(project);
      if (!ts.isObjectLiteralExpression(unwrappedProject)) {
        errors.push(`${path} project entries must be object literals`);
      } else {
        analyzeObjectLiteral(unwrappedProject, "project");
      }
    }
  }

  function resolveDefaultImport(identifier) {
    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !statement.importClause?.name ||
        statement.importClause.name.text !== identifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }

      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) {
        errors.push(
          `${path} config inheritance must use a relative import: ${specifier}`,
        );
        return null;
      }

      const candidate = resolve(
        root,
        dirname(path),
        specifier.endsWith(".ts") ? specifier : `${specifier}.ts`,
      );
      const candidateRelative = relative(root, candidate);
      return validateRepositoryConfigPath(candidateRelative, errors);
    }
    return null;
  }

  function isPlaywrightDeviceDescriptor(expression) {
    const unwrapped = unwrapExpression(expression);
    if (
      !ts.isElementAccessExpression(unwrapped) ||
      !ts.isIdentifier(unwrapped.expression) ||
      unwrapped.expression.text !== "devices" ||
      !unwrapped.argumentExpression ||
      !readStringLiteral(unwrapped.argumentExpression) ||
      !hasDirectPlaywrightNamedBinding(sourceFile, "devices")
    ) {
      return false;
    }

    allowedPolicyReferences.add(unwrapped.expression);
    allowedDeviceReferenceCount += 1;
    return true;
  }

  function verifyRestrictedPolicyReferences() {
    const restrictedNames = new Set([
      ...restrictedDefaultImportNames,
      "defineConfig",
      "devices",
    ]);
    const reported = new Set();

    visit(sourceFile);

    for (const [name, count] of importedConfigReferenceCounts) {
      if (count !== 1) {
        errors.push(
          `${path} imported config ${name} must have exactly one sanctioned composition reference`,
        );
      }
    }

    if (
      hasDirectPlaywrightNamedBinding(sourceFile, "devices") &&
      allowedDeviceReferenceCount === 0
    ) {
      errors.push(`${path} imported devices must be used only in sanctioned spreads`);
    }

    function visit(node) {
      if (
        ts.isIdentifier(node) &&
        restrictedNames.has(node.text) &&
        !allowedPolicyReferences.has(node) &&
        !reported.has(node.text)
      ) {
        errors.push(
          `${path} policy identifier ${node.text} is used outside sanctioned config composition`,
        );
        reported.add(node.text);
      }
      ts.forEachChild(node, visit);
    }
  }
}

function verifyPlaywrightImportSurface(sourceFile, path, errors) {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const moduleName = statement.moduleSpecifier.text;
    if (moduleName === "@playwright/test") {
      const importClause = statement.importClause;
      const namedBindings = importClause?.namedBindings;
      if (
        !importClause ||
        importClause.isTypeOnly ||
        importClause.name ||
        !namedBindings ||
        !ts.isNamedImports(namedBindings)
      ) {
        errors.push(
          `${path} must import Playwright policy bindings as direct named imports`,
        );
        continue;
      }

      for (const element of namedBindings.elements) {
        if (
          element.isTypeOnly ||
          element.propertyName ||
          !["defineConfig", "devices"].includes(element.name.text)
        ) {
          errors.push(
            `${path} has unsupported or aliased Playwright policy import: ${element.getText(
              sourceFile,
            )}`,
          );
        }
      }
      continue;
    }

    if (
      moduleName === "playwright" ||
      moduleName === "playwright-core" ||
      moduleName.startsWith("@playwright/test/")
    ) {
      errors.push(`${path} has unsupported Playwright policy module: ${moduleName}`);
    }
  }
}

function verifyRelativeDefaultImportSurface(sourceFile, path, errors) {
  const importedTargets = new Map();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith(".") ||
      !statement.importClause?.name
    ) {
      continue;
    }

    if (statement.importClause.isTypeOnly || statement.importClause.namedBindings) {
      errors.push(
        `${path} inherited config imports must contain one default value binding only`,
      );
    }

    const specifier = statement.moduleSpecifier.text;
    const normalizedSpecifier = specifier.endsWith(".ts")
      ? specifier
      : `${specifier}.ts`;
    const target = resolve(root, dirname(path), normalizedSpecifier);
    const previousBinding = importedTargets.get(target);
    if (previousBinding) {
      errors.push(
        `${path} imports inherited config ${specifier} more than once (${previousBinding}, ${statement.importClause.name.text})`,
      );
    } else {
      importedTargets.set(target, statement.importClause.name.text);
    }
  }
}

function verifyNoDynamicPolicyCode(sourceFile, path, errors) {
  const forbiddenModules = new Set([
    "inspector",
    "module",
    "node:inspector",
    "node:module",
    "node:vm",
    "vm",
  ]);
  const forbiddenReferences = new Map([
    ["Function", "Function"],
    ["Proxy", "Proxy"],
    ["Reflect", "Reflect"],
    ["Script", "vm.Script"],
    ["SourceTextModule", "vm.SourceTextModule"],
    ["__defineGetter__", "dynamic getter"],
    ["__lookupGetter__", "dynamic getter"],
    ["__proto__", "prototype access"],
    ["_load", "module._load"],
    ["binding", "process.binding"],
    ["compileFunction", "vm.compileFunction"],
    ["constructor", "Function constructor"],
    ["createRequire", "createRequire"],
    ["dlopen", "process.dlopen"],
    ["eval", "eval"],
    ["getBuiltinModule", "process.getBuiltinModule"],
    ["getOwnPropertyDescriptor", "Object.getOwnPropertyDescriptor"],
    ["getOwnPropertyDescriptors", "Object.getOwnPropertyDescriptors"],
    ["getOwnPropertyNames", "Object.getOwnPropertyNames"],
    ["getOwnPropertySymbols", "Object.getOwnPropertySymbols"],
    ["getPrototypeOf", "Object.getPrototypeOf"],
    ["mainModule", "process.mainModule"],
    ["require", "require"],
    ["runInNewContext", "vm.runInNewContext"],
    ["runInThisContext", "vm.runInThisContext"],
    ["setPrototypeOf", "Object.setPrototypeOf"],
  ]);
  const reported = new Set();
  visit(sourceFile);

  function report(kind) {
    if (reported.has(kind)) return;
    errors.push(`${path} dynamic policy code is forbidden: ${kind}`);
    reported.add(kind);
  }

  function visit(node) {
    if (ts.isIdentifier(node)) {
      if (node.text === "process" && !isSanctionedProcessReference(node)) {
        report("process access outside env/cwd/pid");
      } else {
        const kind = forbiddenReferences.get(node.text);
        if (kind) report(kind);
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const kind = forbiddenReferences.get(node.text);
      if (kind) report(kind);

      if (
        ts.isImportDeclaration(node.parent) &&
        node.parent.moduleSpecifier === node &&
        forbiddenModules.has(node.text)
      ) {
        report(`module ${node.text}`);
      }
    } else if (ts.isElementAccessExpression(node)) {
      const base = unwrapExpression(node.expression);
      if (
        ts.isIdentifier(base) &&
        ["global", "globalThis", "module", "self", "window"].includes(base.text)
      ) {
        report(`computed ${base.text} access`);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      report("import()");
    } else if (ts.isImportEqualsDeclaration(node)) {
      report("import equals");
    } else if (ts.isBinaryExpression(node) || ts.isTemplateExpression(node)) {
      const staticValue = readStaticStringExpression(node);
      const kind = staticValue ? forbiddenReferences.get(staticValue) : undefined;
      if (kind) report(kind);
    }
    ts.forEachChild(node, visit);
  }

  function isSanctionedProcessReference(node) {
    return (
      ts.isPropertyAccessExpression(node.parent) &&
      node.parent.expression === node &&
      ["cwd", "env", "pid"].includes(node.parent.name.text)
    );
  }
}

function hasDirectPlaywrightDefineConfigBinding(sourceFile) {
  return hasDirectPlaywrightNamedBinding(sourceFile, "defineConfig");
}

function hasDirectPlaywrightNamedBinding(sourceFile, bindingName) {
  let validBindings = 0;
  let totalBindings = 0;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleName = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;
      const importClause = statement.importClause;

      if (importClause?.name?.text === bindingName) totalBindings += 1;

      if (importClause?.namedBindings) {
        if (
          ts.isNamespaceImport(importClause.namedBindings) &&
          importClause.namedBindings.name.text === bindingName
        ) {
          totalBindings += 1;
        }

        if (ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            if (element.name.text !== bindingName) continue;
            totalBindings += 1;
            if (
              moduleName === "@playwright/test" &&
              !element.propertyName &&
              !element.isTypeOnly &&
              !importClause.isTypeOnly &&
              element.name.text === bindingName
            ) {
              validBindings += 1;
            }
          }
        }
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        totalBindings += countBindingName(declaration.name, bindingName);
      }
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name?.text === bindingName
    ) {
      totalBindings += 1;
    }

    if (
      ts.isImportEqualsDeclaration(statement) &&
      statement.name.text === bindingName
    ) {
      totalBindings += 1;
    }
  }

  return validBindings === 1 && totalBindings === 1;
}

function countBindingName(name, target) {
  if (ts.isIdentifier(name)) return name.text === target ? 1 : 0;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.reduce((count, element) => {
      if (ts.isOmittedExpression(element)) return count;
      return count + countBindingName(element.name, target);
    }, 0);
  }
  return 0;
}

function validateRepositoryConfigPath(path, errors) {
  const lexicalCandidate = resolve(root, path);
  if (!isWithinBoundary(root, lexicalCandidate)) {
    errors.push(`${path} config inheritance escapes the repository lexically`);
    return null;
  }

  if (!existsSync(lexicalCandidate)) {
    errors.push(`${path} imported config is missing`);
    return null;
  }

  const candidateRelative = relative(root, lexicalCandidate);
  let current = root;
  for (const segment of candidateRelative.split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      errors.push(`${path} config inheritance must not use symlinks`);
      return null;
    }
  }

  if (!lstatSync(lexicalCandidate).isFile()) {
    errors.push(`${path} Playwright config must be a regular file`);
    return null;
  }

  const canonicalCandidate = realpathSync(lexicalCandidate);
  if (
    !hasSafeConfigBoundary(root, lexicalCandidate, canonicalRoot, canonicalCandidate)
  ) {
    errors.push(`${path} config inheritance escapes the canonical repository`);
    return null;
  }

  return candidateRelative;
}

function validateRepositoryModulePath(path, errors) {
  const lexicalCandidate = resolve(root, path);
  if (!isWithinBoundary(root, lexicalCandidate)) {
    errors.push(`${path} executable module escapes the repository lexically`);
    return null;
  }

  if (
    relative(root, lexicalCandidate)
      .split(sep)
      .filter(Boolean)
      .some((segment) => segment.startsWith(".env"))
  ) {
    errors.push(`${path} must not read an environment file`);
    return null;
  }

  if (!existsSync(lexicalCandidate)) {
    errors.push(`${path} executable module is missing`);
    return null;
  }

  const candidateRelative = relative(root, lexicalCandidate);
  let current = root;
  for (const segment of candidateRelative.split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      errors.push(`${path} executable module must not use symlinks`);
      return null;
    }
  }

  if (!lstatSync(lexicalCandidate).isFile()) {
    errors.push(`${path} executable module must be a regular file`);
    return null;
  }

  const canonicalCandidate = realpathSync(lexicalCandidate);
  if (
    !hasSafeConfigBoundary(root, lexicalCandidate, canonicalRoot, canonicalCandidate)
  ) {
    errors.push(`${path} executable module escapes the canonical repository`);
    return null;
  }

  return candidateRelative;
}

function validateRepositoryDirectoryPath(path, errors) {
  const lexicalCandidate = resolve(root, path);
  if (!isWithinBoundary(root, lexicalCandidate)) {
    errors.push(`${path} directory escapes the repository lexically`);
    return null;
  }

  if (!existsSync(lexicalCandidate)) {
    errors.push(`${path} directory is missing`);
    return null;
  }

  const candidateRelative = relative(root, lexicalCandidate);
  let current = root;
  for (const segment of candidateRelative.split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      errors.push(`${path} directory must not use symlinks`);
      return null;
    }
  }

  if (!lstatSync(lexicalCandidate).isDirectory()) {
    errors.push(`${path} must be a directory`);
    return null;
  }

  const canonicalCandidate = realpathSync(lexicalCandidate);
  if (
    !hasSafeConfigBoundary(root, lexicalCandidate, canonicalRoot, canonicalCandidate)
  ) {
    errors.push(`${path} directory escapes the canonical repository`);
    return null;
  }

  return candidateRelative;
}

function hasSafeConfigBoundary(
  lexicalBoundary,
  lexicalCandidate,
  canonicalBoundary,
  canonicalCandidate,
) {
  return (
    isWithinBoundary(lexicalBoundary, lexicalCandidate) &&
    isWithinBoundary(canonicalBoundary, canonicalCandidate)
  );
}

function isWithinBoundary(boundary, candidate) {
  const candidateRelative = relative(boundary, candidate);
  return (
    candidateRelative === "" ||
    (candidateRelative !== ".." &&
      !candidateRelative.startsWith(`..${sep}`) &&
      !isAbsolute(candidateRelative))
  );
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getStaticPropertyName(name) {
  if (!name) return null;
  if (ts.isComputedPropertyName(name)) return "<computed>";
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function readStringLiteral(expression) {
  const unwrapped = unwrapExpression(expression);
  return ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)
    ? unwrapped.text
    : null;
}

function readStaticStringExpression(expression) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.text;
  }

  if (
    ts.isBinaryExpression(unwrapped) &&
    unwrapped.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = readStaticStringExpression(unwrapped.left);
    const right = readStaticStringExpression(unwrapped.right);
    return left === null || right === null ? null : `${left}${right}`;
  }

  if (ts.isTemplateExpression(unwrapped)) {
    let value = unwrapped.head.text;
    for (const span of unwrapped.templateSpans) {
      const expressionValue = readStaticStringExpression(span.expression);
      if (expressionValue === null) return null;
      value += expressionValue;
      value += span.literal.text;
    }
    return value;
  }

  return null;
}

function checkIncludes(path, markers) {
  const source = read(path);
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${path} is missing marker: ${marker}`);
  }
}

function readJson(path) {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    fail(`${path} is not valid JSON: ${error.message}`);
    return null;
  }
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path) {
  return existsSync(join(root, path));
}

function fail(message) {
  failures.push(message);
}
