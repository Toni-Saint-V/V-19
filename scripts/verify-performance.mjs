import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const distAssets = join(process.cwd(), "dist", "assets");
const manifestPath = join(process.cwd(), "dist", ".vite", "manifest.json");

// Current V-19 cockpit baseline. The shell still ships a large global CSS
// bundle and several intentionally lazy operational chunks; keep no-growth
// ceilings until a dedicated split lowers the budget.
const cssRawKbBaseline = 250;
const cssRawKbAllowance = 1;
const cssGzipKbBaseline = 38;
const cssGzipKbAllowance = 1;
// Since the approved 2026-07-22 runtime consolidation, the entry stylesheet
// owns tokens, system, visual-baseline, and the global operational layers.
// Track it separately so lazy CSS keeps the strict per-chunk ceiling above.
const entryCssRawKbBaseline = 2300;
const entryCssRawKbAllowance = 2;
const entryCssGzipKbBaseline = 250;
const entryCssGzipKbAllowance = 1;
// The integration preview intentionally combines the reviewed operational,
// admin-premium, and agent-premium convergence layers in one runtime. Keep the
// measured merged composition as the new no-growth baseline.
const totalCssRawKbBaseline = 2497;
const totalCssRawKbAllowance = 3;
const totalCssGzipKbBaseline = 273;
const totalCssGzipKbAllowance = 1;
const cssChunkCountLimit = 8;
const totalJsRawKbBaseline = 1054;
const totalJsRawKbAllowance = 1;
const totalJsGzipKbBaseline = 302;
const totalJsGzipKbAllowance = 1;
const lazyWorkbookRawKbLimit = 18;
const lazyWorkbookGzipKbLimit = 6.5;
const lazyPassportOcrRawKbLimit = 8.2;
const lazyPassportOcrGzipKbLimit = 3.7;
const lazyPdfRawKbLimit = 380;
const lazyPdfGzipKbLimit = 115;
const lazyWorkspaceRawKbLimit = 691;
const lazyWorkspaceGzipKbLimit = 184;

const limits = {
  jsRawKb: 500,
  jsGzipKb: 160,
  cssRawKb: cssRawKbBaseline + cssRawKbAllowance,
  cssGzipKb: cssGzipKbBaseline + cssGzipKbAllowance,
  entryCssRawKb: entryCssRawKbBaseline + entryCssRawKbAllowance,
  entryCssGzipKb: entryCssGzipKbBaseline + entryCssGzipKbAllowance,
  totalCssRawKb: totalCssRawKbBaseline + totalCssRawKbAllowance,
  totalCssGzipKb: totalCssGzipKbBaseline + totalCssGzipKbAllowance,
  totalJsRawKb: totalJsRawKbBaseline + totalJsRawKbAllowance,
  totalJsGzipKb: totalJsGzipKbBaseline + totalJsGzipKbAllowance,
};

if (!existsSync(distAssets)) {
  console.error("dist/assets not found. Run npm run build before verify:performance.");
  process.exit(1);
}

if (!existsSync(manifestPath)) {
  console.error(
    "dist/.vite/manifest.json not found. Run npm run build before verify:performance.",
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entryCssAssetFiles = new Set(
  Object.values(manifest)
    .filter((entry) => entry.isEntry)
    .flatMap((entry) => entry.css ?? [])
    .map((file) => file.replace(/^assets\//, "")),
);

const assets = readdirSync(distAssets)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => {
    const path = join(distAssets, file);
    const rawBytes = statSync(path).size;
    const gzipBytes = gzipSync(readFileSync(path)).length;
    return { file, path, rawBytes, gzipBytes };
  });

const failures = [];

if (!assets.some((asset) => asset.file.endsWith(".js"))) {
  failures.push("No JavaScript asset found in dist/assets");
}

if (!assets.some((asset) => asset.file.endsWith(".css"))) {
  failures.push("No CSS asset found in dist/assets");
}

for (const asset of assets) {
  const rawKb = asset.rawBytes / 1024;
  const gzipKb = asset.gzipBytes / 1024;
  const isJs = asset.file.endsWith(".js");
  const isWorkspaceSurface = asset.file.startsWith("WorkspaceSurface-");
  const isEntryCss = !isJs && entryCssAssetFiles.has(asset.file);
  const rawLimit = isWorkspaceSurface
    ? lazyWorkspaceRawKbLimit
    : isEntryCss
      ? limits.entryCssRawKb
      : isJs
        ? limits.jsRawKb
        : limits.cssRawKb;
  const gzipLimit = isWorkspaceSurface
    ? lazyWorkspaceGzipKbLimit
    : isEntryCss
      ? limits.entryCssGzipKb
      : isJs
        ? limits.jsGzipKb
        : limits.cssGzipKb;

  if (rawKb > rawLimit) {
    failures.push(`${asset.file}: ${rawKb.toFixed(1)} KB raw exceeds ${rawLimit} KB`);
  }

  if (gzipKb > gzipLimit) {
    failures.push(
      `${asset.file}: ${gzipKb.toFixed(1)} KB gzip exceeds ${gzipLimit} KB`,
    );
  }
}

const jsAssets = assets.filter((asset) => asset.file.endsWith(".js"));
const cssAssets = assets.filter((asset) => asset.file.endsWith(".css"));
const entryManifestKeys = Object.entries(manifest)
  .filter(([, entry]) => entry.isEntry)
  .map(([key]) => key);
const workspaceManifestKey = Object.keys(manifest).find(
  (key) => key === "src/components/WorkspaceSurface.tsx",
);
const initialJsAssetFiles = collectStaticJsFiles(manifest, entryManifestKeys);
const workspaceRoleManifestKeys = workspaceManifestKey
  ? (manifest[workspaceManifestKey]?.dynamicImports ?? [])
  : [];
const activeSettingsOwnerManifestKeys = [
  "src/components/CommandCenter.tsx",
  "src/components/AdminWorkspace.tsx",
];
const workspaceJsAssetFiles = workspaceManifestKey
  ? collectStaticJsFiles(manifest, [workspaceManifestKey, ...workspaceRoleManifestKeys])
  : new Set();

for (const initialFile of initialJsAssetFiles) {
  workspaceJsAssetFiles.delete(initialFile);
}

const lazyWorkbookAssets = jsAssets.filter((asset) =>
  asset.file.startsWith("exportWorkbook-"),
);
const lazyPassportOcrAssets = jsAssets.filter((asset) =>
  asset.file.startsWith("Tesseract-"),
);
const lazyPdfAssets = jsAssets.filter((asset) => asset.file.startsWith("pdf-"));
const lazyWorkspaceAssets = jsAssets.filter((asset) =>
  workspaceJsAssetFiles.has(asset.file),
);
const initialJsAssets = jsAssets.filter((asset) => initialJsAssetFiles.has(asset.file));
const totalJsRawKb =
  initialJsAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const totalJsGzipKb =
  initialJsAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const totalCssRawKb = cssAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const totalCssGzipKb =
  cssAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const lazyWorkbookRawKb =
  lazyWorkbookAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazyWorkbookGzipKb =
  lazyWorkbookAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const lazyPassportOcrRawKb =
  lazyPassportOcrAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazyPassportOcrGzipKb =
  lazyPassportOcrAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const lazyPdfRawKb =
  lazyPdfAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazyPdfGzipKb =
  lazyPdfAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const lazyWorkspaceRawKb =
  lazyWorkspaceAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazyWorkspaceGzipKb =
  lazyWorkspaceAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;

if (totalJsRawKb > limits.totalJsRawKb) {
  failures.push(
    `initial JS: ${totalJsRawKb.toFixed(1)} KB raw exceeds ${limits.totalJsRawKb} KB`,
  );
}

if (totalJsGzipKb > limits.totalJsGzipKb) {
  failures.push(
    `initial JS: ${totalJsGzipKb.toFixed(1)} KB gzip exceeds ${limits.totalJsGzipKb} KB`,
  );
}

if (cssAssets.length > cssChunkCountLimit) {
  failures.push(`CSS chunks: ${cssAssets.length} exceeds ${cssChunkCountLimit}`);
}

if (totalCssRawKb > limits.totalCssRawKb) {
  failures.push(
    `total CSS: ${totalCssRawKb.toFixed(1)} KB raw exceeds ${limits.totalCssRawKb} KB`,
  );
}

if (totalCssGzipKb > limits.totalCssGzipKb) {
  failures.push(
    `total CSS: ${totalCssGzipKb.toFixed(1)} KB gzip exceeds ${limits.totalCssGzipKb} KB`,
  );
}

if (lazyWorkbookAssets.length > 1) {
  failures.push("export workbook must stay in one lazy JS chunk");
}

if (lazyPassportOcrAssets.length > 1) {
  failures.push("passport OCR must stay in one lazy JS chunk");
}

if (lazyPdfAssets.length > 1) {
  failures.push("PDF review runtime must stay in one lazy JS chunk");
}

if (!workspaceManifestKey) {
  failures.push("workspace surface must stay present in the production manifest");
}

if (entryManifestKeys.length !== 1) {
  failures.push("production manifest must expose exactly one initial entry");
}

const activeSettingsOwnersStayLazy = activeSettingsOwnerManifestKeys.every((key) => {
  const entry = manifest[key];
  const assetFile = entry?.file?.replace(/^assets\//, "");
  return (
    workspaceRoleManifestKeys.includes(key) &&
    entry?.isDynamicEntry === true &&
    assetFile?.endsWith(".js") &&
    !initialJsAssetFiles.has(assetFile)
  );
});

if (!activeSettingsOwnersStayLazy) {
  failures.push(
    "active settings routes must stay behind lazy CommandCenter/AdminWorkspace workspace boundaries",
  );
}

if (
  jsAssets.filter((asset) => asset.file.startsWith("WorkspaceSurface-")).length !== 1
) {
  failures.push(
    "workspace surface must stay lazy and emit one WorkspaceSurface-* JS chunk",
  );
}

if (jsAssets.filter((asset) => asset.file.startsWith("CommandCenter-")).length !== 1) {
  failures.push("agent workspace must stay lazy and emit one CommandCenter-* JS chunk");
}

if (jsAssets.filter((asset) => asset.file.startsWith("AdminWorkspace-")).length !== 1) {
  failures.push(
    "admin workspace must stay lazy and emit one AdminWorkspace-* JS chunk",
  );
}

if (lazyWorkbookRawKb > lazyWorkbookRawKbLimit) {
  failures.push(
    `export workbook lazy JS: ${lazyWorkbookRawKb.toFixed(
      1,
    )} KB raw exceeds ${lazyWorkbookRawKbLimit} KB`,
  );
}

if (lazyWorkbookGzipKb > lazyWorkbookGzipKbLimit) {
  failures.push(
    `export workbook lazy JS: ${lazyWorkbookGzipKb.toFixed(
      1,
    )} KB gzip exceeds ${lazyWorkbookGzipKbLimit} KB`,
  );
}

if (lazyPassportOcrRawKb > lazyPassportOcrRawKbLimit) {
  failures.push(
    `passport OCR lazy JS: ${lazyPassportOcrRawKb.toFixed(
      1,
    )} KB raw exceeds ${lazyPassportOcrRawKbLimit} KB`,
  );
}

if (lazyPassportOcrGzipKb > lazyPassportOcrGzipKbLimit) {
  failures.push(
    `passport OCR lazy JS: ${lazyPassportOcrGzipKb.toFixed(
      1,
    )} KB gzip exceeds ${lazyPassportOcrGzipKbLimit} KB`,
  );
}

if (lazyPdfRawKb > lazyPdfRawKbLimit) {
  failures.push(
    `PDF review lazy JS: ${lazyPdfRawKb.toFixed(
      1,
    )} KB raw exceeds ${lazyPdfRawKbLimit} KB`,
  );
}

if (lazyPdfGzipKb > lazyPdfGzipKbLimit) {
  failures.push(
    `PDF review lazy JS: ${lazyPdfGzipKb.toFixed(
      1,
    )} KB gzip exceeds ${lazyPdfGzipKbLimit} KB`,
  );
}

if (lazyWorkspaceRawKb > lazyWorkspaceRawKbLimit) {
  failures.push(
    `workspace surface lazy JS: ${lazyWorkspaceRawKb.toFixed(
      1,
    )} KB raw exceeds ${lazyWorkspaceRawKbLimit} KB`,
  );
}

if (lazyWorkspaceGzipKb > lazyWorkspaceGzipKbLimit) {
  failures.push(
    `workspace surface lazy JS: ${lazyWorkspaceGzipKb.toFixed(
      1,
    )} KB gzip exceeds ${lazyWorkspaceGzipKbLimit} KB`,
  );
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const summary = assets
  .map(
    (asset) =>
      `${asset.file}: ${(asset.rawBytes / 1024).toFixed(1)} KB raw, ${(
        asset.gzipBytes / 1024
      ).toFixed(1)} KB gzip`,
  )
  .join("\n");

console.log(
  `Performance budget passed\n${summary}\ninitial JS: ${totalJsRawKb.toFixed(
    1,
  )} KB raw, ${totalJsGzipKb.toFixed(
    1,
  )} KB gzip\ntotal CSS: ${totalCssRawKb.toFixed(1)} KB raw, ${totalCssGzipKb.toFixed(
    1,
  )} KB gzip across ${cssAssets.length} chunks\nexport workbook lazy JS: ${lazyWorkbookRawKb.toFixed(
    1,
  )} KB raw, ${lazyWorkbookGzipKb.toFixed(
    1,
  )} KB gzip\npassport OCR lazy JS: ${lazyPassportOcrRawKb.toFixed(
    1,
  )} KB raw, ${lazyPassportOcrGzipKb.toFixed(
    1,
  )} KB gzip\nPDF review lazy JS: ${lazyPdfRawKb.toFixed(
    1,
  )} KB raw, ${lazyPdfGzipKb.toFixed(
    1,
  )} KB gzip\nworkspace surface lazy JS: ${lazyWorkspaceRawKb.toFixed(
    1,
  )} KB raw, ${lazyWorkspaceGzipKb.toFixed(1)} KB gzip`,
);

function collectStaticJsFiles(manifestEntries, rootKeys) {
  const files = new Set();
  const visited = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);

    const entry = manifestEntries[key];
    if (!entry) return;
    if (entry.file?.endsWith(".js")) {
      files.add(entry.file.replace(/^assets\//, ""));
    }

    for (const importedKey of entry.imports ?? []) {
      visit(importedKey);
    }
  }

  for (const rootKey of rootKeys) {
    visit(rootKey);
  }

  return files;
}
