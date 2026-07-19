import { expect, test } from "@playwright/test";

test("production shell exposes the V-19 browser identity", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("VisaFlow V-19");
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    "content",
    "VisaFlow V-19",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#101011",
  );

  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute("type", "image/svg+xml");
  await expect(icon).toHaveAttribute("href", "/v19-app-icon.svg");

  const iconResponse = await page.request.get("/v19-app-icon.svg");
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");
  expect(await iconResponse.text()).toContain('aria-label="VisaFlow V-19"');
});
