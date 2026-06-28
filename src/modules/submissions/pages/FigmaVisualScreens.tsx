import { useState } from "react";
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
  city: string;
  id: string;
  status: VisualStatus;
  title: string;
  tripDates: string;
  type: "family" | "single";
  updated: string;
};

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

const visualSubmissions: VisualSubmission[] = [
  {
    applicantsCount: 4,
    city: "Санкт-Петербург",
    id: "SUB-1042",
    status: "returned",
    title: "Семья Петровых",
    tripDates: "18–23 июл 2026",
    type: "family",
    updated: "12 мин назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1057",
    status: "in_progress",
    title: "Алина Смирнова",
    tripDates: "02–09 авг 2026",
    type: "single",
    updated: "34 мин назад",
  },
  {
    applicantsCount: 4,
    city: "Москва",
    id: "SUB-1061",
    status: "submitted_for_review",
    title: "Семья Орловых",
    tripDates: "11–21 авг 2026",
    type: "family",
    updated: "1 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1078",
    status: "ready_for_export",
    title: "Дмитрий Волков",
    tripDates: "06–12 сен 2026",
    type: "single",
    updated: "2 ч назад",
  },
];

const visualColumnSubmissions: VisualSubmission[] = [
  visualSubmissions[1],
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1065",
    status: "in_progress",
    title: "Олег Тиньков",
    tripDates: "10–18 авг 2026",
    type: "single",
    updated: "42 мин назад",
  },
  {
    applicantsCount: 3,
    city: "Казань",
    id: "SUB-1070",
    status: "in_progress",
    title: "Семья Сидоровых",
    tripDates: "05–15 сен 2026",
    type: "family",
    updated: "1 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1072",
    status: "in_progress",
    title: "Игорь Николаев",
    tripDates: "12–20 сен 2026",
    type: "single",
    updated: "2 ч назад",
  },
  visualSubmissions[0],
  {
    applicantsCount: 1,
    city: "Екатеринбург",
    id: "SUB-1088",
    status: "returned",
    title: "Михаил Иванов",
    tripDates: "15–20 авг 2026",
    type: "single",
    updated: "18 мин назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1090",
    status: "returned",
    title: "Анна Каренина",
    tripDates: "22–30 авг 2026",
    type: "single",
    updated: "26 мин назад",
  },
  visualSubmissions[2],
  {
    applicantsCount: 1,
    city: "Санкт-Петербург",
    id: "SUB-1062",
    status: "submitted_for_review",
    title: "Виктор Цой",
    tripDates: "14–21 авг 2026",
    type: "single",
    updated: "1 ч назад",
  },
  {
    applicantsCount: 5,
    city: "Москва",
    id: "SUB-1063",
    status: "submitted_for_review",
    title: "Семья Романовых",
    tripDates: "25 авг – 05 сен 2026",
    type: "family",
    updated: "2 ч назад",
  },
  visualSubmissions[3],
  {
    applicantsCount: 1,
    city: "Новосибирск",
    id: "SUB-1080",
    status: "ready_for_export",
    title: "Елена Летучая",
    tripDates: "10–15 сен 2026",
    type: "single",
    updated: "3 ч назад",
  },
  {
    applicantsCount: 1,
    city: "Москва",
    id: "SUB-1081",
    status: "ready_for_export",
    title: "Павел Дуров",
    tripDates: "15–25 сен 2026",
    type: "single",
    updated: "4 ч назад",
  },
];

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
];

function statusDot(status: VisualStatus) {
  if (status === "returned") return "vf-figma-dot-warning";
  if (status === "in_progress") return "vf-figma-dot-blue";
  if (status === "submitted_for_review") return "vf-figma-dot-indigo";
  return "vf-figma-dot-green";
}

function statusBadge(status: VisualStatus) {
  if (status === "returned") {
    return (
      <span className="vf-figma-status is-warning">
        <AlertCircle aria-hidden="true" size={15} />
        Ошибки
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span className="vf-figma-status is-blue">
        <Clock aria-hidden="true" size={15} />
        В работе
      </span>
    );
  }

  if (status === "submitted_for_review") {
    return (
      <span className="vf-figma-status is-indigo">
        <Clock aria-hidden="true" size={15} />
        На проверке
      </span>
    );
  }

  return (
    <span className="vf-figma-status is-green">
      <CheckCircle2 aria-hidden="true" size={15} />
      Готово
    </span>
  );
}

function blockerLabel(status: VisualStatus) {
  if (status === "returned") return "Скан паспорта не читается";
  if (status === "in_progress") return "Нет фин. гарантии";
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

function VisualToolbar({
  viewMode,
  onViewMode,
}: {
  onViewMode: (mode: "columns" | "list") => void;
  viewMode: "columns" | "list";
}) {
  return (
    <div className="vf-figma-actions-toolbar">
      <div className="vf-figma-tabs" aria-label="Фильтры действий">
        <button className="is-active" type="button">
          Все действия
        </button>
        <button type="button">
          Ошибки <span>3</span>
        </button>
        <button type="button">На проверке</button>
      </div>

      <div className="vf-figma-tools">
        <div className="vf-figma-search">
          <Search aria-hidden="true" size={20} />
          <input aria-label="Поиск" placeholder="Поиск..." type="text" />
        </div>
        <button className="vf-figma-icon-button" aria-label="Фильтр" type="button">
          <Filter aria-hidden="true" size={21} />
        </button>
        <div className="vf-figma-view-toggle" aria-label="Вид очереди">
          <button
            className={viewMode === "list" ? "is-active" : ""}
            type="button"
            onClick={() => onViewMode("list")}
          >
            Список
          </button>
          <button
            className={viewMode === "columns" ? "is-active" : ""}
            type="button"
            onClick={() => onViewMode("columns")}
          >
            Колонки
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
  item: VisualSubmission;
  onOpen?: (id: string) => void;
}) {
  return (
    <button
      className="vf-figma-action-row"
      type="button"
      onClick={() => onOpen?.(item.id)}
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
      <span className="vf-figma-action-status">{statusBadge(item.status)}</span>
      <span className="vf-figma-open-button">Открыть</span>
    </button>
  );
}

function ColumnCard({
  item,
  onOpen,
}: {
  item: VisualSubmission;
  onOpen?: (id: string) => void;
}) {
  const blocker = blockerLabel(item.status);

  return (
    <button className="vf-figma-column-card" type="button" onClick={() => onOpen?.(item.id)}>
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
              <span style={{ width: `${item.status === "submitted_for_review" ? 100 : 100}%` }} />
            </span>
            <em>100%</em>
          </>
        )}
      </span>
    </button>
  );
}

export function FigmaActionQueueVisual({
  onOpen,
}: {
  onOpen?: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<"columns" | "list">("list");

  return (
    <section className="vf-figma-screen vf-figma-actions-screen" aria-label="Мои действия">
      <VisualToolbar viewMode={viewMode} onViewMode={setViewMode} />

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
    </section>
  );
}

export function FigmaApplicantsVisual({
  onOpen,
}: {
  onOpen?: (id: string) => void;
}) {
  return (
    <section className="vf-figma-screen vf-figma-applicants-screen" aria-label="Заявители и Семьи">
      <div className="vf-figma-applicants-section">
        <h2>Семьи</h2>
        <div className="vf-figma-family-grid">
          {visualFamilies.map((family) => (
            <button
              className="vf-figma-family-card"
              key={family.id}
              type="button"
              onClick={() => onOpen?.(family.id)}
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
                  <span className="vf-figma-member-row" key={`${family.id}-${member.name}`}>
                    <em>{member.initials}</em>
                    <strong>{member.name}</strong>
                    <small>{member.role}</small>
                    {memberStatusIcon(member.status)}
                  </span>
                ))}
              </span>
              <span className="vf-figma-family-footer">
                <span>Акт: {family.lastActivity}</span>
                <em>
                  <Folder aria-hidden="true" size={17} />
                  {family.submissionsCount} пакета
                </em>
              </span>
            </button>
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
