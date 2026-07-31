import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preUploadCss = readFileSync(
  resolve(process.cwd(), "src/components/PreUploadScreen.css"),
  "utf8",
);

describe("pre-upload responsive layout contract", () => {
  it("balances the compact create surface only on tall tablet layouts", () => {
    const tabletRules = preUploadCss.match(
      /@media \(min-width: 480px\) and \(max-width: 1279px\) and \(min-height: 900px\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 767px\)/,
    );

    expect(tabletRules?.[1]).toBeDefined();
    expect(tabletRules?.[1].replace(/\s+/g, " ")).toContain(
      '.v19-agent-workspace-content[data-agent-screen="create"] { display: grid; align-items: center;',
    );
    expect(tabletRules?.[1].replace(/\s+/g, " ")).toContain(
      ".v19-preupload-screen { min-height: 0; padding-block: clamp(12px, 3vh, 32px);",
    );
  });
});
