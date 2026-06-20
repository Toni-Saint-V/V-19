import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const entry = path.join(root, "src/main.tsx");
const allowedSourceRoots = [
  path.join(root, "src/App.tsx"),
  path.join(root, "src/main.tsx"),
  path.join(root, "src/modules/submissions"),
  path.join(root, "src/shared"),
  path.join(root, "src/styles.css"),
  path.join(root, "src/vite-env.d.ts"),
];
const forbiddenRuntimeRoots = [
  path.join(root, "src/data"),
  path.join(root, "src/hooks"),
  path.join(root, "src/lib"),
  path.join(root, "src/services"),
  path.join(root, "src/types/domain.ts"),
];
const promotedRuntimeFiles = [
  path.join(root, "src/lib/supabase/activation.ts"),
  path.join(root, "src/lib/supabase/client.ts"),
  path.join(root, "src/lib/supabase/config.ts"),
  path.join(root, "src/lib/supabase/database.types.ts"),
  path.join(root, "src/services/authService.ts"),
  path.join(root, "src/services/persistenceObservability.ts"),
  path.join(root, "src/services/profileService.ts"),
  path.join(root, "src/types/domain.ts"),
  path.join(root, "src/types/session.ts"),
];
const forbiddenCopy = [
  "Люди",
  "Семьи",
  "Группы",
  "Туристы",
  "CRM",
  "Dashboard",
  "Smart Inbox",
  "AI Checker",
  "Operations Center",
  "виза одобрена",
  "шанс получения визы",
  "вероятность одобрения",
  "официальная проверка",
  "OCR подтвердил",
  "автоматически записали",
  "решение принято системой",
];
const forbiddenReachableSurfaceTerms = [
  "agent-inbox",
  "agent-actions",
  "agent-settings",
  "admin-inbox",
  "admin-actions",
  "admin-settings",
  '"Входящие"',
  '"Мои действия"',
  '"Настройки"',
  '"Документы"',
];
const reachableSurfaceFiles = [
  path.join(root, "src/App.tsx"),
  path.join(root, "src/modules/submissions/types.ts"),
  path.join(root, "src/modules/submissions/uiTypes.ts"),
];
// Legacy AgentInbox/AgentActions components may remain in OperationsScreens as
// visual references; the V-19 contract is that they are not reachable surfaces.

const visited = new Set();
const violations = [];

walkImports(entry);
scanV19Source();
scanReachableSurfaces();

if (violations.length > 0) {
  console.error("V-19 boundary check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`V-19 boundary check passed (${visited.size} runtime files checked)`);

function walkImports(filePath) {
  const normalized = normalizePath(filePath);
  if (visited.has(normalized)) return;
  if (!fs.existsSync(normalized)) return;

  visited.add(normalized);
  assertAllowedRuntimeFile(normalized);

  const source = fs.readFileSync(normalized, "utf8");
  for (const specifier of importSpecifiers(source)) {
    if (!specifier.startsWith(".")) continue;
    const resolved = resolveImport(normalized, specifier);
    if (resolved) walkImports(resolved);
  }
}

function assertAllowedRuntimeFile(filePath) {
  if (promotedRuntimeFiles.some((promotedFile) => isInside(filePath, promotedFile))) {
    return;
  }

  if (
    forbiddenRuntimeRoots.some((forbiddenRoot) => isInside(filePath, forbiddenRoot))
  ) {
    violations.push(`runtime imports legacy file ${relative(filePath)}`);
  }

  if (!allowedSourceRoots.some((allowedRoot) => isInside(filePath, allowedRoot))) {
    violations.push(`runtime imports file outside V-19 boundary ${relative(filePath)}`);
  }
}

function scanV19Source() {
  const files = [
    path.join(root, "src/App.tsx"),
    ...listFiles(path.join(root, "src/modules/submissions")).filter((file) =>
      /\.(ts|tsx)$/.test(file),
    ),
    ...listFiles(path.join(root, "src/shared")).filter((file) =>
      /\.(ts|tsx)$/.test(file),
    ),
  ];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const term of forbiddenCopy) {
      if (source.includes(term)) {
        violations.push(`forbidden copy "${term}" found in ${relative(file)}`);
      }
    }
  }
}

function scanReachableSurfaces() {
  for (const file of reachableSurfaceFiles) {
    if (!fs.existsSync(file)) continue;

    const source = fs.readFileSync(file, "utf8");
    for (const term of forbiddenReachableSurfaceTerms) {
      if (source.includes(term)) {
        violations.push(
          `forbidden reachable surface "${term}" found in ${relative(file)}`,
        );
      }
    }
  }
}

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /import\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/g,
    /export\s+(?:type\s+)?[^'"]+?\s+from\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }

  return specs;
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];

  return candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function isInside(filePath, rootPath) {
  const normalizedFile = normalizePath(filePath);
  const normalizedRoot = normalizePath(rootPath);
  return (
    normalizedFile === normalizedRoot ||
    normalizedFile.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

function normalizePath(filePath) {
  return path.normalize(filePath);
}

function relative(filePath) {
  return path.relative(root, filePath);
}
