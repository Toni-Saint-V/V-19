import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { testArtifactPath } from "../support/artifacts";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const evidenceDirectory = testArtifactPath("2026-07-15-documents-pass-01");

type DocumentsViewportMetric = {
  documentWidth: { client: number; scroll: number };
  matrixVisible: boolean;
  viewport: string;
};

async function expectNoDocumentsAxeViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    })),
    context,
  ).toEqual([]);
}

async function captureDocumentsMetric(
  page: Page,
  viewport: string,
): Promise<DocumentsViewportMetric> {
  return page.evaluate((label): DocumentsViewportMetric => {
    const matrix = document.querySelector(".v19-documents-summary-grid");
    return {
      documentWidth: {
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      },
      matrixVisible: Boolean(matrix),
      viewport: label,
    };
  }, viewport);
}

async function openDocumentsScreen(page: Page) {
  const mobileMenu = page.getByRole("button", { exact: true, name: "Меню" });
  if (await mobileMenu.isVisible().catch(() => false)) {
    await mobileMenu.click();
    const navigation = page.getByRole("dialog", { name: "Меню агента" });
    await navigation.getByRole("button", { name: "Сбор документов" }).click();
    await expect(navigation).toBeHidden();
    return;
  }

  await page.getByRole("button", { name: "Сбор документов" }).click();
}

test.describe("V-19 document collection screen", () => {
  test("opens the document matrix without overflow across the supported viewport matrix", async ({
    page,
  }) => {
    mkdirSync(evidenceDirectory, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    const metrics: DocumentsViewportMetric[] = [];

    for (const viewport of [
      { height: 740, label: "mobile-320", width: 320 },
      { height: 844, label: "mobile-390", width: 390 },
      { height: 932, label: "mobile-430", width: 430 },
      { height: 1024, label: "tablet-768", width: 768 },
      { height: 900, label: "desktop-1440", width: 1440 },
    ]) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await openFreshWorkspace(page, { heading: "Мои действия" });
      await openDocumentsScreen(page);

      await expect(
        page.getByRole("heading", { level: 1, name: "Сбор документов" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Документы заявителей" }),
      ).toBeVisible();
      await expect(page.locator(".v19-documents-summary-grid")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Анкета:/ })).toHaveCount(0);
      await expect(
        page.getByTestId("document-collection-matrix").getByText("Основной", {
          exact: true,
        }),
      ).toHaveCount(0);

      const dividerTexts = await page
        .getByTestId("document-type-divider")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => (node as HTMLElement).offsetParent !== null)
            .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? ""),
        );
      expect(dividerTexts.length).toBeGreaterThan(0);
      expect(
        dividerTexts.every(
          (text) => text === "Одиночные заявители" || text === "Семьи",
        ),
      ).toBe(true);
      expect(new Set(dividerTexts).size).toBe(dividerTexts.length);
      expect(
        await page
          .getByTestId("document-type-divider")
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => (node as HTMLElement).offsetParent !== null)
              .every((node) => Boolean(node.querySelector("svg"))),
          ),
      ).toBe(true);

      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: join(evidenceDirectory, `${viewport.label}-baseline.png`),
      });

      if (viewport.width === 320) {
        for (const label of ["Селфи 1", "Селфи 2"]) {
          const mobileSlot = page
            .getByRole("button", {
              name: new RegExp(`^${label}:`),
            })
            .first();
          await expect(mobileSlot).toBeVisible();
          const visibleLabel = mobileSlot.locator(".v19-mobile-document-slot-label");
          await expect(visibleLabel).toHaveText(label);
          const labelLayout = await visibleLabel.evaluate((node) => {
            const element = node as HTMLElement;
            return {
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              textOverflow: getComputedStyle(element).textOverflow,
              whiteSpace: getComputedStyle(element).whiteSpace,
            };
          });
          expect(labelLayout.scrollWidth).toBeLessThanOrEqual(
            labelLayout.clientWidth + 1,
          );
          expect(labelLayout.textOverflow).toBe("clip");
          expect(labelLayout.whiteSpace).toBe("normal");
        }
      }

      if (viewport.width === 768) {
        await expect(page.getByTestId("document-applicant-list").first()).toBeVisible();
      }

      const applicantSurface =
        viewport.width < 1280
          ? page.locator(".v19-documents-mobile-list")
          : page.locator(".v19-documents-table-scroll");
      for (const applicantName of [
        "Мария Иванова",
        "Антон Иванов",
        "София Иванова",
        "Марк Иванов",
      ]) {
        await expect(
          applicantSurface
            .getByTestId("document-applicant-name")
            .filter({ hasText: applicantName }),
        ).toBeVisible();
      }

      const sectionGap = await page.evaluate(() => {
        const groups = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".v19-documents-mobile-list .v19-document-type-group",
          ),
        ).filter((group) => group.offsetParent !== null);
        if (groups.length < 2) return 0;
        return (
          groups[1]!.getBoundingClientRect().top -
          groups[0]!.getBoundingClientRect().bottom
        );
      });
      expect(sectionGap).toBeGreaterThanOrEqual(0);
      expect(sectionGap).toBeLessThanOrEqual(16);

      const returnedSelfie = page
        .getByRole("button", { name: "Селфи 1: Проверить" })
        .first();
      await expect(returnedSelfie).toBeVisible();
      await returnedSelfie.click();
      const remarkHeading = page.getByRole("heading", {
        name: "Список задач по замечаниям",
      });
      const remarkText = page.getByText("Лицо обрезано. Загрузите селфи 1.", {
        exact: true,
      });
      await expect(remarkHeading).toBeVisible();
      await expect(remarkHeading).toBeInViewport();
      await expect(remarkText).toBeVisible();
      await expect(remarkText).toBeInViewport();
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: join(evidenceDirectory, `${viewport.label}-document-remark.png`),
      });
      await page.getByRole("button", { name: "Закрыть подачу" }).click();
      await expect(remarkHeading).toHaveCount(0);

      if (viewport.width === 320) {
        const firstApplicantList = page.getByTestId("document-applicant-list").first();
        const visibleStatuses = await page
          .getByTestId("document-applicant-list")
          .first()
          .locator(".v19-mobile-document-slot-status")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const element = node as HTMLElement;
              return {
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                text: element.textContent?.trim() ?? "",
              };
            }),
          );
        expect(visibleStatuses.some((status) => status.text === "Загружено")).toBe(
          true,
        );
        expect(visibleStatuses.some((status) => status.text === "Проверить")).toBe(
          true,
        );
        expect(
          visibleStatuses.every(
            (status) => status.scrollWidth <= status.clientWidth + 1,
          ),
        ).toBe(true);

        const familyApplicantRows = firstApplicantList.getByTestId(
          "document-applicant-row",
        );
        await expect(familyApplicantRows).toHaveCount(4);
        const familyMemberNameLayout = await familyApplicantRows
          .nth(1)
          .getByTestId("document-applicant-name")
          .evaluate((node) => ({
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            text: node.textContent?.trim(),
            whiteSpace: getComputedStyle(node).whiteSpace,
          }));
        expect(familyMemberNameLayout.text).toBe("Антон Иванов");
        expect(familyMemberNameLayout.scrollWidth).toBeLessThanOrEqual(
          familyMemberNameLayout.clientWidth + 1,
        );
        expect(familyMemberNameLayout.whiteSpace).toBe("normal");
        const visibleFamilyMemberSlots = await familyApplicantRows
          .nth(1)
          .getByTestId("document-mobile-slot")
          .evaluateAll((slots) => slots.map((slot) => slot.getAttribute("aria-label")));
        expect(visibleFamilyMemberSlots).toEqual(["Загран: Загрузить документ"]);
        await page.screenshot({
          animations: "disabled",
          fullPage: false,
          path: join(evidenceDirectory, "mobile-320-family-applicant-list.png"),
        });

        await expectNoDocumentsAxeViolations(page, "document collection mobile");
      }

      const metric = await captureDocumentsMetric(page, viewport.label);
      metrics.push(metric);
      expect(metric.matrixVisible).toBe(true);
      expect(metric.documentWidth.scroll).toBeLessThanOrEqual(
        metric.documentWidth.client + 1,
      );
    }

    writeFileSync(
      join(evidenceDirectory, "baseline-viewport-metrics.json"),
      JSON.stringify(metrics, null, 2),
    );
    expect(browserProblems).toEqual([]);
  });

  test("keeps every permitted applicant available for manual recovery after filtering", async ({
    page,
  }) => {
    mkdirSync(evidenceDirectory, { recursive: true });
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, { heading: "Мои действия" });
    await openDocumentsScreen(page);

    await expect(page.getByRole("button", { name: /^Открыть пакет / })).not.toHaveCount(
      0,
    );

    const bulkInput = page.getByTestId("document-bulk-file-input");
    await bulkInput.setInputFiles({
      buffer: Buffer.from("local unmatched document"),
      mimeType: "application/octet-stream",
      name: "unmatched-document.bin",
    });

    const recoveryPanel = page.getByTestId("document-unmatched-uploads");
    await expect(recoveryPanel).toBeVisible();
    const applicantSelect = recoveryPanel.getByLabel(
      "Заявитель для нераспределённого файла",
    );
    const initialApplicantOptions = await applicantSelect
      .locator("option")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => ({
            label: node.textContent?.trim() ?? "",
            value: (node as HTMLOptionElement).value,
          }))
          .filter((option) => Boolean(option.value)),
      );
    const initialApplicantValues = initialApplicantOptions.map(
      (option) => option.value,
    );
    expect(initialApplicantValues.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Ошибки" }).click();
    await expect(page.getByRole("button", { name: "Ошибки" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const errorSubmissionIds = new Set(
      await page
        .locator("[data-document-submission-id]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-document-submission-id") ?? ""),
        ),
    );
    const hiddenCandidateValue = initialApplicantOptions.find(
      (option) =>
        option.label.includes("Артём Соколов") &&
        !errorSubmissionIds.has(option.value.split(":")[0] ?? ""),
    )?.value;
    expect(hiddenCandidateValue).toBeTruthy();

    const hiddenCandidateCount = await applicantSelect
      .locator("option")
      .evaluateAll(
        (nodes, candidate) =>
          nodes.filter((node) => (node as HTMLOptionElement).value === candidate)
            .length,
        hiddenCandidateValue,
      );
    expect(hiddenCandidateCount).toBe(1);

    await applicantSelect.selectOption(hiddenCandidateValue!);
    const documentTypeSelect = recoveryPanel.getByLabel(
      "Тип для нераспределённого файла",
    );
    await expect(
      documentTypeSelect.locator('option[value="questionnaire"]'),
    ).toHaveCount(0);
    await documentTypeSelect.selectOption("selfie2");
    await recoveryPanel.getByTestId("document-assign-unmatched").click();
    await expect(recoveryPanel).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: join(evidenceDirectory, "desktop-manual-recovery-after.png"),
    });
    expect(browserProblems).toEqual([]);
  });
});
