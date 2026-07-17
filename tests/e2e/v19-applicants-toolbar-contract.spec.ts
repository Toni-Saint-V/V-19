import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { testArtifactPath } from "../support/artifacts";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const evidenceDir = testArtifactPath("2026-07-15-submissions-pass-01");

const viewports = [
  { height: 844, label: "mobile-390", width: 390 },
  { height: 1024, label: "tablet-768", width: 768 },
  { height: 900, label: "desktop-1440", width: 1440 },
] as const;

function metricValue(page: Page, label: string) {
  return page
    .getByRole("button", { exact: true, name: label })
    .textContent()
    .then((text) => Number(text?.match(/\d+/)?.[0]));
}

async function openAgentSubmissions(page: Page) {
  await openFreshWorkspace(page, {
    heading: "Мои действия",
    workspaceEmail: "agent@visaflow.local",
  });

  const mobileMenu = page.getByRole("button", { exact: true, name: "Меню" });
  if (await mobileMenu.isVisible().catch(() => false)) {
    await mobileMenu.click();
    const menuDialog = page.getByRole("dialog", { name: "Меню агента" });
    await expect(menuDialog).toBeVisible();
    await menuDialog.getByRole("button", { name: "Мои подачи" }).click();
    await expect(menuDialog).toBeHidden();
  } else {
    await page.getByRole("button", { name: "Мои подачи" }).click();
  }

  await expect(page.getByLabel("Поиск по подачам")).toBeVisible();
}

async function revealLastDrawerFile(
  page: Page,
  submissionDrawer: Locator,
  viewport: (typeof viewports)[number],
) {
  const drawerBody = submissionDrawer.locator(".v19-submission-drawer-body");
  const fileRows = drawerBody.locator(".v19-submission-drawer-file");
  const lastFile = fileRows.last();
  const footer = submissionDrawer.locator(".v19-submission-drawer-footer");

  expect(await fileRows.count()).toBeGreaterThan(1);
  await drawerBody.hover();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [fileBox, footerBox] = await Promise.all([
      lastFile.boundingBox(),
      footer.boundingBox(),
    ]);
    if (
      fileBox &&
      footerBox &&
      fileBox.y >= 0 &&
      fileBox.y + fileBox.height <= footerBox.y
    ) {
      await expect(lastFile).toBeVisible();
      await page.screenshot({
        fullPage: false,
        path: join(evidenceDir, `${viewport.label}-drawer-files-bottom.png`),
      });
      return;
    }
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(120);
  }

  const [fileBox, footerBox] = await Promise.all([
    lastFile.boundingBox(),
    footer.boundingBox(),
  ]);
  expect(
    fileBox,
    "the last file must stay above the drawer footer after user scroll",
  ).not.toBeNull();
  expect(footerBox, "the drawer footer must remain visible").not.toBeNull();
  if (fileBox && footerBox) {
    expect(fileBox.y).toBeGreaterThanOrEqual(0);
    expect(fileBox.y + fileBox.height).toBeLessThanOrEqual(footerBox.y);
  }

  await page.screenshot({
    fullPage: false,
    path: join(evidenceDir, `${viewport.label}-drawer-files-bottom.png`),
  });
}

async function expectQuestionnaireAndReturn(
  page: Page,
  viewport: (typeof viewports)[number],
  screenshot: string,
  options?: { readOnly?: boolean },
) {
  await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Анкета:/ })).toBeVisible();
  if (options?.readOnly) {
    await expect(page.getByTestId("questionnaire-read-only-status")).toBeVisible();
    await expect(page.getByTestId("questionnaire-read-only-banner")).toContainText(
      "Исправления отправлены администратору",
    );
    await expect(page.getByRole("button", { name: "Черновик" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Отправить/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "К блокеру" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Заполнить общие поля семьи" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Следующее поле" })).toHaveCount(0);
    await expect(page.getByTestId("questionnaire-next-blocker")).toHaveCount(0);
  }
  await page.screenshot({
    fullPage: false,
    path: join(evidenceDir, `${viewport.label}-${screenshot}.png`),
  });
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByLabel("Поиск по подачам")).toBeVisible();
}

test.describe("V-19 applicants toolbar lifecycle contract", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of viewports) {
    test(`${viewport.label}: filters, reset and drawer stay truthful`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "focused local UI proof");
      mkdirSync(evidenceDir, { recursive: true });
      await page.setViewportSize(viewport);

      const browserProblems = collectBrowserProblems(page);
      await openAgentSubmissions(page);

      const cards = page.locator("[data-submission-id]");
      const listHeaderCount = page.locator(".v19-admin-export-list-head-v2 small");
      const totalCards = await cards.count();
      const reviewCount = await metricValue(page, "Проверить");
      const readyCount = await metricValue(page, "К выгрузке");

      expect(totalCards).toBeGreaterThan(0);
      expect(reviewCount).toBeGreaterThan(0);
      expect(readyCount).toBeGreaterThan(0);
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDir, `${viewport.label}-baseline.png`),
      });

      const blockerFilter = page.getByRole("button", {
        name: "Фильтр подач: Все",
      });
      await blockerFilter.click();
      await page
        .getByRole("listbox", { name: "Фильтр подач" })
        .getByRole("option", { name: "Блокеры" })
        .click();
      await expect(
        page.getByRole("button", { name: "Фильтр подач: Блокеры" }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(listHeaderCount).toContainText("Блокеры");
      expect(await cards.count()).toBeGreaterThan(0);

      await page.getByRole("button", { exact: true, name: "Проверить" }).click();
      await expect(
        page.getByRole("button", { exact: true, name: "Проверить" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(cards).toHaveCount(reviewCount);
      await expect(listHeaderCount).toContainText("Проверить");
      const reviewCardTexts = await cards.allTextContents();
      expect(
        reviewCardTexts.every(
          (text) => text.includes("Проверка") || text.includes("Исправление"),
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDir, `${viewport.label}-review-filter.png`),
      });

      const statusFilter = page.getByRole("button", {
        name: "Фильтр подач: Проверить",
      });
      await statusFilter.click();
      await expect(statusFilter).toHaveAttribute("aria-expanded", "true");
      const statusListbox = page.getByRole("listbox", { name: "Фильтр подач" });
      await expect(statusListbox).toBeVisible();
      const reviewOption = statusListbox.getByRole("option", { name: "Проверить" });
      const readyOption = statusListbox.getByRole("option", { name: "К выгрузке" });
      await expect(reviewOption).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(readyOption).toBeFocused();
      await page.keyboard.press("End");
      await expect(readyOption).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(statusFilter).toBeFocused();

      await statusFilter.click();
      await statusListbox.getByRole("option", { name: "К выгрузке" }).click();
      await expect(cards).toHaveCount(readyCount);
      const readyStatusFilter = page.getByRole("button", {
        name: "Фильтр подач: К выгрузке",
      });
      await readyStatusFilter.click();
      await expect(page.getByRole("option", { name: "К выгрузке" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.keyboard.press("Escape");

      for (const key of ["Enter", "Space"]) {
        await readyStatusFilter.click();
        await expect(readyOption).toBeFocused();
        await page.keyboard.press(key);
        await expect(readyStatusFilter).toBeFocused();
        await expect(readyStatusFilter).toHaveAttribute("aria-expanded", "false");
      }

      await page.getByRole("button", { exact: true, name: "В очереди" }).click();
      const cityFilter = page.getByRole("button", {
        name: "Фильтр городов: Все города",
      });
      await cityFilter.click();
      await page
        .getByRole("listbox", { name: "Фильтр городов" })
        .getByRole("option", { name: "Москва" })
        .click();
      const appointmentCitySubmission = page.locator('[data-submission-id="SUB-1103"]');
      await expect(appointmentCitySubmission).toBeVisible();
      await expect(appointmentCitySubmission).toContainText("Москва");
      await expect(listHeaderCount).toContainText("Москва");
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDir, `${viewport.label}-city-filter.png`),
      });
      await appointmentCitySubmission.click();
      const appointmentCityDrawer = drawer(page);
      await expect(appointmentCityDrawer).toBeVisible();
      await expect(appointmentCityDrawer).toContainText("Москва");
      await appointmentCityDrawer
        .getByRole("button", { name: /Закрыть (подачу|панель)/ })
        .click();

      await page.getByLabel("Поиск по подачам").fill("__no_matching_submission__");
      const emptyState = page
        .getByRole("status")
        .filter({ hasText: "Ничего не найдено" });
      await expect(emptyState).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDir, `${viewport.label}-empty-reset.png`),
      });
      await emptyState.getByRole("button", { name: "Сбросить фильтры" }).click();
      await expect(cards).toHaveCount(totalCards);

      const correctionsCard = page.locator(
        'button.v19-queue-card[data-submission-id="ПД-1055"]',
      );
      await expect(correctionsCard).toBeVisible();
      await expect(correctionsCard).toContainText("Исправление");
      await expect(correctionsCard).toContainText("Открыть");
      expect(await correctionsCard.evaluate((element) => element.tagName)).toBe(
        "BUTTON",
      );
      await correctionsCard.click();
      const submissionDrawer = drawer(page);
      await expect(submissionDrawer).toBeVisible();
      await expect(
        submissionDrawer.getByText("Исправления получены", { exact: true }),
      ).toBeVisible();
      await expect(submissionDrawer.getByText("Черновик", { exact: true })).toHaveCount(
        0,
      );
      await expect
        .poll(
          async () => {
            const box = await submissionDrawer.boundingBox();
            return Boolean(
              box &&
              box.x >= 0 &&
              box.y >= 0 &&
              box.x + box.width <= viewport.width &&
              box.y + box.height <= viewport.height,
            );
          },
          { timeout: 1_500 },
        )
        .toBe(true);
      const drawerBox = await submissionDrawer.boundingBox();
      expect(drawerBox).not.toBeNull();
      if (drawerBox) {
        expect(drawerBox.x).toBeGreaterThanOrEqual(0);
        expect(drawerBox.y).toBeGreaterThanOrEqual(0);
        expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(viewport.width);
        expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(viewport.height);
      }
      await page.screenshot({
        fullPage: false,
        path: join(evidenceDir, `${viewport.label}-drawer.png`),
      });

      const drawerTabs = [
        {
          label: "Заявители",
          panelText: "Состав подачи и готовность анкеты каждого участника.",
          screenshot: "applicants",
        },
        { label: "Анкета", panelText: "Смотреть анкету", screenshot: "questionnaire" },
        { label: "Файлы", panelText: "Файлы подачи", screenshot: "files" },
        {
          label: "Замечания",
          panelText: "Список задач по замечаниям",
          screenshot: "issues",
        },
        { label: "История", panelText: undefined, screenshot: "history" },
      ] as const;

      for (const tabProof of drawerTabs) {
        const tab = submissionDrawer.getByRole("tab", {
          name: new RegExp(`^${tabProof.label}`),
        });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        const panel = submissionDrawer.getByRole("tabpanel", { name: tabProof.label });
        await expect(panel).toBeVisible();
        if (tabProof.panelText) await expect(panel).toContainText(tabProof.panelText);
        await page.screenshot({
          fullPage: false,
          path: join(
            evidenceDir,
            `${viewport.label}-drawer-${tabProof.screenshot}.png`,
          ),
        });

        if (tabProof.screenshot === "files") {
          await revealLastDrawerFile(page, submissionDrawer, viewport);
        }
      }

      const questionnaireTab = submissionDrawer.getByRole("tab", { name: /^Анкета/ });
      await questionnaireTab.click();
      await expect(
        submissionDrawer.getByRole("tabpanel", { name: "Анкета" }),
      ).toContainText("Исправления отправлены");
      await submissionDrawer.getByRole("button", { name: "Смотреть анкету" }).click();
      await expect(submissionDrawer).toBeHidden();
      await expectQuestionnaireAndReturn(
        page,
        viewport,
        "drawer-questionnaire-read-only",
        { readOnly: true },
      );

      await correctionsCard.click();
      await expect(submissionDrawer).toBeVisible();
      const issuesTab = submissionDrawer.getByRole("tab", { name: /^Замечания/ });
      await issuesTab.click();
      await expect(
        submissionDrawer.getByRole("tabpanel", { name: "Замечания" }),
      ).toContainText("Исправления на проверке");
      await expect(
        submissionDrawer.getByRole("button", { name: "Исправить в анкете" }),
      ).toHaveCount(0);
      await submissionDrawer
        .getByRole("button", { name: /Закрыть (подачу|панель)/ })
        .click();

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(browserProblems, browserProblems.join("\n")).toEqual([]);
    });
  }
});
