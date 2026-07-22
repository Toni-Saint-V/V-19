import { expect, test } from "@playwright/test";

import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const viewports = [
  { height: 900, label: "desktop", width: 1440 },
  { height: 844, label: "mobile", width: 390 },
] as const;

test.describe("Linear submission Drawer regression", () => {
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
});
