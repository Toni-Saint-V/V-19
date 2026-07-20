import fs from "node:fs";
import path from "node:path";
import { parse } from "postcss";

const root = process.cwd();
const visualLockPath = path.join(root, "docs", "VISAFLOW_VISUAL_LOCK.md");
const expectedReferences = [
  ".agents/rules/v19-screen-wireframes.md",
  ".agents/rules/visual-lock-tokens.md",
  "src/shared/ui/visual-baseline.css",
];
const runtimeStyleImportsByOwner = new Map([
  [
    "src/main.tsx",
    [
      "src/shared/ui/tokens/index.css",
      "src/shared/ui/system.css",
      "src/shared/ui/visual-baseline.css",
    ],
  ],
  [
    "src/components/ReviewWorkspace.tsx",
    ["src/shared/ui/review-workspace.css"],
  ],
]);
const runtimeStyleFiles = [
  ...new Set([...runtimeStyleImportsByOwner.values()].flat()),
];
const scannedRoots = ["docs", "src"].map((dir) => path.join(root, dir));
const ignoredDirs = new Set([".git", "node_modules", "dist"]);
const ignoredBinaryExtensions = /\.(png|jpe?g|webp|gif|ico|zip|pdf|mp4|mov|xlsx?)$/i;
const forbiddenPathParts = ["docs/prototypes", "docs/research/deep-research-idea-pack"];
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
    "Anything outside the closed reference files is not an agent visual/layout source",
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

  for (const reference of expectedReferences) {
    if (!text.includes(`\`${reference}\``)) {
      failures.push(`docs/VISAFLOW_VISUAL_LOCK.md missing reference: ${reference}`);
    }
  }
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

  if (
    /::view-transition-(?:old|new)\(root\)/.test(
      styles
        .replaceAll("html.vf-vt::view-transition-old(root)", "")
        .replaceAll("html.vf-vt::view-transition-new(root)", ""),
    )
  ) {
    failures.push("Unscoped root View Transition selectors are not allowed");
  }

  const screenGridBlock = styles.match(/\.v19-screen-grid\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  if (
    /grid-template-columns\s+var\([^;]*motion|gap\s+var\([^;]*motion/.test(
      screenGridBlock,
    )
  ) {
    failures.push(".v19-screen-grid must not animate layout properties");
  }

  const reducedMotionBlock =
    styles.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ??
    "";

  if (
    !reducedMotionBlock.includes("animation: none !important") ||
    !reducedMotionBlock.includes("transition: none !important")
  ) {
    failures.push("Reduced motion must disable app animation and transition effects");
  }

  const exportQueueBlocks = [
    ...styles.matchAll(/\.magic-export-queue\s*\{([^{}]*)\}/g),
  ];

  if (exportQueueBlocks.some((match) => /overflow:\s*hidden/.test(match[1]))) {
    failures.push(
      "Mobile export queue must not hide enabled row actions with overflow: hidden",
    );
  }
}

function verifyCssTokenContract() {
  const missingStyleFile = runtimeStyleFiles.find(
    (file) => !fs.existsSync(path.join(root, file)),
  );

  if (missingStyleFile) {
    failures.push(`${missingStyleFile} is missing`);
    return;
  }

  const styleSources = runtimeStyleFiles.map((file) => ({
    path: path.join(root, file),
    source: fs.readFileSync(path.join(root, file), "utf8"),
  }));
  const definedTokens = new Set();
  const rootTokenValues = new Map();

  for (const styleSource of styleSources) {
    const parsedStyles = parse(styleSource.source, { from: styleSource.path });

    parsedStyles.walkDecls((declaration) => {
      if (!declaration.prop.startsWith("--")) return;
      definedTokens.add(declaration.prop);
      if (
        declaration.parent?.type === "rule" &&
        declaration.parent.selector === ":root"
      ) {
        rootTokenValues.set(declaration.prop, declaration.value.trim());
      }
    });
  }

  const requiredRootTokens = [
    "--canvas",
    "--panel",
    "--surface",
    "--raised",
    "--control",
    "--hover",
    "--selected",
    "--line",
    "--line-default",
    "--line-strong",
    "--fg",
    "--accent",
    "--danger",
    "--warning",
    "--success",
    "--v19-canvas",
    "--v19-panel",
    "--v19-control",
    "--v19-fg",
    "--v19-accent",
    "--v19-radius-button",
    "--v19b-size-0",
    "--v19b-size-1",
    "--v19b-radius-pill",
    "--v19b-color-page",
  ];

  for (const token of requiredRootTokens) {
    if (!rootTokenValues.has(token)) {
      failures.push(
        `runtime style tokens missing required :root custom property ${token}`,
      );
    }
  }

  const expectedSemanticTokens = new Map([
    ["--danger", "255 92 103"],
    ["--warning", "245 158 11"],
    ["--info", "96 165 250"],
    ["--review", "143 163 255"],
    ["--success", "52 211 153"],
    ["--vf-red", "rgb(var(--danger))"],
    ["--vf-yellow", "rgb(var(--warning))"],
    ["--vf-green", "rgb(var(--success))"],
    ["--vf-danger", "var(--vf-red)"],
    ["--vf-warning", "var(--vf-yellow)"],
    ["--vf-info", "rgb(var(--info))"],
    ["--vf-review", "rgb(var(--review))"],
    ["--vf-success", "var(--vf-green)"],
    ["--vf-red-soft-bg", "var(--v19-depth-control)"],
    ["--vf-yellow-soft-bg", "var(--v19-depth-control)"],
    ["--vf-green-soft-bg", "var(--v19-depth-control)"],
    ["--blue-review", "var(--vf-review)"],
    ["--v19b-dot-danger", "#ff5c67"],
    ["--v19b-dot-warning", "#f59e0b"],
    ["--v19b-dot-info", "#60a5fa"],
    ["--v19b-dot-review", "#8fa3ff"],
    ["--v19b-dot-success", "#34d399"],
  ]);

  for (const [token, expectedValue] of expectedSemanticTokens) {
    const actualValue = rootTokenValues.get(token);
    if (actualValue !== expectedValue) {
      failures.push(
        `runtime semantic token ${token} expected ${expectedValue}, found ${actualValue ?? "missing"}`,
      );
    }
  }

  const undefinedReferences = new Set();
  const combinedStyles = styleSources
    .map((styleSource) => styleSource.source)
    .join("\n");
  for (const match of combinedStyles.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)([^)]*)\)/g)) {
    const [, token, rest] = match;
    if (!definedTokens.has(token) && !rest.includes(","))
      undefinedReferences.add(token);
  }

  for (const token of [...undefinedReferences].sort()) {
    failures.push(`runtime styles reference undefined custom property ${token}`);
  }

  for (const match of combinedStyles.matchAll(
    /var\(\s*(--[A-Za-z0-9_-]+)\s*,\s*var\(\s*\1\b/g,
  )) {
    failures.push(`runtime styles have self-referential fallback for ${match[1]}`);
  }
}

function verifySingleStyleEntrypoint() {
  const srcRoot = path.join(root, "src");
  const cssFiles = listFiles(srcRoot)
    .map((file) => relative(file))
    .filter((file) => /\.(?:css|scss|less)$/i.test(file));
  const expectedCssFiles = runtimeStyleFiles;

  assertSameSet(cssFiles, expectedCssFiles, "runtime stylesheet files");

  const sourceFiles = listFiles(srcRoot).filter((file) =>
    /\.(?:ts|tsx|js|jsx)$/i.test(file),
  );
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
    [...runtimeStyleImportsByOwner.keys()],
    "runtime stylesheet import owners",
  );

  for (const [owner, expectedCssImports] of runtimeStyleImportsByOwner) {
    const resolvedCssImports = cssImports
      .filter((cssImport) => cssImport.owner === owner)
      .map((cssImport) => cssImport.resolved);
    assertSameOrderedList(
      resolvedCssImports,
      expectedCssImports,
      `${owner} runtime stylesheet import order`,
    );
  }

  for (const cssImport of cssImports) {
    const expectedCssImports = runtimeStyleImportsByOwner.get(cssImport.owner) ?? [];
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
    failures.push(
      "src/shared/ui/system.css duplicates .surface-agent-inbox in an :is() selector",
    );
  }

  if (/\.ops-shell\s+\.ops-sidebar/.test(styles)) {
    failures.push(
      "src/shared/ui/system.css has broad .ops-shell .ops-sidebar selectors; use .ops-shell.has-unified-side-menu or quarantine legacy rules with :not(.has-unified-side-menu)",
    );
  }

  if (
    /\.ops-shell(?!(?:\.has-unified-side-menu|:not\(\.has-unified-side-menu\)))(?:\.[A-Za-z0-9_-]+|:is\([^)]*\))*\.is-mobile-nav-open\s+\.ops-sidebar/.test(
      styles,
    )
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
      failures.push(
        `V-19 semantic class ${className} is not used by the target UI surfaces`,
      );
    }
    if (!styles.includes(`.${className}`)) {
      failures.push(
        `V-19 semantic class ${className} is not defined in src/shared/ui/system.css`,
      );
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
      [
        "bg-[#101011] flex flex-col overflow-hidden",
        "bg-orange-500 hover:bg-orange-600",
      ],
    ],
    [
      "src/modules/submissions/components/CreateSubmissionDrawer.tsx",
      [
        "bg-[#0e0e10] flex flex-col overflow-hidden",
        "bg-white text-black hover:bg-white/90",
      ],
    ],
  ]);

  for (const [relativePath, forbiddenSnippets] of forbiddenInlineVisualContracts) {
    const source = sourceByPath.get(relativePath) ?? "";
    for (const snippet of forbiddenSnippets) {
      if (source.includes(snippet)) {
        failures.push(
          `${relativePath} still contains inline visual contract: ${snippet}`,
        );
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
  }
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

function relative(file) {
  return path.relative(root, file);
}
