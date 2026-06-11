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
  await expect(page.getByLabel("Case Workspace")).toContainText(
    "До передачи оператору",
  );
  await expect(page.getByLabel("Applicant Tasks")).toContainText("Ivan Petrov: задачи");
  await expect(page.getByLabel("Applicant Tasks")).toContainText(
    "Заполнить обязательные поля",
  );

  await page.getByLabel("Дата выдачи паспорта").fill("2021-03-12");
  await page.getByLabel("Срок действия паспорта").fill("2031-03-12");

  for (const task of [
    "Загрузить: Фото на белом фоне",
    "Загрузить: Селфи",
    "Загрузить: Видео",
  ]) {
    await page.getByRole("button", { name: new RegExp(task) }).click();
    await page.getByRole("button", { name: "Отметить загруженным" }).click();
  }

  await expect(page.getByLabel("Readiness Review")).toContainText(
    "Готовность является результатом закрытых задач",
  );
  await page.getByRole("button", { name: "Проверить готовность" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Проверка перед передачей" }),
  ).toBeVisible();
  await expect(page.getByLabel("Чеклист передачи оператору")).toContainText(
    "Нет блокеров",
  );
  await page
    .getByRole("dialog", { name: "Проверка перед передачей" })
    .getByRole("button", { name: "Передать оператору" })
    .click();

  await expect(page.getByText("Передано оператору")).toBeVisible();
  await expect(page.getByText("Заполнение закрыто")).toHaveCount(0);
});

test("agent create form keeps focus and scroll position while typing", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Агент/ }).click();
  await page.locator(".page").getByRole("button", { name: "Новая заявка" }).click();
  await expect(page.getByRole("heading", { name: "Новая заявка" })).toBeVisible();

  const hotelField = page.getByLabel("Отель");
  await hotelField.scrollIntoViewIfNeeded();
  await hotelField.click();
  const scrollBeforeTyping = await page.evaluate<number>("window.scrollY");

  await page.keyboard.type("Madrid Central Hotel", { delay: 5 });

  await expect(hotelField).toBeFocused();
  await expect(hotelField).toHaveValue("Madrid Central Hotel");
  const scrollAfterTyping = await page.evaluate<number>("window.scrollY");
  expect(Math.abs(scrollAfterTyping - scrollBeforeTyping)).toBeLessThan(24);

  await page.getByLabel("ФИО").fill("Focus Petrov");
  await page.getByLabel("Номер паспорта").fill("75 5556677");
  await page.getByLabel("Дата рождения").fill("1992-04-11");
  await page.getByLabel("Телефон").fill("+7 900 555 66 77");
  await page.getByLabel("Email").fill("focus.petrov@example.com");
  await page.getByLabel("Адрес", { exact: true }).fill("Moscow, Focus 7");
  await page.getByLabel("Адрес отеля").fill("Gran Via 77, Madrid");

  await page
    .locator(".page")
    .getByRole("button", { name: "Создать черновик" })
    .first()
    .click();

  await expect(page.locator("h1")).toHaveText("Focus Petrov");
  await expect(page.getByLabel("Case Workspace")).toContainText(
    "До передачи оператору",
  );
});
