import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const distAssets = join(process.cwd(), "dist", "assets");

// Current V-19 cockpit baseline. The shell still ships a large global CSS
// bundle and several intentionally lazy operational chunks; keep no-growth
// ceilings until a dedicated split lowers the budget.
const cssRawKbBaseline = 250;
const cssRawKbAllowance = 1;
const cssGzipKbBaseline = 38;
const cssGzipKbAllowance = 1;
const totalJsRawKbBaseline = 1054;
const totalJsRawKbAllowance = 1;
const totalJsGzipKbBaseline = 302;
const totalJsGzipKbAllowance = 1;
const lazyWorkbookRawKbLimit = 8.2;
const lazyWorkbookGzipKbLimit = 3;
const lazySettingsRawKbLimit = 11;
const lazySettingsGzipKbLimit = 3;
const lazyPassportOcrRawKbLimit = 8.2;
const lazyPassportOcrGzipKbLimit = 3.7;
const lazyPdfRawKbLimit = 380;
const lazyPdfGzipKbLimit = 115;

const limits = {
  jsRawKb: 500,
  jsGzipKb: 160,
  cssRawKb: cssRawKbBaseline + cssRawKbAllowance,
  cssGzipKb: cssGzipKbBaseline + cssGzipKbAllowance,
  totalJsRawKb: totalJsRawKbBaseline + totalJsRawKbAllowance,
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
const lazyPassportOcrAssets = jsAssets.filter((asset) =>
  asset.file.startsWith("Tesseract-"),
);
const lazyPdfAssets = jsAssets.filter((asset) => asset.file.startsWith("pdf-"));
const initialJsAssets = jsAssets.filter(
  (asset) =>
    !lazyWorkbookAssets.includes(asset) &&
    !lazySettingsAssets.includes(asset) &&
    !lazyPassportOcrAssets.includes(asset) &&
    !lazyPdfAssets.includes(asset),
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
const lazyPassportOcrRawKb =
  lazyPassportOcrAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazyPassportOcrGzipKb =
  lazyPassportOcrAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;
const lazyPdfRawKb =
  lazyPdfAssets.reduce((sum, asset) => sum + asset.rawBytes, 0) / 1024;
const lazyPdfGzipKb =
  lazyPdfAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0) / 1024;

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

if (lazyPassportOcrAssets.length > 1) {
  failures.push("passport OCR must stay in one lazy JS chunk");
}

if (lazyPdfAssets.length > 1) {
  failures.push("PDF review runtime must stay in one lazy JS chunk");
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
  )} KB raw, ${lazySettingsGzipKb.toFixed(
    1,
  )} KB gzip\npassport OCR lazy JS: ${lazyPassportOcrRawKb.toFixed(
    1,
  )} KB raw, ${lazyPassportOcrGzipKb.toFixed(
    1,
  )} KB gzip\nPDF review lazy JS: ${lazyPdfRawKb.toFixed(
    1,
  )} KB raw, ${lazyPdfGzipKb.toFixed(1)} KB gzip`,
);
