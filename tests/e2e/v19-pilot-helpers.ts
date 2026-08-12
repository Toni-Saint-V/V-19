import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  questionnaireFixturePreferredOption,
  questionnaireFixtureTextValue,
} from "../e2e-supabase-ui/questionnaire-fixture-values";

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
  options: { heading?: RegExp | string; workspaceEmail?: string } = {},
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
  await expect(switchToLogin).toBeVisible({ timeout: 5_000 });
  await switchToLogin.click();

  const emailField = page.locator("#workspace-email");
  await expect(emailField).toBeVisible({ timeout: 5_000 });
  await emailField.fill(workspaceEmail);
  await page.locator("#workspace-password").fill(workspacePassword);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();

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

export async function fillRequiredQuestionnaireAndExit(
  page: Page,
  runId: string,
  expectedApplicantNames?: readonly string[],
) {
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  if (!(await isVisible(questionnaire))) {
    const open = drawer(page).getByRole("button", { name: "Открыть анкету" }).first();
    await expect(open).toBeVisible();
    await open.click();
    await expect(questionnaire).toBeVisible();
  }

  const submissionId = await questionnaire.getAttribute("data-submission-id");
  if (!submissionId) {
    throw new Error("Questionnaire did not expose the active submission id.");
  }

  const applicants = questionnaire.locator(".v19-questionnaire-applicant-tab");
  const applicantCount = Math.max(await applicants.count(), 1);
  const touristSwitcher = questionnaire.getByRole("combobox", {
    name: "Выбрать туриста",
  });
  let requiredFieldCount = 0;

  for (let applicantIndex = 0; applicantIndex < applicantCount; applicantIndex += 1) {
    if (applicantIndex > 0) {
      await expect(touristSwitcher).toBeVisible();
      await touristSwitcher.click();
      const touristOptions = page
        .getByRole("listbox", { name: "Выбрать туриста" })
        .getByRole("option");
      await expect(touristOptions).toHaveCount(applicantCount);
      await touristOptions.nth(applicantIndex).click();
      await expect(applicants.nth(applicantIndex)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }

    const sections = questionnaire.locator(
      ".v19-questionnaire-section-list--sidebar .v19-questionnaire-section-tab:visible",
    );
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThan(0);

    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      await sections.nth(sectionIndex).click();
      await expect(sections.nth(sectionIndex)).toHaveAttribute("aria-pressed", "true");
      const sectionLabel = (await sections.nth(sectionIndex).innerText())
        .replace(/\s+/g, " ")
        .trim();
      const fields = questionnaire.locator(
        ".v19-questionnaire-work-panel [data-field-label]",
      );
      const fieldLabels = await fields.evaluateAll((elements) =>
        elements
          .map(
            (element) =>
              (element as unknown as { dataset?: { fieldLabel?: string } }).dataset
                ?.fieldLabel ?? "",
          )
          .filter(Boolean),
      );

      for (const label of fieldLabels) {
        const escapedLabel = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const field = questionnaire
          .locator(`.v19-questionnaire-work-panel [data-field-label="${escapedLabel}"]`)
          .first();
        const requiredControl = field.locator('[aria-required="true"]').first();
        if ((await requiredControl.count()) === 0) continue;
        requiredFieldCount += 1;

        const textControl = field
          .locator("input:not([readonly]), textarea:not([readonly])")
          .first();
        if (await isVisible(textControl)) {
          const expectedName = expectedApplicantNames?.[applicantIndex]
            ?.trim()
            .split(/\s+/)
            .filter(Boolean);
          const expectedIdentityValue =
            label === "Фамилия" && expectedName?.length
              ? expectedName[0]!
              : label === "Имя" && expectedName?.length
                ? expectedName.slice(1).join(" ") || "Заявитель"
                : null;
          if (
            expectedIdentityValue !== null ||
            !(await textControl.inputValue()).trim()
          ) {
            const fieldValue =
              expectedIdentityValue ??
              (label === "С какого числа"
                ? "01.12.2026"
                : label === "По какое число"
                  ? "08.12.2026"
                  : questionnaireFixtureTextValue(
                      label,
                      runId,
                      requiredFieldCount,
                      sectionLabel,
                    ));
            await textControl.fill(fieldValue);
          }
        } else {
          const preferredOption = questionnaireFixturePreferredOption(label);
          const quickOptions = field.locator("button.v19-questionnaire-quick-option");
          const quickOption = preferredOption
            ? quickOptions.getByText(preferredOption, { exact: true })
            : quickOptions.first();

          if (await isVisible(quickOption)) {
            if ((await field.locator('button[aria-pressed="true"]').count()) === 0) {
              await quickOption.click();
            }
          } else {
            const dropdown = field
              .locator("button.v19-questionnaire-field-control")
              .first();
            if (await isVisible(dropdown)) {
              const currentValue = (await dropdown.innerText()).trim();
              if (currentValue.includes("Выберите")) {
                await dropdown.click();
                const options = questionnaire.locator(
                  ".v19-questionnaire-dropdown:visible .v19-questionnaire-dropdown-option",
                );
                const option = preferredOption
                  ? options.getByText(preferredOption, { exact: true })
                  : options.first();
                await option.click();
              }
            }
          }
        }

        const confirmReview = field
          .getByRole("button", { name: /^Подтвердить поле:/ })
          .first();
        if (await isVisible(confirmReview)) await confirmReview.click();
      }
    }

    if (applicantIndex === 0 && applicantCount > 1) {
      const copyShared = questionnaire.getByRole("button", {
        name: "Копировать для всех",
      });
      if (await isVisible(copyShared)) {
        await copyShared.click();
        const confirmCopy = questionnaire.getByRole("button", {
          name: "Подтвердить копирование",
        });
        await expect(confirmCopy).toBeVisible();
        await confirmCopy.click();
      }
    }
  }

  expect(requiredFieldCount).toBeGreaterThan(0);
  await questionnaire
    .getByRole("button", { name: "Сохранить и выйти", exact: true })
    .first()
    .click();
  await expect(questionnaire).toHaveCount(0);
  return submissionId;
}

function mobileMenuTrigger(page: Page) {
  return page.getByRole("button", { exact: true, name: "Меню" }).or(
    page.getByRole("button", {
      exact: true,
      name: "Открыть меню администратора",
    }),
  );
}

export async function openMobileMenu(page: Page) {
  const menuButton = mobileMenuTrigger(page);

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

async function waitForStableInViewport(locator: Locator) {
  let previousBox: Awaited<ReturnType<Locator["boundingBox"]>> = null;

  await expect
    .poll(
      async () => {
        const nextBox = await locator.boundingBox().catch(() => null);
        const isStable = Boolean(
          nextBox &&
          previousBox &&
          Math.abs(nextBox.x - previousBox.x) < 0.5 &&
          Math.abs(nextBox.y - previousBox.y) < 0.5 &&
          Math.abs(nextBox.width - previousBox.width) < 0.5 &&
          Math.abs(nextBox.height - previousBox.height) < 0.5,
        );
        previousBox = nextBox;
        return isStable;
      },
      { timeout: 2_000 },
    )
    .toBe(true);
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
  const mobileMenuButton = mobileMenuTrigger(page);
  const mobileNavigation = page
    .locator(".ops-shell.is-mobile-nav-open .ops-sidebar")
    .or(page.getByRole("dialog", { exact: true, name: "Меню администратора" }))
    .or(page.getByRole("dialog", { exact: true, name: "Меню агента" }));

  if (
    (await hasAtLeastOneVisible(mobileMenuButton)) ||
    (await hasAtLeastOneVisible(mobileNavigation))
  ) {
    if (!(await hasAtLeastOneVisible(mobileNavigation))) {
      await openMobileMenu(page);
    }

    const mobileButton = mobileNavigation.getByRole("button", { name }).first();
    await mobileButton.waitFor({ state: "visible", timeout: 2_000 });
    await expect(mobileButton).toBeInViewport({ timeout: 2_000 });
    await waitForStableInViewport(mobileButton);
    await mobileButton.click({ timeout: 10_000 });
    await mobileNavigation.waitFor({ state: "hidden", timeout: 2_000 });
    return;
  }

  const button = page.getByRole("button", { name });

  if (!(await hasAtLeastOneVisible(button))) {
    await openMobileMenu(page);
    await button
      .first()
      .waitFor({ state: "visible", timeout: 2_000 })
      .catch(() => {
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
    Петровы: "ПД-1054",
    "Семья Петровых": "ПД-1054",
  };
  const byText = page
    .locator(
      ".submission-card, .v17-admin-work-row, .v19-event-row, [data-submission-card]",
    )
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
    Заявители: "applicants",
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

    const activeDrawer = drawer(page);
    const adminReviewTab = activeDrawer.locator(`#admin-review-tab-${tabId}`).first();
    if (await isVisible(adminReviewTab)) {
      await adminReviewTab.click();
      await expect(adminReviewTab).toHaveAttribute("aria-selected", "true");
      return;
    }

    // The active AdminReviewDrawer keeps secondary sections in the explicit
    // mobile "Ещё" menu instead of leaving an off-screen tab strip.
    if ((await adminReviewTab.count()) > 0) {
      const more = activeDrawer.getByRole("button", { name: "Ещё", exact: true });
      if (await isVisible(more)) {
        await more.click();
        const menu = activeDrawer.locator(".admin-review-mobile-tabs-menu").first();
        await expect(menu).toBeVisible();
        const menuItem = menu.locator("button").filter({ hasText: label }).first();
        await expect(menuItem).toBeVisible();
        await menuItem.click();
        await expect(adminReviewTab).toHaveAttribute("aria-selected", "true");
        return;
      }
    }

    const legacyTab = activeDrawer.locator(`[data-drawer-tab="${tabId}"]`).first();
    if (await isVisible(legacyTab)) {
      await legacyTab.click();
      if ((await legacyTab.getAttribute("role")) === "tab") {
        await expect(legacyTab).toHaveAttribute("aria-selected", "true");
      }
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

  const mobileMore = drawer(page).getByRole("button", {
    name: "Ещё",
    exact: true,
  });
  if (await isVisible(mobileMore)) {
    await mobileMore.click();
    const menu = drawer(page).locator(".admin-review-mobile-tabs-menu").first();
    await expect(menu).toBeVisible();

    for (const label of labels) {
      const menuItem = menu.locator("button").filter({ hasText: label }).first();
      if (await isVisible(menuItem)) {
        await menuItem.click();
        return;
      }
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
  const jpeg = readFileSync(
    new URL("../../src/assets/export-demo/selfie_2.jpg", import.meta.url),
  );
  return {
    // The marker makes every tourist upload byte-distinct while preserving a
    // browser-decodable JPEG. IndexedDB/readback assertions bind the preview to
    // this exact payload instead of a shared canned image.
    buffer: Buffer.concat([jpeg, Buffer.from(`\nV19-E2E:${name}`, "utf8")]),
    mimeType: "image/jpeg",
    name: `e2e-passport-${name}.jpg`,
  };
}

export async function uploadAllVisibleFiles(page: Page) {
  await expect(
    drawer(page).getByRole("heading", { name: "Файлы подачи" }),
  ).toBeVisible();

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

export async function uploadAllAgentDrawerChecklistFiles(page: Page) {
  const checklist = drawer(page).getByRole("heading", {
    name: "Чеклист документов",
  });
  await expect(checklist).toBeVisible();

  for (let pass = 0; pass < 40; pass += 1) {
    const uploadRows = drawer(page).locator(
      ".v19-agent-drawer-document-row.is-actionable",
    );
    const remaining = await uploadRows.count();
    if (remaining === 0) return;

    const chooserPromise = page.waitForEvent("filechooser");
    await uploadRows.first().click();
    const chooser = await chooserPromise;
    await chooser.setFiles(e2ePassportFile(`agent-drawer-checklist-${pass}`));
    await expect(uploadRows).toHaveCount(remaining - 1);
  }

  throw new Error("Unable to upload all agent drawer checklist files.");
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

  if (
    !(
      (await submitCorrectionsButton.count()) > 0 &&
      (await submitCorrectionsButton.isEnabled())
    )
  ) {
    await fixedButtons
      .first()
      .waitFor({ state: "visible", timeout: 2000 })
      .catch(() => {});
  }

  for (let safety = 0; safety < 12; safety += 1) {
    if (
      (await submitCorrectionsButton.count()) > 0 &&
      (await submitCorrectionsButton.isEnabled())
    ) {
      return;
    }

    if ((await fixedButtons.count()) === 0) return;

    await fixedButtons.first().click();
    await expect(
      drawer(page).getByRole("heading", { name: "Замечания" }),
    ).toBeVisible();
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
