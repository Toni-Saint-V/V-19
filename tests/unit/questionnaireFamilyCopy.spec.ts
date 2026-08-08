// tests/unit/questionnaireFamilyCopy.spec.ts
import { describe, expect, test, vi } from "vitest";

import {
  buildAutomaticQuestionnaireFamilyCopyUpdates,
  buildQuestionnaireFamilyCopyPlan,
  isQuestionnaireFamilyCopyField,
  type QuestionnaireFamilyCopyBinding,
} from "../../src/modules/submissions/questionnaireFamilyCopy";
import type {
  Applicant,
  QuestionnaireField,
  QuestionnaireReviewSource,
} from "../../src/modules/submissions/types";

function questionnaireField(
  id: string,
  value: string,
  provenance: {
    reviewOriginSource?: QuestionnaireReviewSource;
    reviewSource?: QuestionnaireReviewSource;
  } = {},
): QuestionnaireField {
  return {
    id,
    label: id,
    required: false,
    value,
    ...provenance,
  };
}

function applicant(id: string, fields: QuestionnaireField[]): Applicant {
  return {
    fileStatus: "partial",
    fullName: id,
    id,
    questionnaireStatus: "partial",
    sections: [
      {
        fields,
        id: `${id}-contacts`,
        status: "partial",
        title: "Адрес и контакты",
      },
    ],
  };
}

function binding(
  canonicalFieldId: string,
  candidateFieldIds: readonly string[] = [canonicalFieldId],
): QuestionnaireFamilyCopyBinding {
  return {
    candidateFieldIds,
    canonicalFieldId,
    sectionId: "contacts",
  };
}

describe("questionnaire family copy plan", () => {
  test("mirrors a live source edit to every recipient, including an empty value", () => {
    const source = applicant("main", [
      questionnaireField("home-city", "Москва", { reviewSource: "manual" }),
    ]);
    const spouse = applicant("spouse", [questionnaireField("home-city", "Казань")]);
    const child = applicant("child", [questionnaireField("home-city", "Самара")]);

    const updates = buildAutomaticQuestionnaireFamilyCopyUpdates({
      binding: binding("home-city"),
      recipients: [source, spouse, child],
      sourceApplicant: source,
      sourceUpdate: {
        applicantId: source.id,
        fieldId: "home-city",
        sectionId: "contacts",
        value: "",
      },
      validate: () => undefined,
    });

    expect(updates).toEqual([
      expect.objectContaining({
        applicantId: "spouse",
        fieldId: "home-city",
        reviewSource: "family_shared",
        reviewState: "confirmed",
        value: "",
      }),
      expect.objectContaining({
        applicantId: "child",
        fieldId: "home-city",
        reviewSource: "family_shared",
        reviewState: "confirmed",
        value: "",
      }),
    ]);
  });

  test("rejects contact identity and residence fields outside the Russia address allowlist", () => {
    expect(isQuestionnaireFamilyCopyField("contacts", "home-city")).toBe(true);
    expect(isQuestionnaireFamilyCopyField("hotel", "hotel-address")).toBe(true);
    expect(isQuestionnaireFamilyCopyField("contacts", "email")).toBe(false);
    expect(isQuestionnaireFamilyCopyField("contacts", "phone")).toBe(false);
    expect(isQuestionnaireFamilyCopyField("contacts", "livesOutsideRussia")).toBe(
      false,
    );
    expect(isQuestionnaireFamilyCopyField("trip", "arrival-date")).toBe(false);
  });

  test("copies manual values as confirmed family-shared updates", () => {
    const source = applicant("main", [
      questionnaireField("home-city", "Москва", { reviewSource: "manual" }),
    ]);
    const recipient = applicant("spouse", [questionnaireField("home-city", "Казань")]);
    const validate = vi.fn(() => "Проверьте значение");

    const plan = buildQuestionnaireFamilyCopyPlan({
      bindings: [binding("home-city")],
      recipients: [recipient],
      sourceApplicant: source,
      validate,
    });

    expect(plan).toEqual({
      affectedApplicants: 1,
      previewFields: [
        { applicantId: "spouse", fieldId: "home-city" },
        { applicantId: "main", fieldId: "home-city" },
      ],
      updates: [
        {
          applicantId: "spouse",
          error: "Проверьте значение",
          fieldId: "home-city",
          reviewOriginSource: "family_shared",
          reviewSource: "family_shared",
          reviewState: "confirmed",
          sectionId: "contacts",
          value: "Москва",
        },
      ],
    });
    expect(validate).toHaveBeenCalledWith(recipient.sections[0]?.fields[0], "Москва");
  });

  test("copies only current or legacy manual provenance", () => {
    const source = applicant("main", [
      questionnaireField("default-value", "Spain"),
      questionnaireField("ocr-value", "OCR", {
        reviewOriginSource: "manual",
        reviewSource: "passport_ocr",
      }),
      questionnaireField("shared-value", "Shared", {
        reviewOriginSource: "manual",
        reviewSource: "family_shared",
      }),
      questionnaireField("legacy-manual", "Manual", {
        reviewOriginSource: "manual",
      }),
    ]);
    const recipient = applicant("child", [
      questionnaireField("default-value", ""),
      questionnaireField("ocr-value", ""),
      questionnaireField("shared-value", ""),
      questionnaireField("legacy-manual", ""),
    ]);

    const plan = buildQuestionnaireFamilyCopyPlan({
      bindings: [
        binding("default-value"),
        binding("ocr-value"),
        binding("shared-value"),
        binding("legacy-manual"),
      ],
      recipients: [recipient],
      sourceApplicant: source,
      validate: () => undefined,
    });

    expect(plan.updates).toEqual([
      expect.objectContaining({
        applicantId: "child",
        fieldId: "legacy-manual",
        value: "Manual",
      }),
    ]);
  });

  test("resolves canonical and legacy field aliases per applicant", () => {
    const source = applicant("main", [
      questionnaireField("fingerprints-collected", "Да", {
        reviewSource: "manual",
      }),
    ]);
    const legacyRecipient = applicant("spouse", [
      questionnaireField("fingerprints-collected", "Нет"),
    ]);
    const canonicalRecipient = applicant("child", [
      questionnaireField("previous-biometrics", "Нет"),
      questionnaireField("fingerprints-collected", "Да"),
    ]);

    const plan = buildQuestionnaireFamilyCopyPlan({
      bindings: [
        binding("previous-biometrics", [
          "previous-biometrics",
          "fingerprints-collected",
        ]),
      ],
      recipients: [legacyRecipient, canonicalRecipient],
      sourceApplicant: source,
      validate: () => undefined,
    });

    expect(plan.updates).toEqual([
      expect.objectContaining({
        applicantId: "spouse",
        fieldId: "fingerprints-collected",
        value: "Да",
      }),
      expect.objectContaining({
        applicantId: "child",
        fieldId: "previous-biometrics",
        value: "Да",
      }),
    ]);
    expect(plan.previewFields).toEqual(
      expect.arrayContaining([
        { applicantId: "main", fieldId: "previous-biometrics" },
        { applicantId: "main", fieldId: "fingerprints-collected" },
        { applicantId: "spouse", fieldId: "previous-biometrics" },
        { applicantId: "spouse", fieldId: "fingerprints-collected" },
      ]),
    );
  });

  test("skips missing targets and de-duplicates overlapping bindings", () => {
    const source = applicant("main", [
      questionnaireField("home-city", "Самара", { reviewSource: "manual" }),
    ]);
    const recipient = applicant("spouse", [questionnaireField("home-city", "Москва")]);
    const recipientWithoutField = applicant("child", []);

    const plan = buildQuestionnaireFamilyCopyPlan({
      bindings: [binding("home-city"), binding("home-city")],
      recipients: [source, recipient, recipientWithoutField, recipient],
      sourceApplicant: source,
      validate: () => undefined,
    });

    expect(plan.affectedApplicants).toBe(1);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toEqual(
      expect.objectContaining({
        applicantId: "spouse",
        fieldId: "home-city",
        value: "Самара",
      }),
    );
  });
});
