import { useMemo, useState } from "react";
import {
  V19ActionBoardCard,
  V19FamilyProfileCard,
  V19IndividualProfileCard,
  V19LongListCell,
  V19UnifiedToolbar,
  type V19AiTriageSummary,
  type V19MemberStatusTone,
  type V19VisualTone,
} from "../../../shared/ui/v19-design-system";
import type {
  AgentActionBadge,
  AgentActionItem,
  AgentActionSeverity,
  AgentActionSummary,
} from "../agentActions";
import { formatSubmissionListTitle } from "../listFormatters";
import { submissionPublicId } from "../submissionIdentity";
import {
  adminTriageRadarItem,
  buildAdminTriageRadar,
  type AdminTriageRadarItem,
} from "../adminTriageRadar";
import {
  AdminTriageRadarPanel,
  type AdminTriageBandFilter,
} from "../components/AdminTriageRadarPanel";
import { applicantCountLabel, tripDates } from "../selectors";
import { statusLabelFor } from "../status";
import { CANONICAL_CITIES } from "../types";
import type { City, DrawerTab, Submission } from "../types";
import type { WorkspaceTarget } from "../workspaceModel";

type VisualStatus = Submission["status"];

type VisualActionCategory = "all" | "issues" | "review";
type VisualTone = V19VisualTone;

type VisualActionRow = {
  actionId: string;
  applicantsCount: number;
  badges: AgentActionBadge[];
  blocker?: string;
  city: City;
  completed: boolean;
  context: string;
  createdAt: string;
  cta: string;
  id: string;
  progress: number;
  severity: AgentActionSeverity;
  status: VisualStatus;
  statusLabel: string;
  submission: Submission;
  tab: DrawerTab;
  title: string;
  tripDates: string;
  tripDateFrom: string;
  type: "family" | "single";
  updated: string;
};

type VisualColumn = {
  id: string;
  label: string;
  matches: (item: VisualActionRow) => boolean;
  tone?: VisualTone;
};

type VisualMember = {
  initials: string;
  name: string;
  role: string;
  statusTone: V19MemberStatusTone;
};

type VisualOpenHandler = (
  submission: Submission,
  tab?: DrawerTab,
  target?: WorkspaceTarget,
) => void;

const emptySummary: AgentActionSummary = {
  completed: 0,
  open: 0,
  overdue: 0,
  today: 0,
  week: 0,
};

function visualTriageSummary(
  triage: AdminTriageRadarItem,
): V19AiTriageSummary {
  return {
    bandLabel: visualTriageBandLabel(triage.band),
    identityLabel: visualIdentityStatusLabel(triage.identityStatus),
    nextAction: triage.nextAction,
    score: Math.max(0, triage.score),
    tone: triage.band,
  };
}

function visualTriageBandLabel(band: AdminTriageRadarItem["band"]) {
  if (band === "critical") return "critical";
  if (band === "attention") return "attention";
  if (band === "ready") return "ready";
  if (band === "done") return "done";
  return "waiting";
}

function visualIdentityStatusLabel(
  status: AdminTriageRadarItem["identityStatus"],
) {
  if (status === "blocked") return "Личность: конфликт";
  if (status === "needs_review") return "Личность: сверка";
  return "Личность: чисто";
}

export function FigmaActionQueueVisual({
  completedActions,
  onOpen,
  onSearch,
  openActions,
  query,
  summary = emptySummary,
}: {
  completedActions: AgentActionItem[];
  onOpen: VisualOpenHandler;
  onSearch: (query: string) => void;
  openActions: AgentActionItem[];
  query: string;
  summary?: AgentActionSummary;
}) {
  const [viewMode, setViewMode] = useState<"columns" | "list">("list");
  const [category, setCategory] = useState<VisualActionCategory>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [triageBandFilter, setTriageBandFilter] =
    useState<AdminTriageBandFilter>("all");
  const allItems = useMemo(
    () => [...openActions, ...completedActions].map(toVisualActionRow),
    [completedActions, openActions],
  );
  const cityOptions = useMemo(() => {
    const seen = new Set<City>(CANONICAL_CITIES);
    return allItems.reduce<City[]>((options, item) => {
      if (!seen.has(item.city)) {
        seen.add(item.city);
        options.push(item.city);
      }
      return options;
    }, [...CANONICAL_CITIES]);
  }, [allItems]);
  const categoryCounts = useMemo(
    () => ({
      all: allItems.length,
      issues: allItems.filter((item) => visualCategoryMatches(item, "issues")).length,
      review: allItems.filter((item) => visualCategoryMatches(item, "review")).length,
    }),
    [allItems],
  );
  const triageSource = useMemo(() => {
    const byId = new Map<string, Submission>();
    for (const item of allItems) byId.set(item.submission.id, item.submission);
    return [...byId.values()];
  }, [allItems]);
  const triageRadar = useMemo(
    () => buildAdminTriageRadar(triageSource),
    [triageSource],
  );
  const triageBySubmissionId = useMemo(
    () => new Map(triageRadar.items.map((item) => [item.submissionId, item])),
    [triageRadar],
  );
  const visibleItems = useMemo(
    () =>
      allItems.filter((item) => {
        const triage =
          triageBySubmissionId.get(item.submission.id) ??
          adminTriageRadarItem(item.submission);
        return (
          visualCategoryMatches(item, category) &&
          (cityFilter === "all" || item.city === cityFilter) &&
          (triageBandFilter === "all" || triage.band === triageBandFilter)
        );
      }),
    [allItems, category, cityFilter, triageBandFilter, triageBySubmissionId],
  );
  const columns: VisualColumn[] = [
    {
      id: "docs",
      label: "Сбор документов",
      matches: (item) => item.status === "draft" || item.status === "in_progress",
      tone: "warning",
    },
    {
      id: "errors",
      label: "Ошибки",
      matches: (item) => visualCategoryMatches(item, "issues"),
      tone: "danger",
    },
    {
      id: "review",
      label: "На проверке",
      matches: (item) => visualCategoryMatches(item, "review"),
      tone: "indigo",
    },
    {
      id: "ready",
      label: "Готово к выгрузке",
      matches: (item) => isReadyVisualStatus(item.status),
      tone: "green",
    },
  ];
  const populatedColumns = columns
    .map((column) => ({
      ...column,
      items: visibleItems.filter(column.matches),
    }))
    .filter((column) => column.items.length > 0);
  const readyCount = allItems.filter((item) => isReadyVisualStatus(item.status)).length;

  function triageForItem(item: VisualActionRow): AdminTriageRadarItem {
    return (
      triageBySubmissionId.get(item.submission.id) ??
      adminTriageRadarItem(item.submission)
    );
  }

  function openVisualItem(item: VisualActionRow) {
    const target = triageForItem(item).target;
    onOpen(item.submission, target?.tab ?? item.tab, target);
  }

  return (
    <section className="vf-figma-screen vf-figma-actions-screen" aria-label="Мои действия">
      <V19UnifiedToolbar
        cityFilter={cityFilter}
        cityOptions={cityOptions}
        onCityFilter={setCityFilter}
        onQuery={onSearch}
        onTab={setCategory}
        onViewMode={setViewMode}
        query={query}
        searchLabel="Поиск по действиям"
        tabs={[
          {
            compactLabel: "Все",
            count: categoryCounts.all,
            id: "all",
            label: "Все действия",
          },
          {
            compactLabel: "Ошибки",
            count: categoryCounts.issues,
            id: "issues",
            label: "Ошибки",
          },
          {
            compactLabel: "Проверка",
            count: categoryCounts.review,
            id: "review",
            label: "На проверке",
          },
        ]}
        tabsLabel="Фильтры действий"
        value={category}
        viewMode={viewMode}
      />

      <div className="vf-figma-queue-summary" aria-label="Сводка очереди проверки">
        <div className="vf-figma-queue-summary-card is-primary">
          <span>Всего в работе</span>
          <strong>{categoryCounts.all}</strong>
          <em>активная очередь</em>
        </div>
        <div className="vf-figma-queue-summary-card is-danger">
          <span>Ошибки</span>
          <strong>{categoryCounts.issues}</strong>
          <em>требуют решения</em>
        </div>
        <div className="vf-figma-queue-summary-card is-indigo">
          <span>На проверке</span>
          <strong>{categoryCounts.review}</strong>
          <em>ждут оператора</em>
        </div>
        <div className="vf-figma-queue-summary-card is-green">
          <span>Готово</span>
          <strong>{readyCount}</strong>
          <em>к выгрузке</em>
        </div>
      </div>

      <AdminTriageRadarPanel
        activeBand={triageBandFilter}
        radar={triageRadar}
        onBand={setTriageBandFilter}
      />

      <div
        className={`vf-figma-view-stage is-${viewMode}`}
        data-agent-action-open-count={summary.open}
        key={viewMode}
      >
        {visibleItems.length === 0 ? (
          <div className="vf-figma-action-list" role="status">
            <div className="vf-figma-section-rule">
              <span aria-hidden="true" />
              <strong>Пустой список</strong>
              <span aria-hidden="true" />
            </div>
            <div className="vf-figma-column-card">
              <strong>Нет действий</strong>
              <span className="vf-figma-column-subline">
                По текущим фильтрам ничего не найдено. Измените поиск или категорию.
                Данные берутся из реальных подач агента.
              </span>
            </div>
          </div>
        ) : viewMode === "list" ? (
          <div className="vf-figma-action-list">
            <div className="vf-figma-section-rule">
              <span aria-hidden="true" />
              <strong>Сегодня</strong>
              <span aria-hidden="true" />
            </div>
            {visibleItems.map((item) => (
              <V19LongListCell
                city={item.city}
                cta={item.cta}
                dates={item.tripDates}
                id={item.id}
                key={item.actionId}
                peopleCount={item.applicantsCount}
                peopleLabel={applicantCountLabel(item.applicantsCount)}
                statusLabel={item.statusLabel}
                statusTone={visualToneForStatus(item.status)}
                title={item.title}
                triage={visualTriageSummary(triageForItem(item))}
                type={item.type}
                updated={item.updated}
                onOpen={() => openVisualItem(item)}
              />
            ))}
          </div>
        ) : (
          <div className="vf-figma-column-board">
            {populatedColumns.length ? (
              populatedColumns.map((column) => (
                <section className="vf-figma-column" key={column.id}>
                  <header>
                    <span>
                      {column.tone === "danger" ? <i aria-hidden="true" /> : null}
                      {column.label}
                    </span>
                    <em>{column.items.length}</em>
                  </header>
                  <div className="vf-figma-column-stack">
                    {column.items.map((item) => {
                      const tone = visualToneForStatus(item.status);

                      return (
                        <V19ActionBoardCard
                          blocker={item.blocker}
                          city={item.city}
                          dates={item.tripDates}
                          id={item.id}
                          key={item.actionId}
                          peopleCount={item.applicantsCount}
                          progress={item.progress}
                          title={item.title}
                          tone={tone}
                          type={item.type}
                          onOpen={() => openVisualItem(item)}
                        />
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="vf-figma-column-card vf-figma-board-empty" role="status">
                <strong>По текущим фильтрам здесь нет подач</strong>
                <span className="vf-figma-column-subline">
                  Измените категорию или поиск, чтобы вернуться к списку действий.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function FigmaApplicantsVisual({
  maxVisiblePerGroup,
  onOpen,
  submissions = [],
}: {
  maxVisiblePerGroup?: number;
  onOpen?: VisualOpenHandler;
  submissions?: Submission[];
}) {
  const familySubmissions = submissions
    .filter((submission) => submission.type === "family")
    .slice(0, maxVisiblePerGroup);
  const individualSubmissions = submissions
    .filter((submission) => submission.type === "single")
    .slice(0, maxVisiblePerGroup);

  return (
    <section className="vf-figma-screen vf-figma-applicants-screen" aria-label="Мои подачи">
      <div className="vf-figma-applicants-section">
        <h2>Семейные подачи</h2>
        <div className="vf-figma-family-grid">
          {familySubmissions.length ? (
            familySubmissions.map((submission) => (
              <V19FamilyProfileCard
                ariaLabel={`Открыть семейную подачу: ${formatSubmissionListTitle(submission)}, ${submissionPublicId(submission)}`}
                dataSubmissionId={submission.id}
                footerLabel={`Акт: ${submission.updatedAt}`}
                key={submission.id}
                members={submission.applicants.map((applicant) =>
                  visualMemberForApplicant(submission, applicant),
                )}
                packageLabel={`${submission.files.length} файлов`}
                title={formatSubmissionListTitle(submission)}
                totalLabel={applicantCountLabel(submission.applicants.length)}
                onMemberOpen={() => onOpen?.(submission, "applicants")}
                onOpen={() => onOpen?.(submission)}
              />
            ))
          ) : (
            <div className="vf-figma-family-card" role="status">
              <span className="vf-figma-family-head">
                <span>
                  <strong>Семейных подач нет</strong>
                  <em>Создайте семейный пакет, чтобы он появился здесь.</em>
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="vf-figma-applicants-divider" />

      <div className="vf-figma-applicants-section">
        <h2>Индивидуальные подачи</h2>
        <div className="vf-figma-individual-grid">
          {individualSubmissions.length ? (
            individualSubmissions.map((submission) => {
              const applicant = submission.applicants[0];
              const member = applicant
                ? visualMemberForApplicant(submission, applicant)
                : null;
              return (
                <V19IndividualProfileCard
                  ariaLabel={`Открыть заявителя: ${member?.name ?? submission.title}, ${submissionPublicId(submission)}`}
                  dataSubmissionId={submission.id}
                  footerLabel={`Акт: ${submission.updatedAt}`}
                  initials={member?.initials ?? initialsForName(submission.title)}
                  key={submission.id}
                  packageLabel={`${submission.files.length} файлов`}
                  statusLabel={statusLabelFor(submission.status, "compact")}
                  statusTone={member?.statusTone ?? "progress"}
                  title={member?.name ?? submission.title}
                  onOpen={() => onOpen?.(submission)}
                />
              );
            })
          ) : (
            <div className="vf-figma-individual-card" role="status">
              <span>
                <strong>Индивидуальных подач нет</strong>
                <em>По текущему фильтру ничего не найдено.</em>
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function toVisualActionRow(action: AgentActionItem): VisualActionRow {
  const submission = action.submission;

  return {
    actionId: action.id,
    applicantsCount: submission.applicants.length,
    badges: action.badges,
    blocker: visualActionBlocker(action),
    city: submission.city,
    completed: action.completed,
    context: action.context,
    createdAt: submission.createdAt,
    cta: action.cta,
    id: submissionPublicId(submission),
    progress: submission.completeness.total,
    severity: action.severity,
    status: submission.status,
    statusLabel: statusLabelFor(submission.status, "compact"),
    submission,
    tab: action.tab,
    title: action.title || formatSubmissionListTitle(submission),
    tripDates: tripDates(submission),
    tripDateFrom: submission.tripDateFrom,
    type: submission.type,
    updated: submission.updatedAt,
  };
}

function visualCategoryMatches(item: VisualActionRow, category: VisualActionCategory) {
  if (category === "all") return true;
  if (category === "issues") {
    return (
      !item.completed &&
      (item.status === "returned" ||
        item.status === "requires_action" ||
        item.severity === "blocker")
    );
  }
  return isReviewVisualStatus(item.status);
}

function visualActionBlocker(action: AgentActionItem) {
  if (action.severity !== "blocker" && action.severity !== "warning") return undefined;
  return action.context;
}

function isReviewVisualStatus(status: VisualStatus) {
  return status === "submitted_for_review" || status === "corrections_received";
}

function isReadyVisualStatus(status: VisualStatus) {
  return status === "ready_for_export" || status === "exported";
}

function visualToneForStatus(status: VisualStatus): VisualTone {
  if (status === "returned" || status === "requires_action") return "danger";
  if (status === "draft" || status === "in_progress") return "warning";
  if (isReviewVisualStatus(status)) return "indigo";
  if (isReadyVisualStatus(status)) return "green";
  return "blue";
}

function visualMemberForApplicant(
  submission: Submission,
  applicant: Submission["applicants"][number],
): VisualMember {
  return {
    initials: initialsForName(applicant.fullName),
    name: applicant.fullName,
    role: applicantRoleLabel(applicant.role ?? "main"),
    statusTone: memberStatus(submission, applicant.id, applicant.questionnaireStatus),
  };
}

function memberStatus(
  submission: Submission,
  applicantId: string,
  questionnaireStatus: Submission["applicants"][number]["questionnaireStatus"],
): V19MemberStatusTone {
  const files = submission.files.filter((file) => file.applicantId === applicantId);
  if (
    questionnaireStatus === "needs_fix" ||
    files.some((file) => file.status === "missing" || file.status === "needs_replacement")
  ) {
    return "issue";
  }
  if (
    questionnaireStatus === "empty" ||
    questionnaireStatus === "partial" ||
    files.some((file) => file.status === "uploaded" || file.status === "pending_review")
  ) {
    return "progress";
  }
  return "ready";
}

function applicantRoleLabel(role: string) {
  if (role === "main") return "Основной";
  if (role === "spouse") return "Супруга";
  if (role === "child") return "Ребенок";
  return role;
}

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
