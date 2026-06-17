import { describe, expect, test } from "vitest";
import { buildSmartCorrectionReturnPackage } from "../../src/services/smartCorrectionReturn";
import type { Applicant, MediaSlot, Submission } from "../../src/types/domain";

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

function uploadedMediaSlots(applicantId: string): MediaSlot[] {
  return acceptedMediaSlots(applicantId).map((slot) => ({
    ...slot,
    state: "uploaded" as const,
  }));
}

function applicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: "applicant-1",
    name: "Artem Sokolov",
    role: "Заявитель",
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
    mediaSlots: acceptedMediaSlots("applicant-1"),
    ...overrides,
  };
}

function submission(overrides: Partial<Submission> = {}): Submission {
  const applicants = overrides.applicants ?? [applicant()];

  return {
    id: "VF-SMART-RETURN",
    title: "Smart return",
    type: "single",
    agentId: "agent-1",
    agentName: "Demo Agent",
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: "2026-06-14T08:00:00.000Z",
    status: "in_review",
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

function idFactory(): () => string {
  let index = 0;
  return () => `00000000-0000-4000-8000-${String(index++).padStart(12, "0")}`;
}

describe("smart correction return package", () => {
  test("builds exact localized correction notes from text intake findings", () => {
    const result = buildSmartCorrectionReturnPackage(
      submission({
        applicants: [
          applicant({
            email: "not-an-email",
            passportExpiresAt: "2026-01-01",
          }),
        ],
      }),
      {
        createdBy: "operator-1",
        createdAt: "2026-06-14T08:00:00.000Z",
        idFactory: idFactory(),
      },
    );
    const visibleCopy = result.notes
      .flatMap((note) => [note.target, note.text])
      .join(" ");

    expect(result.source).toBe("text_intake_review");
    expect(result.candidateCount).toBeGreaterThanOrEqual(2);
    expect(result.addedCount).toBeGreaterThanOrEqual(2);
    expect(result.skippedExistingCount).toBe(0);
    expect(result.truncatedCount).toBe(0);
    expect(result.notes.length).toBeGreaterThanOrEqual(2);
    expect(result.notes[0]).toMatchObject({
      createdBy: "operator-1",
      createdAt: "2026-06-14T08:00:00.000Z",
      status: "open",
      severity: "blocking",
      applicantId: "applicant-1",
      fieldKey: "email",
    });
    expect(visibleCopy).toContain("Email указан в некорректном формате");
    expect(visibleCopy).toContain("Паспорт заканчивается до даты поездки");
    expect(visibleCopy).not.toMatch(
      /Email format is invalid|Passport expires before|approved|guaranteed|officially verified|approval odds|visa odds/i,
    );
  });

  test("falls back only to agent-owned preflight blockers when text intake has no findings", () => {
    const result = buildSmartCorrectionReturnPackage(
      submission({
        applicants: [
          applicant({
            mediaSlots: uploadedMediaSlots("applicant-1").map((slot) =>
              slot.type === "selfie" ? { ...slot, state: "missing" } : slot,
            ),
          }),
        ],
      }),
      {
        createdBy: "operator-1",
        createdAt: "2026-06-14T08:00:00.000Z",
        idFactory: idFactory(),
      },
    );

    expect(result.source).toBe("agent_preflight_fallback");
    expect(result.notes).toEqual([
      expect.objectContaining({
        target: "Ручная проверка",
        scope: "submission",
        severity: "blocking",
        text: expect.stringContaining("добавить селфи"),
      }),
    ]);
    expect(result.notes.map((note) => note.text).join(" ")).not.toContain(
      "оператор должен принять все медиа",
    );
    expect(result.guardrails.join(" ")).toContain("не заменяет проверку медиа");
  });

  test("does not replace already-open fallback blockers with a generic note", () => {
    const existingText =
      "Исправьте перед повторной передачей: Artem Sokolov: добавить селфи n1";
    const result = buildSmartCorrectionReturnPackage(
      submission({
        applicants: [
          applicant({
            mediaSlots: uploadedMediaSlots("applicant-1").map((slot) =>
              slot.type === "selfie" ? { ...slot, state: "missing" } : slot,
            ),
          }),
        ],
        notes: [
          {
            target: "Legacy preflight target",
            text: existingText,
            scope: "submission",
            severity: "blocking",
            status: "open",
          },
        ],
      }),
      {
        createdBy: "operator-1",
        createdAt: "2026-06-14T08:00:00.000Z",
        idFactory: idFactory(),
      },
    );

    expect(result.source).toBe("agent_preflight_fallback");
    expect(result.notes).toEqual([]);
    expect(result.candidateCount).toBe(1);
    expect(result.addedCount).toBe(0);
    expect(result.skippedExistingCount).toBe(1);
    expect(result.summary).toBe(
      "Preflight: новые замечания не добавлены: 1 уже открыто.",
    );
  });

  test("uses a generic manual note when only operator-owned acceptance remains", () => {
    const result = buildSmartCorrectionReturnPackage(
      submission({
        applicants: [
          applicant({
            mediaSlots: uploadedMediaSlots("applicant-1"),
          }),
        ],
      }),
      {
        createdBy: "operator-1",
        createdAt: "2026-06-14T08:00:00.000Z",
        idFactory: idFactory(),
      },
    );

    expect(result.source).toBe("agent_preflight_fallback");
    expect(result.notes).toEqual([
      expect.objectContaining({
        text: "Исправьте перед повторной передачей: Оператор вернул заявку на ручное уточнение перед повторной передачей.",
      }),
    ]);
    expect(result.notes.map((note) => note.text).join(" ")).not.toContain(
      "оператор должен принять все медиа",
    );
  });

  test("does not duplicate already-open correction text with a legacy target", () => {
    const existingText =
      "Email указан в некорректном формате. Введите корректный email или подтвердите правильный канал связи.";
    const result = buildSmartCorrectionReturnPackage(
      submission({
        applicants: [
          applicant({
            email: "not-an-email",
          }),
        ],
        notes: [
          {
            target: "Legacy email target",
            text: existingText,
            scope: "field",
            applicantId: "applicant-1",
            fieldKey: "email",
            severity: "blocking",
            status: "open",
          },
        ],
      }),
      {
        createdBy: "operator-1",
        createdAt: "2026-06-14T08:00:00.000Z",
        idFactory: idFactory(),
      },
    );

    expect(result.notes).toEqual([]);
    expect(result.summary).toBe("Новые замечания не добавлены: 1 уже открыто.");
    expect(result.candidateCount).toBe(1);
    expect(result.addedCount).toBe(0);
    expect(result.skippedExistingCount).toBe(1);
  });

  test("keeps overflow summary inside the configured note limit", () => {
    const result = buildSmartCorrectionReturnPackage(
      submission({
        applicants: [
          applicant({
            name: "-",
            email: "not-an-email",
            phone: "123",
            passport: "-",
            passportExpiresAt: "2026-01-01",
          }),
        ],
      }),
      {
        createdBy: "operator-1",
        createdAt: "2026-06-14T08:00:00.000Z",
        idFactory: idFactory(),
        maxNotes: 2,
      },
    );

    expect(result.notes).toHaveLength(2);
    expect(result.truncatedCount).toBeGreaterThan(0);
    expect(result.summary).toContain("ещё");
    expect(result.summary).toContain("осталось в текстовой проверке");
    expect(result.notes.at(-1)?.text).toContain("Есть ещё");
  });
});
