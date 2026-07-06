import fs from "node:fs";
import path from "node:path";
import { parse } from "postcss";

const root = process.cwd();
const visualLockPath = path.join(root, "docs", "VISAFLOW_VISUAL_LOCK.md");
const expectedReferences = [
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
verifyCssTokenContract();
verifySingleStyleEntrypoint();
verifyUnifiedSidebarContract();
verifySubmissionVisualBypassContract();
verifyV19SemanticStyleContract();

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
    "Anything outside these two files is not an agent visual/layout source",
    "Do not read files outside the closed reference set",
    "prefer the reference screens for visual/layout decisions",
    "No separate event-only archetype exists in the agent system.",
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
  const stylesPath = path.join(root, "src", "shared", "ui", "system.css");

  if (!fs.existsSync(stylesPath)) {
    failures.push("src/shared/ui/system.css is missing");
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

function verifyCssTokenContract() {
  const stylesPath = path.join(root, "src", "shared", "ui", "system.css");

  if (!fs.existsSync(stylesPath)) {
    failures.push("src/shared/ui/system.css is missing");
    return;
  }

  const styles = fs.readFileSync(stylesPath, "utf8");
  const parsedStyles = parse(styles, { from: stylesPath });
  const definedTokens = new Set();
  const rootTokenValues = new Map();

  parsedStyles.walkDecls((declaration) => {
    if (!declaration.prop.startsWith("--")) return;
    definedTokens.add(declaration.prop);
    if (declaration.parent?.type === "rule" && declaration.parent.selector === ":root") {
      rootTokenValues.set(declaration.prop, declaration.value.trim());
    }
  });
  const lockedTokens = new Map([
    ["--vf-bg-app", "#070809"],
    ["--vf-bg-shell", "#0b0c0e"],
    ["--vf-bg-panel", "#0e1013"],
    ["--vf-bg-row", "#15171b"],
    ["--vf-bg-row-hover", "#191c21"],
    ["--vf-bg-control", "#1a1c21"],
    ["--vf-border-subtle", "rgba(255, 255, 255, 0.08)"],
    ["--vf-border-strong", "rgba(255, 255, 255, 0.13)"],
    ["--vf-text-primary", "#f3f4f6"],
    ["--vf-text-secondary", "#b2b6bf"],
    ["--vf-text-muted", "#8f949e"],
    ["--vf-accent", "#6874e8"],
    ["--vf-accent-hover", "#7580ee"],
    ["--vf-accent-active", "#5964d6"],
    ["--vf-focus", "#7c84ff"],
    ["--vf-selected-bg", "#25272d"],
    ["--vf-selected-bg-hover", "#2a2d34"],
    ["--vf-selected-border", "rgba(255, 255, 255, 0.11)"],
    ["--vf-selected-text", "#f3f4f6"],
    ["--vf-nav-selected-bg", "#25272d"],
    ["--vf-nav-selected-border", "rgba(255, 255, 255, 0.12)"],
    ["--vf-row-selected-bg", "#181b21"],
    ["--vf-row-selected-border", "rgba(104, 116, 232, 0.72)"],
    ["--vf-red", "#ff5c67"],
    ["--vf-red-hover", "#ff6b75"],
    ["--vf-red-active", "#e94d59"],
    ["--vf-red-fg", "#18080a"],
    ["--vf-red-soft-bg", "rgba(255, 92, 103, 0.13)"],
    ["--vf-red-soft-border", "rgba(255, 92, 103, 0.48)"],
    ["--vf-red-soft-text", "#ff8a92"],
    ["--vf-yellow", "#f4b840"],
    ["--vf-yellow-hover", "#ffc653"],
    ["--vf-yellow-active", "#d99b25"],
    ["--vf-yellow-fg", "#171006"],
    ["--vf-yellow-soft-bg", "rgba(244, 184, 64, 0.13)"],
    ["--vf-yellow-soft-border", "rgba(244, 184, 64, 0.48)"],
    ["--vf-yellow-soft-text", "#f4b840"],
    ["--vf-green", "#45d082"],
    ["--vf-green-hover", "#58df93"],
    ["--vf-green-active", "#30b86a"],
    ["--vf-green-fg", "#06150c"],
    ["--vf-green-soft-bg", "rgba(69, 208, 130, 0.13)"],
    ["--vf-green-soft-border", "rgba(69, 208, 130, 0.48)"],
    ["--vf-green-soft-text", "#59df94"],
  ]);

  for (const [token, expectedValue] of lockedTokens) {
    if (rootTokenValues.get(token)?.toLowerCase() !== expectedValue.toLowerCase()) {
      failures.push(`src/shared/ui/system.css missing locked token ${token}: ${expectedValue}`);
    }
  }

  const undefinedReferences = new Set();
  for (const match of styles.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
    if (!definedTokens.has(match[1])) undefinedReferences.add(match[1]);
  }

  for (const token of [...undefinedReferences].sort()) {
    failures.push(`src/shared/ui/system.css references undefined custom property ${token}`);
  }

  for (const match of styles.matchAll(
    /var\(\s*(--[A-Za-z0-9_-]+)\s*,\s*var\(\s*\1\b/g,
  )) {
    failures.push(
      `src/shared/ui/system.css has self-referential fallback for ${match[1]}`,
    );
  }
}

function verifySingleStyleEntrypoint() {
  const srcRoot = path.join(root, "src");
  const cssFiles = listFiles(srcRoot)
    .map((file) => relative(file))
    .filter((file) => /\.(?:css|scss|less)$/i.test(file));
  const expectedCssFiles = [
    "src/shared/ui/system.css",
    "src/shared/ui/visual-baseline.css",
  ];

  assertSameSet(cssFiles, expectedCssFiles, "runtime stylesheet files");

  const sourceFiles = listFiles(srcRoot).filter((file) => /\.(?:ts|tsx|js|jsx)$/i.test(file));
  const cssImports = [];

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    const cssImportPatterns = [
      /\bimport\s+(?:[^("'`;]*?\s+from\s+)?["']([^"']+\.(?:css|scss|less))["']/g,
      /\bimport\s*\(\s*["']([^"']+\.(?:css|scss|less))["']\s*\)/g,
    ];

    for (const pattern of cssImportPatterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        cssImports.push({
          owner: relative(file),
          resolved: specifier.startsWith(".")
            ? relative(path.resolve(path.dirname(file), specifier))
            : specifier,
          specifier,
        });
      }
    }
  }

  assertSameSet(
    [...new Set(cssImports.map((cssImport) => cssImport.owner))],
    ["src/main.tsx"],
    "runtime stylesheet import owners",
  );

  const expectedCssImports = [
    "src/shared/ui/system.css",
    "src/shared/ui/visual-baseline.css",
  ];
  const resolvedCssImports = cssImports.map((cssImport) => cssImport.resolved);

  assertSameOrderedList(
    resolvedCssImports,
    expectedCssImports,
    "src/main.tsx runtime stylesheet import order",
  );

  for (const cssImport of cssImports) {
    if (!expectedCssImports.includes(cssImport.resolved)) {
      failures.push(
        `${cssImport.owner} imports stylesheet ${cssImport.specifier}; expected approved V-19 runtime stylesheets`,
      );
    }
  }
}

function verifyUnifiedSidebarContract() {
  const stylesPath = path.join(root, "src", "shared", "ui", "system.css");
  const styles = fs.readFileSync(stylesPath, "utf8");

  if (/\.surface-agent-inbox,\s*\.surface-agent-inbox/.test(styles)) {
    failures.push("src/shared/ui/system.css duplicates .surface-agent-inbox in an :is() selector");
  }

  if (/\.ops-shell\s+\.ops-sidebar/.test(styles)) {
    failures.push(
      "src/shared/ui/system.css has broad .ops-shell .ops-sidebar selectors; use .ops-shell.has-unified-side-menu or quarantine legacy rules with :not(.has-unified-side-menu)",
    );
  }

  if (
    /\.ops-shell(?!(?:\.has-unified-side-menu|:not\(\.has-unified-side-menu\)))(?:\.[A-Za-z0-9_-]+|:is\([^)]*\))*\.is-mobile-nav-open\s+\.ops-sidebar/.test(styles)
  ) {
    failures.push(
      "src/shared/ui/system.css has mobile sidebar selectors that bypass the unified side menu contract",
    );
  }
}

function verifySubmissionVisualBypassContract() {
  const checkedRoots = [
    path.join(root, "src", "modules", "submissions"),
    path.join(root, "src", "shared", "ui", "system.css"),
  ];
  const forbiddenPatterns = [
    [/\bstyle=\{/, "React style prop"],
    [/\bCSSProperties\b/, "React CSSProperties visual escape hatch"],
    [/--progress\b/, "local progress custom property"],
    [/--status-chip-dot\b/, "local status-chip custom property"],
  ];

  for (const checkedRoot of checkedRoots) {
    const files = fs.statSync(checkedRoot).isDirectory()
      ? listFiles(checkedRoot)
      : [checkedRoot];

    for (const file of files) {
      if (!/\.(?:css|ts|tsx)$/i.test(file)) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const [pattern, label] of forbiddenPatterns) {
        if (pattern.test(source)) {
          failures.push(`${relative(file)} contains forbidden ${label}`);
        }
      }
    }
  }
}

function verifyV19SemanticStyleContract() {
  const stylesPath = path.join(root, "src", "shared", "ui", "system.css");
  const checkedSourceFiles = [
    "src/modules/submissions/components/FigmaSubmissionDrawer.tsx",
    "src/modules/submissions/components/FigmaQuestionnaireScreen.tsx",
    "src/modules/submissions/components/CreateSubmissionDrawer.tsx",
    "src/modules/submissions/components/CollectionPrimitives.tsx",
  ];

  if (!fs.existsSync(stylesPath)) {
    failures.push("src/shared/ui/system.css is missing");
    return;
  }

  const styles = fs.readFileSync(stylesPath, "utf8");
  const sourceByPath = new Map();

  for (const relativePath of checkedSourceFiles) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`${relativePath} is missing`);
      continue;
    }
    sourceByPath.set(relativePath, fs.readFileSync(absolutePath, "utf8"));
  }

  const requiredSemanticClasses = [
    "v19-drawer-footer-action--returned",
    "v19-drawer-footer-action--primary",
    "v19-figma-drawer-shell",
    "v19-questionnaire-field-control",
    "v19-questionnaire-complete-button",
    "v19-create-drawer-shell",
    "v19-create-footer-action--primary",
    "v19-mobile-filter-sheet",
  ];

  const combinedSource = [...sourceByPath.values()].join("\n");
  for (const className of requiredSemanticClasses) {
    if (!combinedSource.includes(className)) {
      failures.push(`V-19 semantic class ${className} is not used by the target UI surfaces`);
    }
    if (!styles.includes(`.${className}`)) {
      failures.push(`V-19 semantic class ${className} is not defined in src/shared/ui/system.css`);
    }
  }

  const forbiddenInlineVisualContracts = new Map([
    [
      "src/modules/submissions/components/FigmaSubmissionDrawer.tsx",
      [
        "bg-orange-500 hover:bg-orange-600",
        "bg-[#3a45b4] hover:bg-[#4855d4]",
        "shadow-[0_24px_80px_rgba(0,0,0,0.6)]",
      ],
    ],
    [
      "src/modules/submissions/components/FigmaQuestionnaireScreen.tsx",
      ["bg-[#101011] flex flex-col overflow-hidden", "bg-orange-500 hover:bg-orange-600"],
    ],
    [
      "src/modules/submissions/components/CreateSubmissionDrawer.tsx",
      ["bg-[#0e0e10] flex flex-col overflow-hidden", "bg-white text-black hover:bg-white/90"],
    ],
  ]);

  for (const [relativePath, forbiddenSnippets] of forbiddenInlineVisualContracts) {
    const source = sourceByPath.get(relativePath) ?? "";
    for (const snippet of forbiddenSnippets) {
      if (source.includes(snippet)) {
        failures.push(`${relativePath} still contains inline visual contract: ${snippet}`);
      }
    }
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

function assertSameOrderedList(actual, expected, label) {
  if (actual.length !== expected.length) {
    failures.push(
      `${label} expected ${expected.length} item(s), found ${actual.length}`,
    );
    return;
  }

  for (const [index, expectedItem] of expected.entries()) {
    if (actual[index] !== expectedItem) {
      failures.push(
        `${label} item ${index + 1} expected ${expectedItem}, found ${actual[index]}`,
      );
    }
  }
}

function unique(values) {
  return [...new Set(values)];
}

function relative(file) {
  return path.relative(root, file);
}
