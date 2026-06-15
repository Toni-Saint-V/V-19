import type {
  Applicant,
  QuestionnaireField,
  QuestionnaireSection,
  QuestionnaireStatus,
  Submission,
} from "./types";

type FieldSeed = {
  id: string;
  label: string;
  placeholder: string;
  completeValue: (applicantName: string) => string;
};

const questionnaireBlueprint: Array<{
  id: string;
  title: string;
  fields: FieldSeed[];
}> = [
  {
    id: "personal",
    title: "Личные данные",
    fields: [
      {
        id: "full-name",
        label: "ФИО заявителя",
        placeholder: "Иванов Иван Иванович",
        completeValue: (applicantName) => applicantName,
      },
      {
        id: "birth-date",
        label: "Дата рождения",
        placeholder: "01.01.1990",
        completeValue: () => "01.01.1990",
      },
    ],
  },
  {
    id: "trip",
    title: "Поездка",
    fields: [
      {
        id: "route",
        label: "Маршрут поездки",
        placeholder: "Москва, Мадрид, Москва",
        completeValue: () => "Москва, Мадрид, Москва",
      },
      {
        id: "address",
        label: "Адрес проживания",
        placeholder: "Отель или адрес проживания",
        completeValue: () => "Отель подтвержден",
      },
    ],
  },
  {
    id: "contacts",
    title: "Контакты",
    fields: [
      {
        id: "phone",
        label: "Телефон",
        placeholder: "+7 900 000 00 00",
        completeValue: () => "+7 900 000 00 00",
      },
      {
        id: "mail",
        label: "Почта",
        placeholder: "Почта заявителя",
        completeValue: () => "почта указана",
      },
    ],
  },
];

export type QuestionnaireFieldUpdate = {
  applicantId: string;
  sectionId: string;
  fieldId: string;
  value: string;
};

export function createQuestionnaireSections(
  applicantId: string,
  applicantName: string,
  status: QuestionnaireStatus,
  missing?: string,
): QuestionnaireSection[] {
  return questionnaireBlueprint.map((section) =>
    normalizeSection({
      id: `${applicantId}-${section.id}`,
      title: section.title,
      status,
      missing,
      fields: section.fields.map((field, index) =>
        seedField(field, applicantName, status, section.id, index, missing),
      ),
    }),
  );
}

export function normalizeSubmissionQuestionnaire(submission: Submission): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: normalizeApplicantSections(applicant),
    })),
  });
}

export function updateQuestionnaireField(
  submission: Submission,
  update: QuestionnaireFieldUpdate,
): Submission {
  const next = {
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      if (applicant.id !== update.applicantId) return applicant;

      return {
        ...applicant,
        sections: normalizeApplicantSections({
          ...applicant,
          sections: applicant.sections.map((section) => {
            if (section.id !== update.sectionId) return section;

            return {
              ...section,
              fields: normalizeFields(section).map((field) =>
                field.id === update.fieldId
                  ? {
                      ...field,
                      value: update.value,
                      error:
                        update.value.trim() &&
                        !hasOpenQuestionnaireFieldIssue(
                          submission,
                          update.applicantId,
                          section.title,
                          field.label,
                        )
                          ? undefined
                          : field.error,
                    }
                  : field,
              ),
            };
          }),
        }),
      };
    }),
    updatedAt: "сейчас",
  };

  return recalculateQuestionnaire(next);
}

export function completeQuestionnaireSections(submission: Submission): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: createQuestionnaireSections(
        applicant.id,
        applicant.fullName,
        "complete",
      ),
    })),
    updatedAt: "сейчас",
  });
}

export function flagQuestionnaireField(
  submission: Submission,
  applicantId: string,
  fieldLabel: string,
  reason: string,
): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      if (applicant.id !== applicantId) return applicant;

      return {
        ...applicant,
        sections: normalizeApplicantSections({
          ...applicant,
          sections: applicant.sections.map((section) => ({
            ...section,
            fields: normalizeFields(section).map((field) =>
              field.label === fieldLabel ? { ...field, error: reason } : field,
            ),
          })),
        }),
      };
    }),
  });
}

export function clearOpenQuestionnaireIssueErrors(submission: Submission): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: normalizeApplicantSections({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: normalizeFields(section).map((field) =>
            hasOpenQuestionnaireFieldIssue(
              submission,
              applicant.id,
              section.title,
              field.label,
            )
              ? { ...field, error: undefined }
              : field,
          ),
        })),
      }),
    })),
  });
}

export function questionnaireProgressForApplicant(applicant: Applicant) {
  const fields = applicant.sections.flatMap((section) => normalizeFields(section));
  if (!fields.length) return 0;
  const ready = fields.filter(isFieldReady).length;
  return Math.round((ready / fields.length) * 100);
}

export function questionnaireProblemCount(submission: Submission) {
  const keys = new Set<string>();

  for (const applicant of submission.applicants) {
    for (const section of applicant.sections) {
      for (const field of normalizeFields(section)) {
        if (field.required && !field.value.trim()) {
          keys.add(`${applicant.id}:${section.id}:${field.id}:missing`);
        }
        if (field.error) {
          keys.add(`${applicant.id}:${section.id}:${field.id}:error`);
        }
      }
    }
  }

  for (const issue of submission.issues) {
    if (issue.status !== "open") continue;
    if (
      issue.target.section === "Анкета" ||
      issue.type === "field" ||
      issue.type === "section"
    ) {
      keys.add(
        `${issue.target.applicantId}:${issue.target.section ?? ""}:${issue.target.field ?? ""}:issue`,
      );
    }
  }

  return keys.size;
}

function hasOpenQuestionnaireFieldIssue(
  submission: Submission,
  applicantId: string,
  sectionTitle: string,
  fieldLabel: string,
) {
  return submission.issues.some(
    (issue) =>
      issue.status === "open" &&
      issue.target.applicantId === applicantId &&
      issue.target.field === fieldLabel &&
      (issue.target.section === sectionTitle || issue.target.section === "Анкета"),
  );
}

function normalizeApplicantSections(applicant: Applicant): QuestionnaireSection[] {
  const sourceSections = applicant.sections.length
    ? applicant.sections
    : createQuestionnaireSections(
        applicant.id,
        applicant.fullName,
        applicant.questionnaireStatus,
      );

  return sourceSections.map((section) =>
    normalizeSection({
      ...section,
      fields: normalizeFields(section, applicant.fullName, section.title),
    }),
  );
}

function normalizeFields(
  section: QuestionnaireSection,
  applicantName = "Заявитель",
  sectionTitle = section.title,
): QuestionnaireField[] {
  if (section.fields?.length) return section.fields;

  const blueprint = questionnaireBlueprint.find((item) => item.title === sectionTitle);
  if (!blueprint) return [];

  return blueprint.fields.map((field, index) =>
    seedField(
      field,
      applicantName,
      section.status,
      blueprint.id,
      index,
      section.missing,
    ),
  );
}

function seedField(
  field: FieldSeed,
  applicantName: string,
  status: QuestionnaireStatus,
  sectionId: string,
  index: number,
  missing?: string,
): QuestionnaireField {
  const partialLeavesWholeTrip =
    status === "partial" && Boolean(missing?.includes("поезд"));
  const shouldFill =
    status === "complete" ||
    status === "needs_fix" ||
    (status === "partial" &&
      (partialLeavesWholeTrip
        ? sectionId !== "trip"
        : !(sectionId === "trip" && index === 1)));

  const shouldFlag = status === "needs_fix" && sectionId === "trip" && index === 1;

  return {
    id: field.id,
    label: field.label,
    value: shouldFill ? field.completeValue(applicantName) : "",
    required: true,
    placeholder: field.placeholder,
    error: shouldFlag ? (missing ?? "Нужно уточнить значение") : undefined,
  };
}

function normalizeSection(section: QuestionnaireSection): QuestionnaireSection {
  const fields = normalizeFields(section);
  const status = sectionStatus(fields);
  const firstMissing = fields.find((field) => field.required && !field.value.trim());
  const firstError = fields.find((field) => field.error);

  return {
    ...section,
    fields,
    status,
    missing:
      firstError?.error ??
      (firstMissing ? `Нужно заполнить: ${firstMissing.label}` : undefined),
  };
}

function recalculateQuestionnaire(submission: Submission): Submission {
  const applicants = submission.applicants.map((applicant) => {
    const sections = normalizeApplicantSections(applicant);
    return {
      ...applicant,
      sections,
      questionnaireStatus: applicantStatus(sections),
    };
  });

  const fields = applicants.flatMap((applicant) =>
    applicant.sections.flatMap((section) => section.fields),
  );
  const questionnaire = fields.length
    ? Math.round((fields.filter(isFieldReady).length / fields.length) * 100)
    : 0;

  return {
    ...submission,
    applicants,
    completeness: {
      ...submission.completeness,
      questionnaire,
      total: Math.round((questionnaire + submission.completeness.files) / 2),
    },
  };
}

function sectionStatus(fields: QuestionnaireField[]): QuestionnaireStatus {
  if (!fields.length) return "empty";
  if (fields.some((field) => field.error)) return "needs_fix";
  const ready = fields.filter(isFieldReady).length;
  if (ready === fields.length) return "complete";
  if (ready === 0) return "empty";
  return "partial";
}

function applicantStatus(sections: QuestionnaireSection[]): QuestionnaireStatus {
  if (!sections.length) return "empty";
  if (sections.some((section) => section.status === "needs_fix")) return "needs_fix";
  if (sections.every((section) => section.status === "complete")) return "complete";
  if (sections.every((section) => section.status === "empty")) return "empty";
  return "partial";
}

function isFieldReady(field: QuestionnaireField) {
  return !field.required || Boolean(field.value.trim() && !field.error);
}
