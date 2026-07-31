import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preUploadCss = readFileSync(
  resolve(process.cwd(), "src/components/PreUploadScreen.css"),
  "utf8",
);

describe("pre-upload responsive layout contract", () => {
  it("stretches the create surface through the available tablet and desktop area", () => {
    const tabletRules = preUploadCss.match(
      /@media \(min-width: 768px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 767px\)/,
    );

    expect(tabletRules?.[1]).toBeDefined();
    expect(tabletRules?.[1].replace(/\s+/g, " ")).toContain(
      '.v19-agent-workspace-content[data-agent-screen="create"] { display: grid; min-height: 100%; align-items: stretch;',
    );
    expect(tabletRules?.[1].replace(/\s+/g, " ")).toContain(
      ".v19-preupload-card { height: 100%; min-height: 100%;",
    );
  });
});
