import { useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  Badge,
  Button,
  CardComponent,
} from "../../../shared/ui/primitives";
import type {
  AgentActionItem,
  AgentActionSummary,
  OperationalInboxEvent,
} from "../agentActions";
import type { ExportSummary } from "../exportRules";
import {
  formatSubmissionListStatus,
  formatSubmissionListTitle,
} from "../listFormatters";
import { applicantCountLabel, counts, tripDates } from "../selectors";
import {
  adminIssueGuard,
  blockerCount,
  defaultDrawerTab,
  openIssueCount,
  statusLabels,
  typeLabels,
} from "../status";
import type { DrawerTab, Submission } from "../types";
import {
  matchesReviewTab,
  type AgentTab,
  type ExportTab,
  type ReviewTab,
} from "../uiTypes";
import { EmptyState, SummaryRow } from "../components/Primitives";
import {
  ActionRow,
  CollectionGroupLabel,
  CollectionRow,
  CollectionToolbar,
  ContextPanel,
  SubmissionCollectionRow,
  SvgIcon,
  SummaryFilterTabs,
  ToolbarIconButton,
  ToolbarTools,
} from "../components/CollectionPrimitives";

function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

type ViewTransitionLike = {
  finished: Promise<unknown>;
};

const viewTransitionClass = "vf-vt";

function transitionUiState(update: () => void) {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  const transitionDocument = document as Document & {
    startViewTransition?: (updateCallback: () => void) => ViewTransitionLike;
  };

  if (!transitionDocument.startViewTransition) {
    update();
    return;
  }

  const transitionRoot = document.documentElement;

  try {
    transitionRoot.classList.add(viewTransitionClass);
    const transition = transitionDocument.startViewTransition(() => flushSync(update));

    transition.finished.finally(() => {
      transitionRoot.classList.remove(viewTransitionClass);
    });
  } catch {
    transitionRoot.classList.remove(viewTransitionClass);
    update();
  }
}

type InboxEvent = OperationalInboxEvent;

export function AgentActionsScreen({
  completedActions,
  onOpen,
  openActions,
  searchControl,
  summary,
}: {
  completedActions: AgentActionItem[];
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  openActions: AgentActionItem[];
  searchControl: ReactNode;
  summary: AgentActionSummary;
}) {
  const [activeTab, setActiveTab] = useState<"open" | "completed">("open");
  const [comfortableView, setComfortableView] = useState(true);
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "today" | "week">(
    "all",
  );
  const [panelOpen, setPanelOpen] = useState(true);
  const [sortOldest, setSortOldest] = useState(false);

  const baseActions = activeTab === "open" ? openActions : completedActions;
  const filteredActions =
    activeTab === "open" && dueFilter !== "all"
      ? baseActions.filter((action) => {
          if (dueFilter === "week")
            return action.due === "today" || action.due === "week";
          return action.due === dueFilter;
        })
      : baseActions;
  const orderedActions = sortOldest ? [...filteredActions].reverse() : filteredActions;
  const visibleActions = orderedActions;
  const upcomingDeadlines = openActions
    .filter((action) => action.due !== "completed")
    .slice(0, 3);
  const actionGroupLabel =
    activeTab === "completed"
      ? "Выполненные действия"
      : dueFilter === "overdue"
        ? "Просрочено"
        : dueFilter === "today"
          ? "Сегодня"
          : dueFilter === "week"
            ? "На неделе"
            : "Открытые действия";

  return (
    <div
      className={`v19-screen-grid v19-inbox-screen v19-actions-screen ${
        panelOpen ? "" : "is-panel-closed"
      } ${comfortableView ? "is-comfortable" : "is-compact"}`}
    >
      <CardComponent
        as="section"
        className={
          activeTab === "open"
            ? "v19-collection-panel has-summary-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="agent-actions-title"
      >
        <h2 id="agent-actions-title" className="sr-only">
          Мои действия
        </h2>

        <CollectionToolbar
          ariaLabel="Инструменты действий"
          filterTabs={
            activeTab === "open" ? (
              <SummaryFilterTabs
                ariaLabel="Сроки действий"
                onValueChange={(nextFilter) =>
                  transitionUiState(() =>
                    setDueFilter((value) =>
                      value === nextFilter ? "all" : nextFilter,
                    ),
                  )
                }
                tabs={[
                  {
                    count: summary.overdue,
                    id: "overdue",
                    label: "Просрочено",
                    tone: "danger",
                  },
                  { count: summary.today, id: "today", label: "Сегодня", tone: "amber" },
                  {
                    count: summary.week,
                    id: "week",
                    label: "На неделе",
                    tone: "neutral",
                  },
                ]}
                value={dueFilter === "all" ? null : dueFilter}
              />
            ) : null
          }
          onTabChange={(nextTab) =>
            transitionUiState(() => setActiveTab(nextTab))
          }
          search={searchControl}
          tabs={[
            { count: summary.open, id: "open", label: "Открытые" },
            {
              count: summary.completed || undefined,
              id: "completed",
              label: "Выполненные",
            },
          ]}
          tabsAriaLabel="Состояние действий"
          tools={
            <ToolbarTools>
              <ToolbarIconButton
                label={dueFilter === "all" ? "Фильтр: все действия" : "Фильтр: активен"}
                icon="filter"
                pressed={dueFilter !== "all"}
                onClick={() =>
                  transitionUiState(() =>
                    setDueFilter((value) => (value === "all" ? "overdue" : "all")),
                  )
                }
              />
              <ToolbarIconButton
                label={comfortableView ? "Вид: комфортный" : "Вид: компактный"}
                icon="view"
                pressed={!comfortableView}
                onClick={() =>
                  transitionUiState(() => setComfortableView((value) => !value))
                }
              />
              <ToolbarIconButton
                label={
                  sortOldest ? "Сортировка: поздние ниже" : "Сортировка: важные сверху"
                }
                icon="sort"
                pressed={sortOldest}
                onClick={() =>
                  transitionUiState(() => setSortOldest((value) => !value))
                }
              />
              <ToolbarIconButton
                label={panelOpen ? "Панель: показана" : "Панель: скрыта"}
                icon="panel"
                pressed={panelOpen}
                onClick={() =>
                  transitionUiState(() => setPanelOpen((value) => !value))
                }
              />
            </ToolbarTools>
          }
          value={activeTab}
        />

        {visibleActions.length ? (
          <div className="v19-event-list v19-action-list" aria-label="Список действий">
            <CollectionGroupLabel className="v19-action-group-label">
              {actionGroupLabel}
            </CollectionGroupLabel>
            {visibleActions.map((action) => (
              <ActionRow
                badges={action.badges}
                context={`${action.context}`}
                cta={action.cta}
                key={action.id}
                severity={action.severity}
                title={action.title}
                onOpen={() => onOpen(action.submission, action.tab)}
              />
            ))}
          </div>
        ) : (
          <div className="v19-empty-state" key={`actions-empty-${activeTab}-${dueFilter}`}>
            <h3>Открытых действий нет</h3>
            <p>
              Все текущие шаги выполнены. Новые действия появятся после изменений в
              подачах.
            </p>
            <Button variant="secondary" onClick={() => setActiveTab("open")}>
              Показать открытые
            </Button>
          </div>
        )}
      </CardComponent>

      {panelOpen ? (
        <ContextPanel label="Нагрузка по действиям">
          <p className="kicker">Нагрузка</p>
          <div className="v19-unread-summary">
            <strong>{summary.open}</strong>
            <span>
              {pluralRu(
                summary.open,
                "открытое действие",
                "открытых действия",
                "открытых действий",
              )}
            </span>
          </div>
          <div className="v19-panel-metrics v19-actions-metrics">
            <span>
              <em>{summary.overdue} просрочено</em>
            </span>
            <span>
              <strong>{summary.today} на сегодня</strong>
            </span>
          </div>
          <div className="v19-next-card v19-deadline-list">
            <span>Следующие сроки</span>
            {upcomingDeadlines.map((action) => (
              <p key={action.id}>
                <strong>{action.submission.title}</strong>
                <em>{action.dueLabel}</em>
              </p>
            ))}
          </div>
        </ContextPanel>
      ) : null}
    </div>
  );
}

export function AgentInboxScreen({
  inboxEvents,
  onOpen,
  searchControl,
  submissions,
  summary,
}: {
  inboxEvents?: InboxEvent[];
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  searchControl: ReactNode;
  submissions: Submission[];
  summary: ReturnType<typeof counts>;
}) {
  const [activeTab, setActiveTab] = useState<"unread" | "all">("unread");
  const [actionOnly, setActionOnly] = useState(false);
  const [comfortableView, setComfortableView] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [readEventIds, setReadEventIds] = useState<Set<string>>(() => new Set());
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const events = useMemo(
    () =>
      (inboxEvents ?? buildAgentInboxEvents(submissions)).map((event) => ({
        ...event,
        read: event.read || readEventIds.has(event.id),
      })),
    [inboxEvents, readEventIds, submissions],
  );
  const visibleEvents = useMemo(() => {
    const tabEvents =
      activeTab === "unread"
        ? [
            ...events.filter((event) => !event.read),
            ...events.filter((event) => event.read).slice(0, 1),
          ]
        : events;
    const filteredEvents = actionOnly
      ? tabEvents.filter((event) => event.needsAction)
      : tabEvents;

    return sortOrder === "oldest" ? [...filteredEvents].reverse() : filteredEvents;
  }, [actionOnly, activeTab, events, sortOrder]);
  const unreadCount = events.filter((event) => !event.read).length;
  const unreadActionCount = events.filter(
    (event) => !event.read && event.needsAction,
  ).length;
  const actionEventCount = events.length
    ? unreadActionCount
    : Math.min(summary.requiresAction, unreadCount);
  const informationalEventCount = Math.max(unreadCount - actionEventCount, 0);
  const nextEvent = visibleEvents[0] ?? events[0];
  const panelNextEvent =
    events.find((event) => event.id.includes("reference-video")) ?? nextEvent;
  const eventGroups = [
    {
      events: visibleEvents.filter((event) => !event.time.startsWith("вчера")),
      label: "Сегодня",
    },
    {
      events: visibleEvents.filter((event) => event.time.startsWith("вчера")),
      label: "Ранее",
    },
  ].filter((group) => group.events.length);
  const activeFilterLabels: string[] = [
    actionOnly ? "Требуют действия" : null,
    sortOrder === "oldest" ? "Старые сверху" : null,
    comfortableView ? null : "Компактный вид",
  ].filter((label): label is string => Boolean(label));

  function openEvent(event: InboxEvent) {
    setReadEventIds((current) => new Set(current).add(event.id));
    onOpen(event.submission, event.tab);
  }

  function openPanelNextEvent(event: InboxEvent) {
    setReadEventIds((current) => new Set(current).add(event.id));
    onOpen(event.submission, event.tab);
  }

  return (
    <div
      className={`v19-screen-grid v19-inbox-screen ${
        panelOpen ? "" : "is-panel-closed"
      } ${comfortableView ? "is-comfortable" : "is-compact"}`}
    >
      <CardComponent
        as="section"
        className={
          activeFilterLabels.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="agent-inbox-title"
      >
        <h2 id="agent-inbox-title" className="sr-only">
          Входящие
        </h2>

        <CollectionToolbar
          activeFilters={activeFilterLabels}
          ariaLabel="Инструменты входящих"
          onTabChange={(nextTab) =>
            transitionUiState(() => setActiveTab(nextTab))
          }
          search={searchControl}
          tabs={[
            { count: unreadCount, id: "unread", label: "Непрочитанные" },
            { id: "all", label: "Все" },
          ]}
          tabsAriaLabel="Состояние входящих"
          tools={
            <ToolbarTools>
              <ToolbarIconButton
                label={
                  actionOnly
                    ? "Фильтр: только требующие действия"
                    : "Фильтр: все события"
                }
                icon="filter"
                pressed={actionOnly}
                onClick={() =>
                  transitionUiState(() => setActionOnly((value) => !value))
                }
              />
              <ToolbarIconButton
                label={comfortableView ? "Вид: комфортный" : "Вид: компактный"}
                icon="view"
                pressed={!comfortableView}
                onClick={() =>
                  transitionUiState(() => setComfortableView((value) => !value))
                }
              />
              <ToolbarIconButton
                label={
                  sortOrder === "newest"
                    ? "Сортировка: новые сверху"
                    : "Сортировка: старые сверху"
                }
                icon="sort"
                pressed={sortOrder === "oldest"}
                onClick={() =>
                  transitionUiState(() =>
                    setSortOrder((value) =>
                      value === "newest" ? "oldest" : "newest",
                    ),
                  )
                }
              />
              <ToolbarIconButton
                label={panelOpen ? "Панель: показана" : "Панель: скрыта"}
                icon="panel"
                pressed={panelOpen}
                onClick={() =>
                  transitionUiState(() => setPanelOpen((value) => !value))
                }
              />
            </ToolbarTools>
          }
          value={activeTab}
        />

        {visibleEvents.length ? (
          <div className="v19-event-list" aria-label="Список входящих событий">
            {eventGroups.map((group) => (
              <div className="v19-event-group" key={group.label}>
                <CollectionGroupLabel>{group.label}</CollectionGroupLabel>
                {group.events.map((event) => (
                  <CollectionRow
                    action={event.action}
                    badge={event.badge}
                    icon={<InboxEventIcon icon={event.icon} />}
                    key={event.id}
                    meta={
                      <>
                        {event.context} · {event.time}
                      </>
                    }
                    read={event.read}
                    title={event.title}
                    tone={event.tone}
                    onOpen={() => openEvent(event)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="v19-empty-state" key={`inbox-empty-${activeTab}-${actionOnly}`}>
            <h3>Новых событий нет</h3>
            <p>Здесь появятся изменения, которые требуют вашего внимания.</p>
            <Button variant="secondary" onClick={() => setActiveTab("all")}>
              Показать все
            </Button>
          </div>
        )}
      </CardComponent>

      {panelOpen ? (
        <ContextPanel label="Сводка входящих">
          <p className="kicker">Сводка</p>
          <div className="v19-unread-summary">
            <strong>{unreadCount}</strong>
            <span>
              {pluralRu(
                unreadCount,
                "непрочитанное событие",
                "непрочитанных события",
                "непрочитанных событий",
              )}
            </span>
          </div>
          <div className="v19-panel-metrics">
            <span>
              Требуют действия
              <strong>{actionEventCount}</strong>
            </span>
            <span>
              Информационные
              <strong>{informationalEventCount}</strong>
            </span>
          </div>
          {panelNextEvent ? (
            <div className="v19-next-card">
              <span>Следующее действие</span>
              <strong>{panelNextEvent.title}</strong>
              <p>{panelNextEvent.context}</p>
              <Button
                variant="primary"
                onClick={() => openPanelNextEvent(panelNextEvent)}
              >
                {panelNextEvent.action}
              </Button>
            </div>
          ) : null}
        </ContextPanel>
      ) : null}
    </div>
  );
}

function InboxEventIcon({ icon }: { icon: string }) {
  if (icon === "issue") {
    return (
      <SvgIcon>
        <path d="M12 8v5" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.8h3.4l6.5 11.4-1.7 3H5.5l-1.7-3 6.5-11.4Z" />
      </SvgIcon>
    );
  }

  if (icon === "file") {
    return (
      <SvgIcon>
        <path d="M7 4.5h7l3 3V19.5H7V4.5Z" />
        <path d="M14 4.5v4h4" />
        <path d="M9.5 13h5" />
      </SvgIcon>
    );
  }

  if (icon === "accepted") {
    return (
      <SvgIcon>
        <path d="m5 12 4 4L19 6" />
      </SvgIcon>
    );
  }

  return (
    <SvgIcon>
      <path d="M12 6v6l4 2" />
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
    </SvgIcon>
  );
}

function buildAgentInboxEvents(submissions: Submission[]): InboxEvent[] {
  const fallback = submissions[0];
  if (!fallback) return [];
  const returned =
    submissions.find((submission) =>
      ["returned", "requires_action"].includes(submission.status),
    ) ?? fallback;
  const videoIssue =
    submissions.find((submission) =>
      submission.files.some((file) => file.status === "needs_replacement"),
    ) ?? returned;
  const accepted =
    submissions.find((submission) => submission.status === "ready_for_export") ??
    submissions[2] ??
    returned;
  const draft =
    submissions.find((submission) => submission.status === "draft") ??
    submissions[3] ??
    fallback;

  return [
    {
      action: "Открыть",
      badge: "Возвращено",
      context: "2 блокера",
      icon: "issue",
      id: `agent-inbox-reference-returned-${returned.id}`,
      needsAction: true,
      read: false,
      submission: returned,
      tab: "issues",
      time: "12 мин назад",
      title: "Подачу «Семья Петровых» вернули на исправление",
      tone: "danger",
    },
    {
      action: "Открыть",
      badge: "Видео",
      context: "Пётр Петров",
      icon: "file",
      id: `agent-inbox-reference-video-${videoIssue.id}`,
      needsAction: true,
      read: false,
      submission: videoIssue,
      tab: "files",
      time: "34 мин назад",
      title: "Администратор уточнил замечание по видео",
      tone: "amber",
    },
    {
      action: "Открыть",
      badge: "Принято",
      context: "Готово к выгрузке",
      icon: "accepted",
      id: `agent-inbox-reference-accepted-${accepted.id}`,
      needsAction: false,
      read: false,
      submission: accepted,
      tab: "overview",
      time: "1 ч назад",
      title: "Подача «Анна Смирнова» принята",
      tone: "teal",
    },
    {
      action: "Открыть",
      badge: "Черновик",
      context: "Семья Орловых",
      icon: "status",
      id: `agent-inbox-reference-draft-${draft.id}`,
      needsAction: false,
      read: true,
      submission: draft,
      tab: "overview",
      time: "вчера, 18:42",
      title: "Черновик автоматически сохранён",
      tone: "muted",
    },
  ];
}

export function AgentSubmissionsScreen({
  activeTab,
  agentList,
  cityControl,
  cityFilterLabel = "Все",
  hasSearchQuery = false,
  onClearFilters,
  onCreate,
  onOpen,
  onSelect,
  onTab,
  searchControl,
  visibleSubmission,
  summary,
}: {
  activeTab: AgentTab;
  agentList: Submission[];
  cityControl?: ReactNode;
  cityFilterLabel?: string;
  hasSearchQuery?: boolean;
  onClearFilters?: () => void;
  onCreate: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AgentTab) => void;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
  summary: ReturnType<typeof counts>;
}) {
  const [blockersOnly, setBlockersOnly] = useState(false);
  const [comfortableView, setComfortableView] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sortNewest, setSortNewest] = useState(true);

  const filteredSubmissions = useMemo(
    () =>
      blockersOnly
        ? agentList.filter((submission) => blockerCount(submission) > 0)
        : agentList,
    [agentList, blockersOnly],
  );
  const orderedSubmissions = useMemo(
    () => (sortNewest ? filteredSubmissions : [...filteredSubmissions].reverse()),
    [filteredSubmissions, sortNewest],
  );
  const prioritySubmission = visibleSubmission ?? orderedSubmissions[0] ?? null;
  const tabCounts = {
    action: summary.requiresAction,
    done: summary.ready + summary.exported,
    progress: summary.draft + summary.inProgress,
    review: summary.inReview + summary.corrections,
  };
  const visibleTab: Exclude<AgentTab, "all"> =
    activeTab === "all" ? "action" : activeTab;
  const activeFilterLabels: string[] = [
    hasSearchQuery ? "Поиск" : null,
    cityFilterLabel !== "Все" ? cityFilterLabel : null,
    blockersOnly ? "Только блокеры" : null,
    sortNewest ? null : "Обратный порядок",
    comfortableView ? null : "Компактный вид",
  ].filter((label): label is string => Boolean(label));
  const hasFiltering = activeFilterLabels.length > 0;
  const resetFilters = () => {
    transitionUiState(() => {
      setBlockersOnly(false);
      setSortNewest(true);
      setComfortableView(true);
      onClearFilters?.();
    });
  };
  return (
    <div
      className={`v19-screen-grid v19-inbox-screen v19-submissions-screen ${
        panelOpen ? "" : "is-panel-closed"
      } ${comfortableView ? "is-comfortable" : "is-compact"}`}
    >
      <CardComponent
        as="section"
        className={
          activeFilterLabels.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="agent-title"
      >
        <h2 id="agent-title" className="sr-only">
          Рабочая область подач агента
        </h2>

        <CollectionToolbar
          activeFilters={activeFilterLabels}
          ariaLabel="Инструменты подач"
          cityControl={cityControl}
          onTabChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
          search={searchControl}
          tabs={[
            { count: tabCounts.action, id: "action", label: "Действия" },
            { count: tabCounts.progress, id: "progress", label: "В работе" },
            { count: tabCounts.review, id: "review", label: "Проверка" },
            { count: tabCounts.done, id: "done", label: "Готово" },
          ]}
          tabsAriaLabel="Состояние подач"
          tools={
            <ToolbarTools>
              <ToolbarIconButton
                label={blockersOnly ? "Фильтр: только блокеры" : "Фильтр: все подачи"}
                icon="filter"
                pressed={blockersOnly}
                onClick={() =>
                  transitionUiState(() => setBlockersOnly((value) => !value))
                }
              />
              <ToolbarIconButton
                label={comfortableView ? "Вид: комфортный" : "Вид: компактный"}
                icon="view"
                pressed={!comfortableView}
                onClick={() =>
                  transitionUiState(() => setComfortableView((value) => !value))
                }
              />
              <ToolbarIconButton
                label={sortNewest ? "Сначала приоритетные" : "Обратный порядок"}
                icon="sort"
                pressed={!sortNewest}
                onClick={() =>
                  transitionUiState(() => setSortNewest((value) => !value))
                }
              />
              <ToolbarIconButton
                label={panelOpen ? "Скрыть сводку" : "Показать сводку"}
                icon="panel"
                pressed={panelOpen}
                onClick={() =>
                  transitionUiState(() => setPanelOpen((value) => !value))
                }
              />
            </ToolbarTools>
          }
          value={visibleTab}
        />

        {orderedSubmissions.length ? (
          <>
            <div className="v19-submission-list-head" aria-hidden="true">
              <span>Подача</span>
              <span>Статус</span>
              <span>Файлы</span>
              <span>Готовность</span>
              <span>Действие</span>
            </div>
            <div className="v19-event-list v19-submission-list">
              {orderedSubmissions.map((submission) => (
                <SubmissionCollectionRow
                  action={submissionActionLabel(submission)}
                  completeness={`${submission.completeness.total}%`}
                  extraTagCount={submissionExtraTagCount(submission)}
                  extraTagLabel={submissionExtraTagLabel(submission)}
                  fileState={submissionFileStateLabel(submission)}
                  fileTone={submissionFileStateTone(submission)}
                  key={submission.id}
                  meta={submissionMetaLine(submission)}
                  status={submission.status}
                  statusLabel={formatSubmissionListStatus(submission)}
                  submissionId={submission.id}
                  title={formatSubmissionListTitle(submission)}
                  onOpen={() => {
                    onSelect(submission);
                    onOpen(submission, defaultDrawerTab(submission));
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="v19-empty-state" key={`submissions-empty-${visibleTab}-${activeFilterLabels.join("-")}`}>
            <h3>{hasFiltering ? "Ничего не найдено" : "В этой вкладке нет подач"}</h3>
            <p>
              {hasFiltering
                ? "Измените поиск, город или локальный фильтр, чтобы вернуть подачи в список."
                : "Список обновится после создания или изменения статуса подачи."}
            </p>
            <Button variant="secondary" onClick={hasFiltering ? resetFilters : onCreate}>
              {hasFiltering ? "Сбросить фильтры" : "Новая подача"}
            </Button>
          </div>
        )}
      </CardComponent>

      {panelOpen ? (
        <ContextPanel className="v19-submissions-context" label="Сводка подач">
          <p className="kicker">Сводка</p>
          <div className="v19-panel-metrics v19-submission-status-metrics">
            <span>
              Требуют действия
              <strong>{tabCounts.action}</strong>
            </span>
            <span>
              В работе
              <strong>{tabCounts.progress}</strong>
            </span>
            <span>
              На проверке
              <strong>{tabCounts.review}</strong>
            </span>
            <span>
              Готово
              <strong>{tabCounts.done}</strong>
            </span>
          </div>
          {prioritySubmission ? (
            <div className="v19-next-card">
              <span>Приоритет</span>
              <strong>{prioritySubmission.title}</strong>
              <p>{submissionPriorityLine(prioritySubmission)}</p>
              <Button
                variant="primary"
                onClick={() => {
                  onSelect(prioritySubmission);
                  onOpen(prioritySubmission, defaultDrawerTab(prioritySubmission));
                }}
              >
                {submissionActionLabel(prioritySubmission)}
              </Button>
            </div>
          ) : null}
        </ContextPanel>
      ) : null}
    </div>
  );
}

function submissionMetaLine(submission: Submission) {
  return [
    typeLabels[submission.type],
    applicantCountLabel(submission.applicants.length),
    submission.city,
    tripDates(submission),
    `обновлено ${submission.updatedAt}`,
  ].join(" · ");
}

function submissionFileStateLabel(submission: Submission) {
  const ready = submission.files.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;

  return `Файлы ${ready}/${submission.files.length}`;
}

function submissionFileStateTone(submission: Submission): "amber" | "muted" | "teal" {
  const ready = submission.files.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;

  if (ready === 0) return "muted";
  if (ready === submission.files.length) return "teal";
  return "amber";
}

function submissionExtraTagCount(submission: Submission) {
  if (submission.status === "returned" || submission.status === "requires_action") {
    return 0;
  }

  const openIssues = openIssueCount(submission);
  const blockers = blockerCount(submission);
  const statusTags = [statusLabels[submission.status]];

  if (blockers > 0) statusTags.push("Блокер");
  if (openIssues > blockers) statusTags.push("Замечания");

  return Math.max(statusTags.length - 1, 0);
}

function submissionExtraTagLabel(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) return `${blockers} блокера`;

  const openIssues = openIssueCount(submission);
  if (openIssues > 0) return `${openIssues} замечания`;

  return undefined;
}

function submissionActionLabel(submission: Submission) {
  if (submission.status === "requires_action" || submission.status === "returned") {
    const issue = submission.issues.find((item) => item.status === "open");
    if (issue?.target.fileType) return fileActionLabel(issue.target.fileType);
    if (issue?.target.field) return "Исправить поле";
    if (issue?.target.section) return "Исправить раздел";
    return "Исправить замечания";
  }
  if (submission.status === "draft" || submission.status === "in_progress") {
    const missingFile = submission.files.find(
      (file) => file.status === "missing" || file.status === "needs_replacement",
    );
    if (submission.completeness.questionnaire < 100) return "Заполнить анкету";
    if (missingFile) return fileActionLabel(missingFile.type);
    return "Отправить на проверку";
  }
  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received"
  ) {
    return "Смотреть статус";
  }
  if (submission.status === "ready_for_export") return "Готово к выгрузке";
  return "Открыть историю";
}

function fileActionLabel(fileType: Submission["files"][number]["type"]) {
  if (fileType === "photo") return "Заменить фото";
  if (fileType === "selfie" || fileType === "selfie_2") return "Добавить селфи";
  if (fileType === "video") return "Заменить видео";
  if (fileType === "passport_scan") return "Заменить паспорт";
  return "Заменить файл";
}

function submissionPriorityLine(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) return `${blockers} блокера · обновлено ${submission.updatedAt}`;
  const open = openIssueCount(submission);
  if (open > 0) return `${open} замечания · обновлено ${submission.updatedAt}`;
  return `${statusLabels[submission.status]} · обновлено ${submission.updatedAt}`;
}

export function AdminReviewScreen({
  filterControl,
  onAddIssue,
  onOpen,
  onSelect,
  onTab,
  reviewList,
  reviewSource,
  reviewTab,
  searchControl,
  visibleSubmission,
}: {
  filterControl?: ReactNode;
  onAddIssue: (submission: Submission) => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: ReviewTab) => void;
  reviewList: Submission[];
  reviewSource: Submission[];
  reviewTab: ReviewTab;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
}) {
  const [blockersOnly, setBlockersOnly] = useState(false);
  const [comfortableView, setComfortableView] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sortNewest, setSortNewest] = useState(true);
  const tabCounts = {
    all: reviewSource.length,
    corrections: reviewSource.filter(matchesReviewTab("corrections")).length,
    ready: reviewSource.filter(matchesReviewTab("ready")).length,
    review: reviewSource.filter(matchesReviewTab("review")).length,
  };
  const blockerSubmissions = reviewSource.filter(
    (submission) => blockerCount(submission) > 0,
  ).length;
  const filteredReviewList = useMemo(
    () =>
      blockersOnly
        ? reviewList.filter((submission) => blockerCount(submission) > 0)
        : reviewList,
    [blockersOnly, reviewList],
  );
  const visibleReviewList = useMemo(
    () => (sortNewest ? filteredReviewList : [...filteredReviewList].reverse()),
    [filteredReviewList, sortNewest],
  );
  const visibleSelectedSubmission =
    visibleSubmission &&
    visibleReviewList.some((submission) => submission.id === visibleSubmission.id)
      ? visibleSubmission
      : null;
  const prioritySubmission =
    visibleSelectedSubmission ?? visibleReviewList[0] ?? null;
  const addIssueGuard = prioritySubmission
    ? adminIssueGuard(prioritySubmission, "admin")
    : null;
  const canAddIssue = addIssueGuard?.ok === true;
  const addIssueReason = canAddIssue
    ? ""
    : addIssueGuard?.reason ?? "В этой вкладке нет видимой подачи для действия.";
  const activeFilterLabels: string[] = [
    blockersOnly ? "Только блокеры" : null,
    sortNewest ? null : "Обратный порядок",
    comfortableView ? null : "Компактный вид",
  ].filter((label): label is string => Boolean(label));

  return (
    <div
      className={`v19-screen-grid v19-admin-review-screen ${
        panelOpen ? "" : "is-panel-closed"
      } ${comfortableView ? "is-comfortable" : "is-compact"}`}
    >
      <CardComponent
        as="section"
        className={
          activeFilterLabels.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="review-title"
      >
        <h2 id="review-title" className="sr-only">
          Очередь проверки администратора
        </h2>

        <CollectionToolbar
          activeFilters={activeFilterLabels}
          ariaLabel="Инструменты проверки"
          cityControl={filterControl}
          onTabChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
          search={searchControl}
          tabs={[
            { count: tabCounts.all, id: "all", label: "Все" },
            { count: tabCounts.review, id: "review", label: "Проверка" },
            {
              count: tabCounts.corrections,
              id: "corrections",
              label: "Исправления",
            },
            { count: tabCounts.ready, id: "ready", label: "К выгрузке" },
          ]}
          tabsAriaLabel="Состояние проверки"
          tools={
            <ToolbarTools>
              <ToolbarIconButton
                label={blockersOnly ? "Фильтр: только блокеры" : "Фильтр: все подачи"}
                icon="filter"
                pressed={blockersOnly}
                onClick={() =>
                  transitionUiState(() => setBlockersOnly((value) => !value))
                }
              />
              <ToolbarIconButton
                label={comfortableView ? "Вид: комфортный" : "Вид: компактный"}
                icon="view"
                pressed={!comfortableView}
                onClick={() =>
                  transitionUiState(() => setComfortableView((value) => !value))
                }
              />
              <ToolbarIconButton
                label={sortNewest ? "Сначала приоритетные" : "Обратный порядок"}
                icon="sort"
                pressed={!sortNewest}
                onClick={() =>
                  transitionUiState(() => setSortNewest((value) => !value))
                }
              />
              <ToolbarIconButton
                label={panelOpen ? "Скрыть сводку" : "Показать сводку"}
                icon="panel"
                pressed={panelOpen}
                onClick={() =>
                  transitionUiState(() => setPanelOpen((value) => !value))
                }
              />
            </ToolbarTools>
          }
          value={reviewTab}
        />

        {visibleReviewList.length ? (
          <>
            <div className="v19-submission-list-head" aria-hidden="true">
              <span>Подача</span>
              <span>Статус</span>
              <span>Файлы</span>
              <span>Готовность</span>
              <span>Действие</span>
            </div>
            <div className="v19-event-list v19-submission-list">
              {visibleReviewList.map((submission) => (
                <SubmissionCollectionRow
                  action={adminReviewActionLabel(submission)}
                  completeness={`${submission.completeness.total}%`}
                  extraTagCount={submissionExtraTagCount(submission)}
                  extraTagLabel={submissionExtraTagLabel(submission)}
                  fileState={submissionFileStateLabel(submission)}
                  fileTone={submissionFileStateTone(submission)}
                  key={submission.id}
                  meta={adminReviewMeta(submission)}
                  status={submission.status}
                  statusLabel={formatSubmissionListStatus(submission)}
                  submissionId={submission.id}
                  title={formatSubmissionListTitle(submission)}
                  onOpen={() => {
                    onSelect(submission);
                    onOpen(submission, "overview");
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="v19-empty-state" key={`review-empty-${reviewTab}-${blockersOnly}`}>
            <h3>Очередь проверки пуста</h3>
            <p>
              Новые подачи появятся здесь после отправки агентом или после исправлений.
            </p>
            <Button variant="secondary" onClick={() => onTab("all")}>
              Показать все
            </Button>
          </div>
        )}
      </CardComponent>

      {panelOpen ? (
        <ContextPanel className="v19-admin-context" label="Сводка проверки">
          <p className="kicker">Сводка</p>
          <div className="v19-unread-summary">
            <strong>{tabCounts.all}</strong>
            <span>
              {pluralRu(tabCounts.all, "подача в очереди", "подачи в очереди", "подач в очереди")}
            </span>
          </div>
          <div className="v19-panel-metrics v19-admin-status-metrics">
            <span>
              На проверке
              <strong>{tabCounts.review}</strong>
            </span>
            <span>
              Исправления
              <strong>{tabCounts.corrections}</strong>
            </span>
            <span>
              К выгрузке
              <strong>{tabCounts.ready}</strong>
            </span>
            <span>
              Блокеры
              <strong>{blockerSubmissions}</strong>
            </span>
          </div>
          {prioritySubmission ? (
            <div className="v19-next-card">
              <span>Фокус проверки</span>
              <strong>{prioritySubmission.title}</strong>
              <p>{adminReviewPriorityLine(prioritySubmission)}</p>
              <Button
                variant="primary"
                onClick={() => {
                  onSelect(prioritySubmission);
                  onOpen(prioritySubmission, "overview");
                }}
              >
                {adminReviewActionLabel(prioritySubmission)}
              </Button>
              <Button
                aria-describedby={!canAddIssue ? "admin-return-disabled-note" : undefined}
                disabled={!canAddIssue}
                variant="secondary"
                onClick={() => prioritySubmission && onAddIssue(prioritySubmission)}
              >
                Вернуть с замечанием
              </Button>
              {!canAddIssue ? (
                <em className="v19-admin-disabled-note" id="admin-return-disabled-note">
                  {addIssueReason}
                </em>
              ) : null}
            </div>
          ) : null}
        </ContextPanel>
        ) : null}
    </div>
  );
}

function adminReviewActionLabel(submission: Submission) {
  if (submission.status === "corrections_received") return "Проверить";
  if (submission.status === "ready_for_export") return "Пакет";
  return "Открыть";
}

function adminReviewMeta(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) return `${blockers} блокера · ${submission.updatedAt}`;

  const open = openIssueCount(submission);
  if (open > 0) return `${open} замечания · ${submission.updatedAt}`;

  return `${submission.city} · ${typeLabels[submission.type]} · ${tripDates(submission)}`;
}

function adminReviewPriorityLine(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) return `${blockers} блокера ждут точного решения`;

  const open = openIssueCount(submission);
  if (open > 0) return `${open} замечания открыты`;

  return `${statusLabels[submission.status]} · обновлено ${submission.updatedAt}`;
}

export function ExportScreen({
  exportBusy = false,
  exportError = "",
  exportPlan,
  exportTab,
  filterControl,
  historyList,
  onDownload,
  onGenerate,
  onMarkExported,
  onOpen,
  onTab,
  onToggle,
  readyList,
  searchControl,
  selectedExportIds,
}: {
  exportBusy?: boolean;
  exportError?: string;
  exportPlan: ExportSummary;
  exportTab: ExportTab;
  filterControl?: ReactNode;
  historyList: Submission[];
  onDownload: () => void;
  onGenerate: () => void;
  onMarkExported: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onTab: (tab: ExportTab) => void;
  onToggle: (id: string) => void;
  readyList: Submission[];
  searchControl: ReactNode;
  selectedExportIds: string[];
}) {
  const actionHint =
    exportError ||
    (exportBusy ? "Фиксируем выгрузку..." : exportActionHint(exportPlan));
  const packageFacts = exportPackageFacts(exportPlan);
  const selectedExportIdSet = useMemo(
    () => new Set(selectedExportIds),
    [selectedExportIds],
  );

  return (
    <>
      <div className="export-grid magic-export-stage">
        <CardComponent
          as="section"
          className="submission-panel magic-export-queue"
          aria-labelledby="export-title"
        >
          <h2 id="export-title" className="sr-only">
            Пакеты для Excel
          </h2>

          <CollectionToolbar
            ariaLabel="Инструменты выгрузки"
            cityControl={filterControl}
            className="v19-export-toolbar"
            onTabChange={onTab}
            search={searchControl}
            tabs={[
              { count: readyList.length, id: "ready", label: "Готовы" },
              { count: historyList.length, id: "history", label: "История" },
            ]}
            tabsAriaLabel="Состояние выгрузки"
            value={exportTab}
          />
          {exportTab === "ready" ? (
            <div className="submission-list magic-export-list">
              {readyList.map((submission) => {
                const selected = selectedExportIdSet.has(submission.id);

                return (
                  <CardComponent
                    as="article"
                    aria-label={`Пакет ${submission.title}${
                      selected ? ", выбран" : ""
                    }`}
                    className={`export-row magic-export-row ${
                      selected ? "is-selected" : ""
                    }`}
                    key={submission.id}
                  >
                    <label className="export-check">
                      <input
                        aria-label={`Выбрать пакет: ${submission.title}`}
                        checked={selected}
                        type="checkbox"
                        onChange={() => onToggle(submission.id)}
                      />
                      <span className="sr-only">
                        Выбрать пакет: {submission.title}
                      </span>
                    </label>
                    <Button
                      className="export-row-main"
                      variant="plain"
                      onClick={() => onOpen(submission)}
                    >
                      <strong>{submission.title}</strong>
                      <span>
                        {submission.id} · {typeLabels[submission.type]} ·{" "}
                        {submission.city} · {tripDates(submission)}
                      </span>
                    </Button>
                    <Button variant="secondary" onClick={() => onOpen(submission)}>
                      Смотреть пакет
                    </Button>
                  </CardComponent>
                );
              })}
              {readyList.length === 0 ? (
                <EmptyState text="Нет подач готовых к выгрузке." />
              ) : null}
            </div>
          ) : (
            <div className="submission-list magic-export-list">
              {historyList.map((submission) => (
                <CardComponent
                  as="article"
                  className="export-row magic-export-row"
                  key={submission.id}
                >
                  <div>
                    <strong>{submission.title}</strong>
                    <p>
                      {submission.id} · {submission.city} · {tripDates(submission)}
                    </p>
                  </div>
                  <Badge tone="teal">Выгружено</Badge>
                </CardComponent>
              ))}
            </div>
          )}
        </CardComponent>

        <CardComponent
          as="aside"
          className="export-side magic-export-side"
          aria-label="Информация и предпросмотр выгрузки"
        >
          <CardComponent
            as="section"
            className="rail-panel rail-summary magic-export-summary"
          >
            <p className="kicker">Сводка выгрузки</p>
            <SummaryRow
              chips={[
                [
                  "teal",
                  String(readyList.length),
                  pluralRu(readyList.length, "готова", "готовы", "готовых"),
                ],
                ["muted", String(historyList.length), "в истории"],
                [
                  "blue",
                  String(exportPlan.rowCount),
                  pluralRu(exportPlan.rowCount, "строка", "строки", "строк"),
                ],
              ]}
            />
          </CardComponent>
          <CardComponent
            as="section"
            className="export-preview magic-export-preview"
            aria-label="Предпросмотр Эксель"
          >
            <div className="preview-header">
              <div>
                <p className="kicker">Пакет выгрузки</p>
                <h2>{exportPackageTitle(exportPlan)}</h2>
                <p className="export-package-line">{exportPackageLine(exportPlan)}</p>
              </div>
              <Badge tone={exportPlan.ready ? "teal" : "danger"}>
                {exportPlan.ready
                  ? exportStateLabel(exportPlan.exportState)
                  : "Блокировано"}
              </Badge>
            </div>
            <div
              aria-busy={exportBusy || undefined}
              aria-describedby={actionHint ? "export-action-hint" : undefined}
              className="mp-action-dock export-action-dock"
              data-testid="export-action-dock"
            >
              <div className="mp-action-dock-actions export-actions">
                <Button
                  disabled={exportBusy || !exportPlan.canGenerate}
                  onClick={onGenerate}
                >
                  Сформировать Эксель
                </Button>
                <Button
                  disabled={exportBusy || !exportPlan.canDownload}
                  variant="secondary"
                  onClick={onDownload}
                >
                  Скачать
                </Button>
                <Button
                  disabled={exportBusy || !exportPlan.canMarkExported}
                  loading={exportBusy}
                  variant="secondary"
                  onClick={onMarkExported}
                >
                  Отметить выгружено
                </Button>
              </div>
              {actionHint ? (
                <p
                  aria-live="polite"
                  className="mp-action-dock-hint export-action-hint"
                  id="export-action-hint"
                >
                  {actionHint}
                </p>
              ) : null}
            </div>
            <dl
              className="export-package-summary"
              aria-label="Состав выбранного пакета"
            >
              {packageFacts.items.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {exportPlan.blockers.length ? (
              <div className="blocker-box">
                {exportPlan.blockers.map((blocker) => (
                  <p key={blocker.reason}>{blocker.reason}</p>
                ))}
              </div>
            ) : (
              <div className="export-checklist" aria-label="Проверки перед выгрузкой">
                <span>{exportCheckLabel("Город", packageFacts.city)}</span>
                <span>{exportCheckLabel("Даты", packageFacts.dates)}</span>
                <span>{exportCheckLabel("Тип", packageFacts.type)}</span>
                <span>Повторная выгрузка защищена</span>
              </div>
            )}
            <div className="excel-table">
              <div className="excel-head">
                <span>Подача</span>
                <span>Заявитель</span>
                <span>Город</span>
                <span>Даты</span>
              </div>
              {exportPlan.rows.map((row) => (
                <div
                  className={`excel-row ${row.applicantCount > 1 ? "is-family" : ""}`}
                  key={`${row.submissionId}-${row.applicantName}`}
                >
                  <span>
                    {row.submissionCode}
                    {row.applicantCount > 1 ? <em>{row.groupLabel}</em> : null}
                  </span>
                  <span>
                    {row.applicantName}
                    {row.applicantCount > 1 ? (
                      <em>
                        {row.applicantIndex}/{row.applicantCount}
                      </em>
                    ) : null}
                  </span>
                  <span>{row.city}</span>
                  <span>{row.tripDates}</span>
                </div>
              ))}
            </div>
          </CardComponent>
        </CardComponent>
      </div>
    </>
  );
}

function exportPackageFacts(plan: ExportSummary) {
  const submissionIds = new Set(plan.rows.map((row) => row.submissionId));
  const cities = uniqueValues(plan.rows.map((row) => row.city));
  const dates = uniqueValues(plan.rows.map((row) => row.tripDates));
  const types = uniqueValues(plan.rows.map((row) => row.type));
  const city = singleOrMixed(cities);
  const tripDatesValue = singleOrMixed(dates);
  const type = singleOrMixed(types);

  return {
    city,
    dates: tripDatesValue,
    type,
    items: [
      ["Подачи", String(submissionIds.size)],
      ["Строки", String(plan.rowCount)],
      ["Город", city],
      ["Даты", tripDatesValue],
      ["Тип", type],
    ] satisfies Array<[string, string]>,
  };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function singleOrMixed(values: string[]) {
  if (values.length === 0) return "Не выбран";
  if (values.length === 1) return values[0];
  return "Смешано";
}

function exportPackageTitle(plan: ExportSummary) {
  if (plan.rowCount === 0) return "Пакет не выбран";
  const submissions = new Set(plan.rows.map((row) => row.submissionId)).size;
  return `${submissions} ${pluralRu(submissions, "подача", "подачи", "подач")} · ${plan.rowCount} ${pluralRu(plan.rowCount, "строка", "строки", "строк")}`;
}

function exportPackageLine(plan: ExportSummary) {
  if (plan.blockers.length > 0)
    return "Пакет нужно привести к одному городу, датам и типу.";
  if (plan.rowCount === 0) return "Выберите готовые подачи слева.";
  if (plan.exportState === "file_generated")
    return "Файл сформирован и ждёт скачивания.";
  if (plan.exportState === "file_downloaded")
    return "Файл скачан, осталось отметить выгрузку.";
  if (plan.exportState === "marked_exported") return "Пакет уже отмечен выгруженным.";
  return "Все строки будут добавлены в один Эксель-файл.";
}

function exportCheckLabel(label: string, value: string) {
  if (value === "Не выбран") return `${label}: не выбран`;
  return `${label}: ${value}`;
}

function exportStateLabel(state: ExportSummary["exportState"]) {
  if (state === "file_generated") return "Сформировано";
  if (state === "file_downloaded") return "Скачано";
  if (state === "marked_exported") return "Выгружено";
  return "Готово";
}

function exportActionHint(plan: ExportSummary) {
  if (plan.blockers.length > 0)
    return plan.blockers[0]?.reason ?? "Выгрузка заблокирована";
  if (plan.exportState === "ready")
    return "Сначала сформируйте Эксель, затем скачайте файл.";
  if (plan.exportState === "file_generated")
    return "Файл сформирован. Теперь скачайте его.";
  if (plan.exportState === "file_downloaded")
    return "Файл скачан. Можно отметить подачу выгруженной.";
  if (plan.exportState === "marked_exported") return "Подача уже отмечена выгруженной.";
  if (plan.exportState === "mixed")
    return "Выберите подачи в одном состоянии выгрузки.";
  return "Выберите готовую подачу для выгрузки.";
}
