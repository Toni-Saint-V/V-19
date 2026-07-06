import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clickFirstVisible,
  collectBrowserProblems,
  drawer,
  expectAtLeastOneVisible,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const realPassportPath = "/Users/user/Desktop/passport.jpeg";
const qaDir = path.join(process.cwd(), "docs/qa/passport-ai-hints-20260706");
const submissionsStorageKey = "visaflow.v19.submissions.v1";

type StoredQuestionnaireField = {
  id?: unknown;
  reviewSource?: unknown;
  reviewState?: unknown;
  value?: unknown;
};

type StoredSubmission = {
  applicants?: Array<{
    sections?: Array<{
      fields?: StoredQuestionnaireField[];
    }>;
  }>;
};

test.describe("V-19 real passport OCR proof", () => {
  test("agent uploads the provided passport photo and sees extracted fields in the create flow", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, { heading: "Мои действия" });
    const createButton = page.getByRole("button", {
      name: /^(Создать пакет|Новая подача)$/,
    });
    await expectAtLeastOneVisible(createButton, "No visible create button matched.");
    await clickFirstVisible(createButton);
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
    await expect(drawer(page).getByLabel("AI-подсказки по подстановке")).toContainText(
      "Найдено",
    );
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
    await drawer(page).screenshot({
      path: path.join(
        qaDir,
        `create-passport-ai-hints-${testInfo.project.name}.png`,
      ),
    });

    await drawer(page).getByRole("button", { name: "Создать и открыть" }).click();
    await expect
      .poll(
        async () =>
          page.evaluate((storageKey) => {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return null;

            const submissions = JSON.parse(raw) as StoredSubmission[];
            const firstApplicant = submissions[0]?.applicants?.[0];
            const fields = new Map<string, StoredQuestionnaireField>();

            for (const section of firstApplicant?.sections ?? []) {
              for (const field of section.fields ?? []) {
                if (typeof field.id === "string") {
                  fields.set(field.id, field);
                }
              }
            }

            return {
              birthDate: fields.get("birth-date")?.value,
              firstName: fields.get("first-name")?.value,
              passportExpiry: fields.get("passport-expiry-date")?.value,
              passportNo: fields.get("passport-no")?.value,
              passportReviewSource: fields.get("passport-no")?.reviewSource,
              passportReviewState: fields.get("passport-no")?.reviewState,
              surname: fields.get("surname")?.value,
              surnameReviewSource: fields.get("surname")?.reviewSource,
              surnameReviewState: fields.get("surname")?.reviewState,
            };
          }, submissionsStorageKey),
        { timeout: 10_000 },
      )
      .toMatchObject({
        birthDate: "20.08.1990",
        firstName: "ANTON",
        passportExpiry: "26.02.2026",
        passportNo: "752869613",
        passportReviewSource: "passport_ocr",
        passportReviewState: "needs_review",
        surname: "VOLKOV",
        surnameReviewSource: "passport_ocr",
        surnameReviewState: "needs_review",
      });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
