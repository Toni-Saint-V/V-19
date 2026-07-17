import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const failures = [];

const forbiddenDirectories = [
  ".playwright-cli",
  ".playwright-mcp",
  "docs/qa",
  "output",
  "playwright-report",
  "playwright-report-e2e-fastlane",
  "test-results",
];

for (const directory of forbiddenDirectories) {
  if (exists(directory)) failures.push(`generated directory is present: ${directory}`);
}

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    if (/^(playwright-report|test-results)-/.test(entry.name)) {
      failures.push(`generated directory is present: ${entry.name}`);
    }
    continue;
  }

  if (/\.(gif|jpe?g|png|webp|zip)$/i.test(entry.name)) {
    failures.push(`generated root artifact is present: ${entry.name}`);
  }

  if (/^playwright\..+\.config\.ts$/.test(entry.name)) {
    failures.push(
      `specialized Playwright config must live in config/playwright: ${entry.name}`,
    );
  }
}

const playwrightConfigs = [
  "playwright.config.ts",
  ...readdirSync(join(root, "config", "playwright"))
    .filter((name) => name.endsWith(".config.ts"))
    .map((name) => join("config", "playwright", name)),
];

for (const config of playwrightConfigs) {
  const source = read(config);
  for (const forbidden of [
    "docs/qa",
    "only-on-failure",
    "playwright-report",
    "retain-on-failure",
    "test-results",
  ]) {
    if (source.includes(forbidden)) {
      failures.push(`${config} contains forbidden artifact policy: ${forbidden}`);
    }
  }
  if (!source.includes("outputDir: testArtifactPath(")) {
    failures.push(`${config} must route outputDir through testArtifactPath`);
  }
}

for (const directory of [".agents", "config", "scripts", "tests"]) {
  for (const file of listTextFiles(join(root, directory))) {
    if (file.endsWith("verify-repository-hygiene.mjs")) continue;
    const source = readFileSync(file, "utf8");
    if (source.includes("docs/qa")) {
      failures.push(`${relative(root, file)} still writes or points to docs/qa`);
    }
  }
}

if (failures.length > 0) {
  console.error("Repository hygiene verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Repository hygiene verification passed");

function exists(path) {
  try {
    statSync(join(root, path));
    return true;
  } catch {
    return false;
  }
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function listTextFiles(directory) {
  if (!exists(relative(root, directory))) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTextFiles(path));
      continue;
    }
    if ([".css", ".json", ".md", ".mjs", ".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}
