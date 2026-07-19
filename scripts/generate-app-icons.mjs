import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const workspaceRoot = process.cwd();
const sourcePath = resolve(workspaceRoot, "public", "v19-app-icon.svg");
const targets = [
  { file: "v19-apple-touch-icon-v1.png", size: 180 },
  { file: "v19-app-icon-192-v1.png", size: 192 },
  { file: "v19-app-icon-512-v1.png", size: 512 },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const target of targets) {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { height: target.size, width: target.size },
    });

    await page.goto(pathToFileURL(sourcePath).href, { waitUntil: "load" });
    await page.screenshot({
      omitBackground: true,
      path: resolve(workspaceRoot, "public", target.file),
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(
  `Generated V-19 app icons: ${targets.map(({ file, size }) => `${file} (${size}x${size})`).join(", ")}`,
);
