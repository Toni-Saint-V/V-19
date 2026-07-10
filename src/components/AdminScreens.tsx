import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  FileCheck2,
  Flame,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import {
  AdminMetricCard,
  AdminQueueToolbar,
  AdminToolbarSelect,
} from "./AdminSurfaceCommon";
import {
  buildAdminTriageRadar,
  type AdminTriageRadarItem,
} from "../modules/submissions/adminTriageRadar";
import { agentOwnerDisplayName } from "../modules/submissions/ownership";
import { getPrimaryAction } from "../modules/submissions/status";
import type {
  Submission,
  SubmissionStatus,
} from "../modules/submissions/types";

interface AdminScreenProps {
  onOpenDrawer: (id: string) => void;
  submissions?: Submission[];
}

type Lane = "urgent" | "review" | "returned" | "ready";
type AdminReviewSort = "tripDate" | "createdAt";
type AdminReviewTypeFilter = "all" | "family" | "single";

interface ReviewCard {
  id: string;
  title: string;
  type: "family" | "single";
  applicants: number;
  country: string;
  city: string;
  lane: Lane;
  agent: string;
  timeInQueue: string;
  questionnaire: number;
  files: number;
  blockers: number;
  warnings: number;
  aiFlags: number;
  nextAction: string;
  lastEvent: string;
  createdAtIso: string;
  tripDateIso: string;
}

const reviews: ReviewCard[] = [
  {
    id: "SUB-1061",
    title: "Семья Орловых",
    type: "family",
    applicants: 4,
    country: "Испания",
    city: "Москва",
    lane: "urgent",
    agent: "Мария Климова",
    timeInQueue: "1 ч 15 мин",
    questionnaire: 100,
    files: 92,
    blockers: 1,
    warnings: 2,
    aiFlags: 1,
    nextAction: "Проверить паспорт основного заявителя",
    lastEvent: "Агент загрузил исправленный scan 14 мин назад",
    createdAtIso: "2026-07-06T10:30:00.000Z",
    tripDateIso: "2026-08-11T00:00:00.000Z",
  },
  {
    id: "SUB-1082",
    title: "Евгений Смирнов",
    type: "single",
    applicants: 1,
    country: "Испания",
    city: "Санкт-Петербург",
    lane: "review",
    agent: "Игорь Сафонов",
    timeInQueue: "45 мин",
    questionnaire: 96,
    files: 100,
    blockers: 0,
    warnings: 1,
    aiFlags: 1,
    nextAction: "Сверить место рождения в анкете и паспорте",
    lastEvent: "OCR отметил расхождение 8 мин назад",
    createdAtIso: "2026-07-07T08:40:00.000Z",
    tripDateIso: "2026-08-02T00:00:00.000Z",
  },
  {
    id: "FAM-005",
    title: "Семья Кузнецовых",
    type: "family",
    applicants: 3,
    country: "Испания",
    city: "Екатеринбург",
    lane: "returned",
    agent: "Олег Морозов",
    timeInQueue: "2 ч 05 мин",
    questionnaire: 88,
    files: 71,
    blockers: 2,
    warnings: 0,
    aiFlags: 0,
    nextAction: "Ждём новые справки по детям",
    lastEvent: "Админ вернул 2 замечания сегодня в 11:42",
    createdAtIso: "2026-07-05T15:10:00.000Z",
    tripDateIso: "2026-08-19T00:00:00.000Z",
  },
  {
    id: "SUB-1078",
    title: "Дмитрий Волков",
    type: "single",
    applicants: 1,
    country: "Испания",
    city: "Москва",
    lane: "ready",
    agent: "Анна Ветрова",
    timeInQueue: "18 мин",
    questionnaire: 100,
    files: 100,
    blockers: 0,
    warnings: 0,
    aiFlags: 0,
    nextAction: "Подтвердить и отправить в выгрузку",
    lastEvent: "Все замечания закрыты 18 мин назад",
    createdAtIso: "2026-07-07T09:20:00.000Z",
    tripDateIso: "2026-09-06T00:00:00.000Z",
  },
];

const adminReviewStatuses = new Set<SubmissionStatus>([
  "submitted_for_review",
  "corrections_received",
  "returned",
  "ready_for_export",
]);

function unresolvedIssues(submission: Submission) {
  return submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin",
  );
}

function unresolvedBlockerCount(submission: Submission) {
  return unresolvedIssues(submission).filter(
    (issue) => issue.severity === "blocker",
  ).length;
}

function unresolvedWarningCount(submission: Submission) {
  const unresolved = unresolvedIssues(submission);
  const issueWarnings = unresolved.filter(
    (issue) => issue.severity !== "blocker",
  ).length;
  const readinessWarnings = [
    submission.completeness.questionnaire,
    submission.completeness.files,
  ].filter((value) => value < 100).length;
  return issueWarnings + readinessWarnings;
}

function reviewLaneForSubmission(submission: Submission): Lane {
  if (submission.status === "returned") return "returned";
  if (submission.status === "ready_for_export") return "ready";
  if (unresolvedBlockerCount(submission) > 0) return "urgent";
  if (
    submission.status === "submitted_for_review" &&
    submission.completeness.total >= 100
  )
    return "ready";
  return "review";
}

function dateIsoFromLabel(value: string, fallbackIso: string): string {
  const normalized = value.trim();
  const dmy = normalized.match(/^(\d{2})\.(\d{2})(?:\.(\d{4}))?/);
  if (dmy) {
    const year = dmy[3] ?? String(new Date().getFullYear());
    return `${year}-${dmy[2]}-${dmy[1]}T00:00:00.000Z`;
  }
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return fallbackIso;
}

function reviewCardFromSubmission(submission: Submission): ReviewCard {
  const primaryAction = getPrimaryAction(submission, "admin", "review");
  const blockers = unresolvedBlockerCount(submission);
  const warnings = unresolvedWarningCount(submission);
  const updatedIso = dateIsoFromLabel(
    submission.updatedAt,
    new Date(0).toISOString(),
  );
  const tripIso = dateIsoFromLabel(submission.tripDateFrom, updatedIso);
  const aiFlags = (submission.aiSuggestions ?? []).filter(
    (suggestion) => suggestion.status === "suggested",
  ).length;

  return {
    id: submission.id,
    title: submission.listTitle ?? submission.title,
    type: submission.type,
    applicants: submission.applicants.length,
    country: submission.country,
    city: submission.city,
    lane: reviewLaneForSubmission(submission),
    agent: agentOwnerDisplayName(submission.agentId),
    timeInQueue: submission.updatedAt,
    questionnaire: submission.completeness.questionnaire,
    files: submission.completeness.files,
    blockers,
    warnings,
    aiFlags,
    nextAction:
      primaryAction.disabled && primaryAction.reason
        ? `${primaryAction.label}: ${primaryAction.reason}`
        : primaryAction.label,
    lastEvent: submission.history[0]?.text ?? "История пока пустая",
    createdAtIso: dateIsoFromLabel(submission.createdAt, updatedIso),
    tripDateIso: tripIso,
  };
}

function reviewCardsFromSubmissions(submissions: Submission[]): ReviewCard[] {
  return submissions
    .filter((submission) => adminReviewStatuses.has(submission.status))
    .map(reviewCardFromSubmission);
}

const lanes: {
  id: Lane;
  title: string;
  subtitle: string;
  tone: string;
  icon: React.ElementType;
}[] = [
  {
    id: "urgent",
    title: "Блокеры",
    subtitle: "сначала сюда",
    tone: "red",
    icon: Flame,
  },
  {
    id: "review",
    title: "Проверить",
    subtitle: "ручная сверка",
    tone: "orange",
    icon: ShieldCheck,
  },
  {
    id: "returned",
    title: "Исправления",
    subtitle: "ответ агента",
    tone: "blue",
    icon: MessageSquareWarning,
  },
  {
    id: "ready",
    title: "Готово",
    subtitle: "к выгрузке",
    tone: "green",
    icon: CheckCircle2,
  },
];

const reviewIntroStorageKey = "visaflow.v19.adminReviewIntroSeen";

function toneClasses(tone: string) {
  switch (tone) {
    case "red":
      return "border-[#5b2b32]/45 bg-[#24191b]/60 text-[#ff5c67]";
    case "orange":
      return "border-[#6a481f]/45 bg-[#2d2118]/65 text-[#f59e0b]";
    case "blue":
      return "border-[#6f64ff]/25 bg-[#6f64ff]/15 text-[#8fa3ff]";
    case "green":
      return "border-[#244238]/45 bg-[#14251f]/45 text-[#34d399]";
    default:
      return "border-white/10 bg-white/5 text-white/50";
  }
}

function reviewCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'заявок';
  if (lastDigit === 1) return 'заявка';
  if (lastDigit >= 2 && lastDigit <= 4) return 'заявки';
  return 'заявок';
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10.5px] text-white/40">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-[#8fa3ff]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function ReviewQueueCard({
  item,
  onOpenDrawer,
}: {
  item: ReviewCard;
  onOpenDrawer: (id: string) => void;
}) {
  const hasBlocker = item.blockers > 0;
  const shortQueueTime = item.timeInQueue.replace(/\s+\d+\s+мин$/, "");

  return (
    <button
      aria-label={`Ручная проверка заявки ${item.title}`}
      data-submission-card=""
      data-submission-id={item.id}
      onClick={() => onOpenDrawer(item.id)}
      className={`group w-full rounded-[10px] border p-4 text-left font-medium transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.22)] ${hasBlocker ? "border-[#5b2b32]/45 bg-[#1d1719]/80 hover:border-[#74414a]/55" : "border-[#242529] bg-[#161617] hover:border-[#6f64ff]/40"}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10.5px] font-medium tracking-wide text-white/40">
            <span className="shrink-0 font-mono text-white/60">{item.id}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="shrink-0">{item.city}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="shrink-0">{shortQueueTime}</span>
          </div>
          <h3 className="truncate text-[15px] font-semibold text-white group-hover:text-[#b8baff]">
            {item.title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] font-medium text-white/45">
            {item.type === "family" ? (
              <Users className="h-3.5 w-3.5" />
            ) : (
              <User className="h-3.5 w-3.5" />
            )}
            <span>{item.applicants} чел.</span>
          </div>
        </div>
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/30 transition-colors group-hover:bg-white/[0.09] group-hover:text-white/55">
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      <div className="mb-3 rounded-[8px] border border-white/5 bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-white/75">
          {item.aiFlags > 0 ? (
            <Sparkles className="h-3.5 w-3.5 text-[#b8baff]" />
          ) : (
            <FileCheck2 className="h-3.5 w-3.5 text-[#b8baff]" />
          )}
          Следующее действие
        </div>
        <p className="text-[12px] leading-relaxed text-white/50">
          {item.nextAction}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <ProgressLine label="Анкета" value={item.questionnaire} />
        <ProgressLine label="Файлы" value={item.files} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.blockers > 0 && (
          <span className="rounded-full border border-[#5b2b32]/45 bg-[#24191b]/60 px-2 py-1 text-[9px] font-medium text-[#d59aa3]">
            {item.blockers} блокера
          </span>
        )}
        {item.warnings > 0 && (
          <span className="rounded-full border border-[#6a481f]/45 bg-[#2d2118]/65 px-2 py-1 text-[9px] font-medium text-[#f59e0b]">
            {item.warnings} проверить
          </span>
        )}
        {item.aiFlags > 0 && (
          <span className="rounded-full border border-[#6f64ff]/25 bg-[#6f64ff]/15 px-2 py-1 text-[9px] font-medium text-[#b8baff]">
            ИИ {item.aiFlags}
          </span>
        )}
        {item.blockers === 0 && item.warnings === 0 && (
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[9px] font-medium text-[#b8baff]">
            без замечаний
          </span>
        )}
      </div>

      <div className="mt-3 border-t border-white/5 pt-3 text-[11px] font-medium text-[#6d6f6d]">
        {item.agent}
      </div>
    </button>
  );
}

type ReviewAiWatchItem =
  | {
      agent?: string;
      id: string;
      reason: string;
      title: string;
      tone: AdminTriageRadarItem["band"];
      score?: number;
    }
  | {
      agent: string;
      id: string;
      reason: string;
      title: string;
      tone: "attention" | "critical";
      score?: number;
    };

function watchToneClass(tone: ReviewAiWatchItem["tone"]) {
  if (tone === "critical") {
    return "border-[#5b2b32]/45 bg-[#24191b]/50";
  }
  if (tone === "ready") {
    return "border-[#244238]/40 bg-[#14251f]/35";
  }
  return "border-[#6f64ff]/25 bg-[#6f64ff]/10";
}

function buildReviewAiWatchlist(
  submissions: Submission[] | undefined,
): ReviewAiWatchItem[] {
  if (submissions) {
    if (submissions.length === 0) return [];
    const radarItems = buildAdminTriageRadar(submissions).items;
    const signalItems = radarItems.filter(
      (item) => item.band === "critical" || item.band === "attention",
    );
    const visibleItems = signalItems.length ? signalItems : radarItems;

    return visibleItems.slice(0, 3).map((item) => ({
      id: item.submissionId,
      reason: item.reasons[0] ?? item.nextAction,
      score: item.score,
      title: item.title,
      tone: item.band,
    }));
  }

  return reviews
    .filter((item) => item.aiFlags > 0 || item.blockers > 0)
    .slice(0, 3)
    .map((item) => ({
      agent: item.agent,
      id: item.id,
      reason: item.nextAction,
      title: item.title,
      tone: item.blockers > 0 ? "critical" : "attention",
    }));
}

export function ReviewScreen({ onOpenDrawer, submissions }: AdminScreenProps) {
  const [activeLane, setActiveLane] = useState<Lane | "all">("all");
  const [cityFilter, setCityFilter] = useState("Все города");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<AdminReviewSort>("tripDate");
  const [typeFilter, setTypeFilter] = useState<AdminReviewTypeFilter>("all");
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem(reviewIntroStorageKey) !== "true";
  });
  const reviewSource = useMemo(
    () => (submissions ? reviewCardsFromSubmissions(submissions) : reviews),
    [submissions],
  );
  const cityOptions = useMemo(
    () => [
      "Все города",
      ...Array.from(new Set(reviewSource.map((item) => item.city))),
    ],
    [reviewSource],
  );
  const searchNeedle = searchQuery.trim().toLowerCase();
  const filteredReviews = reviewSource
    .filter((item) => {
      const cityMatches =
        cityFilter === "Все города" || item.city === cityFilter;
      const typeMatches = typeFilter === "all" || item.type === typeFilter;
      const searchMatches =
        !searchNeedle ||
        [item.id, item.title, item.agent, item.city]
          .join(" ")
          .toLowerCase()
          .includes(searchNeedle);
      return cityMatches && typeMatches && searchMatches;
    })
    .sort((left, right) => {
      if (sortBy === "createdAt") {
        return Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso);
      }
      return Date.parse(left.tripDateIso) - Date.parse(right.tripDateIso);
    });
  const visibleReviews =
    activeLane === "all"
      ? filteredReviews
      : filteredReviews.filter((item) => item.lane === activeLane);
  const totalBlockers = filteredReviews.reduce(
    (sum, item) => sum + item.blockers,
    0,
  );
  const totalWarnings = filteredReviews.reduce(
    (sum, item) => sum + item.warnings,
    0,
  );
  const readyCount = filteredReviews.filter(
    (item) => item.lane === "ready",
  ).length;
  const aiWatchlist = useMemo(
    () => buildReviewAiWatchlist(submissions),
    [submissions],
  );

  useEffect(() => {
    if (!showIntro) return;

    window.sessionStorage.setItem(reviewIntroStorageKey, "true");
    const timeoutId = window.setTimeout(() => {
      setShowIntro(false);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [showIntro]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="v19-admin-screen grid h-full min-h-[760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
    >
      <section className="min-w-0 space-y-5">
        {showIntro && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-[10px] border border-[#242529] bg-gradient-to-br from-[#1a1a1d] via-[#161617] to-[#101011] p-5 lg:p-6"
          >
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin review cockpit
              </div>
              <h2 className="text-[24px] font-semibold tracking-tight text-white lg:text-[32px]">
                Пакеты на проверку
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/50">
                Не просто карточки: очередь показывает приоритет, блокеры,
                следующее действие, AI-флаги и готовность к выгрузке за 3
                секунды.
              </p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <AdminMetricCard
            active={activeLane === "all"}
            icon={FileText}
            label="В очереди"
            value={`${filteredReviews.length}`}
            onClick={() => setActiveLane("all")}
          />
          <AdminMetricCard
            active={activeLane === "urgent"}
            icon={Flame}
            label="Блокеры"
            value={`${totalBlockers}`}
            tone="red"
            onClick={() => setActiveLane("urgent")}
          />
          <AdminMetricCard
            active={activeLane === "review"}
            icon={AlertCircle}
            label="К проверке"
            value={`${totalWarnings}`}
            tone="orange"
            onClick={() => setActiveLane("review")}
          />
          <AdminMetricCard
            active={activeLane === "ready"}
            icon={CheckCircle2}
            label="К выгрузке"
            value={`${readyCount}`}
            tone="green"
            onClick={() => setActiveLane("ready")}
          />
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617]">
          <AdminQueueToolbar
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            filterLabel="Фильтры проверки"
            controls={
              <>
                <AdminToolbarSelect<AdminReviewSort>
                  label="Сортировка"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: "tripDate", label: "Дата поездки" },
                    { value: "createdAt", label: "Дата создания" },
                  ]}
                />
                <AdminToolbarSelect<AdminReviewTypeFilter>
                  label="Тип"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={[
                    { value: "all", label: "Семьи и заявители" },
                    { value: "family", label: "Семьи" },
                    { value: "single", label: "Заявители" },
                  ]}
                />
              </>
            }
            onCityFilterChange={setCityFilter}
            onFilterClick={() => {
              setActiveLane("all");
              setCityFilter("Все города");
              setSearchQuery("");
              setSortBy("tripDate");
              setTypeFilter("all");
            }}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Поиск: ID, агент, семья"
            searchValue={searchQuery}
          />

          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-4">
            {lanes.map((lane) => {
              const Icon = lane.icon;
              const laneItems = visibleReviews.filter(
                (item) => item.lane === lane.id,
              );
              if (
                (activeLane !== "all" && activeLane !== lane.id) ||
                laneItems.length === 0
              ) {
                return null;
              }

              return (
                <div
                  key={lane.id}
                  className="min-h-[360px] rounded-[10px] border border-[#242529] bg-[#141416] p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-[8px] border ${toneClasses(lane.tone)}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-white">
                          {lane.title}
                        </div>
                        <div className="text-[10.5px] text-white/35">
                          {lane.subtitle}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-[8px] bg-white/5 px-2 py-1 text-[11px] font-medium text-white/45">
                      {laneItems.length} {reviewCountLabel(laneItems.length)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {laneItems.map((item) => (
                      <ReviewQueueCard
                        key={item.id}
                        item={item}
                        onOpenDrawer={onOpenDrawer}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-5">
        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-[#b8baff]" />
            <h3 className="text-[15px] font-semibold text-white">
              Тихая AI-помощь
            </h3>
          </div>
          <div className="space-y-2.5">
            {aiWatchlist.length ? (
              aiWatchlist.map((item) => (
                <button
                  className={`w-full rounded-[10px] border p-3 text-left transition-colors hover:border-[#6f64ff]/45 ${watchToneClass(item.tone)}`}
                  data-submission-card=""
                  data-submission-id={item.id}
                  key={item.id}
                  type="button"
                  onClick={() => onOpenDrawer(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[12px] font-semibold text-white">
                      {item.id} · {item.title}
                    </span>
                    {typeof item.score === "number" ? (
                      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/45">
                        {item.score}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/48">
                    {item.reason}
                  </p>
                  {"agent" in item && item.agent ? (
                    <small className="mt-2 block text-[10.5px] text-white/35">
                      {item.agent}
                    </small>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                <div className="text-[12px] font-medium text-white">
                  Активных AI/OCR сигналов нет
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/42">
                  Очередь можно разбирать по фильтрам и ручным правилам.
                </p>
              </div>
            )}
          </div>
          <div className="mt-3 rounded-[10px] border border-white/5 bg-white/[0.025] px-3 py-2 text-[11px] leading-relaxed text-white/38">
            Подсказка не принимает решение и не закрывает замечания.
          </div>
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-white/40" />
            <h3 className="text-[15px] font-semibold text-white">
              SLA сегодня
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">Среднее ревью</span>
              <span className="text-[13px] font-semibold text-white">
                37 мин
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">Старейший пакет</span>
              <span className="text-[13px] font-semibold text-white/62">
                2 ч 05 мин
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">К выгрузке</span>
              <span className="text-[13px] font-semibold text-[#b8baff]">
                1 пакет
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <h3 className="mb-4 text-[15px] font-semibold text-white">
            Операционные правила
          </h3>
          <div className="space-y-3 text-[12px] leading-relaxed text-white/45">
            <div className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" />{" "}
              Не принимать пакет с открытыми blocker-замечаниями.
            </div>
            <div className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" />{" "}
              AI-флаг не является решением, только подсказка для проверки.
            </div>
            <div className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" />{" "}
              После принятия пакет получает status ready_for_export и попадает в
              Excel-выгрузку с audit trail.
            </div>
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
