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
    page.getByRole("heading", { level: 1, name: options.heading ?? "Мои действия" }),
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

async function expectDrawerFitsViewport(
  page: Page,
  context: string,
  closeButtonName = "Закрыть подачу",
) {
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: closeButtonName }).first(),
  ).toBeVisible();

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

async function clickOperationalNav(page: Page, name: RegExp) {
  const buttons = page.getByRole("button", { name });
  const buttonCount = await buttons.count();

  for (let index = 0; index < buttonCount; index += 1) {
    const candidate = buttons.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }

  await page.getByRole("button", { name: "Меню" }).click();
  await page.getByRole("button", { name }).first().click();
}

async function expectSettingsReady(page: Page) {
  await expect(page.getByRole("heading", { level: 2, name: "Уведомления" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Возврат подачи" })).toBeVisible();
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
      await expect(page.getByRole("button", { name: "Выгрузка" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Проверка/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Мои действия" })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "Мои действия" }),
      ).toBeVisible();
      await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
      await expectAgentNoDocumentScroll(page, `${viewport.label}: agent actions`);
      await screenshot(page, viewport, "agent-inbox-actions");

      await clickOperationalNav(page, /^Мои подачи/);
      await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Новая подача" }).first()).toBeVisible();
      await expectAgentNoDocumentScroll(page, `${viewport.label}: agent submissions`);
      await screenshot(page, viewport, "agent-submissions");

      await page.getByRole("button", { name: "Новая подача" }).first().click();
      await expect(page.getByRole("heading", { name: "Новая подача" })).toBeVisible();
      await expectDrawerFitsViewport(
        page,
        `${viewport.label}: create submission drawer`,
        "Закрыть создание",
      );
      await expectNoHorizontalDocumentOverflow(
        page,
        `${viewport.label}: create drawer`,
      );
      await screenshot(page, viewport, "create-submission-drawer");
      await page
        .getByRole("dialog")
        .first()
        .getByRole("button", { name: "Закрыть создание" })
        .first()
        .click();

      await page.locator('[data-submission-id="ПД-1048"]').first().press("Enter");
      await expectDrawerFitsViewport(page, `${viewport.label}: submission drawer`);
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: drawer`);
      await screenshot(page, viewport, "submission-drawer");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await clickOperationalNav(page, /^Настройки/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Настройки" }),
      ).toBeVisible();
      await expectSettingsReady(page);
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: agent settings`);
      await screenshot(page, viewport, "agent-settings");

      await openFreshWorkspace(page, {
        heading: "Проверка",
        workspaceEmail: "admin@visaflow.local",
      });
      await expect(page.getByText("Мои подачи", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Новая подача" })).toHaveCount(0);
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: admin review`);
      await screenshot(page, viewport, "admin-review");

      await expect(page.getByRole("button", { name: "Входящие" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Мои действия" })).toHaveCount(0);
      await page.getByRole("tab", { name: /На проверке/ }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toBeVisible();
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: admin review filter`);
      await screenshot(page, viewport, "admin-review-filter");

      await page.getByRole("tab", { name: /Ошибки/ }).click();
      await expect(page.locator(".vf-figma-action-row").first()).toBeVisible();
      await expectNoHorizontalDocumentOverflow(page, `${viewport.label}: admin issues filter`);
      await screenshot(page, viewport, "admin-issues-filter");

      await clickOperationalNav(page, /^Выгрузка/);
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
