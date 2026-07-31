import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const operationalCss = readFileSync(
  resolve(process.cwd(), "src/shared/ui/operational-screen-convergence.css"),
  "utf8",
);

describe("agent submissions responsive layout contract", () => {
  it("keeps the family name and status in one row when the card has room", () => {
    const tabletRules = operationalCss.match(
      /@media \(min-width: 480px\) and \(max-width: 767px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 640px\)/,
    );

    expect(tabletRules?.[1]).toBeDefined();
    expect(tabletRules?.[1].replace(/\s+/g, " ")).toContain(
      ".v19-applicant-family-header { grid-template-columns: minmax(var(--v19b-size-0), 1fr) auto !important; align-items: center;",
    );
    expect(tabletRules?.[1].replace(/\s+/g, " ")).toContain(
      ".v19-applicant-family-main { grid-column: 1; grid-row: 1;",
    );
    expect(tabletRules?.[1].replace(/\s+/g, " ")).toContain(
      ".v19-applicant-card-head-actions { grid-column: 2; grid-row: 1; align-self: center;",
    );
  });
});
