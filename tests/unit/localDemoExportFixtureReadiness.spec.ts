import { describe, expect, it } from "vitest";
import { exportSummary } from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { passportGateIssues } from "../../src/modules/submissions/passportExtractionGuards";
import { hasMissingRequiredWork } from "../../src/modules/submissions/status";

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
});
