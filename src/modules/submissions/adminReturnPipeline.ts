import type { City, Submission } from "./types";

export type AdminPipelineStepId =
  | "city-export"
  | "programmer-work"
  | "admin-return-upload"
  | "agent-handoff";

export type AdminPipelineStep = {
  description: string;
  id: AdminPipelineStepId;
  output: string;
  title: string;
};

export const adminReturnPipelineSteps: AdminPipelineStep[] = [
  {
    description:
      "Админ выбирает город, формирует Excel и ZIP документов всех подач в выбранной выгрузке.",
    id: "city-export",
    output: "Excel + документы по городам",
    title: "1. Выгрузка по городам",
  },
  {
    description:
      "Программисты берут Excel, печатают/обрабатывают список и создают PDF анкеты по каждому заявителю.",
    id: "programmer-work",
    output: "Готовые PDF анкет",
    title: "2. Работа программистов",
  },
  {
    description:
      "Админ загружает результат обратно: список записи/appointment letter и комплект PDF анкет.",
    id: "admin-return-upload",
    output: "Список + PDF в админке",
    title: "3. Загрузка результата",
  },
  {
    description:
      "Система группирует результат по агентам, чтобы передать агенту его список и нужные PDF.",
    id: "agent-handoff",
    output: "Пакет агенту",
    title: "4. Передача агенту",
  },
];

export type AdminPipelineCityPlan = {
  applicants: number;
  city: City;
  ready: number;
  submissions: number;
};

export type AdminPipelineAgentPlan = {
  agentId: string;
  files: number;
  pdfReviews: number;
  submissions: number;
};

export function buildAdminPipelineCityPlan(submissions: Submission[]): AdminPipelineCityPlan[] {
  const groups = submissions.reduce<Record<string, Submission[]>>((acc, submission) => {
    acc[submission.city] = [...(acc[submission.city] ?? []), submission];
    return acc;
  }, {});

  return Object.entries(groups).map(([city, items]) => ({
    applicants: items.reduce((sum, submission) => sum + submission.applicants.length, 0),
    city: city as City,
    ready: items.filter((submission) => submission.status === "ready_for_export").length,
    submissions: items.length,
  }));
}

export function buildAdminPipelineAgentPlan(submissions: Submission[]): AdminPipelineAgentPlan[] {
  const groups = submissions.reduce<Record<string, Submission[]>>((acc, submission) => {
    acc[submission.agentId] = [...(acc[submission.agentId] ?? []), submission];
    return acc;
  }, {});

  return Object.entries(groups).map(([agentId, items]) => ({
    agentId,
    files: items.reduce((sum, submission) => sum + submission.files.length, 0),
    pdfReviews: items.reduce(
      (sum, submission) => sum + (submission.visaApplicationPdfReviews?.length ?? 0),
      0,
    ),
    submissions: items.length,
  }));
}

export function adminUploadKindLabel(kind: "appointment_list" | "questionnaire_pdf") {
  return kind === "appointment_list" ? "Список записи" : "PDF анкеты";
}
