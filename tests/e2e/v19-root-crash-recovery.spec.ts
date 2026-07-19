import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openFreshWorkspace } from "./v19-pilot-helpers";

const viewportMatrix = [
  { height: 740, width: 320 },
  { height: 812, width: 375 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
  { height: 1024, width: 768 },
  { height: 900, width: 1440 },
];

test("root crash state recovers from a failed workspace chunk", async ({ page }) => {
  const visualArtifactsRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();
  if (visualArtifactsRoot) mkdirSync(visualArtifactsRoot, { recursive: true });

  await page.setViewportSize({ height: 844, width: 390 });
  await openFreshWorkspace(page);

  let abortedWorkspaceRequests = 0;
  await page.route("**/src/components/WorkspaceSurface.tsx*", async (route) => {
    abortedWorkspaceRequests += 1;
    await route.abort("failed");
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => abortedWorkspaceRequests).toBeGreaterThan(0);

  const crashState = page.getByTestId("app-crash-boundary");
  const reloadButton = page.getByRole("button", {
    name: "Перезагрузить приложение",
  });

  await expect(crashState).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Интерфейс не загрузился" }),
  ).toBeVisible();

  for (const viewport of viewportMatrix) {
    await page.setViewportSize(viewport);
    await expect(crashState).toBeVisible();
    await expect(reloadButton).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    if (visualArtifactsRoot && (viewport.width === 390 || viewport.width === 1440)) {
      await page.screenshot({
        path: resolve(visualArtifactsRoot, `root-crash-${viewport.width}.png`),
      });
    }
  }

  await reloadButton.focus();
  await expect(reloadButton).toBeFocused();

  const requestsBeforeRetry = abortedWorkspaceRequests;
  await reloadButton.click();
  await expect
    .poll(() => abortedWorkspaceRequests)
    .toBeGreaterThan(requestsBeforeRetry);
  await expect(crashState).toBeVisible();
});
