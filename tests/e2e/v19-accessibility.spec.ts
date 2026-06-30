import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

async function expectNoAxeViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    })),
    context,
  ).toEqual([]);
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
    await expectNoAxeViolations(page, "agent inbox");

    await openAgentActionsTab(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои действия" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
    await expectNoAxeViolations(page, "agent actions");

    await page.getByRole("button", { name: "Мои подачи" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, "agent submissions");

    await page.getByRole("button", { name: "Новая подача" }).first().click();
    const createDialog = page.getByRole("dialog").first();
    await expect(createDialog).toBeVisible();
    await expect(
      createDialog.getByRole("button", { name: "Закрыть создание" }).first(),
    ).toBeVisible();
    await expectNoAxeViolations(page, "create submission drawer");
    await createDialog.getByRole("button", { name: "Закрыть создание" }).first().click();
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
    await page.getByRole("button", { name: /^Проверка/ }).click();
    await expect(page.getByRole("heading", { name: "Проверка" })).toBeVisible();

    await page.locator(".submission-card, [data-submission-card], .vf-figma-action-row").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();
    await expectNoAxeViolations(page, "submission drawer");
    await drawer.getByRole("button", { name: /Закрыть (подачу|проверку)/ }).first().click();

    await page.getByRole("button", { name: "Выгрузка" }).click();
    await expect(page.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    await expectNoAxeViolations(page, "admin export");
  });
});
