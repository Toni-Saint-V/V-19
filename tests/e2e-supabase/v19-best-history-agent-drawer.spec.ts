import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const evidenceDirectory = "docs/qa/2026-07-17-agent-drawer-pass-01";
const phase =
  process.env.AGENT_DRAWER_EVIDENCE_PHASE === "target" ? "target" : "baseline";
const smokeEnvPath = resolve(process.cwd(), ".env.supabase-smoke.local");

const viewports = [
  { height: 740, label: "320x740", width: 320 },
  { height: 844, label: "390x844", width: 390 },
  { height: 932, label: "430x932", width: 430 },
  { height: 1024, label: "768x1024", width: 768 },
  { height: 900, label: "1440x900", width: 1440 },
] as const;
const proofViewports =
  phase === "target"
    ? viewports
    : viewports.filter((viewport) => viewport.width === 390 || viewport.width === 1440);

function loadSmokeEnv(): Record<string, string> {
  if (!existsSync(smokeEnvPath)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(smokeEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    values[trimmed.slice(0, separatorIndex).trim()] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function requiredSmokeValue(values: Record<string, string>, name: string): string {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} is required for Agent Drawer browser proof.`);
  return value;
}

async function signInSmokeAgent(page: Page) {
  const smokeEnv = loadSmokeEnv();
  await page.goto("/", { waitUntil: "networkidle" });
  const workspace = page.getByRole("main", { name: "Рабочая область подач" });
  if (await workspace.isVisible().catch(() => false)) return;

  const password = page.getByRole("textbox", { name: "Пароль" });
  if (!(await password.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();
  }
  await page
    .getByLabel("Email")
    .fill(requiredSmokeValue(smokeEnv, "SUPABASE_SMOKE_AGENT_EMAIL"));
  await password.fill(requiredSmokeValue(smokeEnv, "SUPABASE_SMOKE_AGENT_PASSWORD"));
  const loginButton = page.getByRole("button", { name: "Войти" });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await workspace.isVisible().catch(() => false)) return;
    if (await loginButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await loginButton.click();
    }
    if (await workspace.isVisible({ timeout: 15_000 }).catch(() => false)) return;
    await page.waitForTimeout(attempt * 1_000);
  }
  await expect(workspace).toBeVisible({ timeout: 5_000 });
}

async function openSubmissions(page: Page) {
  const heading = page.getByRole("heading", { level: 1, name: "Мои подачи" });
  if (await heading.isVisible().catch(() => false)) return;
  const submissionsButton = page.getByRole("button", { name: /Мои подачи/ }).first();
  if (!(await submissionsButton.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Меню" }).click();
    await expect(submissionsButton).toBeVisible();
  }
  await submissionsButton.click();
  await expect(heading).toBeVisible({ timeout: 20_000 });
}

async function openAgentDrawer(page: Page) {
  await openSubmissions(page);
  const returnedCard = page
    .locator("[data-submission-id]")
    .filter({ hasText: /возвращ|ошиб|доработ/i })
    .first();
  const fallbackCard = page.locator("[data-submission-id]").first();
  const card = (await returnedCard.isVisible().catch(() => false))
    ? returnedCard
    : fallbackCard;
  await expect(card).toBeVisible({ timeout: 20_000 });
  const submissionId = await card.getAttribute("data-submission-id");
  await card.click();

  const drawer = page.locator(".v20-submission-drawer[role='dialog']");
  await expect(drawer).toBeVisible({ timeout: 20_000 });
  await expect(drawer.locator(".v20-skeleton-screen")).toHaveCount(0, {
    timeout: 5_000,
  });
  return { drawer, submissionId };
}

async function settle(locator: Locator) {
  await locator.evaluate(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  });
}

async function assertDrawerGeometry(page: Page, drawer: Locator) {
  await settle(drawer);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

  const drawerBox = await drawer.boundingBox();
  expect(drawerBox).not.toBeNull();
  if (!drawerBox) return;
  if (phase !== "target") return;
  expect(drawerBox.x).toBeGreaterThanOrEqual(-2);
  expect(drawerBox.y).toBeGreaterThanOrEqual(-2);
  expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(viewport.width + 2);
  expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(viewport.height + 2);

  const selectedTab = drawer.locator('[role="tab"][aria-selected="true"]');
  await expect(selectedTab).toHaveCount(1);
  const selectedBox = await selectedTab.boundingBox();
  expect(selectedBox).not.toBeNull();
  if (selectedBox) {
    expect(selectedBox.x).toBeGreaterThanOrEqual(-1);
    expect(selectedBox.x + selectedBox.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  if (viewport.width <= 768) {
    const headerBox = await drawer.locator(".v20-drawer-topbar").boundingBox();
    expect(headerBox).not.toBeNull();
    if (headerBox) expect(headerBox.height / viewport.height).toBeLessThanOrEqual(0.15);

    const firstCard = drawer.locator(".v20-card, .v20-applicant-card").first();
    if (await firstCard.isVisible().catch(() => false)) {
      const cardBox = await firstCard.boundingBox();
      expect(cardBox).not.toBeNull();
      if (cardBox) expect(cardBox.x).toBeGreaterThanOrEqual(16);
    }
  }
}

function normalizedPrimaryTabs(drawer: Locator) {
  return drawer
    .locator(".v20-tabbar [role='tab']")
    .allTextContents()
    .then((values) => values.map((value) => value.replace(/\s+\d+$/, "").trim()));
}

async function selectDrawerSection(drawer: Locator, name: RegExp) {
  const visibleTab = drawer.getByRole("tab", { name }).first();
  if (await visibleTab.isVisible().catch(() => false)) {
    await visibleTab.click();
    return;
  }

  const more = drawer.getByRole("button", { name: /^Ещё/ }).first();
  await expect(more).toBeVisible();
  await more.click();
  const menuItem = drawer.getByRole("menuitem", { name }).first();
  await expect(menuItem).toBeVisible();
  await menuItem.click();
}

test("opens the workspace with a smoke agent and proves the Agent Drawer", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const browserProblems: string[] = [];
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserProblems.push(`console: ${message.text()}`);
  });

  await signInSmokeAgent(page);

  for (const viewport of proofViewports) {
    await page.setViewportSize(viewport);
    const { drawer, submissionId } = await openAgentDrawer(page);
    expect(submissionId).toBeTruthy();
    await assertDrawerGeometry(page, drawer);

    if (phase === "target") {
      expect(await normalizedPrimaryTabs(drawer)).toEqual([
        "Обзор",
        "Анкета",
        "Замечания",
        "История",
      ]);
      await expect(drawer.locator(".v20-tab-indicator")).toHaveCount(1);
    }

    await page.screenshot({
      animations: "disabled",
      path: `${evidenceDirectory}/${phase}-${viewport.label}-overview.png`,
    });

    if (viewport.width === 390 || viewport.width === 1440) {
      await drawer.getByRole("tab", { name: /^Анкета/ }).click();
      await expect(
        drawer.getByText("Прогресс заполнения", { exact: true }),
      ).toBeVisible();
      if (phase === "target") {
        await expect(drawer.locator(".v20-questionnaire-preview-grid")).toBeVisible();
      }
      await page.screenshot({
        animations: "disabled",
        path: `${evidenceDirectory}/${phase}-${viewport.label}-questionnaire.png`,
      });

      await selectDrawerSection(drawer, /^Замечания/);
      await expect(
        drawer.getByText(/Порядок работы|Список задач по замечаниям/).first(),
      ).toBeVisible();
      if (phase === "target") {
        await expect(
          drawer.getByRole("heading", { name: "Список задач по замечаниям" }),
        ).toBeVisible();
      }
      await page.screenshot({
        animations: "disabled",
        path: `${evidenceDirectory}/${phase}-${viewport.label}-issues.png`,
      });

      await drawer.getByRole("tab", { name: /^История/ }).click();
      await expect(
        drawer.getByRole("region", { name: "История подачи" }),
      ).toBeVisible();
      await page.screenshot({
        animations: "disabled",
        path: `${evidenceDirectory}/${phase}-${viewport.label}-history.png`,
      });
    }

    if (viewport.width === 1440) {
      await drawer.getByRole("tab", { name: /^Анкета/ }).click();
      await drawer.getByRole("button", { name: "Открыть анкету" }).click();
      await expect(page.locator(".vf-figma-questionnaire-screen")).toBeVisible();
      await page.getByRole("button", { name: "Назад" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Мои подачи" }),
      ).toBeVisible();
    } else {
      const closeButton = drawer.locator(".v20-icon-button.is-close");
      if (phase === "target") {
        await expect(closeButton).toBeVisible();
        await closeButton.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(drawer).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  }

  const blockingProblems = browserProblems.filter(
    (problem) => !/favicon|ResizeObserver loop|net::ERR_ABORTED/i.test(problem),
  );
  expect(blockingProblems, blockingProblems.join("\n")).toEqual([]);
});
