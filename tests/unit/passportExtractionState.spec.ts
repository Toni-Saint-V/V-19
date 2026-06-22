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

function passportFile(submission: Submission) {
  const file = submission.files.find((item) => item.type === "passport_scan");
  if (!file) throw new Error("expected passport slot");
  return file;
}

function questionnaireValue(submission: Submission, fieldId: string) {
  return (
    submission.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)?.value ?? ""
  );
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
          key: "passportNumber",
          needsManualReview: true,
          value: "765432100",
        },
        {
          confidence: "medium",
          key: "passportExpiresAt",
          needsManualReview: true,
          value: "26.02.2030",
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

    expect(questionnaireValue(autofilled, "passport-no")).toBe("765432100");
    expect(questionnaireValue(autofilled, "passport-expiry-date")).toBe("26.02.2030");
    expect(autofilled.applicants[0]?.passportExtraction?.appliedFieldKeys).toEqual(
      expect.arrayContaining(["passportNumber", "passportExpiresAt"]),
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

  test("stores the OpenAI fallback fingerprint when provider was attempted", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const ready = finishPassportExtraction(
      draft,
      file,
      {
        fields: [
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: true,
            value: "765432100",
          },
        ],
        guardrails: [],
        openAiAttempted: true,
        source: "openai-vision",
        status: "extracted",
        summary: "OpenAI fallback извлек паспортные поля.",
      },
      "passport-fingerprint-1",
    );

    expect(ready.applicants[0]?.passportExtraction).toMatchObject({
      openaiAttemptedForFingerprint: "passport-fingerprint-1",
      status: "ready",
    });
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
    const draft = {
      ...draftSubmission(),
      completeness: { questionnaire: 100, files: 100, total: 100 },
      files: draftSubmission().files.map((file) => ({
        ...file,
        status: "accepted" as const,
      })),
      status: "in_progress" as const,
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
