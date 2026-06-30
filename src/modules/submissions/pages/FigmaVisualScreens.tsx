import { useMemo, useState, type KeyboardEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Columns3,
  Folder,
  List,
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
import { ProgressMeter } from "../components/CollectionPrimitives";

type VisualStatus = Submission["status"];

type VisualActionCategory = "all" | "issues" | "review";
type VisualTone = "blue" | "danger" | "green" | "indigo" | "warning";

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
    return "vf-figma-dot-danger";
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
      <span className="vf-figma-status is-danger">
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

function VisualToolbar({
  category,
  categoryCounts,
  onCategory,
  onQuery,
  onViewMode,
  query,
  viewMode,
}: {
  category: VisualActionCategory;
  categoryCounts: Record<VisualActionCategory, number>;
  onCategory: (category: VisualActionCategory) => void;
  onQuery: (query: string) => void;
  onViewMode: (mode: "columns" | "list") => void;
  query: string;
  viewMode: "columns" | "list";
}) {
  const tabs: Array<{ id: VisualActionCategory; label: string }> = [
    { id: "all", label: "Все действия" },
    { id: "issues", label: "Ошибки" },
    { id: "review", label: "На проверке" },
  ];

  function chooseViewMode(mode: "columns" | "list") {
    onViewMode(mode);
    window.requestAnimationFrame(() => {
      document.querySelector(".vf-figma-screen")?.scrollTo({ left: 0 });
    });
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
            <span className="vf-figma-tab-label">{tab.label}</span>
            <span className="vf-figma-tab-badge">{categoryCounts[tab.id]}</span>
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
        <div className="vf-figma-view-toggle" aria-label="Вид списка">
          <button
            className={viewMode === "list" ? "is-active" : ""}
            type="button"
            aria-label="Показать списком"
            aria-pressed={viewMode === "list"}
            title="Список"
            onClick={() => chooseViewMode("list")}
          >
            <List aria-hidden="true" size={16} />
            <span className="vf-figma-view-toggle-label">Список</span>
          </button>
          <button
            className={viewMode === "columns" ? "is-active" : ""}
            type="button"
            aria-label="Показать колонками"
            aria-pressed={viewMode === "columns"}
            title="Колонки"
            onClick={() => chooseViewMode("columns")}
          >
            <Columns3 aria-hidden="true" size={16} />
            <span className="vf-figma-view-toggle-label">Колонки</span>
          </button>
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
    <button
      className="vf-figma-action-row"
      data-submission-id={item.id}
      type="button"
      aria-label={`Открыть подачу: ${item.title}, ${item.id}`}
      onClick={() => onOpen(item.submission, item.tab)}
    >
      <span className={`vf-figma-dot ${statusDot(item.status)}`} aria-hidden="true" />
      <span className="vf-figma-action-title">
        <strong>{item.title}</strong>
        <em>
          <span className="vf-figma-action-id">{item.id}</span>
          <span className="vf-figma-action-updated">Обновлено: {item.updated}</span>
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
        <em>Даты поездки</em>
      </span>
      <span className="vf-figma-action-status">{statusBadge(item)}</span>
      <span
        className="vf-figma-open-button"
        aria-hidden="true"
      >
        {item.cta}
      </span>
    </button>
  );
}

function ColumnCard({
  item,
  onOpen,
}: {
  item: VisualActionRow;
  onOpen: VisualOpenHandler;
}) {
  const tone = visualToneForStatus(item.status);
  const showRail = tone !== "blue";

  return (
    <button
      className="vf-figma-column-card"
      data-submission-id={item.id}
      type="button"
      aria-label={`Открыть подачу: ${item.title}, ${item.id}`}
      onClick={() => onOpen(item.submission, item.tab)}
    >
      {showRail ? <span className={`vf-figma-card-rail is-${tone}`} /> : null}
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
          <span className={`is-${tone}`}>
            {visualToneIcon(tone)}
            {item.blocker}
          </span>
        ) : (
          <>
          <ProgressMeter
            ariaHidden
            className="vf-figma-progress"
            tone={tone === "green" ? "success" : tone === "warning" ? "warning" : "accent"}
            value={item.progress}
          />
            <em>{item.progress}%</em>
          </>
        )}
      </span>
    </button>
  );
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
  const allItems = useMemo(
    () => [...openActions, ...completedActions].map(toVisualActionRow),
    [completedActions, openActions],
  );
  const categoryCounts = useMemo(
    () => ({
      all: allItems.length,
      issues: allItems.filter((item) => visualCategoryMatches(item, "issues")).length,
      review: allItems.filter((item) => visualCategoryMatches(item, "review")).length,
    }),
    [allItems],
  );
  const visibleItems = useMemo(
    () => allItems.filter((item) => visualCategoryMatches(item, category)),
    [allItems, category],
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

  return (
    <section className="vf-figma-screen vf-figma-actions-screen" aria-label="Мои действия">
      <VisualToolbar
        category={category}
        categoryCounts={categoryCounts}
        onCategory={setCategory}
        onQuery={onSearch}
        onViewMode={setViewMode}
        query={query}
        viewMode={viewMode}
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
              <strong>Нет действий</strong>
              <span aria-hidden="true" />
            </div>
            <div className="vf-figma-column-card">
              <strong>По текущим фильтрам ничего не найдено</strong>
              <span className="vf-figma-column-subline">
                Измените поиск или категорию. Данные берутся из реальных подач агента.
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
              <ListRow item={item} key={item.actionId} onOpen={onOpen} />
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
                    {column.items.map((item) => (
                      <ColumnCard item={item} key={item.actionId} onOpen={onOpen} />
                    ))}
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
        <h2>Индивидуальные подачи</h2>
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

function visualToneIcon(tone: VisualTone) {
  if (tone === "green") return <CheckCircle2 aria-hidden="true" size={15} />;
  if (tone === "indigo" || tone === "blue") {
    return <Clock aria-hidden="true" size={15} />;
  }
  return <AlertCircle aria-hidden="true" size={15} />;
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
