import {
  completeQuestionnaire,
  updateQuestionnaireField,
} from "../../../src/modules/submissions/submissionActions";
import type {
  QuestionnaireField,
  Submission,
} from "../../../src/modules/submissions/types";

const testValuesByFieldId: Record<string, string> = {
  "appointment-city": "Москва",
  "arrival-date": "10.07.2026",
  "birth-citizenship": "Russian Federation",
  "birth-country": "USSR",
  "birth-date": "20.08.1990",
  "birth-place": "MOSCOW",
  "contact-number": "+7 900 000-00-00",
  "departure-date": "18.07.2026",
  "email": "test@example.com",
  "employer-address": "MOSCOW",
  "employer-contact": "+7 900 000-00-01",
  "employer-name": "TEST COMPANY",
  "first-entry-country": "Spain",
  "first-name": "MARIA",
  "home-address": "TEST ADDRESS",
  "home-city": "MOSCOW",
  "home-country": "Russian Federation",
  "hotel-address": "TEST HOTEL ADDRESS",
  "hotel-contact": "+34 900 000 000",
  "hotel-email": "hotel@example.com",
  "hotel-name": "TEST HOTEL",
  "main-destination": "Spain",
  "nationality": "Russian Federation",
  "occupation-specify": "MANAGER",
  "passport-expiry-date": "26.02.2032",
  "passport-issue-country": "Russian Federation",
  "passport-issue-date": "26.02.2016",
  "passport-issue-place": "FMS 78039",
  "passport-no": "765432100",
  "postal-code": "119991",
  "stay-duration": "9",
  surname: "IVANOVA",
};

export function fillRequiredQuestionnaireForTest(submission: Submission): Submission {
  let next = submission;

  for (const applicant of submission.applicants) {
    for (const section of applicant.sections) {
      for (const field of section.fields) {
        if (!field.required || field.value.trim()) continue;

        next = updateQuestionnaireField(next, {
          applicantId: applicant.id,
          fieldId: field.id,
          sectionId: section.id,
          value: valueForField(field),
        });
      }
    }
  }

  return completeQuestionnaire(next);
}

function valueForField(field: QuestionnaireField) {
  return (
    testValuesByFieldId[field.id] ??
    field.options?.[0] ??
    `TEST ${field.id.toUpperCase()}`
  );
}
