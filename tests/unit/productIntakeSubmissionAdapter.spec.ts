import { describe, expect, test } from "vitest";
import {
  buildProductIntakeDraft,
  createDemoIntakeFiles,
  type ProductPackageType,
} from "../../src/modules/submissions/productIntakeFlow";
import { productIntakeDraftToSubmission } from "../../src/modules/submissions/productIntakeSubmissionAdapter";

function recognizedDraft(type: ProductPackageType) {
  return buildProductIntakeDraft(
    type,
    createDemoIntakeFiles(type).map((file) => ({
      ...file,
      progress: 100,
      status: "recognized" as const,
    })),
    "2026-07-17T08:00:00.000Z",
  );
}

describe("product intake submission media policy", () => {
  test("creates the exact passport and two selfie slots for a single applicant", () => {
    const submission = productIntakeDraftToSubmission(recognizedDraft("single"));
    const applicantId = submission.applicants[0]?.id;

    expect(
      submission.files.map((file) => [
        file.applicantId,
        file.type,
        file.originalFileName,
      ]),
    ).toEqual([
      [applicantId, "passport_scan", "Passport_Main.pdf"],
      [applicantId, "selfie", "Selfie_Main.jpg"],
      [applicantId, "selfie_2", "Selfie_2_Main.jpg"],
    ]);
  });

  test("creates selfies only for the primary applicant in a family", () => {
    const submission = productIntakeDraftToSubmission(recognizedDraft("family"));
    const [primary, secondary] = submission.applicants;

    expect(
      submission.files.map((file) => [
        file.applicantId,
        file.type,
        file.originalFileName,
      ]),
    ).toEqual([
      [primary?.id, "passport_scan", "Passport_Main.pdf"],
      [primary?.id, "selfie", "Selfie_Main.jpg"],
      [primary?.id, "selfie_2", "Selfie_2_Main.jpg"],
      [secondary?.id, "passport_scan", "Passport_Spouse.pdf"],
    ]);
  });
});
