// src/modules/submissions/questionnaireFamilyCopy.ts
import type { QuestionnaireFieldUpdate } from "./questionnaire";
import type { Applicant, QuestionnaireField } from "./types";

export const questionnaireFamilyCopyFieldIdsBySection = {
  appointment: ["appointment-city", "desired-date-1", "desired-date-2"],
  contacts: [
    "home-address",
    "home-country",
    "home-city",
    "home-street",
    "home-house",
    "home-building",
    "home-unit",
    "postal-code",
  ],
  hotel: [
    "hotel-name",
    "hotel-address",
    "hotel-country",
    "hotel-city",
    "hotel-postal-code",
  ],
} as const;

export type QuestionnaireFamilyCopySectionId =
  keyof typeof questionnaireFamilyCopyFieldIdsBySection;

export function isQuestionnaireFamilyCopyField(
  sectionId: string,
  fieldId: string,
): sectionId is QuestionnaireFamilyCopySectionId {
  const allowed = questionnaireFamilyCopyFieldIdsBySection[
    sectionId as QuestionnaireFamilyCopySectionId
  ] as readonly string[] | undefined;
  return Boolean(allowed?.includes(fieldId));
}

type QuestionnaireFamilyCopyValidationField = Pick<
  QuestionnaireField,
  "id" | "label" | "required"
>;

export type QuestionnaireFamilyCopyBinding = {
  candidateFieldIds: readonly string[];
  canonicalFieldId: string;
  sectionId: string;
};

export type QuestionnaireFamilyCopyPreviewField = {
  applicantId: string;
  fieldId: string;
};

export type QuestionnaireFamilyCopyPlan = {
  affectedApplicants: number;
  previewFields: QuestionnaireFamilyCopyPreviewField[];
  updates: QuestionnaireFieldUpdate[];
};

type BuildAutomaticQuestionnaireFamilyCopyUpdatesInput = {
  binding: QuestionnaireFamilyCopyBinding;
  recipients: readonly Applicant[];
  sourceApplicant: Applicant;
  sourceUpdate: QuestionnaireFieldUpdate;
  validate: (
    field: QuestionnaireFamilyCopyValidationField,
    value: string,
  ) => string | undefined;
};

type BuildQuestionnaireFamilyCopyPlanInput = {
  bindings: readonly QuestionnaireFamilyCopyBinding[];
  recipients: readonly Applicant[];
  sourceApplicant: Applicant;
  validate: (
    field: QuestionnaireFamilyCopyValidationField,
    value: string,
  ) => string | undefined;
};

function uniqueCandidateFieldIds(binding: QuestionnaireFamilyCopyBinding) {
  return [...new Set([binding.canonicalFieldId, ...binding.candidateFieldIds])];
}

function applicantField(applicant: Applicant, candidateFieldIds: readonly string[]) {
  for (const fieldId of candidateFieldIds) {
    for (const section of applicant.sections) {
      const field = section.fields.find((candidate) => candidate.id === fieldId);
      if (field) return field;
    }
  }

  return undefined;
}

function isUserEnteredFamilyCopySource(field: QuestionnaireField) {
  if (field.reviewSource === "manual") return true;

  return field.reviewSource === undefined && field.reviewOriginSource === "manual";
}

function previewFieldKey(field: QuestionnaireFamilyCopyPreviewField) {
  return `${field.applicantId}:${field.fieldId}`;
}

function updateKey(update: QuestionnaireFieldUpdate) {
  return `${update.applicantId}:${update.sectionId}:${update.fieldId}`;
}

export function buildAutomaticQuestionnaireFamilyCopyUpdates({
  binding,
  recipients,
  sourceApplicant,
  sourceUpdate,
  validate,
}: BuildAutomaticQuestionnaireFamilyCopyUpdatesInput): QuestionnaireFieldUpdate[] {
  if (sourceUpdate.applicantId !== sourceApplicant.id) return [];

  const candidateFieldIds = uniqueCandidateFieldIds(binding);
  if (!candidateFieldIds.includes(sourceUpdate.fieldId)) return [];

  return recipients.flatMap((recipient) => {
    if (recipient.id === sourceApplicant.id) return [];
    const targetField = applicantField(recipient, candidateFieldIds);
    if (!targetField) return [];

    return [
      {
        applicantId: recipient.id,
        error: validate(targetField, sourceUpdate.value),
        fieldId: targetField.id,
        reviewOriginSource: "family_shared",
        reviewSource: "family_shared",
        reviewState: "confirmed",
        sectionId: binding.sectionId,
        value: sourceUpdate.value,
      } satisfies QuestionnaireFieldUpdate,
    ];
  });
}

export function buildQuestionnaireFamilyCopyPlan({
  bindings,
  recipients,
  sourceApplicant,
  validate,
}: BuildQuestionnaireFamilyCopyPlanInput): QuestionnaireFamilyCopyPlan {
  const affectedApplicantIds = new Set<string>();
  const previewFields = new Map<string, QuestionnaireFamilyCopyPreviewField>();
  const updates = new Map<string, QuestionnaireFieldUpdate>();

  for (const binding of bindings) {
    const candidateFieldIds = uniqueCandidateFieldIds(binding);
    const sourceField = applicantField(sourceApplicant, candidateFieldIds);
    if (!sourceField?.value.trim() || !isUserEnteredFamilyCopySource(sourceField)) {
      continue;
    }

    let copiedForBinding = false;
    for (const recipient of recipients) {
      if (recipient.id === sourceApplicant.id) continue;

      const targetField = applicantField(recipient, candidateFieldIds);
      if (!targetField) continue;

      const update = {
        applicantId: recipient.id,
        error: validate(targetField, sourceField.value),
        fieldId: targetField.id,
        reviewOriginSource: "family_shared",
        reviewSource: "family_shared",
        reviewState: "confirmed",
        sectionId: binding.sectionId,
        value: sourceField.value,
      } satisfies QuestionnaireFieldUpdate;

      updates.set(updateKey(update), update);
      affectedApplicantIds.add(recipient.id);
      copiedForBinding = true;

      for (const fieldId of [binding.canonicalFieldId, targetField.id]) {
        const previewField = { applicantId: recipient.id, fieldId };
        previewFields.set(previewFieldKey(previewField), previewField);
      }
    }

    if (copiedForBinding) {
      for (const fieldId of [binding.canonicalFieldId, sourceField.id]) {
        const previewField = { applicantId: sourceApplicant.id, fieldId };
        previewFields.set(previewFieldKey(previewField), previewField);
      }
    }
  }

  return {
    affectedApplicants: affectedApplicantIds.size,
    previewFields: [...previewFields.values()],
    updates: [...updates.values()],
  };
}
