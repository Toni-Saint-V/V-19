import { describe, expect, test } from "vitest";
import {
  buildAdminReviewSummary,
  buildExportGuard,
  buildReadinessSummary,
  buildTextIntakeReview,
  draftCorrectionText,
  type AiHelperResult,
} from "../../src/services/aiHelperService";
import { buildAiHelperDisplayModel } from "../../src/services/aiHelperDisplayModel";
import type { Applicant, MediaSlot, Submission } from "../../src/types/domain";

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официально провер|шанс[а-я\s]+визы/i;

function applicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: "applicant-1",
    name: "Artem Sokolov",
    role: "Applicant",
    passport: "72 1190482",
    form: 100,
    media: 4,
    mediaRequired: 4,
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
    ...overrides,
  };
}

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
      label: "Селфи N1",
      state: "accepted",
    },
    {
      id: `${applicantId}-selfie_2`,
      applicantId,
      type: "selfie_2",
      label: "Селфи N2",
      state: "accepted",
    },
    {
      id: `${applicantId}-passport_scan`,
      applicantId,
      type: "passport_scan",
      label: "Загранпаспорт",
      state: "accepted",
    },
  ];
}

function submission(overrides: Partial<Submission> = {}): Submission {
  const applicants = overrides.applicants ?? [applicant()];

  return {
    id: "VF-AI",
    title: "AI helper contract",
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
    media: 4,
    mediaRequired: 4,
    applicants,
    mediaRows: [],
    notes: [],
    ...overrides,
  };
}

function visibleCopy(result: AiHelperResult): string {
  return [
    result.title,
    result.summary,
    ...result.suggestions,
    ...result.blockers,
    ...result.guardrails,
    ...(result.operatorSummary ?? []),
    ...(result.agentFollowUpDrafts ?? []),
  ].join(" ");
}

describe("AI helper service contract", () => {
  test("keeps every helper UI-ready without relying on a production UI", () => {
    const readyApplicant = applicant({
      id: "ready-applicant",
      mediaSlots: acceptedMediaSlots("ready-applicant"),
    });
    const readySubmission = submission({
      id: "VF-READY",
      status: "accepted",
      applicants: [readyApplicant],
    });
    const draftSubmission = submission({
      id: "VF-DRAFT",
      fields: 60,
      media: 1,
      mediaRequired: 3,
      applicants: [
        applicant({
          email: "bad-email",
          media: 1,
          mediaRequired: 3,
          passportExpiresAt: "2026-01-01",
        }),
      ],
      notes: [
        {
          id: "note-1",
          target: "Анкета",
          text: "Уточните данные заявителя.",
          severity: "blocking",
          status: "open",
        },
      ],
    });
    const results = [
      buildReadinessSummary(draftSubmission),
      buildTextIntakeReview(draftSubmission),
      buildAdminReviewSummary(draftSubmission),
      draftCorrectionText(draftSubmission, "заявитель"),
      buildExportGuard([readySubmission, draftSubmission]),
    ];

    expect(results.map((result) => result.intent)).toEqual([
      "readiness_summary",
      "text_intake_review",
      "admin_review",
      "correction_draft",
      "export_guard",
    ]);

    for (const result of results) {
      const model = buildAiHelperDisplayModel(result);

      expect(result.source).toBe("local-stub");
      expect(result.title.trim()).not.toBe("");
      expect(result.summary.trim()).not.toBe("");
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(Array.isArray(result.blockers)).toBe(true);
      expect(model.title).toBe(result.title);
      expect(model.summary).toBe(result.summary);
      expect(model.sections.length).toBeGreaterThan(0);
      expect(
        model.sections.every((section) =>
          section.items.every((item) => item.trim().length > 0),
        ),
      ).toBe(true);
      expect(result.guardrails).toEqual(
        expect.arrayContaining([
          "Подсказка не является решением.",
          "Детерминированные проверки остаются источником истины.",
          "Оператор принимает медиа и заявку вручную.",
        ]),
      );
      expect(visibleCopy(result)).not.toMatch(forbiddenTrustCopy);
      expect(model.sections.flatMap((section) => section.items).join(" ")).not.toMatch(
        forbiddenTrustCopy,
      );
    }

    const textReview = results.find((result) => result.intent === "text_intake_review");
    expect(textReview?.operatorSummary?.[0]).toBe(
      "Текст анкеты: блокеров 2, предупреждений 0.",
    );
    expect(textReview?.agentFollowUpDrafts?.[0]).toContain(
      "Email указан в некорректном формате",
    );
    expect(textReview?.textReview?.correctionCandidates[0]?.text).toContain(
      "Введите корректный email",
    );

    const exportGuard = results.find((result) => result.intent === "export_guard");
    expect(exportGuard?.summary).toContain("К выгрузке: 1 заявок, 1 строк");
    expect(exportGuard?.blockers.join(" ")).toContain("VF-DRAFT");
  });

  test("builds a one-call display model for future UI integration", () => {
    const helper = buildTextIntakeReview(
      submission({
        fields: 60,
        applicants: [
          applicant({
            email: "bad-email",
            passportExpiresAt: "2026-01-01",
          }),
        ],
      }),
    );
    const model = buildAiHelperDisplayModel(helper);

    expect(model.intent).toBe("text_intake_review");
    expect(model.title).toBe(helper.title);
    expect(model.summary).toBe(helper.summary);
    expect(model.sections.map((section) => section.id)).toEqual([
      "blockers",
      "operator_summary",
      "suggestions",
      "agent_follow_up",
      "guardrails",
    ]);
    expect(model.sections.every((section) => section.items.length > 0)).toBe(true);
    expect(model.sections.flatMap((section) => section.items).join(" ")).not.toMatch(
      forbiddenTrustCopy,
    );
  });
});
