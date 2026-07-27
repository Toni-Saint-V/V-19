import { expect, test, type Locator, type Page } from "@playwright/test";

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

test.describe("V-19 P0 admin document review", () => {
  test("mobile review rejects an unusable original and blocks section confirmation on incomplete fields", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "The explicit 390px proof runs once in Chromium.",
    );

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
      reviewWorkspace.getByRole("region", { name: "Поля паспорта" }),
    ).toBeVisible();
    await expect(
      reviewWorkspace.getByRole("alert").getByText("Оригинал нельзя принять"),
    ).toBeVisible();
    await expect(
      reviewWorkspace.getByRole("button", {
        name: "Сохранить",
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
    await expect(page.getByRole("heading", { name: "Очередь на проверку" })).toBeVisible();

    expect(browserProblems).toEqual([]);
  });

  test("desktop passport workspace shows exactly eight fields, three protected originals, and one save action", async ({
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
        name: "Сохранить",
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
          const dialog = document.querySelector<HTMLElement>(
            ".v19-remark-form-dialog",
          );
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
