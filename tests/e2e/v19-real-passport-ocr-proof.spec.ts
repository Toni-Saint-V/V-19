import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clickFirstVisible,
  collectBrowserProblems,
  expectAtLeastOneVisible,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const realPassportPath = "/Users/user/Desktop/passport.jpeg";
const qaDir = path.join(process.cwd(), "docs/qa/passport-ai-hints-20260706");
const intakeDraftStorageKey = "visaflow.v19.productIntakeDrafts.v1";

type StoredIntakeDraft = {
  applicants?: Array<{
    fields?: {
      birthDate?: unknown;
      firstName?: unknown;
      passportExpiresAt?: unknown;
      passportNo?: unknown;
      surname?: unknown;
    };
  }>;
};

test.describe("V-19 real passport OCR proof", () => {
  test("agent uploads the provided passport photo and sees extracted fields in the create flow", async ({
    page,
  }, testInfo) => {
    test.setTimeout(140_000);
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    const createButton = page.getByRole("button", {
      name: /^(Создать пакет|Новая подача)$/,
    });
    await expectAtLeastOneVisible(createButton, "No visible create button matched.");
    await clickFirstVisible(createButton);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Загрузка и первичная сборка",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Один 1 заявитель" }).click();
    await page.locator('input[type="file"]').setInputFiles(realPassportPath);

    await expect(page.getByText("passport.jpeg").first()).toBeVisible();
    await expect(page.getByText("Распознано").first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("VOLKOV")).toBeVisible();
    await expect(page.getByText("ANTON")).toBeVisible();
    await expect(page.getByText("752869613")).toBeVisible();
    await expect(page.getByText("20.08.1990")).toBeVisible();
    await expect(page.getByText("26.02.2026")).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const runtime = globalThis as unknown as {
            document: { documentElement: { scrollWidth: number } };
            window: { innerWidth: number };
          };

          return (
            runtime.document.documentElement.scrollWidth <= runtime.window.innerWidth
          );
        }),
      )
      .toBe(true);
    mkdirSync(qaDir, { recursive: true });
    await page.screenshot({
      path: path.join(
        qaDir,
        `create-passport-ai-intake-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });

    await expect(page.getByRole("button", { name: "Перейти в анкету" })).toBeEnabled();
    await page.getByRole("button", { name: "Перейти в анкету" }).click();
    await expect(page.getByRole("heading", { name: /Анкета|VOLKOV|Schengen/ })).toBeVisible();

    await expect
      .poll(
        async () =>
          page.evaluate((storageKey) => {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return null;

            const drafts = JSON.parse(raw) as StoredIntakeDraft[];
            const fields = drafts[0]?.applicants?.[0]?.fields;

            return {
              birthDate: fields?.birthDate,
              firstName: fields?.firstName,
              passportExpiry: fields?.passportExpiresAt,
              passportNo: fields?.passportNo,
              surname: fields?.surname,
            };
          }, intakeDraftStorageKey),
        { timeout: 10_000 },
      )
      .toMatchObject({
        birthDate: "20.08.1990",
        firstName: "ANTON",
        passportExpiry: "26.02.2026",
        passportNo: "752869613",
        surname: "VOLKOV",
      });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
