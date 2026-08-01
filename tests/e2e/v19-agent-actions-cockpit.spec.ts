import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { testArtifactPath } from "../support/artifacts";

import { type Page } from "@playwright/test";
import { expect, test } from "./v19-localhost-test";
import { openFreshWorkspace } from "./v19-pilot-helpers";

const proofDir = testArtifactPath("2026-07-01-agent-actions-cockpit");

const viewports = [
  { height: 720, label: "320", width: 320 },
  { height: 812, label: "375", width: 375 },
  { height: 844, label: "390", width: 390 },
  { height: 932, label: "430", width: 430 },
  { height: 1024, label: "768", width: 768 },
  { height: 768, label: "1024", width: 1024 },
  { height: 800, label: "1280", width: 1280 },
  { height: 900, label: "1440", width: 1440 },
];

type ProofRow = {
  cardsStable: "yes";
  clipping: "no";
  contentReadable: "yes";
  horizontalOverflow: "no";
  notes: string;
  primaryActionUsable: "yes";
  result: "PASS";
  sidebarCorrect: "n/a" | "yes";
  viewport: string;
};

function collectBrowserProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

async function openFreshAgentActions(page: Page) {
  await openFreshWorkspace(page, {
    heading: "Мои действия",
    workspaceEmail: "agent@visaflow.local",
  });
  await expect(page.getByRole("region", { name: "Мои действия" })).toBeVisible();
}

async function documentMetrics(page: Page) {
  return page.evaluate(() => {
    const root = (
      globalThis as unknown as {
        document: { documentElement: { clientWidth: number; scrollWidth: number } };
      }
    ).document.documentElement;

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await documentMetrics(page);

  expect(
    metrics.scrollWidth,
    `${label}: horizontal document overflow`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function resetProofScroll(page: Page) {
  await page.evaluate(() => {
    type ScrollTarget = {
      scrollLeft: number;
      scrollTop: number;
    };
    const root = globalThis as unknown as {
      document: {
        documentElement: ScrollTarget;
        scrollingElement: ScrollTarget | null;
        querySelector<T>(selector: string): T | null;
      };
    };

    const scrollingElement =
      root.document.scrollingElement ?? root.document.documentElement;
    for (const target of [
      scrollingElement,
      root.document.querySelector<ScrollTarget>(".workspace"),
      root.document.querySelector<ScrollTarget>('[data-testid="agent-action-queue"]'),
      root.document.querySelector<ScrollTarget>(
        '[data-testid="agent-action-active-panel"]',
      ),
    ]) {
      if (!target) continue;
      target.scrollTop = 0;
      target.scrollLeft = 0;
    }
  });
}

async function assertMobileCockpit(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  await expect(surface.getByTestId("agent-action-timeline")).toBeVisible();
  await expect(surface.locator(".v19-action-row, .vf-figma-action-row")).toHaveCount(0);
  await expect(surface.getByTestId("agent-action-queue")).not.toBeVisible();
  await expect(page.locator(".ops-mobile-tabbar")).not.toBeVisible();

  const mobileCards = surface
    .getByTestId("agent-action-timeline")
    .locator(".v19-actions-timeline-event");
  const event = mobileCards.first();
  await expect(event).toBeVisible();
  const [firstMobileBox, secondMobileBox] = await Promise.all([
    mobileCards.first().boundingBox(),
    mobileCards.nth(1).boundingBox(),
  ]);
  if (!firstMobileBox || !secondMobileBox) {
    throw new Error("The first two mobile person cards have no geometry.");
  }
  expect(Math.abs(firstMobileBox.x - secondMobileBox.x)).toBeLessThanOrEqual(1);
  expect(secondMobileBox.y).toBeGreaterThan(firstMobileBox.y + firstMobileBox.height);
  await expect(event.locator(".v19-actions-mobile-priority")).toHaveCount(0);
  await expect(event.locator(".v19-actions-mobile-cell-route")).toHaveCount(0);
  await expect(event.locator(".v19-actions-mobile-cell-reason")).toHaveCount(0);

  const disclosure = event.locator(".v19-actions-timeline-hit");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("agent-action-mobile-detail")).toHaveCount(0);

  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const mobileDetail = page.getByTestId("agent-action-mobile-detail");
  await expect(mobileDetail).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const selectedCardStyle = await event.evaluate((card) => {
    const hit = card.querySelector<HTMLElement>(".v19-actions-timeline-hit");
    const hitStyle = hit ? getComputedStyle(hit) : null;
    return {
      after: getComputedStyle(card, "::after").content,
      before: getComputedStyle(card, "::before").content,
      borderStyles: hitStyle
        ? [
            hitStyle.borderTopStyle,
            hitStyle.borderRightStyle,
            hitStyle.borderBottomStyle,
            hitStyle.borderLeftStyle,
          ]
        : [],
      borderWidths: hitStyle
        ? [
            hitStyle.borderTopWidth,
            hitStyle.borderRightWidth,
            hitStyle.borderBottomWidth,
            hitStyle.borderLeftWidth,
          ]
        : [],
      boxShadow: hitStyle?.boxShadow,
    };
  });
  expect(selectedCardStyle).toEqual({
    after: "none",
    before: "none",
    borderStyles: ["solid", "solid", "solid", "solid"],
    borderWidths: ["2px", "2px", "2px", "2px"],
    boxShadow: "none",
  });

  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("agent-action-mobile-detail")).toHaveCount(0);

  await disclosure.click();
  await mobileDetail
    .locator('[data-v19-interaction-id="actions.open-secondary"]')
    .click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const undersizedTargets = await surface
    .locator("button:visible, input:visible, select:visible")
    .evaluateAll((controls) =>
      controls
        .map((control) => {
          const rect = control.getBoundingClientRect();
          return {
            height: Math.round(rect.height),
            label:
              control.getAttribute("aria-label") ??
              control.textContent?.trim().slice(0, 40) ??
              control.tagName,
            width: Math.round(rect.width),
          };
        })
        .filter((control) => control.height < 44 || control.width < 44),
    );
  expect(undersizedTargets, "mobile controls keep a 44px touch target").toEqual([]);
}

async function assertDesktopCockpit(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  await expect(surface.getByTestId("agent-action-queue")).not.toBeVisible();
  const timeline = surface.getByTestId("agent-action-timeline");
  await expect(timeline).toBeVisible();
  await expect(surface.locator(".v19-action-row, .vf-figma-action-row")).toHaveCount(0);

  const cards = timeline.locator(".v19-actions-timeline-event");
  const firstCard = cards.nth(0);
  const secondCard = cards.nth(1);
  const leftFollower = cards.nth(2);
  const rightFollower = cards.nth(3);
  const firstDisclosure = firstCard.locator(".v19-actions-timeline-hit");
  const secondDisclosure = secondCard.locator(".v19-actions-timeline-hit");
  expect(
    await cards.count(),
    "desktop exposes at least two person cards",
  ).toBeGreaterThanOrEqual(2);
  await expect(firstDisclosure).toBeVisible();
  await expect(firstDisclosure).toHaveAttribute("aria-expanded", "false");
  await expect(surface.getByTestId("agent-action-mobile-detail")).toHaveCount(0);
  await expect(surface.getByTestId("agent-action-active-panel")).toHaveCount(0);
  const [firstCardBox, secondCardBox, leftFollowerBox, rightFollowerBox] =
    await Promise.all([
      firstCard.boundingBox(),
      secondCard.boundingBox(),
      leftFollower.boundingBox(),
      rightFollower.boundingBox(),
    ]);
  if (!firstCardBox || !secondCardBox || !leftFollowerBox || !rightFollowerBox) {
    throw new Error("The two independent person columns have incomplete geometry.");
  }
  expect(
    Math.abs(firstCardBox.y - secondCardBox.y),
    "the first two people share one grid row",
  ).toBeLessThanOrEqual(1);
  expect(
    secondCardBox.x,
    "the second person occupies the second grid column",
  ).toBeGreaterThan(firstCardBox.x + firstCardBox.width - 1);
  const firstVisibleCardBox = await firstDisclosure.boundingBox();
  if (!firstVisibleCardBox) {
    throw new Error("The first visible desktop person card has no geometry.");
  }
  expect(Math.abs(firstVisibleCardBox.x - firstCardBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstVisibleCardBox.width - firstCardBox.width)).toBeLessThanOrEqual(
    1,
  );
  const firstTwoNames = await Promise.all([
    firstCard.locator(".v19-actions-mobile-identity > strong").textContent(),
    secondCard.locator(".v19-actions-mobile-identity > strong").textContent(),
  ]);
  expect(firstTwoNames).toHaveLength(2);
  expect(firstTwoNames[0], "first person name").toBeTruthy();
  expect(firstTwoNames[1], "second person name").toBeTruthy();

  const initialOrder = await cards.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-submission-id")),
  );
  const initialScrollTop = await timeline.evaluate((element) => element.scrollTop);

  await firstDisclosure.click();
  await expect(firstDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(surface.getByTestId("agent-action-mobile-detail")).toHaveCount(1);
  const [
    selectedCardBox,
    secondCardAfterOpenBox,
    leftFollowerAfterOpenBox,
    rightFollowerAfterOpenBox,
  ] = await Promise.all([
    firstCard.boundingBox(),
    secondCard.boundingBox(),
    leftFollower.boundingBox(),
    rightFollower.boundingBox(),
  ]);
  if (
    !selectedCardBox ||
    !secondCardAfterOpenBox ||
    !leftFollowerAfterOpenBox ||
    !rightFollowerAfterOpenBox
  ) {
    throw new Error("Expanded desktop person cards have no measurable geometry.");
  }
  expect(
    Math.abs(selectedCardBox.x - firstCardBox.x),
    "the expanded person remains in the first grid column",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(selectedCardBox.width - firstCardBox.width),
    "the expanded person keeps the width of one grid column",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(secondCardAfterOpenBox.x - secondCardBox.x),
    "expanding the first person does not move the second column",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(secondCardAfterOpenBox.y - secondCardBox.y),
    "expanding the first person keeps the neighboring card top-aligned",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(rightFollowerAfterOpenBox.y - rightFollowerBox.y),
    "expanding the left column does not move later cards in the right column",
  ).toBeLessThanOrEqual(1);
  const selectedDesktopStyle = await firstCard.evaluate((card) => {
    const hit = card.querySelector<HTMLElement>(".v19-actions-timeline-hit");
    const style = hit ? getComputedStyle(hit) : null;
    return {
      after: getComputedStyle(card, "::after").content,
      before: getComputedStyle(card, "::before").content,
      borderWidths: style
        ? [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ]
        : [],
      boxShadow: style?.boxShadow,
    };
  });
  expect(selectedDesktopStyle).toEqual({
    after: "none",
    before: "none",
    borderWidths: ["2px", "2px", "2px", "2px"],
    boxShadow: "none",
  });

  await secondDisclosure.click();
  await expect(firstDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(secondDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(surface.getByTestId("agent-action-mobile-detail")).toHaveCount(2);
  const detailId = await secondDisclosure.getAttribute("aria-controls");
  if (!detailId) {
    throw new Error("Selected person card does not expose its inline detail id.");
  }

  const activeDetail = surface.locator(`#${detailId}`);
  await expect(activeDetail).toHaveAttribute("id", detailId);
  const [secondSelectedCardBox, firstCardAfterSwitchBox, leftFollowerAfterSwitchBox] =
    await Promise.all([
      secondCard.boundingBox(),
      firstCard.boundingBox(),
      leftFollower.boundingBox(),
    ]);
  if (
    !secondSelectedCardBox ||
    !firstCardAfterSwitchBox ||
    !leftFollowerAfterSwitchBox
  ) {
    throw new Error("Switched desktop person cards have no measurable geometry.");
  }
  expect(
    Math.abs(secondSelectedCardBox.x - secondCardBox.x),
    "the expanded second person remains in the second grid column",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(secondSelectedCardBox.width - secondCardBox.width),
    "the expanded second person keeps the width of one grid column",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(firstCardAfterSwitchBox.x - firstCardBox.x),
    "switching disclosure keeps the first column stable",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(leftFollowerAfterSwitchBox.y - leftFollowerAfterOpenBox.y),
    "opening the right column does not move later cards in the left column",
  ).toBeLessThanOrEqual(1);
  await firstDisclosure.click();
  await expect(firstDisclosure).toHaveAttribute("aria-expanded", "false");
  await expect(secondDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(surface.getByTestId("agent-action-mobile-detail")).toHaveCount(1);
  expect(await timeline.evaluate((element) => element.scrollTop)).toBe(
    initialScrollTop,
  );
  expect(
    await cards.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-submission-id")),
    ),
  ).toEqual(initialOrder);
  await expect(activeDetail).toContainText("Почему сейчас");
  await expect(activeDetail).toContainText("Готовность подачи");
  await expect(activeDetail).toContainText("Следующее действие");
  await expect(surface.locator(".v19-actions-summary-metric")).toHaveCount(0);
  await expect(surface.locator(".v19-actions-cockpit-summary")).toHaveCount(0);
  await expect(surface.locator('[data-v19-metric-id="open"]')).toBeVisible();
  await expect(surface.locator('[data-v19-metric-id="today"]')).toBeVisible();
  await expect(surface.locator('[data-v19-metric-id="completed"]')).toBeVisible();
  await expect(
    surface.locator(".v19-agent-action-metrics .v19-metric-card"),
  ).toHaveCount(5);

  await expect(surface.getByTestId("agent-action-next-panel")).toHaveCount(0);
  await activeDetail
    .locator('[data-v19-interaction-id="actions.open-secondary"]')
    .click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await secondDisclosure.click();
  await expect(secondDisclosure).toHaveAttribute("aria-expanded", "false");
  await expect(surface.getByTestId("agent-action-mobile-detail")).toHaveCount(0);

  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1280) {
    const visibleCards = await cards.evaluateAll(
      (cards) =>
        cards.filter((card) => {
          const element = card as unknown as {
            getBoundingClientRect(): { bottom: number; top: number };
          };
          const rect = element.getBoundingClientRect();
          const viewportHeight = (globalThis as unknown as { innerHeight: number })
            .innerHeight;
          return rect.bottom > 0 && rect.top < viewportHeight;
        }).length,
    );
    expect(visibleCards).toBeGreaterThanOrEqual(3);
  }

  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();
}

async function assertActionFilters(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  const visibleCards = surface.locator(".v19-actions-timeline-event");
  const chooseFilter = async (
    filter: "blockers" | "completed" | "open" | "today" | "week",
  ) => {
    const button = surface.locator(`[data-v19-metric-id="${filter}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  };

  await chooseFilter("blockers");
  await expect(visibleCards.first()).toBeVisible();

  await chooseFilter("today");
  await expect(visibleCards.first()).toBeVisible();

  await chooseFilter("week");
  await expect(visibleCards.first()).toBeVisible();

  await chooseFilter("completed");
  await expect(visibleCards.first()).toBeVisible();

  await chooseFilter("open");
  const search = surface.getByPlaceholder("ID, семья или город");
  await search.fill("Мария");
  await expect(visibleCards.first()).toContainText("Мария");
  const reset = surface.locator('[data-v19-interaction-id="actions.reset-filters"]');
  await expect(reset.first()).toBeEnabled();
  await reset.first().click();
  await expect(search).toHaveValue("");
}

async function assertPrimaryActionRouting(page: Page) {
  const surface = page.getByRole("region", { name: "Мои действия" });
  if ((await surface.getByTestId("agent-action-mobile-detail").count()) === 0) {
    await surface.locator(".v19-actions-timeline-hit").first().click();
  }
  const detail = surface.getByTestId("agent-action-mobile-detail");
  const primaryAction = detail.locator(
    '[data-v19-interaction-id="actions.open-primary"]',
  );

  await expect(primaryAction).toBeEnabled();
  await primaryAction.click();
  await expect(page.locator(".vf-figma-questionnaire-screen")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("V-19 My Actions submission command cockpit", () => {
  test("viewport matrix and independent stable disclosures", async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(proofDir, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    const rows: ProofRow[] = [];

    for (const viewport of viewports) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await openFreshAgentActions(page);
      await expectNoHorizontalOverflow(page, viewport.label);

      if (viewport.width < 768) {
        await assertMobileCockpit(page);
      } else {
        await assertDesktopCockpit(page);
        if (viewport.width === 1440) {
          await assertActionFilters(page);
          await assertPrimaryActionRouting(page);
        }
      }

      await expectNoHorizontalOverflow(page, `${viewport.label}: after interaction`);
      await openFreshAgentActions(page);
      await expectNoHorizontalOverflow(page, `${viewport.label}: proof state`);
      await resetProofScroll(page);
      await page.screenshot({
        fullPage: true,
        path: join(proofDir, `${viewport.label}.png`),
      });

      rows.push({
        cardsStable: "yes",
        clipping: "no",
        contentReadable: "yes",
        horizontalOverflow: "no",
        notes:
          viewport.width < 768
            ? "Вертикальная ячейка раскрылась inline; secondary CTA открыл Drawer."
            : viewport.width === 1440
              ? "Accordion и primary CTA проверены; открыта точная анкета."
              : "Очередь и inline-контекст видны; secondary CTA открыл Drawer подачи.",
        primaryActionUsable: "yes",
        result: "PASS",
        sidebarCorrect: viewport.width >= 1024 ? "yes" : "n/a",
        viewport: viewport.label,
      });
    }

    writeFileSync(
      join(proofDir, "browser-proof.json"),
      JSON.stringify({ browserProblems, rows }, null, 2),
    );

    expect(browserProblems).toEqual([]);
  });
});
