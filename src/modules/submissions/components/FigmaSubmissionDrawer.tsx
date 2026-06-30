import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileDigit,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  Plane,
  ShieldAlert,
  UploadCloud,
  User,
} from "lucide-react";
import { getPrimaryAction, statusLabels } from "../status";
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
  onUploadFile?: (fileId: string) => void;
  onOpenQuestionnaireWorkspace: () => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
  [key: string]: unknown;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    typeof window !== "undefined" ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

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

const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`bg-white/5 animate-pulse rounded-[10px] ${className}`} />
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
            3/3
          </span>
        </div>
        <div className="space-y-3 flex-1 flex flex-col justify-center">
          {[
            { label: "Скан загранпаспорта", status: "done" },
            { label: "Селфи с лицом", status: "done" },
            { label: "Селфи с загранпаспортом", status: "done" },
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
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-[16px] font-semibold text-white">Блоки анкеты</h3>
      </div>
      <button
        className="h-10 px-5 min-w-[142px] bg-white/[0.13] hover:bg-white/[0.18] border border-white/10 hover:border-white/15 text-white text-[13px] font-semibold rounded-xl transition-colors whitespace-nowrap"
        onClick={onOpenQuestionnaire}
        type="button"
      >
        Открыть анкету
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
        <div
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
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border bg-white/5 border-white/10 text-white/45">
            <section.icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium text-white truncate">
                {section.title}
              </span>
              <span className="text-[11px] font-mono text-white/50">
                {section.progress}%
              </span>
            </div>
            <div className="w-4/5 h-[3px] bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  section.status === "done"
                    ? "bg-emerald-500"
                    : section.status === "in_progress"
                      ? "bg-[#3a45b4]"
                      : "bg-white/10"
                }`}
                style={{ width: `${section.progress}%` }}
              />
            </div>
            {section.remaining ? (
              <div className="text-[10px] text-white/40 mt-1.5">
                Осталось: {section.remaining}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const FilesTab = ({
  onUploadFile,
  submission,
}: {
  onUploadFile?: (fileId: string) => void;
  submission: Submission;
}) => (
  <div className="space-y-5">
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
      <div>
        <h3 className="text-[15px] font-semibold text-white">Файлы подачи</h3>
        <p className="text-[12px] text-white/40 mt-0.5">
          Загрузите недостающие файлы. OCR и хранение остаются в текущем pilot-режиме.
        </p>
      </div>
      <span className="min-w-8 px-2.5 py-1 bg-white/5 text-white/60 rounded-lg text-[12px] font-semibold border border-white/10 shrink-0 text-center">
        {submission.files.filter((file) => file.status !== "missing").length}/
        {submission.files.length}
      </span>
    </div>

    <div className="space-y-3">
      {submission.files.map((file) => {
        const applicant = submission.applicants.find(
          (item) => item.id === file.applicantId,
        );
        const canUpload = file.status === "missing" || file.status === "needs_replacement";

        return (
          <div
            className="grid grid-cols-[40px_minmax(0,1fr)] sm:grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center rounded-xl border border-white/5 bg-white/[0.02] p-4"
            key={file.id}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-white">
                {fileTypeLabel(file.type)}
              </div>
              <div className="mt-1 text-[12px] text-white/45">
                {applicant?.fullName ?? "Заявитель"} · {fileStatusLabel(file)}
              </div>
            </div>
            {canUpload ? (
              <button
                className="col-start-2 sm:col-start-auto h-9 rounded-lg border border-white/10 bg-white/[0.08] px-4 text-[13px] font-medium text-white/85 transition-colors hover:border-white/20 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!onUploadFile}
                type="button"
                onClick={() => onUploadFile?.(file.id)}
              >
                {fileActionLabel(file)}
              </button>
            ) : (
              <span className="col-start-2 sm:col-start-auto inline-flex h-9 items-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 text-[12px] font-medium text-emerald-400">
                Готово
              </span>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

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

const HistoryTab = () => {
  const events = [
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
    ];

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        backgroundColor: "rgb(255 255 255 / 0.035)",
        border: "1px solid rgb(255 255 255 / 0.1)",
      }}
    >
      {events.map((event, index) => {
        const isLast = index === events.length - 1;

        return (
          <div
            key={event.title}
            className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 px-4 py-4"
            style={
              isLast
                ? undefined
                : { borderBottom: "1px solid rgb(255 255 255 / 0.06)" }
            }
          >
            <div className="relative flex justify-center">
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-9 bottom-[-17px] w-px -translate-x-1/2"
                  style={{ backgroundColor: "rgb(255 255 255 / 0.08)" }}
                />
              ) : null}
              <div
                className={`relative z-10 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-[#111113] ${
                  event.type === "warning"
                    ? "border-orange-500/30"
                    : event.type === "info"
                      ? "border-[#8fa3ff]/30"
                      : "border-white/10"
                }`}
              >
                {event.icon}
              </div>
            </div>
            <div className="min-w-0 pt-1">
              <div className="text-[14px] font-medium text-white/90">
                {event.title}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[12px] text-white/40">
                <span>{event.time}</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>{event.user}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
  const isDesktop = useMediaQuery("(min-width: 1024px)");
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
        className="flex-1 sm:flex-none h-11 px-6 bg-white/[0.13] hover:bg-white/[0.18] text-white/85 hover:text-white font-semibold text-[14px] rounded-xl border border-white/10 hover:border-white/15 transition-colors flex items-center justify-center whitespace-nowrap"
        disabled={primaryAction.disabled}
        onClick={() => onAction(primaryAction.action)}
      >
        Отправить исправления
      </button>
    ) : (
      <button
        className="flex-1 sm:flex-none h-11 px-8 bg-[#3a45b4] hover:bg-[#4855d4] text-white font-medium text-[14px] rounded-xl shadow-[0_0_20px_rgba(58,69,180,0.3)] transition-colors flex items-center justify-center gap-2"
        disabled={primaryAction.disabled}
        onClick={() => onAction(primaryAction.action)}
      >
        <CheckCircle2 className="w-4 h-4" /> {primaryAction.label}
      </button>
    );

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
        className="vf-figma-surface fixed z-50 flex flex-col bg-[#111113] border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)] lg:inset-y-2 lg:right-2 lg:w-[840px] lg:rounded-2xl lg:border lg:overflow-hidden inset-x-0 bottom-0 top-12 rounded-t-[28px] border-t border-x overflow-y-auto"
        exit={{
          opacity: 0,
          x: isDesktop ? "100%" : 0,
          y: isDesktop ? 0 : "100%",
        }}
        initial={{
          opacity: 0.5,
          x: isDesktop ? "100%" : 0,
          y: isDesktop ? 0 : "100%",
        }}
        key="figma-drawer-panel"
        role="dialog"
        transition={{ damping: 28, mass: 0.8, stiffness: 240, type: "spring" }}
      >
        <div className="lg:hidden sticky top-0 z-30 w-full flex items-center justify-center py-3 bg-[#111113]/90 backdrop-blur-md">
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
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
            <header className="px-5 lg:px-8 pt-4 pb-0 bg-[#111113]/95 backdrop-blur-md relative lg:sticky lg:top-0 z-20 shrink-0 border-b border-white/5">
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

            <div className="lg:flex-1 lg:overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
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

            <footer className="p-4 lg:px-8 lg:py-5 border-t border-white/10 bg-[#111113]/95 backdrop-blur-md shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:sticky lg:bottom-0 z-20">
              <div className="text-[12px] text-white/40 hidden sm:block">
                {actionError ||
                  (data.status === "returned"
                    ? "Исправьте замечания перед повторной отправкой."
                    : statusLabels[submission.status])}
              </div>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 w-full sm:flex sm:w-auto">
                <button
                  className="w-full sm:w-auto h-11 px-5 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-medium text-[14px] rounded-xl transition-colors"
                  onClick={onClose}
                >
                  Закрыть
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
