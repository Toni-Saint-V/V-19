import { afterEach, describe, expect, it } from "vitest";
import {
  buildExportPackageIdentity,
  exportSummary,
} from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { passportGateIssues } from "../../src/modules/submissions/passportExtractionGuards";
import { hasMissingRequiredWork } from "../../src/modules/submissions/status";
import { createExportWorkbookArtifact } from "../../src/modules/submissions/exportWorkbook";
import { parseExportWorkbookArtifact } from "../../src/modules/submissions/exportWorkbookVerification";
import { createVisaApplicationFormPdfBlob } from "../../src/modules/submissions/visaApplicationFormPdf";
import { loadSubmissions } from "../../src/modules/submissions/persistence";

const storageKey = "visaflow.v19.submissions.v1";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("local demo export fixtures", () => {
  it("keeps every ready-for-export fixture genuinely exportable", () => {
    const readyFixtures = initialSubmissions.filter(
      (submission) => submission.status === "ready_for_export",
    );

    expect(readyFixtures.length).toBeGreaterThan(0);
    for (const submission of readyFixtures) {
      expect(hasMissingRequiredWork(submission), submission.id).toBe(false);
      expect(passportGateIssues(submission), submission.id).toEqual([]);
      expect(exportSummary([submission]), submission.id).toMatchObject({
        canGenerate: true,
        ready: true,
      });
    }
  });

  it("keeps a pending passport review blocked", () => {
    const readyFixture = initialSubmissions.find(
      (submission) => submission.id === "ПД-1056",
    );
    if (!readyFixture) throw new Error("Expected ready local demo fixture");

    const pendingPassportReview = {
      ...readyFixture,
      applicants: readyFixture.applicants.map((applicant) => ({
        ...applicant,
        passportExtraction: {
          appliedFieldKeys: [],
          extractedFields: [],
          status: "extracting" as const,
          summary: "Распознавание паспорта выполняется.",
        },
      })),
    };

    expect(passportGateIssues(pendingPassportReview)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "passport_not_confirmed",
          message: "Дождитесь проверки скана.",
        }),
      ]),
    );
  });

  it("keeps every family applicant distinct in parsed Excel and generated PDFs", async () => {
    const families = initialSubmissions.filter(
      (submission) =>
        submission.status === "ready_for_export" && submission.type === "family",
    );
    expect(families.length).toBeGreaterThan(0);

    for (const family of families) {
      const plan = exportSummary([family]);
      const identity = buildExportPackageIdentity([family]);
      if (!identity) throw new Error(`Expected export identity for ${family.id}`);
      const workbook = await parseExportWorkbookArtifact(
        createExportWorkbookArtifact(plan.rows, identity),
      );
      const firstNameColumn = workbook.rows[0]?.indexOf("FirstName") ?? -1;
      const surnameColumn = workbook.rows[0]?.indexOf("Surname (Family Name)") ?? -1;
      const birthDateColumn =
        workbook.rows[0]?.indexOf("Date of Birth(YYYY-MM-DD)") ?? -1;
      const passportColumn = workbook.rows[0]?.indexOf("Passport No") ?? -1;
      const applicantRows = workbook.rows.slice(1);

      expect(applicantRows, family.id).toHaveLength(family.applicants.length);
      expect(
        new Set(
          applicantRows.map((row) =>
            [row[firstNameColumn], row[surnameColumn], row[birthDateColumn]].join("|"),
          ),
        ).size,
        family.id,
      ).toBe(family.applicants.length);

      for (const [index, applicant] of family.applicants.entries()) {
        const row = applicantRows[index];
        const pdfText = new TextDecoder().decode(
          await createVisaApplicationFormPdfBlob(family, applicant).arrayBuffer(),
        );
        const ownPassport = row?.[passportColumn] ?? "";
        const otherPassports = applicantRows
          .filter((_, rowIndex) => rowIndex !== index)
          .map((candidate) => candidate[passportColumn] ?? "");

        expect(pdfText).toContain(row?.[firstNameColumn]);
        expect(pdfText).toContain(row?.[surnameColumn]);
        expect(pdfText).toContain(ownPassport);
        for (const otherPassport of otherPassports) {
          expect(pdfText).not.toContain(otherPassport);
        }
      }
    }
  });

  it("migrates the legacy shared demo identity before export", () => {
    const source = initialSubmissions.find((submission) => submission.id === "ПД-1054");
    if (!source) throw new Error("Expected ready family fixture");
    const legacyValues: Record<string, string> = {
      "birth-date": "20.08.1990",
      "birth-place": "MOSCOW",
      "contact-number": "+7 900 000-00-00",
      email: "demo@example.com",
      "first-name": "IVAN",
      gender: "Мужской",
      "marital-status": "Холост/не замужем",
      surname: "IVANOV",
    };
    const legacy = {
      ...structuredClone(source),
      applicants: source.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => ({
            ...field,
            value: legacyValues[field.id] ?? field.value,
          })),
        })),
      })),
    };
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    globalThis.localStorage.setItem(storageKey, JSON.stringify([legacy]));

    const [loaded] = loadSubmissions();
    const rows = loaded ? exportSummary([loaded]).rows : [];

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.firstName))).toEqual(
      new Set(["IRINA", "PAVEL"]),
    );
    expect(new Set(rows.map((row) => row.surnameFamilyName))).toEqual(
      new Set(["PETROVA", "PETROV"]),
    );
    expect(new Set(rows.map((row) => row.dateOfBirth))).toEqual(
      new Set(["1991-03-14", "1988-11-22"]),
    );
  });
});
