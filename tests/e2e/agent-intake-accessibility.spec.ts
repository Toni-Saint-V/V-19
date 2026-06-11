import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function scanCurrentState(page: Page, stateName: string) {
  const results = await new AxeBuilder({ page })
    .include(".main-shell")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(results.violations, `${stateName} accessibility violations`).toEqual([]);
}

async function reachCreateScreen(page: Page) {
  await page.goto("/");
  await page.evaluate("localStorage.clear()");
  await page.reload();
  await page.getByRole("button", { name: /Агент/ }).click();
  await page.locator(".page").getByRole("button", { name: "Новая заявка" }).click();
  await expect(page.getByRole("heading", { name: "Новая заявка" })).toBeVisible();
}

async function fillCreateForm(page: Page) {
  await page.getByLabel("ФИО").fill("A11y Petrov");
  await page.getByLabel("Номер паспорта").fill("75 1112233");
  await page.getByLabel("Дата рождения").fill("1991-05-17");
  await page.getByLabel("Телефон").fill("+7 900 111 22 33");
  await page.getByLabel("Email").fill("a11y.petrov@example.com");
  await page.getByLabel("Адрес", { exact: true }).fill("Moscow, Mira 12");
  await page.getByLabel("Отель").fill("Madrid Access Hotel");
  await page.getByLabel("Адрес отеля").fill("Gran Via 40, Madrid");
}

async function completeHandoff(page: Page) {
  await page.getByLabel("Дата выдачи паспорта").fill("2021-05-17");
  await page.getByLabel("Срок действия паспорта").fill("2031-05-17");

  const uploadButtons = page.getByRole("button", { name: "Отметить загруженным" });
  while ((await uploadButtons.count()) > 0) {
    await uploadButtons.first().click();
  }

  await page.getByRole("button", { name: "Проверить готовность" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Проверка перед передачей" }),
  ).toBeVisible();
  await scanCurrentState(page, "agent intake preflight modal");

  await page.getByRole("button", { name: "Передать оператору" }).click();
  await expect(page.getByLabel("Состояние завершения intake")).toContainText(
    "Передано оператору",
  );
}

test("agent intake flow has no automated accessibility violations", async ({
  page,
}) => {
  await reachCreateScreen(page);
  await scanCurrentState(page, "agent intake create start");

  await page
    .locator(".page")
    .getByRole("button", { name: "Создать черновик" })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("Заполните обязательные поля");
  await scanCurrentState(page, "agent intake validation errors");

  await fillCreateForm(page);
  await page
    .locator(".page")
    .getByRole("button", { name: "Создать черновик" })
    .first()
    .click();
  await expect(page.locator("h1")).toHaveText("A11y Petrov");
  await scanCurrentState(page, "agent intake detail start");

  await completeHandoff(page);
  await scanCurrentState(page, "agent intake completion");
});
