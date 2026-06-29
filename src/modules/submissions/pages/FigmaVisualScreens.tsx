import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Folder,
  Search,
  User,
  Users,
} from "lucide-react";
import type {
  AgentActionBadge,
  AgentActionItem,
  AgentActionSeverity,
  AgentActionSummary,
} from "../agentActions";
import { formatSubmissionListTitle } from "../listFormatters";
import { applicantCountLabel, tripDates } from "../selectors";
import { statusLabelFor } from "../status";
import type { City, DrawerTab, Submission } from "../types";

type VisualStatus = Submission["status"];

type VisualActionCategory = "all" | "issues" | "review" | "completed";
type VisualSortMode = "priority" | "updated" | "created" | "trip";

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
  tone?: "danger" | "warning";
};

type VisualMember = {
  initials: string;
  name: string;
  role: string;
  status: "in_progress" | "missing_docs" | "ready";
};

type VisualOpenHandler = (submission: Submission, tab?: DrawerTab) => void;

const emptySummary: AgentActionSummary = {
  completed: 0,
  open: 0,
  overdue: 0,
  today: 0,
  week: 0,
};

function statusDot(status: VisualStatus) {
  if (status === "returned" || status === "requires_action") {
    return "vf-figma-dot-warning";
  }
  if (status === "draft" || status === "in_progress") return "vf-figma-dot-blue";
  if (status === "submitted_for_review" || status === "corrections_received") {
    return "vf-figma-dot-indigo";
  }
  return "vf-figma-dot-green";
}

function statusBadge(item: VisualActionRow) {
  if (item.status === "returned" || item.status === "requires_action") {
    return (
      <span className="vf-figma-status is-warning">
        <AlertCircle aria-hidden="true" size={15} />
        {item.statusLabel}
      </span>
    );
  }

  if (item.status === "draft" || item.status === "in_progress") {
    return (
      <span className="vf-figma-status is-blue">
        <Clock aria-hidden="true" size={15} />
        {item.statusLabel}
      </span>
    );
  }

  if (item.status === "submitted_for_review" || item.status === "corrections_received") {
    return (
      <span className="vf-figma-status is-indigo">
        <Clock aria-hidden="true" size={15} />
        {item.statusLabel}
      </span>
    );
  }

  return (
    <span className="vf-figma-status is-green">
      <CheckCircle2 aria-hidden="true" size={15} />
      {item.statusLabel}
    </span>
  );
}

function memberStatusIcon(status: VisualMember["status"]) {
  if (status === "missing_docs") {
    return <AlertCircle className="vf-figma-member-issue" aria-hidden="true" size={15} />;
  }

  if (status === "in_progress") {
    return <span className="vf-figma-member-progress" aria-hidden="true" />;
  }

  return <CheckCircle2 className="vf-figma-member-ready" aria-hidden="true" size={15} />;
}

function activateKeyboardCard(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function useMobileActionListLayout() {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 760px)").matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setMatches(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return matches;
}

function VisualToolbar({
  category,
  categoryCounts,
  cityFilter,
  cityOptions,
  mobileLockedView,
  onCategory,
  onCityFilter,
  onQuery,
  onSortMode,
  onViewMode,
  query,
  sortMode,
  viewMode,
}: {
  category: VisualActionCategory;
  categoryCounts: Record<VisualActionCategory, number>;
  cityFilter: City | "Все города";
  cityOptions: Array<City | "Все города">;
  mobileLockedView?: boolean;
  onCategory: (category: VisualActionCategory) => void;
  onCityFilter: (city: City | "Все города") => void;
  onQuery: (query: string) => void;
  onSortMode: (mode: VisualSortMode) => void;
  onViewMode: (mode: "columns" | "list") => void;
  query: string;
  sortMode: VisualSortMode;
  viewMode: "columns" | "list";
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const tabs: Array<{ id: VisualActionCategory; label: string }> = [
    { id: "all", label: "Все действия" },
    { id: "issues", label: "Ошибки" },
    { id: "review", label: "На проверке" },
    { id: "completed", label: "Выполненные" },
  ];
  const sortOptions: Array<{ id: VisualSortMode; label: string }> = [
    { id: "priority", label: "Приоритет" },
    { id: "updated", label: "Обновлено" },
    { id: "created", label: "Создано" },
    { id: "trip", label: "Дата поездки" },
  ];

  function chooseViewMode(mode: "columns" | "list") {
    onViewMode(mode);
    setFilterOpen(false);
  }

  function chooseCity(nextCity: City | "Все города") {
    onCityFilter(nextCity);
    setFilterOpen(false);
  }

  function chooseSort(mode: VisualSortMode) {
    onSortMode(mode);
    setFilterOpen(false);
  }

  return (
    <div className="vf-figma-actions-toolbar">
      <div className="vf-figma-tabs" aria-label="Фильтры действий" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={category === tab.id}
            className={category === tab.id ? "is-active" : ""}
            key={tab.id}
            role="tab"
            type="button"
            onClick={() => onCategory(tab.id)}
          >
            {tab.label} <span>{categoryCounts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="vf-figma-tools">
        <div className="vf-figma-search">
          <Search aria-hidden="true" size={20} />
          <input
            aria-label="Поиск по действиям"
            placeholder="Поиск..."
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        <div className="vf-figma-filter-menu">
          <button
            className="vf-figma-icon-button"
            aria-label="Фильтр и вид"
            aria-expanded={filterOpen}
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
          >
            <Filter aria-hidden="true" size={21} />
          </button>
          {filterOpen ? (
            <div className="vf-figma-filter-popover" role="menu" aria-label="Фильтр и вид">
              {!mobileLockedView ? (
                <>
                  <span>Вид</span>
                  <button
                    className={viewMode === "list" ? "is-active" : ""}
                    role="menuitemradio"
                    aria-checked={viewMode === "list"}
                    type="button"
                    onClick={() => chooseViewMode("list")}
                  >
                    Список
                  </button>
                  <button
                    className={viewMode === "columns" ? "is-active" : ""}
                    role="menuitemradio"
                    aria-checked={viewMode === "columns"}
                    type="button"
                    onClick={() => chooseViewMode("columns")}
                  >
                    Колонки
                  </button>
                </>
              ) : null}
              <span>Город</span>
              {cityOptions.map((city) => (
                <button
                  className={cityFilter === city ? "is-active" : ""}
                  key={city}
                  role="menuitemradio"
                  aria-checked={cityFilter === city}
                  type="button"
                  onClick={() => chooseCity(city)}
                >
                  {city}
                </button>
              ))}
              <span>Сортировка</span>
              {sortOptions.map((option) => (
                <button
                  className={sortMode === option.id ? "is-active" : ""}
                  key={option.id}
                  role="menuitemradio"
                  aria-checked={sortMode === option.id}
                  type="button"
                  onClick={() => chooseSort(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ListRow({
  item,
  onOpen,
}: {
  item: VisualActionRow;
  onOpen: VisualOpenHandler;
}) {
  return (
    <div
      className="vf-figma-action-row"
      data-submission-id={item.id}
      role="button"
      tabIndex={0}
      aria-label={`Открыть подачу: ${item.title}, ${item.id}`}
      onClick={() => onOpen(item.submission, item.tab)}
      onKeyDown={(event) => activateKeyboardCard(event, () => onOpen(item.submission, item.tab))}
    >
      <span className="vf-figma-mobile-id">{item.id}</span>
      <span className={`vf-figma-dot ${statusDot(item.status)}`} aria-hidden="true" />
      <span className="vf-figma-action-title">
        <strong>{item.title}</strong>
        <em>
          ID: <span>{item.id}</span> Обновлено: {item.updated}
        </em>
      </span>
      <span className="vf-figma-action-meta">
        <strong>{item.city}</strong>
        <em>
          {item.type === "family" ? <Users aria-hidden="true" size={14} /> : <User aria-hidden="true" size={14} />}
          {applicantCountLabel(item.applicantsCount)}
        </em>
      </span>
      <span className="vf-figma-action-dates">
        <strong>{item.tripDates}</strong>
        <em>{item.context}</em>
      </span>
      <span className="vf-figma-action-status">{statusBadge(item)}</span>
      <span className="vf-figma-mobile-route">
        <strong>{item.city}</strong>
        <em>{item.tripDates}</em>
      </span>
      <span className="vf-figma-mobile-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
      <button
        className="vf-figma-open-button"
        type="button"
        aria-label={`${item.cta}: ${item.title}, ${item.id}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(item.submission, item.tab);
        }}
      >
        {item.cta}
      </button>
    </div>
  );
}

function ColumnCard({
  item,
  onOpen,
}: {
  item: VisualActionRow;
  onOpen: VisualOpenHandler;
}) {
  return (
    <button
      className="vf-figma-column-card"
      data-submission-id={item.id}
      type="button"
      aria-label={`Открыть подачу: ${item.title}, ${item.id}`}
      onClick={() => onOpen(item.submission, item.tab)}
    >
      {item.status === "returned" || item.status === "requires_action" ? (
        <span className="vf-figma-card-rail is-danger" />
      ) : null}
      {item.status === "draft" || item.status === "in_progress" ? (
        <span className="vf-figma-card-rail is-warning" />
      ) : null}
      <span className="vf-figma-column-card-head">
        <span>{item.id}</span>
        <em>
          {item.type === "family" ? <Users aria-hidden="true" size={12} /> : <User aria-hidden="true" size={12} />}
          {item.applicantsCount}
        </em>
      </span>
      <strong>{item.title}</strong>
      <span className="vf-figma-column-subline">
        {item.city} <i aria-hidden="true" /> {item.tripDates}
      </span>
      <span className="vf-figma-column-footer">
        {item.blocker ? (
          <span className={item.severity === "blocker" ? "is-danger" : "is-warning"}>
            <AlertCircle aria-hidden="true" size={15} />
            {item.blocker}
          </span>
        ) : (
          <>
            <span className="vf-figma-progress">
              <span style={{ width: `${item.progress}%` }} />
            </span>
            <em>{item.progress}%</em>
          </>
        )}
      </span>
    </button>
  );
}

export function FigmaActionQueueVisual({
  cityFilter,
  cityOptions,
  completedActions,
  onCityFilter,
  onOpen,
  onSearch,
  openActions,
  query,
  summary = emptySummary,
}: {
  cityFilter: City | "Все города";
  cityOptions: Array<City | "Все города">;
  completedActions: AgentActionItem[];
  onCityFilter: (city: City | "Все города") => void;
  onOpen: VisualOpenHandler;
  onSearch: (query: string) => void;
  openActions: AgentActionItem[];
  query: string;
  summary?: AgentActionSummary;
}) {
  const [viewMode, setViewMode] = useState<"columns" | "list">("list");
  const mobileLockedView = useMobileActionListLayout();
  const effectiveViewMode = mobileLockedView ? "list" : viewMode;
  const [category, setCategory] = useState<VisualActionCategory>("all");
  const [sortMode, setSortMode] = useState<VisualSortMode>("priority");
  const allItems = useMemo(
    () => [...openActions, ...completedActions].map(toVisualActionRow),
    [completedActions, openActions],
  );
  const categoryCounts = useMemo(
    () => ({
      all: allItems.length,
      completed: completedActions.length,
      issues: allItems.filter((item) => visualCategoryMatches(item, "issues")).length,
      review: allItems.filter((item) => visualCategoryMatches(item, "review")).length,
    }),
    [allItems, completedActions.length],
  );
  const visibleItems = useMemo(
    () =>
      sortVisualItems(
        allItems.filter((item) => visualCategoryMatches(item, category)),
        sortMode,
      ),
    [allItems, category, sortMode],
  );
  const columns: VisualColumn[] = [
    {
      id: "errors",
      label: "Ошибки",
      matches: (item) => visualCategoryMatches(item, "issues"),
      tone: "danger",
    },
    {
      id: "docs",
      label: "Сбор документов",
      matches: (item) => item.status === "draft" || item.status === "in_progress",
      tone: "warning",
    },
    {
      id: "review",
      label: "На проверке",
      matches: (item) => visualCategoryMatches(item, "review"),
    },
    {
      id: "ready",
      label: "Готово",
      matches: (item) => isReadyVisualStatus(item.status),
    },
  ];
  const groupLabel = visualGroupLabel(category, visibleItems.length, sortMode);

  return (
    <section className="vf-figma-screen vf-figma-actions-screen" aria-label="Мои действия">
      <VisualToolbar
        category={category}
        categoryCounts={categoryCounts}
        cityFilter={cityFilter}
        cityOptions={cityOptions}
        mobileLockedView={mobileLockedView}
        onCategory={setCategory}
        onCityFilter={onCityFilter}
        onQuery={onSearch}
        onSortMode={setSortMode}
        onViewMode={setViewMode}
        query={query}
        sortMode={sortMode}
        viewMode={effectiveViewMode}
      />

      <div
        className={`vf-figma-view-stage is-${effectiveViewMode}`}
        data-agent-action-open-count={summary.open}
        key={effectiveViewMode}
      >
        {visibleItems.length === 0 ? (
          <div className="vf-figma-action-list" role="status">
            <div className="vf-figma-section-rule">
              <span aria-hidden="true" />
              <strong>Нет действий</strong>
              <span aria-hidden="true" />
            </div>
            <div className="vf-figma-column-card">
              <strong>По текущим фильтрам ничего не найдено</strong>
              <span className="vf-figma-column-subline">
                Измените поиск, город или категорию. Данные берутся из реальных подач агента.
              </span>
            </div>
          </div>
        ) : effectiveViewMode === "list" ? (
          <div className="vf-figma-action-list">
            <div className="vf-figma-section-rule">
              <span aria-hidden="true" />
              <strong>{groupLabel}</strong>
              <span aria-hidden="true" />
            </div>
            {visibleItems.map((item) => (
              <ListRow item={item} key={item.actionId} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="vf-figma-column-board">
            {columns.map((column) => {
              const items = visibleItems.filter(column.matches);

              return (
                <section className="vf-figma-column" key={column.id}>
                  <header>
                    <span>
                      {column.tone === "danger" ? <i aria-hidden="true" /> : null}
                      {column.label}
                    </span>
                    <em>{items.length}</em>
                  </header>
                  <div className="vf-figma-column-stack">
                    {items.length ? (
                      items.map((item) => (
                        <ColumnCard item={item} key={item.actionId} onOpen={onOpen} />
                      ))
                    ) : (
                      <div className="vf-figma-column-card" role="status">
                        <strong>Нет подач</strong>
                        <span className="vf-figma-column-subline">
                          Колонка пуста для текущих фильтров.
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function FigmaApplicantsVisual({
  onOpen,
  submissions = [],
}: {
  onOpen?: VisualOpenHandler;
  submissions?: Submission[];
}) {
  const familySubmissions = submissions.filter((submission) => submission.type === "family");
  const individualSubmissions = submissions.filter((submission) => submission.type === "single");

  return (
    <section className="vf-figma-screen vf-figma-applicants-screen" aria-label="Мои подачи">
      <div className="vf-figma-applicants-section">
        <h2>Семейные подачи</h2>
        <div className="vf-figma-family-grid">
          {familySubmissions.length ? (
            familySubmissions.map((submission) => (
              <article
                className="vf-figma-family-card"
                data-submission-id={submission.id}
                key={submission.id}
                role="button"
                tabIndex={0}
                aria-label={`Открыть семейную подачу: ${formatSubmissionListTitle(submission)}, ${submission.id}`}
                onClick={() => onOpen?.(submission)}
                onKeyDown={(event) =>
                  activateKeyboardCard(event, () => onOpen?.(submission))
                }
              >
                <span className="vf-figma-family-head">
                  <span className="vf-figma-family-icon">
                    <Users aria-hidden="true" size={26} />
                  </span>
                  <span>
                    <strong>{formatSubmissionListTitle(submission)}</strong>
                    <em>{applicantCountLabel(submission.applicants.length)}</em>
                  </span>
                </span>
                <span className="vf-figma-member-list">
                  {submission.applicants.map((applicant) => {
                    const member = visualMemberForApplicant(submission, applicant);
                    return (
                      <button
                        className="vf-figma-member-row"
                        key={`${submission.id}-${applicant.id}`}
                        type="button"
                        aria-label={`Открыть заявителя: ${member.name}, ${formatSubmissionListTitle(submission)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen?.(submission, "applicants");
                        }}
                      >
                        <em>{member.initials}</em>
                        <strong>{member.name}</strong>
                        <small>{member.role}</small>
                        {memberStatusIcon(member.status)}
                      </button>
                    );
                  })}
                </span>
                <span className="vf-figma-family-footer">
                  <span>Акт: {submission.updatedAt}</span>
                  <em>
                    <Folder aria-hidden="true" size={17} />
                    {submission.files.length} файлов
                  </em>
                </span>
              </article>
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
        <h2>Заявители</h2>
        <div className="vf-figma-individual-grid">
          {individualSubmissions.length ? (
            individualSubmissions.map((submission) => {
              const applicant = submission.applicants[0];
              const member = applicant
                ? visualMemberForApplicant(submission, applicant)
                : null;
              return (
                <button
                  className="vf-figma-individual-card"
                  data-submission-id={submission.id}
                  key={submission.id}
                  type="button"
                  aria-label={`Открыть заявителя: ${member?.name ?? submission.title}, ${submission.id}`}
                  onClick={() => onOpen?.(submission)}
                >
                  <span className="vf-figma-avatar">
                    {member?.initials ?? initialsForName(submission.title)}
                  </span>
                  <span>
                    <strong>{member?.name ?? submission.title}</strong>
                    <em>
                      {member ? memberStatusIcon(member.status) : null}
                      {statusLabelFor(submission.status, "compact")}
                    </em>
                  </span>
                  <span className="vf-figma-family-footer">
                    <span>Акт: {submission.updatedAt}</span>
                    <em>
                      <Folder aria-hidden="true" size={17} />
                      {submission.files.length} файлов
                    </em>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="vf-figma-individual-card" role="status">
              <span>
                <strong>Индивидуальных подач нет</strong>
                <em>По текущему списку нет одиночных заявителей.</em>
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
    id: submission.id,
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
  if (category === "completed") return item.completed;
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

function sortVisualItems(items: VisualActionRow[], sortMode: VisualSortMode) {
  if (sortMode === "priority") return items;

  return [...items].sort((left, right) => {
    if (sortMode === "updated") {
      return compareOperationalDate(right.updated, left.updated);
    }
    if (sortMode === "created") {
      return compareOperationalDate(right.createdAt, left.createdAt);
    }
    return compareOperationalDate(left.tripDateFrom, right.tripDateFrom);
  });
}

function compareOperationalDate(left: string, right: string) {
  return operationalDateScore(left) - operationalDateScore(right);
}

function operationalDateScore(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized === "сейчас") return Number.MAX_SAFE_INTEGER;

  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return parsed;

  const match = normalized.match(/^(\d{1,2})\.(\d{1,2})/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    return month * 100 + day;
  }

  return normalized.charCodeAt(0) || 0;
}

function visualGroupLabel(
  category: VisualActionCategory,
  count: number,
  sortMode: VisualSortMode,
) {
  const sorted =
    sortMode === "priority"
      ? "приоритет"
      : sortMode === "updated"
        ? "обновление"
        : sortMode === "created"
          ? "создание"
          : "дата поездки";
  if (category === "issues") return `Ошибки · ${count} · ${sorted}`;
  if (category === "review") return `На проверке · ${count} · ${sorted}`;
  if (category === "completed") return `Выполненные · ${count} · ${sorted}`;
  return `Все действия · ${count} · ${sorted}`;
}

function visualMemberForApplicant(
  submission: Submission,
  applicant: Submission["applicants"][number],
): VisualMember {
  return {
    initials: initialsForName(applicant.fullName),
    name: applicant.fullName,
    role: applicantRoleLabel(applicant.role ?? "main"),
    status: memberStatus(submission, applicant.id, applicant.questionnaireStatus),
  };
}

function memberStatus(
  submission: Submission,
  applicantId: string,
  questionnaireStatus: Submission["applicants"][number]["questionnaireStatus"],
): VisualMember["status"] {
  const files = submission.files.filter((file) => file.applicantId === applicantId);
  if (
    questionnaireStatus === "needs_fix" ||
    files.some((file) => file.status === "missing" || file.status === "needs_replacement")
  ) {
    return "missing_docs";
  }
  if (
    questionnaireStatus === "empty" ||
    questionnaireStatus === "partial" ||
    files.some((file) => file.status === "uploaded" || file.status === "pending_review")
  ) {
    return "in_progress";
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
