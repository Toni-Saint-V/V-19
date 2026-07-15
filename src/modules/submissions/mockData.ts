import { createQuestionnaireSections } from "./questionnaire";
import { alternateLocalAgentOwnerId, defaultLocalAgentOwnerId } from "./ownership";
import { buildMediaStoragePath, mediaStorageBucket } from "./mediaStoragePolicy";
import type { Applicant, Issue, Submission, SubmissionFile } from "./types";

const conditionallyRequiredBlsFieldIds = new Set([
  "company-contact-person",
  "company-org-details",
  "company-phone",
  "employer-address",
  "employer-contact",
  "employer-name",
  "guardian-info",
]);

const completeDemoQuestionnaireValues: Record<string, string> = {
  "appointment-city": "Москва",
  "arrival-date": "10.07.2026",
  "birth-citizenship": "Russian Federation",
  "birth-country": "USSR",
  "birth-date": "20.08.1990",
  "birth-place": "MOSCOW",
  "company-contact-person": "DEMO CONTACT",
  "company-org-details": "DEMO COMPANY, MADRID",
  "company-phone": "+34 900 000 001",
  "contact-number": "+7 900 000-00-00",
  "departure-date": "18.07.2026",
  "desired-date-1": "05.08.2026",
  email: "demo@example.com",
  "employer-address": "MOSCOW",
  "employer-contact": "+7 900 000-00-01",
  "employer-name": "DEMO COMPANY",
  "first-entry-country": "Spain",
  "first-name": "IVAN",
  "guardian-info": "DEMO GUARDIAN",
  "home-address": "DEMO ADDRESS",
  "home-city": "MOSCOW",
  "home-country": "Russian Federation",
  "hotel-address": "DEMO HOTEL ADDRESS",
  "hotel-city": "MADRID",
  "hotel-contact": "+34 900 000 000",
  "hotel-country": "Spain",
  "hotel-email": "hotel@example.com",
  "hotel-name": "DEMO HOTEL",
  "hotel-postal-code": "28001",
  "main-destination": "Spain",
  nationality: "Russian Federation",
  "occupation-specify": "MANAGER",
  "passport-expiry-date": "26.02.2032",
  "passport-issue-country": "Russian Federation",
  "passport-issue-date": "26.02.2016",
  "passport-issue-place": "FMS 78039",
  "postal-code": "119991",
  "stay-duration": "9",
  surname: "IVANOV",
};

function applicant(
  id: string,
  fullName: string,
  role: Applicant["role"],
  questionnaireStatus: Applicant["questionnaireStatus"],
  fileStatus: Applicant["fileStatus"],
  missing?: string,
  readyForExportFixture = false,
): Applicant {
  return {
    id,
    fullName,
    role,
    questionnaireStatus,
    fileStatus,
    passportExtraction:
      readyForExportFixture && questionnaireStatus === "complete"
        ? {
            appliedFieldKeys: [],
            dismissedAtIso: "2026-06-15T10:00:00.000Z",
            extractedFields: [],
            status: "unavailable",
            summary: "Демо-скан проверен вручную; данные анкеты подтверждены.",
          }
        : undefined,
    sections: createQuestionnaireSections(id, fullName, questionnaireStatus, missing).map(
      (section) => ({
        ...section,
        fields: section.fields.map((field) => {
          if (field.id === "passport-no") {
            return { ...field, value: mockPassportNumber(id) };
          }
          if (
            !readyForExportFixture ||
            questionnaireStatus !== "complete" ||
            field.value.trim() ||
            (!field.required && !conditionallyRequiredBlsFieldIds.has(field.id))
          ) {
            return field;
          }
          return {
            ...field,
            value:
              completeDemoQuestionnaireValues[field.id] ??
              field.options?.[0] ??
              `DEMO ${field.id.toUpperCase()}`,
          };
        }),
      }),
    ),
  };
}

function mockPassportNumber(applicantId: string): string {
  const digits = applicantId.replace(/\D/g, "");
  return `66${digits.padStart(7, "0").slice(-7)}`;
}

function file(
  id: string,
  applicantId: string,
  type: SubmissionFile["type"],
  status: SubmissionFile["status"],
  linkedIssueId?: string,
): SubmissionFile {
  return {
    id,
    applicantId,
    type,
    status,
    linkedIssueId,
    uploadedBy: status === "missing" ? undefined : "Агент",
    uploadedAt: status === "missing" ? undefined : "14.06",
  };
}

function localDemoStoredFile(submissionId: string, source: SubmissionFile): SubmissionFile {
  const applicantKey = source.applicantId.replace(/\D/g, "");
  const generatedFileName = `demo${applicantKey}_${source.type}.jpg`;
  const target = buildMediaStoragePath(
    submissionId,
    source.applicantId,
    source.type,
    generatedFileName,
  );

  return {
    ...source,
    generatedFileName,
    mimeType: "image/jpeg",
    originalFileName: generatedFileName,
    reviewStatus: "accepted",
    sizeBytes: 4,
    storageAdapter: "supabase-private",
    storageBucket: mediaStorageBucket,
    storagePath: target.path,
    uploadStatus: "uploaded",
  };
}

function localDemoStoredFiles(
  submissionId: string,
  files: SubmissionFile[],
): SubmissionFile[] {
  return files.map((item) =>
    item.status === "accepted" ? localDemoStoredFile(submissionId, item) : item,
  );
}

function issue(
  id: string,
  applicantId: string,
  applicantName: string,
  reason: string,
  comment: string,
  severity: Issue["severity"],
  status: Issue["status"],
  section?: string,
  fileType?: Issue["target"]["fileType"],
): Issue {
  return {
    id,
    type: fileType ? "file" : "field",
    target: {
      applicantId,
      applicantName,
      section,
      fileType,
    },
    reason,
    comment,
    severity,
    status,
    createdBy: "admin",
    createdAt: "14.06",
  };
}

export const initialSubmissions: Submission[] = [
  {
    id: "ПД-1048",
    agentId: defaultLocalAgentOwnerId,
    title: "Семья Ивановых",
    listTitle: "Ивановы",
    type: "family",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "22.07",
    tripDateTo: "31.07",
    status: "returned",
    applicants: [
      applicant("з-1048-1", "Мария Иванова", "main", "complete", "needs_fix"),
      applicant("з-1048-2", "Антон Иванов", "spouse", "complete", "complete"),
      applicant(
        "з-1048-3",
        "София Иванова",
        "child",
        "partial",
        "needs_fix",
        "нужна дата школы",
      ),
      applicant("з-1048-4", "Марк Иванов", "child", "complete", "complete"),
    ],
    issues: [
      issue(
        "зм-1048-1",
        "з-1048-1",
        "Мария Иванова",
        "Селфи 1",
        "Лицо обрезано. Загрузите селфи 1.",
        "blocker",
        "open",
        "Файлы",
        "selfie",
      ),
      issue(
        "зм-1048-2",
        "з-1048-3",
        "София Иванова",
        "Скан паспорта",
        "Паспорт не читается. Загрузите скан.",
        "blocker",
        "open",
        "Файлы",
        "passport_scan",
      ),
    ],
    files: [
      file("ф-1048-2", "з-1048-1", "selfie", "needs_replacement", "зм-1048-1"),
      file("ф-1048-3", "з-1048-1", "selfie_2", "accepted"),
      file("ф-1048-4", "з-1048-1", "passport_scan", "accepted"),
      file("ф-1048-6", "з-1048-3", "selfie", "accepted"),
      file("ф-1048-7", "з-1048-3", "selfie_2", "accepted"),
      file("ф-1048-8", "з-1048-3", "passport_scan", "needs_replacement", "зм-1048-2"),
    ],
    completeness: { questionnaire: 96, files: 71, total: 84 },
    exportState: "not_ready",
    createdAt: "12.06",
    updatedAt: "15.06",
    history: [
      {
        id: "и-1048-1",
        text: "Подача возвращена: 2 замечания",
        at: "14.06",
        source: "admin",
      },
      {
        id: "и-1048-2",
        text: "Агент открыл подачу для исправления",
        at: "15.06",
        source: "agent",
      },
    ],
  },
  {
    id: "ПД-1051",
    agentId: defaultLocalAgentOwnerId,
    title: "Артём Соколов",
    type: "single",
    country: "Испания",
    city: "Санкт-Петербург",
    tripDateFrom: "02.08",
    tripDateTo: "12.08",
    status: "in_progress",
    applicants: [
      applicant(
        "з-1051-1",
        "Артём Соколов",
        "main",
        "partial",
        "partial",
        "не заполнены поездка и отель",
      ),
    ],
    issues: [],
    files: [
      file("ф-1051-2", "з-1051-1", "selfie", "missing"),
      file("ф-1051-3", "з-1051-1", "selfie_2", "missing"),
      file("ф-1051-4", "з-1051-1", "passport_scan", "uploaded"),
    ],
    completeness: { questionnaire: 67, files: 33, total: 50 },
    exportState: "not_ready",
    createdAt: "13.06",
    updatedAt: "15.06",
    history: [
      { id: "и-1051-1", text: "Черновик сохранен", at: "13.06", source: "agent" },
      {
        id: "и-1051-2",
        text: "Агент начал заполнение анкеты",
        at: "15.06",
        source: "agent",
      },
    ],
  },
  {
    id: "ПД-1052",
    agentId: defaultLocalAgentOwnerId,
    title: "Елена Смирнова",
    type: "single",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "11.08",
    tripDateTo: "20.08",
    status: "draft",
    applicants: [
      applicant(
        "з-1052-1",
        "Елена Смирнова",
        "main",
        "empty",
        "empty",
        "нужно начать анкету",
      ),
    ],
    issues: [],
    files: [
      file("ф-1052-2", "з-1052-1", "selfie", "missing"),
      file("ф-1052-3", "з-1052-1", "selfie_2", "missing"),
      file("ф-1052-4", "з-1052-1", "passport_scan", "missing"),
    ],
    completeness: { questionnaire: 0, files: 0, total: 0 },
    exportState: "not_ready",
    createdAt: "15.06",
    updatedAt: "15.06",
    history: [
      { id: "и-1052-1", text: "Черновик создан", at: "15.06", source: "agent" },
    ],
  },
  {
    id: "ПД-1053",
    agentId: defaultLocalAgentOwnerId,
    title: "Нина Волкова",
    type: "single",
    country: "Испания",
    city: "Казань",
    tripDateFrom: "18.08",
    tripDateTo: "26.08",
    status: "submitted_for_review",
    applicants: [applicant("з-1053-1", "Нина Волкова", "main", "complete", "complete")],
    issues: [],
    files: [
      file("ф-1053-2", "з-1053-1", "selfie", "pending_review"),
      file("ф-1053-3", "з-1053-1", "selfie_2", "pending_review"),
      file("ф-1053-4", "з-1053-1", "passport_scan", "pending_review"),
    ],
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "not_ready",
    createdAt: "12.06",
    updatedAt: "15.06",
    history: [
      {
        id: "и-1053-1",
        text: "Агент отправил подачу на проверку",
        at: "15.06",
        source: "agent",
      },
      {
        id: "и-1053-2",
        text: "Пакет готов к внутренней проверке",
        at: "15.06",
        source: "system",
      },
    ],
  },
  {
    id: "ПД-1054",
    agentId: defaultLocalAgentOwnerId,
    title: "Семья Петровых",
    listTitle: "Петровы",
    type: "family",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "09.09",
    tripDateTo: "16.09",
    status: "ready_for_export",
    applicants: [
      applicant("з-1054-1", "Ирина Петрова", "main", "complete", "complete", undefined, true),
      applicant("з-1054-2", "Павел Петров", "spouse", "complete", "complete", undefined, true),
    ],
    issues: [],
    files: localDemoStoredFiles("ПД-1054", [
      file("ф-1054-2", "з-1054-1", "selfie", "accepted"),
      file("ф-1054-3", "з-1054-1", "selfie_2", "accepted"),
      file("ф-1054-4", "з-1054-1", "passport_scan", "accepted"),
      file("ф-1054-6", "з-1054-2", "selfie", "accepted"),
      file("ф-1054-7", "з-1054-2", "selfie_2", "accepted"),
      file("ф-1054-8", "з-1054-2", "passport_scan", "accepted"),
    ]),
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "ready",
    createdAt: "10.06",
    updatedAt: "15.06",
    history: [
      {
        id: "и-1054-1",
        text: "Администратор принял подачу",
        at: "15.06",
        source: "admin",
      },
      {
        id: "и-1054-2",
        text: "Подача готова к Эксель",
        at: "15.06",
        source: "system",
      },
    ],
  },
  {
    id: "ПД-1055",
    agentId: defaultLocalAgentOwnerId,
    title: "Семья Смирновых",
    listTitle: "Смирновы",
    type: "family",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "04.09",
    tripDateTo: "14.09",
    status: "corrections_received",
    applicants: [
      applicant("з-1055-1", "Елена Смирнова", "main", "complete", "complete"),
      applicant("з-1055-2", "Алексей Смирнов", "spouse", "complete", "complete"),
    ],
    issues: [
      issue(
        "зм-1055-1",
        "з-1055-1",
        "Елена Смирнова",
        "Адрес отеля был неполным",
        "Агент отметил исправление, администратор должен закрыть замечание.",
        "warning",
        "fixed_by_agent",
        "Данные",
      ),
    ],
    files: [
      file("ф-1055-2", "з-1055-1", "selfie", "accepted"),
      file("ф-1055-3", "з-1055-1", "selfie_2", "accepted"),
      file("ф-1055-4", "з-1055-1", "passport_scan", "accepted"),
      file("ф-1055-6", "з-1055-2", "selfie", "accepted"),
      file("ф-1055-7", "з-1055-2", "selfie_2", "accepted"),
      file("ф-1055-8", "з-1055-2", "passport_scan", "accepted"),
    ],
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "not_ready",
    createdAt: "10.06",
    updatedAt: "15.06",
    history: [
      {
        id: "и-1055-1",
        text: "Агент отправил исправления",
        at: "15.06",
        source: "agent",
      },
      {
        id: "и-1055-2",
        text: "Замечание ожидает закрытия администратором",
        at: "15.06",
        source: "system",
      },
    ],
  },
  {
    id: "ПД-1056",
    agentId: defaultLocalAgentOwnerId,
    title: "Дмитрий Орлов",
    type: "single",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "06.09",
    tripDateTo: "12.09",
    status: "ready_for_export",
    applicants: [
      applicant("з-1056-1", "Дмитрий Орлов", "main", "complete", "complete", undefined, true),
    ],
    issues: [],
    files: localDemoStoredFiles("ПД-1056", [
      file("ф-1056-2", "з-1056-1", "selfie", "accepted"),
      file("ф-1056-3", "з-1056-1", "selfie_2", "accepted"),
      file("ф-1056-4", "з-1056-1", "passport_scan", "accepted"),
    ]),
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "ready",
    createdAt: "09.06",
    updatedAt: "15.06",
    history: [
      {
        id: "и-1056-1",
        text: "Администратор принял подачу",
        at: "15.06",
        source: "admin",
      },
      { id: "и-1056-2", text: "Подача готова к Эксель", at: "15.06", source: "system" },
    ],
  },
  {
    id: "SUB-1101",
    agentId: alternateLocalAgentOwnerId,
    title: "Ольга Фролова",
    type: "single",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "09.09",
    tripDateTo: "16.09",
    status: "ready_for_export",
    applicants: [
      applicant("з-1101-1", "Ольга Фролова", "main", "complete", "complete", undefined, true),
    ],
    issues: [],
    files: localDemoStoredFiles("SUB-1101", [
      file("ф-1101-2", "з-1101-1", "selfie", "accepted"),
      file("ф-1101-3", "з-1101-1", "selfie_2", "accepted"),
      file("ф-1101-4", "з-1101-1", "passport_scan", "accepted"),
    ]),
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "ready",
    createdAt: "14.06",
    updatedAt: "15.06",
    history: [
      { id: "и-1101-1", text: "Администратор принял подачу", at: "15.06", source: "admin" },
      { id: "и-1101-2", text: "Подача готова к Эксель", at: "15.06", source: "system" },
    ],
  },
  {
    id: "SUB-1102",
    agentId: defaultLocalAgentOwnerId,
    title: "Семья Волковых",
    listTitle: "Волковы",
    type: "family",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "09.09",
    tripDateTo: "16.09",
    status: "ready_for_export",
    applicants: [
      applicant("з-1102-1", "Анна Волкова", "main", "complete", "complete", undefined, true),
      applicant("з-1102-2", "Игорь Волков", "spouse", "complete", "complete", undefined, true),
      applicant("з-1102-3", "Мила Волкова", "child", "complete", "complete", undefined, true),
    ],
    issues: [],
    files: localDemoStoredFiles("SUB-1102", [
      file("ф-1102-2", "з-1102-1", "selfie", "accepted"),
      file("ф-1102-3", "з-1102-1", "selfie_2", "accepted"),
      file("ф-1102-4", "з-1102-1", "passport_scan", "accepted"),
      file("ф-1102-6", "з-1102-2", "selfie", "accepted"),
      file("ф-1102-7", "з-1102-2", "selfie_2", "accepted"),
      file("ф-1102-8", "з-1102-2", "passport_scan", "accepted"),
      file("ф-1102-9", "з-1102-3", "selfie", "accepted"),
      file("ф-1102-10", "з-1102-3", "selfie_2", "accepted"),
      file("ф-1102-11", "з-1102-3", "passport_scan", "accepted"),
    ]),
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "ready",
    createdAt: "14.06",
    updatedAt: "15.06",
    history: [
      { id: "и-1102-1", text: "Администратор принял подачу", at: "15.06", source: "admin" },
      { id: "и-1102-2", text: "Подача готова к Эксель", at: "15.06", source: "system" },
    ],
  },
  {
    id: "SUB-1103",
    agentId: defaultLocalAgentOwnerId,
    title: "Никита Морозов",
    type: "single",
    country: "Испания",
    city: "Санкт-Петербург",
    tripDateFrom: "09.09",
    tripDateTo: "16.09",
    status: "ready_for_export",
    applicants: [
      applicant("з-1103-1", "Никита Морозов", "main", "complete", "complete", undefined, true),
    ],
    issues: [],
    files: localDemoStoredFiles("SUB-1103", [
      file("ф-1103-2", "з-1103-1", "selfie", "accepted"),
      file("ф-1103-3", "з-1103-1", "selfie_2", "accepted"),
      file("ф-1103-4", "з-1103-1", "passport_scan", "accepted"),
    ]),
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "ready",
    createdAt: "13.06",
    updatedAt: "15.06",
    history: [
      { id: "и-1103-1", text: "Администратор принял подачу", at: "15.06", source: "admin" },
      { id: "и-1103-2", text: "Подача готова к Эксель", at: "15.06", source: "system" },
    ],
  },
  {
    id: "ПД-1057",
    agentId: alternateLocalAgentOwnerId,
    title: "Ольга Морозова",
    type: "single",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "04.09",
    tripDateTo: "14.09",
    status: "exported",
    applicants: [
      applicant("з-1057-1", "Ольга Морозова", "main", "complete", "complete"),
    ],
    issues: [],
    files: [
      file("ф-1057-2", "з-1057-1", "selfie", "accepted"),
      file("ф-1057-3", "з-1057-1", "selfie_2", "accepted"),
      file("ф-1057-4", "з-1057-1", "passport_scan", "accepted"),
    ],
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: "marked_exported",
    createdAt: "08.06",
    updatedAt: "15.06",
    history: [
      { id: "и-1057-1", text: "Файл сформирован", at: "15.06", source: "admin" },
      {
        id: "и-1057-2",
        text: "Подача отмечена выгруженной",
        at: "15.06",
        source: "admin",
      },
    ],
  },
];
