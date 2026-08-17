// tests/unit/questionnaireFamilyCopy.spec.ts
import { describe, expect, test, vi } from "vitest";

import {
  buildQuestionnaireFamilyCopyPlan,
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
  test("copies manual values as confirmed family-shared updates", () => {
    const source = applicant("main", [
      questionnaireField("home-city", "Москва", { reviewSource: "manual" }),
    ]);
    const recipient = applicant("spouse", [
      questionnaireField("home-city", "Казань"),
    ]);
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
      visibleFieldCount: 1,
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
    const recipient = applicant("spouse", [
      questionnaireField("home-city", "Москва"),
    ]);
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
    expect(plan.visibleFieldCount).toBe(1);
  });

  test("copies a home address atomically and clears stale optional parts", () => {
    const source = applicant("main", [
      questionnaireField("home-street", "Арбат", { reviewSource: "manual" }),
      questionnaireField("home-house", "1", { reviewSource: "manual" }),
      questionnaireField("home-building", ""),
      questionnaireField("home-unit", ""),
      questionnaireField("home-address", "Арбат, д 1", {
        reviewSource: "manual",
      }),
    ]);
    const recipient = applicant("spouse", [
      questionnaireField("home-street", "Тверская"),
      questionnaireField("home-house", "8"),
      questionnaireField("home-building", "2"),
      questionnaireField("home-unit", "14"),
      questionnaireField("home-address", "Тверская, д 8, корп 2, кв 14"),
    ]);
    const addressBindings: QuestionnaireFamilyCopyBinding[] = [
      "home-street",
      "home-house",
      "home-building",
      "home-unit",
      "home-address",
    ].map((fieldId) => ({
      ...binding(fieldId),
      copyEmpty: true,
      copyGroup: "home-address",
      copyGroupRequired: ["home-street", "home-house", "home-address"].includes(
        fieldId,
      ),
      previewFieldId: "home-street",
    }));

    const plan = buildQuestionnaireFamilyCopyPlan({
      bindings: addressBindings,
      recipients: [recipient],
      sourceApplicant: source,
      validate: () => undefined,
    });

    expect(plan.visibleFieldCount).toBe(1);
    expect(plan.previewFields).toEqual([
      { applicantId: "spouse", fieldId: "home-street" },
      { applicantId: "main", fieldId: "home-street" },
    ]);
    expect(plan.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "home-street", value: "Арбат" }),
        expect.objectContaining({ fieldId: "home-house", value: "1" }),
        expect.objectContaining({ fieldId: "home-building", value: "" }),
        expect.objectContaining({ fieldId: "home-unit", value: "" }),
        expect.objectContaining({
          fieldId: "home-address",
          value: "Арбат, д 1",
        }),
      ]),
    );

    const incomplete = applicant("main", [
      questionnaireField("home-street", "Арбат", { reviewSource: "manual" }),
      questionnaireField("home-house", ""),
      questionnaireField("home-building", ""),
      questionnaireField("home-unit", ""),
      questionnaireField("home-address", "Арбат", { reviewSource: "manual" }),
    ]);
    expect(
      buildQuestionnaireFamilyCopyPlan({
        bindings: addressBindings,
        recipients: [recipient],
        sourceApplicant: incomplete,
        validate: () => undefined,
      }).updates,
    ).toEqual([]);
  });
});
