import { type Page } from "@playwright/test";

import { expect, test } from "./v19-localhost-test";
import { clickWorkspaceButton, openFreshWorkspace } from "./v19-pilot-helpers";

const verificationViewports = [
  { height: 844, label: "390", width: 390 },
  { height: 1024, label: "768", width: 768 },
  { height: 900, label: "1280", width: 1280 },
  { height: 900, label: "1440", width: 1440 },
];

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth, `${context}: horizontal overflow`).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function openAdminExport(
  page: Page,
  viewport: { height: number; width: number },
) {
  await page.setViewportSize(viewport);
  await openFreshWorkspace(page, {
    heading: /^(Очередь на проверку|Проверка)$/,
    workspaceEmail: "admin@visaflow.local",
  });
  await clickWorkspaceButton(page, /^Выгрузка/);
  await expect(page.getByRole("heading", { name: "Центр выгрузки" })).toBeVisible();
}

async function openExportRail(page: Page) {
  const rail = page.locator('aside[aria-label="Контроль пакета"]');
  if (!(await rail.isVisible())) {
    const toggle = page.locator("button.v19-admin-export-context-toggle-v2");
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toBeVisible();
    await toggle.click();
  }
  await expect(rail).toBeVisible();
  return rail;
}

test.describe("admin export context and filters", () => {
  test("keeps only useful export context and explains filters at every supported width", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "chromium", "single-project browser proof");

    for (const viewport of verificationViewports) {
      await openAdminExport(page, viewport);

      const screen = page.locator(".v19-admin-export-screen-v2");
      const rail = page.locator('aside[aria-label="Контроль пакета"]');
      const search = page.getByRole("searchbox", { name: "ID, семья или агент" });
      const filterTriggers = page.locator(
        ".v19-admin-export-workspace-v2 .v19-inline-filter-buttons .v19-admin-toolbar-select-trigger",
      );

      await expect(filterTriggers).toHaveCount(3);
      await expect(screen).toHaveAttribute("data-has-export-context", "false");
      await expect(rail).toHaveCount(0);
      await expectNoHorizontalOverflow(page, `${viewport.label}: idle export`);

      if (viewport.width < 768) {
        const controlCenters = await page
          .locator(
            ".v19-admin-export-workspace-v2 .v19-admin-queue-toolbar-search:visible, .v19-admin-export-workspace-v2 .v19-inline-filter-buttons .v19-admin-toolbar-select:visible",
          )
          .evaluateAll((elements) =>
            elements.map((element) => {
              const bounds = element.getBoundingClientRect();
              return Math.round(bounds.top + bounds.height / 2);
            }),
          );
        expect(
          new Set(controlCenters).size,
          `${viewport.label}: search and compact filters share one row`,
        ).toBe(1);
        await expect(
          filterTriggers.first().locator(".v19-admin-toolbar-select-label"),
        ).toBeHidden();
      } else {
        for (let index = 0; index < 3; index += 1) {
          const trigger = filterTriggers.nth(index);
          await expect(
            trigger.locator(".v19-admin-toolbar-select-label"),
          ).toBeVisible();
          await expect(
            trigger.locator(".v19-admin-toolbar-select-value"),
          ).toBeVisible();
          const textMetrics = await trigger.evaluate((element) => {
            const label = element.querySelector<HTMLElement>(
              ".v19-admin-toolbar-select-label",
            );
            const value = element.querySelector<HTMLElement>(
              ".v19-admin-toolbar-select-value",
            );
            return {
              labelFits: label ? label.scrollWidth <= label.clientWidth : false,
              valueFits: value ? value.scrollWidth <= value.clientWidth : false,
            };
          });
          expect(
            textMetrics.labelFits,
            `${viewport.label}: filter ${index} label`,
          ).toBe(true);
          expect(
            textMetrics.valueFits,
            `${viewport.label}: filter ${index} value`,
          ).toBe(true);
        }
      }

      if (viewport.width >= 1280) {
        const geometry = await screen.evaluate((element) => {
          const queueElement = element.querySelector<HTMLElement>(
            ".v19-admin-export-workspace-v2",
          );
          return {
            queueWidth: queueElement?.getBoundingClientRect().width ?? 0,
            screenWidth: element.getBoundingClientRect().width,
          };
        });
        expect(
          geometry.queueWidth,
          `${viewport.label}: empty context returns the rail width to the queue`,
        ).toBeGreaterThanOrEqual(geometry.screenWidth - 1);
      }

      const firstExportRow = page.locator(".v19-admin-export-row-v2").first();
      await firstExportRow.click();
      await expect(screen).toHaveAttribute("data-has-export-context", "true");
      await firstExportRow.getByRole("checkbox").uncheck();
      await search.fill("Дмитрий Орлов");
      await expect(page.locator(".v19-admin-export-row-v2")).toHaveCount(1);
      await expect(screen).toHaveAttribute("data-has-export-context", "false");
      await expect(rail).toHaveCount(0);

      await search.fill("нет такого пакета");
      await expect(page.locator(".v19-admin-export-row-v2")).toHaveCount(0);
      await expect(screen).toHaveAttribute("data-has-export-context", "false");
      await expect(rail).toHaveCount(0);
      await expectNoHorizontalOverflow(
        page,
        `${viewport.label}: filtered-empty export`,
      );

      await search.fill("");
      const firstReadyPackage = page
        .getByRole("checkbox", { name: /^Выбрать / })
        .first();
      await expect(firstReadyPackage).toBeEnabled();
      await firstReadyPackage.check();
      await expect(screen).toHaveAttribute("data-has-export-context", "true");
      const selectedRail = await openExportRail(page);
      await expect(
        selectedRail.getByRole("region", { name: "Текущая выгрузка" }),
      ).toContainText("1 пакет");
      await expectNoHorizontalOverflow(page, `${viewport.label}: selected export`);

      if (viewport.width < 1280) {
        await selectedRail
          .getByRole("button", { name: "Закрыть контроль пакета" })
          .click();
      }
      await firstReadyPackage.uncheck();
      await expect(screen).toHaveAttribute("data-has-export-context", "true");

      await page.getByRole("button", { name: "Стоп" }).click();
      await expect(page.getByText("Пакетов с ограничениями нет")).toBeVisible();
      await expect(screen).toHaveAttribute("data-has-export-context", "false");
      await expect(rail).toHaveCount(0);
      await expectNoHorizontalOverflow(page, `${viewport.label}: empty blocked export`);
    }
  });
});
