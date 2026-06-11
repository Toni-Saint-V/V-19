import { expect, test } from "@playwright/test";

test("renders the login surface", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("VisaFlow AI");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Агент/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Операции/ })).toBeVisible();
});
