import { describe, expect, test } from "vitest";
import {
  applyPassportExtractionField,
  applySafePassportExtractionFields,
  canStartPassportExtraction,
  finishPassportExtraction,
  hasPassportExtractionReviewPending,
  markPassportExtractionReviewed,
  passportExtractionAttemptUsage,
  passportExtractionEnabledFromEnv,
  passportExtractionRows,
  requiresPassportExtractionReviewBeforeAction,
  startPassportExtraction,
} from "../../src/modules/submissions/passportExtraction";
import {
  createDraftSubmission,
  uploadRequiredFile,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import { canPerformAction } from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";
import type { PassportExtractionResult } from "../../src/modules/submissions/passportExtractionContract";
import { parsePassportMrzText } from "../../src/modules/submissions/passportExtractionService";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function draftSubmission(): Submission {
  return createDraftSubmission({
    applicantNames: ["Иванов Иван"],
    city: "Москва",
    familyCount: 1,
    idScheme: "supabase",
    submissions: [],
    type: "single",
  });
}

function passportFile(submission: Submission, applicantIndex = 0) {
  const applicantId = submission.applicants[applicantIndex]?.id;
  const file = submission.files.find(
    (item) => item.type === "passport_scan" && item.applicantId === applicantId,
  );
  if (!file) throw new Error("expected passport slot");
  return file;
}

function questionnaireValue(
  submission: Submission,
  fieldId: string,
  applicantIndex = 0,
) {
  return (
    submission.applicants[applicantIndex]?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)?.value ?? ""
  );
}

function questionnaireField(
  submission: Submission,
  fieldId: string,
  applicantIndex = 0,
) {
  return submission.applicants[applicantIndex]?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === fieldId);
}

function sectionIdForField(submission: Submission, fieldId: string) {
  const section = submission.applicants[0]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);
  return section.id;
}

const extractedPassportNumber: PassportExtractionResult = {
  fields: [
    {
      confidence: "high",
      key: "passportNumber",
      needsManualReview: true,
      value: "765432100",
    },
  ],
  guardrails: [],
  source: "edge-provider",
  status: "extracted",
  summary: "Данные паспорта подготовлены.",
};

const rotatedPassportNumber: PassportExtractionResult = {
  ...extractedPassportNumber,
  orientation: {
    corrected: true,
    reason: "mrz_detected",
    rotation: 270,
  },
  source: "local-ocr",
  summary: "Локальный OCR повернул паспорт на 270° и нашёл поля MRZ.",
};

describe("passport extraction state", () => {
  test("keeps the client feature disabled unless explicitly enabled", () => {
    expect(passportExtractionEnabledFromEnv({})).toBe(false);
    expect(
      passportExtractionEnabledFromEnv({
        VITE_PASSPORT_EXTRACTION_ENABLED: "true",
      }),
    ).toBe(true);
  });

  test("applies extracted passport data into empty questionnaire fields", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const ready = finishPassportExtraction(draft, file, extractedPassportNumber);
    const applicantId = ready.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");

    const applied = applyPassportExtractionField(
      ready,
      applicantId,
      "passportNumber",
      "safe",
    );

    expect(questionnaireValue(applied, "passport-no")).toBe("765432100");
    expect(questionnaireField(applied, "passport-no")).toMatchObject({
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
    });
    expect(applied.applicants[0]?.passportExtraction?.appliedFieldKeys).toContain(
      "passportNumber",
    );
  });

  test("autofills safe passport fields after creation extraction", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const ready = finishPassportExtraction(draft, file, {
      fields: [
        {
          confidence: "high",
          key: "surname",
          needsManualReview: true,
          value: "VOLKOV",
        },
        {
          confidence: "high",
          key: "firstName",
          needsManualReview: true,
          value: "ANTON",
        },
        {
          confidence: "medium",
          key: "birthDate",
          needsManualReview: true,
          value: "20.08.1990",
        },
        {
          confidence: "low",
          key: "birthPlace",
          needsManualReview: true,
          value: "LENINGRAD",
        },
        {
          confidence: "medium",
          key: "birthCountry",
          needsManualReview: true,
          value: "USSR",
        },
        {
          confidence: "medium",
          key: "citizenship",
          needsManualReview: true,
          value: "Russian Federation",
        },
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: true,
          value: "765432100",
        },
        {
          confidence: "medium",
          key: "passportIssuedAt",
          needsManualReview: true,
          value: "26.02.2016",
        },
        {
          confidence: "low",
          key: "passportIssuePlace",
          needsManualReview: true,
          value: "FMS 78039",
        },
        {
          confidence: "medium",
          key: "passportExpiresAt",
          needsManualReview: true,
          value: "26.02.2026",
        },
      ],
      guardrails: [],
      source: "edge-provider",
      status: "extracted",
      summary: "Данные паспорта подготовлены.",
    });
    const applicantId = ready.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");

    const autofilled = applySafePassportExtractionFields(ready, applicantId);

    expect(questionnaireValue(autofilled, "surname")).toBe("VOLKOV");
    expect(questionnaireValue(autofilled, "first-name")).toBe("ANTON");
    expect(questionnaireValue(autofilled, "birth-date")).toBe("20.08.1990");
    expect(questionnaireValue(autofilled, "birth-place")).toBe("LENINGRAD");
    expect(questionnaireValue(autofilled, "birth-country")).toBe("USSR");
    expect(questionnaireValue(autofilled, "nationality")).toBe("Russian Federation");
    expect(questionnaireValue(autofilled, "passport-no")).toBe("765432100");
    expect(questionnaireValue(autofilled, "passport-issue-date")).toBe("26.02.2016");
    expect(questionnaireValue(autofilled, "passport-issue-place")).toBe("FMS 78039");
    expect(questionnaireValue(autofilled, "passport-expiry-date")).toBe("26.02.2026");
    expect(questionnaireField(autofilled, "surname")).toMatchObject({
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
    });
    expect(questionnaireField(autofilled, "passport-no")).toMatchObject({
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
    });
    expect(autofilled.applicants[0]?.passportExtraction?.appliedFieldKeys).toEqual(
      expect.arrayContaining([
        "surname",
        "firstName",
        "birthDate",
        "birthPlace",
        "birthCountry",
        "citizenship",
        "passportNumber",
        "passportIssuedAt",
        "passportIssuePlace",
        "passportExpiresAt",
      ]),
    );
  });

  test("autofills a family draft per applicant without mixing passport data", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "PETROVA ANNA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "supabase",
      submissions: [],
      type: "family",
    });
    const primaryFile = passportFile(draft, 0);
    const spouseFile = passportFile(draft, 1);

    const withPrimaryExtraction = finishPassportExtraction(draft, primaryFile, {
      fields: [
        {
          confidence: "high",
          key: "surname",
          needsManualReview: true,
          value: "VOLKOV",
        },
        {
          confidence: "high",
          key: "firstName",
          needsManualReview: true,
          value: "ANTON",
        },
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: true,
          value: "752869613",
        },
        {
          confidence: "medium",
          key: "passportExpiresAt",
          needsManualReview: true,
          value: "26.02.2026",
        },
      ],
      guardrails: [],
      source: "local-ocr",
      status: "extracted",
      summary: "Primary passport extracted.",
    });
    const withBothExtractions = finishPassportExtraction(
      withPrimaryExtraction,
      spouseFile,
      {
        fields: [
          {
            confidence: "high",
            key: "surname",
            needsManualReview: true,
            value: "PETROVA",
          },
          {
            confidence: "high",
            key: "firstName",
            needsManualReview: true,
            value: "ANNA",
          },
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: true,
            value: "701234567",
          },
          {
            confidence: "medium",
            key: "passportExpiresAt",
            needsManualReview: true,
            value: "10.01.2031",
          },
        ],
        guardrails: [],
        source: "local-ocr",
        status: "extracted",
        summary: "Spouse passport extracted.",
      },
    );

    const withPrimaryFields = applySafePassportExtractionFields(
      withBothExtractions,
      withBothExtractions.applicants[0]?.id ?? "",
    );
    const autofilled = applySafePassportExtractionFields(
      withPrimaryFields,
      withPrimaryFields.applicants[1]?.id ?? "",
    );

    expect(autofilled.title).toBe("Семья VOLKOVых");
    expect(autofilled.applicants.map((applicant) => applicant.fullName)).toEqual([
      "VOLKOV ANTON",
      "PETROVA ANNA",
    ]);
    expect(questionnaireValue(autofilled, "surname", 0)).toBe("VOLKOV");
    expect(questionnaireValue(autofilled, "first-name", 0)).toBe("ANTON");
    expect(questionnaireValue(autofilled, "passport-no", 0)).toBe("752869613");
    expect(questionnaireValue(autofilled, "passport-expiry-date", 0)).toBe(
      "26.02.2026",
    );
    expect(questionnaireValue(autofilled, "surname", 1)).toBe("PETROVA");
    expect(questionnaireValue(autofilled, "first-name", 1)).toBe("ANNA");
    expect(questionnaireValue(autofilled, "passport-no", 1)).toBe("701234567");
    expect(questionnaireValue(autofilled, "passport-expiry-date", 1)).toBe(
      "10.01.2031",
    );
  });

  test("tracks free extraction attempts without blocking retries", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const applicant = draft.applicants[0];
    if (!applicant) throw new Error("expected applicant");

    expect(passportExtractionAttemptUsage(applicant)).toMatchObject({
      used: 0,
    });

    const started = startPassportExtraction(draft, file);
    const startedApplicant = started.applicants[0];
    if (!startedApplicant) throw new Error("expected started applicant");

    expect(passportExtractionAttemptUsage(startedApplicant)).toMatchObject({
      used: 1,
    });
    expect(canStartPassportExtraction(startedApplicant)).toBe(false);

    const finished = finishPassportExtraction(started, file, extractedPassportNumber);
    const finishedApplicant = finished.applicants[0];
    if (!finishedApplicant) throw new Error("expected finished applicant");

    expect(passportExtractionAttemptUsage(finishedApplicant)).toMatchObject({
      used: 1,
    });
    expect(canStartPassportExtraction(finishedApplicant)).toBe(true);

    const restarted = startPassportExtraction(finished, file);
    expect(
      passportExtractionAttemptUsage(restarted.applicants[0] ?? applicant),
    ).toMatchObject({
      used: 2,
    });
  });

  test("does not store provider fingerprints for safe unavailable extraction", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const ready = finishPassportExtraction(draft, file, {
      fields: [],
      guardrails: [],
      source: "edge-stub",
      status: "unavailable",
      summary: "Данные не удалось распознать автоматически. Требуется ручная проверка.",
    });

    expect(ready.applicants[0]?.passportExtraction).toMatchObject({
      extractedFields: [],
      status: "unavailable",
    });
    expect(
      ready.applicants[0]?.passportExtraction?.openaiAttemptedForFingerprint,
    ).toBeUndefined();
  });

  test("stores automatic orientation correction from local OCR", () => {
    const draft = draftSubmission();
    const ready = finishPassportExtraction(
      draft,
      passportFile(draft),
      rotatedPassportNumber,
    );

    expect(ready.applicants[0]?.passportExtraction?.orientation).toEqual({
      corrected: true,
      reason: "mrz_detected",
      rotation: 270,
    });
    expect(ready.applicants[0]?.passportExtraction?.summary).toContain("270°");
  });

  test("does not overwrite conflicting values unless the operator chooses replace", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const applicantId = draft.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");

    const withExisting = updateQuestionnaireField(draft, {
      applicantId,
      fieldId: "passport-no",
      sectionId: sectionIdForField(draft, "passport-no"),
      value: "OLD-PASSPORT",
    });
    const ready = finishPassportExtraction(withExisting, file, extractedPassportNumber);

    const safe = applyPassportExtractionField(
      ready,
      applicantId,
      "passportNumber",
      "safe",
    );
    expect(questionnaireValue(safe, "passport-no")).toBe("OLD-PASSPORT");
    expect(passportExtractionRows(safe.applicants[0] ?? ready.applicants[0])).toEqual(
      expect.arrayContaining([expect.objectContaining({ conflict: true })]),
    );

    const replaced = applyPassportExtractionField(
      ready,
      applicantId,
      "passportNumber",
      "replace",
    );
    expect(questionnaireValue(replaced, "passport-no")).toBe("765432100");
  });

  test("requires one explicit review decision before admin submission", () => {
    const draft = draftSubmission();
    const ready = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassportNumber,
    );

    expect(hasPassportExtractionReviewPending(ready)).toBe(true);

    const reviewed = markPassportExtractionReviewed(ready, "verified");
    expect(hasPassportExtractionReviewPending(reviewed)).toBe(false);
    expect(reviewed.applicants[0]?.passportExtraction?.verifiedAtIso).toBeTruthy();
    expect(reviewed.history[0]?.text).toContain("проверил");
  });

  test("requires review before submitting corrections after passport extraction", () => {
    const draft = {
      ...draftSubmission(),
      status: "returned" as const,
    };
    const ready = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassportNumber,
    );

    expect(
      requiresPassportExtractionReviewBeforeAction(ready, "submit_corrections"),
    ).toBe(true);
    expect(
      requiresPassportExtractionReviewBeforeAction(ready, "submit_for_review"),
    ).toBe(true);

    const reviewed = markPassportExtractionReviewed(ready, "verified");
    expect(
      requiresPassportExtractionReviewBeforeAction(reviewed, "submit_corrections"),
    ).toBe(false);
  });

  test("blocks domain submit actions until passport extraction review is explicit", () => {
    const base = fillRequiredQuestionnaireForTest(draftSubmission());
    const draft = {
      ...base,
      completeness: { questionnaire: 100, files: 100, total: 100 },
      files: base.files.map((file) => ({
        ...file,
        status: "accepted" as const,
      })),
      status: "in_progress" as const,
      tripDateFrom: "2026-07-10",
      tripDateTo: "2026-07-18",
    };
    const ready = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassportNumber,
    );

    expect(canPerformAction(ready, "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Проверьте распознанные паспортные данные перед отправкой",
    });

    const reviewed = markPassportExtractionReviewed(ready, "verified");
    expect(canPerformAction(reviewed, "submit_for_review", "agent")).toEqual({
      ok: true,
    });
  });

  test("clears stale passport extraction review when the passport scan changes", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const ready = finishPassportExtraction(draft, file, extractedPassportNumber);
    const reviewed = markPassportExtractionReviewed(ready, "verified");

    expect(reviewed.applicants[0]?.passportExtraction?.verifiedAtIso).toBeTruthy();

    const replaced = uploadRequiredFile(reviewed, file.id, {
      generatedFileName: "new-passport.jpg",
      mimeType: "image/jpeg",
      originalFileName: "new-passport.jpg",
      sizeBytes: 1024,
      storageBucket: "submission-media",
      storagePath: `${reviewed.id}/${file.applicantId}/passport_scan/new-passport.jpg`,
      uploadedAtIso: "2026-06-18T00:00:00.000Z",
    });

    expect(replaced.applicants[0]?.passportExtraction).toBeUndefined();
  });

  test("parses local MRZ text into manual-review passport fields", () => {
    const fields = parsePassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "surname",
          needsManualReview: true,
          value: "IVANOV",
        }),
        expect.objectContaining({
          key: "firstName",
          value: "IVAN",
        }),
        expect.objectContaining({
          key: "passportNumber",
          value: "123456789",
        }),
        expect.objectContaining({
          key: "passportExpiresAt",
          value: "26.02.2026",
        }),
      ]),
    );
  });

  test("drops trailing OCR filler tokens from MRZ given names", () => {
    const fields = parsePassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<K<K".padEnd(44, "<"),
        "1234567897RUS9008205M2602268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "firstName",
          value: "IVAN",
        }),
      ]),
    );
    expect(fields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "firstName",
          value: "IVAN K K",
        }),
      ]),
    );
  });

  test("rejects MRZ text when check digits do not match", () => {
    const fields = parsePassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567890RUS9008205M2602268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(fields).toEqual([]);
  });

  test("normalizes common OCR digit substitutions before MRZ check digits", () => {
    const fields = parsePassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "I234567897RUS9OO82O5M26O2268<<<<<<<<<<<<<<00",
      ].join("\n"),
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "passportNumber",
          value: "123456789",
        }),
        expect.objectContaining({
          key: "birthDate",
          value: "20.08.1990",
        }),
        expect.objectContaining({
          key: "passportExpiresAt",
          value: "26.02.2026",
        }),
      ]),
    );
  });

  test("accepts OCR line2 with valid critical checks and noisy optional tail", () => {
    const fields = parsePassportMrzText(
      [
        "P<RUSIVANOV<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
        "1234567897RUS9008205M2602268<<<<<<<<L<LL<<<<00RB",
      ].join("\n"),
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "passportNumber",
          value: "123456789",
        }),
        expect.objectContaining({
          key: "passportExpiresAt",
          value: "26.02.2026",
        }),
      ]),
    );
  });
});
