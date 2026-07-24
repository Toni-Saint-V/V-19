import { describe, expect, test } from "vitest";

import { normalizeSubmissionQuestionnaire } from "../../src/modules/submissions/questionnaire";
import { createDraftSubmission, updateQuestionnaireField } from "../../src/modules/submissions/submissionActions";

function appointmentCityValue(submission: ReturnType<typeof createDraftSubmission>) {
  const applicant = submission.applicants[0];
  const section = applicant?.sections.find((candidate) =>
    candidate.fields.some((field) => field.id === "appointment-city"),
  );
  const field = section?.fields.find((candidate) => candidate.id === "appointment-city");
  if (!applicant || !section || !field) throw new Error("Missing appointment city field.");

  return { applicant, field, section };
}

describe("questionnaire submission-context prefill", () => {
  test("fills a blank appointment city from the canonical submission city", () => {
    const draft = createDraftSubmission({
      city: "Казань",
      familyCount: 1,
      submissions: [],
      type: "single",
    });

    const normalized = normalizeSubmissionQuestionnaire(draft);
    expect(appointmentCityValue(normalized).field.value).toBe("Казань");
  });

  test("fills the canonical submission city for every family applicant", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOV IVAN", "IVANOVA ANNA"],
      city: "Самара",
      familyCount: 2,
      submissions: [],
      type: "family",
    });

    const normalized = normalizeSubmissionQuestionnaire(draft);
    expect(
      normalized.applicants.map((applicant) =>
        applicant.sections
          .flatMap((section) => section.fields)
          .find((field) => field.id === "appointment-city")?.value,
      ),
    ).toEqual(["Самара", "Самара"]);
  });

  test("clears a stale required error when the canonical city fills the field", () => {
    const draft = createDraftSubmission({
      city: "Екатеринбург",
      familyCount: 1,
      submissions: [],
      type: "single",
    });
    const { applicant, field, section } = appointmentCityValue(draft);
    const withStaleError = {
      ...draft,
      applicants: draft.applicants.map((candidate) =>
        candidate.id !== applicant.id
          ? candidate
          : {
              ...candidate,
              sections: candidate.sections.map((candidateSection) =>
                candidateSection.id !== section.id
                  ? candidateSection
                  : {
                      ...candidateSection,
                      fields: candidateSection.fields.map((candidateField) =>
                        candidateField.id === field.id
                          ? { ...candidateField, error: "Обязательное поле" }
                          : candidateField,
                      ),
                    },
              ),
            },
      ),
    };

    expect(
      appointmentCityValue(normalizeSubmissionQuestionnaire(withStaleError)).field,
    ).toMatchObject({
      error: undefined,
      value: "Екатеринбург",
    });
  });

  test("never overwrites an explicitly selected appointment city", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      submissions: [],
      type: "single",
    });
    const { applicant, field, section } = appointmentCityValue(draft);
    const withExplicitChoice = updateQuestionnaireField(draft, {
      applicantId: applicant.id,
      fieldId: field.id,
      sectionId: section.id,
      value: "Казань",
    });

    expect(appointmentCityValue(normalizeSubmissionQuestionnaire(withExplicitChoice)).field.value).toBe(
      "Казань",
    );
  });
});
