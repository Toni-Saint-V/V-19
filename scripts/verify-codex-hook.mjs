import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const expectedHookMatcher = "Edit|Write|MultiEdit|apply_patch";
const expectedHookCommand = "node scripts/codex-quality-radar.mjs";

const requiredFiles = [
  ".codex/hooks.json",
  "scripts/codex-quality-radar.mjs",
  "scripts/verify-codex-hook.mjs",
];

const forbiddenPromptPatterns = [
  { label: "-logic", pattern: /(?<![\w-])-logic(?![\w-])/ },
  { label: "-ui", pattern: /(?<![\w-])-ui(?![\w-])/ },
  { label: "-ux", pattern: /(?<![\w-])-ux(?![\w-])/ },
  { label: "-qa", pattern: /(?<![\w-])-qa(?![\w-])/ },
  { label: "-auto", pattern: /(?<![\w-])-auto(?![\w-])/ },
  { label: "-auto2", pattern: /(?<![\w-])-auto2(?![\w-])/ },
  { label: "$product", pattern: /(?<![\w$])\$product(?![\w-])/ },
  { label: "$engineer", pattern: /(?<![\w$])\$engineer(?![\w-])/ },
  { label: "$reviewer", pattern: /(?<![\w$])\$reviewer(?![\w-])/ },
  { label: "$qa", pattern: /(?<![\w$])\$qa(?![\w-])/ },
  { label: "react-best-practices", pattern: /(?<![\w-])react-best-practices(?![\w-])/ },
  { label: "ru-text", pattern: /(?<![\w-])ru-text(?![\w-])/ },
  {
    label: "security-best-practices",
    pattern: /(?<![\w-])security-best-practices(?![\w-])/,
  },
];

function absolutePath(relativePath) {
  return path.join(root, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolutePath(relativePath), "utf8");
}

function fileExists(relativePath) {
  return fs.existsSync(absolutePath(relativePath));
}

function listPromptFiles() {
  const promptDir = absolutePath(path.join(".codex", "prompts"));
  if (!fs.existsSync(promptDir)) {
    return [];
  }

  return fs
    .readdirSync(promptDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(".codex", "prompts", file));
}

function verifyHookConfig(findings) {
  let hooksConfig;
  try {
    hooksConfig = JSON.parse(readText(".codex/hooks.json"));
  } catch (error) {
    findings.push(`.codex/hooks.json: invalid JSON (${error.message})`);
    return;
  }

  const postToolUseHooks = hooksConfig?.hooks?.PostToolUse;
  if (!Array.isArray(postToolUseHooks) || postToolUseHooks.length === 0) {
    findings.push(".codex/hooks.json: expected hooks.PostToolUse entries");
    return;
  }

  let expectedHookFound = false;

  for (const hookGroup of postToolUseHooks) {
    const commandHooks = Array.isArray(hookGroup.hooks)
      ? hookGroup.hooks.filter((hook) => hook.type === "command")
      : [];

    for (const hook of commandHooks) {
      if (hook.command !== expectedHookCommand) {
        findings.push(
          `.codex/hooks.json: unexpected PostToolUse command "${hook.command}"; expected "${expectedHookCommand}"`,
        );
        continue;
      }

      const [, scriptPath] = expectedHookCommand.split(/\s+/);
      if (!fileExists(scriptPath)) {
        findings.push(`.codex/hooks.json: command target missing: ${scriptPath}`);
      }

      if (hookGroup.matcher !== expectedHookMatcher) {
        findings.push(
          `.codex/hooks.json: unexpected matcher "${hookGroup.matcher}"; expected "${expectedHookMatcher}"`,
        );
        continue;
      }

      expectedHookFound = true;
    }
  }

  if (!expectedHookFound) {
    findings.push(
      `.codex/hooks.json: missing required command "${expectedHookCommand}"`,
    );
  }
}

function verifyPromptFiles(findings) {
  for (const promptFile of listPromptFiles()) {
    const lines = readText(promptFile).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { label, pattern } of forbiddenPromptPatterns) {
        if (pattern.test(line)) {
          findings.push(
            `${promptFile}:${index + 1}: blocked legacy or unknown skill token ${label}`,
          );
        }
      }
    });
  }
}

export function verifyCodexHook() {
  const findings = [];

  for (const requiredFile of requiredFiles) {
    if (!fileExists(requiredFile)) {
      findings.push(`${requiredFile}: missing required Codex control-plane file`);
    }
  }

  if (fileExists(".codex/hooks.json")) {
    verifyHookConfig(findings);
  }

  verifyPromptFiles(findings);

  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = verifyCodexHook();

  if (findings.length > 0) {
    console.error("Codex hook verification failed:");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log("Codex hook verification passed.");
}
