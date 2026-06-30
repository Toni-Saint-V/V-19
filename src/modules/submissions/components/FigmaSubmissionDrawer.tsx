import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  FileDigit,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  Plane,
  ShieldAlert,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import { getPrimaryAction, statusLabels } from "../status";
import { ProgressMeter } from "./CollectionPrimitives";
import { QuestionnaireSectionPreviewCard } from "./QuestionnaireWorkspacePrimitives";
import type {
  DrawerTab,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "../types";

type SourceStatus =
  | "draft"
  | "in_progress"
  | "submitted_for_review"
  | "returned"
  | "corrections_received"
  | "ready_for_export"
  | "exported";

type TabId = "overview" | "questionnaire" | "files" | "issues" | "history";

type FigmaApplicant = {
  completeness: number;
  name: string;
  role: string;
  status: string;
};

type FigmaSubmissionDetail = {
  applicants: FigmaApplicant[];
  applicantsCount: number;
  city: string;
  completeness: number;
  id: string;
  issuesCount: number;
  owner: string;
  status: SourceStatus;
  title: string;
  tripDates: string;
  type: "family" | "single";
  updated: string;
};

type FigmaSubmissionDrawerProps = {
  activeTab: DrawerTab;
  actionError?: string;
  onAction: (action: SubmissionAction) => void;
  onClose: () => void;
  onMarkIssueFixed?: (issueId: string) => void;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  onOpenQuestionnaireWorkspace: () => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
  [key: string]: unknown;
};

function sourceStatus(submission: Submission): SourceStatus {
  if (submission.status === "draft") return "draft";
  if (submission.status === "returned") return "returned";
  if (submission.status === "submitted_for_review") return "submitted_for_review";
  if (submission.status === "ready_for_export") return "ready_for_export";
  if (submission.status === "exported") return "exported";
  return "in_progress";
}

function applicantRoleLabel(role: string) {
  if (role === "main") return "Основной";
  if (role === "spouse") return "Супруга";
  if (role === "child") return "Ребенок";
  return role;
}

function applicantQuestionnairePercent(
  applicant: Submission["applicants"][number],
) {
  if (applicant.questionnaireStatus === "complete") return 100;
  if (applicant.questionnaireStatus === "empty") return 0;

  const sections = applicant.sections;
  if (!sections.length) return applicant.questionnaireStatus === "needs_fix" ? 65 : 40;

  const completeCount = sections.filter((section) => section.status === "complete").length;
  return Math.round((completeCount / sections.length) * 100);
}

function buildDetail(submission: Submission): FigmaSubmissionDetail {
  return {
    applicants: submission.applicants.map((applicant) => ({
      completeness: applicantQuestionnairePercent(applicant),
      name: applicant.fullName,
      role: applicantRoleLabel(applicant.role ?? "main"),
      status: applicant.questionnaireStatus,
    })),
    applicantsCount: submission.applicants.length,
    city: `${submission.city} (VFS Global)`,
    completeness: submission.completeness.total,
    id: submission.id,
    issuesCount: submission.issues.filter(
      (issue) => issue.status !== "closed_by_admin",
    ).length,
    owner: "Татьяна Н.",
    status: sourceStatus(submission),
    title: submission.title,
    tripDates: `${submission.tripDateFrom.replace("-", "–")} – ${submission.tripDateTo.replace("-", "–")}`,
    type: submission.type,
    updated: submission.updatedAt,
  };
}

function fileTypeLabel(type: SubmissionFile["type"]) {
  if (type === "passport_scan") return "Скан паспорта";
  if (type === "selfie") return "Селфи 1";
  if (type === "selfie_2") return "Селфи 2";
  return "Документ";
}

function fileStatusLabel(file: SubmissionFile) {
  if (file.status === "needs_replacement") return "Нужна замена";
  if (file.status === "uploaded" || file.status === "accepted") return "Загружено";
  return "Не загружено";
}

function fileActionLabel(file: SubmissionFile) {
  return file.status === "needs_replacement" ? "Заменить" : "Загрузить";
}

function fileAccept(file: SubmissionFile) {
  if (file.type === "passport_scan") return "image/jpeg,image/png,application/pdf";
  if (file.type === "selfie" || file.type === "selfie_2") return "image/*";
  return undefined;
}

function fileSummary(file: SubmissionFile) {
  const uploadedName = file.originalFileName ?? file.generatedFileName;
  if (!uploadedName) return fileStatusLabel(file);
  return `${fileStatusLabel(file)} · ${uploadedName}`;
}

type FileApplicantSection = {
  files: SubmissionFile[];
  id: string;
  name: string;
};

function fileApplicantSections(submission: Submission): FileApplicantSection[] {
  const applicantNameById = new Map(
    submission.applicants.map((applicant) => [applicant.id, applicant.fullName]),
  );
  const applicantOrder = new Map(
    submission.applicants.map((applicant, index) => [applicant.id, index]),
  );
  const filesByApplicantId = new Map<string, SubmissionFile[]>();

  for (const file of submission.files) {
    const files = filesByApplicantId.get(file.applicantId) ?? [];
    files.push(file);
    filesByApplicantId.set(file.applicantId, files);
  }

  return Array.from(filesByApplicantId.entries())
    .sort(
      ([leftId], [rightId]) =>
        (applicantOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER) -
          (applicantOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER) ||
        leftId.localeCompare(rightId),
    )
    .map(([applicantId, files], index) => ({
      files,
      id: applicantId,
      name: applicantNameById.get(applicantId) ?? `Заявитель ${index + 1}`,
    }));
}

const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`v19-figma-skeleton ${className}`} />
);

const StatusBadge = ({ status }: { status: SourceStatus }) => {
  switch (status) {
    case "in_progress":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-medium uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5" /> В работе
        </span>
      );
    case "returned":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[11px] font-medium uppercase tracking-wide">
          <AlertCircle className="w-3.5 h-3.5" /> Возвращено (Ошибки)
        </span>
      );
    case "submitted_for_review":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#3a45b4]/20 border border-[#3a45b4]/30 text-[#8fa3ff] text-[11px] font-medium uppercase tracking-wide">
          <ShieldAlert className="w-3.5 h-3.5" /> На проверке
        </span>
      );
    case "ready_for_export":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium uppercase tracking-wide">
          <CheckCircle2 className="w-3.5 h-3.5" /> Готово к выгрузке
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-[11px] font-medium uppercase tracking-wide">
          <FileText className="w-3.5 h-3.5" /> Черновик
        </span>
      );
  }
};

const OverviewTab = ({ data }: { data: FigmaSubmissionDetail }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
        <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-5">
          Маршрут и подача
        </h3>
        <div className="space-y-4 text-sm">
          <div className="flex gap-4">
            <Calendar className="w-5 h-5 text-white/30 shrink-0" />
            <div>
              <div className="text-white/90 font-medium">{data.tripDates}</div>
              <div className="text-white/40 text-[11px] mt-0.5">Даты поездки</div>
            </div>
          </div>
          <div className="flex gap-4">
            <MapPin className="w-5 h-5 text-white/30 shrink-0" />
            <div>
              <div className="text-white/90 font-medium">{data.city}</div>
              <div className="text-white/40 text-[11px] mt-0.5">
                Визовый центр подачи
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">
            Чеклист документов
          </h3>
          <span className="text-[11px] font-mono text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-md">
            8/10
          </span>
        </div>
        <div className="space-y-3 flex-1 flex flex-col justify-center">
          {[
            { label: "Паспорта (Загран, РФ)", status: "done" },
            { label: "Финансовые гарантии", status: "done" },
            { label: "Справки с работы", status: "pending" },
            { label: "Бронирования (Отель, Авиа)", status: "done" },
          ].map((doc) => (
            <div key={doc.label} className="flex items-center gap-3">
              {doc.status === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-white/20" />
              )}
              <span
                className={`text-[13px] ${
                  doc.status === "done" ? "text-white/70" : "text-white"
                }`}
              >
                {doc.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="space-y-3">
      <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider pl-1">
        Участники ({data.applicantsCount})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.applicants.map((applicant, index) => (
          <div
            key={`${applicant.name}-${index}`}
            className="flex items-center p-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl transition-all group"
          >
            <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shadow-inner mr-3">
              {applicant.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-white font-medium truncate group-hover:text-[#8fa3ff] transition-colors">
                {applicant.name}
              </div>
              <div className="text-[11px] text-white/50 mt-0.5">{applicant.role}</div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-mono font-medium text-emerald-400">
                {applicant.completeness}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const QuestionnaireTab = ({
  onOpenQuestionnaire,
}: {
  onOpenQuestionnaire: () => void;
}) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-[16px] font-semibold text-white">Прогресс заполнения</h3>
        <p className="text-[12px] text-white/50 mt-1">
          Осталось заполнить 2 блока данных
        </p>
      </div>
      <button
        className="h-9 px-4 bg-white/10 hover:bg-white/15 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
        onClick={onOpenQuestionnaire}
        type="button"
      >
        <Edit3 className="w-4 h-4" /> Открыть анкету
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[
        { title: "Личные данные", icon: User, progress: 100, status: "done" },
        { title: "Паспортные данные", icon: FileDigit, progress: 100, status: "done" },
        {
          title: "Место работы / Учебы",
          icon: Briefcase,
          progress: 40,
          remaining: "3 поля",
          status: "in_progress",
        },
        { title: "Спонсоры и финансы", icon: CreditCard, progress: 0, status: "pending" },
        { title: "Детали поездки", icon: Plane, progress: 100, status: "done" },
        { title: "Визовая история", icon: History, progress: 100, status: "done" },
      ].map((section) => (
        <QuestionnaireSectionPreviewCard
          key={section.title}
          className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-4 hover:bg-white/[0.04] transition-colors cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={onOpenQuestionnaire}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpenQuestionnaire();
          }}
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              section.status === "done"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : section.status === "in_progress"
                  ? "bg-[#3a45b4]/10 border-[#3a45b4]/20 text-[#8fa3ff]"
                  : "bg-white/5 border-white/10 text-white/40"
            }`}
          >
            <section.icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium text-white truncate">
                {section.title}
              </span>
              <span className="text-[11px] font-mono text-white/50">
                {section.progress}%
              </span>
            </div>
            <ProgressMeter
              ariaHidden
              className="v19-questionnaire-section-progress"
              tone={
                section.status === "done"
                  ? "success"
                  : section.status === "in_progress"
                    ? "accent"
                    : "muted"
              }
              value={section.progress}
            />
            {section.remaining ? (
              <div className="text-[10px] text-white/40 mt-1.5">
                Осталось: {section.remaining}
              </div>
            ) : null}
          </div>
        </QuestionnaireSectionPreviewCard>
      ))}
    </div>
  </div>
);

const FilesTab = ({
  onUploadFile,
  submission,
}: {
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  submission: Submission;
}) => {
  const applicantSections = fileApplicantSections(submission);
  const firstUploadableApplicant =
    applicantSections.find((section) =>
      section.files.some(
        (file) =>
          file.status === "needs_replacement" ||
          (submission.status !== "returned" && file.status === "missing"),
      ),
    )?.id ?? applicantSections[0]?.id;
  const [expandedApplicantIds, setExpandedApplicantIds] = useState<string[]>(
    firstUploadableApplicant ? [firstUploadableApplicant] : [],
  );
  const fileInputsRef = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    setExpandedApplicantIds(firstUploadableApplicant ? [firstUploadableApplicant] : []);
  }, [firstUploadableApplicant, submission.id]);

  function toggleApplicant(applicantId: string) {
    setExpandedApplicantIds((current) =>
      current.includes(applicantId)
        ? current.filter((id) => id !== applicantId)
        : [...current, applicantId],
    );
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    fileId: string,
  ) {
    const selectedFile = event.currentTarget.files?.[0];
    if (!selectedFile) return;

    void onUploadFile?.(fileId, selectedFile);
    event.currentTarget.value = "";
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-white">Файлы подачи</h3>
          <p className="text-[12px] text-white/40 mt-0.5">
            Выберите файл для конкретного заявителя. Local/dev хранит файл только в
            этом браузере; Supabase-режим использует приватное Storage.
          </p>
        </div>
        <span className="min-w-8 px-2.5 py-1 bg-white/5 text-white/60 rounded-lg text-[12px] font-semibold border border-white/10 shrink-0 text-center">
          {submission.files.filter((file) => file.status !== "missing").length}/
          {submission.files.length}
        </span>
      </div>

      <div className="space-y-2.5">
        {applicantSections.map((section) => {
          const isExpanded = expandedApplicantIds.includes(section.id);
          const uploadedCount = section.files.filter(
            (file) => file.status !== "missing" && file.status !== "needs_replacement",
          ).length;
          const actionCount = section.files.length - uploadedCount;

          return (
            <section
              className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]"
              key={section.id}
            >
              <button
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                type="button"
                onClick={() => toggleApplicant(section.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-white">
                    {section.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-white/45">
                    {uploadedCount}/{section.files.length} файлов готово
                    {actionCount > 0 ? ` · требуется ${actionCount}` : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/55">
                  {isExpanded ? "Свернуть" : "Раскрыть"}
                </span>
              </button>

              {isExpanded ? (
                <div className="space-y-2 border-t border-white/6 p-3">
                  {section.files.map((file) => {
                    const canUpload =
                      file.status === "missing" || file.status === "needs_replacement";

                    return (
                      <div
                        className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-lg border border-white/5 bg-black/10 p-3 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center"
                        key={file.id}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50">
                          <UploadCloud className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-white">
                            {fileTypeLabel(file.type)}
                          </div>
                          <div className="mt-1 truncate text-[12px] text-white/45">
                            {fileSummary(file)}
                          </div>
                        </div>
                        {canUpload ? (
                          <>
                            <input
                              accept={fileAccept(file)}
                              aria-label={`${fileActionLabel(file)} ${fileTypeLabel(file.type)} — ${section.name}`}
                              className="drawer-file-input"
                              disabled={!onUploadFile}
                              ref={(node) => {
                                if (node) fileInputsRef.current.set(file.id, node);
                                else fileInputsRef.current.delete(file.id);
                              }}
                              type="file"
                              onChange={(event) => handleFileChange(event, file.id)}
                            />
                            <button
                              className="col-start-2 h-9 rounded-lg border border-white/10 bg-white/[0.08] px-4 text-[13px] font-medium text-white/85 transition-colors hover:border-white/20 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 sm:col-start-auto"
                              disabled={!onUploadFile}
                              type="button"
                              onClick={() => fileInputsRef.current.get(file.id)?.click()}
                            >
                              {fileActionLabel(file)}
                            </button>
                          </>
                        ) : (
                          <span className="col-start-2 inline-flex h-9 items-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 text-[12px] font-medium text-emerald-400 sm:col-start-auto">
                            Готово
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};

const IssuesTab = ({
  data,
  onMarkIssueFixed,
  onOpenQuestionnaire,
  role,
  submission,
}: {
  data: FigmaSubmissionDetail;
  onMarkIssueFixed?: (issueId: string) => void;
  onOpenQuestionnaire: () => void;
  role: Role;
  submission: Submission;
}) => (
  <div className="space-y-6">
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
      <div>
        <h3 className="text-[15px] font-semibold text-white">
          Замечания
        </h3>
        <p className="text-[12px] text-white/40 mt-0.5">
          Исправьте пункты ниже
        </p>
      </div>
      <span className="min-w-8 px-2.5 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-[12px] font-semibold border border-orange-500/20 shrink-0 text-center">
        {data.issuesCount}
      </span>
    </div>

    {data.issuesCount > 0 ? (
      <div className="space-y-3">
        {submission.issues
          .filter((issue) => issue.status !== "closed_by_admin")
          .map((issue) => {
            const Icon = issue.type === "file" ? ImageIcon : FileText;
            const canMarkFixed =
              role === "agent" && issue.status === "open" && Boolean(onMarkIssueFixed);

            return (
            <div
              key={issue.id}
              className="relative p-4 bg-white/[0.02] border border-orange-500/15 rounded-xl hover:bg-orange-500/[0.03] transition-colors"
            >
              <span className="absolute right-4 top-4 px-1.5 py-0.5 rounded-md text-[10px] bg-orange-500/10 text-orange-400 font-medium border border-orange-500/20">
                {issue.status === "fixed_by_agent" ? "Исправлено" : "Blocker"}
              </span>
              <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-3 pr-20">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20 row-span-2">
                  <Icon className="w-5 h-5 text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[14px] font-semibold text-white">
                    {issue.reason}
                  </h4>
                  <div className="text-[11px] font-medium text-orange-400/70 mt-1.5">
                    {issue.target.applicantName} · {issue.target.section ?? "Подача"}
                  </div>
                </div>
                <p className="col-start-2 text-[13px] text-white/50 leading-relaxed">
                  {issue.comment}
                </p>
              </div>
              {canMarkFixed ? (
                <button
                  className="mt-4 w-full h-9 px-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-[13px] font-medium text-white/80 hover:text-white transition-colors"
                  type="button"
                  onClick={() => onMarkIssueFixed?.(issue.id)}
                >
                  Отметить исправленным
                </button>
              ) : issue.type === "field" && issue.status === "open" ? (
                <button
                  className="mt-4 w-full h-9 px-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-[13px] font-medium text-white/80 hover:text-white transition-colors"
                  type="button"
                  onClick={onOpenQuestionnaire}
                >
                  Исправить
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <h4 className="text-[16px] font-semibold text-white mb-2">
          Ошибок не найдено
        </h4>
        <p className="text-[13px] text-white/50 max-w-sm">
          Все данные проверены администратором. Замечаний к анкете и документам нет.
        </p>
      </div>
    )}
  </div>
);

const HistoryTab = () => (
  <div className="relative pl-6 space-y-8 before:absolute before:inset-y-2 before:left-[31px] before:w-px before:bg-white/10">
    {[
      {
        icon: <AlertCircle className="w-4 h-4 text-orange-400" />,
        time: "Сегодня, 14:30",
        title: "Возвращено с замечаниями",
        type: "warning",
        user: "Система",
      },
      {
        icon: <UploadCloud className="w-4 h-4 text-[#8fa3ff]" />,
        time: "Вчера, 18:45",
        title: "Отправлено на проверку",
        type: "info",
        user: "Вы",
      },
      {
        icon: <ImageIcon className="w-4 h-4 text-white/60" />,
        time: "Вчера, 15:10",
        title: "Загружены сканы паспортов",
        type: "neutral",
        user: "Вы",
      },
      {
        icon: <FileText className="w-4 h-4 text-white/40" />,
        time: "Вчера, 12:00",
        title: "Создан черновик",
        type: "neutral",
        user: "Вы",
      },
    ].map((event) => (
      <div key={event.title} className="relative flex gap-5">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 bg-[#111113] z-10 ${
            event.type === "warning"
              ? "border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.2)]"
              : event.type === "info"
                ? "border-[#3a45b4]/50"
                : "border-white/10"
          }`}
        >
          {event.icon}
        </div>
        <div className="pt-1.5">
          <div className="text-[14px] font-medium text-white/90">{event.title}</div>
          <div className="flex items-center gap-2 mt-1.5 text-[12px] text-white/40">
            <span>{event.time}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>{event.user}</span>
          </div>
        </div>
      </div>
    ))}
  </div>
);

function initialTab(tab: DrawerTab): TabId {
  if (tab === "files") return "files";
  if (tab === "issues") return "issues";
  if (tab === "history") return "history";
  if (tab === "questionnaire") return "questionnaire";
  return "overview";
}

export function FigmaSubmissionDrawer({
  activeTab,
  actionError = "",
  onAction,
  onClose,
  onMarkIssueFixed,
  onOpenQuestionnaireWorkspace,
  onUploadFile,
  role,
  submission,
  surface,
}: FigmaSubmissionDrawerProps) {
  const [tab, setTab] = useState<TabId>(() => initialTab(activeTab));
  const [status, setStatus] = useState<"loading" | "success">("loading");
  const drawerTabsRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => buildDetail(submission), [submission]);
  const primaryAction = getPrimaryAction(submission, role, surface);

  useEffect(() => {
    setStatus("loading");
    setTab(initialTab(activeTab));
    const timer = window.setTimeout(() => setStatus("success"), 260);
    return () => window.clearTimeout(timer);
  }, [activeTab, submission.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (status !== "success") return;
    const activeButton = drawerTabsRef.current?.querySelector<HTMLButtonElement>(
      `[data-drawer-tab="${tab}"]`,
    );
    activeButton?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [status, tab]);

  const tabs: Array<{
    getCount?: (detail: FigmaSubmissionDetail) => number;
    id: TabId;
    isWarning?: boolean;
    label: string;
  }> = [
    { id: "overview", label: "Обзор" },
    { id: "questionnaire", label: "Анкета" },
    { id: "files", label: "Файлы" },
    {
      getCount: (detail) => detail.issuesCount,
      id: "issues",
      isWarning: true,
      label: "Замечания",
    },
    { id: "history", label: "История" },
  ];

  const footerAction =
    data.status === "returned" ? (
      <button
        className="v19-drawer-footer-action v19-drawer-footer-action--returned"
        disabled={primaryAction.disabled}
        type="button"
        onClick={() => {
          if (!primaryAction.disabled) onAction(primaryAction.action);
        }}
      >
        <UploadCloud className="w-4 h-4" /> Отправить исправления
      </button>
    ) : (
      <button
        className="v19-drawer-footer-action v19-drawer-footer-action--primary"
        disabled={primaryAction.disabled}
        type="button"
        onClick={() => onAction(primaryAction.action)}
      >
        <CheckCircle2 className="w-4 h-4" /> {primaryAction.label}
      </button>
    );
  const footerStatusText =
    actionError ||
    primaryAction.reason ||
    (data.status === "returned"
      ? "Исправьте замечания перед повторной отправкой."
      : statusLabels[submission.status]);

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        key="figma-drawer-overlay"
        onClick={onClose}
        transition={{ duration: 0.25 }}
      />

      <motion.div
        animate={{ opacity: 1, x: 0, y: 0 }}
        className="vf-figma-surface v19-submission-drawer-frame v19-figma-drawer-shell"
        exit={{ opacity: 0, x: 0, y: 0 }}
        initial={{
          opacity: 0.5,
          x: 0,
          y: 0,
        }}
        key="figma-drawer-panel"
        role="dialog"
        aria-label={`Подача ${data.id}`}
        aria-modal="true"
        transition={{ damping: 28, mass: 0.8, stiffness: 240, type: "spring" }}
      >
        <div className="v19-figma-drawer-grabber-wrap">
          <div className="v19-figma-drawer-grabber" />
        </div>

        {status === "loading" ? (
          <div className="flex-1 p-6 lg:p-8 flex flex-col pointer-events-none">
            <Skeleton className="w-48 h-5 mb-4" />
            <Skeleton className="w-3/4 max-w-[400px] h-8 mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <Skeleton className="h-[160px] w-full rounded-xl" />
              <Skeleton className="h-[160px] w-full rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            <header className="v19-figma-drawer-header">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] lg:text-xs text-white/50 mb-2">
                    <span className="font-mono font-medium tracking-wider text-white/70">
                      {data.id}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="uppercase tracking-wider">
                      {data.type === "family" ? "Семейная" : "Индивидуальная"}
                    </span>
                  </div>
                  <h2 className="text-[24px] font-semibold text-white leading-tight tracking-tight mb-4">
                    {data.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StatusBadge status={data.status} />
                    <span className="text-[12px] text-white/40 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Обновлено {data.updated}
                    </span>
                  </div>
                </div>

                <button
                  className="v19-figma-drawer-close"
                  aria-label="Закрыть подачу"
                  type="button"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                className="w-full overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0"
                ref={drawerTabsRef}
              >
                <div className="flex items-center gap-1.5 w-max mb-[-1px]">
                  {tabs.map((item) => {
                    const count = item.getCount ? item.getCount(data) : 0;
                    const isActive = tab === item.id;
                    return (
                      <button
                        className={`relative min-h-[44px] px-4 text-[13px] font-medium transition-colors flex items-center gap-2 focus-visible:outline-none whitespace-nowrap ${
                          isActive ? "text-white" : "text-white/50 hover:text-white/80"
                        }`}
                        data-drawer-tab={item.id}
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        type="button"
                      >
                        <span>{item.label}</span>
                        {count > 0 ? (
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none ml-1 ${
                              item.isWarning
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-white/10 text-white/70"
                            }`}
                          >
                            {count}
                          </span>
                        ) : null}
                        {isActive ? (
                          <motion.div
                            className="absolute bottom-0 inset-x-0 h-0.5 bg-white"
                            initial={false}
                            layoutId="drawerAgentActiveTab"
                            transition={{ bounce: 0.2, duration: 0.5, type: "spring" }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            <div className="v19-submission-drawer-body flex-1 min-h-0 overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
              <AnimatePresence mode="wait">
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  initial={{ opacity: 0, y: 10 }}
                  key={tab}
                  transition={{ duration: 0.2 }}
                >
                  {tab === "overview" ? <OverviewTab data={data} /> : null}
                  {tab === "questionnaire" ? (
                    <QuestionnaireTab
                      onOpenQuestionnaire={onOpenQuestionnaireWorkspace}
                    />
                  ) : null}
                  {tab === "files" ? (
                    <FilesTab
                      onUploadFile={onUploadFile}
                      submission={submission}
                    />
                  ) : null}
                  {tab === "issues" ? (
                    <IssuesTab
                      data={data}
                      onMarkIssueFixed={onMarkIssueFixed}
                      onOpenQuestionnaire={onOpenQuestionnaireWorkspace}
                      role={role}
                      submission={submission}
                    />
                  ) : null}
                  {tab === "history" ? <HistoryTab /> : null}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="v19-figma-drawer-footer">
              <div className="text-[12px] text-white/40 hidden sm:block">
                {footerStatusText}
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  className="v19-drawer-footer-action v19-drawer-footer-action--ghost"
                  aria-label="Закрыть подачу"
                  type="button"
                  onClick={onClose}
                >
                  Отмена
                </button>
                {footerAction}
              </div>
            </footer>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
