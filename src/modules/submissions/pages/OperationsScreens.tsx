import { useMemo, useState, type ReactNode } from "react";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import type { ExportSummary } from "../exportRules";
import { counts, tripDates } from "../selectors";
import {
  canAddAdminIssue,
  typeLabels,
} from "../status";
import type { DrawerTab, Submission } from "../types";
import type { ExportTab, ReviewTab } from "../uiTypes";
import {
  EmptyState,
  PanelHeader,
  SummaryRow,
} from "../components/Primitives";
import { SubmissionList } from "../components/SubmissionList";

function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function adminIssueUnavailableReason(submission: Submission) {
  if (submission.status === "ready_for_export")
    return "Пакет уже принят. Новое замечание доступно только до принятия.";
  if (submission.status === "exported")
    return "Подача уже выгружена. Возврат из истории не выполняется.";
  return "Возврат доступен только для подач на проверке или после исправлений.";
}

type InboxEvent = {
  action: string;
  badge: string;
  context: string;
  icon: string;
  id: string;
  needsAction: boolean;
  read: boolean;
  submission: Submission;
  tab: DrawerTab;
  time: string;
  title: string;
  tone: "amber" | "blue" | "danger" | "muted" | "teal";
};

export function AgentInboxScreen({
  onOpen,
  searchControl,
  submissions,
  summary,
}: {
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
      buildAgentInboxEvents(submissions).map((event) => ({
        ...event,
        read: event.read || readEventIds.has(event.id),
      })),
    [readEventIds, submissions],
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

  return (
    <div
      className={`v19-screen-grid v19-inbox-screen ${
        panelOpen ? "" : "is-panel-closed"
      } ${comfortableView ? "is-comfortable" : "is-compact"}`}
    >
      <CardComponent
        as="section"
        className="v19-collection-panel"
        aria-labelledby="agent-inbox-title"
      >
        <h2 id="agent-inbox-title" className="sr-only">
          Входящие
        </h2>

        <div className="v19-collection-toolbar" aria-label="Инструменты входящих">
          <div className="v19-state-tabs" role="tablist" aria-label="Состояние событий">
            <button
              aria-selected={activeTab === "unread"}
              className={activeTab === "unread" ? "is-active" : ""}
              role="tab"
              type="button"
              onClick={() => setActiveTab("unread")}
            >
              Непрочитанные
              <span>{unreadCount}</span>
            </button>
            <button
              aria-selected={activeTab === "all"}
              className={activeTab === "all" ? "is-active" : ""}
              role="tab"
              type="button"
              onClick={() => setActiveTab("all")}
            >
              Все
            </button>
          </div>
          {searchControl}
          <div className="v19-toolbar-tools">
            <InboxToolButton
              label={
                actionOnly
                  ? "Фильтр: только требующие действия"
                  : "Фильтр: все события"
              }
              icon="filter"
              pressed={actionOnly}
              onClick={() => setActionOnly((value) => !value)}
            />
            <InboxToolButton
              label={comfortableView ? "Вид: комфортный" : "Вид: компактный"}
              icon="view"
              pressed={!comfortableView}
              onClick={() => setComfortableView((value) => !value)}
            />
            <InboxToolButton
              label={
                sortOrder === "newest"
                  ? "Сортировка: новые сверху"
                  : "Сортировка: старые сверху"
              }
              icon="sort"
              pressed={sortOrder === "oldest"}
              onClick={() =>
                setSortOrder((value) => (value === "newest" ? "oldest" : "newest"))
              }
            />
            <InboxToolButton
              label={panelOpen ? "Панель: показана" : "Панель: скрыта"}
              icon="panel"
              pressed={panelOpen}
              onClick={() => setPanelOpen((value) => !value)}
            />
          </div>
        </div>

        {activeFilterLabels.length ? (
          <div className="v19-active-filters" aria-label="Активные фильтры">
            {activeFilterLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        ) : null}

        {visibleEvents.length ? (
          <div className="v19-event-list" aria-label="Список входящих событий">
            {eventGroups.map((group) => (
              <div className="v19-event-group" key={group.label}>
                <div className="v19-group-label">{group.label}</div>
                {group.events.map((event) => (
                  <button
                    className={`v19-event-row ${
                      event.read ? "is-read" : "is-unread"
                    }`}
                    key={event.id}
                    type="button"
                    onClick={() => openEvent(event)}
                  >
                    <span className="v19-unread-dot" aria-hidden="true" />
                    <span
                      className={`v19-event-icon tone-${event.tone}`}
                      aria-hidden="true"
                    >
                      <InboxEventIcon icon={event.icon} />
                    </span>
                    <span className="v19-event-main">
                      <strong>{event.title}</strong>
                      <em>
                        {event.context} · {event.time}
                      </em>
                    </span>
                    <Badge tone={event.tone}>{event.badge}</Badge>
                    <span className="v19-event-action">{event.action}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="v19-empty-state">
            <h3>Новых событий нет</h3>
            <p>Здесь появятся изменения, которые требуют вашего внимания.</p>
            <Button variant="secondary" onClick={() => setActiveTab("all")}>
              Показать все
            </Button>
          </div>
        )}
      </CardComponent>

      {panelOpen ? (
        <CardComponent
          as="aside"
          className="v19-context-panel"
          aria-label="Сводка входящих"
        >
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
          {nextEvent ? (
            <div className="v19-next-card">
              <span>Следующее действие</span>
              <strong>{nextEvent.action}</strong>
              <p>{nextEvent.submission.title}</p>
              <Button variant="primary" onClick={() => openEvent(nextEvent)}>
                {nextEvent.action}
              </Button>
            </div>
          ) : null}
        </CardComponent>
      ) : null}
    </div>
  );
}

function InboxToolButton({
  icon,
  label,
  onClick,
  pressed,
}: {
  icon: "filter" | "panel" | "sort" | "view";
  label: string;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <Button
      className="v19-toolbar-icon"
      variant="icon"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      <ToolbarIcon icon={icon} />
    </Button>
  );
}

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      {children}
    </svg>
  );
}

function ToolbarIcon({ icon }: { icon: "filter" | "panel" | "sort" | "view" }) {
  if (icon === "filter") {
    return (
      <SvgIcon>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </SvgIcon>
    );
  }

  if (icon === "view") {
    return (
      <SvgIcon>
        <path d="M4 6.5h16" />
        <path d="M4 12h16" />
        <path d="M4 17.5h16" />
      </SvgIcon>
    );
  }

  if (icon === "sort") {
    return (
      <SvgIcon>
        <path d="M8 5v14" />
        <path d="m5 8 3-3 3 3" />
        <path d="M16 19V5" />
        <path d="m13 16 3 3 3-3" />
      </SvgIcon>
    );
  }

  return (
    <SvgIcon>
      <path d="M5 5h14v14H5V5Z" />
      <path d="M14 5v14" />
    </SvgIcon>
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
      tab: "media",
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
  agentList,
  filterControl,
  onOpen,
  onSelect,
  searchControl,
  visibleSubmission,
  summary,
}: {
  agentList: Submission[];
  filterControl?: ReactNode;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
  summary: ReturnType<typeof counts>;
}) {
  return (
    <div className="main-grid core-list-grid">
      <CardComponent
        as="section"
        className="submission-panel"
        aria-labelledby="agent-title"
      >
        <PanelHeader
          action={
            <Button
              disabled={!visibleSubmission}
              variant="secondary"
              onClick={() => visibleSubmission && onOpen(visibleSubmission)}
            >
              Открыть выбранную
            </Button>
          }
          eyebrow="Подачи"
          titleId="agent-title"
          title="Рабочий список"
          description={`${summary.requiresAction} требуют действия · ${summary.inReview} на проверке`}
          search={searchControl}
          side={filterControl}
        />
        <SubmissionList
          activeSubmission={visibleSubmission}
          empty="В этой вкладке нет подач."
          onOpen={onOpen}
          onSelect={onSelect}
          role="agent"
          submissions={agentList}
        />
      </CardComponent>
    </div>
  );
}

export function AdminReviewScreen({
  filterControl,
  onAddIssue,
  onOpen,
  onSelect,
  onTab,
  reviewList,
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
  reviewTab: ReviewTab;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
}) {
  const canAddIssue = Boolean(
    visibleSubmission && canAddAdminIssue(visibleSubmission, "admin"),
  );
  const addIssueReason = canAddIssue
    ? ""
    : visibleSubmission
      ? adminIssueUnavailableReason(visibleSubmission)
      : "В этой вкладке нет видимой подачи для действия.";
  return (
    <div className="main-grid core-list-grid admin-review-grid">
      <CardComponent
        as="section"
        className="submission-panel magic-admin-queue"
        aria-labelledby="review-title"
      >
        <PanelHeader
          action={
            <div className="core-header-actions">
              <Button
                disabled={!visibleSubmission}
                variant="secondary"
                onClick={() => visibleSubmission && onOpen(visibleSubmission)}
              >
                Открыть выбранную
              </Button>
              <Button
                aria-describedby={!canAddIssue ? "admin-return-disabled-note" : undefined}
                disabled={!canAddIssue}
                variant="secondary"
                onClick={() => visibleSubmission && onAddIssue(visibleSubmission)}
              >
                Вернуть
              </Button>
            </div>
          }
          eyebrow="Проверка"
          titleId="review-title"
          title="Рабочий список"
          description={canAddIssue ? "Возврат только с точным замечанием" : addIssueReason}
          tabs={[
            ["all", "Все"],
            ["review", "На проверке"],
            ["corrections", "Исправления"],
            ["ready", "К выгрузке"],
          ]}
          search={searchControl}
          side={filterControl}
          value={reviewTab}
          onTab={onTab}
        />
        {!canAddIssue ? (
          <p className="action-disabled-note" id="admin-return-disabled-note">
            {addIssueReason}
          </p>
        ) : null}
        <SubmissionList
          activeSubmission={visibleSubmission}
          empty="Очередь проверки пуста."
          onOpen={onOpen}
          onSelect={onSelect}
          role="admin"
          submissions={reviewList}
        />
      </CardComponent>
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
    (exportBusy ? "Фиксируем выгрузку..." : exportActionHint(exportPlan));
  const packageFacts = exportPackageFacts(exportPlan);

  return (
    <>
      <div className="export-grid magic-export-stage">
        <CardComponent
          as="section"
          className="submission-panel magic-export-queue"
          aria-labelledby="export-title"
        >
          <PanelHeader
            eyebrow="Выгрузка"
            titleId="export-title"
            title="Пакеты для Excel"
            description="Готовые пакеты и история выгрузки"
            tabs={[
              ["ready", "Готовы"],
              ["history", "История"],
            ]}
            search={searchControl}
            side={filterControl}
            value={exportTab}
            onTab={onTab}
          />
          {exportTab === "ready" ? (
            <div className="submission-list magic-export-list">
              {readyList.map((submission) => (
                <CardComponent
                  as="article"
                  className="export-row magic-export-row"
                  key={submission.id}
                >
                  <label className="export-check">
                    <input
                      checked={selectedExportIds.includes(submission.id)}
                      type="checkbox"
                      onChange={() => onToggle(submission.id)}
                    />
                    <span className="sr-only">Выбрать подачу</span>
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
              ))}
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
                  <Badge className="visa-tag visa-tag-ready">Выгружено</Badge>
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
              <Badge
                className={
                  exportPlan.ready
                    ? "visa-tag visa-tag-ready"
                    : "visa-tag visa-tag-danger"
                }
              >
                {exportPlan.ready
                  ? exportStateLabel(exportPlan.exportState)
                  : "Блокировано"}
              </Badge>
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
            <div
              className="export-actions"
              aria-busy={exportBusy}
              aria-describedby="export-action-hint"
            >
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
            <p className="export-action-hint" id="export-action-hint">
              {actionHint}
            </p>
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
