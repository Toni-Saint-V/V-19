import { type Locator, type Page } from "@playwright/test";

import { expect, test } from "./v19-localhost-test";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
      document: { documentElement: { clientWidth: number; scrollWidth: number } };
    };
    return {
      clientWidth: browserGlobal.document.documentElement.clientWidth,
      scrollWidth: browserGlobal.document.documentElement.scrollWidth,
    };
  });

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function isFullyWithinViewport(locator: Locator) {
  return locator.evaluate((element) => {
    const browserGlobal = globalThis as unknown as {
      innerHeight: number;
      innerWidth: number;
    };
    const bounds = (
      element as {
        getBoundingClientRect(): {
          bottom: number;
          left: number;
          right: number;
          top: number;
        };
      }
    ).getBoundingClientRect();
    return (
      bounds.left >= 0 &&
      bounds.right <= browserGlobal.innerWidth &&
      bounds.top >= 0 &&
      bounds.bottom <= browserGlobal.innerHeight
    );
  });
}

async function expectCompletePassportFrame(reviewWorkspace: Locator) {
  const passportPreview = reviewWorkspace.getByTestId(
    "protected-media-preview-passport_scan",
  );
  await expect(passportPreview).toBeVisible();
  await expect
    .poll(() =>
      passportPreview.evaluate((image) => {
        const style = getComputedStyle(image);
        const canvas = image.closest(".v19-review-preview-canvas");
        if (!canvas) return null;
        const imageBounds = image.getBoundingClientRect();
        const canvasBounds = canvas.getBoundingClientRect();
        return {
          contained:
            imageBounds.left >= canvasBounds.left - 1 &&
            imageBounds.right <= canvasBounds.right + 1 &&
            imageBounds.top >= canvasBounds.top - 1 &&
            imageBounds.bottom <= canvasBounds.bottom + 1,
          inlineTransform: (image as HTMLImageElement).style.transform,
          objectFit: style.objectFit,
        };
      }),
    )
    .toEqual({
      contained: true,
      inlineTransform: "scale(1) rotate(0deg)",
      objectFit: "contain",
    });
}

test.describe("V-19 P0 admin document review", () => {
  test("passport keeps its complete frame and reversible zoom across approved viewports", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const viewports = [
      { height: 844, width: 390 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await openFreshWorkspace(page, {
        heading: "Очередь на проверку",
        workspaceEmail: "admin@visaflow.local",
      });

      await expect(page.locator(".v19-review-focus-tabs")).toHaveCount(0);
      await expect(page.locator(".v19-admin-review-list-head")).toBeVisible();
      const submission = page.locator('[data-submission-id="ПД-1055"]').first();
      await expect(submission).toBeVisible();
      await submission.click();

      let reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
      await expect(reviewWorkspace).toBeVisible();
      await expectCompletePassportFrame(reviewWorkspace);
      await reviewWorkspace
        .getByRole("button", { name: "Уменьшить изображение" })
        .click();
      await expect(
        reviewWorkspace.getByTestId("protected-media-preview-passport_scan"),
      ).toHaveCSS("transform", /matrix\(0\.9, 0, 0, 0\.9, 0, 0\)/);
      await reviewWorkspace
        .getByRole("button", { name: "Увеличить изображение" })
        .click();
      await expectCompletePassportFrame(reviewWorkspace);
      const selfieTab = reviewWorkspace.getByRole("tab", {
        exact: true,
        name: "Селфи 1",
      });
      await selfieTab.click();
      await expect(selfieTab).toHaveAttribute("aria-selected", "true");
      await expect(
        reviewWorkspace.getByTestId("protected-media-preview-passport_scan"),
      ).toBeVisible();
      await expect(
        reviewWorkspace.getByTestId("protected-media-preview-selfie"),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: testInfo.outputPath(
          `passport-selfie-compare-${viewport.width}x${viewport.height}.png`,
        ),
      });

      await page.reload();
      const reloadedSubmission = page.locator('[data-submission-id="ПД-1055"]').first();
      await expect(reloadedSubmission).toBeVisible();
      await reloadedSubmission.click();
      reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
      await expect(reviewWorkspace).toBeVisible();
      await expectCompletePassportFrame(reviewWorkspace);
      await expectNoHorizontalOverflow(page);
    }

    expect(browserProblems).toEqual([]);
  });

  test("mobile review rejects an unusable original and blocks section confirmation on incomplete fields", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    const submission = page
      .getByRole("button", { name: "Ручная проверка заявки Нина Волкова" })
      .first();
    await expect(submission).toBeVisible();
    await submission.click();

    const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
    await expect(reviewWorkspace).toBeVisible();
    await expect(
      reviewWorkspace.getByRole("button", { name: "Вернуться к очереди" }),
    ).toBeFocused();

    const passportTab = reviewWorkspace.getByRole("tab", {
      name: "Паспорт",
      exact: true,
    });
    await expect(passportTab).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => isFullyWithinViewport(passportTab)).toBe(true);

    const mediaActions = reviewWorkspace.getByRole("tablist", {
      name: "Выбор файла для проверки",
    });
    await expect(mediaActions.getByRole("tab")).toHaveCount(3);
    for (const action of await mediaActions.getByRole("tab").all()) {
      await action.scrollIntoViewIfNeeded();
      await expect.poll(() => isFullyWithinViewport(action)).toBe(true);
    }
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("mobile-390-files-entry.png"),
    });

    await expect(
      reviewWorkspace.getByRole("heading", { name: "Данные паспорта" }),
    ).toBeVisible();
    await expect(
      reviewWorkspace.getByRole("alert").getByText("Оригинал нельзя принять"),
    ).toBeVisible();
    await expect(
      reviewWorkspace.getByRole("button", {
        name: "Принять всё",
      }),
    ).toBeDisabled();
    await expect(
      reviewWorkspace.getByRole("button", { name: /^Подтвердить:/ }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("mobile-390-passport-incomplete-fields.png"),
    });

    await page.keyboard.press("Escape");
    await expect(reviewWorkspace).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Очередь на проверку" }),
    ).toBeVisible();

    expect(browserProblems).toEqual([]);
  });

  test("desktop passport workspace shows exactly eight fields, three protected originals, and one section action", async ({
    page,
  }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    const submission = page
      .getByRole("button", { name: "Ручная проверка заявки Нина Волкова" })
      .first();
    await expect(submission).toBeVisible();
    await submission.click();

    const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
    await expect(reviewWorkspace).toBeVisible();
    const backToQueue = reviewWorkspace.getByRole("button", {
      name: "Вернуться к очереди",
    });
    await expect(backToQueue).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        reviewWorkspace.evaluate((workspace) =>
          workspace.contains(workspace.ownerDocument.activeElement),
        ),
      )
      .toBe(true);
    await expect(reviewWorkspace.locator("[data-passport-field-id]")).toHaveCount(8);
    await expect(reviewWorkspace.locator("[data-review-media]")).toHaveCount(3);
    await expect(
      reviewWorkspace.getByRole("button", {
        name: "Принять всё",
      }),
    ).toHaveCount(1);
    await reviewWorkspace
      .getByRole("button", { name: "Добавить замечание: Номер паспорта" })
      .click();
    const remarkDialog = page.getByRole("dialog", { name: "Добавить замечание" });
    const remarkTextarea = remarkDialog.getByLabel("Текст для клиента");
    await expect(remarkDialog).toBeVisible();
    await expect(remarkTextarea).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const workspace = document.querySelector<HTMLElement>(
            ".v19-review-workspace",
          );
          const backdrop = document.querySelector<HTMLElement>(
            ".v19-remark-form-backdrop",
          );
          const dialog = document.querySelector<HTMLElement>(".v19-remark-form-dialog");
          if (!workspace || !backdrop || !dialog) return false;
          const workspaceZ = Number(getComputedStyle(workspace).zIndex);
          const backdropZ = Number(getComputedStyle(backdrop).zIndex);
          const dialogZ = Number(getComputedStyle(dialog).zIndex);
          return backdropZ > workspaceZ && dialogZ > backdropZ;
        }),
      )
      .toBe(true);
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        remarkDialog.evaluate((dialog) =>
          dialog.contains(dialog.ownerDocument.activeElement),
        ),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(remarkDialog).toBeHidden();
    await expect(reviewWorkspace).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: testInfo.outputPath("desktop-1440-passport-fail-closed.png"),
    });

    expect(browserProblems).toEqual([]);
  });
});
