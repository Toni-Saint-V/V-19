import { expect, test, type Locator } from "@playwright/test";

import {
  clickWorkspaceButton,
  collectBrowserProblems,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

type MotionRecord = {
  duration: number;
  iterations: number;
  target: string;
};

type ScrollRecord = {
  behavior: ScrollBehavior;
  target: string;
};

const maxReducedMotionDurationMs = 16;

async function installMotionRecorder(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    type MotionRecord = {
      duration: number;
      iterations: number;
      target: string;
    };
    type ScrollRecord = {
      behavior: ScrollBehavior;
      target: string;
    };
    const records: MotionRecord[] = [];
    const scrollRecords: ScrollRecord[] = [];
    (
      globalThis as unknown as {
        __v19MotionRecords: MotionRecord[];
        __v19ScrollRecords: ScrollRecord[];
      }
    ).__v19MotionRecords = records;
    (
      globalThis as unknown as {
        __v19ScrollRecords: ScrollRecord[];
      }
    ).__v19ScrollRecords = scrollRecords;

    const originalAnimate = Element.prototype.animate;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.animate = function animate(keyframes, options) {
      const normalizedOptions =
        typeof options === "number" ? { duration: options } : (options ?? {});
      records.push({
        duration: Number(normalizedOptions.duration ?? 0),
        iterations: Number(normalizedOptions.iterations ?? 1),
        target:
          this instanceof HTMLElement
            ? `${this.tagName.toLowerCase()}.${this.className}`
            : this.tagName.toLowerCase(),
      });
      return originalAnimate.call(this, keyframes, options);
    };
    Element.prototype.scrollIntoView = function scrollIntoView(arg) {
      scrollRecords.push({
        behavior: typeof arg === "object" && arg?.behavior ? arg.behavior : "auto",
        target:
          this instanceof HTMLElement
            ? `${this.tagName.toLowerCase()}.${this.className}`
            : this.tagName.toLowerCase(),
      });
      return originalScrollIntoView.call(this, arg);
    };
  });
}

async function resetMotionRecords(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const records = (
      globalThis as unknown as {
        __v19MotionRecords?: MotionRecord[];
        __v19ScrollRecords?: ScrollRecord[];
      }
    ).__v19MotionRecords;
    const scrollRecords = (
      globalThis as unknown as {
        __v19ScrollRecords?: ScrollRecord[];
      }
    ).__v19ScrollRecords;
    if (records) records.length = 0;
    if (scrollRecords) scrollRecords.length = 0;
  });
}

async function expectNoMeaningfulAnimations(
  page: import("@playwright/test").Page,
  target: Locator,
) {
  const activeAnimations = await target.evaluate(
    (element, maxDurationMs) =>
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.effect?.getComputedTiming())
        .filter((timing) => {
          if (!timing) return false;
          const duration =
            typeof timing.duration === "number"
              ? timing.duration
              : Number.parseFloat(String(timing.duration));
          const iterations = Number(timing.iterations);
          return duration > maxDurationMs || iterations > 1;
        }).length,
    maxReducedMotionDurationMs,
  );
  const recordedAnimations = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __v19MotionRecords?: MotionRecord[];
        }
      ).__v19MotionRecords ?? [],
  );
  const recordedScrolls = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __v19ScrollRecords?: ScrollRecord[];
        }
      ).__v19ScrollRecords ?? [],
  );

  expect(activeAnimations).toBe(0);
  expect(
    recordedAnimations.filter(
      ({ duration, iterations }) =>
        duration > maxReducedMotionDurationMs || iterations > 1,
    ),
  ).toEqual([]);
  expect(recordedScrolls.filter(({ behavior }) => behavior === "smooth")).toEqual([]);
}

async function expectProjectViewport(
  page: import("@playwright/test").Page,
  projectName: string,
) {
  const width = await page.evaluate(() => window.innerWidth);
  if (projectName === "mobile-chromium") {
    expect(width).toBeLessThanOrEqual(430);
  } else {
    expect(width).toBeGreaterThan(767);
  }
}

async function expectReducedScrollRecorded(page: import("@playwright/test").Page) {
  const recordedScrolls = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __v19ScrollRecords?: ScrollRecord[];
        }
      ).__v19ScrollRecords ?? [],
  );
  expect(recordedScrolls.some(({ behavior }) => behavior === "auto")).toBe(true);
}

async function configureProjectViewport(
  page: import("@playwright/test").Page,
  projectName: string,
) {
  await page.setViewportSize(
    projectName === "mobile-chromium"
      ? { height: 844, width: 390 }
      : { height: 900, width: 1440 },
  );
}

test("reduced motion keeps workspace entrance stationary", async ({ page }) => {
  const problems = collectBrowserProblems(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const samples: Array<{ inlineStyle: string; transform: string }> = [];
    (
      globalThis as unknown as {
        __v19WorkspaceMotionSamples: typeof samples;
      }
    ).__v19WorkspaceMotionSamples = samples;

    const recordWorkspaceMotion = () => {
      const surface = document.querySelector<HTMLElement>(".v19-fullscreen-app");
      if (!surface) return;

      samples.push({
        inlineStyle: surface.getAttribute("style") ?? "",
        transform: getComputedStyle(surface).transform,
      });
    };

    new MutationObserver(recordWorkspaceMotion).observe(document, {
      attributeFilter: ["style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
  });

  await openFreshWorkspace(page);
  await expect(page.locator(".v19-fullscreen-app")).toBeVisible();

  const samples = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __v19WorkspaceMotionSamples?: Array<{
            inlineStyle: string;
            transform: string;
          }>;
        }
      ).__v19WorkspaceMotionSamples ?? [],
  );

  expect(samples.length).toBeGreaterThan(0);
  expect(
    samples.some(
      ({ inlineStyle, transform }) =>
        inlineStyle.includes("translate") || (transform !== "none" && transform !== ""),
    ),
  ).toBe(false);
  expect(problems).toEqual([]);
});

test("product reduced-motion preference governs the complete agent flow", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const problems = collectBrowserProblems(page);

  await configureProjectViewport(page, testInfo.project.name);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installMotionRecorder(page);
  await openFreshWorkspace(page, {
    heading: "Мои действия",
    workspaceEmail: "agent@visaflow.local",
  });
  await expectProjectViewport(page, testInfo.project.name);

  await clickWorkspaceButton(page, /^Настройки/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Настройки" }),
  ).toBeVisible();

  const motionSwitch = page.getByRole("switch", { name: "Минимум анимации" });
  await motionSwitch.click();
  await expect(motionSwitch).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.v19ReducedMotion))
    .toBe("on");

  await page.reload();
  const workspace = page.locator(".v19-fullscreen-app");
  await expect(workspace).toHaveAttribute("data-reduced-motion", "true");
  await expectNoMeaningfulAnimations(page, workspace);

  const actions = page.locator('[data-agent-screen="actions"]');
  await expect(actions).toHaveAttribute("data-reduced-motion", "true");
  await expectNoMeaningfulAnimations(page, actions);

  await resetMotionRecords(page);
  await clickWorkspaceButton(page, /^Новая подача/);
  const create = page.getByTestId("preupload-workspace");
  await expect(create).toHaveAttribute("data-reduced-motion", "true");
  await expect(create.locator(".v19-preupload-scan-line")).toHaveCount(0);
  await expectNoMeaningfulAnimations(page, create);

  await resetMotionRecords(page);
  await clickWorkspaceButton(page, /^Мои подачи/);
  const submissions = page.locator(
    '[data-agent-screen="submissions"] .v19-agent-shared-screen',
  );
  await expect(submissions).toHaveAttribute("data-reduced-motion", "true");
  await expectNoMeaningfulAnimations(page, submissions);

  await resetMotionRecords(page);
  const submissionCard = page.locator(".v19-agent-shared-card").first();
  await submissionCard.focus();
  await expect(submissionCard).toBeFocused();
  await submissionCard.press("Enter");

  const drawer = page.locator('.v19-submission-drawer[role="dialog"]');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("data-reduced-motion", "true");
  await expectNoMeaningfulAnimations(page, drawer);

  await resetMotionRecords(page);
  await drawer.getByRole("tab", { exact: true, name: "Анкета" }).click();
  await expect(
    drawer.getByRole("tab", { exact: true, name: "Анкета" }),
  ).toHaveAttribute("aria-selected", "true");
  await expectNoMeaningfulAnimations(page, drawer);

  await resetMotionRecords(page);
  await drawer.getByRole("button", { name: "Открыть анкету" }).first().click();

  const questionnaire = page.locator(".vf-figma-questionnaire-screen");
  await expect(questionnaire).toHaveAttribute("data-reduced-motion", "true");
  await expect(
    questionnaire.locator(".v19-questionnaire-progress-shimmer"),
  ).toHaveCount(0);
  await expectNoMeaningfulAnimations(page, questionnaire);

  await resetMotionRecords(page);
  const passportSection = questionnaire
    .getByRole("group", { name: "Разделы анкеты" })
    .first()
    .getByRole("button", { name: /Паспорт/ });
  await passportSection.click();
  await expect(passportSection).toHaveAttribute("aria-pressed", "true");
  await expectNoMeaningfulAnimations(page, questionnaire);
  await expectReducedScrollRecorded(page);
  expect(problems).toEqual([]);
});

test("product reduced-motion preference governs admin review overlays", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const problems = collectBrowserProblems(page);

  await configureProjectViewport(page, testInfo.project.name);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installMotionRecorder(page);
  await openFreshWorkspace(page, {
    heading: /^(Очередь на проверку|Проверка)$/,
    workspaceEmail: "admin@visaflow.local",
  });
  await expectProjectViewport(page, testInfo.project.name);

  await clickWorkspaceButton(page, /^Настройки/);
  const motionSwitch = page.getByRole("switch", { name: "Минимум анимации" });
  await motionSwitch.click();
  await expect(motionSwitch).toHaveAttribute("aria-checked", "true");

  await page.reload();
  const workspace = page.locator(".v19-fullscreen-app");
  await expect(workspace).toHaveAttribute("data-reduced-motion", "true");
  await expectNoMeaningfulAnimations(page, workspace);

  await resetMotionRecords(page);
  await clickWorkspaceButton(page, /^(Проверка|Работа)/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Очередь на проверку|Проверка)$/,
    }),
  ).toBeVisible();

  await resetMotionRecords(page);
  await page
    .getByRole("button", { name: "Ручная проверка заявки Нина Волкова" })
    .first()
    .click();
  const reviewWorkspace = page.getByRole("dialog", { name: "Сверка паспорта" });
  await expect(reviewWorkspace).toHaveAttribute("data-reduced-motion", "true");
  await expectNoMeaningfulAnimations(page, reviewWorkspace);

  await resetMotionRecords(page);
  await reviewWorkspace
    .getByRole("button", { name: "Добавить замечание: Номер паспорта" })
    .click();
  const remarkDialog = page.getByRole("dialog", { name: "Добавить замечание" });
  await expect(remarkDialog).toHaveAttribute("data-reduced-motion", "true");
  await expectNoMeaningfulAnimations(page, remarkDialog);
  expect(problems).toEqual([]);
});
