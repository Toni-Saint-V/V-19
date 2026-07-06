import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { error, log } from "node:console";

const root = process.argv[2] ?? process.cwd();
const requiredFiles = [
  "src/shared/ui/SideMenuButton.tsx",
  "src/shared/ui/side-menu-button.css",
  "src/shared/ui/v19-workflow-premium.css",
  "src/modules/submissions/documentIntake.ts",
  "src/modules/submissions/exportPackageZip.ts",
  "src/modules/submissions/pdfTextExtraction.ts",
  "src/modules/submissions/components/OperationalNavigation.tsx",
  "src/modules/submissions/pages/OperationsScreens.tsx",
];

const checks = [
  {
    file: "src/main.tsx",
    tokens: [
      "./shared/ui/side-menu-button.css",
      "./shared/ui/v19-workflow-premium.css",
    ],
  },
  {
    file: "src/modules/submissions/components/OperationalNavigation.tsx",
    tokens: ["SideMenuButton", "collapsed={displayMode === \"compact\"}"],
  },
  {
    file: "src/modules/submissions/documentIntake.ts",
    tokens: [
      "validateSubmissionFileUpload",
      "validateVisaApplicationPdfUpload",
      "summarizeSubmissionDocumentReadiness",
    ],
  },
  {
    file: "src/modules/submissions/exportPackageZip.ts",
    tokens: [
      "visaflow.export_package.v2",
      "00_Excel",
      "__MISSING__",
      "createMediaSignedUrl",
      "manifest.json",
      "issues.json",
    ],
  },
  {
    file: "src/modules/submissions/pdfTextExtraction.ts",
    tokens: [
      "validateVisaApplicationPdfFile",
      "pdfLoadFailureMessage",
      "normalizeExtractedPdfText",
    ],
  },
  {
    file: "src/shared/ui/side-menu-button.css",
    tokens: [
      ".vf-side-menu-button",
      "is-collapsed",
      "focus-visible",
      "prefers-reduced-motion",
    ],
  },
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`Missing file: ${file}`);
}

for (const check of checks) {
  const path = join(root, check.file);
  if (!existsSync(path)) {
    failures.push(`Missing checked file: ${check.file}`);
    continue;
  }
  const source = readFileSync(path, "utf8");
  for (const token of check.tokens) {
    if (!source.includes(token)) failures.push(`${check.file}: missing token ${token}`);
  }
}

if (failures.length) {
  error("V-19 premium upgrade verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

log("V-19 premium upgrade verification passed.");
