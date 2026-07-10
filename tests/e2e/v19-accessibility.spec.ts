import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clickWorkspaceButton, openFreshWorkspace } from "./v19-pilot-helpers";

async function expectNoAxeViolations(page: Page, context: string, include?: string) {
  const dialog = page.getByRole("dialog").first();
  if (await dialog.isVisible({ timeout: 250 }).catch(() => false)) {
    await expect
      .poll(
        () =>
          dialog.locator('[style*="opacity"]').evaluateAll((nodes) =>
            (nodes as unknown as Array<{ getAttribute(name: string): string | null }>).every(
              (node) => /opacity:\s*1(?:;|$)/.test(node.getAttribute("style") ?? ""),
            ),
          ),
        { message: `${context}: dialog content finishes entering before accessibility analysis` },
      )
      .toBe(true);
  }

  const axeBuilder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  const results = await (include ? axeBuilder.include(include) : axeBuilder).analyze();

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    })),
    context,
  ).toEqual([]);
}

async function waitForAgentRowsToSettle(page: Page) {
  await expect
    .poll(
      () =>
        page.locator('[data-testid="agent-action-row"]').evaluateAll((rows) =>
          (rows as unknown as Array<{ getAttribute(name: string): string | null }>).every((row) => {
            const inlineStyle = row.getAttribute("style") ?? "";
            return !inlineStyle.includes("opacity") || /opacity:\s*1(?:;|$)/.test(inlineStyle);
          }),
        ),
      { message: "agent action rows finish entering before accessibility analysis" },
    )
    .toBe(true);
}

async function openAgentActionsTab(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
}

test.describe("V-19 accessibility contract", () => {
  test("agent primary surfaces have no automated WCAG A/AA violations", async ({
    page,
  }) => {
    await openFreshWorkspace(page);
    await expect(page.getByRole("button", { name: "Входящие" })).toHaveCount(0);
    await waitForAgentRowsToSettle(page);
    await expectNoAxeViolations(page, "agent actions");

    await openAgentActionsTab(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои действия" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
    await waitForAgentRowsToSettle(page);
    await expectNoAxeViolations(page, "agent actions");

    await clickWorkspaceButton(page, /^Мои подачи$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, "agent submissions");

    await page.getByRole("button", { name: "Новая подача" }).first().click();
    const createDialog = page.getByRole("dialog").first();
    await expect(createDialog).toBeVisible();
    await expect(
      createDialog.getByRole("heading", { name: "Новая подача" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, "create submission drawer", '[role="dialog"]');
    const closeCreateButton = createDialog
      .getByRole("button", { name: "Закрыть создание" })
      .first();
    if (await closeCreateButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await closeCreateButton.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("admin primary surfaces, export, and submission drawer have no automated WCAG A/AA violations", async ({
    page,
  }) => {
    await openFreshWorkspace(page, {
      heading: "Проверка",
      workspaceEmail: "admin@visaflow.local",
    });
    await expectNoAxeViolations(page, "admin review");

    await expect(page.getByRole("button", { name: "Входящие" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Мои действия" })).toHaveCount(0);
    await clickWorkspaceButton(page, /^Проверка$/);
    await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();

    await page
      .getByRole("button", { name: /Ручная проверка заявки|Проверить/ })
      .first()
      .click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();
    await expectNoAxeViolations(page, "submission drawer");
    await drawer.getByRole("button", { name: /Закрыть (подачу|проверку)/ }).first().click();

    await clickWorkspaceButton(page, /^Выгрузка$/);
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    await expectNoAxeViolations(page, "admin export");
  });
});
