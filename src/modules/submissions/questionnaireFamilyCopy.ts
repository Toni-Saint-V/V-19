// src/modules/submissions/questionnaireFamilyCopy.ts
import type { QuestionnaireFieldUpdate } from "./questionnaire";
import type { Applicant, QuestionnaireField } from "./types";

type QuestionnaireFamilyCopyValidationField = Pick<
  QuestionnaireField,
  "id" | "label" | "required"
>;

export type QuestionnaireFamilyCopyBinding = {
  candidateFieldIds: readonly string[];
  canonicalFieldId: string;
  copyEmpty?: boolean;
  copyGroup?: string;
  copyGroupRequired?: boolean;
  previewFieldId?: string;
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
  visibleFieldCount: number;
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
  return [
    ...new Set([binding.canonicalFieldId, ...binding.candidateFieldIds]),
  ];
}

function applicantField(
  applicant: Applicant,
  candidateFieldIds: readonly string[],
) {
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

  return (
    field.reviewSource === undefined &&
    field.reviewOriginSource === "manual"
  );
}

function previewFieldKey(field: QuestionnaireFamilyCopyPreviewField) {
  return `${field.applicantId}:${field.fieldId}`;
}

function updateKey(update: QuestionnaireFieldUpdate) {
  return `${update.applicantId}:${update.sectionId}:${update.fieldId}`;
}

function groupedBindings(bindings: readonly QuestionnaireFamilyCopyBinding[]) {
  const groups = new Map<string, QuestionnaireFamilyCopyBinding[]>();
  for (const binding of bindings) {
    const groupId = binding.copyGroup ?? binding.canonicalFieldId;
    const group = groups.get(groupId) ?? [];
    if (
      !group.some(
        (candidate) => candidate.canonicalFieldId === binding.canonicalFieldId,
      )
    ) {
      group.push(binding);
    }
    groups.set(groupId, group);
  }
  return [...groups.values()];
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
  let visibleFieldCount = 0;

  for (const group of groupedBindings(bindings)) {
    const sourceBindings = group.map((binding) => ({
      binding,
      candidateFieldIds: uniqueCandidateFieldIds(binding),
      sourceField: applicantField(
        sourceApplicant,
        uniqueCandidateFieldIds(binding),
      ),
    }));
    const isAtomicGroup = group.some((binding) => binding.copyGroup);
    const missingRequiredSource = sourceBindings.some(
      ({ binding, sourceField }) =>
        binding.copyGroupRequired && !sourceField?.value.trim(),
    );
    const hasCopyableSource = sourceBindings.some(
      ({ binding, sourceField }) =>
        Boolean(sourceField?.value.trim()) ||
        (Boolean(sourceField) && Boolean(binding.copyEmpty)),
    );
    const hasUnconfirmedSource = sourceBindings.some(
      ({ sourceField }) =>
        Boolean(sourceField?.value.trim()) &&
        !isUserEnteredFamilyCopySource(sourceField as QuestionnaireField),
    );
    if (missingRequiredSource || !hasCopyableSource || hasUnconfirmedSource) {
      continue;
    }

    let copiedForGroup = false;
    for (const recipient of recipients) {
      if (recipient.id === sourceApplicant.id) continue;

      const recipientUpdates = sourceBindings.flatMap(
        ({ binding, candidateFieldIds, sourceField }) => {
          if (!sourceField || (!sourceField.value.trim() && !binding.copyEmpty)) {
            return [];
          }
          const targetField = applicantField(recipient, candidateFieldIds);
          if (!targetField) return [];
          return [
            {
              applicantId: recipient.id,
              error: validate(targetField, sourceField.value),
              fieldId: targetField.id,
              reviewOriginSource: "family_shared",
              reviewSource: "family_shared",
              reviewState: "confirmed",
              sectionId: binding.sectionId,
              value: sourceField.value,
            } satisfies QuestionnaireFieldUpdate,
          ];
        },
      );
      if (
        !recipientUpdates.length ||
        (isAtomicGroup &&
          (recipientUpdates.length !== sourceBindings.length ||
            recipientUpdates.some((update) => Boolean(update.error))))
      ) {
        continue;
      }

      for (const update of recipientUpdates) {
        updates.set(updateKey(update), update);
      }
      affectedApplicantIds.add(recipient.id);
      copiedForGroup = true;

      for (const { binding, candidateFieldIds } of sourceBindings) {
        const targetUpdate = recipientUpdates.find((update) =>
          candidateFieldIds.includes(update.fieldId),
        );
        const previewFieldIds = binding.previewFieldId
          ? [binding.previewFieldId]
          : [binding.canonicalFieldId, targetUpdate?.fieldId].filter(
              (fieldId): fieldId is string => Boolean(fieldId),
            );
        for (const fieldId of previewFieldIds) {
          const previewField = { applicantId: recipient.id, fieldId };
          previewFields.set(previewFieldKey(previewField), previewField);
        }
      }
    }

    if (copiedForGroup) {
      visibleFieldCount += 1;
      for (const { binding, sourceField } of sourceBindings) {
        const previewFieldIds = binding.previewFieldId
          ? [binding.previewFieldId]
          : [binding.canonicalFieldId, sourceField?.id].filter(
              (fieldId): fieldId is string => Boolean(fieldId),
            );
        for (const fieldId of previewFieldIds) {
          const previewField = { applicantId: sourceApplicant.id, fieldId };
          previewFields.set(previewFieldKey(previewField), previewField);
        }
      }
    }
  }

  return {
    affectedApplicants: affectedApplicantIds.size,
    previewFields: [...previewFields.values()],
    updates: [...updates.values()],
    visibleFieldCount,
  };
}
