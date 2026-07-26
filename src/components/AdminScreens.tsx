// src/components/AdminScreens.tsx
import React, { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpDown,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  ListChecks,
  MessageSquareWarning,
  Plane,
  RotateCcw,
  ShieldCheck,
  Shapes,
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
import { V19MetricCard, V19MetricStrip } from "../shared/ui/v19-design-system";
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
import {
  buildAdminReviewQueuePlan,
  type AdminReviewPriorityBand,
  type AdminReviewQueuePlanItem,
} from "../modules/submissions/adminReviewQueuePlan";

interface AdminScreenProps {
  onOpenDrawer: (id: string) => void;
  onOpenExport?: () => void;
  submissions?: Submission[];
}

type Lane = "urgent" | "review" | "returned";
type AdminReviewSort = "priority" | "tripDate" | "createdAt";
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
  tripDateLabel: string;
  daysToTrip: number | null;
  priorityBand: AdminReviewPriorityBand;
  priorityReason: string;
  priorityScore: number;
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

function reviewCardFromSubmission(
  submission: Submission,
  planItem: AdminReviewQueuePlanItem,
): ReviewCard {
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
    tripDateLabel: submission.tripDateFrom,
    daysToTrip: planItem.daysToTrip,
    priorityBand: planItem.band,
    priorityReason: planItem.priorityReason,
    priorityScore: planItem.score,
  };
}

function reviewCardsFromSubmissions(
  submissions: Submission[],
  planItems: AdminReviewQueuePlanItem[],
): ReviewCard[] {
  const planBySubmissionId = new Map(
    planItems.map((item) => [item.submissionId, item]),
  );

  return submissions.filter(isAdminReviewQueueSubmission).flatMap((submission) => {
    const planItem = planBySubmissionId.get(submission.id);
    return planItem ? [reviewCardFromSubmission(submission, planItem)] : [];
  });
}

const priorityBandOrder = {
  critical: 0,
  attention: 1,
  standard: 2,
} satisfies Record<AdminReviewPriorityBand, number>;

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
    <div className="v19-review-progress">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <span aria-hidden="true" className="v19-review-progress-track">
        <span style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

function priorityBandLabel(band: AdminReviewPriorityBand) {
  if (band === "critical") return "Критично";
  if (band === "attention") return "Внимание";
  return "Планово";
}

function tripTimingLabel(item: ReviewCard) {
  if (item.daysToTrip === null) return `Вылет ${item.tripDateLabel}`;
  if (item.daysToTrip < 0) return "Дата поездки прошла";
  if (item.daysToTrip === 0) return "Вылет сегодня";
  if (item.daysToTrip === 1) return "1 день до вылета";
  if (item.daysToTrip <= 30) return `${item.daysToTrip} дней до вылета`;
  return `Вылет ${item.tripDateLabel}`;
}

function ReviewQueueCard({
  item,
  onOpenDrawer,
  rank,
}: {
  item: ReviewCard;
  onOpenDrawer: (id: string) => void;
  rank: number;
}) {
  const hasBlocker = item.blockers > 0;
  const shortQueueTime = item.timeInQueue.replace(/\s+\d+\s+мин$/, "");

  return (
    <div className="v19-review-queue-entry" role="listitem">
      <button
        type="button"
        aria-label={`Ручная проверка заявки ${item.title}`}
        data-priority-band={item.priorityBand}
        data-submission-card=""
        data-submission-id={item.id}
        onClick={() => onOpenDrawer(item.id)}
        className={`v19-admin-review-card v19-review-queue-row group ${
          hasBlocker ? "has-blocker" : ""
        }`}
      >
        <span className="v19-review-row-rank" aria-label={`Позиция ${rank}`}>
          {String(rank).padStart(2, "0")}
        </span>

        <span className="v19-review-row-identity">
          <span className="v19-review-row-overline">
            <span className="v19-admin-review-card-id">{item.publicId}</span>
            <span aria-hidden="true">·</span>
            <span>{item.city}</span>
            <span aria-hidden="true">·</span>
            <span>{shortQueueTime}</span>
          </span>
          <strong>{item.title}</strong>
          <small>
            {item.type === "family" ? (
              <Users aria-hidden="true" />
            ) : (
              <User aria-hidden="true" />
            )}
            {item.applicants} чел. · {item.agent}
          </small>
          <em>{item.lastEvent}</em>
        </span>

        <span className="v19-review-row-priority">
          <span className={`v19-review-priority-badge is-${item.priorityBand}`}>
            {priorityBandLabel(item.priorityBand)}
            <strong>{item.priorityScore}</strong>
          </span>
          <strong>{item.priorityReason}</strong>
          <small>{item.nextAction}</small>
        </span>

        <span className="v19-review-row-readiness">
          <ProgressLine label="Анкета" value={item.questionnaire} />
          <ProgressLine label="Файлы" value={item.files} />
        </span>

        <span className="v19-review-row-signals">
          <span className="v19-review-trip-label">
            <Plane aria-hidden="true" />
            {tripTimingLabel(item)}
          </span>
          <span className="v19-review-signal-chips">
            {item.blockers > 0 ? (
              <span className="is-critical">{item.blockers} блокер</span>
            ) : null}
            {item.fixedIssues > 0 ? (
              <span className="is-attention">{item.fixedIssues} исправлено</span>
            ) : null}
            {item.warnings > 0 ? <span>{item.warnings} проверить</span> : null}
            {item.aiFlags > 0 ? <span>AI {item.aiFlags}</span> : null}
            {item.blockers === 0 &&
            item.fixedIssues === 0 &&
            item.warnings === 0 &&
            item.aiFlags === 0 ? (
              <span className="is-clear">без замечаний</span>
            ) : null}
          </span>
        </span>

        <span className="v19-review-row-open">
          Открыть
          <ArrowUpRight aria-hidden="true" />
        </span>
      </button>
    </div>
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
  const [sortBy, setSortBy] = useState<AdminReviewSort>("priority");
  const [typeFilter, setTypeFilter] = useState<AdminReviewTypeFilter>("all");
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const reviewSubmissions = useMemo(
    () => (submissions ?? []).filter(isAdminReviewQueueSubmission),
    [submissions],
  );
  const reviewPlan = useMemo(
    () => buildAdminReviewQueuePlan(reviewSubmissions),
    [reviewSubmissions],
  );
  const reviewSource = useMemo(
    () => reviewCardsFromSubmissions(reviewSubmissions, reviewPlan.items),
    [reviewPlan.items, reviewSubmissions],
  );
  const cityOptions = useMemo(
    () => cityFilterValuesForSubmissions(reviewSubmissions),
    [reviewSubmissions],
  );
  const filteredReviews = useMemo(() => {
    const searchNeedle = searchQuery.trim().toLowerCase();

    return reviewSource
      .filter((item) => {
        const cityMatches = cityFilter === "Все города" || item.city === cityFilter;
        const typeMatches = typeFilter === "all" || item.type === typeFilter;
        const searchMatches =
          !searchNeedle ||
          [item.id, item.publicId, item.title, item.agent, item.city]
            .join(" ")
            .toLowerCase()
            .includes(searchNeedle);
        return cityMatches && typeMatches && searchMatches;
      })
      .sort((left, right) => {
        if (sortBy === "priority") {
          return (
            priorityBandOrder[left.priorityBand] -
              priorityBandOrder[right.priorityBand] ||
            right.priorityScore - left.priorityScore ||
            Date.parse(left.tripDateIso) - Date.parse(right.tripDateIso) ||
            left.id.localeCompare(right.id)
          );
        }
        if (sortBy === "createdAt") {
          return Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso);
        }
        return Date.parse(left.tripDateIso) - Date.parse(right.tripDateIso);
      });
  }, [cityFilter, reviewSource, searchQuery, sortBy, typeFilter]);
  const visibleReviews = useMemo(
    () =>
      activeLane === "all"
        ? filteredReviews
        : activeLane === "urgent"
          ? filteredReviews.filter((item) => item.priorityBand === "critical")
          : filteredReviews.filter((item) => item.lane === activeLane),
    [activeLane, filteredReviews],
  );
  const packagesWithBlockers = filteredReviews.filter(
    (item) => item.blockers > 0,
  ).length;
  const fixedIssuesAwaitingClosure = filteredReviews.reduce(
    (sum, item) => sum + item.fixedIssues,
    0,
  );
  const laneCounts = {
    review: filteredReviews.filter((item) => item.lane === "review").length,
    returned: filteredReviews.filter((item) => item.lane === "returned").length,
    urgent: filteredReviews.filter((item) => item.priorityBand === "critical").length,
  };
  const priorityCounts = {
    attention: filteredReviews.filter((item) => item.priorityBand === "attention")
      .length,
    critical: laneCounts.urgent,
    standard: filteredReviews.filter((item) => item.priorityBand === "standard").length,
  };
  const exportQueueCount = (submissions ?? []).filter(
    (submission) => submission.status === "ready_for_export",
  ).length;
  const hasActiveFilters =
    activeLane !== "all" ||
    cityFilter !== "Все города" ||
    searchQuery.length > 0 ||
    sortBy !== "priority" ||
    typeFilter !== "all";
  const aiWatchlist = useMemo(
    () => buildReviewAiWatchlist(reviewSubmissions),
    [reviewSubmissions],
  );

  const resetQueueView = useCallback(() => {
    setActiveLane("all");
    setCityFilter("Все города");
    setSearchQuery("");
    setSortBy("priority");
    setTypeFilter("all");
  }, []);

  const focusTabs: Array<{
    count: number;
    id: Lane | "all";
    label: string;
  }> = [
    { count: filteredReviews.length, id: "all", label: "Вся очередь" },
    { count: laneCounts.urgent, id: "urgent", label: "Критично" },
    { count: laneCounts.review, id: "review", label: "Первичная проверка" },
    { count: laneCounts.returned, id: "returned", label: "Исправления" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="v19-admin-screen v19-admin-review-screen"
    >
      <section className="v19-admin-review-main min-w-0 space-y-5">
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

        <div className="v19-admin-review-board">
          <AdminListHeader
            actionDisabled={!hasActiveFilters}
            actionLabel="Сбросить"
            className="v19-admin-review-list-head"
            countLabel={`${visibleReviews.length} ${reviewCountLabel(visibleReviews.length)}`}
            onAction={resetQueueView}
            title="Очередь проверки"
          />

          <div
            aria-label="Фокус очереди"
            className="v19-review-focus-tabs"
            role="tablist"
          >
            {focusTabs.map((tab) => (
              <button
                aria-selected={activeLane === tab.id}
                className={activeLane === tab.id ? "is-active" : ""}
                key={tab.id}
                role="tab"
                type="button"
                onClick={() => setActiveLane(tab.id)}
              >
                <span>{tab.label}</span>
                <strong>{tab.count}</strong>
              </button>
            ))}
          </div>

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
                    { value: "priority", label: "По приоритету" },
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
            onFilterClick={resetQueueView}
            onSearchChange={setSearchQuery}
            searchPlaceholder="ID, семья или агент"
            searchValue={searchQuery}
          />

          <div
            aria-label="Приоритетная очередь проверки"
            className="v19-review-queue-list"
            role="list"
          >
            {visibleReviews.length ? (
              visibleReviews.map((item, index) => (
                <ReviewQueueCard
                  item={item}
                  key={item.id}
                  onOpenDrawer={onOpenDrawer}
                  rank={index + 1}
                />
              ))
            ) : (
              <div className="v19-review-queue-empty">
                <ListChecks aria-hidden="true" />
                <strong>
                  {reviewSource.length === 0 ? "Очередь пуста" : "Ничего не найдено"}
                </strong>
                <p>
                  {reviewSource.length === 0
                    ? "Подачи появятся здесь после отправки агентом на первичную или повторную проверку."
                    : "Измените фокус очереди или сбросьте фильтры, чтобы вернуться к полному списку."}
                </p>
                {reviewSource.length > 0 && hasActiveFilters ? (
                  <button type="button" onClick={resetQueueView}>
                    Показать всю очередь
                  </button>
                ) : null}
              </div>
            )}
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

        <div className="v19-review-rail-card">
          <div className="v19-review-rail-title">
            <Bot aria-hidden="true" />
            <div>
              <h3>Тихая AI-помощь</h3>
              <small>Только сигналы для ручной сверки</small>
            </div>
          </div>
          <div className="v19-review-watchlist">
            {aiWatchlist.length ? (
              aiWatchlist.map((item) => (
                <button
                  className={`v19-review-watch-item ${watchToneClass(item.tone)}`}
                  data-submission-card=""
                  data-submission-id={item.id}
                  key={item.id}
                  type="button"
                  onClick={() => onOpenDrawer(item.id)}
                >
                  <span>
                    <strong>
                      {item.publicId} · {item.title}
                    </strong>
                    {typeof item.score === "number" ? <em>{item.score}</em> : null}
                  </span>
                  <p>{item.reason}</p>
                  {"agent" in item && item.agent ? <small>{item.agent}</small> : null}
                </button>
              ))
            ) : (
              <div className="v19-review-rail-empty">
                <strong>Активных AI/OCR-сигналов нет</strong>
                <p>Очередь можно разбирать по правилам и ручным фильтрам.</p>
              </div>
            )}
          </div>
          <div className="v19-review-rail-guardrail">
            Подсказка не принимает решение и не закрывает замечания.
          </div>
        </div>

        <div className="v19-review-rail-card">
          <div className="v19-review-rail-title">
            <Clock aria-hidden="true" />
            <div>
              <h3>Очередь сейчас</h3>
              <small>После применённых фильтров</small>
            </div>
          </div>
          <div className="v19-review-rail-stats">
            <span>
              <small>Пакетов</small>
              <strong>{filteredReviews.length}</strong>
            </span>
            <span>
              <small>Критический приоритет</small>
              <strong>{priorityCounts.critical}</strong>
            </span>
            <span>
              <small>Исправлений закрыть</small>
              <strong>{fixedIssuesAwaitingClosure}</strong>
            </span>
            <span>
              <small>С блокерами</small>
              <strong>{packagesWithBlockers}</strong>
            </span>
            <span className="is-ready">
              <small>К выгрузке</small>
              <strong>{exportQueueCount}</strong>
            </span>
          </div>
        </div>

        <div className="v19-review-rail-card">
          <div className="v19-review-rail-title">
            <ShieldCheck aria-hidden="true" />
            <div>
              <h3>Правила решения</h3>
              <small>Fail-closed контроль</small>
            </div>
          </div>
          <div className="v19-review-rules">
            <p>
              <CheckCircle2 aria-hidden="true" />
              Не принимать пакет с открытыми blocker-замечаниями.
            </p>
            <p>
              <CheckCircle2 aria-hidden="true" />
              AI-флаг остаётся подсказкой и не меняет статус автоматически.
            </p>
            <p>
              <CheckCircle2 aria-hidden="true" />
              После принятия пакет становится готовым к Excel-выгрузке, а действие
              фиксируется в истории.
            </p>
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
