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
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow, noarchive, nosnippet",
  );

  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute("type", "image/svg+xml");
  await expect(icon).toHaveAttribute("href", "/v19-app-icon.svg");

  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href", "/manifest.webmanifest");

  const iconResponse = await page.request.get("/v19-app-icon.svg");
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");
  expect(await iconResponse.text()).toContain('aria-label="VisaFlow V-19"');

  const robotsResponse = await page.request.get("/robots.txt");
  expect(robotsResponse.status()).toBe(200);
  expect(await robotsResponse.text()).toBe("User-agent: *\nDisallow: /\n");

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  expect(await manifestResponse.json()).toMatchObject({
    background_color: "#101011",
    display: "standalone",
    icons: [
      {
        purpose: "any maskable",
        sizes: "any",
        src: "/v19-app-icon.svg",
        type: "image/svg+xml",
      },
    ],
    id: "/",
    lang: "ru",
    name: "VisaFlow V-19",
    scope: "/",
    short_name: "V-19",
    start_url: "/",
    theme_color: "#101011",
  });
});
