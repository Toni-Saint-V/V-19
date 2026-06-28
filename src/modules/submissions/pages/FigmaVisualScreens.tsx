import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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

type VisualStatus = "in_progress" | "ready_for_export" | "returned" | "submitted_for_review";

type VisualSubmission = {
  applicantsCount: number;
  blocker?: string;
  city: string;
  id: string;
  progress?: number;
  status: VisualStatus;
  statusLabel: string;
  title: string;
  tripDates: string;
  type: "family" | "single";
  updated: string;
};

type VisualOpenIntent = "detail" | "issues";

type VisualColumn = {
  id: string;
  label: string;
  statuses: VisualStatus[];
  tone?: "danger" | "warning";
};

type VisualMember = {
  initials: string;
  name: string;
  role: string;
  status: "in_progress" | "missing_docs" | "ready";
};

type VisualOpenHandler = (id: string, intent?: VisualOpenIntent) => void;

const visualSubmissions: VisualSubmission[] = [
  {
    applicantsCount: 4,
    blocker: "Скан паспорта не читается",
    city: "Санкт-Петербург",
    id: "SUB-1042",
    progress: 92,
    status: "returned",
    statusLabel: "Ошибки",
    title: "Семья Петровых",
    tripDates: "18–23 июл 2026",
    type: "family",
    updated: "12 мин назад",
  },
  {
    applicantsCount: 1,
    blocker: "Нет фин. гарантии",
    city: "Москва",
    id: "SUB-1057",
    progress: 64,
    status: "in_progress",
    statusLabel: "В работе",
    title: "Алина Смирнова",
    tripDates: "02–09 авг 2026",
    type: "single",
    updated: "34 мин назад",
  },
  {
    applicantsCount: 4,
    city: "Москва",
    id: "SUB-1061",
    progress: 100,
    status: "submitted_for_review",
    statusLabel: "На проверке",
    title: "Семья Орловых",
    tripDates: "11–21 авг 2026",
    type: "family",
    updated: "1 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1078",
    progress: 100,
    status: "ready_for_export",
    statusLabel: "Готово",
    title: "Дмитрий Волков",
    tripDates: "06–12 сен 2026",
    type: "single",
    updated: "2 ч назад",
  },
  {
    applicantsCount: 1,
    blocker: "Ожидается бронь отеля",
    city: "Москва",
    id: "SUB-1065",
    progress: 58,
    status: "in_progress",
    statusLabel: "Документы",
    title: "Олег Тиньков",
    tripDates: "10–18 авг 2026",
    type: "single",
    updated: "42 мин назад",
  },
  {
    applicantsCount: 3,
    blocker: "Нет фин. гарантии",
    city: "Казань",
    id: "SUB-1070",
    progress: 52,
    status: "in_progress",
    statusLabel: "Гарантия",
    title: "Семья Сидоровых",
    tripDates: "05–15 сен 2026",
    type: "family",
    updated: "1 ч назад",
  },
  {
    applicantsCount: 1,
    blocker: "Ожидает оплату сбора",
    city: "Москва",
    id: "SUB-1072",
    progress: 46,
    status: "in_progress",
    statusLabel: "Оплата",
    title: "Игорь Николаев",
    tripDates: "12–20 сен 2026",
    type: "single",
    updated: "2 ч назад",
  },
  {
    applicantsCount: 2,
    blocker: "Не заполнен раздел работы",
    city: "Самара",
    id: "SUB-1076",
    progress: 71,
    status: "returned",
    statusLabel: "Анкета",
    title: "Семья Беляевых",
    tripDates: "20–28 сен 2026",
    type: "family",
    updated: "2 ч назад",
  },
  {
    applicantsCount: 1,
    blocker: "Скан паспорта размытый",
    city: "Екатеринбург",
    id: "SUB-1088",
    progress: 68,
    status: "returned",
    statusLabel: "Паспорт",
    title: "Михаил Иванов",
    tripDates: "15–20 авг 2026",
    type: "single",
    updated: "18 мин назад",
  },
  {
    applicantsCount: 1,
    blocker: "Фото не проходит требования",
    city: "Москва",
    id: "SUB-1090",
    progress: 73,
    status: "returned",
    statusLabel: "Фото",
    title: "Анна Каренина",
    tripDates: "22–30 авг 2026",
    type: "single",
    updated: "26 мин назад",
  },
  {
    applicantsCount: 2,
    city: "Москва",
    id: "SUB-1094",
    progress: 100,
    status: "submitted_for_review",
    statusLabel: "QA",
    title: "Семья Морозовых",
    tripDates: "28 авг – 03 сен 2026",
    type: "family",
    updated: "36 мин назад",
  },
  {
    applicantsCount: 1,
    city: "Санкт-Петербург",
    id: "SUB-1062",
    progress: 100,
    status: "submitted_for_review",
    statusLabel: "Проверка",
    title: "Виктор Цой",
    tripDates: "14–21 авг 2026",
    type: "single",
    updated: "1 ч назад",
  },
  {
    applicantsCount: 5,
    city: "Москва",
    id: "SUB-1063",
    progress: 100,
    status: "submitted_for_review",
    statusLabel: "Очередь",
    title: "Семья Романовых",
    tripDates: "25 авг – 05 сен 2026",
    type: "family",
    updated: "2 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Пермь",
    id: "SUB-1067",
    progress: 100,
    status: "submitted_for_review",
    statusLabel: "SLA",
    title: "Кирилл Андреев",
    tripDates: "18–24 сен 2026",
    type: "single",
    updated: "3 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Новосибирск",
    id: "SUB-1080",
    progress: 100,
    status: "ready_for_export",
    statusLabel: "Выгрузка",
    title: "Елена Летучая",
    tripDates: "10–15 сен 2026",
    type: "single",
    updated: "3 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1081",
    progress: 100,
    status: "ready_for_export",
    statusLabel: "Архив",
    title: "Павел Дуров",
    tripDates: "15–25 сен 2026",
    type: "single",
    updated: "4 ч назад",
  },
  {
    applicantsCount: 2,
    city: "Ростов-на-Дону",
    id: "SUB-1084",
    progress: 100,
    status: "ready_for_export",
    statusLabel: "Принято",
    title: "Семья Абрамовых",
    tripDates: "01–09 окт 2026",
    type: "family",
    updated: "4 ч назад",
  },
  {
    applicantsCount: 1,
    blocker: "Черновик без паспорта",
    city: "Москва",
    id: "SUB-1097",
    progress: 21,
    status: "in_progress",
    statusLabel: "Черновик",
    title: "Мария Захарова",
    tripDates: "04–12 окт 2026",
    type: "single",
    updated: "5 ч назад",
  },
  {
    applicantsCount: 4,
    blocker: "Нужна правка анкеты",
    city: "Санкт-Петербург",
    id: "SUB-1101",
    progress: 81,
    status: "returned",
    statusLabel: "Возврат",
    title: "Семья Лариных",
    tripDates: "07–16 окт 2026",
    type: "family",
    updated: "5 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1104",
    progress: 100,
    status: "ready_for_export",
    statusLabel: "Готов",
    title: "Никита Павлов",
    tripDates: "11–18 окт 2026",
    type: "single",
    updated: "6 ч назад",
  },
];

const visualColumnSubmissions: VisualSubmission[] = visualSubmissions;

const visualColumns: VisualColumn[] = [
  {
    id: "docs",
    label: "Сбор документов",
    statuses: ["in_progress"],
    tone: "warning",
  },
  {
    id: "errors",
    label: "Ошибки",
    statuses: ["returned"],
    tone: "danger",
  },
  {
    id: "review",
    label: "На проверке",
    statuses: ["submitted_for_review"],
  },
  {
    id: "ready",
    label: "Готово к выгрузке",
    statuses: ["ready_for_export"],
  },
];

function familyMembers(
  mainInitials: string,
  mainName: string,
  spouseInitials: string,
  spouseName: string,
  childInitials: string,
  childName: string,
  childStatus: VisualMember["status"] = "ready",
) {
  return [
    { initials: mainInitials, name: mainName, role: "Основной", status: "ready" },
    { initials: spouseInitials, name: spouseName, role: "Супруга", status: "ready" },
    { initials: childInitials, name: childName, role: "Ребенок", status: childStatus },
  ] satisfies VisualMember[];
}

const visualFamilies = [
  {
    id: "FAM-001",
    lastActivity: "12 авг 2026",
    members: [
      { initials: "ИП", name: "Иван Петров", role: "Основной", status: "ready" },
      { initials: "АП", name: "Анна Петрова", role: "Супруга", status: "ready" },
      { initials: "МП", name: "Максим Петров", role: "Ребенок", status: "in_progress" },
      { initials: "МП", name: "Мария Петрова", role: "Ребенок", status: "missing_docs" },
    ] satisfies VisualMember[],
    submissionsCount: 2,
    title: "Семья Петровых",
  },
  {
    id: "FAM-002",
    lastActivity: "Вчера",
    members: [
      { initials: "СО", name: "Сергей Орлов", role: "Основной", status: "ready" },
      { initials: "МО", name: "Марина Орлова", role: "Супруга", status: "ready" },
      { initials: "ДО", name: "Дмитрий Орлов", role: "Ребенок", status: "ready" },
    ] satisfies VisualMember[],
    submissionsCount: 1,
    title: "Семья Орловых",
  },
  {
    id: "FAM-003",
    lastActivity: "Сегодня",
    members: familyMembers("АС", "Алексей Сидоров", "ЕС", "Елена Сидорова", "МС", "Мила Сидорова", "in_progress"),
    submissionsCount: 1,
    title: "Семья Сидоровых",
  },
  {
    id: "FAM-004",
    lastActivity: "20 авг 2026",
    members: familyMembers("ДР", "Денис Романов", "НР", "Наталья Романова", "АР", "Артем Романов"),
    submissionsCount: 3,
    title: "Семья Романовых",
  },
  {
    id: "FAM-005",
    lastActivity: "Вчера",
    members: familyMembers("ИМ", "Игорь Морозов", "ОМ", "Ольга Морозова", "КМ", "Кирилл Морозов", "missing_docs"),
    submissionsCount: 2,
    title: "Семья Морозовых",
  },
  {
    id: "FAM-006",
    lastActivity: "25 авг 2026",
    members: familyMembers("ПБ", "Петр Беляев", "АБ", "Анна Беляева", "СБ", "София Беляева"),
    submissionsCount: 1,
    title: "Семья Беляевых",
  },
  {
    id: "FAM-007",
    lastActivity: "28 авг 2026",
    members: familyMembers("ВА", "Виктор Абрамов", "МА", "Мария Абрамова", "ТА", "Тимур Абрамов"),
    submissionsCount: 2,
    title: "Семья Абрамовых",
  },
  {
    id: "FAM-008",
    lastActivity: "1 сен 2026",
    members: familyMembers("НЛ", "Николай Ларин", "ЕЛ", "Екатерина Ларина", "АЛ", "Алиса Ларина", "in_progress"),
    submissionsCount: 4,
    title: "Семья Лариных",
  },
  {
    id: "FAM-009",
    lastActivity: "3 сен 2026",
    members: familyMembers("АК", "Андрей Крылов", "ЮК", "Юлия Крылова", "МК", "Марк Крылов"),
    submissionsCount: 1,
    title: "Семья Крыловых",
  },
  {
    id: "FAM-010",
    lastActivity: "5 сен 2026",
    members: familyMembers("СР", "Сергей Рыбаков", "ИР", "Ирина Рыбакова", "ВР", "Вера Рыбакова", "missing_docs"),
    submissionsCount: 2,
    title: "Семья Рыбаковых",
  },
];

const visualIndividuals = [
  {
    id: "IND-001",
    initials: "АС",
    lastActivity: "Сегодня",
    name: "Алина Смирнова",
    status: "in_progress" as const,
    submissionsCount: 1,
  },
  {
    id: "IND-002",
    initials: "ДВ",
    lastActivity: "5 авг 2026",
    name: "Дмитрий Волков",
    status: "ready" as const,
    submissionsCount: 3,
  },
  {
    id: "IND-003",
    initials: "МИ",
    lastActivity: "Сегодня",
    name: "Михаил Иванов",
    status: "missing_docs" as const,
    submissionsCount: 1,
  },
  {
    id: "IND-004",
    initials: "АК",
    lastActivity: "Вчера",
    name: "Анна Каренина",
    status: "missing_docs" as const,
    submissionsCount: 2,
  },
  {
    id: "IND-005",
    initials: "ВЦ",
    lastActivity: "14 авг 2026",
    name: "Виктор Цой",
    status: "ready" as const,
    submissionsCount: 1,
  },
  {
    id: "IND-006",
    initials: "ЕЛ",
    lastActivity: "18 авг 2026",
    name: "Елена Летучая",
    status: "ready" as const,
    submissionsCount: 1,
  },
  {
    id: "IND-007",
    initials: "ПД",
    lastActivity: "22 авг 2026",
    name: "Павел Дуров",
    status: "ready" as const,
    submissionsCount: 2,
  },
  {
    id: "IND-008",
    initials: "НП",
    lastActivity: "26 авг 2026",
    name: "Никита Павлов",
    status: "ready" as const,
    submissionsCount: 1,
  },
  {
    id: "IND-009",
    initials: "ОТ",
    lastActivity: "30 авг 2026",
    name: "Олег Тиньков",
    status: "in_progress" as const,
    submissionsCount: 1,
  },
  {
    id: "IND-010",
    initials: "МЗ",
    lastActivity: "4 сен 2026",
    name: "Мария Захарова",
    status: "in_progress" as const,
    submissionsCount: 1,
  },
];

function statusDot(status: VisualStatus) {
  if (status === "returned") return "vf-figma-dot-warning";
  if (status === "in_progress") return "vf-figma-dot-blue";
  if (status === "submitted_for_review") return "vf-figma-dot-indigo";
  return "vf-figma-dot-green";
}

function statusBadge(item: VisualSubmission) {
  if (item.status === "returned") {
    return (
      <span className="vf-figma-status is-warning">
        <AlertCircle aria-hidden="true" size={15} />
        {item.statusLabel}
      </span>
    );
  }

  if (item.status === "in_progress") {
    return (
      <span className="vf-figma-status is-blue">
        <Clock aria-hidden="true" size={15} />
        {item.statusLabel}
      </span>
    );
  }

  if (item.status === "submitted_for_review") {
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

function blockerLabel(item: VisualSubmission) {
  if (item.blocker) return item.blocker;
  if (item.status === "returned") return "Скан паспорта не читается";
  if (item.status === "in_progress") return "Нет фин. гарантии";
  return "";
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

function visualOpenIntent(item: VisualSubmission): VisualOpenIntent {
  return item.status === "returned" ? "issues" : "detail";
}

function visualActionLabel(item: VisualSubmission) {
  return item.status === "returned" ? "Исправить" : "Открыть";
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
  viewMode,
  onViewMode,
}: {
  onViewMode: (mode: "columns" | "list") => void;
  viewMode: "columns" | "list";
}) {
  const [filterOpen, setFilterOpen] = useState(false);

  function chooseViewMode(mode: "columns" | "list") {
    onViewMode(mode);
    setFilterOpen(false);
  }

  return (
    <div className="vf-figma-actions-toolbar">
      <div className="vf-figma-tabs" aria-label="Фильтры действий">
        <button className="is-active" type="button">
          Все действия <span>20</span>
        </button>
        <button type="button">
          Ошибки <span>5</span>
        </button>
        <button type="button">
          На проверке <span>4</span>
        </button>
      </div>

      <div className="vf-figma-tools">
        <div className="vf-figma-search">
          <Search aria-hidden="true" size={20} />
          <input aria-label="Поиск" placeholder="Поиск..." type="text" />
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
  item: VisualSubmission;
  onOpen?: VisualOpenHandler;
}) {
  return (
    <div
      className="vf-figma-action-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(item.id, "detail")}
      onKeyDown={(event) => activateKeyboardCard(event, () => onOpen?.(item.id, "detail"))}
    >
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
          {item.type === "family" ? `${item.applicantsCount} заявителя` : "1 заявитель"}
        </em>
      </span>
      <span className="vf-figma-action-dates">
        <strong>{item.tripDates}</strong>
        <em>Даты поездки</em>
      </span>
      <span className="vf-figma-action-status">{statusBadge(item)}</span>
      <button
        className="vf-figma-open-button"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.(item.id, visualOpenIntent(item));
        }}
      >
        {visualActionLabel(item)}
      </button>
    </div>
  );
}

function ColumnCard({
  item,
  onOpen,
}: {
  item: VisualSubmission;
  onOpen?: VisualOpenHandler;
}) {
  const blocker = blockerLabel(item);

  return (
    <button
      className="vf-figma-column-card"
      type="button"
      onClick={() => onOpen?.(item.id, "detail")}
    >
      {item.status === "returned" ? <span className="vf-figma-card-rail is-danger" /> : null}
      {item.status === "in_progress" ? <span className="vf-figma-card-rail is-warning" /> : null}
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
        {blocker ? (
          <span className={item.status === "returned" ? "is-danger" : "is-warning"}>
            <AlertCircle aria-hidden="true" size={15} />
            {blocker}
          </span>
        ) : (
          <>
            <span className="vf-figma-progress">
              <span style={{ width: `${item.progress ?? 100}%` }} />
            </span>
            <em>{item.progress ?? 100}%</em>
          </>
        )}
      </span>
    </button>
  );
}

export function FigmaActionQueueVisual({
  onOpen,
}: {
  onOpen?: VisualOpenHandler;
}) {
  const [viewMode, setViewMode] = useState<"columns" | "list">("list");
  const screenRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    screenRef.current?.scrollTo({ top: 0, left: 0 });
  }, [viewMode]);

  return (
    <section
      ref={screenRef}
      className="vf-figma-screen vf-figma-actions-screen"
      aria-label="Мои действия"
    >
      <VisualToolbar viewMode={viewMode} onViewMode={setViewMode} />

      <div className={`vf-figma-view-stage is-${viewMode}`} key={viewMode}>
        {viewMode === "list" ? (
          <div className="vf-figma-action-list">
            <div className="vf-figma-section-rule">
              <span aria-hidden="true" />
              <strong>Сегодня</strong>
              <span aria-hidden="true" />
            </div>
            {visualSubmissions.map((item) => (
              <ListRow item={item} key={item.id} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="vf-figma-column-board">
            {visualColumns.map((column) => {
              const items = visualColumnSubmissions.filter((item) =>
                column.statuses.includes(item.status),
              );

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
                    {items.map((item) => (
                      <ColumnCard item={item} key={item.id} onOpen={onOpen} />
                    ))}
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
}: {
  onOpen?: VisualOpenHandler;
}) {
  return (
    <section className="vf-figma-screen vf-figma-applicants-screen" aria-label="Мои подачи">
      <div className="vf-figma-applicants-section">
        <h2>Семьи</h2>
        <div className="vf-figma-family-grid">
          {visualFamilies.map((family) => (
            <article
              className="vf-figma-family-card"
              key={family.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen?.(family.id)}
              onKeyDown={(event) =>
                activateKeyboardCard(event, () => onOpen?.(family.id))
              }
            >
              <span className="vf-figma-family-head">
                <span className="vf-figma-family-icon">
                  <Users aria-hidden="true" size={26} />
                </span>
                <span>
                  <strong>{family.title}</strong>
                  <em>{family.members.length} человека</em>
                </span>
              </span>
              <span className="vf-figma-member-list">
                {family.members.map((member) => (
                  <button
                    className="vf-figma-member-row"
                    key={`${family.id}-${member.name}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen?.(family.id);
                    }}
                  >
                    <em>{member.initials}</em>
                    <strong>{member.name}</strong>
                    <small>{member.role}</small>
                    {memberStatusIcon(member.status)}
                  </button>
                ))}
              </span>
              <span className="vf-figma-family-footer">
                <span>Акт: {family.lastActivity}</span>
                <em>
                  <Folder aria-hidden="true" size={17} />
                  {family.submissionsCount} пакета
                </em>
              </span>
            </article>
          ))}
        </div>
      </div>

      <div className="vf-figma-applicants-divider" />

      <div className="vf-figma-applicants-section">
        <h2>Одиночные профили</h2>
        <div className="vf-figma-individual-grid">
          {visualIndividuals.map((individual) => (
            <button
              className="vf-figma-individual-card"
              key={individual.id}
              type="button"
              onClick={() => onOpen?.(individual.id)}
            >
              <span className="vf-figma-avatar">{individual.initials}</span>
              <span>
                <strong>{individual.name}</strong>
                <em>{memberStatusIcon(individual.status)} Профиль готов</em>
              </span>
              <span className="vf-figma-family-footer">
                <span>Акт: {individual.lastActivity}</span>
                <em>
                  <Folder aria-hidden="true" size={17} />
                  {individual.submissionsCount} пакета
                </em>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
