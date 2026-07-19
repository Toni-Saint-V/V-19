import { expect, test } from "@playwright/test";

import {
  collectBrowserProblems,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

test("reduced motion keeps workspace entrance stationary", async ({ page }) => {
  const problems = collectBrowserProblems(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const samples: Array<{ inlineStyle: string; transform: string }> = [];
    (
      globalThis as unknown as {
        __v19WorkspaceMotionSamples: typeof samples;
      }
    ).__v19WorkspaceMotionSamples = samples;

    const recordWorkspaceMotion = () => {
      const surface = document.querySelector<HTMLElement>(".v19-fullscreen-app");
      if (!surface) return;

      samples.push({
        inlineStyle: surface.getAttribute("style") ?? "",
        transform: getComputedStyle(surface).transform,
      });
    };

    new MutationObserver(recordWorkspaceMotion).observe(document, {
      attributeFilter: ["style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
  });

  await openFreshWorkspace(page);
  await expect(page.locator(".v19-fullscreen-app")).toBeVisible();

  const samples = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __v19WorkspaceMotionSamples?: Array<{
            inlineStyle: string;
            transform: string;
          }>;
        }
      ).__v19WorkspaceMotionSamples ?? [],
  );

  expect(samples.length).toBeGreaterThan(0);
  expect(
    samples.some(
      ({ inlineStyle, transform }) =>
        inlineStyle.includes("translate") ||
        (transform !== "none" && transform !== ""),
    ),
  ).toBe(false);
  expect(problems).toEqual([]);
});
