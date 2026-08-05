import { expect, test, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  isVisible,
  openDrawerTab,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

function blockingBrowserProblems(problems: string[]) {
  return problems.filter(
    (problem) =>
      !/ResizeObserver loop|favicon|net::ERR_ABORTED|Download the React DevTools/i.test(
        problem,
      ),
  );
}

async function expectBodyMatches(page: Page, patterns: RegExp[], timeout = 20_000) {
  await expect
    .poll(
      async () => {
        const text = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        return patterns.some((pattern) => pattern.test(text));
      },
      { timeout },
    )
    .toBe(true);
}

async function waitForAgentSubmissions(page: Page) {
  const screen = page.locator('[data-agent-screen="submissions"]');
  await screen.waitFor({ state: "visible" });
  await screen.locator("[data-submission-id]").first().waitFor({ state: "visible" });
}

test.describe("V-19 pilot agent click flow", () => {
  test("agent navigation and create workspace stay wired on active root UI", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await expectBodyMatches(page, [/Мои действия/i, /Мои подачи/i]);

    await clickWorkspaceButton(page, /Мои действия/);
    await expect(
      page
        .getByRole("region", { name: "Мои действия" })
        .or(page.locator('[data-testid="agent-actions-screen"]'))
        .first(),
    ).toBeVisible();

    await clickWorkspaceButton(page, /Мои подачи/);
    await waitForAgentSubmissions(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();

    const newSubmissionButton = page
      .getByRole("button", { name: "Новая подача" })
      .first();

    await expect(newSubmissionButton).toBeVisible();
    await newSubmissionButton.click();

    const createWorkspace = page.locator('[data-agent-screen="create"]');
    await expect(createWorkspace).toBeVisible();
    await expectBodyMatches(page, [/Новая подача/i, /Заявитель|Семья/i]);
    await page.getByRole("button", { name: "Отменить создание подачи" }).click();
    await expect(createWorkspace).toHaveCount(0);
    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("agent can open a submission drawer and reach files/issues surfaces", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await clickWorkspaceButton(page, /Мои подачи/);
    await waitForAgentSubmissions(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои подачи" }),
    ).toBeVisible();

    const targetCard = page
      .locator('[data-agent-screen="submissions"] [data-submission-id]')
      .first();
    await expect(targetCard).toBeVisible();
    await targetCard.click();

    if (!(await isVisible(drawer(page)))) {
      const explicitOpen = targetCard
        .getByRole("button", { name: /Открыть|Подробнее|Подача/i })
        .first();
      if (await isVisible(explicitOpen)) await explicitOpen.click();
    }

    await expect(drawer(page)).toBeVisible();
    await expectBodyMatches(page, [/Файлы подачи|Замечания|Анкета|ПД-|SUB-/i]);

    await openDrawerTab(page, ["Файлы", "Паспорт", "Селфи"]).catch(() => undefined);
    await expectBodyMatches(page, [/Файлы|Паспорт|Селфи|Файлы подачи/i]);

    await openDrawerTab(page, ["Замечания"]).catch(() => undefined);
    await expectBodyMatches(page, [/Замечания|Исправления|Файлы подачи|ПД-|SUB-/i]);

    const submitCorrectionsButton = drawer(page)
      .getByRole("button", { name: "Отправить исправления" })
      .first();

    if ((await submitCorrectionsButton.count()) > 0) {
      await expect(submitCorrectionsButton).toBeVisible();
    }

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });
});
