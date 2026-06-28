import { expect, type Locator, type Page } from "@playwright/test";

export function collectBrowserProblems(page: Page) {
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

export async function openFreshWorkspace(
  page: Page,
  options: { heading?: string; workspaceEmail?: string } = {},
) {
  await page.goto("/");
  await page.evaluate((workspaceEmail) => {
    const browserGlobal = globalThis as unknown as {
      localStorage: {
        clear(): void;
        setItem(key: string, value: string): void;
      };
    };

    browserGlobal.localStorage.clear();
    if (workspaceEmail) {
      browserGlobal.localStorage.setItem("visaflow.workspaceEmail.v1", workspaceEmail);
    }
  }, options.workspaceEmail ?? "");
  await page.reload();

  if (options.heading) {
    await expect(
      page.getByRole("heading", { level: 1, name: options.heading }),
    ).toBeVisible();
  }
}

export async function loginThroughAccessGate(
  page: Page,
  email: string,
  heading: string,
) {
  await expect(
    page.getByRole("heading", { level: 1, name: "Вход в рабочий кабинет" }),
  ).toBeVisible();
  await page.getByLabel("Рабочая почта").fill(email);
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

export async function isVisible(locator: Locator) {
  return locator.isVisible({ timeout: 750 }).catch(() => false);
}

export async function openMobileMenu(page: Page) {
  const menuButton = page.getByRole("button", { name: "Меню" });

  if (await isVisible(menuButton)) {
    await menuButton.click();
  }
}

export async function clickFirstVisible(locator: Locator) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);

    if (await isVisible(candidate)) {
      await candidate.click();
      return;
    }
  }

  throw new Error("No visible locator matched.");
}

export async function expectAtLeastOneVisible(locator: Locator, message: string) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    if (await isVisible(locator.nth(index))) {
      return;
    }
  }

  throw new Error(message);
}

export async function clickWorkspaceButton(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name });

  if (!(await isVisible(button.first()))) {
    await openMobileMenu(page);
  }

  await clickFirstVisible(button);
}

export function drawer(page: Page) {
  return page.getByRole("dialog").first();
}

export function submissionCard(page: Page, name: string) {
  return page
    .locator(".submission-card, .v17-admin-work-row, [data-submission-card]")
    .filter({ hasText: name })
    .first();
}

export function submissionCardById(page: Page, id: string) {
  return page.locator(`[data-submission-id="${id}"]`).first();
}

export async function selectSubmissionStatus(page: Page, label: string | RegExp) {
  const desktopTab = page.getByRole("tab", { name: label }).first();

  if (await isVisible(desktopTab)) {
    await desktopTab.click();
    await expect(desktopTab).toHaveAttribute("aria-selected", "true");
    return;
  }

  await page.getByRole("button", { name: "Фильтры подач" }).click();
  const statusDialog = page.getByRole("dialog", { name: "Статус подач" });
  const statusOption = statusDialog
    .locator(".v19-mobile-filter-options")
    .getByRole("button", { name: label });

  await expect(statusOption).toBeVisible();
  await statusOption.click();
  await expect(statusDialog).toHaveCount(0);
}

export async function openDrawerTab(page: Page, labels: string[]) {
  const escapedLabels = labels.map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const name = new RegExp(`^(${escapedLabels.join("|")})([\\s,]|$)`);
  const tab = drawer(page).getByRole("tab", { name }).first();

  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

export async function expectDrawerStatus(page: Page, status: string) {
  const detailMeta = drawer(page).locator(".drawer-meta-line");

  if ((await detailMeta.count()) > 0) {
    await expect(detailMeta).toContainText(/ПД-\d+|VF-\d+|SUB-\d+/);
    await expect(drawer(page).locator(".drawer-status-chip")).toContainText(status);
    return;
  }

  await expect(drawer(page).getByText(status).first()).toBeVisible();
}

export function e2ePassportFile(name: string) {
  return {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    mimeType: "image/jpeg",
    name: `e2e-passport-${name}.jpg`,
  };
}

export async function uploadAllVisibleFiles(page: Page) {
  for (let pass = 0; pass < 40; pass += 1) {
    const uploadButtons = drawer(page).getByRole("button", {
      name: /^(Загрузить|Заменить)/,
    });

    if ((await uploadButtons.count()) === 0) {
      return;
    }

    await uploadButtons.first().click();
  }

  throw new Error("Unable to upload all visible files.");
}

export async function markVisibleIssuesFixed(page: Page) {
  await openDrawerTab(page, ["Замечания"]);
  const fixedButtons = drawer(page).getByRole("button", {
    name: /Отметить замечание исправленным:/,
  });

  for (let safety = 0; safety < 12; safety += 1) {
    const before = await fixedButtons.count();
    if (before === 0) return;

    await fixedButtons.first().click();
    await expect(fixedButtons).toHaveCount(before - 1);
  }

  throw new Error("Too many visible issue fix buttons.");
}

export async function clearExportSelection(page: Page) {
  const checked = page.locator(".export-row input:checked");

  while ((await checked.count()) > 0) {
    await checked.first().uncheck();
  }
}

export async function expectNoHorizontalOverflow(page: Page, context: string) {
  const metrics = await page.evaluate(() => {
    const browserDocument = (
      globalThis as unknown as {
        document: { documentElement: { clientWidth: number; scrollWidth: number } };
      }
    ).document;
    const root = browserDocument.documentElement;

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });

  expect(metrics.scrollWidth, context).toBeLessThanOrEqual(metrics.clientWidth + 1);
}
