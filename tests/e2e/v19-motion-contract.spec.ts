import { expect, test, type Page } from "@playwright/test";

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
    page.getByRole("heading", { level: 1, name: options.heading ?? "Входящие" }),
  ).toBeVisible();
}

test.describe("V-19 motion contract", () => {
  test("state transitions stay scoped and clean up after toolbar changes", async ({
    page,
  }) => {
    const problems = collectBrowserProblems(page);

    await openFreshWorkspace(page);
    await page.getByRole("button", { name: "Мои подачи" }).click();
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
                document: { documentElement: { classList: { contains(name: string): boolean } } };
              }
            ).document;

            return browserDocument.documentElement.classList.contains(
              "vf-vt",
            );
          }),
        )
        .toBe(false);
    }

    await page.getByRole("button", { name: /Скрыть сводку|Показать сводку/ }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const browserDocument = (
            globalThis as unknown as {
              document: { documentElement: { classList: { contains(name: string): boolean } } };
            }
          ).document;

          return browserDocument.documentElement.classList.contains(
            "vf-vt",
          );
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
    await page.getByRole("button", { name: "Мои подачи" }).click();
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

    const tool = page.getByRole("button", {
      name: /Фильтр: только блокеры|Фильтр: все подачи/,
    });
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
      heading: "Работа",
      workspaceEmail: "admin@visaflow.local",
    });
    await page.getByRole("button", { name: "Выгрузка" }).click();
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
              getComputedStyle(target: unknown): { overflowX: string; overflowY: string };
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
