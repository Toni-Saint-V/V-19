import { expect, test } from "@playwright/test";

function expectPngDimensions(bytes: Buffer, size: number) {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(size);
  expect(bytes.readUInt32BE(20)).toBe(size);
}

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

  const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(appleTouchIcon).toHaveAttribute("href", "/v19-apple-touch-icon-v1.png");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    "content",
    "VisaFlow",
  );

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
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    icons: [
      {
        purpose: "any",
        sizes: "192x192",
        src: "/v19-app-icon-192-v1.png",
        type: "image/png",
      },
      {
        purpose: "any",
        sizes: "512x512",
        src: "/v19-app-icon-512-v1.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "192x192",
        src: "/v19-app-icon-maskable-192-v1.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/v19-app-icon-maskable-512-v1.png",
        type: "image/png",
      },
      {
        purpose: "any",
        sizes: "any",
        src: "/v19-app-icon.svg",
        type: "image/svg+xml",
      },
    ],
    id: "/",
    lang: "ru",
    name: "VisaFlow",
    scope: "/",
    short_name: "VisaFlow",
    start_url: "/",
    theme_color: "#101011",
  });

  for (const [assetPath, size] of [
    ["/v19-apple-touch-icon-v1.png", 180],
    ["/v19-app-icon-192-v1.png", 192],
    ["/v19-app-icon-512-v1.png", 512],
    ["/v19-app-icon-maskable-192-v1.png", 192],
    ["/v19-app-icon-maskable-512-v1.png", 512],
  ] as const) {
    const response = await page.request.get(assetPath);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expectPngDimensions(await response.body(), size);
  }

  const serviceWorkerResponse = await page.request.get("/service-worker.js");
  expect(serviceWorkerResponse.status()).toBe(200);
  expect(serviceWorkerResponse.headers()["content-type"]).toContain("javascript");
  const serviceWorkerSource = await serviceWorkerResponse.text();
  expect(serviceWorkerSource).toContain('const CACHE_PREFIX = "visaflow-app-shell-"');
  expect(serviceWorkerSource).toContain('url.hostname.endsWith(".supabase.co")');
  expect(serviceWorkerSource).toContain('"/api"');
  expect(serviceWorkerSource).toContain('"/documents"');
  expect(serviceWorkerSource).toContain("caches.open(CACHE_NAME)");
  expect(serviceWorkerSource).toContain('{ cache: "reload" }');
  expect(serviceWorkerSource).not.toContain("self.skipWaiting");
});
