import { describe, expect, test } from "vitest";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  filterAgentSubmissionQueue,
  matchesAgentSubmissionQueueFilter,
  questionnaireCityForSubmission,
} from "../../src/modules/submissions/selectors";
import { blockerCount } from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";

function withAppointmentCity(submission: Submission, city: string): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) =>
          field.id === "appointment-city" ? { ...field, value: city } : field,
        ),
      })),
    })),
  };
}

describe("agent submission queue filters", () => {
  test("uses the same lifecycle groups as the review and export metrics", () => {
    const review = filterAgentSubmissionQueue(initialSubmissions, {
      city: "Все города",
      filter: "review",
      query: "",
    });
    const ready = filterAgentSubmissionQueue(initialSubmissions, {
      city: "Все города",
      filter: "ready",
      query: "",
    });

    expect(review).not.toHaveLength(0);
    expect(
      review.every((submission) =>
        ["submitted_for_review", "corrections_received"].includes(submission.status),
      ),
    ).toBe(true);
    expect(ready).not.toHaveLength(0);
    expect(ready.every((submission) => submission.status === "ready_for_export")).toBe(true);
    expect(
      matchesAgentSubmissionQueueFilter(
        initialSubmissions.find((submission) => submission.status === "in_progress")!,
        "review",
      ),
    ).toBe(false);
  });

  test("keeps blocker filtering under the canonical issue lifecycle", () => {
    const blockers = filterAgentSubmissionQueue(initialSubmissions, {
      city: "Все города",
      filter: "blockers",
      query: "",
    });

    expect(blockers).not.toHaveLength(0);
    expect(blockers.every((submission) => blockerCount(submission) > 0)).toBe(true);
  });

  test("matches a city offered from the appointment questionnaire", () => {
    const source = initialSubmissions.find(
      (submission) => submission.status === "ready_for_export",
    );
    expect(source).toBeDefined();
    if (!source) throw new Error("Expected a ready submission fixture");

    const submission = withAppointmentCity(
      { ...source, city: "Санкт-Петербург" },
      "Казань",
    );

    expect(
      filterAgentSubmissionQueue([submission], {
        city: "Казань",
        filter: "all",
        query: "",
      }).map((item) => item.id),
    ).toEqual([submission.id]);
  });

  test("normalizes a persisted city before offering, matching and displaying it", () => {
    const source = initialSubmissions.find(
      (submission) => submission.status === "ready_for_export",
    );
    expect(source).toBeDefined();
    if (!source) throw new Error("Expected a ready submission fixture");

    const submission = withAppointmentCity(
      { ...source, city: " Казань " },
      " ",
    );

    expect(questionnaireCityForSubmission(submission)).toBe("Казань");
    expect(
      filterAgentSubmissionQueue([submission], {
        city: "Казань",
        filter: "all",
        query: "",
      }).map((item) => item.id),
    ).toEqual([submission.id]);
  });
});
