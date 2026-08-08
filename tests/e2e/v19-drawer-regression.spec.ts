import { join } from "node:path";
import { expect, test } from "@playwright/test";

import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
  selectSubmissionStatus,
} from "./v19-pilot-helpers";

const viewports = [
  { height: 900, label: "desktop", width: 1440 },
  { height: 844, label: "mobile", width: 390 },
] as const;

const responsiveViewportWidths = [320, 375, 430, 768, 1023, 1024] as const;

const lifecycleFixtures = [
  {
    id: "ПД-1052",
    primary: "Начать работу",
    status: "Черновик",
    type: "single",
  },
  {
    id: "ПД-1051",
    primary: "Заполнить раздел «Адрес и контакты»",
    status: "В работе",
    type: "single",
  },
  {
    id: "ПД-1053",
    primary: "Открыть историю",
    readOnly: true,
    status: "На проверке",
    type: "single",
  },
  {
    id: "ПД-1048",
    primary: "Загрузить: Мария Иванова • Селфи 1",
    status: "Возвращено",
    type: "family",
  },
  {
    id: "ПД-1055",
    primary: "Открыть историю",
    readOnly: true,
    status: "Исправления получены",
    type: "family",
  },
  {
    id: "ПД-1054",
    primary: "Открыть историю",
    readOnly: true,
    status: "Готово к выгрузке",
    type: "family",
  },
  {
    id: "ПД-1057",
    primary: "Открыть историю",
    readOnly: true,
    status: "Выгружено",
    type: "single",
  },
] as const;

test.describe("Linear submission Drawer regression", () => {
  for (const width of responsiveViewportWidths) {
    test(`${width}px keeps the Drawer bounded and all four tabs operable`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 844, width });
      await openFreshWorkspace(page);
      await clickWorkspaceButton(page, /^Мои подачи$/);

      const submissionsScreen = page.locator(
        '[data-testid="agent-screen-transition"][data-agent-screen="submissions"]',
      );
      const typeFilter = submissionsScreen.locator(
        'button[data-v19-interaction-id="submissions.type-filter"][aria-haspopup="listbox"]',
      );
      await typeFilter.click();
      await submissionsScreen
        .getByRole("option", { exact: true, name: "Семья" })
        .click();
      await submissionsScreen
        .locator('.v19-agent-shared-card[data-submission-id="ПД-1048"]')
        .click();

      const submissionDrawer = drawer(page);
      const tabs = submissionDrawer.getByRole("tab");
      await expect(tabs).toHaveCount(4);
      await expect
        .poll(async () => {
          const box = await submissionDrawer.boundingBox();
          return box ? box.x + box.width : Number.POSITIVE_INFINITY;
        })
        .toBeLessThanOrEqual(width);
      const drawerBox = await submissionDrawer.boundingBox();
      expect(drawerBox).not.toBeNull();
      expect(drawerBox?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((drawerBox?.x ?? width) + (drawerBox?.width ?? 1)).toBeLessThanOrEqual(
        width,
      );
      if (width <= 1023) {
        expect(drawerBox?.width ?? 0).toBeGreaterThanOrEqual(width - 1);
        expect(drawerBox?.y ?? 0).toBeGreaterThanOrEqual(47.9);
        await expect(submissionDrawer).toHaveCSS("border-top-left-radius", "15px");
      } else {
        expect(drawerBox?.width ?? 0).toBeLessThan(width);
      }

      for (const tab of await tabs.all()) {
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        const box = await tab.boundingBox();
        const labelBox = await tab.locator("span").first().boundingBox();
        expect(box).not.toBeNull();
        expect(labelBox).not.toBeNull();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(drawerBox?.x ?? 0);
        expect((box?.x ?? width) + (box?.width ?? 1)).toBeLessThanOrEqual(
          (drawerBox?.x ?? 0) + (drawerBox?.width ?? width),
        );
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(width <= 1023 ? 43.9 : 39.9);
        expect(labelBox?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((labelBox?.x ?? width) + (labelBox?.width ?? 1)).toBeLessThanOrEqual(
          width,
        );
      }

      const closeButton = submissionDrawer.getByRole("button", {
        name: "Закрыть подачу",
      });
      const closeBox = await closeButton.boundingBox();
      expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(43.9);
      expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(43.9);
    });
  }

  for (const viewport of viewports) {
    test(`${viewport.label} keeps semantic colors, tabs and action feedback`, async ({
      page,
    }, testInfo) => {
      const browserProblems = collectBrowserProblems(page);
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openFreshWorkspace(page);

      const failedRequests: string[] = [];
      page.on("requestfailed", (request) => {
        failedRequests.push(`${request.method()} ${request.url()}`);
      });

      await clickWorkspaceButton(page, /^Мои подачи$/);
      await expect(
        page.getByRole("heading", { exact: true, name: "Мои подачи" }),
      ).toBeVisible();
      const submissionsScreen = page.locator(
        '[data-testid="agent-screen-transition"][data-agent-screen="submissions"]',
      );
      await expect(submissionsScreen).toBeVisible();
      const typeFilter = submissionsScreen.locator(
        'button[data-v19-interaction-id="submissions.type-filter"][aria-haspopup="listbox"]',
      );
      await typeFilter.click();
      await submissionsScreen
        .getByRole("option", { exact: true, name: "Семья" })
        .click();
      const submissionCard = submissionsScreen.locator(
        '.v19-agent-shared-card[data-submission-id="ПД-1048"]',
      );
      await expect(submissionCard).toHaveCount(1);
      await submissionCard.click();

      const submissionDrawer = drawer(page);
      await expect(
        submissionDrawer.getByRole("heading", { name: "Семья Ивановых" }),
      ).toBeVisible();
      const statusBadge = submissionDrawer.getByTestId("drawer-status-badge");
      await expect(statusBadge).toHaveText("Возвращено");
      await expect(statusBadge).toHaveCSS("color", "rgb(251, 146, 60)");
      await expect(submissionDrawer.getByTestId("drawer-updated-at")).toBeAttached();

      for (const tabName of ["Обзор", "Анкета", /Замечания/, "История"]) {
        const tab = submissionDrawer.getByRole("tab", { name: tabName });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await expect(submissionDrawer.getByRole("tabpanel")).toBeVisible();
      }

      const primaryAction = submissionDrawer.getByRole("button", {
        name: "Загрузить: Мария Иванова • Селфи 1",
      });
      await expect(primaryAction).toBeEnabled();
      await expect(primaryAction).toHaveAttribute(
        "data-v19-interaction-id",
        "drawer.upload-file",
      );
      await expect(
        submissionDrawer.getByTestId("drawer-blocker-reason"),
      ).not.toBeEmpty();
      const persistentFooter = submissionDrawer.locator(
        ".v19-submission-drawer-footer",
      );
      await expect(persistentFooter).toBeVisible();
      await expect(persistentFooter.getByTestId("drawer-primary-action")).toHaveText(
        "Загрузить: Мария Иванова • Селфи 1",
      );

      if (viewport.width < 1024) {
        const contextToggle = submissionDrawer.getByRole("button", {
          name: "Подробнее",
        });
        const contextDetails = submissionDrawer.locator(".v19-agent-drawer-context");
        await expect(contextToggle).toBeVisible();
        await expect(contextDetails).toBeHidden();
        await contextToggle.click();
        await expect(contextToggle).toHaveAttribute("aria-expanded", "true");
        await expect(contextDetails).toBeVisible();
        await contextToggle.click();
        await expect(contextDetails).toBeHidden();
        await submissionDrawer.getByRole("tab", { name: /Замечания/ }).click();
        await expect(
          submissionDrawer.getByRole("button", { name: "Перезагрузить файл" }).first(),
        ).toBeInViewport();
      } else {
        await expect(
          submissionDrawer.getByRole("button", { name: "Подробнее" }),
        ).toHaveCount(0);
        await expect(
          submissionDrawer.locator(".v19-agent-drawer-context"),
        ).toBeVisible();
      }

      if (process.env.V19_CAPTURE_DRAWER_EVIDENCE === "1") {
        const evidenceDirectory = process.env.V19_DRAWER_EVIDENCE_DIR;
        const evidencePath = (fileName: string) =>
          evidenceDirectory
            ? join(evidenceDirectory, fileName)
            : testInfo.outputPath(fileName);
        await submissionDrawer.getByRole("tab", { name: "Обзор" }).click();
        await expect(
          submissionDrawer.getByRole("heading", { name: "Маршрут и подача" }),
        ).toBeVisible();
        await submissionDrawer.screenshot({
          path: evidencePath(`agent-drawer-${viewport.label}-overview.png`),
        });
        await submissionDrawer.getByRole("tab", { name: /Замечания/ }).click();
        await expect(
          submissionDrawer.getByRole("heading", {
            name: "Замечания администратора",
          }),
        ).toBeVisible();
        await submissionDrawer.screenshot({
          path: evidencePath(`agent-drawer-${viewport.label}-issues.png`),
        });
      }

      expect(failedRequests).toEqual([]);
      expect(browserProblems).toEqual([]);
    });
  }

  for (const viewport of viewports) {
    test(`${viewport.label} returns from questionnaire to the originating Drawer`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await openFreshWorkspace(page);
      await clickWorkspaceButton(page, /^Мои подачи$/);

      const submissionsScreen = page.locator(
        '[data-testid="agent-screen-transition"][data-agent-screen="submissions"]',
      );
      const typeFilter = submissionsScreen.locator(
        'button[data-v19-interaction-id="submissions.type-filter"][aria-haspopup="listbox"]',
      );
      await typeFilter.click();
      await submissionsScreen
        .getByRole("option", { exact: true, name: "Семья" })
        .click();
      await submissionsScreen
        .locator('.v19-agent-shared-card[data-submission-id="ПД-1048"]')
        .click();

      const submissionDrawer = drawer(page);
      const questionnaireTab = submissionDrawer.getByRole("tab", {
        name: "Анкета",
      });
      await questionnaireTab.click();
      await submissionDrawer.getByRole("button", { name: "Исправить анкету" }).click();

      const questionnaireScreen = page
        .locator(".vf-figma-questionnaire-screen")
        .first();
      await expect(questionnaireScreen).toBeVisible();
      await expect(submissionDrawer).toBeHidden();
      await questionnaireScreen
        .getByRole("button", { name: "Сохранить и выйти" })
        .click();

      await expect(submissionDrawer).toBeVisible();
      await expect(
        submissionDrawer.getByRole("tab", { name: "Анкета" }),
      ).toHaveAttribute("aria-selected", "true");
    });
  }

  for (const fixture of lifecycleFixtures) {
    for (const viewport of viewports) {
      test(`${fixture.id} exposes the canonical lifecycle context on ${viewport.label}`, async ({
        page,
      }) => {
        await page.setViewportSize({
          height: viewport.height,
          width: viewport.width,
        });
        await openFreshWorkspace(
          page,
          fixture.id === "ПД-1057"
            ? { workspaceEmail: "agent2@visaflow.local" }
            : undefined,
        );
        await clickWorkspaceButton(page, /^Мои подачи$/);

        const submissionsScreen = page.locator(
          '[data-testid="agent-screen-transition"][data-agent-screen="submissions"]',
        );
        await expect(submissionsScreen).toBeVisible();
        if (fixture.type === "family") {
          const typeFilter = submissionsScreen.locator(
            'button[data-v19-interaction-id="submissions.type-filter"][aria-haspopup="listbox"]',
          );
          await typeFilter.click();
          await submissionsScreen
            .getByRole("option", { exact: true, name: "Семья" })
            .click();
        }
        if (fixture.id === "ПД-1057") {
          await selectSubmissionStatus(page, "Выгружено");
        }

        await submissionsScreen
          .locator(`.v19-agent-shared-card[data-submission-id="${fixture.id}"]`)
          .click();
        const submissionDrawer = drawer(page);
        await expect(submissionDrawer.getByTestId("drawer-status-badge")).toHaveText(
          fixture.status,
        );
        await expect(
          submissionDrawer.getByTestId("drawer-next-step-context"),
        ).toBeVisible();
        await expect(
          submissionDrawer.getByRole("button", { name: fixture.primary }),
        ).toBeVisible();
        await expect(page.locator(".contents[inert]")).toHaveCount(1);

        if ("readOnly" in fixture && fixture.readOnly) {
          await submissionDrawer.getByRole("tab", { name: "Анкета" }).click();
          await expect(
            submissionDrawer.getByRole("button", { name: "Смотреть анкету" }),
          ).toBeVisible();
        }

        if (fixture.id === "ПД-1054") {
          await submissionDrawer
            .getByRole("button", { name: "Вернуть на проверку" })
            .click();
          const confirmation = page.getByRole("dialog", {
            name: "Вернуть подачу на проверку?",
          });
          await expect(confirmation).toBeVisible();
          await expect(submissionDrawer).toHaveAttribute("inert");
          await confirmation
            .getByRole("button", { name: "Оставить готовой к выгрузке" })
            .click();
          await expect(confirmation).toBeHidden();
          await expect(submissionDrawer.getByTestId("drawer-status-badge")).toHaveText(
            "Готово к выгрузке",
          );
        }

        await submissionDrawer
          .getByRole("button", { exact: true, name: "Закрыть подачу" })
          .click();
        await expect(submissionDrawer).toBeHidden();
      });
    }
  }
});
