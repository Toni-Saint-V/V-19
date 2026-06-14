import { describe, expect, test } from "vitest";
import {
  buildAiHelperResult,
  buildAiHelperSurface,
  type AiHelperFacadeInput,
} from "../../src/services/aiHelperFacade";
import type { Applicant, MediaSlot, Submission } from "../../src/types/domain";

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официально провер|шанс[а-я\s]+визы/i;

function acceptedMediaSlots(applicantId: string): MediaSlot[] {
  return [
    {
      id: `${applicantId}-photo_white`,
      applicantId,
      type: "photo_white",
      label: "Фото на белом фоне",
      state: "accepted",
    },
    {
      id: `${applicantId}-selfie`,
      applicantId,
      type: "selfie",
      label: "Селфи",
      state: "accepted",
    },
    {
      id: `${applicantId}-video`,
      applicantId,
      type: "video",
      label: "Видео",
      state: "accepted",
    },
  ];
}

function applicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: "applicant-1",
    name: "Artem Sokolov",
    role: "Заявитель",
    passport: "72 1190482",
    form: 100,
    media: 3,
    mediaRequired: 3,
    birthDate: "1988-05-12",
    citizenship: "Russian Federation",
    address: "Moscow Test Street 1",
    phone: "+79990000000",
    email: "artem@example.com",
    passportIssuedAt: "2020-01-10",
    passportExpiresAt: "2030-01-10",
    country: "Spain",
    city: "Madrid",
    tripDates: "2026-08-20 - 2026-08-30",
    hotelName: "Demo Hotel",
    hotelAddress: "Gran Via 1",
    mediaSlots: acceptedMediaSlots("applicant-1"),
    ...overrides,
  };
}

function submission(overrides: Partial<Submission> = {}): Submission {
  const applicants = overrides.applicants ?? [applicant()];

  return {
    id: "VF-FACADE",
    title: "Helper facade",
    type: "single",
    agentId: "agent-1",
    agentName: "Demo Agent",
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: "2026-06-14T08:00:00.000Z",
    status: "draft",
    appointment: "not_started",
    priority: "Средний",
    fields: 100,
    media: 3,
    mediaRequired: 3,
    applicants,
    mediaRows: [],
    notes: [],
    ...overrides,
  };
}

function visibleCopy(surface: ReturnType<typeof buildAiHelperSurface>): string {
  return [
    surface.result.title,
    surface.result.summary,
    ...surface.result.suggestions,
    ...surface.result.blockers,
    ...surface.result.guardrails,
    ...surface.display.sections.flatMap((section) => section.items),
  ].join(" ");
}

describe("AI helper facade", () => {
  test("routes every UI-ready local helper intent through one service surface", () => {
    const readySubmission = submission({
      id: "VF-READY",
      status: "accepted",
    });
    const draftSubmission = submission({
      id: "VF-DRAFT",
      fields: 60,
      media: 1,
      mediaRequired: 3,
      applicants: [
        applicant({
          email: "bad-email",
          passportExpiresAt: "2026-01-01",
        }),
      ],
    });
    const inputs: AiHelperFacadeInput[] = [
      { intent: "readiness_summary", submission: draftSubmission },
      { intent: "text_intake_review", submission: draftSubmission },
      { intent: "admin_review", submission: draftSubmission },
      {
        intent: "correction_draft",
        submission: draftSubmission,
        targetLabel: "заявитель",
      },
      { intent: "export_guard", submissions: [readySubmission, draftSubmission] },
    ];

    const surfaces = inputs.map(buildAiHelperSurface);

    expect(surfaces.map((surface) => surface.result.intent)).toEqual([
      "readiness_summary",
      "text_intake_review",
      "admin_review",
      "correction_draft",
      "export_guard",
    ]);

    for (const surface of surfaces) {
      expect(surface.result.source).toBe("local-stub");
      expect(surface.display.intent).toBe(surface.result.intent);
      expect(surface.display.title).toBe(surface.result.title);
      expect(surface.display.summary).toBe(surface.result.summary);
      expect(surface.display.sections.length).toBeGreaterThan(0);
      expect(visibleCopy(surface)).not.toMatch(forbiddenTrustCopy);
    }
  });

  test("keeps the result-only path available for non-visual callers", () => {
    const result = buildAiHelperResult({
      intent: "text_intake_review",
      submission: submission({
        applicants: [applicant({ email: "bad-email" })],
      }),
    });

    expect(result.intent).toBe("text_intake_review");
    expect(result.textReview?.findings[0]?.code).toBe("invalid_email");
  });
});
