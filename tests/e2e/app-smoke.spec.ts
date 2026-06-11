import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate("localStorage.clear()");
});

test("renders the login surface", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("VisaFlow AI");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Агент/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Операции/ })).toBeVisible();
});

test("agent completes intake handoff without dead ends", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Агент/ }).click();
  await expect(page.getByRole("heading", { name: "Рабочий стол" })).toBeVisible();

  const pageSurface = page.locator(".page");

  await pageSurface.getByRole("button", { name: "Новая заявка" }).click();
  await expect(page.getByRole("heading", { name: "Новая заявка" })).toBeVisible();

  await pageSurface.getByRole("button", { name: "Создать черновик" }).first().click();
  await expect(page.getByRole("alert")).toContainText("Заполните обязательные поля");

  await page.getByLabel("ФИО").fill("Ivan Petrov");
  await page.getByLabel("Номер паспорта").fill("75 1234567");
  await page.getByLabel("Дата рождения").fill("1990-02-10");
  await page.getByLabel("Телефон").fill("+7 900 123 45 67");
  await page.getByLabel("Email").fill("ivan.petrov@example.com");
  await page.getByLabel("Адрес", { exact: true }).fill("Moscow, Lenina 10");
  await page.getByLabel("Отель").fill("Madrid Central Hotel");
  await page.getByLabel("Адрес отеля").fill("Gran Via 21, Madrid");
  await pageSurface.getByRole("button", { name: "Создать черновик" }).first().click();

  await expect(page.locator("h1")).toHaveText("Ivan Petrov");
  await expect(page.getByText("Intake cockpit")).toBeVisible();

  await page.getByLabel("Дата выдачи паспорта").fill("2021-03-12");
  await page.getByLabel("Срок действия паспорта").fill("2031-03-12");

  const uploadButtons = page.getByRole("button", { name: "Отметить загруженным" });
  while ((await uploadButtons.count()) > 0) {
    await uploadButtons.first().click();
  }

  await expect(page.getByText("Можно передать оператору")).toBeVisible();
  await page.getByRole("button", { name: "Проверить готовность" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Проверка перед передачей" }),
  ).toBeVisible();
  await expect(page.getByLabel("Чеклист передачи оператору")).toContainText(
    "Нет блокеров",
  );
  await page.getByRole("button", { name: "Передать оператору" }).click();

  await expect(page.getByLabel("Состояние завершения intake")).toContainText(
    "Передано оператору",
  );
  await expect(page.getByText("Ожидайте решения оператора")).toBeVisible();
  await expect(page.getByText("Заполнение закрыто")).toHaveCount(0);
  await expect(page.getByText("На проверке")).toBeVisible();
});
