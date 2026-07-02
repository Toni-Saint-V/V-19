import { describe, expect, test } from "vitest";
import { buildPassportExtractionBrief } from "../../src/modules/submissions/passportExtractionBrief";
import {
  applyPassportExtractionField,
  finishPassportExtraction,
  markPassportExtractionReviewed,
  startPassportExtraction,
} from "../../src/modules/submissions/passportExtraction";
import {
  createDraftSubmission,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";
import type { PassportExtractionResult } from "../../src/modules/submissions/passportExtractionContract";

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

function sectionIdForField(submission: Submission, fieldId: string) {
  const section = submission.applicants[0]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);
  return section.id;
}

const extractedPassport: PassportExtractionResult = {
  fields: [
    {
      confidence: "high",
      key: "passportNumber",
      needsManualReview: true,
      value: "765432100",
    },
    {
      confidence: "low",
      key: "surname",
      needsManualReview: true,
      value: "IVANOV",
    },
  ],
  guardrails: [],
  source: "edge-provider",
  status: "extracted",
  summary: "Данные паспорта подготовлены.",
};

describe("passport extraction brief", () => {
  test("summarizes pending passport review and blocks submit actions", () => {
    const draft = draftSubmission();
    const ready = finishPassportExtraction(draft, passportFile(draft), extractedPassport);

    const brief = buildPassportExtractionBrief(ready);

    expect(brief.status).toBe("review_required");
    expect(brief.blockedActions).toEqual([
      "submit_for_review",
      "submit_corrections",
    ]);
    expect(brief.metrics).toMatchObject({
      conflicts: 0,
      fieldsExtracted: 2,
      lowConfidenceFields: 1,
      manualReviewFields: 2,
      safeFieldsToApply: 2,
    });
    expect(brief.nextStep).toEqual({
      action: "apply_safe_fields",
      label: "Примените безопасные поля в анкету",
    });
    expect(brief.guardrails.join(" ")).not.toMatch(/официальн.+проверен|гарант/i);
  });

  test("prioritizes blocking passport expiry issues over field application", () => {
    const draft = draftSubmission();
    const ready = finishPassportExtraction(draft, passportFile(draft), {
      ...extractedPassport,
      fields: [
        ...extractedPassport.fields,
        {
          confidence: "medium",
          key: "passportExpiresAt",
          needsManualReview: true,
          value: "01.01.2000",
        },
      ],
    });

    const brief = buildPassportExtractionBrief(ready);

    expect(brief.nextStep).toEqual({
      action: "verify_review",
      label: "Проверить срок действия паспорта",
    });
  });

  test.each(["31.12.2099", "not-a-date"])(
    "does not block safe application for non-expired passport expiry value %s",
    (expiryValue) => {
      const draft = draftSubmission();
      const ready = finishPassportExtraction(draft, passportFile(draft), {
        ...extractedPassport,
        fields: [
          ...extractedPassport.fields,
          {
            confidence: "medium",
            key: "passportExpiresAt",
            needsManualReview: true,
            value: expiryValue,
          },
        ],
      });

      const brief = buildPassportExtractionBrief(ready);

      expect(brief.nextStep).toEqual({
        action: "apply_safe_fields",
        label: "Примените безопасные поля в анкету",
      });
    },
  );

  test("prioritizes conflicts over safe field application", () => {
    const draft = draftSubmission();
    const applicantId = draft.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");
    const withExistingPassport = updateQuestionnaireField(draft, {
      applicantId,
      fieldId: "passport-no",
      sectionId: sectionIdForField(draft, "passport-no"),
      value: "OLD-PASSPORT",
    });
    const ready = finishPassportExtraction(
      withExistingPassport,
      passportFile(draft),
      extractedPassport,
    );

    const brief = buildPassportExtractionBrief(ready);

    expect(brief.metrics.conflicts).toBe(1);
    expect(brief.applicants[0]?.conflictFieldKeys).toEqual(["passportNumber"]);
    expect(brief.nextStep).toEqual({
      action: "resolve_conflicts",
      label: "Разберите конфликтные паспортные поля вручную",
    });
  });

  test("moves to verify review after safe fields are applied", () => {
    const draft = draftSubmission();
    const ready = finishPassportExtraction(draft, passportFile(draft), extractedPassport);
    const applicantId = ready.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");

    const appliedPassport = applyPassportExtractionField(
      ready,
      applicantId,
      "passportNumber",
    );
    const appliedAll = applyPassportExtractionField(
      appliedPassport,
      applicantId,
      "surname",
    );

    const brief = buildPassportExtractionBrief(appliedAll);

    expect(brief.metrics.safeFieldsToApply).toBe(0);
    expect(brief.metrics.fieldsApplied).toBe(2);
    expect(brief.nextStep).toEqual({
      action: "verify_review",
      label: "Подтвердите ручную проверку паспортных данных",
    });
  });

  test("does not block submit actions after explicit review", () => {
    const draft = draftSubmission();
    const ready = finishPassportExtraction(draft, passportFile(draft), extractedPassport);
    const reviewed = markPassportExtractionReviewed(ready, "verified");

    const brief = buildPassportExtractionBrief(reviewed);

    expect(brief.status).toBe("reviewed");
    expect(brief.blockedActions).toEqual([]);
    expect(brief.nextStep.action).toBe("apply_safe_fields");
  });

  test("reports active extraction as wait state", () => {
    const draft = draftSubmission();
    const extracting = startPassportExtraction(draft, passportFile(draft));

    const brief = buildPassportExtractionBrief(extracting);

    expect(brief.status).toBe("extracting");
    expect(brief.nextStep).toEqual({
      action: "wait",
      label: "Дождитесь завершения распознавания",
    });
  });
});
