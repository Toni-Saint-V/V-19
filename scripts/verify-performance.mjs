import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const distAssets = join(process.cwd(), "dist", "assets");

// Temporary V-19 visual-lock baseline. The shell currently ships one global CSS
// bundle; fail any growth beyond this narrow allowance until a dedicated CSS
// split or cleanup lowers the budget again.
const cssRawKbBaseline = 132;
const cssRawKbAllowance = 4;
const cssGzipKbBaseline = 22.8;
const cssGzipKbAllowance = 1.2;
// AgentInbox and AgentActions are restored first-class agent surfaces. Keep a
// no-growth aggregate JS ceiling at the measured bundle size until code-splitting
// or cleanup lowers the budget again.
const totalJsGzipKbBaseline = 182;
const totalJsGzipKbAllowance = 0;
const lazyWorkbookRawKbLimit = 6;
const lazyWorkbookGzipKbLimit = 2.4;
const lazySettingsRawKbLimit = 5;
const lazySettingsGzipKbLimit = 1.8;

const limits = {
  jsRawKb: 500,
  jsGzipKb: 160,
  cssRawKb: cssRawKbBaseline + cssRawKbAllowance,
  cssGzipKb: cssGzipKbBaseline + cssGzipKbAllowance,
  totalJsRawKb: 650,
  totalJsGzipKb: totalJsGzipKbBaseline + totalJsGzipKbAllowance,
};

if (!existsSync(distAssets)) {
  console.error("dist/assets not found. Run npm run build before verify:performance.");
  process.exit(1);
}

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
  const rawLimit = isJs ? limits.jsRawKb : limits.cssRawKb;
  const gzipLimit = isJs ? limits.jsGzipKb : limits.cssGzipKb;

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
const lazyWorkbookAssets = jsAssets.filter((asset) =>
  asset.file.startsWith("exportWorkbook-"),
);
const lazySettingsAssets = jsAssets.filter((asset) =>
  asset.file.startsWith("SettingsScreen-"),
);
const initialJsAssets = jsAssets.filter(
  (asset) =>
    !lazyWorkbookAssets.includes(asset) && !lazySettingsAssets.includes(asset),
);
const totalJsRawKb =
  initialJsAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const totalJsGzipKb =
  initialJsAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const lazyWorkbookRawKb =
  lazyWorkbookAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazyWorkbookGzipKb =
  lazyWorkbookAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const lazySettingsRawKb =
  lazySettingsAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazySettingsGzipKb =
  lazySettingsAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;

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

if (lazyWorkbookAssets.length > 1) {
  failures.push("export workbook must stay in one lazy JS chunk");
}

if (lazySettingsAssets.length > 1) {
  failures.push("settings screen must stay in one lazy JS chunk");
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

if (lazySettingsRawKb > lazySettingsRawKbLimit) {
  failures.push(
    `settings lazy JS: ${lazySettingsRawKb.toFixed(
      1,
    )} KB raw exceeds ${lazySettingsRawKbLimit} KB`,
  );
}

if (lazySettingsGzipKb > lazySettingsGzipKbLimit) {
  failures.push(
    `settings lazy JS: ${lazySettingsGzipKb.toFixed(
      1,
    )} KB gzip exceeds ${lazySettingsGzipKbLimit} KB`,
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
  )} KB gzip\nexport workbook lazy JS: ${lazyWorkbookRawKb.toFixed(
    1,
  )} KB raw, ${lazyWorkbookGzipKb.toFixed(
    1,
  )} KB gzip\nsettings lazy JS: ${lazySettingsRawKb.toFixed(
    1,
  )} KB raw, ${lazySettingsGzipKb.toFixed(1)} KB gzip`,
);
