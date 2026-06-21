import { expect, test, type Page } from "@playwright/test";

type ViewportProof = {
  height: number;
  label: string;
  width: number;
};

const responsiveViewports: ViewportProof[] = [
  { height: 900, label: "1440", width: 1440 },
  { height: 768, label: "1024", width: 1024 },
  { height: 1024, label: "768", width: 768 },
  { height: 844, label: "390", width: 390 },
];

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

async function expectNoHorizontalDocumentOverflow(page: Page, context: string) {
  const metrics = await page.evaluate(() => {
    const browserDocument = (
      globalThis as unknown as {
        document: { documentElement: { clientWidth: number; scrollWidth: number } };
      }
    ).document;
    const root = browserDocument.documentElement;

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });

  expect(metrics.scrollWidth, context).toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );
}

async function expectAgentNoDocumentScroll(page: Page, context: string) {
  const metrics = await page.evaluate(() => {
    const browserDocument = (
      globalThis as unknown as {
        document: {
          documentElement: {
            clientHeight: number;
            clientWidth: number;
            scrollHeight: number;
            scrollWidth: number;
          };
          scrollingElement?: {
            clientHeight: number;
            scrollHeight: number;
          } | null;
        };
      }
    ).document;
    const scrolling =
      browserDocument.scrollingElement ?? browserDocument.documentElement;

    return {
      clientHeight: scrolling.clientHeight,
      clientWidth: browserDocument.documentElement.clientWidth,
      scrollHeight: scrolling.scrollHeight,
      scrollWidth: browserDocument.documentElement.scrollWidth,
    };
  });

  expect(metrics.scrollWidth, `${context}: horizontal document overflow`).toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );
  expect(metrics.scrollHeight, `${context}: vertical document scroll`).toBeLessThanOrEqual(
    metrics.clientHeight + 1,
  );
}

async function expectDrawerFitsViewport(page: Page, context: string) {
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Закрыть подачу" })).toBeVisible();

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();

  expect(box, `${context}: drawer box`).not.toBeNull();
  expect(viewport, `${context}: viewport`).not.toBeNull();
  expect(box!.x, `${context}: drawer left`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${context}: drawer top`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${context}: drawer right`).toBeLessThanOrEqual(
    viewport!.width + 1,
  );
  expect(box!.y + box!.height, `${context}: drawer bottom`).toBeLessThanOrEqual(
    viewport!.height + 1,
  );
}

async function screenshot(page: Page, viewport: ViewportProof, name: string) {
  await page.screenshot({
    fullPage: true,
    path: `docs/qa/2026-06-21-v19-responsive-${viewport.label}-${name}.png`,
  });
}

test.describe("V-19 responsive proof", () => {
  test("primary workflows satisfy the responsive contract at locked viewports", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "single-project viewport proof");

    const problems = collectBrowserProblems(page);

    for (const viewport of responsiveViewports) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });

      await openFreshWorkspace(page);
      await expectAgentNoDocumentScroll(page, `${viewport.label}: agent inbox`);
      await screenshot(page, viewport, "agent-inbox");

      await page.getByRole("button", { name: "Мои подачи" }).click();
      await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Новая подача" }).first()).toBeVisible();
      await expectAgentNoDocumentScroll(page, `${viewport.label}: agent submissions`);
      await screenshot(page, viewport, "agent-submissions");

      await page.locator('[data-submission-id="ПД-1048"]').first().click();
      await expectDrawerFitsViewport(page, `${viewport.label}: submission drawer`);
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: drawer`);
      await screenshot(page, viewport, "submission-drawer");
      await page.getByRole("button", { name: "Закрыть подачу" }).click();

      await openFreshWorkspace(page, {
        heading: "Проверка",
        workspaceEmail: "admin@visaflow.local",
      });
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: admin review`);
      await screenshot(page, viewport, "admin-review");

      await page.getByRole("button", { name: "Выгрузка" }).click();
      await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: export`);
      const generateButton = page.getByRole("button", { name: "Сформировать Эксель" });
      await generateButton.scrollIntoViewIfNeeded();
      await expect(generateButton).toBeVisible();
      await screenshot(page, viewport, "export");
    }

    expect(problems).toEqual([]);
  });
});
