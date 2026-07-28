import { describe, expect, test } from "vitest";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { ADMIN_PASSPORT_REVIEW_FIELD_IDS } from "../../src/modules/submissions/passportReviewContract";
import { passportGateIssues } from "../../src/modules/submissions/passportExtractionGuards";

function manuallyReviewedLegacySubmission() {
  const source = initialSubmissions.find((submission) => submission.id === "ПД-1054");
  if (!source) throw new Error("Missing ready local-demo fixture ПД-1054");

  const reviewedAtIso = "2026-07-27T12:00:00.000Z";
  const reviewedBy = "local-admin";
  return {
    ...structuredClone(source),
    applicants: source.applicants.map((applicant) => ({
      ...structuredClone(applicant),
      passportExtraction: undefined,
      sections: applicant.sections.map((section) => ({
        ...structuredClone(section),
        fields: section.fields.map((field) =>
          ADMIN_PASSPORT_REVIEW_FIELD_IDS.some((fieldId) => fieldId === field.id)
            ? {
                ...structuredClone(field),
                adminReviewApprovedAtIso: reviewedAtIso,
                adminReviewApprovedBy: reviewedBy,
              }
            : structuredClone(field),
        ),
      })),
    })),
    files: source.files.map((file) => ({
      ...structuredClone(file),
      reviewStatus: "accepted" as const,
      reviewedAtIso,
      reviewedBy,
      status: "accepted" as const,
    })),
  };
}

describe("manual admin passport review fallback", () => {
  test("keeps legacy submissions guarded while accepting fully reviewed fields and assets", () => {
    const reviewed = manuallyReviewedLegacySubmission();

    expect(passportGateIssues(reviewed, new Date("2026-07-27T12:00:00.000Z"))).toEqual(
      [],
    );

    const withoutOneApproval = {
      ...reviewed,
      applicants: reviewed.applicants.map((applicant, index) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            index === 0 && field.id === "passport-no"
              ? {
                  ...field,
                  adminReviewApprovedAtIso: undefined,
                  adminReviewApprovedBy: undefined,
                }
              : field,
          ),
        })),
      })),
    };

    expect(
      passportGateIssues(withoutOneApproval, new Date("2026-07-27T12:00:00.000Z")),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: reviewed.applicants[0]?.id,
          code: "passport_not_confirmed",
        }),
      ]),
    );
  });

  test.each([
    {
      name: "without a private storage identity",
      tamper: () => ({
        generatedFileName: undefined,
        storageAdapter: undefined,
        storageBucket: undefined,
        storagePath: undefined,
      }),
    },
    {
      name: "with a path from another submission",
      tamper: (storagePath: string) => ({
        storagePath: storagePath.replace("ПД-1054", "ПД-FOREIGN"),
      }),
    },
    {
      name: "with a path from another applicant",
      tamper: (storagePath: string, applicantId: string) => ({
        storagePath: storagePath.replace(applicantId, "foreign-applicant"),
      }),
    },
  ])("rejects an accepted manual review $name", ({ tamper }) => {
    const reviewed = manuallyReviewedLegacySubmission();
    const applicant = reviewed.applicants[0];
    if (!applicant) throw new Error("Missing reviewed applicant");
    const passport = reviewed.files.find(
      (file) => file.applicantId === applicant.id && file.type === "passport_scan",
    );
    if (!passport?.storagePath) throw new Error("Missing reviewed passport asset");

    const invalidIdentity = {
      ...reviewed,
      files: reviewed.files.map((file) =>
        file.id === passport.id
          ? {
              ...file,
              ...tamper(file.storagePath ?? "", applicant.id),
            }
          : file,
      ),
    };

    expect(
      passportGateIssues(invalidIdentity, new Date("2026-07-27T12:00:00.000Z")),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: applicant.id,
          code: "passport_not_confirmed",
        }),
      ]),
    );
  });
});
