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
