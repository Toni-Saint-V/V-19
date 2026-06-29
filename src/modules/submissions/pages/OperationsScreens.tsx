import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  isSubmissionSelectableForExport,
  type ExportSummary,
} from "../exportRules";
import { formatSubmissionListTitle } from "../listFormatters";
import { buildAgentHandoffPackage } from "../operationalWorkflow";
import { applicantCountLabel, counts, tripDates } from "../selectors";
import {
  adminIssueGuard,
  adminWorkDrawerTabFor,
  adminWorkEventTitle,
  adminWorkPresentation,
  blockerCount,
  defaultDrawerTab,
  openIssueCount,
  statusLabels,
} from "../status";
import type { DrawerTab, Submission } from "../types";
import {
  matchesReviewTab,
  type AgentTab,
  type ExportTab,
} from "../uiTypes";
import { EmptyState } from "../components/Primitives";
import { AgentSubmissionContextRail } from "../components/AgentSubmissionContextRail";
import {
  ActionRow,
  CollectionGroupLabel,
  CollectionRow,
  CollectionToolbar,
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
        aria-labelledby="agent-inbox-actions-title"
      >
        <h2 id="agent-inbox-actions-title" className="sr-only">
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
  contextRailEnabled,
  inboxEvents,
  onOpen,
  searchControl,
  submissions,
  summary,
}: {
  cityControl?: ReactNode;
  contextRailEnabled?: boolean;
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
  const hasContextRail = contextRailEnabled ?? cityControl != null;
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
  const toolbarTools = (
    <ToolbarTools>
      <div className="v19-desktop-toolbar-tools">{toolbarToolButtons}</div>
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
                    family={event.submission.type === "family"}
                    key={event.id}
                    meta={<InboxEventMeta event={event} />}
                    onAction={() => openEventDrawer(event)}
                    passport={inboxPassportNumber(event.submission)}
                    read={event.read}
                    title={event.title}
                    tone={event.tone}
                    trip={tripDates(event.submission)}
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
  if (event.badge === "Файл") return "Комментарий к файлу";
  if (event.badge === "Принято") return "Подача принята";
  return event.title;
}

function InboxEventMeta({ event }: { event: InboxEvent }) {
  return (
    <span className="v19-inbox-event-meta">
      <span>{event.context}</span>
    </span>
  );
}

function inboxEventSourceLabel(event: InboxEvent) {
  if (event.badge === "Возвращено") return "Администратор";
  if (event.badge === "Файл") return "Файл";
  if (event.badge === "Принято") return "Проверка";
  if (event.badge === "Черновик") return "Система";
  return event.submission.title;
}

function buildAgentInboxEvents(submissions: Submission[]): InboxEvent[] {
  const fallback = submissions[0];
  if (!fallback) return [];
  const returned =
    submissions.find((submission) =>
      ["returned", "requires_action"].includes(submission.status),
    ) ?? fallback;
  const fileIssue =
    submissions.find((submission) =>
      submission.files.some((file) => file.status === "needs_replacement"),
    ) ?? returned;
  const replacementFile = fileIssue.files.find(
    (file) => file.status === "needs_replacement",
  );
  const replacementApplicant = fileIssue.applicants.find(
    (applicant) => applicant.id === replacementFile?.applicantId,
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
      id: `agent-inbox-reference-returned-${returned.id}`,
      needsAction: true,
      read: false,
      submission: returned,
      tab: "issues",
      time: "12 мин назад",
      title: inboxSubmissionLeadName(returned),
      tone: "danger",
    },
    {
      action: "Открыть",
      badge: "Файл",
      context: "Файл",
      id: `agent-inbox-reference-file-${fileIssue.id}`,
      needsAction: true,
      read: false,
      submission: fileIssue,
      tab: "files",
      time: "34 мин назад",
      title: replacementApplicant?.fullName ?? inboxSubmissionLeadName(fileIssue),
      tone: "amber",
    },
    {
      action: "Открыть",
      badge: "Принято",
      context: "Принято",
      id: `agent-inbox-reference-accepted-${accepted.id}`,
      needsAction: false,
      read: false,
      submission: accepted,
      tab: "overview",
      time: "1 ч назад",
      title: inboxSubmissionLeadName(accepted),
      tone: "teal",
    },
    {
      action: "Открыть",
      badge: "Черновик",
      context: "Черновик",
      id: `agent-inbox-reference-draft-${draft.id}`,
      needsAction: false,
      read: true,
      submission: draft,
      tab: "overview",
      time: "вчера, 18:42",
      title: inboxSubmissionLeadName(draft),
      tone: "muted",
    },
  ];
}

function inboxSubmissionLeadName(submission: Submission) {
  return submission.applicants[0]?.fullName ?? submission.title;
}

function inboxPassportNumber(submission: Submission) {
  const applicant = submission.applicants[0];
  const extractedPassport = applicant?.passportExtraction?.extractedFields
    .find((field) => field.key === "passportNumber")
    ?.value.trim();
  const questionnairePassport = applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "passport-no")
    ?.value.trim();

  return extractedPassport || questionnairePassport || "—";
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
  if (submission.applicants.length === 1) {
    const passportNumber = submission.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "passport-no")?.value.trim();

    if (passportNumber) return `Паспорт ${passportNumber}`;
    return "Паспорт не указан";
  }

  return submission.id;
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
  if (fileType === "photo") return "Архивный файл";
  if (fileType === "selfie") return "Добавить селфи";
  if (fileType === "selfie_2") return "Добавить селфи N2";
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

export type AdminWorkTab = "review" | "corrections" | "events";
type SubmissionSortMode = "priority" | "updated" | "created" | "trip";

const adminSortModes: SubmissionSortMode[] = [
  "priority",
  "updated",
  "created",
  "trip",
];
const exportSortModes: SubmissionSortMode[] = ["updated", "created", "trip"];

function nextSubmissionSortMode(
  current: SubmissionSortMode,
  modes: SubmissionSortMode[],
) {
  const currentIndex = modes.indexOf(current);
  return modes[(currentIndex + 1) % modes.length] ?? modes[0] ?? current;
}

function submissionSortModeLabel(mode: SubmissionSortMode) {
  if (mode === "priority") return "приоритет";
  if (mode === "updated") return "обновление";
  if (mode === "created") return "создание";
  return "дата поездки";
}

function sortSubmissionsForOperations(
  submissions: Submission[],
  mode: SubmissionSortMode,
) {
  if (mode === "priority") return submissions;

  return [...submissions].sort((left, right) => {
    if (mode === "trip") {
      return (
        sortableDateValue(left.tripDateFrom) - sortableDateValue(right.tripDateFrom) ||
        sortableDateValue(left.tripDateTo) - sortableDateValue(right.tripDateTo) ||
        left.id.localeCompare(right.id)
      );
    }

    const leftValue =
      mode === "created"
        ? sortableDateValue(left.createdAt)
        : sortableDateValue(left.updatedAt);
    const rightValue =
      mode === "created"
        ? sortableDateValue(right.createdAt)
        : sortableDateValue(right.updatedAt);

    return rightValue - leftValue || left.id.localeCompare(right.id);
  });
}

function sortableDateValue(value: string) {
  const trimmed = value.trim();
  const dotted = trimmed.match(/^(\d{2})\.(\d{2})(?:\.(\d{4}))?$/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const year = Number(dotted[3] ?? "2026");
    return year * 10_000 + month * 100 + day;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function AdminReviewScreen({
  error = "",
  filterControl,
  inboxEvents,
  loading = false,
  onAddIssue,
  onOpen,
  onSelect,
  onTab,
  permissionDenied = false,
  reviewList,
  reviewSource,
  reviewTab,
  searchControl,
  visibleSubmission,
}: {
  error?: string;
  filterControl?: ReactNode;
  inboxEvents: InboxEvent[];
  loading?: boolean;
  onAddIssue: (submission: Submission) => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AdminWorkTab) => void;
  permissionDenied?: boolean;
  reviewList: Submission[];
  reviewSource: Submission[];
  reviewTab: AdminWorkTab;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
}) {
  const [blockersOnly, setBlockersOnly] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SubmissionSortMode>("priority");
  const summaryRef = useRef<HTMLDivElement>(null);
  const reviewQueue = reviewSource.filter(matchesReviewTab("review"));
  const correctionsQueue = reviewSource.filter(matchesReviewTab("corrections"));
  const tabCounts = {
    corrections: correctionsQueue.length,
    events: inboxEvents.length,
    review: reviewQueue.length,
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
  const filteredEvents = useMemo(
    () =>
      blockersOnly
        ? inboxEvents.filter((event) => blockerCount(event.submission) > 0)
        : inboxEvents,
    [blockersOnly, inboxEvents],
  );
  const visibleReviewList = useMemo(
    () => sortSubmissionsForOperations(filteredReviewList, sortMode),
    [filteredReviewList, sortMode],
  );
  const visibleEvents = useMemo(
    () => filteredEvents,
    [filteredEvents],
  );
  const visibleSelectedSubmission =
    visibleSubmission &&
    visibleReviewList.some((submission) => submission.id === visibleSubmission.id)
      ? visibleSubmission
      : null;
  const summaryPrioritySubmission =
    visibleSelectedSubmission ??
    visibleReviewList[0] ??
    correctionsQueue[0] ??
    reviewQueue[0] ??
    reviewSource[0] ??
    null;
  const actionSubmission =
    reviewTab === "events" || permissionDenied || loading || error
      ? null
      : visibleSelectedSubmission ?? visibleReviewList[0] ?? null;
  const addIssueGuard = actionSubmission
    ? adminIssueGuard(actionSubmission, "admin")
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
    reviewTab === "events" || sortMode === "priority"
      ? null
      : {
          id: "sort",
          label: `Сортировка: ${submissionSortModeLabel(sortMode)}`,
          onRemove: () => transitionUiState(() => setSortMode("priority")),
        },
  ] as Array<CollectionActiveFilter | null>
  ).filter((filter): filter is CollectionActiveFilter => filter !== null);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setBlockersOnly(false);
      setSortMode("priority");
    });

  useEffect(() => {
    if (!summaryOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!summaryRef.current?.contains(event.target as Node)) {
        setSummaryOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSummaryOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [summaryOpen]);

  const toolbarTools = (
    <ToolbarTools>
      <ToolbarIconButton
        label={blockersOnly ? "Фильтр: только блокеры" : "Фильтр: все подачи"}
        icon="filter"
        pressed={blockersOnly}
        onClick={() =>
          transitionUiState(() => setBlockersOnly((value) => !value))
        }
      />
      {reviewTab !== "events" ? (
        <ToolbarIconButton
          label={`Сортировка: ${submissionSortModeLabel(sortMode)}`}
          icon="sort"
          pressed={sortMode !== "priority"}
          onClick={() =>
            transitionUiState(() =>
              setSortMode((value) => nextSubmissionSortMode(value, adminSortModes)),
            )
          }
        />
      ) : null}
      <div className="v17-admin-summary-tool" ref={summaryRef}>
        <ToolbarIconButton
          label={summaryOpen ? "Скрыть сводку" : "Показать сводку"}
          icon="panel"
          pressed={summaryOpen}
          onClick={() => setSummaryOpen((value) => !value)}
        />
        {summaryOpen ? (
          <div
            className="v17-admin-summary-popover"
            role="dialog"
            aria-label="Сводка очереди"
          >
            <div className="v17-admin-summary-head">
              <strong>Сводка очереди</strong>
            </div>
            <div className="v17-admin-summary-grid">
              <div>
                <strong>{tabCounts.review}</strong>
                <span>Новая проверка</span>
              </div>
              <div>
                <strong>{tabCounts.corrections}</strong>
                <span>Исправления</span>
              </div>
              <div>
                <strong>
                  {summaryPrioritySubmission
                    ? `с ${summaryPrioritySubmission.updatedAt}`
                    : "-"}
                </strong>
                <span>Старейшая</span>
              </div>
              <div>
                <strong>{blockerSubmissions}</strong>
                <span>Блокеры</span>
              </div>
            </div>
            {summaryPrioritySubmission ? (
              <Button
                className="v17-admin-summary-action"
                variant="secondary"
                onClick={() => {
                  setSummaryOpen(false);
                  onSelect(summaryPrioritySubmission);
                  onOpen(
                    summaryPrioritySubmission,
                    adminWorkDrawerTabFor(summaryPrioritySubmission),
                  );
                }}
              >
                Проверить {summaryPrioritySubmission.title}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToolbarTools>
  );

  const renderBlockedState = (
    title: string,
    description: string,
    tone: "danger" | "warning" = "warning",
  ) => (
    <AdminWorkEmptyState
      description={description}
      iconTone={tone}
      title={title}
    />
  );

  return (
    <div
      className="v19-screen-grid v19-admin-review-screen v17-admin-work-screen is-panel-closed"
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
          Очередь администратора
        </h2>

        <CollectionToolbar
          activeFilters={activeFilters}
          ariaLabel="Инструменты работы администратора"
          cityControl={filterControl}
          className="v17-admin-work-toolbar"
          onClearActiveFilters={activeFilters.length ? resetActiveFilters : undefined}
          onTabChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
          search={searchControl}
          tabs={[
            { count: tabCounts.review, id: "review", label: "К проверке" },
            {
              count: tabCounts.corrections,
              id: "corrections",
              label: "Исправления",
            },
            { count: tabCounts.events, id: "events", label: "События" },
          ]}
          tabsAriaLabel="Рабочая очередь администратора"
          tools={toolbarTools}
          value={reviewTab}
        />

        <div className="v17-admin-work-note">
          <span>{adminWorkNoteCopy(reviewTab)}</span>
        </div>

        {permissionDenied ? (
          renderBlockedState(
            "Нет доступа к проверке",
            "Текущая роль не может выполнять административную проверку подач.",
            "danger",
          )
        ) : loading ? (
          <AdminWorkLoadingState />
        ) : error ? (
          renderBlockedState("Очередь недоступна", error, "danger")
        ) : reviewTab === "events" ? (
          visibleEvents.length ? (
            <div className="v17-admin-event-list" aria-label="События администратора">
              {visibleEvents.map((event) => (
                <AdminWorkEventRow
                  event={event}
                  key={event.id}
                  onOpen={() => {
                    onSelect(event.submission);
                    onOpen(event.submission, event.tab);
                  }}
                />
              ))}
            </div>
          ) : (
              <AdminWorkEmptyState
                description="События появятся после отправки подачи, получения исправлений или подготовки пакета."
                actionLabel="К проверке"
                title="Событий нет"
                onShow={() => onTab("review")}
              />
          )
        ) : visibleReviewList.length ? (
          <>
            <div className="v17-admin-work-list" aria-label="Очередь проверки">
              {visibleReviewList.map((submission) => (
                <AdminWorkRow
                  selected={false}
                  key={submission.id}
                  submission={submission}
                  onOpen={() => {
                    onSelect(submission);
                    onOpen(submission, adminWorkDrawerTabFor(submission));
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <AdminWorkEmptyState
            description="Новые задачи появятся после отправки подачи агентом или получения исправлений."
            actionLabel="Открыть соседнюю очередь"
            title="Очередь пуста"
            onShow={() => onTab(reviewTab === "review" ? "corrections" : "review")}
          />
        )}
        {actionSubmission ? (
          <div className="v17-admin-primary-action">
            <span>{adminReviewPriorityLine(actionSubmission)}</span>
            <Button
              aria-describedby={!canAddIssue ? "admin-return-disabled-note" : undefined}
              disabled={!canAddIssue}
              variant="secondary"
              onClick={() => onAddIssue(actionSubmission)}
            >
              Вернуть с замечанием
            </Button>
            {!canAddIssue ? (
              <em id="admin-return-disabled-note">{addIssueReason}</em>
            ) : null}
          </div>
        ) : null}
      </CardComponent>
    </div>
  );
}

function adminReviewPriorityLine(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) return `${blockers} блокера ждут точного решения`;

  const open = openIssueCount(submission);
  if (open > 0) return `${open} замечания открыты`;

  return `${statusLabels[submission.status]} · обновлено ${submission.updatedAt}`;
}

function adminWorkNoteCopy(reviewTab: AdminWorkTab) {
  if (reviewTab === "events") return "События открывают точный контекст подачи";
  if (reviewTab === "corrections") return "Сначала исправления, затем новые проверки";
  return "Очередь отсортирована по времени ожидания";
}

function AdminWorkLoadingState() {
  return (
    <div className="v17-admin-work-list" aria-busy="true" aria-label="Очередь загружается">
      {["admin-loading-1", "admin-loading-2", "admin-loading-3"].map((item) => (
        <div className="v17-admin-work-row is-loading" key={item}>
          <span className="v17-admin-entity-icon" aria-hidden="true" />
          <span className="v17-admin-identity">
            <strong />
            <em />
          </span>
          <span className="v17-admin-route-cell" />
          <span className="v17-admin-wait-cell" />
          <span className="v17-admin-readiness-cell" />
          <span className="v17-admin-stage" />
          <span className="v17-admin-row-action" />
        </div>
      ))}
    </div>
  );
}

function AdminWorkEmptyState({
  actionLabel,
  description,
  iconTone = "warning",
  onShow,
  title,
}: {
  actionLabel?: string;
  description: string;
  iconTone?: "danger" | "warning";
  onShow?: () => void;
  title: string;
}) {
  return (
    <div className={`v19-empty-state v17-admin-empty-state tone-${iconTone}`}>
      <span className="v17-admin-empty-icon" aria-hidden="true">
        <SvgIcon>
          <path d="m5 12 4 4L19 6" />
        </SvgIcon>
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onShow ? (
        <Button variant="secondary" onClick={onShow}>
          {actionLabel ?? "Открыть очередь"}
        </Button>
      ) : null}
    </div>
  );
}

function AdminWorkRow({
  onOpen,
  selected,
  submission,
}: {
  onOpen: () => void;
  selected: boolean;
  submission: Submission;
}) {
  const presentation = adminWorkPresentation(submission);
  const family = submission.type === "family";

  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={`v17-admin-work-row ${selected ? "is-selected" : ""}`}
      data-submission-card
      data-submission-id={submission.id}
      type="button"
      onClick={onOpen}
    >
      <span
        className={`v17-admin-entity-icon tone-${presentation.tone}`}
        aria-hidden="true"
      >
        <SvgIcon>
          {family ? (
            <>
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20a6 6 0 0 1 12 0" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M15 15a5 5 0 0 1 6 5" />
            </>
          ) : (
            <>
              <circle cx="12" cy="8" r="4" />
              <path d="M5 21a7 7 0 0 1 14 0" />
            </>
          )}
        </SvgIcon>
      </span>
      <span className="v17-admin-identity">
        <strong>{formatSubmissionListTitle(submission)}</strong>
        <em>
          <span className="mono">{submission.id}</span> ·{" "}
          {applicantCountLabel(submission.applicants.length)}
        </em>
        <small className="v17-admin-mobile-meta">
          {submission.city} · {applicantCountLabel(submission.applicants.length)} ·
          ждет с {submission.updatedAt}
        </small>
      </span>
      <span className="v17-admin-route-cell">
        <em>Подача</em>
        <strong>{submission.city}</strong>
        <small>{tripDates(submission)}</small>
      </span>
      <span className="v17-admin-wait-cell">
        <em>Ожидает</em>
        <strong>{adminWorkWaitLabel(submission)}</strong>
      </span>
      <span className="v17-admin-readiness-cell">
        <span>
          <em>Готовность</em>
          <strong>{submission.completeness.total}%</strong>
        </span>
        <i aria-hidden="true">
          <b style={{ width: `${submission.completeness.total}%` }} />
        </i>
      </span>
      <span className={`v17-admin-stage tone-${presentation.tone}`}>
        <i aria-hidden="true" />
        {presentation.stage}
      </span>
      <span className="v17-admin-row-action">
        <span>{adminWorkActionLabel(submission, presentation.actionLabel)}</span>
        <SvgIcon>
          <path d="m9 6 6 6-6 6" />
        </SvgIcon>
      </span>
    </button>
  );
}

function adminWorkActionLabel(submission: Submission, fallback: string) {
  if (submission.status === "submitted_for_review") return "Проверить";
  return fallback;
}

function adminWorkWaitLabel(submission: Submission) {
  if (submission.status === "submitted_for_review") return "6 ч";
  if (submission.status === "corrections_received") return "3 ч";
  if (submission.status === "ready_for_export") return "4 ч";
  return submission.updatedAt;
}

function AdminWorkEventRow({
  event,
  onOpen,
}: {
  event: InboxEvent;
  onOpen: () => void;
}) {
  return (
    <button className="v17-admin-event-row" type="button" onClick={onOpen}>
      <span
        className={`v17-admin-event-dot tone-${event.tone}`}
        aria-hidden="true"
      />
      <span className="v17-admin-event-copy">
        <strong>{adminWorkEventTitle(event.submission, event.title)}</strong>
        <em>{event.time}</em>
      </span>
      <span className="v17-admin-event-object">
        <strong>{formatSubmissionListTitle(event.submission)}</strong>
        <em>{event.context}</em>
      </span>
      <span className={`v17-admin-stage tone-${adminToneName(event.tone)}`}>
        <i aria-hidden="true" />
        {event.badge}
      </span>
      <span className="v17-admin-row-action">
        <span>{event.action}</span>
        <SvgIcon>
          <path d="m9 6 6 6-6 6" />
        </SvgIcon>
      </span>
    </button>
  );
}

function adminToneName(tone: InboxEvent["tone"]) {
  if (tone === "danger") return "danger";
  if (tone === "teal") return "success";
  if (tone === "blue") return "info";
  if (tone === "amber") return "warning";
  return "info";
}

function exportTripDates(submission: Submission) {
  const monthNames: Record<string, string> = {
    "01": "янв",
    "02": "фев",
    "03": "мар",
    "04": "апр",
    "05": "мая",
    "06": "июн",
    "07": "июл",
    "08": "авг",
    "09": "сен",
    "10": "окт",
    "11": "ноя",
    "12": "дек",
  };
  const [fromDay, fromMonth] = submission.tripDateFrom.split(".");
  const [toDay, toMonth] = submission.tripDateTo.split(".");
  const month = monthNames[toMonth ?? fromMonth] ?? toMonth ?? fromMonth;

  if (!fromDay || !toDay || !month) return tripDates(submission);
  return `${fromDay}-${toDay} ${month} 2026`;
}

function ExportGuardItem({
  detail,
  label,
  ok,
}: {
  detail?: string;
  label: string;
  ok: boolean;
}) {
  return (
    <div className={`v17-export-check ${ok ? "is-ok" : "is-fail"}`}>
      <SvgIcon>
        {ok ? (
          <path d="m5 12 4 4L19 6" />
        ) : (
          <>
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
          </>
        )}
      </SvgIcon>
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
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
    (exportBusy ? "Формируем и проверяем workbook..." : exportActionHint(exportPlan));
  const packageFacts = exportPackageFacts(exportPlan);
  const previewColumns = exportPlan.preview.headers.slice(0, 9);
  const previewRows = exportPlan.preview.rows.slice(0, 4);
  const mappingRows = exportMappingRows(exportPlan);
  const mappedCount = mappingRows.filter((row) => row.state === "mapped").length;
  const derivedCount = mappingRows.filter((row) => row.state === "derived").length;
  const unresolvedCount = mappingRows.filter((row) => row.state === "unresolved").length;
  const [exportPanelOpen, setExportPanelOpen] = useState(true);
  const [sortMode, setSortMode] = useState<SubmissionSortMode>("updated");
  const selectedExportIdSet = useMemo(
    () => new Set(selectedExportIds),
    [selectedExportIds],
  );
  const exportReadyList = useMemo(
    () => readyList.filter(isSubmissionSelectableForExport),
    [readyList],
  );
  const exportReadyIdSet = useMemo(
    () => new Set(exportReadyList.map((submission) => submission.id)),
    [exportReadyList],
  );
  const sortedReadyList = useMemo(
    () => sortSubmissionsForOperations(exportReadyList, sortMode),
    [exportReadyList, sortMode],
  );
  const sortedHistoryList = useMemo(
    () => sortSubmissionsForOperations(historyList, sortMode),
    [historyList, sortMode],
  );
  const selectedVisibleExportIds = selectedExportIds.filter((id) =>
    exportReadyIdSet.has(id),
  );
  const hiddenNotReadyCount = readyList.length - exportReadyList.length;
  const allReadySelected =
    exportReadyList.length > 0 &&
    exportReadyList.every((submission) => selectedExportIdSet.has(submission.id));
  const handleToggleAllReady = (checked: boolean) => {
    exportReadyList.forEach((submission) => {
      const selected = selectedExportIdSet.has(submission.id);
      if (checked !== selected) onToggle(submission.id);
    });
  };
  const toolbarTools = (
    <ToolbarTools>
      <ToolbarIconButton
        icon="filter"
        label="Фильтр выгрузки"
        pressed={false}
        type="button"
        onClick={() => undefined}
      />
      <ToolbarIconButton
        icon="sort"
        label={`Сортировка выгрузки: ${submissionSortModeLabel(sortMode)}`}
        pressed={sortMode !== "updated"}
        type="button"
        onClick={() =>
          setSortMode((value) => nextSubmissionSortMode(value, exportSortModes))
        }
      />
      <ToolbarIconButton
        icon="panel"
        label={exportPanelOpen ? "Контракт выгрузки открыт" : "Открыть контракт выгрузки"}
        pressed={exportPanelOpen}
        type="button"
        onClick={() => setExportPanelOpen((open) => !open)}
      />
    </ToolbarTools>
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

          <div className="v17-export-intro">
            <span>
              Preview использует структуру входного Excel-шаблона, но не создаёт файл.
            </span>
            <strong>{exportPlan.contract.columnCount} колонок в шаблоне</strong>
          </div>

          <CollectionToolbar
            ariaLabel="Инструменты выгрузки"
            cityControl={filterControl}
            className="v19-export-toolbar"
            onTabChange={onTab}
            search={searchControl}
            tabs={[
              { count: exportReadyList.length, id: "ready", label: "Готово" },
              { count: sortedHistoryList.length, id: "history", label: "История" },
            ]}
            tabsAriaLabel="Состояние выгрузки"
            tools={toolbarTools}
            value={exportTab}
          />
          {exportTab === "ready" ? (
            <div className="magic-export-list export-contract-table">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 42 }}>
                        <input
                          aria-label="Выбрать все совместимые"
                          checked={allReadySelected}
                          className="checkbox"
                          disabled={exportBusy || exportReadyList.length === 0}
                          type="checkbox"
                          onChange={(event) =>
                            handleToggleAllReady(event.currentTarget.checked)
                          }
                        />
                      </th>
                      <th>Подача</th>
                      <th>Город</th>
                      <th>Даты</th>
                      <th>Заявители</th>
                      <th>Состояние</th>
                      <th>Обновлено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedReadyList.map((submission) => {
                      const selected = selectedExportIdSet.has(submission.id);

                      return (
                        <tr
                          aria-label={`Пакет ${submission.title}${
                            selected ? ", выбран" : ""
                          }`}
                          className={`export-row magic-export-row export-contract-row ${
                            selected ? "selected is-selected" : ""
                          }`}
                          key={submission.id}
                          onClick={() => onOpen(submission)}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              aria-label={`Выбрать ${submission.title}`}
                              checked={selected}
                              className="checkbox"
                              disabled={exportBusy}
                              type="checkbox"
                              onChange={() => onToggle(submission.id)}
                            />
                          </td>
                          <td>
                            <button
                              className="export-row-main"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission);
                              }}
                            >
                              <span className="cell-title">{submission.title}</span>
                              <span className="subtle mono">{submission.id}</span>
                            </button>
                            <Button
                              className="export-table-row-action export-table-row-action-mobile"
                              variant="secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission);
                              }}
                            >
                              Смотреть пакет
                            </Button>
                          </td>
                          <td>{submission.city}</td>
                          <td>{exportTripDates(submission)}</td>
                          <td>{submission.applicants.length}</td>
                          <td>
                            <Badge className="html-builder-badge" tone="teal">
                              {exportStateLabel(submission)}
                            </Badge>
                          </td>
                          <td>
                            <span>{submission.updatedAt}</span>
                            <Button
                              className="export-table-row-action"
                              variant="secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission);
                              }}
                            >
                              Смотреть пакет
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hiddenNotReadyCount > 0 ? (
                <div className="bulk-bar v17-export-bulk-bar">
                  <span className="bulk-status">
                    Скрыто из выгрузки: {hiddenNotReadyCount}{" "}
                    {pluralRu(hiddenNotReadyCount, "подача", "подачи", "подач")} с
                    blockers или неполным пакетом.
                  </span>
                </div>
              ) : null}
              {exportReadyList.length === 0 ? (
                <EmptyState text="Нет подач готовых к выгрузке." />
              ) : null}
              {selectedVisibleExportIds.length ? (
                <div
                  className="bulk-bar v17-export-bulk-bar"
                  style={{ pointerEvents: "none" }}
                >
                  <span className="bulk-count">
                    Выбрано: {selectedVisibleExportIds.length}
                  </span>
                  <span className="bulk-status">{actionHint}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="submission-list magic-export-list">
              {sortedHistoryList.map((submission) => {
                const pdfState = returnedPdfPackageSummary(submission);

                return (
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
                      <span>{pdfState.detail}</span>
                    </Button>
                    <Badge tone="teal">Выгружено</Badge>
                    <Badge tone={pdfState.tone}>{pdfState.label}</Badge>
                    <Button
                      variant="secondary"
                      onClick={() => onOpen(submission, "files")}
                    >
                      {pdfState.actionLabel}
                    </Button>
                  </CardComponent>
                );
              })}
            </div>
          )}
        </CardComponent>

        {exportPanelOpen ? (
          <aside
            className="export-side magic-export-side v17-export-context-rail"
            aria-label="Контекст выгрузки"
          >
          <div className="v17-export-rail-head">
            <div>
              <p className="kicker">Контракт выгрузки</p>
              <h2>
                Excel · {exportPlan.contract.sheetName} {exportPlan.contract.range}
              </h2>
            </div>
            <button
              className="icon-button v17-export-close"
              type="button"
              aria-label="Закрыть панель"
              onClick={() => setExportPanelOpen(false)}
            >
              <SvgIcon>
                <path d="M6 6l12 12M18 6 6 18" />
              </SvgIcon>
            </button>
          </div>
          <div className="v17-export-rail-body">
          <CardComponent as="section" className="v17-rail-card primary">
            <div className="preview-header">
              <div>
                <p className="kicker">Текущий пакет</p>
                <h2>{exportPackageTitle(exportPlan)}</h2>
              </div>
            </div>
            <div className="v17-export-summary">
              <div className="v17-export-stat">
                <strong>{mappedCount}</strong>
                <span>mapped</span>
              </div>
              <div className="v17-export-stat">
                <strong>{unresolvedCount}</strong>
                <span>unresolved</span>
              </div>
            </div>
          </CardComponent>
          <CardComponent
            as="section"
            className="v17-rail-card export-preview magic-export-preview"
            aria-label="Предпросмотр Эксель"
            tabIndex={0}
            >
              <div
                className="excel-table export-preview-sheet"
                aria-label="Sheet1 masked preview"
                tabIndex={0}
              >
              {exportPlan.rowCount === 0 ? (
                <p className="export-preview-empty-title">Пакет не выбран</p>
              ) : null}
              <div className="sheet-head">
                <span />
                <span />
                <span />
                <strong>{exportPlan.contract.sheetName} · masked preview</strong>
              </div>
              <div
                className="excel-head"
                style={{ gridTemplateColumns: `44px repeat(${previewColumns.length}, minmax(112px, 1fr))` }}
              >
                <span>#</span>
                {previewColumns.map((header) => (
                  <span key={header}>{header}</span>
                ))}
              </div>
              {previewRows.map((row, rowIndex) => (
                <div
                  className={`excel-row ${
                    exportPlan.rows[rowIndex]?.applicantCount &&
                    exportPlan.rows[rowIndex].applicantCount > 1
                      ? "is-family"
                      : ""
                  }`}
                  key={`${exportPlan.rows[rowIndex]?.submissionId ?? "row"}-${rowIndex}`}
                  style={{ gridTemplateColumns: `44px repeat(${previewColumns.length}, minmax(112px, 1fr))` }}
                >
                  <span>{rowIndex + 1}</span>
                  {row.slice(0, previewColumns.length).map((value, cellIndex) => (
                    <span key={`${cellIndex}-${value}`}>{maskPreviewValue(value)}</span>
                  ))}
                </div>
              ))}
            </div>
            <p className="sheet-caption">
              Показаны первые 9 из 56 колонок. Один заявитель = одна строка;
              члены семьи идут последовательным блоком.
            </p>
          </CardComponent>
          <CardComponent as="section" className="v17-rail-card">
            <p className="kicker">Pre-export checks</p>
            <div className="v17-export-checks" aria-label="Проверки перед выгрузкой">
              <ExportGuardItem
                ok={exportPlan.rowCount > 0}
                label="Есть выбранные подачи"
              />
              <ExportGuardItem
                ok={!exportHasBlocker(exportPlan, "не готовые к выгрузке")}
                label="Только принятые подачи"
              />
              <ExportGuardItem
                ok={!exportHasBlocker(exportPlan, "блокирующие замечания")}
                label="Нет открытых блокеров"
              />
              <ExportGuardItem
                ok={!exportHasBlocker(exportPlan, "канонического пакета медиа")}
                label="Обязательные файлы готовы"
              />
              <ExportGuardItem
                ok={!exportHasBlocker(exportPlan, "разные города")}
                label="Один город"
                detail={`${packageFacts.city} · ${packageFacts.dates}`}
              />
              <ExportGuardItem
                ok={exportPlan.contract.valid}
                label="Все 56 колонок подтверждены"
                detail={`${exportPlan.contract.sheetName} ${exportPlan.contract.range}`}
              />
            </div>
          </CardComponent>
          <CardComponent as="section" className="v17-rail-card">
            <div className="mapping-audit" aria-label="56-column export mapping audit">
              <div className="mapping-audit-head">
                <strong>Контракт A:BD</strong>
                <span>
                  {mappedCount} mapped · {derivedCount} derived · {unresolvedCount} unresolved
                </span>
              </div>
              <div className="mapping-audit-scroll" tabIndex={0}>
                {mappingRows.map((row) => (
                  <div className="mapping-row" key={row.header}>
                    <span className="mapping-index">{row.index}</span>
                    <span className="mapping-name">{row.header}</span>
                    <span className={`mapping-state ${row.state}`}>{row.state}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardComponent>
          <div className="v17-blocker-callout blocker-box">
            <SvgIcon>
              <path d="M10.3 4.3 2.8 17.4A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.6L13.7 4.3a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </SvgIcon>
            <span>
              <strong>{exportCalloutTitle(exportPlan)}</strong>
              {exportPlan.blockers.length > 0 ? (
                exportPlan.blockers.map((blocker) => (
                  <span key={blocker.reason}>{blocker.reason}</span>
                ))
              ) : exportPlan.warnings.length > 0 ? (
                exportPlan.warnings.map((warning) => (
                  <span key={warning.reason}>{warning.reason}</span>
                ))
              ) : (
                <span>
                  Preview и workbook используют один row model; скачивание доступно
                  только после package identity proof.
                </span>
              )}
            </span>
          </div>
          <CardComponent as="section" className="v17-rail-card v17-export-actions-card">
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
                  Скачать Excel
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
            <p className="sheet-caption">
              Download запускается только для текущей verified selection; stale
              preview и row mismatch блокируются.
            </p>
          </CardComponent>
          </div>
        </aside>
        ) : null}
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

function exportMappingRows(plan: ExportSummary) {
  const derivedHeaders = new Set(["FirstName", "LastName", "Appointment Type"]);
  const unresolvedHeaders = new Set(["Visa Sub Type", "Nationality At Birth"]);

  return plan.preview.headers.map((header, index) => ({
    header,
    index: index + 1,
    state: unresolvedHeaders.has(header)
      ? "unresolved"
      : [...derivedHeaders].some((derivedHeader) => header.includes(derivedHeader))
        ? "derived"
        : "mapped",
  }));
}

function exportHasBlocker(plan: ExportSummary, text: string) {
  return plan.blockers.some((blocker) => blocker.reason.includes(text));
}

function exportCalloutTitle(plan: ExportSummary) {
  if (plan.blockers.length > 0) return "Выгрузка заблокирована fail-closed";
  if (plan.warnings.length > 0) return "Выгрузка разрешена с предупреждением";
  if (plan.ready) return "Выгрузка проходит проверки";
  return "Выберите пакет для проверки";
}

function exportStateLabel(submission: Submission) {
  if (submission.exportState === "file_generated") return "Файл сформирован";
  if (submission.exportState === "file_downloaded") return "Файл скачан";
  if (submission.exportState === "marked_exported") return "Выгружено";
  return "Готово";
}

function returnedPdfPackageSummary(submission: Submission): {
  actionLabel: string;
  detail: string;
  label: string;
  tone: "danger" | "amber" | "blue" | "teal" | "muted" | "default";
} {
  const handoffPackage = buildAgentHandoffPackage(submission);
  const firstBlocker = handoffPackage.blockers[0] ?? "";

  if (handoffPackage.ready) {
    return {
      actionLabel: "Открыть PDF",
      detail: `${handoffPackage.applicantPdfs.length} application_form_pdf · appointment_list_pdf ready`,
      label: "PDF готов",
      tone: "teal",
    };
  }

  if (firstBlocker.includes("Application PDF is missing")) {
    return {
      actionLabel: "Проверить PDF",
      detail: firstBlocker,
      label: "Нет application_form_pdf",
      tone: "amber",
    };
  }

  if (firstBlocker.includes("Common appointment/list PDF is missing")) {
    return {
      actionLabel: "Проверить PDF",
      detail: firstBlocker,
      label: "Нет appointment_list_pdf",
      tone: "amber",
    };
  }

  if (
    firstBlocker.includes("upload failed") ||
    firstBlocker.includes("was deleted") ||
    firstBlocker.includes("is not uploaded")
  ) {
    return {
      actionLabel: "Проверить PDF",
      detail: firstBlocker,
      label: "PDF не готов",
      tone: "danger",
    };
  }

  return {
    actionLabel: "Проверить PDF",
    detail: firstBlocker || "Returned PDF package требует проверки перед handoff.",
    label: "PDF проверка",
    tone: "amber",
  };
}

function maskPreviewValue(value: string) {
  if (!value) return "—";
  if (value.includes("@")) return value.replace(/(.{2}).+(@.+)/, "$1•••$2");
  if (/^\d{7,}$/.test(value)) return `${value.slice(0, 2)}•••${value.slice(-2)}`;
  return value;
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
  return `${submissions} ${pluralRu(submissions, "подача", "подачи", "подач")} · ${plan.rowCount} ${pluralRu(plan.rowCount, "заявитель", "заявителя", "заявителей")}`;
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
  return "Выберите хотя бы одну подачу";
}
