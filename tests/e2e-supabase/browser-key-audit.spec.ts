import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const smokeEnvPath = resolve(process.cwd(), ".env.supabase-smoke.local");
const allowedSmokeProjectId = "oevvaowoklqttqkraxho";
const forbiddenBundleMarkers = [
  "SUPABASE_SMOKE_AGENT_EMAIL",
  "SUPABASE_SMOKE_AGENT_PASSWORD",
  "SUPABASE_SMOKE_OTHER_AGENT_EMAIL",
  "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD",
  "SUPABASE_SMOKE_ADMIN_EMAIL",
  "SUPABASE_SMOKE_ADMIN_PASSWORD",
  "SUPABASE_SERVICE_ROLE",
  "SERVICE_ROLE",
  "SUPABASE_FUNCTION_ADMIN_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MODEL_PROVIDER_API_KEY",
];

function loadSmokeEnv(): Record<string, string> {
  if (!existsSync(smokeEnvPath)) return {};

  const env: Record<string, string> = {};
  for (const line of readFileSync(smokeEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return env;
}

function requiredSmokeValue(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Supabase browser key audit.`);
  return value;
}

test("exposes only browser-safe Supabase sandbox values", async ({ page }) => {
  const smokeEnv = loadSmokeEnv();
  const projectId = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_PROJECT_ID");
  const supabaseUrl = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_URL");
  const publishableKey = requiredSmokeValue(smokeEnv, "VITE_SUPABASE_PUBLISHABLE_KEY");

  expect(projectId).toBe(allowedSmokeProjectId);
  expect(supabaseUrl).toBe(`https://${allowedSmokeProjectId}.supabase.co`);
  expect(publishableKey).toMatch(/^sb_publishable_/);

  const scriptBodyReads: Promise<{ body: string; url: string }>[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.resourceType() !== "script") return;
    if (!response.url().startsWith("http://127.0.0.1:4198/")) return;

    scriptBodyReads.push(
      response.text().then((body) => ({
        body,
        url: response.url(),
      })),
    );
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("main", { name: "Рабочая область подач" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Мои подачи" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Новая подача" })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: "docs/qa/supabase-browser-key-audit-desktop.png",
  });

  const scriptBodies = await Promise.all(scriptBodyReads);
  expect(scriptBodies.length).toBeGreaterThan(0);

  const browserBundle = scriptBodies.map(({ body }) => body).join("\n");
  expect(browserBundle).toContain(allowedSmokeProjectId);
  expect(browserBundle).toContain(supabaseUrl);
  expect(browserBundle).toContain(publishableKey);

  for (const marker of forbiddenBundleMarkers) {
    expect(browserBundle).not.toContain(marker);
  }

  for (const [name, value] of Object.entries(smokeEnv)) {
    if (name.startsWith("VITE_")) continue;
    if (!value.trim()) continue;
    expect(browserBundle).not.toContain(value);
  }
});
