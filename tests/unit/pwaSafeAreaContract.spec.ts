import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pwaShellCss = readFileSync(
  resolve(process.cwd(), "src/pwa/pwa-shell.css"),
  "utf8",
);

function getRuleBody(selector: string) {
  const normalizedCss = pwaShellCss.replace(/\s+/g, " ");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizedCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  if (match?.[1] === undefined) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return match[1];
}

describe("PWA safe-area boundary", () => {
  it("does not add safe-area padding to the 100dvh application root", () => {
    const rootRule = getRuleBody("#root");

    expect(rootRule).toContain("min-height: 100svh");
    expect(rootRule).toContain("min-height: 100dvh");
    expect(rootRule).not.toMatch(/^\s*padding(?:-(?:top|right|bottom|left))?\s*:/m);
  });

  it("keeps safe-area offsets on the fixed install surface", () => {
    const assistantRule = getRuleBody(".vf-pwa-install-assistant");

    expect(assistantRule).toContain("position: fixed");
    expect(assistantRule).toContain("var(--vf-safe-area-right)");
    expect(assistantRule).toContain("var(--vf-safe-area-bottom)");
    expect(assistantRule).toContain("var(--vf-safe-area-left)");
  });

  it("keeps fixed fullscreen owners inside the safe viewport", () => {
    const match = pwaShellCss.match(
      /#root\s+:is\(\s*\.admin-passport-workspace,\s*\.v19-review-workspace,\s*\.v19-questionnaire-screen-shell,\s*\.v19-preupload-screen\s*\)\s*\{([^}]*)\}/,
    );

    if (match?.[1] === undefined) {
      throw new Error("Missing fixed fullscreen safe-area owner rule");
    }

    const rule = match[1];

    expect(rule).toContain("box-sizing: border-box");
    expect(rule).toContain("border-width: var(--vf-safe-area-top)");
    expect(rule).toContain("var(--vf-safe-area-right)");
    expect(rule).not.toContain("var(--vf-safe-area-bottom)");
    expect(rule).toContain("var(--vf-safe-area-left)");
  });

  it("lets the create footer own the bottom inset without adding it twice", () => {
    const rule = getRuleBody(
      "#root .v19-preupload-screen .v19-preupload-footer",
    );

    expect(rule).toContain(
      "padding-bottom: max(var(--v19b-size-16), var(--vf-safe-area-bottom))",
    );
    expect(rule).not.toContain("var(--vf-safe-area-left)");
    expect(rule).not.toContain("var(--vf-safe-area-right)");
    expect(rule).not.toContain("calc(");
  });

  it("protects the viewport-fixed admin passport footer inline", () => {
    const rule = getRuleBody(
      "#root .admin-passport-workspace > .admin-passport-workspace-footer",
    );

    expect(rule).toContain("var(--vf-safe-area-left)");
    expect(rule).toContain("var(--vf-safe-area-right)");
  });

  it("keeps the fixed operational sidebar inside every physical safe edge", () => {
    const selector =
      '#root .ops-shell.has-unified-side-menu > .v19-ds-side-menu.ops-sidebar.opsu-sidebar[data-v19-component="side-menu"]';
    const rule = getRuleBody(selector);

    expect(rule).toContain("box-sizing: border-box");
    expect(rule).toContain("var(--vf-safe-area-top)");
    expect(rule).toContain("var(--vf-safe-area-bottom)");
    expect(rule).toContain("var(--vf-safe-area-left)");
  });

  it("keeps workspace top and inline edges physical while bottom remains scroll-owned", () => {
    const rule = getRuleBody("#root .ops-shell.has-unified-side-menu > .workspace");

    expect(rule).toContain("box-sizing: border-box");
    expect(rule).toContain("border-top: var(--vf-safe-area-top)");
    expect(rule).toContain("border-right: var(--vf-safe-area-right)");
    expect(rule).not.toContain("border-bottom:");
    expect(rule).toContain("scroll-padding:");
    expect(pwaShellCss).toContain("@media (max-width: 1024px)");
  });
});
