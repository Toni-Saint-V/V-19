import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const visualLockPath = path.join(root, "docs", "VISAFLOW_VISUAL_LOCK.md");
const expectedReferences = [
  "docs/qa/v19-agent-inbox-reference-2026-06-20.png",
  "docs/qa/v19-agent-actions-reference-2026-06-20.png",
  "docs/qa/v19-agent-submissions-reference-2026-06-20.png",
];
const scannedRoots = ["docs", "src"].map((dir) => path.join(root, dir));
const ignoredDirs = new Set([".git", "node_modules", "dist"]);
const ignoredBinaryExtensions = /\.(png|jpe?g|webp|gif|ico|zip|pdf|mp4|mov|xlsx?)$/i;
const forbiddenPathParts = [
  "docs/prototypes",
  "docs/qa/deep-research-idea-pack",
  "docs/research/deep-research-idea-pack",
];
const forbiddenTextPatterns = [
  /\bprototype\b/i,
  /\bprototypes\b/i,
  /deep-research-idea-pack/i,
  /docs\/prototypes/i,
  /linear-style-reference/i,
];

const failures = [];

verifyVisualLock();
verifyReferenceFiles();
verifyNoForbiddenArtifacts();
verifyMotionContract();

if (failures.length > 0) {
  console.error("Agent Screen System verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Agent Screen System verification passed");

function verifyVisualLock() {
  if (!fs.existsSync(visualLockPath)) {
    failures.push("docs/VISAFLOW_VISUAL_LOCK.md is missing");
    return;
  }

  const text = fs.readFileSync(visualLockPath, "utf8");
  const requiredPhrases = [
    "The reference set is closed",
    "This system is a constraint system, not an open UI kit.",
    "### Developer Decision Gate",
    "Anything outside these three files is not an agent visual/layout source",
    "Do not read files outside the closed reference set",
    "prefer the reference screens for visual/layout decisions",
    "No fourth archetype exists in the agent system.",
    "### Agent Definition Of Done",
  ];

  for (const phrase of requiredPhrases) {
    if (!text.includes(phrase)) {
      failures.push(`docs/VISAFLOW_VISUAL_LOCK.md missing required phrase: ${phrase}`);
    }
  }

  const listedReferences = unique(
    [...text.matchAll(/`(docs\/qa\/v19-agent-[^`]+-reference-[^`]+\.png)`/g)].map(
      (match) => match[1],
    ),
  );

  assertSameSet(
    listedReferences,
    expectedReferences,
    "docs/VISAFLOW_VISUAL_LOCK.md agent reference list",
  );
}

function verifyMotionContract() {
  const stylesPath = path.join(root, "src", "styles.css");

  if (!fs.existsSync(stylesPath)) {
    failures.push("src/styles.css is missing");
    return;
  }

  const styles = fs.readFileSync(stylesPath, "utf8");

  if (!styles.includes("html.vf-vt::view-transition-old(root)")) {
    failures.push("View Transition root CSS must be scoped to html.vf-vt");
  }

  if (/::view-transition-(?:old|new)\(root\)/.test(styles.replaceAll("html.vf-vt::view-transition-old(root)", "").replaceAll("html.vf-vt::view-transition-new(root)", ""))) {
    failures.push("Unscoped root View Transition selectors are not allowed");
  }

  const screenGridBlock = styles.match(/\.v19-screen-grid\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  if (/grid-template-columns\s+var\([^;]*motion|gap\s+var\([^;]*motion/.test(screenGridBlock)) {
    failures.push(".v19-screen-grid must not animate layout properties");
  }

  const reducedMotionBlock =
    styles.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  if (
    !reducedMotionBlock.includes("animation: none !important") ||
    !reducedMotionBlock.includes("transition: none !important")
  ) {
    failures.push("Reduced motion must disable app animation and transition effects");
  }

  const exportQueueBlocks = [...styles.matchAll(/\.magic-export-queue\s*\{([^{}]*)\}/g)];

  if (exportQueueBlocks.some((match) => /overflow:\s*hidden/.test(match[1]))) {
    failures.push("Mobile export queue must not hide enabled row actions with overflow: hidden");
  }
}

function verifyReferenceFiles() {
  for (const reference of expectedReferences) {
    const absolutePath = path.join(root, reference);

    if (!fs.existsSync(absolutePath)) {
      failures.push(`${reference} is missing`);
      continue;
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size === 0) {
      failures.push(`${reference} must be a non-empty file`);
      continue;
    }

    const signature = fs.readFileSync(absolutePath).subarray(0, 8);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!signature.equals(pngSignature)) {
      failures.push(`${reference} must be a PNG file`);
    }
  }

  const allQaReferences = listFiles(path.join(root, "docs", "qa"))
    .map((file) => relative(file))
    .filter((file) => /reference.*\.png$/i.test(file));

  assertSameSet(allQaReferences, expectedReferences, "docs/qa reference PNG files");
}

function verifyNoForbiddenArtifacts() {
  for (const scannedRoot of scannedRoots) {
    if (!fs.existsSync(scannedRoot)) continue;

    for (const file of listFiles(scannedRoot)) {
      const rel = relative(file);

      for (const forbiddenPart of forbiddenPathParts) {
        if (rel === forbiddenPart || rel.startsWith(`${forbiddenPart}/`)) {
          failures.push(`forbidden legacy reference artifact found: ${rel}`);
        }
      }

      if (ignoredBinaryExtensions.test(file)) continue;

      const text = fs.readFileSync(file, "utf8");
      for (const pattern of forbiddenTextPatterns) {
        if (pattern.test(text)) {
          failures.push(`forbidden legacy reference text ${pattern} found in ${rel}`);
        }
      }
    }
  }
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) return [];

    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function assertSameSet(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);

  for (const item of expectedSet) {
    if (!actualSet.has(item)) failures.push(`${label} missing ${item}`);
  }

  for (const item of actualSet) {
    if (!expectedSet.has(item)) failures.push(`${label} contains unexpected ${item}`);
  }
}

function unique(values) {
  return [...new Set(values)];
}

function relative(file) {
  return path.relative(root, file);
}
