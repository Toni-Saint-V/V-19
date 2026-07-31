import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminPremiumCss = readFileSync(
  resolve(process.cwd(), "src/shared/ui/admin-premium-convergence.css"),
  "utf8",
);

describe("admin responsive layout contract", () => {
  it("lets the mobile PageHeader action column fit every rendered action", () => {
    const mobileRules = adminPremiumCss.match(
      /@media \(max-width: 767px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 479px\)/,
    );

    expect(mobileRules?.[1]).toBeDefined();

    const headerRule = mobileRules?.[1].match(
      /#root\s+\.v19-admin-workspace-root\s+\.ops-shell\.surface-admin-users\s+> \.workspace\s+> \.topbar\.v19-page-header\s*\{([^{}]+)\}/,
    );

    expect(headerRule?.[1]).toBeDefined();
    expect(headerRule?.[1].replace(/\s+/g, " ").trim()).toContain(
      "grid-template-columns: var(--v19b-size-44) minmax(0, 1fr) auto !important;",
    );
    expect(headerRule?.[1]).not.toContain("var(--v19b-size-44) !important;");
  });
});
