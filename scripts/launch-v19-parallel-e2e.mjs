#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { testArtifactPath } from "./lib/artifact-paths.mjs";

const MAX_LANES = 4;
const initialCwd = process.cwd();
const repoRoot = rawExec("git", ["rev-parse", "--show-toplevel"], {
  cwd: initialCwd,
}).trim();
const promptRoot = path.join(repoRoot, "docs", "prompts", "v19-e2e-lanes");
const laneConfigPath = path.join(promptRoot, "lanes.json");
const sharedPromptPath = path.join(promptRoot, "shared.md");
const defaultRunId = timestamp();
const config = parseArgs(process.argv.slice(2));
const laneConfig = readJson(laneConfigPath);
const sharedPromptTemplate = readText(sharedPromptPath);
const runId = config.runId ?? defaultRunId;
const baseRef = config.baseRef ?? "HEAD";
const model = config.model ?? process.env.V19_CODEX_MODEL ?? "gpt-5.5";
const reasoning = config.reasoning ?? process.env.V19_CODEX_REASONING ?? "high";
const planReasoning =
  config.planReasoning ?? process.env.V19_CODEX_PLAN_REASONING ?? "xhigh";
const profile = config.profile ?? process.env.V19_CODEX_PROFILE ?? "power";
const worktreeRoot =
  config.worktreeRoot ??
  process.env.V19_LANE_ROOT ??
  path.join(os.homedir(), ".codex", "worktrees", "v19-e2e-closure", runId);
const generatedRoot = testArtifactPath("generated-lane-prompts", runId);
const manifestPath = path.join(generatedRoot, "launch-manifest.json");
const openWindows = !config.noOpen;
const dryRun = Boolean(config.dryRun);
const skipPluginInstall = Boolean(config.noPluginInstall) || dryRun;
const requiredPlugins = laneConfig.requiredPlugins ?? [];
const requiredContextFiles = laneConfig.requiredContextFiles ?? [];
const requiredSkillEntries = skillCopyEntries(laneConfig.requiredSkillFiles ?? []);
const requiredAssetFiles = assetFiles(laneConfig.requiredAssetGlobs ?? []);
const lanes = laneConfig.lanes ?? [];
const maxLanes = laneConfig.maxLanes ?? MAX_LANES;

main();

function main() {
  const preflight = buildPreflight();
  printPlan(preflight);

  if (preflight.blockers.length > 0 && !dryRun) {
    throw new Error(`Preflight failed:\n- ${preflight.blockers.join("\n- ")}`);
  }

  const pluginSnapshot = skipPluginInstall
    ? { skipped: true, plugins: [] }
    : ensurePlugins(requiredPlugins);
  const lanePlans = lanes.map(buildLanePlan);
  const manifest = buildManifest(preflight, pluginSnapshot, lanePlans);

  if (dryRun) {
    printLanePlans(lanePlans);
    console.log("");
    console.log(
      "Dry run complete. No branches, worktrees, prompts, manifest, or windows were created.",
    );
    return;
  }

  for (const lane of lanePlans) {
    addWorktree(lane.worktree, lane.branch, baseRef);
    writePromptBundle(lane, manifest);
  }

  writeRootManifest(manifest);

  if (openWindows) {
    for (const lane of lanePlans) {
      openTerminalWindow(lane.command);
    }
  } else {
    printLanePlans(lanePlans);
  }

  console.log("");
  console.log(`Launch complete. Worktrees root: ${worktreeRoot}`);
  console.log(`Manifest: ${manifestPath}`);
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--no-open") parsed.noOpen = true;
    else if (arg === "--no-plugin-install") parsed.noPluginInstall = true;
    else if (arg === "--print-commands") parsed.printCommands = true;
    else if (arg === "--allow-dirty-source") parsed.allowDirtySource = true;
    else if (arg === "--base-ref") parsed.baseRef = readValue(args, ++index, arg);
    else if (arg === "--run-id")
      parsed.runId = sanitizeRunId(readValue(args, ++index, arg));
    else if (arg === "--model") parsed.model = readValue(args, ++index, arg);
    else if (arg === "--reasoning") parsed.reasoning = readValue(args, ++index, arg);
    else if (arg === "--plan-reasoning")
      parsed.planReasoning = readValue(args, ++index, arg);
    else if (arg === "--profile") parsed.profile = readValue(args, ++index, arg);
    else if (arg === "--worktree-root")
      parsed.worktreeRoot = path.resolve(readValue(args, ++index, arg));
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  npm run v19:e2e:lanes
  npm run v19:e2e:lanes -- --dry-run --print-commands --no-plugin-install

Options:
  --dry-run             Print the launch plan without mutating git or opening windows.
  --no-open             Create branches/worktrees/prompts/manifest but do not open Terminal windows.
  --no-plugin-install   Skip plugin install/check.
  --print-commands      Print each generated Codex command.
  --allow-dirty-source  Allow launching when tracked source files are dirty. Use only intentionally.
  --base-ref <ref>      Base ref for all lane branches. Default: HEAD.
  --run-id <id>         Stable run id. Default: timestamp.
  --model <model>       Codex model. Default: V19_CODEX_MODEL or gpt-5.5.
  --reasoning <level>   model_reasoning_effort. Default: V19_CODEX_REASONING or high.
  --plan-reasoning <l>  plan_mode_reasoning_effort. Default: V19_CODEX_PLAN_REASONING or xhigh.
  --profile <profile>   Codex config profile. Default: V19_CODEX_PROFILE or power.
  --worktree-root <dir> Worktree parent. Default: ~/.codex/worktrees/v19-e2e-closure/<run-id>.
`);
}

function buildPreflight() {
  const blockers = [];
  const warnings = [];
  const gitRoot = exec("git", ["rev-parse", "--show-toplevel"]).trim();
  const baseCommit = exec("git", ["rev-parse", "--verify", baseRef]).trim();
  const branch = exec("git", ["branch", "--show-current"]).trim();
  const status = exec("git", ["status", "--short", "--branch"]).trim().split("\n");
  const dirtySource = dirtySourceFiles();
  const missingContext = requiredContextFiles.filter(
    (file) => !fs.existsSync(path.join(repoRoot, file)),
  );
  const missingSkills = requiredSkillEntries.filter(
    (skill) => !fs.existsSync(skill.source),
  );
  const codexPath = commandPath("codex");
  const osascriptPath = process.platform === "darwin" ? commandPath("osascript") : "";
  const codexVersionProbe = codexPath
    ? spawnSync("codex", ["--version"], { encoding: "utf8" })
    : undefined;
  const codexVersion =
    codexVersionProbe?.status === 0 ? codexVersionProbe.stdout.trim() : "";

  if (gitRoot !== repoRoot) blockers.push(`Unexpected git root: ${gitRoot}`);
  if (!codexPath) blockers.push("Codex CLI not found on PATH.");
  if (codexPath && !codexVersion) {
    blockers.push("Codex CLI is present but cannot start; reinstall or repair it.");
  }
  if (openWindows && process.platform === "darwin" && !osascriptPath) {
    blockers.push("osascript not found; cannot open macOS Terminal windows.");
  }
  if (missingContext.length > 0) {
    blockers.push(`Missing required context files: ${missingContext.join(", ")}`);
  }
  if (missingSkills.length > 0) {
    blockers.push(
      `Missing required skill files: ${missingSkills
        .map((skill) => `${skill.name} (${skill.source})`)
        .join(", ")}`,
    );
  }
  if (lanes.length === 0) {
    blockers.push("No lanes configured.");
  }
  if (lanes.length > maxLanes) {
    blockers.push(
      `Too many lanes configured: ${lanes.length}. Maximum allowed is ${maxLanes}.`,
    );
  }
  if (dirtySource.length > 0 && !config.allowDirtySource) {
    blockers.push(
      `Tracked source/tooling files are dirty and would not be present in new worktrees: ${dirtySource.join(", ")}. Commit/stash them or rerun with --allow-dirty-source intentionally.`,
    );
  }
  if (dirtySource.length > 0 && config.allowDirtySource) {
    warnings.push(
      `Dirty source/tooling allowed by flag; new worktrees still start from ${baseRef}, not from uncommitted file contents.`,
    );
  }

  return {
    baseCommit,
    blockers,
    branch,
    codexPath,
    codexVersion,
    dirtySource,
    missingContext,
    missingSkills: missingSkills.map((skill) => skill.name),
    modelAvailability: "not verified by Codex CLI preflight",
    osascriptPath,
    repoRoot,
    status,
    warnings,
  };
}

function dirtySourceFiles() {
  const output = exec("git", ["status", "--short", "--untracked-files=all"]);
  return output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .filter((file) =>
      /^(src|scripts|package\.json|package-lock\.json|vite\.config\.ts|tsconfig|playwright\.config|AGENTS\.md|docs\/prompts)\b/.test(
        file,
      ),
    );
}

function printPlan(preflight) {
  console.log("V-19 parallel E2E launcher");
  console.log(`repo: ${repoRoot}`);
  console.log(`branch: ${preflight.branch || "(detached)"}`);
  console.log(`base ref: ${baseRef}`);
  console.log(`base commit: ${preflight.baseCommit}`);
  console.log(`run id: ${runId}`);
  console.log(`worktree root: ${worktreeRoot}`);
  console.log(`model: ${model}`);
  console.log(`reasoning: ${reasoning}`);
  console.log(`plan reasoning: ${planReasoning}`);
  console.log(`profile: ${profile}`);
  console.log("sandbox: danger-full-access");
  console.log("approval: never");
  console.log(`lanes: ${lanes.length}`);
  console.log(`max lanes: ${maxLanes}`);
  console.log(`context files: ${requiredContextFiles.length}`);
  console.log(`asset files: ${requiredAssetFiles.length}`);
  console.log(`skill files: ${requiredSkillEntries.length}`);

  for (const warning of preflight.warnings) {
    console.log(`warning: ${warning}`);
  }
  for (const blocker of preflight.blockers) {
    console.log(`blocker: ${blocker}`);
  }
}

function ensurePlugins(selectors) {
  const before = pluginMap();
  const results = [];

  for (const selector of selectors) {
    const current = before.get(selector);
    if (current?.installed && current.enabled) {
      console.log(`Plugin ok: ${selector}`);
      results.push(pluginResult(selector, "ok", current));
      continue;
    }

    console.log(
      current?.installed
        ? `Plugin installed but disabled, re-adding: ${selector}`
        : `Plugin missing, installing: ${selector}`,
    );
    exec("codex", ["plugin", "add", "--json", selector], { stdio: "inherit" });
    results.push(pluginResult(selector, "install_attempted", current));
  }

  const after = pluginMap();
  const unresolved = selectors.filter((selector) => {
    const plugin = after.get(selector);
    return !plugin?.installed || !plugin.enabled;
  });
  if (unresolved.length > 0) {
    throw new Error(
      `Plugin preflight failed; installed+enabled not confirmed for: ${unresolved.join(", ")}`,
    );
  }

  return {
    skipped: false,
    plugins: selectors.map((selector) =>
      pluginResult(selector, "verified", after.get(selector)),
    ),
  };
}

function pluginResult(selector, status, plugin) {
  return {
    enabled: Boolean(plugin?.enabled),
    installed: Boolean(plugin?.installed),
    selector,
    status,
    version: plugin?.version ?? "",
  };
}

function pluginMap() {
  const output = exec("codex", ["plugin", "list", "--available", "--json"], {
    maxBuffer: 50 * 1024 * 1024,
  });
  const parsed = JSON.parse(output);
  const entries = [
    ...(Array.isArray(parsed.installed) ? parsed.installed : []),
    ...(Array.isArray(parsed.available) ? parsed.available : []),
  ];
  return new Map(entries.map((entry) => [entry.pluginId, entry]));
}

function buildLanePlan(lane) {
  const branch = `codex/v19-e2e-${runId}-${lane.id}`;
  const worktree = path.join(worktreeRoot, lane.id, "V-19");
  const promptPath = path.join(generatedRoot, `${lane.id}.md`);
  const contextRoot = path.join(generatedRoot, lane.id, "context");
  const command = codexCommand({ lane, promptPath, worktree });

  return {
    branch,
    command,
    contextRoot,
    id: lane.id,
    manifestPath,
    promptPath,
    title: lane.title,
    worktree,
  };
}

function printLanePlans(lanePlans) {
  for (const lane of lanePlans) {
    console.log(`\n[${lane.id}] ${lane.title}`);
    console.log(`branch: ${lane.branch}`);
    console.log(`worktree: ${lane.worktree}`);
    console.log(`prompt: ${lane.promptPath}`);
    console.log(`manifest: ${lane.manifestPath}`);
    if (dryRun || config.printCommands) {
      console.log(`command: ${lane.command}`);
    }
  }
}

function buildManifest(preflight, pluginSnapshot, lanePlans) {
  return {
    baseRef,
    generatedAt: new Date().toISOString(),
    launcher: "scripts/launch-v19-parallel-e2e.mjs",
    laneConfig: path.relative(repoRoot, laneConfigPath),
    lanes: lanePlans.map((lane) => ({
      branch: lane.branch,
      command: lane.command,
      id: lane.id,
      prompt: lane.promptPath,
      title: lane.title,
      worktree: lane.worktree,
    })),
    model,
    planReasoning,
    pluginSnapshot,
    preflight,
    profile,
    reasoning,
    requiredContextFiles,
    requiredAssetFiles,
    requiredSkillFiles: requiredSkillEntries.map((skill) => ({
      name: skill.name,
      source: skill.source,
      copiedToContext: skill.targetRelative,
    })),
    runId,
    sandbox: "danger-full-access",
    approval: "never",
    sharedPrompt: path.relative(repoRoot, sharedPromptPath),
    worktreeRoot,
  };
}

function addWorktree(laneDir, laneBranch, ref) {
  if (fs.existsSync(laneDir)) {
    throw new Error(`Worktree path already exists: ${laneDir}`);
  }

  const branchExists = spawnSync("git", [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${laneBranch}`,
  ]);
  if (branchExists.status === 0) {
    throw new Error(`Branch already exists: ${laneBranch}`);
  }

  fs.mkdirSync(path.dirname(laneDir), { recursive: true });
  exec("git", ["worktree", "add", "-b", laneBranch, laneDir, ref], {
    stdio: "inherit",
  });
}

function writePromptBundle(lanePlan, manifest) {
  const lane = lanes.find((item) => item.id === lanePlan.id);
  if (!lane) throw new Error(`Missing lane config for ${lanePlan.id}`);

  copyContextFiles(lanePlan.contextRoot);
  writeText(lanePlan.promptPath, lanePrompt(lane, lanePlan));
  writeJson(lanePlan.manifestPath, manifest);
  assertPromptBundle(lanePlan);
}

function copyContextFiles(contextRoot) {
  for (const file of requiredContextFiles) {
    const source = path.join(repoRoot, file);
    const target = path.join(contextRoot, file);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing context source: ${file}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  for (const skill of requiredSkillEntries) {
    const target = path.join(contextRoot, skill.targetRelative);
    if (!fs.existsSync(skill.source)) {
      throw new Error(`Missing skill source: ${skill.name} (${skill.source})`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(skill.source, target);
  }

  for (const file of requiredAssetFiles) {
    const source = path.join(repoRoot, file);
    const target = path.join(contextRoot, file);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing asset source: ${file}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function assertPromptBundle(lanePlan) {
  const required = [
    lanePlan.promptPath,
    lanePlan.manifestPath,
    ...requiredContextFiles.map((file) => path.join(lanePlan.contextRoot, file)),
    ...requiredAssetFiles.map((file) => path.join(lanePlan.contextRoot, file)),
    ...requiredSkillEntries.map((skill) =>
      path.join(lanePlan.contextRoot, skill.targetRelative),
    ),
  ];
  const missing = required.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(`Generated prompt bundle is incomplete: ${missing.join(", ")}`);
  }
}

function writeRootManifest(manifest) {
  writeJson(manifestPath, manifest);
}

function lanePrompt(lane, lanePlan) {
  const shared = renderTemplate(sharedPromptTemplate, {
    access: "danger-full-access, approval never",
    baseRef,
    model,
    planReasoning,
    reasoning,
    repoRoot,
    runId,
  });
  const contextList = requiredContextFiles
    .map((file) => `- ${path.join(lanePlan.contextRoot, file)}`)
    .join("\n");
  const skillList = requiredSkillEntries
    .map(
      (skill) =>
        `- ${skill.name}: ${path.join(lanePlan.contextRoot, skill.targetRelative)}`,
    )
    .join("\n");
  const assetList =
    requiredAssetFiles.length > 0
      ? requiredAssetFiles
          .map((file) => `- ${path.join(lanePlan.contextRoot, file)}`)
          .join("\n")
      : "- none";

  return `${shared}

# Lane

Role: ${lane.title}
Branch: ${lanePlan.branch}
Worktree: ${lanePlan.worktree}
Launch manifest: ${manifestPath}

Mission:
${lane.mission}

Owned scope:
${lane.owns.map((item) => `- ${item}`).join("\n")}

Must not touch:
${lane.mustNotTouch.map((item) => `- ${item}`).join("\n")}

Context bundle copied into this worktree:
${contextList}

Visual/QA assets copied into this worktree:
${assetList}

Skill files copied into this worktree:
${skillList}

Suggested verification:
${lane.checks.map((item) => `- ${item}`).join("\n")}

Output format:
## Agent Verdict
Role:
Owned scope:
Files changed:
Files not touched:
Verification run:
Screenshots:
Artifact proof:
Findings:
Remaining risks:
Verdict:
`;
}

function skillCopyEntries(skills) {
  return skills.map((skill, index) => {
    const name = skill.name ?? path.basename(path.dirname(skill.path ?? ""));
    const source = resolveExternalPath(skill.path);
    return {
      name,
      source,
      targetRelative: path.join(
        "skills",
        `${String(index + 1).padStart(2, "0")}-${slugify(name)}.md`,
      ),
    };
  });
}

function assetFiles(patterns) {
  const files = new Set();
  for (const pattern of patterns) {
    for (const file of expandAssetPattern(pattern)) {
      files.add(file);
    }
  }
  return [...files].sort();
}

function expandAssetPattern(pattern) {
  if (!pattern || typeof pattern !== "string") {
    throw new Error("requiredAssetGlobs[] must contain non-empty strings");
  }

  const match = pattern.match(/^(.+)\/\*\.([a-zA-Z0-9]+)$/);
  if (!match) {
    throw new Error(
      `Unsupported asset pattern: ${pattern}. Use dir/*.ext patterns only.`,
    );
  }

  const [, dir, extension] = match;
  const absoluteDir = path.join(repoRoot, dir);
  if (!fs.existsSync(absoluteDir)) return [];

  return fs
    .readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter((file) => file.toLowerCase().endsWith(`.${extension.toLowerCase()}`));
}

function resolveExternalPath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("requiredSkillFiles[].path must be a non-empty string");
  }
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return path.resolve(filePath);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in values)) return match;
    return values[key];
  });
}

function codexCommand({ lane, promptPath, worktree }) {
  const commandParts = [
    `printf ${shellQuote(`\\033]0;V19 ${lane.id}\\007`)}`,
    `cd ${shellQuote(worktree)}`,
    [
      "codex",
      "-C",
      worktree,
      "-m",
      model,
      "-p",
      profile,
      "-s",
      "danger-full-access",
      "-a",
      "never",
      "-c",
      `model_reasoning_effort=${JSON.stringify(reasoning)}`,
      "-c",
      `plan_mode_reasoning_effort=${JSON.stringify(planReasoning)}`,
      "--search",
      `"$(cat ${shellQuote(promptPath)})"`,
    ]
      .map(shellQuoteCommandPart)
      .join(" "),
  ];
  return commandParts.join(" && ");
}

function shellQuoteCommandPart(part) {
  if (part.startsWith('"$(')) return part;
  return shellQuote(part);
}

function openTerminalWindow(command) {
  if (process.platform !== "darwin") {
    console.log(`Non-macOS platform detected. Run manually: ${command}`);
    return;
  }

  const script = `tell application "Terminal" to do script ${JSON.stringify(command)}`;
  exec("osascript", ["-e", script]);
}

function commandPath(command) {
  const result = spawnSync("zsh", ["-lc", `command -v ${shellQuote(command)}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function exec(file, args, options = {}) {
  return rawExec(file, args, {
    cwd: repoRoot,
    ...options,
  });
}

function rawExec(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: options.cwd ?? initialCwd,
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    stdio: options.stdio,
  });
}

function timestamp() {
  const now = new Date();
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return sanitizeRunId(iso);
}

function sanitizeRunId(value) {
  const sanitized = value.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
  if (!sanitized) throw new Error("run id is empty after sanitization");
  return sanitized;
}
