import { useEffect, useMemo, useState } from "react";
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
import type { DrawerTab, Role, Submission, SubmissionAction } from "../types";

type SourceStatus =
  | "draft"
  | "in_progress"
  | "submitted_for_review"
  | "returned"
  | "corrections_received"
  | "ready_for_export"
  | "exported";

type TabId = "overview" | "questionnaire" | "issues" | "history";

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

const QuestionnaireTab = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-[16px] font-semibold text-white">Прогресс заполнения</h3>
        <p className="text-[12px] text-white/50 mt-1">
          Осталось заполнить 2 блока данных
        </p>
      </div>
      <button
        aria-disabled="true"
        className="h-9 px-4 bg-white/10 hover:bg-white/15 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
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
        <div
          key={section.title}
          className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-4 hover:bg-white/[0.04] transition-colors"
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
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
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

const IssuesTab = ({
  data,
  onOpenQuestionnaire,
}: {
  data: FigmaSubmissionDetail;
  onOpenQuestionnaire: () => void;
}) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between border-b border-white/5 pb-4">
      <div>
        <h3 className="text-[15px] font-semibold text-white">
          Список задач по замечаниям
        </h3>
        <p className="text-[12px] text-white/40 mt-0.5">
          Ошибки, выявленные администратором при проверке
        </p>
      </div>
      <span className="px-2.5 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-[12px] font-medium border border-orange-500/20 shrink-0">
        Требуют исправления: {data.issuesCount}
      </span>
    </div>

    {data.issuesCount > 0 ? (
      <div className="space-y-3">
        {[
          {
            actionText: "Исправить",
            desc: "В анкете указано 12.05.1985, а в загруженном скане паспорта — 15.05.1985.",
            icon: FileText,
            id: 1,
            opensQuestionnaire: true,
            target: "Иван Петров • Паспортные данные",
            title: "Несоответствие даты рождения",
          },
          {
            actionText: "Перезагрузить",
            desc: "Размытый скан, не читается MRZ-зона. Загрузите файл в более высоком разрешении.",
            icon: ImageIcon,
            id: 2,
            opensQuestionnaire: false,
            target: "Анна Петрова • Скан загранпаспорта",
            title: "Плохое качество скана",
          },
        ]
          .slice(0, data.issuesCount)
          .map((issue) => (
            <div
              key={issue.id}
              className="p-4 bg-white/[0.02] border border-orange-500/15 rounded-xl flex flex-col sm:flex-row gap-4 hover:bg-orange-500/[0.03] transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                <issue.icon className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h4 className="text-[14px] font-semibold text-white">
                    {issue.title}
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-orange-500/10 text-orange-400 font-medium border border-orange-500/20">
                    Blocker
                  </span>
                </div>
                <div className="text-[11px] font-medium text-orange-400/70 mb-2">
                  {issue.target}
                </div>
                <p className="text-[13px] text-white/50 leading-relaxed">
                  {issue.desc}
                </p>
              </div>
              <div className="sm:w-[160px] shrink-0 flex sm:items-center">
                <button
                  aria-disabled={issue.opensQuestionnaire ? undefined : "true"}
                  className="w-full h-9 px-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-[13px] font-medium text-white/80 hover:text-white transition-colors"
                  onClick={
                    issue.opensQuestionnaire ? onOpenQuestionnaire : undefined
                  }
                  type="button"
                >
                  {issue.actionText}
                </button>
              </div>
            </div>
          ))}
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
  onOpenQuestionnaireWorkspace,
  role,
  submission,
  surface,
}: FigmaSubmissionDrawerProps) {
  const [tab, setTab] = useState<TabId>(() => initialTab(activeTab));
  const [status, setStatus] = useState<"loading" | "success">("loading");
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

  const tabs: Array<{
    getCount?: (detail: FigmaSubmissionDetail) => number;
    id: TabId;
    isWarning?: boolean;
    label: string;
  }> = [
    { id: "overview", label: "Обзор" },
    { id: "questionnaire", label: "Анкета" },
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
        className="flex-1 sm:flex-none h-11 px-8 bg-orange-500 hover:bg-orange-600 text-white font-medium text-[14px] rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.2)] transition-colors flex items-center justify-center gap-2"
        onClick={() => onAction(primaryAction.action)}
      >
        <UploadCloud className="w-4 h-4" /> Отправить исправления
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

                <button
                  className="hidden lg:flex w-10 h-10 items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-colors border border-white/5 hover:border-white/10"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="w-full overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0">
                <div className="flex items-center gap-1.5 w-max mb-[-1px]">
                  {tabs.map((item) => {
                    const count = item.getCount ? item.getCount(data) : 0;
                    const isActive = tab === item.id;
                    return (
                      <button
                        className={`relative min-h-[44px] px-4 text-[13px] font-medium transition-colors flex items-center gap-2 focus-visible:outline-none whitespace-nowrap ${
                          isActive ? "text-white" : "text-white/50 hover:text-white/80"
                        }`}
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
                  {tab === "questionnaire" ? <QuestionnaireTab /> : null}
                  {tab === "issues" ? (
                    <IssuesTab
                      data={data}
                      onOpenQuestionnaire={onOpenQuestionnaireWorkspace}
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
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  className="flex-1 sm:flex-none h-11 px-5 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-medium text-[14px] rounded-xl transition-colors"
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
