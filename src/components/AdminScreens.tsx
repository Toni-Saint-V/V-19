import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpDown,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck2,
  Flame,
  MessageSquareWarning,
  RotateCcw,
  ShieldCheck,
  Shapes,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import {
  AdminContextToggle,
  AdminListHeader,
  AdminQueueToolbar,
  AdminToolbarSelect,
} from "./AdminSurfaceCommon";
import {
  V19MetricCard,
  V19MetricStrip,
  V19PriorityHero,
} from "../shared/ui/v19-design-system";
import {
  buildAdminTriageRadar,
  type AdminTriageRadarItem,
} from "../modules/submissions/adminTriageRadar";
import { agentOwnerDisplayName } from "../modules/submissions/ownership";
import {
  cityFilterValuesForSubmissions,
  questionnaireCityForSubmission,
} from "../modules/submissions/selectors";
import { getPrimaryAction } from "../modules/submissions/status";
import { submissionPublicId } from "../modules/submissions/submissionIdentity";
import type { Submission } from "../modules/submissions/types";
import { isAdminReviewQueueSubmission } from "../modules/submissions/uiTypes";

interface AdminScreenProps {
  onOpenDrawer: (id: string) => void;
  onOpenExport?: () => void;
  submissions?: Submission[];
}

type Lane = "urgent" | "review" | "returned";
type AdminReviewSort = "tripDate" | "createdAt";
type AdminReviewTypeFilter = "all" | "family" | "single";

interface ReviewCard {
  id: string;
  publicId: string;
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
  fixedIssues: number;
  warnings: number;
  aiFlags: number;
  nextAction: string;
  lastEvent: string;
  createdAtIso: string;
  tripDateIso: string;
}

function openIssues(submission: Submission) {
  return submission.issues.filter((issue) => issue.status === "open");
}

function unresolvedBlockerCount(submission: Submission) {
  return openIssues(submission).filter((issue) => issue.severity === "blocker").length;
}

function unresolvedWarningCount(submission: Submission) {
  const issueWarnings = openIssues(submission).filter(
    (issue) => issue.severity !== "blocker",
  ).length;
  const readinessWarnings = [
    submission.completeness.questionnaire,
    submission.completeness.files,
  ].filter((value) => value < 100).length;
  return issueWarnings + readinessWarnings;
}

function reviewLaneForSubmission(submission: Submission): Lane {
  if (submission.status === "corrections_received") return "returned";
  if (unresolvedBlockerCount(submission) > 0) return "urgent";
  if (submission.status === "returned") return "returned";
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
  const updatedIso = dateIsoFromLabel(submission.updatedAt, new Date(0).toISOString());
  const tripIso = dateIsoFromLabel(submission.tripDateFrom, updatedIso);
  const aiFlags = (submission.aiSuggestions ?? []).filter(
    (suggestion) => suggestion.status === "suggested",
  ).length;

  return {
    id: submission.id,
    publicId: submissionPublicId(submission),
    title: submission.listTitle ?? submission.title,
    type: submission.type,
    applicants: submission.applicants.length,
    country: submission.country,
    city: questionnaireCityForSubmission(submission),
    lane: reviewLaneForSubmission(submission),
    agent: agentOwnerDisplayName(
      submission.agentId,
      submission.agentDisplayName || "Агент VisaFlow",
    ),
    timeInQueue: submission.updatedAt,
    questionnaire: submission.completeness.questionnaire,
    files: submission.completeness.files,
    blockers,
    fixedIssues: submission.issues.filter((issue) => issue.status === "fixed_by_agent")
      .length,
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
  return submissions.filter(isAdminReviewQueueSubmission).map(reviewCardFromSubmission);
}

const lanes: Array<{
  id: Lane;
  title: string;
  subtitle: string;
  tone: "red" | "blue";
  icon: React.ElementType;
}> = [
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
    tone: "blue",
    icon: ShieldCheck,
  },
  {
    id: "returned",
    title: "Исправления",
    subtitle: "ответ агента",
    tone: "blue",
    icon: MessageSquareWarning,
  },
];

function toneClasses(tone: "red" | "blue") {
  if (tone === "red") {
    return "border-[#5b2b32]/45 bg-[#24191b]/60 text-[#d59aa3]";
  }

  return "border-[#393c7f] bg-[#23264f] text-[#b5caf2]";
}

function reviewCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "заявок";
  if (lastDigit === 1) return "заявка";
  if (lastDigit >= 2 && lastDigit <= 4) return "заявки";
  return "заявок";
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10.5px] text-white/40">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
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
      type="button"
      aria-label={`Ручная проверка заявки ${item.title}`}
      data-submission-card=""
      data-submission-id={item.id}
      onClick={() => onOpenDrawer(item.id)}
      className={`v19-admin-review-card group w-full rounded-[10px] border p-4 text-left font-medium transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.22)] ${
        hasBlocker ? "has-blocker " : ""
      }${
        hasBlocker
          ? "border-[#5b2b32]/45 bg-[#1d1719]/80 hover:border-[#74414a]/55"
          : "border-[#393c7f]/70 bg-[#17192b] hover:border-[#5960a7]"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10.5px] font-medium tracking-wide text-white/40">
            <span className="v19-admin-review-card-id shrink-0 font-mono text-white/60">
              {item.publicId}
            </span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="shrink-0">{item.city}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="shrink-0">{shortQueueTime}</span>
          </div>
          <h3 className="truncate text-[15px] font-semibold text-white group-hover:text-[#b8baff]">
            {item.title}
          </h3>
          <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-[11.5px] font-medium text-white/45">
            {item.type === "family" ? (
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="shrink-0">{item.applicants} чел.</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{item.agent}</span>
          </div>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="mt-1 h-4 w-4 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/55"
        />
      </div>

      <div className="mb-3 rounded-[8px] border border-white/5 bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-white/75">
          {item.aiFlags > 0 ? (
            <Sparkles className="h-3.5 w-3.5 text-[#b8baff]" aria-hidden="true" />
          ) : (
            <FileCheck2 className="h-3.5 w-3.5 text-[#b8baff]" aria-hidden="true" />
          )}
          Следующее действие
        </div>
        <p className="text-[12px] leading-relaxed text-white/50">{item.nextAction}</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <ProgressLine label="Анкета" value={item.questionnaire} />
        <ProgressLine label="Файлы" value={item.files} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.blockers > 0 ? (
          <span className="rounded-full border border-[#5b2b32]/45 bg-[#24191b]/60 px-2 py-1 text-[10.5px] font-medium text-[#d59aa3]">
            {item.blockers} критичных
          </span>
        ) : null}
        {item.fixedIssues > 0 ? (
          <span className="rounded-full border border-[#393c7f] bg-[#23264f] px-2 py-1 text-[10.5px] font-medium text-[#b5caf2]">
            {item.fixedIssues} исправлено
          </span>
        ) : null}
        {item.warnings > 0 ? (
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10.5px] font-medium text-white/62">
            {item.warnings} проверить
          </span>
        ) : null}
        {item.aiFlags > 0 ? (
          <span className="rounded-full border border-[#393c7f] bg-[#23264f] px-2 py-1 text-[10.5px] font-medium text-[#b5caf2]">
            ИИ {item.aiFlags}
          </span>
        ) : null}
        {item.blockers === 0 && item.fixedIssues === 0 && item.warnings === 0 ? (
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10.5px] font-medium text-[#b5caf2]">
            без замечаний
          </span>
        ) : null}
      </div>

      <div className="mt-3 border-t border-white/5 pt-3 text-[11px] text-white/35">
        {item.lastEvent}
      </div>
    </button>
  );
}

type ReviewAiWatchItem =
  | {
      agent?: string;
      id: string;
      publicId: string;
      reason: string;
      title: string;
      tone: AdminTriageRadarItem["band"];
      score?: number;
    }
  | {
      agent: string;
      id: string;
      publicId: string;
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
  return "border-[var(--v19b-color-primary-soft-30)] bg-[var(--v19b-color-primary-soft-10)]";
}

function buildReviewAiWatchlist(submissions: Submission[]): ReviewAiWatchItem[] {
  if (submissions.length === 0) return [];
  const submissionsById = new Map(
    submissions.map((submission) => [submission.id, submission]),
  );
  const radarItems = buildAdminTriageRadar(submissions).items;
  const signalItems = radarItems.filter(
    (item) => item.band === "critical" || item.band === "attention",
  );
  const visibleItems = signalItems.length ? signalItems : radarItems;

  return visibleItems.slice(0, 3).map((item) => ({
    id: item.submissionId,
    publicId: submissionPublicId(
      submissionsById.get(item.submissionId) ?? {
        id: item.submissionId,
      },
    ),
    reason: item.reasons[0] ?? item.nextAction,
    score: item.score,
    title: item.title,
    tone: item.band,
  }));
}

export function ReviewScreen({
  onOpenDrawer,
  onOpenExport,
  submissions,
}: AdminScreenProps) {
  const [activeLane, setActiveLane] = useState<Lane | "all">("all");
  const [cityFilter, setCityFilter] = useState("Все города");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<AdminReviewSort>("tripDate");
  const [typeFilter, setTypeFilter] = useState<AdminReviewTypeFilter>("all");
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const reviewSubmissions = useMemo(
    () => (submissions ?? []).filter(isAdminReviewQueueSubmission),
    [submissions],
  );
  const reviewSource = useMemo(
    () => reviewCardsFromSubmissions(reviewSubmissions),
    [reviewSubmissions],
  );
  const cityOptions = useMemo(
    () => cityFilterValuesForSubmissions(reviewSubmissions),
    [reviewSubmissions],
  );
  const searchNeedle = searchQuery.trim().toLowerCase();
  const filteredReviews = reviewSource
    .filter((item) => {
      const cityMatches = cityFilter === "Все города" || item.city === cityFilter;
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
  const totalBlockers = filteredReviews.reduce((sum, item) => sum + item.blockers, 0);
  const packagesWithBlockers = filteredReviews.filter(
    (item) => item.blockers > 0,
  ).length;
  const laneCounts = {
    review: filteredReviews.filter((item) => item.lane === "review").length,
    returned: filteredReviews.filter((item) => item.lane === "returned").length,
  };
  const exportQueueCount = (submissions ?? []).filter(
    (submission) => submission.status === "ready_for_export",
  ).length;
  const hasActiveFilters =
    activeLane !== "all" ||
    cityFilter !== "Все города" ||
    searchQuery.length > 0 ||
    sortBy !== "tripDate" ||
    typeFilter !== "all";
  const aiWatchlist = useMemo(
    () => buildReviewAiWatchlist(reviewSubmissions),
    [reviewSubmissions],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="v19-admin-screen v19-admin-review-screen"
    >
      <section className="v19-admin-review-main min-w-0 space-y-5">
        <V19PriorityHero
          actionAriaLabel={`Открыть критические пакеты: ${totalBlockers} требуют решения`}
          actionCount={totalBlockers}
          hasBlockers={totalBlockers > 0}
          title={
            totalBlockers
              ? `${totalBlockers} ${totalBlockers === 1 ? "критичное замечание требует" : "критичных замечания требуют"} решения`
              : "Очередь готова к проверке"
          }
          onAction={() => setActiveLane("urgent")}
        />

        <V19MetricStrip>
          <V19MetricCard
            active={activeLane === "review"}
            detail={reviewCountLabel(laneCounts.review)}
            icon={ShieldCheck}
            label="Ревью"
            value={`${laneCounts.review}`}
            tone="orange"
            onClick={() =>
              setActiveLane((current) => (current === "review" ? "all" : "review"))
            }
          />
          <V19MetricCard
            active={activeLane === "returned"}
            detail={reviewCountLabel(laneCounts.returned)}
            icon={MessageSquareWarning}
            label="Правки"
            value={`${laneCounts.returned}`}
            tone="blue"
            onClick={() =>
              setActiveLane((current) => (current === "returned" ? "all" : "returned"))
            }
          />
          <V19MetricCard
            active={false}
            detail={reviewCountLabel(exportQueueCount)}
            icon={CheckCircle2}
            label="Готово"
            value={`${exportQueueCount}`}
            tone="green"
            onClick={onOpenExport}
          />
        </V19MetricStrip>

        <AdminContextToggle
          badge={aiWatchlist.length}
          className="v19-admin-review-context-toggle"
          detail="AI, SLA и правила"
          expanded={mobileContextOpen}
          icon={Bot}
          onClick={() => setMobileContextOpen(true)}
          title="Контекст проверки"
        />

        <div className="v19-admin-review-board border border-[#242529] bg-[#161617]">
          <AdminListHeader
            actionDisabled={!hasActiveFilters}
            actionLabel="Все"
            className="v19-admin-review-list-head"
            countLabel={`${visibleReviews.length} ${reviewCountLabel(visibleReviews.length)}`}
            onAction={() => {
              setActiveLane("all");
              setCityFilter("Все города");
              setSearchQuery("");
              setSortBy("tripDate");
              setTypeFilter("all");
            }}
            title="Очередь проверки"
          />
          <AdminQueueToolbar
            actionDisabled={!hasActiveFilters}
            actionIcon={RotateCcw}
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            filterLabel="Сбросить фильтры"
            controls={
              <>
                <AdminToolbarSelect<AdminReviewSort>
                  icon={ArrowUpDown}
                  label="Сортировка"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: "tripDate", label: "По дате вылета" },
                    { value: "createdAt", label: "По дате создания" },
                  ]}
                />
                <AdminToolbarSelect<AdminReviewTypeFilter>
                  icon={Shapes}
                  label="Тип"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={[
                    { value: "all", label: "Все типы" },
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
            searchPlaceholder="ID, семья или агент"
            searchValue={searchQuery}
          />

          <div className="v19-admin-review-lanes grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            {lanes.map((lane) => {
              const Icon = lane.icon;
              const laneItems = visibleReviews.filter((item) => item.lane === lane.id);

              if (activeLane !== "all" && activeLane !== lane.id) {
                return null;
              }

              return (
                <section
                  className="v19-admin-review-lane min-h-0 rounded-[10px] border border-[#242529] bg-[#141416] p-3 lg:min-h-[360px]"
                  data-active={activeLane === lane.id ? "true" : undefined}
                  data-empty={laneItems.length === 0 ? "true" : undefined}
                  data-lane={lane.id}
                  key={lane.id}
                >
                  <header className="v19-admin-review-lane-header mb-3 flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-[8px] border ${toneClasses(lane.tone)}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span>
                        <strong className="block text-[13px] font-semibold text-white">
                          {lane.title}
                        </strong>
                        <small className="block text-[10.5px] text-white/35">
                          {lane.subtitle}
                        </small>
                      </span>
                    </div>
                    <span className="rounded-[8px] bg-white/5 px-2 py-1 text-[11px] font-medium text-white/45">
                      {laneItems.length}
                    </span>
                  </header>

                  <div className="space-y-3">
                    {laneItems.length ? (
                      laneItems.map((item) => (
                        <ReviewQueueCard
                          item={item}
                          key={item.id}
                          onOpenDrawer={onOpenDrawer}
                        />
                      ))
                    ) : (
                      <div className="v19-admin-review-lane-empty rounded-[10px] border border-dashed border-white/10 p-5 text-center text-[12px] text-white/30">
                        Пусто
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <aside
        aria-label="Контекст проверки"
        className={`v19-admin-review-rail flex min-h-0 flex-col gap-5 ${mobileContextOpen ? "is-mobile-open" : ""}`}
      >
        <div className="v19-admin-review-sheet-header">
          <div>
            <strong>Контекст проверки</strong>
            <small>AI-подсказки, SLA и правила</small>
          </div>
          <button
            aria-label="Закрыть контекст проверки"
            type="button"
            onClick={() => setMobileContextOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--v19b-color-primary-text)]" />
            <h3 className="text-[15px] font-semibold text-white">Тихая AI-помощь</h3>
          </div>
          <div className="space-y-2.5">
            {aiWatchlist.length ? (
              aiWatchlist.map((item) => (
                <button
                  className={`w-full rounded-[10px] border p-3 text-left transition-colors hover:border-[var(--v19b-color-primary)] ${watchToneClass(item.tone)}`}
                  data-submission-card=""
                  data-submission-id={item.id}
                  key={item.id}
                  type="button"
                  onClick={() => onOpenDrawer(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 whitespace-normal text-[12px] font-semibold text-white">
                      {item.publicId} · {item.title}
                    </span>
                    {typeof item.score === "number" ? (
                      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--v19b-color-text-muted)]">
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
            <h3 className="text-[15px] font-semibold text-white">Очередь сейчас</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-[var(--v19b-color-text-muted)]">
                Пакетов
              </span>
              <span className="text-[13px] font-semibold text-white">
                {filteredReviews.length}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-[var(--v19b-color-text-muted)]">
                С критичными замечаниями
              </span>
              <span className="text-[13px] font-semibold text-white/62">
                {packagesWithBlockers}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-[var(--v19b-color-text-muted)]">
                К выгрузке
              </span>
              <span className="text-[13px] font-semibold text-[var(--v19b-color-primary-text)]">
                {exportQueueCount}
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
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--v19b-color-primary-text)]" />{" "}
              Не принимать пакет с открытыми blocker-замечаниями.
            </div>
            <div className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--v19b-color-primary-text)]" />{" "}
              AI-флаг не является решением, только подсказка для проверки.
            </div>
            <div className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--v19b-color-primary-text)]" />{" "}
              После принятия пакет получает status ready_for_export и попадает в
              Excel-выгрузку с audit trail.
            </div>
          </div>
        </div>
      </aside>
      {mobileContextOpen ? (
        <button
          aria-label="Закрыть контекст проверки"
          className="v19-admin-review-sheet-backdrop"
          type="button"
          onClick={() => setMobileContextOpen(false)}
        />
      ) : null}
    </motion.div>
  );
}
