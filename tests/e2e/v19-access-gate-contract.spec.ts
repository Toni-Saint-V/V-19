import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const accessViewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 760, height: 1024 },
  { width: 761, height: 1024 },
  { width: 768, height: 1024 },
  { width: 1023, height: 1024 },
  { width: 1024, height: 1024 },
  { width: 1439, height: 1024 },
  { width: 1440, height: 900 },
];

test.describe("V-19 access gate contract", () => {
  test("registration keeps its hierarchy and controls usable across viewports", async ({
    page,
  }) => {
    for (const viewport of accessViewports) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Заявка на доступ" }),
      ).toBeVisible();

      const metrics = await page.locator(".access-shell").evaluate((shell) => {
        const card = shell.querySelector<HTMLElement>(".access-card");
        const logo = shell.querySelector<HTMLElement>(".access-brand-logo");
        const submit = shell.querySelector<HTMLElement>(".access-submit");
        const firstInput = shell.querySelector<HTMLElement>(".access-field input");
        const controls = Array.from(
          shell.querySelectorAll<HTMLElement>(
            ".access-card input, .access-card button",
          ),
        );
        const cardBounds = card?.getBoundingClientRect();
        const logoBounds = logo?.getBoundingClientRect();
        const logoCardOverlapArea =
          cardBounds && logoBounds
            ? Math.max(
                0,
                Math.min(cardBounds.right, logoBounds.right) -
                  Math.max(cardBounds.left, logoBounds.left),
              ) *
              Math.max(
                0,
                Math.min(cardBounds.bottom, logoBounds.bottom) -
                  Math.max(cardBounds.top, logoBounds.top),
              )
            : Number.POSITIVE_INFINITY;

        return {
          cardLeft: card?.getBoundingClientRect().left ?? -1,
          controlHeights: controls.map(
            (control) => control.getBoundingClientRect().height,
          ),
          firstInputTop:
            firstInput?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
          logoHeight: logo?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
          logoCardOverlapArea,
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          shellScrollable: shell.scrollHeight > shell.clientHeight,
          submitBottom:
            submit?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
        };
      });

      expect(
        metrics.overflowX,
        `${viewport.width}px has no page overflow`,
      ).toBeLessThanOrEqual(0);
      expect(
        Math.min(...metrics.controlHeights),
        `${viewport.width}px controls keep a 40px minimum target`,
      ).toBeGreaterThanOrEqual(40);

      if (viewport.width <= 430) {
        expect(
          metrics.cardLeft,
          `${viewport.width}px keeps a safe inset`,
        ).toBeGreaterThanOrEqual(16);
        expect(
          metrics.logoHeight,
          `${viewport.width}px uses the compact brand`,
        ).toBeLessThanOrEqual(96);
        expect(
          metrics.firstInputTop,
          `${viewport.width}px shows primary form content in the first viewport`,
        ).toBeLessThan(viewport.height);
      }

      if (viewport.width === 320) {
        expect(
          metrics.shellScrollable,
          "short mobile viewport remains intentionally scrollable",
        ).toBe(true);
        await page
          .getByRole("button", { name: "Подать заявку на доступ" })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("button", { name: "Подать заявку на доступ" }),
        ).toBeVisible();
      }

      if (viewport.width >= 390 && viewport.width <= 430) {
        expect(
          metrics.submitBottom,
          `${viewport.width}px keeps the primary CTA in the first viewport`,
        ).toBeLessThanOrEqual(viewport.height);
      }

      if ([760, 761, 768, 1023, 1024, 1439, 1440].includes(viewport.width)) {
        expect(
          metrics.logoCardOverlapArea,
          `${viewport.width}px keeps the brand mark outside the form card`,
        ).toBe(0);
      }
    }
  });

  test("registration validation moves focus to its first invalid field", async ({
    page,
  }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "Подать заявку на доступ" }).click();

    const fullName = page.getByLabel("Имя и фамилия");
    await expect(fullName).toHaveAttribute("aria-invalid", "true");
    await expect(fullName).toBeFocused();

    await fullName.fill("Анна Петрова");
    await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
    await expect(page.getByLabel("Агентство / компания")).toBeFocused();
    expect(runtimeErrors).toEqual([]);
  });

  test("login validation, password reveal, and recovery remain reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();

    await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
    const loginButton = page.getByRole("button", { name: "Войти в кабинет" });
    await loginButton.click();
    await expect(page.getByRole("alert")).toHaveText("Введите корректный email");

    await page.getByLabel("Email").fill("agent@example.test");
    await page.getByLabel("Пароль", { exact: true }).fill("local-password");
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );

    const primaryBackground = await loginButton.evaluate(
      (button) => window.getComputedStyle(button).backgroundColor,
    );
    expect(primaryBackground).not.toBe("rgb(0, 0, 0)");

    await page.getByRole("button", { name: "Не помню пароль" }).click();
    await expect(
      page.getByRole("heading", { name: "Восстановление доступа" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Вернуться ко входу" }).click();
    await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include(".access-shell")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
