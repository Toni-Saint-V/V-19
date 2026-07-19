import { expect, test, type Page } from "@playwright/test";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

function collectWorkspaceModuleRequests(page: Page) {
  const requestedModules: string[] = [];

  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      pathname.endsWith("/WorkspaceSurface.tsx") ||
      pathname.endsWith("/CommandCenter.tsx") ||
      pathname.endsWith("/AdminWorkspace.tsx")
    ) {
      requestedModules.push(pathname);
    }
  });

  return requestedModules;
}

test.describe("V-19 workspace lazy boundary", () => {
  test("agent session downloads only the agent workspace module", async ({ page }) => {
    const problems = collectBrowserProblems(page);
    const requestedModules = collectWorkspaceModuleRequests(page);

    await openFreshWorkspace(page);

    expect(
      requestedModules.some((path) => path.endsWith("/WorkspaceSurface.tsx")),
    ).toBe(true);
    expect(requestedModules.some((path) => path.endsWith("/CommandCenter.tsx"))).toBe(
      true,
    );
    expect(requestedModules.some((path) => path.endsWith("/AdminWorkspace.tsx"))).toBe(
      false,
    );
    expect(problems).toEqual([]);
  });

  test("admin session downloads only the admin workspace module", async ({ page }) => {
    const problems = collectBrowserProblems(page);
    const requestedModules = collectWorkspaceModuleRequests(page);

    await openFreshWorkspace(page, {
      workspaceEmail: "2@2.ru",
    });

    expect(
      requestedModules.some((path) => path.endsWith("/WorkspaceSurface.tsx")),
    ).toBe(true);
    expect(requestedModules.some((path) => path.endsWith("/AdminWorkspace.tsx"))).toBe(
      true,
    );
    expect(requestedModules.some((path) => path.endsWith("/CommandCenter.tsx"))).toBe(
      false,
    );
    expect(problems).toEqual([]);
  });
});
