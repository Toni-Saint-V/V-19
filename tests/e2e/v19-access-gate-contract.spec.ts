import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const accessViewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
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

      const shell = page.locator(".access-shell");
      await expect(shell).toHaveAttribute("data-access-mode", "register");
      await expect(shell.locator(".access-brand-product")).toContainText(
        "VisaFlow V-19",
      );
      const trustCue = shell.locator(".access-brand-trust");
      await expect(trustCue).toHaveText(
        "Доступ к кабинету подтверждает администратор",
      );
      await expect(trustCue).toBeVisible();

      if (viewport.width <= 760) {
        await expect(shell.locator(".access-brand-title")).toBeHidden();
      } else {
        await expect(shell.locator(".access-brand-title")).toBeVisible();
      }

      const metrics = await shell.evaluate((shellElement) => {
        const card = shellElement.querySelector<HTMLElement>(".access-card");
        const logo = shellElement.querySelector<HTMLElement>(".access-brand-logo");
        const submit = shellElement.querySelector<HTMLElement>(".access-submit");
        const firstInput =
          shellElement.querySelector<HTMLElement>(".access-field input");
        const controls = Array.from(
          shellElement.querySelectorAll<HTMLElement>(
            ".access-card input, .access-card button",
          ),
        );

        return {
          cardLeft: card?.getBoundingClientRect().left ?? -1,
          controlHeights: controls.map(
            (control) => control.getBoundingClientRect().height,
          ),
          firstInputTop:
            firstInput?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
          logoHeight: logo?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          shellScrollable: shellElement.scrollHeight > shellElement.clientHeight,
          submitBottom:
            submit?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
        };
      });

      expect(
        metrics.overflowX,
        `${viewport.width}px has no page overflow`,
      ).toBeLessThanOrEqual(0);
      const minimumControlHeight = viewport.width <= 760 ? 44 : 40;
      expect(
        Math.min(...metrics.controlHeights),
        `${viewport.width}px controls keep a ${minimumControlHeight}px minimum target`,
      ).toBeGreaterThanOrEqual(minimumControlHeight);

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
    }
  });

  test("login validation, password reveal, and recovery remain reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Уже есть доступ? Войти" }).click();

    await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
    await expect(page.locator(".access-shell")).toHaveAttribute(
      "data-access-mode",
      "login",
    );
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
    await expect(page.locator(".access-shell")).toHaveAttribute(
      "data-access-mode",
      "reset",
    );
    await page.getByRole("button", { name: "Вернуться ко входу" }).click();
    await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include(".access-shell")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
