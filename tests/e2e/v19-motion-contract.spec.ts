import { expect, test, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  clickWorkspaceButton,
  openFreshWorkspace as openPilotWorkspace,
} from "./v19-pilot-helpers";

const sharedMenuEvidenceRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim() || tmpdir();
const sharedMenuEvidencePath = (name: string) => resolve(sharedMenuEvidenceRoot, name);

function collectBrowserProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

async function openFreshWorkspace(
  page: Page,
  options: { heading?: string; workspaceEmail?: string } = {},
) {
  await page.goto("/");
  await page.evaluate(() => {
    (
      globalThis as unknown as { localStorage: { clear(): void } }
    ).localStorage.clear();
  });
  if (options.workspaceEmail) {
    await page.evaluate((workspaceEmail) => {
      (
        globalThis as unknown as {
          localStorage: { setItem(key: string, value: string): void };
        }
      ).localStorage.setItem("visaflow.workspaceEmail.v1", workspaceEmail);
    }, options.workspaceEmail);
  }
  await page.reload();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: options.heading ?? "Мои действия",
    }),
  ).toBeVisible();
}

async function readAgentShellGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing shell element: ${selector}`);
      }
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        width: bounds.width,
        x: bounds.x,
        y: bounds.y,
      };
    };

    return {
      brand: rect(".ops-brand"),
      menu: rect('aside[aria-label="Меню агента"]'),
      nav: rect('nav[aria-label="Операционные разделы"]'),
      search: rect(".ops-sidebar-search"),
      topbar: rect("header.topbar"),
      workspace: rect(".workspace"),
    };
  });
}

test.describe("V-19 motion contract", () => {
  test("agent navigation keeps one stable menu and animates content only", async ({
    page,
  }) => {
    const problems = collectBrowserProblems(page);

    await page.setViewportSize({ height: 900, width: 1440 });
    await openPilotWorkspace(page);

    const baseline = await readAgentShellGeometry(page);
    const actionCellBackgrounds = await page
      .locator(".v19-actions-table-row")
      .evaluateAll((rows) => [
        ...new Set(rows.map((row) => getComputedStyle(row).backgroundColor)),
      ]);
    expect(actionCellBackgrounds.length).toBeGreaterThan(0);
    expect(actionCellBackgrounds.length).toBeLessThanOrEqual(2);
    await page.screenshot({
      path: sharedMenuEvidencePath("v19-shared-menu-before-actions-1440x900.png"),
    });
    await page.locator('aside[aria-label="Меню агента"]').evaluate((menu) => {
      (
        globalThis as unknown as { __v19StableAgentMenu?: Element }
      ).__v19StableAgentMenu = menu;
    });

    const transitionSample = await page.evaluate(async () => {
      const button = [...document.querySelectorAll(".ops-nav button")].find(
        (candidate) =>
          candidate.querySelector("strong")?.textContent?.trim() === "Мои подачи",
      );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Missing Мои подачи navigation button");
      }

      button.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const menu = document.querySelector('aside[aria-label="Меню агента"]');
      const topbar = document.querySelector("header.topbar");
      const contentSurfaces = [
        ...document.querySelectorAll('[data-testid="agent-screen-transition"]'),
      ];
      const movementProperties = new Set([
        "block-size",
        "height",
        "inset",
        "inset-block",
        "inset-inline",
        "inline-size",
        "left",
        "margin",
        "opacity",
        "padding",
        "right",
        "top",
        "transform",
        "width",
      ]);
      const movementAnimationCount = (element: Element | null) =>
        element
          ? element.getAnimations({ subtree: true }).filter((animation) => {
              const transitionProperty = (
                animation as Animation & { transitionProperty?: string }
              ).transitionProperty;
              return transitionProperty
                ? movementProperties.has(transitionProperty)
                : false;
            }).length
          : -1;
      const durations = contentSurfaces.flatMap((surface) =>
        surface.getAnimations().map((animation) => {
          const duration = animation.effect?.getTiming().duration;
          return typeof duration === "number" ? duration : Number(duration);
        }),
      );

      return {
        contentAnimationDurations: durations.filter(Number.isFinite),
        contentStyles: contentSurfaces.map((surface) => {
          const styles = getComputedStyle(surface);
          return { opacity: styles.opacity, transform: styles.transform };
        }),
        sameMenuNode:
          menu ===
          (globalThis as unknown as { __v19StableAgentMenu?: Element })
            .__v19StableAgentMenu,
        sidebarMovementAnimationCount: movementAnimationCount(menu),
        topbarMovementAnimationCount: movementAnimationCount(topbar),
      };
    });

    expect(transitionSample.sameMenuNode).toBe(true);
    expect(transitionSample.sidebarMovementAnimationCount).toBe(0);
    expect(transitionSample.topbarMovementAnimationCount).toBe(0);
    expect(
      transitionSample.contentAnimationDurations.some(
        (duration) => duration >= 140 && duration <= 180,
      ),
    ).toBe(true);
    expect(
      transitionSample.contentStyles.some(
        ({ opacity, transform }) => opacity !== "1" || transform !== "none",
      ),
    ).toBe(true);

    await expect(
      page.locator(
        '[data-testid="agent-screen-transition"][data-agent-screen="submissions"]',
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
    await page.screenshot({
      path: sharedMenuEvidencePath("v19-shared-menu-after-submissions-1440x900.png"),
    });

    const after = await readAgentShellGeometry(page);
    for (const key of Object.keys(baseline) as Array<keyof typeof baseline>) {
      expect(after[key], key).toEqual(baseline[key]);
    }
    await expect(page.locator("main.ops-shell")).toHaveClass(
      /is-agent-shell-source-actions/,
    );
    await expect(page.locator("main.ops-shell")).toHaveClass(
      /surface-agent-submissions/,
    );
    expect(problems).toEqual([]);
  });

  test("state transitions stay scoped and clean up after toolbar changes", async ({
    page,
  }) => {
    const problems = collectBrowserProblems(page);

    await openFreshWorkspace(page);
    await clickWorkspaceButton(page, /^Мои подачи$/);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();

    const viewTransitionSupported = await page.evaluate(
      () =>
        typeof (
          globalThis as unknown as {
            document: { startViewTransition?: unknown };
          }
        ).document.startViewTransition === "function",
    );

    await page.getByRole("tab", { name: /В работе/ }).click();
    await expect(page.getByRole("tab", { name: /В работе/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    if (viewTransitionSupported) {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const browserDocument = (
              globalThis as unknown as {
                document: {
                  documentElement: { classList: { contains(name: string): boolean } };
                };
              }
            ).document;

            return browserDocument.documentElement.classList.contains("vf-vt");
          }),
        )
        .toBe(false);
    }

    await page
      .getByLabel("Инструменты подач")
      .getByRole("button", { name: /Скрыть контекст|Показать контекст/ })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const browserDocument = (
            globalThis as unknown as {
              document: {
                documentElement: { classList: { contains(name: string): boolean } };
              };
            }
          ).document;

          return browserDocument.documentElement.classList.contains("vf-vt");
        }),
      )
      .toBe(false);

    expect(problems).toEqual([]);
  });

  test("reduced motion removes hover transforms from state controls", async ({
    page,
  }) => {
    const problems = collectBrowserProblems(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFreshWorkspace(page);
    await clickWorkspaceButton(page, /^Мои подачи$/);
    await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();

    const tab = page.getByRole("tab", { name: /В работе/ });
    await tab.hover();
    await expect
      .poll(() =>
        tab.evaluate((element) => {
          const view = (
            element as unknown as {
              ownerDocument: {
                defaultView: {
                  getComputedStyle(target: unknown): { transform: string };
                } | null;
              };
            }
          ).ownerDocument.defaultView;

          return view?.getComputedStyle(element).transform ?? "";
        }),
      )
      .toBe("none");

    const tool = page
      .getByLabel("Инструменты подач")
      .getByRole("button", { name: /Сортировка: приоритет/ });
    await tool.hover();
    await expect
      .poll(() =>
        tool.evaluate((element) => {
          const view = (
            element as unknown as {
              ownerDocument: {
                defaultView: {
                  getComputedStyle(target: unknown): { transform: string };
                } | null;
              };
            }
          ).ownerDocument.defaultView;

          return view?.getComputedStyle(element).transform ?? "";
        }),
      )
      .toBe("none");

    expect(problems).toEqual([]);
  });

  test("mobile export queue does not clip enabled row actions", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only proof");
    const problems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });
    await clickWorkspaceButton(page, /^Выгрузка$/);
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();

    const queue = page.locator(".magic-export-queue");
    const row = page.locator(".magic-export-row").filter({ hasText: "Дмитрий Орлов" });
    const action = row.getByRole("button", { name: "Смотреть пакет" });

    await expect(action).toBeVisible();

    const [queueBox, actionBox] = await Promise.all([
      queue.boundingBox(),
      action.boundingBox(),
    ]);

    expect(queueBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
      queueBox!.y + queueBox!.height + 1,
    );

    const overflow = await queue.evaluate((element) => {
      const view = (
        element as unknown as {
          ownerDocument: {
            defaultView: {
              getComputedStyle(target: unknown): {
                overflowX: string;
                overflowY: string;
              };
            } | null;
          };
        }
      ).ownerDocument.defaultView;
      const styles = view?.getComputedStyle(element);

      if (!styles) return "";

      return `${styles.overflowX} ${styles.overflowY}`;
    });

    expect(overflow).not.toContain("hidden");
    expect(problems).toEqual([]);
  });
});
