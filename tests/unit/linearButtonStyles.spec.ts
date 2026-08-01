import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/shared/ui/linear-buttons.css"),
  "utf8",
);
const productActions = [
  "src/App.tsx",
  "src/components/AdminReturnPackagesScreen.tsx",
  "src/components/Drawer.tsx",
  "src/components/MediaScreen.tsx",
  "src/components/RemarkForm.tsx",
  "src/components/ReviewWorkspace.tsx",
  "src/components/PreUploadScreen.tsx",
  "src/components/AdminReviewDrawer.tsx",
  "src/modules/submissions/components/AdminReviewDrawer.tsx",
  "src/modules/submissions/components/AdminExportRightPanel.tsx",
  "src/modules/submissions/components/adminAiAssistance.tsx",
  "src/modules/submissions/components/FigmaQuestionnaireScreen.tsx",
  "src/modules/submissions/pages/SettingsScreen.tsx",
  "src/modules/submissions/pages/OperationsScreens.tsx",
  "src/pwa/PwaInstallAssistant.tsx",
]
  .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
  .join("\n");

describe("Linear Indigo product button contract", () => {
  test("keeps the product-wide coverage explicit", () => {
    expect(stylesheet).not.toMatch(/(?:^|,)\s*button\s*(?:,|\{)/m);
    expect(stylesheet).toContain(".linear-product-action");
    expect(productActions).toContain(
      "linear-product-action linear-product-action--primary v19-admin-export-primary-action",
    );
    expect(productActions).toContain("familyCopyPreview");
    expect(productActions).toContain('? "linear-product-action--primary"');
    expect(productActions).toContain(
      "} v19-questionnaire-draft-button v19-questionnaire-copy-button",
    );
    expect(productActions).toContain('primaryButtonClassName === "is-warning"');
    expect(productActions).toContain('? "linear-product-action--warning"');
    expect(productActions).toContain("v19-agent-drawer-primary");
    expect(productActions).toContain("linear-product-action--primary is-primary");
    expect(productActions).toContain(
      "linear-product-action linear-product-action--primary vf-pwa-install-action",
    );
    expect(productActions).toContain('aria-label="Фильтровать файлы"');
    expect(productActions).toContain(
      "linear-product-action linear-product-action--primary admin-review-primary",
    );
    expect(productActions).toContain(
      'linear-product-action linear-product-action--primary"\n          type="button"',
    );
    expect(productActions).toContain(
      "linear-product-action linear-product-action--danger is-danger",
    );
  });

  test("keeps structural controls out of the primary gradient", () => {
    expect(productActions).toContain("className={`v20-tab-button");
    expect(productActions).toContain("className={`settings-switch");
    expect(productActions).not.toContain(
      "linear-product-action linear-product-action--primary v20-tab-button",
    );
    expect(productActions).not.toContain(
      "linear-product-action linear-product-action--primary settings-switch",
    );
  });

  test("defines disabled, focus, mobile target, and reduced-motion states", () => {
    expect(stylesheet).toContain(':not(:disabled, [aria-disabled="true"]):hover');
    expect(stylesheet).toContain(":focus-visible");
    expect(stylesheet).toContain(':is(:disabled, [aria-disabled="true"])');
    expect(stylesheet).toContain("@media (max-width: 767px)");
    expect(stylesheet).toContain("var(--v19b-size-44)");
    expect(stylesheet).toContain(
      ".linear-product-action--icon.linear-product-action--compact",
    );
    expect(stylesheet).toContain(
      "height: var(--v19-linear-button-height-default) !important",
    );
    expect(stylesheet).toContain(
      "height: var(--v19-linear-button-height-compact) !important",
    );
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
