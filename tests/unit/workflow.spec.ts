import { describe, expect, test } from "vitest";
import {
  adminAcceptancePreflight,
  buildMediaSlot,
  normalizeSubmission,
  submissionPreflight,
  transitionSubmissionStatus,
} from "../../src/lib/workflow";
import type { Applicant, Submission } from "../../src/types/domain";

const completeApplicant: Applicant = {
  id: "applicant-1",
  name: "Artem Sokolov",
  role: "Заявитель",
  passport: "72 1190482",
  form: 100,
  media: 3,
  mediaRequired: 3,
  birthDate: "1988-05-12",
  citizenship: "РФ",
  address: "Moscow, Tverskaya 1",
  phone: "+79990000000",
  email: "artem@example.com",
  passportIssuedAt: "2020-01-10",
  passportExpiresAt: "2030-01-10",
  country: "Испания",
  city: "Мадрид",
  tripDates: "2026-08-20 - 2026-08-30",
  hotelName: "Demo Hotel",
  hotelAddress: "Gran Via 1",
  mediaSlots: [
    buildMediaSlot(
      {
        id: "applicant-1",
        name: "Artem Sokolov",
        passport: "72 1190482",
        role: "Заявитель",
        form: 100,
        media: 3,
        mediaRequired: 3,
      },
      "photo_white",
      "uploaded",
    ),
    buildMediaSlot(
      {
        id: "applicant-1",
        name: "Artem Sokolov",
        passport: "72 1190482",
        role: "Заявитель",
        form: 100,
        media: 3,
        mediaRequired: 3,
      },
      "selfie",
      "uploaded",
    ),
    buildMediaSlot(
      {
        id: "applicant-1",
        name: "Artem Sokolov",
        passport: "72 1190482",
        role: "Заявитель",
        form: 100,
        media: 3,
        mediaRequired: 3,
      },
      "video",
      "uploaded",
    ),
  ],
};

function makeSubmission(applicant: Applicant = completeApplicant): Submission {
  return normalizeSubmission({
    id: "VF-TEST",
    title: "Test submission",
    type: "single",
    agentId: "agent-1",
    agentName: "Nord Travel",
    country: "Испания",
    city: "Мадрид",
    travelDate: "2026-08-20",
    updated: "2026-06-11",
    status: "ready_for_review",
    appointment: "not_started",
    priority: "Высокий",
    fields: 0,
    media: 0,
    mediaRequired: 0,
    applicants: [applicant],
    mediaRows: [],
    notes: [],
    timeline: [],
  });
}

describe("workflow domain gates", () => {
  test("allows agent handoff with uploaded media but blocks admin acceptance until media are accepted", () => {
    const submission = makeSubmission();

    expect(submissionPreflight(submission).canSubmit).toBe(true);
    expect(adminAcceptancePreflight(submission).canSubmit).toBe(false);
  });

  test("allows admin acceptance only after all media are accepted", () => {
    const acceptedApplicant: Applicant = {
      ...completeApplicant,
      mediaSlots: completeApplicant.mediaSlots?.map((slot) => ({
        ...slot,
        state: "accepted",
        reviewStatus: "accepted",
      })),
    };

    expect(adminAcceptancePreflight(makeSubmission(acceptedApplicant)).canSubmit).toBe(
      true,
    );
  });

  test("records transition timestamps and normalizes appointment status", () => {
    const changedAt = "2026-06-11T12:00:00.000Z";
    const transitioned = transitionSubmissionStatus(
      makeSubmission(),
      "exported",
      "Demo operator",
      changedAt,
      "Included in export.",
    );

    expect(transitioned.exportedAt).toBe(changedAt);
    expect(transitioned.appointment).toBe("not_started");
    expect(transitioned.timeline?.at(-1)?.toStatus).toBe("exported");
  });

  test("generates sanitized media filenames from passport number", () => {
    const slot = buildMediaSlot(completeApplicant, "photo_white", "uploaded");

    expect(slot.generatedFileName).toBe("721190482_photo_white.jpg");
    expect(slot.passportFileName).toBe("721190482_photo_white.jpg");
  });

  test("normalizes legacy media file names back to the passport number", () => {
    const submission = makeSubmission({
      ...completeApplicant,
      mediaSlots: [
        {
          ...buildMediaSlot(completeApplicant, "selfie", "uploaded"),
          originalFileName: "artem_selfie.jpg",
          generatedFileName: "manual_selfie.jpg",
        },
      ],
    });
    const slot = submission.applicants[0].mediaSlots?.find(
      (item) => item.type === "selfie",
    );

    expect(slot?.passportFileName).toBe("721190482_selfie.jpg");
    expect(slot?.originalFileName).toBeUndefined();
    expect(slot?.generatedFileName).toBe("721190482_selfie.jpg");
  });
});
