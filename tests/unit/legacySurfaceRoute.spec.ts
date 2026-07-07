import { describe, expect, test } from "vitest";
import { resolveLegacySurfaceRoute } from "../../src/modules/submissions/uiTypes";

describe("legacy surface route compatibility", () => {
  test.each([
    ["agent-media", "agent-documents", "files"],
    ["media", "agent-documents", "files"],
    ["files", "agent-documents", "files"],
    ["agent-drafts", "agent-documents", "files"],
  ] as const)("redirects %s to document collection", (route, surface, drawerTab) => {
    expect(resolveLegacySurfaceRoute(route, "agent")).toEqual({
      drawerTab,
      surface,
    });
  });

  test("keeps plain drafts as a submission status filter instead of a screen", () => {
    expect(resolveLegacySurfaceRoute("drafts", "agent")).toEqual({
      agentTab: "progress",
      surface: "agent-submissions",
    });
  });

  test.each([
    ["agent-issues", "agent", "agent-actions"],
    ["issues", "admin", "admin-review"],
  ] as const)("redirects %s to role-owned review context", (route, role, surface) => {
    expect(resolveLegacySurfaceRoute(route, role)).toEqual({
      drawerTab: "issues",
      surface,
    });
  });

  test("keeps applicants inside submission detail", () => {
    expect(resolveLegacySurfaceRoute("applicants", "agent")).toEqual({
      drawerTab: "applicants",
      surface: "agent-submissions",
    });
  });
});
