import { expect, test } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  drawer,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const realPassportPath = "/Users/user/Desktop/passport.jpeg";

test.describe("V-19 real passport OCR proof", () => {
  test("agent uploads the provided passport photo and sees extracted fields in the create flow", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    await clickWorkspaceButton(page, /Мои подачи/);
    await page.getByRole("button", { name: /^(Создать пакет|Новая подача)$/ }).first().click();
    await expect(drawer(page)).toBeVisible();

    await drawer(page).locator(".pi-file-input").setInputFiles(realPassportPath);
    await expect(drawer(page).getByText("Паспорт принят").first()).toBeVisible({
      timeout: 60_000,
    });

    await expect(drawer(page).getByRole("button", { name: "Продолжить" })).toBeEnabled();
    await drawer(page).getByRole("button", { name: "Продолжить" }).click();
    await expect(drawer(page).getByText("Извлечённые данные паспорта")).toBeVisible();

    const extractedValues = await drawer(page)
      .locator(".ef-preview input")
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as unknown as { value: string }).value.trim()),
      );
    expect(extractedValues).toEqual(
      expect.arrayContaining([
        "VOLKOV",
        "ANTON",
        "752869613",
        "20.08.1990",
        "26.02.2026",
      ]),
    );
    await expect(drawer(page).getByText(/предварительным/)).toBeVisible();

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
