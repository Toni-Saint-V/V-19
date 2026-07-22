import { expect, test } from "@playwright/test";
import {
  clickFirstVisible,
  collectBrowserProblems,
  expectAtLeastOneVisible,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

const canonicalStorageKey = "visaflow.v19.submissions.v1";
const legacyIntakeStorageKey = "visaflow.v19.productIntakeDrafts.v1";

test.describe("V-19 privacy-safe passport intake proof", () => {
  test("stores a synthetic manual-review passport only in the canonical draft", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await openFreshWorkspace(page, { heading: "Мои действия" });
    const createButton = page.getByRole("button", {
      name: /^(Создать пакет|Новая подача)$/,
    });
    await expectAtLeastOneVisible(createButton, "No visible create button matched.");
    await clickFirstVisible(createButton);

    const dialog = page.getByRole("dialog", { name: "Новая подача" });
    await dialog.getByRole("radio", { name: "Заявитель" }).click();
    await dialog.getByLabel("Город подачи").selectOption("Самара");
    await dialog.locator('input[type="file"]').setInputFiles({
      buffer: Buffer.from([0x00, 0x00, 0x00, 0x18]),
      mimeType: "image/heic",
      name: "synthetic-passport.heic",
    });

    await expect(dialog.getByText("Нужна ручная проверка")).toBeVisible();
    await dialog.getByRole("button", { name: "Создать и открыть анкету" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /Анкета:/ }),
    ).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          ({ canonicalKey, legacyKey }) => {
            const canonical = JSON.parse(
              localStorage.getItem(canonicalKey) ?? "[]",
            ) as Array<{
              city?: string;
              files?: Array<{
                originalFileName?: string;
                storageAdapter?: string;
                type?: string;
              }>;
            }>;
            const created = canonical.find((submission) =>
              submission.files?.some(
                (file) => file.originalFileName === "synthetic-passport.heic",
              ),
            );
            return {
              city: created?.city,
              legacyDraftExists: localStorage.getItem(legacyKey) !== null,
              storageAdapter: created?.files?.find(
                (file) => file.type === "passport_scan",
              )?.storageAdapter,
            };
          },
          { canonicalKey: canonicalStorageKey, legacyKey: legacyIntakeStorageKey },
        ),
      )
      .toEqual({
        city: "Самара",
        legacyDraftExists: false,
        storageAdapter: "local-dev",
      });

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });
});
