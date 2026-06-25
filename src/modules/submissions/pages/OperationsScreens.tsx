import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { AgentSubmissionContextRail } from "../components/AgentSubmissionContextRail";
import {
  ActionRow,
  CollectionGroupLabel,
  CollectionRow,
  CollectionToolbar,
  ContextPanel,
  ContextRail,
  type CollectionActiveFilter,
  SubmissionCollectionRow,
  SvgIcon,
  ToolbarIconButton,
  ToolbarTools,
} from "../components/CollectionPrimitives";
import {
  buildReadinessQueue,
  firstActionableQueueItem,
  sectionNavigationTarget,
  targetForIssue,
  type WorkspaceTarget,
} from "../workspaceModel";

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
const v17RailPreferenceKey = "visaflow-v19-v17-rail";

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

function readV17RailPreference(route: "submissions" | "export") {
  if (typeof window === "undefined") return true;

  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(v17RailPreferenceKey) ?? "{}",
    ) as Partial<Record<"submissions" | "export", boolean>>;

    return value[route] !== false;
  } catch {
    return true;
  }
}

function saveV17RailPreference(route: "submissions" | "export", value: boolean) {
  if (typeof window === "undefined") return;

  try {
    const current = JSON.parse(
      window.sessionStorage.getItem(v17RailPreferenceKey) ?? "{}",
    ) as Partial<Record<"submissions" | "export", boolean>>;

    window.sessionStorage.setItem(
      v17RailPreferenceKey,
      JSON.stringify({ ...current, [route]: value }),
    );
  } catch {
    // sessionStorage may be unavailable in private or embedded contexts.
  }
}

type InboxEvent = OperationalInboxEvent;

type MobileFilterOption<T extends string> = {
  count?: number;
  id: T;
  label: string;
};

function MobileFilterSheet<T extends string>({
  label,
  onValueChange,
  options,
  title,
  value,
}: {
  label: string;
  onValueChange: (value: T) => void;
  options: Array<MobileFilterOption<T>>;
  title: string;
  value: T;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="v19-mobile-filter">
      <ToolbarIconButton
        className="v19-mobile-filter-trigger"
        icon="filter"
        label={label}
        pressed={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open ? (
        <>
          <button
            className="v19-mobile-filter-backdrop"
            type="button"
            onClick={() => setOpen(false)}
          >
            <span className="sr-only">Закрыть фильтры</span>
          </button>
          <div
            className="v19-mobile-filter-sheet"
            role="dialog"
            aria-label={title}
          >
            <div className="v19-mobile-filter-head">
              <strong>{title}</strong>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Готово
              </Button>
            </div>
            <div className="v19-mobile-filter-options">
              {options.map((option) => (
                <Button
                  aria-pressed={value === option.id}
                  className={`v19-mobile-filter-choice ${
                    value === option.id ? "is-active" : ""
                  }`}
                  key={option.id}
                  variant="plain"
                  onClick={() => {
                    onValueChange(option.id);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {typeof option.count === "number" ? (
                    <em>{option.count}</em>
                  ) : null}
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function firstFileWorkspaceTarget(submission: Submission): WorkspaceTarget | undefined {
  const file =
    submission.files.find((item) => item.status === "needs_replacement") ??
    submission.files.find(
      (item) => item.status === "missing" || item.status === "pending_review",
    );

  if (!file) {
    return undefined;
  }

  return {
    applicantId: file.applicantId,
    fileType: file.type,
    tab: "files",
  };
}

function firstQuestionnaireWorkspaceTarget(
  submission: Submission,
): WorkspaceTarget | undefined {
  const applicant = submission.applicants.find((item) =>
    ["empty", "partial", "needs_fix"].includes(item.questionnaireStatus),
  );
  const section = applicant?.sections.find((item) => item.status !== "complete");

  if (!applicant || !section) {
    return undefined;
  }

  return sectionNavigationTarget(submission, section.title);
}

function queueTargetForTab(
  submission: Submission,
  tab: DrawerTab,
): WorkspaceTarget | undefined {
  return buildReadinessQueue(submission).find((item) => item.target.tab === tab)
    ?.target;
}

function targetForSubmissionTab(
  submission: Submission,
  tab: DrawerTab,
): WorkspaceTarget | undefined {
  const queueTarget = queueTargetForTab(submission, tab);

  if (queueTarget) {
    return queueTarget;
  }

  if (tab === "files") {
    return firstFileWorkspaceTarget(submission);
  }

  if (tab === "questionnaire") {
    return firstQuestionnaireWorkspaceTarget(submission);
  }

  if (tab === "issues") {
    const issue = primarySubmissionIssue(submission);
    return issue ? targetForIssue(issue) : undefined;
  }

  return firstActionableQueueItem(submission)?.target;
}

function drawerTabForScreenTarget(
  target: WorkspaceTarget | undefined,
  fallback: DrawerTab,
): DrawerTab {
  return target?.tab ?? fallback;
}

function defaultContextRailOpen() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= 1280;
}

function useContextRailEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);
}

export function AgentActionsScreen({
  cityControl,
  completedActions,
  onOpen,
  openActions,
  searchControl,
  summary,
}: {
  cityControl?: ReactNode;
  completedActions: AgentActionItem[];
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  openActions: AgentActionItem[];
  searchControl: ReactNode;
  summary: AgentActionSummary;
}) {
  const [activeTab, setActiveTab] = useState<"open" | "completed">("open");
  const [comfortableView, setComfortableView] = useState(true);
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "today" | "week">(
    "all",
  );
  const hasContextRail = cityControl != null;
  const [panelOpen, setPanelOpen] = useState(
    () => hasContextRail && defaultContextRailOpen(),
  );
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
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
  const selectedAction =
    visibleActions.find((action) => action.id === selectedActionId) ??
    visibleActions[0];
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
  const activeFilters = ([
    dueFilter !== "all"
      ? {
          id: "due",
          label:
            dueFilter === "overdue"
              ? "Просрочено"
              : dueFilter === "today"
                ? "Сегодня"
                : "На неделе",
          onRemove: () => transitionUiState(() => setDueFilter("all")),
        }
      : null,
    sortOldest
      ? {
          id: "sort",
          label: "Старые сверху",
          onRemove: () => transitionUiState(() => setSortOldest(false)),
        }
      : null,
    comfortableView
      ? null
      : {
          id: "density",
          label: "Компактный вид",
          onRemove: () => transitionUiState(() => setComfortableView(true)),
        },
  ] as Array<CollectionActiveFilter | null>
  ).filter((filter): filter is CollectionActiveFilter => filter !== null);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setDueFilter("all");
      setSortOldest(false);
      setComfortableView(true);
    });
  useContextRailEscape(hasContextRail && panelOpen, closePanel);

  function closePanel() {
    transitionUiState(() => setPanelOpen(false));
  }

  function togglePanel() {
    transitionUiState(() => setPanelOpen((value) => !value));
  }

  const panelToggleTool = (
    <ToolbarIconButton
      label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
      icon="panel"
      pressed={panelOpen}
      onClick={togglePanel}
    />
  );
  const mobilePanelToggleTool = hasContextRail ? (
    <div className="v19-mobile-context-tool">
      <ToolbarIconButton
        label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
        icon="panel"
        pressed={panelOpen}
        onClick={togglePanel}
      />
    </div>
  ) : null;
  const toolbarToolButtons = (
    <>
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
        label={
          sortOldest ? "Сортировка: поздние ниже" : "Сортировка: важные сверху"
        }
        icon="sort"
        pressed={sortOldest}
        onClick={() => transitionUiState(() => setSortOldest((value) => !value))}
      />
      {hasContextRail ? panelToggleTool : null}
    </>
  );
  type ActionMobileFilter = "completed" | "open" | "overdue" | "today";
  const mobileFilterValue: ActionMobileFilter =
    activeTab === "completed"
      ? "completed"
      : dueFilter === "overdue" || dueFilter === "today"
        ? dueFilter
        : "open";
  const mobileFilterOptions: Array<MobileFilterOption<ActionMobileFilter>> = [
    { count: summary.open, id: "open", label: "Открытые" },
    { count: summary.overdue, id: "overdue", label: "Просрочено" },
    { count: summary.today, id: "today", label: "Сегодня" },
    { count: summary.completed, id: "completed", label: "Выполненные" },
  ];
  const toolbarTools = (
    <ToolbarTools>
      <div className="v19-desktop-toolbar-tools">{toolbarToolButtons}</div>
      <MobileFilterSheet<ActionMobileFilter>
        label="Фильтры действий"
        options={mobileFilterOptions}
        title="Статус действий"
        value={mobileFilterValue}
        onValueChange={(nextFilter) =>
          transitionUiState(() => {
            if (nextFilter === "completed") {
              setActiveTab("completed");
              setDueFilter("all");
              return;
            }

            setActiveTab("open");
            setDueFilter(nextFilter === "open" ? "all" : nextFilter);
          })
        }
      />
      {mobilePanelToggleTool}
    </ToolbarTools>
  );
  function openAction(action: AgentActionItem) {
    const target = targetForSubmissionTab(action.submission, action.tab);

    setSelectedActionId(action.id);
    onOpen(action.submission, drawerTabForScreenTarget(target, action.tab), target);
  }

  return (
    <>
      <div
        className={`v19-screen-grid v19-inbox-screen v19-actions-screen ${
          panelOpen ? "" : "is-panel-closed"
        } ${comfortableView ? "is-comfortable" : "is-compact"}`}
      >
      <CardComponent
        as="section"
        className={
          activeFilters.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="agent-actions-title"
      >
        <h2 id="agent-actions-title" className="sr-only">
          Мои действия
        </h2>

        <CollectionToolbar
          activeFilters={activeFilters}
          ariaLabel="Инструменты действий"
          className={cityControl ? "v19-agent-mobile-toolbar" : undefined}
          mobileCityControl={cityControl}
          mobileTitle="Мои действия"
          onClearActiveFilters={activeFilters.length ? resetActiveFilters : undefined}
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
          tools={toolbarTools}
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
                selected={selectedAction?.id === action.id}
                title={action.title}
                onOpen={() => openAction(action)}
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

      </div>

      {hasContextRail && panelOpen ? (
        <button className="v19-context-backdrop" type="button" onClick={closePanel}>
          <span className="sr-only">Закрыть контекст</span>
        </button>
      ) : null}

      {hasContextRail && panelOpen && selectedAction ? (
        <AgentSubmissionContextRail
          applicantSummary={applicantCountLabel(selectedAction.submission.applicants.length)}
          fileSummary={submissionFileStateLabel(selectedAction.submission).replace(
            "Файлы ",
            "",
          )}
          history={selectedAction.submission.history}
          issues={selectedAction.submission.issues
            .filter((issue) => issue.status === "open")
            .slice(0, 4)
            .map((issue) => ({
              id: issue.id,
              reason: issue.reason,
              targetLine: issueTargetLine(issue),
              tone: issue.severity === "blocker" ? "danger" : "warning",
              onOpen: () => {
                onOpen(
                  selectedAction.submission,
                  drawerTabForIssue(issue),
                  targetForIssue(issue),
                );
              },
            }))}
          nextAction={{
            description: `${selectedAction.context}`,
            label: selectedAction.cta,
            title: selectedAction.title,
            onOpen: () => openAction(selectedAction),
          }}
          openIssueCount={openIssueCount(selectedAction.submission)}
          status={{
            label: submissionStatusChipLabel(selectedAction.submission),
            tone: submissionRailTone(selectedAction.submission),
          }}
          submission={selectedAction.submission}
          tripSummary={tripDates(selectedAction.submission)}
          onClose={closePanel}
          onOpenTab={(tab) => {
            onOpen(selectedAction.submission, tab);
          }}
        />
      ) : null}
    </>
  );
}

export function AgentInboxScreen({
  cityControl,
  inboxEvents,
  onOpen,
  searchControl,
  submissions,
  summary,
}: {
  cityControl?: ReactNode;
  inboxEvents?: InboxEvent[];
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  searchControl: ReactNode;
  submissions: Submission[];
  summary: ReturnType<typeof counts>;
}) {
  const [activeTab, setActiveTab] = useState<"unread" | "all">("unread");
  const [actionOnly, setActionOnly] = useState(false);
  const [comfortableView, setComfortableView] = useState(true);
  const [informationalOnly, setInformationalOnly] = useState(false);
  const hasContextRail = cityControl != null;
  const [panelOpen, setPanelOpen] = useState(
    () => hasContextRail && defaultContextRailOpen(),
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const events = useMemo(
    () => inboxEvents ?? buildAgentInboxEvents(submissions),
    [inboxEvents, submissions],
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
      : informationalOnly
        ? tabEvents.filter((event) => !event.needsAction)
        : tabEvents;

    return sortOrder === "oldest" ? [...filteredEvents].reverse() : filteredEvents;
  }, [actionOnly, activeTab, events, informationalOnly, sortOrder]);
  const unreadCount = events.filter((event) => !event.read).length;
  const unreadActionCount = events.filter(
    (event) => !event.read && event.needsAction,
  ).length;
  const actionEventCount = events.length
    ? unreadActionCount
    : Math.min(summary.requiresAction, unreadCount);
  const informationalEventCount = Math.max(unreadCount - actionEventCount, 0);
  const selectedEvent =
    visibleEvents.find((event) => event.id === selectedEventId) ??
    visibleEvents[0];
  const railEvents = events.filter((event) => !event.read).slice(0, 3);
  const railPeerEvents = (railEvents.length ? railEvents : events)
    .filter((event) => event.id !== selectedEvent?.id)
    .slice(0, 2);
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
  const activeFilters = ([
    actionOnly
      ? {
          id: "action",
          label: "Требуют действия",
          onRemove: () => transitionUiState(() => setActionOnly(false)),
        }
      : null,
    informationalOnly
      ? {
          id: "info",
          label: "Информационные",
          onRemove: () => transitionUiState(() => setInformationalOnly(false)),
        }
      : null,
    sortOrder === "oldest"
      ? {
          id: "sort",
          label: "Старые сверху",
          onRemove: () => transitionUiState(() => setSortOrder("newest")),
        }
      : null,
    comfortableView
      ? null
      : {
          id: "density",
          label: "Компактный вид",
          onRemove: () => transitionUiState(() => setComfortableView(true)),
        },
  ] as Array<CollectionActiveFilter | null>
  ).filter((filter): filter is CollectionActiveFilter => filter !== null);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setActionOnly(false);
      setInformationalOnly(false);
      setSortOrder("newest");
      setComfortableView(true);
    });
  useContextRailEscape(hasContextRail && panelOpen, closePanel);

  function closePanel() {
    transitionUiState(() => setPanelOpen(false));
  }

  function togglePanel() {
    transitionUiState(() => setPanelOpen((value) => !value));
  }

  const panelToggleTool = (
    <ToolbarIconButton
      label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
      icon="panel"
      pressed={panelOpen}
      onClick={togglePanel}
    />
  );
  const mobilePanelToggleTool = hasContextRail ? (
    <div className="v19-mobile-context-tool">
      <ToolbarIconButton
        label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
        icon="panel"
        pressed={panelOpen}
        onClick={togglePanel}
      />
    </div>
  ) : null;
  const toolbarToolButtons = (
    <>
      <ToolbarIconButton
        label={
          actionOnly
            ? "Фильтр: только требующие действия"
            : "Фильтр: все события"
        }
        icon="filter"
        pressed={actionOnly}
        onClick={() =>
          transitionUiState(() => {
            setInformationalOnly(false);
            setActionOnly((value) => !value);
          })
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
            setSortOrder((value) => (value === "newest" ? "oldest" : "newest")),
          )
        }
      />
      {hasContextRail ? panelToggleTool : null}
    </>
  );
  type InboxMobileFilter = "action" | "all" | "info" | "unread";
  const mobileFilterValue: InboxMobileFilter = informationalOnly
    ? "info"
    : actionOnly
      ? "action"
      : activeTab;
  const mobileFilterOptions: Array<MobileFilterOption<InboxMobileFilter>> = [
    { count: unreadCount, id: "unread", label: "Непрочитанные" },
    { count: events.length, id: "all", label: "Все события" },
    { count: actionEventCount, id: "action", label: "Требуют действия" },
    { count: informationalEventCount, id: "info", label: "Информационные" },
  ];
  const toolbarTools = (
    <ToolbarTools>
      <div className="v19-desktop-toolbar-tools">{toolbarToolButtons}</div>
      <MobileFilterSheet<InboxMobileFilter>
        label="Фильтры входящих"
        options={mobileFilterOptions}
        title="Статус входящих"
        value={mobileFilterValue}
        onValueChange={(nextFilter) =>
          transitionUiState(() => {
            setActionOnly(nextFilter === "action");
            setInformationalOnly(nextFilter === "info");
            setActiveTab(nextFilter === "unread" ? "unread" : "all");
          })
        }
      />
      {mobilePanelToggleTool}
    </ToolbarTools>
  );

  function openEventDrawer(event: InboxEvent) {
    const target = targetForSubmissionTab(event.submission, event.tab);

    setSelectedEventId(event.id);
    onOpen(event.submission, drawerTabForScreenTarget(target, event.tab), target);
  }

  function openPanelNextEvent(event: InboxEvent) {
    openEventDrawer(event);
  }

  return (
    <>
      <div
        className={`v19-screen-grid v19-inbox-screen ${
          panelOpen ? "" : "is-panel-closed"
        } ${comfortableView ? "is-comfortable" : "is-compact"}`}
      >
      <CardComponent
        as="section"
        className={
          activeFilters.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="agent-inbox-title"
      >
        <h2 id="agent-inbox-title" className="sr-only">
          Входящие
        </h2>

        <CollectionToolbar
          activeFilters={activeFilters}
          ariaLabel="Инструменты входящих"
          className={cityControl ? "v19-agent-mobile-toolbar" : undefined}
          mobileCityControl={cityControl}
          mobileTitle="Входящие"
          onClearActiveFilters={activeFilters.length ? resetActiveFilters : undefined}
          onTabChange={(nextTab) =>
            transitionUiState(() => {
              setActiveTab(nextTab);
              setInformationalOnly(false);
            })
          }
          search={searchControl}
          tabs={[
            { count: unreadCount, id: "unread", label: "Непрочитанные" },
            { id: "all", label: "Все" },
          ]}
          tabsAriaLabel="Состояние входящих"
          tools={toolbarTools}
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
                    meta={<InboxEventMeta event={event} />}
                    onAction={() => openEventDrawer(event)}
                    read={event.read}
                    title={event.title}
                    tone={event.tone}
                  />
                ))}
              </div>
            ))}
            {visibleEvents.length <= 1 ? (
              <div className="v19-inbox-list-cue" aria-label="Состояние очереди входящих">
                <strong>
                  {unreadCount} непрочитанных · {actionEventCount} требуют реакции
                </strong>
                <span>Новые события появятся здесь после комментариев, возвратов и проверок.</span>
              </div>
            ) : null}
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

      </div>

      {hasContextRail && panelOpen ? (
        <button className="v19-context-backdrop" type="button" onClick={closePanel}>
          <span className="sr-only">Закрыть контекст</span>
        </button>
      ) : null}

      {hasContextRail && panelOpen ? (
        <ContextRail
          className="v19-inbox-summary"
          label="Фокус входящего"
          title={selectedEvent ? selectedEvent.badge : "Входящие"}
          onClose={closePanel}
        >
          <section className="v19-rail-card v19-inbox-overview-card">
            <h3>Очередь входящих</h3>
            <div className="v19-inbox-summary-line">
              <span>
                <strong>{unreadCount}</strong>
                <em>Непрочитанных</em>
              </span>
              <span>
                <strong>{actionEventCount}</strong>
                <em>Требуют реакции</em>
              </span>
              <span>
                <strong>{informationalEventCount}</strong>
                <em>Инфо</em>
              </span>
            </div>
          </section>

          {selectedEvent ? (
            <section className="v19-rail-card v19-inbox-next-card">
              <p className="v19-rail-label">Текущее событие</p>
              <h3>{selectedEvent.title}</h3>
              <p>
                {inboxEventSourceLabel(selectedEvent)} · {selectedEvent.context} ·{" "}
                {selectedEvent.time}
              </p>
              <Button variant="primary" onClick={() => openPanelNextEvent(selectedEvent)}>
                {selectedEvent.action}
                <SvgIcon>
                  <path d="M9 6l6 6-6 6" />
                </SvgIcon>
              </Button>
            </section>
          ) : null}

          {railPeerEvents.length ? (
            <section className="v19-rail-card">
              <h3>Ещё в очереди</h3>
              <div className="v19-rail-status-list">
                {railPeerEvents.map((event) => (
                  <button
                    className="v19-rail-news-item"
                    key={event.id}
                    type="button"
                    onClick={() => openPanelNextEvent(event)}
                  >
                    <span
                      className={`v19-rail-issue-dot tone-${event.tone === "danger" ? "danger" : event.tone === "amber" ? "warning" : "success"}`}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{inboxRailNewsTitle(event)}</strong>
                      <small>
                        {inboxEventSourceLabel(event)} · {event.time}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </ContextRail>
      ) : null}
    </>
  );
}

function inboxRailNewsTitle(event: InboxEvent) {
  if (event.badge === "Возвращено") return "Возврат на исправление";
  if (event.badge === "Видео") return "Комментарий к видео";
  if (event.badge === "Принято") return "Подача принята";
  return event.title;
}

function InboxEventMeta({ event }: { event: InboxEvent }) {
  return (
    <span className="v19-inbox-event-meta">
      <span>{inboxEventSourceLabel(event)}</span>
      <span>{event.context}</span>
      <span>{event.time}</span>
    </span>
  );
}

function inboxEventSourceLabel(event: InboxEvent) {
  if (event.badge === "Возвращено") return "Администратор";
  if (event.badge === "Видео") return "Файл";
  if (event.badge === "Принято") return "Проверка";
  if (event.badge === "Черновик") return "Система";
  return event.submission.title;
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
  const videoFile = videoIssue.files.find(
    (file) => file.status === "needs_replacement",
  );
  const videoApplicant = videoIssue.applicants.find(
    (applicant) => applicant.id === videoFile?.applicantId,
  );
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
      title: `Подачу «${returned.title}» вернули на исправление`,
      tone: "danger",
    },
    {
      action: "Открыть",
      badge: "Видео",
      context: videoApplicant?.fullName ?? videoIssue.title,
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
      title: `Подача «${accepted.title}» принята`,
      tone: "teal",
    },
    {
      action: "Открыть",
      badge: "Черновик",
      context: draft.title,
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
  hasSearchQuery = false,
  mobileTitle = "Мои подачи",
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
  hasSearchQuery?: boolean;
  mobileTitle?: string;
  onClearFilters?: () => void;
  onCreate: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AgentTab) => void;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
  summary: ReturnType<typeof counts>;
}) {
  const [blockersOnly, setBlockersOnly] = useState(false);
  const [comfortableView, setComfortableView] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() =>
    readV17RailPreference("submissions"),
  );
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
  const priorityIssue = prioritySubmission
    ? primarySubmissionIssue(prioritySubmission)
    : null;
  const railCompact = panelOpen;
  const tabCounts = {
    action: summary.requiresAction,
    done: summary.ready + summary.exported,
    progress: summary.draft + summary.inProgress,
    review: summary.inReview + summary.corrections,
  };
  const visibleTab: Exclude<AgentTab, "all"> =
    activeTab === "all" ? "action" : activeTab;
  const activeFilters = ([
    hasSearchQuery
      ? {
          id: "search",
          label: "Поиск",
          onRemove: () => onClearFilters?.(),
        }
      : null,
    blockersOnly
      ? {
          id: "blockers",
          label: "Только блокеры",
          onRemove: () => transitionUiState(() => setBlockersOnly(false)),
        }
      : null,
    sortNewest
      ? null
      : {
          id: "sort",
          label: "Обратный порядок",
          onRemove: () => transitionUiState(() => setSortNewest(true)),
        },
    comfortableView
      ? null
      : {
          id: "density",
          label: "Компактный вид",
          onRemove: () => transitionUiState(() => setComfortableView(true)),
        },
  ] as Array<CollectionActiveFilter | null>
  ).filter((filter): filter is CollectionActiveFilter => filter !== null);
  const hasFiltering = activeFilters.length > 0;
  const resetFilters = () => {
    transitionUiState(() => {
      setBlockersOnly(false);
      setSortNewest(true);
      setComfortableView(true);
      onClearFilters?.();
    });
  };
  function setV17PanelOpen(value: boolean) {
    transitionUiState(() => {
      setPanelOpen(value);
      saveV17RailPreference("submissions", value);
    });
  }

  function toggleV17Panel() {
    setV17PanelOpen(!panelOpen);
  }

  function openPriorityTarget(
    submission: Submission,
    tab: DrawerTab,
    target?: WorkspaceTarget,
  ) {
    onSelect(submission);
    onOpen(submission, tab, target);
  }

  const panelToggleTool = (
    <ToolbarIconButton
      label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
      icon="panel"
      pressed={panelOpen}
      onClick={toggleV17Panel}
    />
  );
  const toolbarToolButtons = (
    <>
      <ToolbarIconButton
        label={blockersOnly ? "Фильтр: только блокеры" : "Фильтр: все подачи"}
        icon="filter"
        pressed={blockersOnly}
        onClick={() =>
          transitionUiState(() => setBlockersOnly((value) => !value))
        }
      />
      <ToolbarIconButton
        label={sortNewest ? "Сначала приоритетные" : "Обратный порядок"}
        icon="sort"
        pressed={!sortNewest}
        onClick={() => transitionUiState(() => setSortNewest((value) => !value))}
      />
      {panelToggleTool}
    </>
  );
  const mobileFilterOptions: Array<
    MobileFilterOption<Exclude<AgentTab, "all">>
  > = [
    { count: tabCounts.action, id: "action", label: "Действия" },
    { count: tabCounts.progress, id: "progress", label: "В работе" },
    { count: tabCounts.review, id: "review", label: "Проверка" },
    { count: tabCounts.done, id: "done", label: "Готово" },
  ];
  const toolbarTools = (
    <ToolbarTools>
      <div className="v19-desktop-toolbar-tools">{toolbarToolButtons}</div>
      <MobileFilterSheet<Exclude<AgentTab, "all">>
        label="Фильтры подач"
        options={mobileFilterOptions}
        title="Статус подач"
        value={visibleTab}
        onValueChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
      />
    </ToolbarTools>
  );
  return (
    <div
      className={`v19-screen-grid v19-inbox-screen v19-submissions-screen ${
        panelOpen ? "" : "is-panel-closed"
      } ${comfortableView ? "is-comfortable" : "is-compact"}`}
    >
      <CardComponent
        as="section"
        className={
          activeFilters.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="agent-title"
      >
        <h2 id="agent-title" className="sr-only">
          Рабочая область подач агента
        </h2>

        <CollectionToolbar
          activeFilters={activeFilters}
          ariaLabel="Инструменты подач"
          className="v19-agent-mobile-toolbar"
          mobileTitle={mobileTitle}
          onClearActiveFilters={activeFilters.length ? resetFilters : undefined}
          onTabChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
          search={searchControl}
          tabs={[
            { count: tabCounts.action, id: "action", label: "Требуют действия" },
            { count: tabCounts.progress, id: "progress", label: "В работе" },
            { count: tabCounts.review, id: "review", label: "На проверке" },
            { count: tabCounts.done, id: "done", label: "Готово" },
          ]}
          tabsAriaLabel="Состояние подач"
          tools={toolbarTools}
          value={visibleTab}
        />

        {orderedSubmissions.length ? (
          <>
            <div className="v19-submission-list-head" aria-hidden="true">
              <span>Подача</span>
              <span>Поездка</span>
              <span>Статус</span>
              {!railCompact ? <span>Файлы</span> : null}
              <span>Готовность</span>
              <span />
            </div>
            <div className="v19-event-list v19-submission-list">
              {orderedSubmissions.map((submission) => (
                <SubmissionCollectionRow
                  action={submissionActionLabel(submission)}
                  compact={railCompact}
                  completeness={`${submission.completeness.total}%`}
                  extraTagCount={railCompact ? 0 : submissionExtraTagCount(submission)}
                  extraTagLabel={railCompact ? undefined : submissionExtraTagLabel(submission)}
                  fileDetail={submissionFileDetailLabel(submission)}
                  fileState={submissionFileStateLabel(submission)}
                  fileTone={submissionFileStateTone(submission)}
                  kind={submission.applicants.length > 1 ? "family" : "single"}
                  key={submission.id}
                  meta={submissionIdentityMeta(submission)}
                  status={submission.status}
                  statusDetail={
                    railCompact
                      ? submissionStatusDetailLine(submission)
                      : submissionIssueDetailLine(submission)
                  }
                  statusLabel={submissionStatusChipLabel(submission)}
                  submissionId={submission.id}
                  title={submission.title}
                  trip={submission.city}
                  tripDetail={tripDates(submission)}
                  onOpen={() => {
                    onSelect(submission);
                    onOpen(submission, defaultDrawerTab(submission));
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="v19-empty-state" key={`submissions-empty-${visibleTab}-${activeFilters.map((filter) => (typeof filter === "string" ? filter : filter.id)).join("-")}`}>
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

      {panelOpen && prioritySubmission ? (
        <AgentSubmissionContextRail
          applicantSummary={applicantCountLabel(prioritySubmission.applicants.length)}
          fileSummary={submissionFileStateLabel(prioritySubmission).replace("Файлы ", "")}
          history={prioritySubmission.history}
          issues={prioritySubmission.issues
            .filter((issue) => issue.status === "open")
            .slice(0, 4)
            .map((issue) => ({
              id: issue.id,
              reason: issue.reason,
              targetLine: issueTargetLine(issue),
              tone: issue.severity === "blocker" ? "danger" : "warning",
              onOpen: () => {
                openPriorityTarget(
                  prioritySubmission,
                  drawerTabForIssue(issue),
                  targetForIssue(issue),
                );
              },
            }))}
          nextAction={{
            description:
              priorityIssue?.comment ?? submissionPriorityLine(prioritySubmission),
            label: priorityIssue
              ? issueActionLabel(priorityIssue)
              : submissionActionLabel(prioritySubmission),
            title: priorityIssue?.reason ?? submissionActionLabel(prioritySubmission),
            onOpen: () => {
              openPriorityTarget(
                prioritySubmission,
                priorityIssue
                  ? drawerTabForIssue(priorityIssue)
                  : defaultDrawerTab(prioritySubmission),
                priorityIssue ? targetForIssue(priorityIssue) : undefined,
              );
            },
          }}
          openIssueCount={openIssueCount(prioritySubmission)}
          status={{
            label: submissionStatusChipLabel(prioritySubmission),
            tone: submissionRailTone(prioritySubmission),
          }}
          submission={prioritySubmission}
          tripSummary={tripDates(prioritySubmission)}
          onClose={() => setV17PanelOpen(false)}
          onOpenTab={(tab) => {
            openPriorityTarget(prioritySubmission, tab);
          }}
        />
      ) : null}
    </div>
  );
}

function submissionIdentityMeta(submission: Submission) {
  return `${submission.id} · ${applicantCountLabel(submission.applicants.length)}`;
}

function submissionFileStateLabel(submission: Submission) {
  const ready = submission.files.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;

  return `${ready} из ${submission.files.length}`;
}

function submissionFileDetailLabel(submission: Submission) {
  const replacementCount = submission.files.filter(
    (file) => file.status === "needs_replacement" || file.status === "pending_review",
  ).length;

  if (replacementCount > 0) {
    return `${replacementCount} ${pluralRu(replacementCount, "заменен", "заменены", "заменены")}`;
  }

  return submission.files.length > 0 ? "обязательные" : "нет файлов";
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

function submissionStatusDetailLine(submission: Submission) {
  const blockers = blockerCount(submission);
  const files = submissionFileStateLabel(submission);

  if (blockers > 0) {
    return `${blockers} ${pluralRu(blockers, "блокер", "блокера", "блокеров")} · ${files}`;
  }

  return `${submission.updatedAt} · ${files}`;
}

function submissionIssueDetailLine(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) {
    return `${blockers} ${pluralRu(blockers, "блокер", "блокера", "блокеров")}`;
  }

  return openIssueCount(submission) > 0 ? "есть замечания" : undefined;
}

function submissionStatusChipLabel(submission: Submission) {
  return statusLabels[submission.status];
}

function primarySubmissionIssue(submission: Submission) {
  return (
    submission.issues.find(
      (issue) => issue.status === "open" && issue.severity === "blocker",
    ) ??
    submission.issues.find((issue) => issue.status === "open") ??
    null
  );
}

function drawerTabForIssue(issue: Submission["issues"][number]): DrawerTab {
  if (issue.target.fileType) return "files";
  if (issue.target.field || issue.target.section) return "questionnaire";
  return "issues";
}

function issueActionLabel(issue: Submission["issues"][number]) {
  if (issue.target.fileType) return "Открыть файл";
  if (issue.target.field || issue.target.section) return "Открыть точное поле";
  return "Открыть замечание";
}

function issueTargetLine(issue: Submission["issues"][number]) {
  return [
    issue.target.applicantName,
    issue.target.fileType ? "Файлы" : "Анкета",
    issue.target.section,
    issue.target.field ? `поле ${issue.target.field}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function submissionRailTone(submission: Submission) {
  if (submission.status === "ready_for_export") return "teal";
  if (submission.status === "submitted_for_review") return "blue";
  if (submission.status === "returned" || submission.status === "requires_action") {
    return "danger";
  }
  if (submission.status === "draft" || submission.status === "exported") return "muted";
  return "amber";
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
  const activeFilters = ([
    blockersOnly
      ? {
          id: "blockers",
          label: "Только блокеры",
          onRemove: () => transitionUiState(() => setBlockersOnly(false)),
        }
      : null,
    sortNewest
      ? null
      : {
          id: "sort",
          label: "Обратный порядок",
          onRemove: () => transitionUiState(() => setSortNewest(true)),
        },
    comfortableView
      ? null
      : {
          id: "density",
          label: "Компактный вид",
          onRemove: () => transitionUiState(() => setComfortableView(true)),
        },
  ] as Array<CollectionActiveFilter | null>
  ).filter((filter): filter is CollectionActiveFilter => filter !== null);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setBlockersOnly(false);
      setSortNewest(true);
      setComfortableView(true);
    });
  const panelToggleTool = (
    <ToolbarIconButton
      label={panelOpen ? "Скрыть сводку" : "Показать сводку"}
      icon="panel"
      pressed={panelOpen}
      onClick={() => transitionUiState(() => setPanelOpen((value) => !value))}
    />
  );
  const toolbarToolButtons = (
    <>
      <ToolbarIconButton
        label={blockersOnly ? "Фильтр: только блокеры" : "Фильтр: все подачи"}
        icon="filter"
        pressed={blockersOnly}
        onClick={() =>
          transitionUiState(() => setBlockersOnly((value) => !value))
        }
      />
      <ToolbarIconButton
        label={sortNewest ? "Сначала приоритетные" : "Обратный порядок"}
        icon="sort"
        pressed={!sortNewest}
        onClick={() => transitionUiState(() => setSortNewest((value) => !value))}
      />
      {panelToggleTool}
    </>
  );
  const toolbarTools = <ToolbarTools>{toolbarToolButtons}</ToolbarTools>;

  return (
    <div
      className={`v19-screen-grid v19-admin-review-screen ${
        panelOpen ? "" : "is-panel-closed"
      } ${comfortableView ? "is-comfortable" : "is-compact"}`}
    >
      <CardComponent
        as="section"
        className={
          activeFilters.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="review-title"
      >
        <h2 id="review-title" className="sr-only">
          Очередь проверки администратора
        </h2>

        <CollectionToolbar
          activeFilters={activeFilters}
          ariaLabel="Инструменты проверки"
          cityControl={filterControl}
          onClearActiveFilters={activeFilters.length ? resetActiveFilters : undefined}
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
          tools={toolbarTools}
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
                  <Button
                    className="export-row-main"
                    variant="plain"
                    onClick={() => onOpen(submission, "files")}
                  >
                    <strong>{submission.title}</strong>
                    <span>
                      {submission.id} · {submission.city} · {tripDates(submission)}
                    </span>
                  </Button>
                  <Badge tone="teal">Выгружено</Badge>
                  <Button variant="secondary" onClick={() => onOpen(submission, "files")}>
                    Проверить PDF
                  </Button>
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
