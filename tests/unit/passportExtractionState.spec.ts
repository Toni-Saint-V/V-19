import { describe, expect, test } from "vitest";
import {
  applyPassportExtractionField,
  applySafePassportExtractionFields,
  canConfirmApplicantPassportReview,
  canStartPassportExtraction,
  confirmApplicantPassportReview,
  finishPassportExtraction,
  hasPassportExtractionReviewPending,
  markPassportExtractionReviewed,
  passportExtractionAttemptUsage,
  passportExtractionEnabledFromEnv,
  passportExtractionRows,
  requiresPassportExtractionReviewBeforeAction,
  startPassportExtraction,
} from "../../src/modules/submissions/passportExtraction";
import { passportGateIssues } from "../../src/modules/submissions/passportExtractionGuards";
import {
  createDraftSubmission,
  uploadRequiredFile,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import { canPerformAction } from "../../src/modules/submissions/status";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
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

  test("lets OCR replace only the canonical birth-country default", () => {
    const draft = draftSubmission();
    const file = passportFile(draft);
    const applicantId = draft.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");
    const extractedBirthCountry: PassportExtractionResult = {
      fields: [
        {
          confidence: "medium",
          key: "birthCountry",
          needsManualReview: true,
          value: "USSR",
        },
      ],
      guardrails: [],
      source: "edge-provider",
      status: "extracted",
      summary: "Страна рождения подготовлена.",
    };

    const readyDefault = finishPassportExtraction(draft, file, extractedBirthCountry);
    const autofilledDefault = applySafePassportExtractionFields(
      readyDefault,
      applicantId,
    );
    expect(questionnaireValue(autofilledDefault, "birth-country")).toBe("USSR");
    expect(questionnaireField(autofilledDefault, "birth-country")).toMatchObject({
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
    });

    const withManualCountry = updateQuestionnaireField(draft, {
      applicantId,
      fieldId: "birth-country",
      sectionId: sectionIdForField(draft, "birth-country"),
      value: "Spain",
    });
    const readyManual = finishPassportExtraction(
      withManualCountry,
      file,
      extractedBirthCountry,
    );
    const preservedManual = applySafePassportExtractionFields(readyManual, applicantId);
    expect(questionnaireValue(preservedManual, "birth-country")).toBe("Spain");
    expect(passportExtractionRows(preservedManual.applicants[0]!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conflict: true, key: "birthCountry" }),
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

    expect(autofilled.title).toBe("Семья Волковых");
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

  test("reconciles persisted confirmed OCR fields when the aggregate review timestamp is missing", () => {
    const draft = draftSubmission();
    const ready = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassportNumber,
    );
    const applicantId = ready.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");
    const applied = applyPassportExtractionField(ready, applicantId, "passportNumber");
    const persisted = {
      ...applied,
      applicants: applied.applicants.map((applicant) => ({
        ...applicant,
        passportExtraction: applicant.passportExtraction
          ? {
              ...applicant.passportExtraction,
              verifiedAtIso: undefined,
            }
          : undefined,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.reviewOriginSource === "passport_ocr"
              ? {
                  ...field,
                  reviewConfirmedAtIso: "2026-07-24T08:00:00.000Z",
                  reviewConfirmedBy: "agent-reviewer",
                  reviewSource: "manual" as const,
                  reviewState: "confirmed" as const,
                }
              : field,
          ),
        })),
      })),
    };

    expect(hasPassportExtractionReviewPending(persisted)).toBe(false);
    expect(passportGateIssues(persisted).map((issue) => issue.code)).not.toContain(
      "passport_extraction_not_reviewed",
    );

    const incompleteProof = {
      ...persisted,
      applicants: persisted.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.reviewOriginSource === "passport_ocr"
              ? {
                  ...field,
                  reviewConfirmedBy: undefined,
                }
              : field,
          ),
        })),
      })),
    };

    expect(hasPassportExtractionReviewPending(incompleteProof)).toBe(true);
    expect(passportGateIssues(incompleteProof).map((issue) => issue.code)).toContain(
      "passport_extraction_not_reviewed",
    );
  });

  test("allows an explicit manual passport review when OCR state is absent", () => {
    const base = fillRequiredQuestionnaireForTest(draftSubmission());
    const file = passportFile(base);
    const generatedFileName = "abc_passport_scan.png";
    const storageTarget = buildMediaStoragePath(
      base.id,
      file.applicantId,
      "passport_scan",
      generatedFileName,
    );
    const uploaded = uploadRequiredFile(base, file.id, {
      generatedFileName,
      mimeType: "image/png",
      originalFileName: "passport-test.png",
      sizeBytes: 1024,
      storageAdapter: "supabase-private",
      storageBucket: storageTarget.bucket,
      storagePath: storageTarget.path,
      uploadedAtIso: "2026-07-15T00:00:00.000Z",
    });

    expect(passportGateIssues(uploaded).map((issue) => issue.code)).toContain(
      "passport_not_confirmed",
    );

    const confirmed = confirmApplicantPassportReview(
      uploaded,
      file.applicantId,
      uploaded.agentId,
    );

    expect(confirmed.applicants[0]?.passportExtraction).toMatchObject({
      status: "unavailable",
      verifiedAtIso: expect.any(String),
    });
    expect(passportGateIssues(confirmed).map((issue) => issue.code)).not.toContain(
      "passport_not_confirmed",
    );
    expect(confirmed.history[0]?.text).toContain("проверил паспорт");

    const confirmedAgain = confirmApplicantPassportReview(
      confirmed,
      file.applicantId,
      confirmed.agentId,
    );
    expect(confirmedAgain).toBe(confirmed);
    expect(
      confirmedAgain.history.filter((entry) => entry.text.includes("проверил паспорт")),
    ).toHaveLength(1);
  });

  test("keeps manual passport review fail-closed before a durable upload and while extracting", () => {
    const base = fillRequiredQuestionnaireForTest(draftSubmission());
    const file = passportFile(base);

    expect(
      canConfirmApplicantPassportReview(base, file.applicantId, base.agentId),
    ).toBe(false);
    expect(
      confirmApplicantPassportReview(base, file.applicantId, base.agentId),
    ).toBe(base);

    const incompleteMetadata = uploadRequiredFile(base, file.id, {
      generatedFileName: "abc_passport_scan.png",
      mimeType: "image/png",
      originalFileName: "passport-incomplete.png",
      sizeBytes: 1024,
      uploadedAtIso: "2026-07-28T00:00:00.000Z",
    });
    expect(
      canConfirmApplicantPassportReview(
        incompleteMetadata,
        file.applicantId,
        incompleteMetadata.agentId,
      ),
    ).toBe(false);

    const generatedFileName = "def_passport_scan.png";
    const storageTarget = buildMediaStoragePath(
      base.id,
      file.applicantId,
      "passport_scan",
      generatedFileName,
    );
    const foreignStorage = uploadRequiredFile(base, file.id, {
      generatedFileName,
      mimeType: "image/png",
      originalFileName: "passport-foreign.png",
      sizeBytes: 1024,
      storageAdapter: "supabase-private",
      storageBucket: storageTarget.bucket,
      storagePath: storageTarget.path.replace(base.id, "foreign-submission"),
      uploadedAtIso: "2026-07-28T00:00:00.000Z",
    });
    expect(
      canConfirmApplicantPassportReview(
        foreignStorage,
        file.applicantId,
        foreignStorage.agentId,
      ),
    ).toBe(false);

    const uploaded = uploadRequiredFile(base, file.id, {
      generatedFileName,
      mimeType: "image/png",
      originalFileName: "passport-extracting.png",
      sizeBytes: 1024,
      storageAdapter: "supabase-private",
      storageBucket: storageTarget.bucket,
      storagePath: storageTarget.path,
      uploadedAtIso: "2026-07-28T00:00:00.000Z",
    });
    const uploadedFile = passportFile(uploaded);
    const extracting = startPassportExtraction(uploaded, uploadedFile);

    expect(
      canConfirmApplicantPassportReview(
        extracting,
        file.applicantId,
        extracting.agentId,
      ),
    ).toBe(false);
    expect(
      confirmApplicantPassportReview(
        extracting,
        file.applicantId,
        extracting.agentId,
      ),
    ).toBe(extracting);
  });

  test("denies passport confirmation to a foreign agent and in read-only lifecycle states", () => {
    const base = fillRequiredQuestionnaireForTest(draftSubmission());
    const file = passportFile(base);
    const generatedFileName = "guarded_passport_scan.png";
    const storageTarget = buildMediaStoragePath(
      base.id,
      file.applicantId,
      "passport_scan",
      generatedFileName,
    );
    const uploaded = uploadRequiredFile(base, file.id, {
      generatedFileName,
      mimeType: "image/png",
      originalFileName: "guarded-passport.png",
      sizeBytes: 1024,
      storageAdapter: "supabase-private",
      storageBucket: storageTarget.bucket,
      storagePath: storageTarget.path,
      uploadedAtIso: "2026-07-28T00:00:00.000Z",
    });

    expect(
      canConfirmApplicantPassportReview(
        uploaded,
        file.applicantId,
        "foreign-agent",
      ),
    ).toBe(false);
    expect(
      confirmApplicantPassportReview(uploaded, file.applicantId, "foreign-agent"),
    ).toBe(uploaded);

    for (const status of [
      "submitted_for_review",
      "corrections_received",
      "ready_for_export",
      "exported",
    ] as const) {
      const readOnlySubmission = { ...uploaded, status };
      expect(
        canConfirmApplicantPassportReview(
          readOnlySubmission,
          file.applicantId,
          readOnlySubmission.agentId,
        ),
      ).toBe(false);
      expect(
        confirmApplicantPassportReview(
          readOnlySubmission,
          file.applicantId,
          readOnlySubmission.agentId,
        ),
      ).toBe(readOnlySubmission);
    }
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
