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
  "company-contact-person": "TEST CONTACT",
  "company-org-details": "TEST COMPANY, MADRID",
  "company-phone": "+34 900 000 001",
  "contact-number": "+7 900 000-00-00",
  "departure-date": "18.07.2026",
  "desired-date-1": "05.08.2026",
  "desired-date-2": "12.08.2026",
  "email": "test@example.com",
  "employer-address": "MOSCOW",
  "employer-contact": "+7 900 000-00-01",
  "employer-name": "TEST COMPANY",
  "first-entry-country": "Spain",
  "first-name": "MARIA",
  "home-address": "TEST ADDRESS",
  "home-building": "2",
  "home-city": "MOSCOW",
  "home-country": "Russian Federation",
  "home-house": "15",
  "home-street": "улица Ленина",
  "home-unit": "кв 12",
  "hotel-address": "TEST HOTEL ADDRESS",
  "hotel-city": "MADRID",
  "hotel-contact": "+34 900 000 000",
  "hotel-country": "Spain",
  "hotel-email": "hotel@example.com",
  "hotel-name": "TEST HOTEL",
  "hotel-postal-code": "28001",
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
  let next = completeQuestionnaire(submission);
  const conditionallyRequiredBlsFields = new Set([
    "employer-address",
    "employer-contact",
    "employer-name",
    "guardian-info",
    "company-contact-person",
    "company-org-details",
    "company-phone",
  ]);

  for (const applicant of next.applicants) {
    for (const section of applicant.sections) {
      for (const field of section.fields) {
        if (
          (!field.required && !conditionallyRequiredBlsFields.has(field.id)) ||
          field.value.trim()
        ) {
          continue;
        }

        next = updateQuestionnaireField(next, {
          applicantId: applicant.id,
          fieldId: field.id,
          sectionId: section.id,
          value: valueForField(field),
        });
      }
    }

    const currentApplicant = next.applicants.find((candidate) => candidate.id === applicant.id);
    const arrivalDate = questionnaireFieldValue(currentApplicant, "arrival-date");
    const departureDate = questionnaireFieldValue(currentApplicant, "departure-date");
    const stayDuration = inclusiveDayCount(arrivalDate, departureDate);
    const stayDurationSection = currentApplicant?.sections.find((section) =>
      section.fields.some((field) => field.id === "stay-duration"),
    );
    if (stayDuration && stayDurationSection) {
      next = updateQuestionnaireField(next, {
        applicantId: applicant.id,
        fieldId: "stay-duration",
        sectionId: stayDurationSection.id,
        value: `${stayDuration}`,
      });
    }
  }

  return next;
}

export function adminApproveQuestionnaireForTest(
  submission: Submission,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) =>
          field.value.trim() && !field.error
            ? {
                ...field,
                adminReviewApprovedAtIso: "2026-07-16T00:00:00.000Z",
                adminReviewApprovedBy: "admin-reviewer-test",
              }
            : field,
        ),
      })),
    })),
  };
}

function questionnaireFieldValue(applicant: Submission["applicants"][number] | undefined, fieldId: string) {
  return applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === fieldId)
    ?.value.trim() ?? "";
}

function inclusiveDayCount(fromValue: string, toValue: string) {
  const from = questionnaireDate(fromValue);
  const to = questionnaireDate(toValue);
  if (!from || !to || to < from) return 0;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function questionnaireDate(value: string) {
  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dotted && !iso) return null;

  const year = Number(iso ? iso[1] : dotted?.[3]);
  const month = Number(iso ? iso[2] : dotted?.[2]);
  const day = Number(iso ? iso[3] : dotted?.[1]);
  return new Date(Date.UTC(year, month - 1, day));
}

function valueForField(field: QuestionnaireField) {
  return (
    testValuesByFieldId[field.id] ??
    field.options?.[0] ??
    `TEST ${field.id.toUpperCase()}`
  );
}
