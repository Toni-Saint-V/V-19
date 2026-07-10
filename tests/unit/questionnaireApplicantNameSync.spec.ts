import { describe, expect, test } from "vitest";

import {
  createDraftSubmission,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";

describe("questionnaire applicant identity sync", () => {
  test("keeps applicant and package display identity aligned with first and surname fields", () => {
    const draft = createDraftSubmission({
      applicantNames: ["Основной заявитель", "Супруг"],
      city: "Москва",
      familyCount: 2,
      idScheme: "supabase",
      submissions: [],
      type: "family",
    });
    const mainApplicant = draft.applicants[0];
    if (!mainApplicant) {
      throw new Error("Expected main applicant");
    }

    const withFirstName = updateQuestionnaireField(draft, {
      applicantId: mainApplicant.id,
      fieldId: "first-name",
      sectionId: "personal",
      value: "TEST",
    });
    const withFullName = updateQuestionnaireField(withFirstName, {
      applicantId: mainApplicant.id,
      fieldId: "surname",
      sectionId: "personal",
      value: "PERSON ONE",
    });

    expect(withFullName.applicants[0]?.fullName).toBe("TEST PERSON ONE");
    expect(withFullName.title).not.toBe("Новая семейная подача");
  });

  test("does not replace a meaningful intake identity with unrelated field updates", () => {
    const draft = createDraftSubmission({
      applicantNames: ["ANTON VOLKOV"],
      city: "Москва",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    const applicant = draft.applicants[0];
    if (!applicant) throw new Error("Expected applicant");

    const updated = updateQuestionnaireField(draft, {
      applicantId: applicant.id,
      fieldId: "first-name",
      sectionId: "personal",
      value: "MARIA",
    });

    expect(updated.applicants[0]?.fullName).toBe("ANTON VOLKOV");
    expect(updated.title).toBe("ANTON VOLKOV");
  });
});
