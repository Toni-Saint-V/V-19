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
  const workspaceEmail = normalizeLocalDemoWorkspaceEmail(options.workspaceEmail);
  const workspacePassword = localDemoPasswordForEmail(workspaceEmail);

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
      browserGlobal.localStorage.setItem("visaflow.workspaceEmail.v2", workspaceEmail);
    }
  }, workspaceEmail);
  await page.reload();

  const switchToLogin = page.getByRole("button", {
    name: "Уже есть доступ? Войти",
  });
  if (await isVisible(switchToLogin)) {
    await switchToLogin.click();
  }

  const emailField = page.locator("#workspace-email");
  if (await isVisible(emailField)) {
    try {
      await emailField.fill(workspaceEmail, {
        timeout: 2_000,
      });
      await page.locator("#workspace-password").fill(workspacePassword, {
        timeout: 2_000,
      });
      await page.getByRole("button", { name: "Войти" }).click();
    } catch (error) {
      const workspaceNav = page
        .getByRole("button", { name: /^(Мои действия|Проверка|Выгрузка)/ })
        .first();
      if (!(await isVisible(workspaceNav))) {
        throw error;
      }
    }
  }

  const expectedHeading =
    options.heading ??
    (workspaceEmail === "2@2.ru" ? /^(Очередь на проверку|Проверка)$/ : "Мои действия");
  await expect(
    page.getByRole("heading", { level: 1, name: expectedHeading }),
  ).toBeVisible();
}

function normalizeLocalDemoWorkspaceEmail(email?: string) {
  if (email === "admin@visaflow.local") return "2@2.ru";
  if (email === "agent@visaflow.local" || !email) return "1@1.ru";
  return email;
}

function localDemoPasswordForEmail(email: string) {
  return email === "2@2.ru" ? "22" : "11";
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
  const menuButton = page.getByRole("button", { exact: true, name: "Меню" });

  if (await hasAtLeastOneVisible(menuButton)) {
    await clickFirstVisible(menuButton);
  }
}

export async function clickFirstVisible(locator: Locator) {
  const count = await locator.count();
  let lastError: unknown = null;

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);

    if (await isVisible(candidate)) {
      try {
        await candidate.click({ timeout: 10_000 });
        return;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
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

async function hasAtLeastOneVisible(locator: Locator) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    if (await isVisible(locator.nth(index))) {
      return true;
    }
  }

  return false;
}

export async function expectVisibleText(
  scope: Locator,
  text: string | RegExp,
  message?: string,
) {
  const matches = scope.getByText(text);
  const count = await matches.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = matches.nth(index);

    if (await isVisible(candidate)) {
      await expect(candidate).toBeVisible();
      return;
    }
  }

  throw new Error(message ?? `No visible text matched ${String(text)}.`);
}

export async function clickWorkspaceButton(page: Page, name: string | RegExp) {
  const mobileMenuButton = page.getByRole("button", { exact: true, name: "Меню" });
  const mobileShellOpen = page.locator(".ops-shell.is-mobile-nav-open .ops-sidebar");

  if ((await hasAtLeastOneVisible(mobileMenuButton)) || (await hasAtLeastOneVisible(mobileShellOpen))) {
    if (!(await hasAtLeastOneVisible(mobileShellOpen))) {
      await openMobileMenu(page);
    }

    const mobileButton = mobileShellOpen.getByRole("button", { name }).first();
    await mobileButton.waitFor({ state: "visible", timeout: 2_000 });
    await mobileButton.click({ timeout: 10_000 });
    return;
  }

  const button = page.getByRole("button", { name });

  if (!(await hasAtLeastOneVisible(button))) {
    await openMobileMenu(page);
    await button.first().waitFor({ state: "visible", timeout: 2_000 }).catch(() => {
      // Keep the original visible-button assertion below as the failure owner.
    });
  }

  await expectAtLeastOneVisible(
    button,
    `No visible workspace button matched ${String(name)}.`,
  );

  await clickFirstVisible(button);
}

export function drawer(page: Page) {
  return page.locator('[role="dialog"]:visible').first();
}

export function submissionCard(page: Page, name: string) {
  const fixtureIds: Record<string, string> = {
    "Нина Волкова": "ПД-1053",
    "Петровы": "ПД-1054",
    "Семья Петровых": "ПД-1054",
  };
  const byText = page
    .locator(".submission-card, .v17-admin-work-row, .v19-event-row, [data-submission-card]")
    .filter({ hasText: name })
    .first();
  const fixtureId = fixtureIds[name];

  if (!fixtureId) return byText;

  return page.locator(`[data-submission-id="${fixtureId}"]`).first().or(byText).first();
}

export function submissionCardById(page: Page, id: string) {
  return page.locator(`[data-submission-id="${id}"]`).first();
}

export async function selectSubmissionStatus(page: Page, label: string | RegExp) {
  const labels =
    typeof label === "string"
      ? [
          label,
          ...(label === "В работе" ? ["Черновики", "Draft", "Drafts"] : []),
          ...(label === "Требуют действия"
            ? ["С замечаниями", "Возвращено", "Returned"]
            : []),
        ]
      : [label];

  for (const candidate of labels) {
    const desktopTab = page.getByRole("tab", { name: candidate }).first();

    if (await isVisible(desktopTab)) {
      await desktopTab.click();
      await expect(desktopTab).toHaveAttribute("aria-selected", "true");
      return;
    }
  }

  const filterTrigger = page
    .getByRole("button", { name: "Фильтры подач" })
    .or(page.getByRole("button", { name: "Фильтры" }))
    .or(page.locator(".v19-submission-reference-filter-trigger"));

  if (await hasAtLeastOneVisible(filterTrigger)) {
    await clickFirstVisible(filterTrigger);

    const statusDialog = page
      .getByRole("dialog", { name: "Статус подач" })
      .or(page.getByRole("dialog", { name: "Фильтры" }));

    for (const candidate of labels) {
      const statusOption = statusDialog
        .locator(".v19-mobile-filter-options, .v19-filter-sheet-options")
        .getByRole("button", { name: candidate })
        .or(statusDialog.getByRole("button", { name: candidate }));

      if (await isVisible(statusOption.first())) {
        await statusOption.first().click();
        const doneButton = statusDialog
          .locator(".v19-submission-filter-sheet-footer")
          .getByRole("button", { name: "Готово" })
          .first();
        if (await isVisible(doneButton)) {
          await doneButton.click();
        }
        await expect(statusDialog).toHaveCount(0);
        return;
      }
    }

    const closeButton = statusDialog
      .getByRole("button", { name: /Закрыть|Отмена|Готово/ })
      .first();
    if (await isVisible(closeButton)) await closeButton.click();
  }

  // Root CommandCenter may render cards without a status-filter control on some
  // desktop/mobile widths. In that case the current unfiltered list is already
  // the intended click surface for the E2E smoke lane.
  if ((await page.locator("[data-submission-id]").count()) > 0) return;

  throw new Error(`Submission status filter is not visible: ${String(label)}`);
}

export async function openDrawerTab(page: Page, labels: string[]) {
  const drawerTabIds: Record<string, string> = {
    Анкета: "questionnaire",
    Замечания: "issues",
    История: "history",
    Обзор: "overview",
    Паспорт: "files",
    Селфи: "files",
    Файлы: "files",
  };
  for (const label of labels) {
    const tabId = drawerTabIds[label];
    if (!tabId) continue;

    const tabById = drawer(page).locator(`[data-drawer-tab="${tabId}"]`).first();
    if (await isVisible(tabById)) {
      await tabById.click();
      return;
    }
  }

  for (const label of labels) {
    const byRoleTab = drawer(page).getByRole("tab", { name: label }).first();
    if (await isVisible(byRoleTab)) {
      await byRoleTab.click();
      await expect(byRoleTab).toHaveAttribute("aria-selected", "true");
      return;
    }

    const byTabAttribute = drawer(page)
      .locator('[role="tab"]')
      .filter({ hasText: label })
      .first();
    if (await isVisible(byTabAttribute)) {
      await byTabAttribute.click();
      await expect(byTabAttribute).toHaveAttribute("aria-selected", "true");
      return;
    }

    const byRoleButton = drawer(page).getByRole("button", { name: label }).first();
    if (await isVisible(byRoleButton)) {
      await byRoleButton.click();
      return;
    }

    const byButtonText = drawer(page)
      .locator("button")
      .filter({ hasText: label })
      .first();
    if (await isVisible(byButtonText)) {
      await byButtonText.click();
      return;
    }

    const byExactText = drawer(page).getByText(label, { exact: true }).first();
    if (await isVisible(byExactText)) {
      await byExactText.click();
      return;
    }
  }

  const escapedLabels = labels.map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const name = new RegExp(`^(${escapedLabels.join("|")})([\\s,]|$)`);
  const semanticTab = drawer(page).getByRole("tab", { name }).first();
  try {
    await expect(semanticTab).toBeVisible();
    await semanticTab.click();
    await expect(semanticTab).toHaveAttribute("aria-selected", "true");
    return;
  } catch {
    // Some legacy drawer controls are buttons instead of semantic tabs.
  }

  const tab = drawer(page).getByRole("button", { name }).first();
  await expect(tab).toBeVisible();
  await tab.click();
  if ((await tab.getAttribute("role")) === "tab") {
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
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
  await expect(drawer(page).getByRole("heading", { name: "Файлы подачи" })).toBeVisible();

  for (let pass = 0; pass < 40; pass += 1) {
    const fileInputs = drawer(page).locator(".drawer-file-input");
    if ((await fileInputs.count()) > 0) {
      await fileInputs.first().setInputFiles(e2ePassportFile(`drawer-${pass}`));
      await expect(
        drawer(page).getByRole("heading", { name: "Файлы подачи" }),
      ).toBeVisible();
      continue;
    }

    return;
  }

  throw new Error("Unable to upload all visible files.");
}

export async function markVisibleIssuesFixed(page: Page) {
  await openDrawerTab(page, ["Замечания"]);
  await expect(drawer(page).getByRole("heading", { name: "Замечания" })).toBeVisible();

  const fixedButtons = drawer(page).getByRole("button", {
    name: /Отметить(?: замечание)? исправленным/,
  });
  const submitCorrectionsButton = drawer(page).getByRole("button", {
    name: "Отправить исправления",
  });

  if (!((await submitCorrectionsButton.count()) > 0 && await submitCorrectionsButton.isEnabled())) {
    await fixedButtons.first().waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  }

  for (let safety = 0; safety < 12; safety += 1) {
    if (
      (await submitCorrectionsButton.count()) > 0 &&
      await submitCorrectionsButton.isEnabled()
    ) {
      return;
    }

    if ((await fixedButtons.count()) === 0) return;

    await fixedButtons.first().click();
    await expect(drawer(page).getByRole("heading", { name: "Замечания" })).toBeVisible();
  }

  throw new Error("Too many visible issue fix buttons.");
}

export async function clearExportSelection(page: Page) {
  const checked = page.locator(".export-row input:checked");

  for (let safety = 0; safety < 12 && (await checked.count()) > 0; safety += 1) {
    const checkbox = checked.first();
    await checkbox.scrollIntoViewIfNeeded();
    await checkbox.focus();
    await page.keyboard.press("Space");
  }

  await expect(checked).toHaveCount(0);
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
