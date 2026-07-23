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

const compactViewportWidths = [320, 375, 430, 768] as const;

const lifecycleFixtures = [
  {
    id: "ПД-1052",
    primary: "Начать работу",
    status: "Черновик",
    type: "single",
  },
  {
    id: "ПД-1051",
    primary: "Отправить на проверку",
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
    primary: "Отправить исправления",
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
  for (const width of compactViewportWidths) {
    test(`${width}px keeps all four tabs operable without horizontal overflow`, async ({
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
        .poll(() =>
          submissionDrawer.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(1);

      const tabLabelBoxes: Array<{ width: number; x: number }> = [];
      for (const tab of await tabs.all()) {
        const box = await tab.boundingBox();
        const labelBox = await tab.locator("span").first().boundingBox();
        expect(box).not.toBeNull();
        expect(labelBox).not.toBeNull();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? width) + (box?.width ?? 1)).toBeLessThanOrEqual(width);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.9);
        expect(labelBox?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((labelBox?.x ?? width) + (labelBox?.width ?? 1)).toBeLessThanOrEqual(
          width,
        );
        if (labelBox) tabLabelBoxes.push(labelBox);
      }

      for (let index = 1; index < tabLabelBoxes.length; index += 1) {
        const previous = tabLabelBoxes[index - 1];
        const current = tabLabelBoxes[index];
        if (!previous || !current) continue;
        expect(previous.x + previous.width).toBeLessThanOrEqual(current.x);
      }
    });
  }

  for (const viewport of viewports) {
    test(`${viewport.label} keeps semantic colors, tabs and action feedback`, async ({
      page,
    }) => {
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
      const updatedAt = submissionDrawer.getByTestId("drawer-updated-at");
      await expect(updatedAt).toHaveCSS("color", "rgba(255, 255, 255, 0.4)");

      for (const tabName of ["Обзор", "Анкета", /Замечания/, "История"]) {
        const tab = submissionDrawer.getByRole("tab", { name: tabName });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await expect(submissionDrawer.getByRole("tabpanel")).toBeVisible();
      }

      const primaryAction = submissionDrawer.getByRole("button", {
        name: "Отправить исправления",
      });
      const actionNotice = submissionDrawer.getByTestId("drawer-footer-instruction");
      await expect(primaryAction).toBeDisabled();
      await expect(actionNotice).toBeVisible();
      await expect(primaryAction).toHaveAttribute(
        "aria-describedby",
        "submission-drawer-primary-action-notice",
      );

      expect(failedRequests).toEqual([]);
      expect(browserProblems).toEqual([]);
    });
  }

  for (const fixture of lifecycleFixtures) {
    test(`${fixture.id} exposes the canonical lifecycle context`, async ({ page }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
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
});
