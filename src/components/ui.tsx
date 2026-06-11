import { useState, type ReactNode } from "react";
import type {
  Applicant,
  AppointmentStatus,
  MediaSlot,
  MediaRowData,
  MediaSlotType,
  Role,
  Screen,
  StatusGroup,
  Submission,
  Tone,
} from "../types/domain";
import type { AiHelperResult } from "../services/aiHelperService";
import type { ExportRow } from "../services/exportService";
import { buildAdminReviewSummary } from "../services/aiHelperService";
import {
  applicantCountLabel,
  applicantFieldCompletion,
  applicantReadiness,
  appointmentMeta,
  blockers,
  countByGroup,
  ensureMediaSlots,
  familySuggestion,
  mediaLifecycleCounts,
  mediaMeta,
  nextAction,
  readiness,
  requiredApplicantFields,
  roleProfile,
  screenNames,
  statusGroupMeta,
  statusGroups,
  statusMeta,
  submissionPreflight,
  typeLabel,
} from "../lib/workflow";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  full?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function Button({
  children,
  variant = "secondary",
  full = false,
  type = "button",
  onClick,
  className = "",
  disabled = false,
}: ButtonProps) {
  return (
    <button
      className={`btn ${variant} ${full ? "full" : ""} ${className}`.trim()}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  tone = "neutral",
  title,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <span className={`chip ${tone} ${className}`.trim()} title={title}>
      {children}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function StatusChip({ status }: { status: Submission["status"] }) {
  const exact = statusMeta[status];
  return (
    <Chip tone={exact.tone} title={exact.label} className="status-chip">
      {exact.label}
    </Chip>
  );
}

export function AppointmentChip({ status }: { status: AppointmentStatus }) {
  const meta = appointmentMeta[status];
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

export function MediaChip({ row }: { row: MediaRowData }) {
  const meta = mediaMeta[row.state];
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

export function AiHelperPanel({ result }: { result: AiHelperResult }) {
  return (
    <section className="ai-helper-panel" aria-label="AI helper">
      <div className="section-head">
        <div>
          <h2>AI helper</h2>
          <p>{result.summary}</p>
        </div>
        <Chip tone="violet">
          {result.source === "local-stub" ? "Локальная подсказка" : "Edge-подсказка"}
        </Chip>
      </div>
      <div className="ai-helper-body">
        <div>
          <strong>{result.title}</strong>
          <ul>
            {result.suggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        {result.blockers.length ? (
          <div>
            <strong>Блокеры</strong>
            <ul>
              {result.blockers.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="ai-helper-guardrails">
          {result.guardrails.map((item) => (
            <Chip key={item} tone="neutral">
              {item}
            </Chip>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PageHead({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="page-kicker">{kicker}</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  chip,
}: {
  label: string;
  value: string | number;
  hint: string;
  chip?: ReactNode;
}) {
  return (
    <article className="metric">
      <div className="metric-top">
        <label>{label}</label>
        {chip}
      </div>
      <div>
        <strong>{value}</strong>
        <span>{hint}</span>
      </div>
    </article>
  );
}

export function Metrics({
  items,
}: {
  items: Array<{
    label: string;
    value: string | number;
    hint: string;
    chip?: ReactNode;
  }>;
}) {
  return (
    <div className={`grid cols-${Math.min(items.length, 5)}`}>
      {items.map((item) => (
        <MetricCard key={item.label} {...item} />
      ))}
    </div>
  );
}

export function StatusRail({
  source,
  active,
  onChange,
}: {
  source: Submission[];
  active: StatusGroup | "all";
  onChange: (filter: StatusGroup | "all") => void;
}) {
  return (
    <div className="status-rail" aria-label="Статусы">
      <button
        className={`status-filter ${active === "all" ? "active" : ""}`}
        type="button"
        onClick={() => onChange("all")}
      >
        Все · {source.length}
      </button>
      {statusGroups.map((group) => (
        <button
          className={`status-filter ${active === group ? "active" : ""}`}
          key={group}
          type="button"
          onClick={() => onChange(group)}
        >
          {statusGroupMeta[group].label} · {countByGroup(source, group)}
        </button>
      ))}
    </div>
  );
}

export function RoleCard({ role }: { role: Role }) {
  const profile = roleProfile(role);
  return (
    <div className="role-card">
      <strong>{profile.roleText}</strong>
      <span>{profile.sideText}</span>
    </div>
  );
}

export function NavButton({
  active,
  label,
  icon,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {typeof count === "number" ? <span className="nav-count">{count}</span> : null}
    </button>
  );
}

export function Sidebar({
  role,
  screen,
  navItems,
  onNavigate,
  onLogout,
}: {
  role: Role;
  screen: Screen;
  navItems: Array<{ id: Screen; label: string; icon: string; count?: number }>;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const profile = roleProfile(role);

  return (
    <aside className="sidebar" aria-label="Навигация">
      <div className="sidebar-head">
        <div className="logo">VF</div>
        <div className="brand-name">
          <span>VisaFlow AI</span>
          <span>{profile.name}</span>
        </div>
      </div>

      <RoleCard role={role} />

      <nav className="nav">
        <div className="nav-title">
          {role === "admin" ? "Операции" : "Рабочее меню"}
        </div>
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            active={screen === item.id}
            label={item.label}
            icon={item.icon}
            count={item.count}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>

      <div className="sidebar-foot">
        <Button full onClick={onLogout}>
          Выйти
        </Button>
      </div>
    </aside>
  );
}

export function Topbar({
  role,
  screen,
  mobileMenuOpen,
  authMode,
  profileName,
  onMobileMenu,
}: {
  role: Role;
  screen: Screen;
  mobileMenuOpen: boolean;
  authMode: "supabase" | "local-demo";
  profileName: string;
  onMobileMenu: () => void;
}) {
  const profile = roleProfile(role);

  return (
    <header className="topbar">
      <button
        aria-expanded={mobileMenuOpen}
        aria-label="Открыть меню"
        className="mobile-menu"
        type="button"
        onClick={onMobileMenu}
      >
        ☰
      </button>
      <div className="crumbs">
        <strong>{screenNames[screen] ?? "Рабочая область"}</strong>
        <span>{profile.roleText}</span>
      </div>
      <div className="search">
        <label className="sr-only" htmlFor="global-search">
          Поиск
        </label>
        <input id="global-search" placeholder="ID, заявитель, страна" />
      </div>
      <div className="user-pill">
        <span className="avatar">{profile.initials}</span>
        <span>{profileName}</span>
        <span className="auth-mode">
          {authMode === "supabase" ? "Supabase" : "Demo"}
        </span>
      </div>
    </header>
  );
}

export function AppShell({
  role,
  screen,
  navItems,
  mobileMenuOpen,
  authMode,
  profileName,
  children,
  onNavigate,
  onLogout,
  onMobileMenu,
  onMobileClose,
}: {
  role: Role;
  screen: Screen;
  navItems: Array<{ id: Screen; label: string; icon: string; count?: number }>;
  mobileMenuOpen: boolean;
  authMode: "supabase" | "local-demo";
  profileName: string;
  children: ReactNode;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  onMobileMenu: () => void;
  onMobileClose: () => void;
}) {
  return (
    <div className={`shell ${mobileMenuOpen ? "menu-open" : ""}`}>
      <Sidebar
        role={role}
        screen={screen}
        navItems={navItems}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <button
        aria-label="Закрыть меню"
        className="scrim"
        type="button"
        onClick={onMobileClose}
      />
      <div className="main-shell">
        <Topbar
          role={role}
          screen={screen}
          mobileMenuOpen={mobileMenuOpen}
          authMode={authMode}
          profileName={profileName}
          onMobileMenu={onMobileMenu}
        />
        <main className="content">
          <div className="page">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function LoginPage({
  authMode,
  missingConfig,
  onLogin,
}: {
  authMode: "supabase" | "local-demo";
  missingConfig: string[];
  onLogin: (role: Role) => void;
}) {
  return (
    <main className="login">
      <div className="login-shell">
        <section className="login-hero">
          <div className="brand-lockup">
            <div className="logo">VF</div>
            <div className="brand-name">
              <span>VisaFlow AI</span>
              <span>Visa operations</span>
            </div>
          </div>
          <h1>Единый контур для визовых заявок, проверки, выгрузки и записи.</h1>
          <p>
            Агенты собирают данные и медиа. Операции принимают решения, формируют Excel
            и ведут ручной статус записи.
          </p>
          <div className="login-metrics">
            <div className="login-metric">
              <strong>13</strong>
              <span>статусов заявки</span>
            </div>
            <div className="login-metric">
              <strong>2</strong>
              <span>рабочих контура</span>
            </div>
            <div className="login-metric">
              <strong>1</strong>
              <span>источник данных</span>
            </div>
          </div>
        </section>

        <section className="login-card">
          <h2>Вход</h2>
          <p>
            Выберите рабочий доступ.{" "}
            {authMode === "supabase"
              ? "Supabase session mode настроен."
              : "MVP использует local demo mode."}
          </p>
          {missingConfig.length ? (
            <div className="config-note">
              <strong>Supabase не подключён</strong>
              <span>Не хватает: {missingConfig.join(", ")}.</span>
            </div>
          ) : null}
          <button
            className="role-choice"
            type="button"
            onClick={() => onLogin("agent")}
          >
            <span>
              <strong>Агент</strong>
              <span>Заявки, заявители, медиа и исправления.</span>
            </span>
            <i>AG</i>
          </button>
          <button
            className="role-choice admin-choice"
            type="button"
            onClick={() => onLogin("admin")}
          >
            <span>
              <strong>Операции</strong>
              <span>Очередь, проверка, Excel и запись.</span>
            </span>
            <i>OP</i>
          </button>
        </section>
      </div>
    </main>
  );
}

export function SubmissionCard({
  submission,
  admin = false,
  onOpen,
  onNavigate,
}: {
  submission: Submission;
  admin?: boolean;
  onOpen: (submission: Submission, admin: boolean) => void;
  onNavigate: (screen: Screen) => void;
}) {
  const ready = readiness(submission);
  const action = nextAction(submission, admin);
  const visibleBlockers = blockers(submission).slice(0, 2);
  const hiddenBlockers = blockers(submission).length - visibleBlockers.length;

  return (
    <article className={admin ? "queue-card" : "submission-card"}>
      <div className="submission-main">
        <div className="submission-header">
          <div className="submission-identity">
            <span className="id">{submission.id}</span>
            <h3>{submission.title}</h3>
          </div>
          <StatusChip status={submission.status} />
        </div>

        <div className="meta-line card-meta-line">
          {admin ? (
            <>
              <span>{submission.agentName}</span>
              <span className="dot" />
            </>
          ) : null}
          <span>{typeLabel(submission.type)}</span>
          <span className="dot" />
          <span>{applicantCountLabel(submission)}</span>
          <span className="dot" />
          <span>
            {submission.country} · {submission.city}
          </span>
          <span className="dot" />
          <span>{submission.travelDate}</span>
        </div>

        <div className="readiness-row">
          <span>Готовность пакета</span>
          <strong>{ready}%</strong>
        </div>
        <Progress value={ready} label={`Готовность ${ready}%`} />

        <div className="next-line card-next-line">
          <span>Следующее: {action.label}</span>
          <span className="dot" />
          <span>обновлено {submission.updated}</span>
        </div>

        {visibleBlockers.length ? (
          <div className="blockers compact-blockers">
            {visibleBlockers.map((text) => (
              <span className="blocker" key={text}>
                {text}
              </span>
            ))}
            {hiddenBlockers > 0 ? (
              <span className="blocker">+{hiddenBlockers}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="actions card-actions">
        {admin && submission.status === "ready_for_excel" ? (
          <Button variant="primary" onClick={() => onNavigate("admin-export")}>
            Excel
          </Button>
        ) : null}
        {admin &&
        ["exported", "sent_to_appointment", "appointment_scheduled"].includes(
          submission.status,
        ) ? (
          <Button variant="primary" onClick={() => onNavigate("admin-appointments")}>
            Запись
          </Button>
        ) : null}
        <Button onClick={() => onOpen(submission, admin)}>{action.button}</Button>
      </div>
    </article>
  );
}

export function QueueCard(props: Omit<Parameters<typeof SubmissionCard>[0], "admin">) {
  return <SubmissionCard {...props} admin />;
}

export function ApplicantCard({ person }: { person: Applicant }) {
  const ready = applicantReadiness(person);
  const fieldCompletion = applicantFieldCompletion(person);
  const mediaSlots = ensureMediaSlots(person);
  const mediaUploaded = mediaSlots.filter(
    (slot) => slot.state === "uploaded" || slot.state === "accepted",
  ).length;
  const mediaRequired = mediaSlots.length;

  return (
    <article className="applicant-card">
      <div>
        <div className="card-title-row">
          <h3>{person.name}</h3>
          <Chip>{person.role}</Chip>
        </div>
        <div className="meta-line">
          <span>{person.passport}</span>
          <span className="dot" />
          <span>Анкета {fieldCompletion}%</span>
          <span className="dot" />
          <span>
            Медиа {mediaUploaded}/{mediaRequired}
          </span>
        </div>
        <Progress value={ready} label={`Готовность ${person.name} ${ready}%`} />
      </div>
      <strong>{ready}%</strong>
    </article>
  );
}

export function MediaRow({ row }: { row: MediaRowData }) {
  return (
    <div className="media-row">
      <div>
        <strong>{row.label}</strong>
        <small>
          {row.state === "uploaded"
            ? "Файл загружен. Оператор ещё не принял файл."
            : "Файл заявления"}
        </small>
      </div>
      <MediaChip row={row} />
    </div>
  );
}

function AdminFamilyReview({ submission }: { submission: Submission }) {
  const suggestion = familySuggestion(submission);
  const confirmed = submission.familyIntelligence?.status === "confirmed";

  return (
    <section className="card family-review-card">
      <div className="section-head">
        <div>
          <h2>Family review</h2>
          <p>
            Оператор видит группировку, сигналы и роли без автоматического объединения.
          </p>
        </div>
        <Chip tone={confirmed ? "success" : "warning"}>
          {confirmed ? "Подтверждено агентом" : "Нужно проверить"}
        </Chip>
      </div>
      <div className="signal-grid">
        {suggestion.signals.map((signal) => (
          <div
            className={`signal-item ${signal.matched ? "matched" : ""}`}
            key={signal.key}
          >
            <span>{signal.label}</span>
            <strong>{signal.score}</strong>
            <small>{signal.matched ? "Совпало" : "Не доказано"}</small>
          </div>
        ))}
      </div>
      <div className="list">
        {submission.applicants.map((applicant, index) => (
          <TimelineRow
            key={applicant.id ?? `${submission.id}-${index}`}
            title={applicant.name}
            text={`Роль: ${applicant.role}${applicant.suggestedRole ? ` · предложено: ${applicant.suggestedRole}` : ""}`}
            chip={
              <Chip tone={applicant.roleConfirmed ? "success" : "warning"}>
                {applicant.roleConfirmed ? "Роль подтверждена" : "Роль не подтверждена"}
              </Chip>
            }
          />
        ))}
      </div>
    </section>
  );
}

function AdminMediaReviewRow({
  submissionId,
  applicantName,
  applicantId,
  slot,
  onReviewMediaSlot,
}: {
  submissionId: string;
  applicantName: string;
  applicantId: string;
  slot: MediaSlot;
  onReviewMediaSlot: (
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    state: "accepted" | "replace",
    reason?: string,
  ) => void;
}) {
  const [reason, setReason] = useState(slot.reason ?? "");
  const canAccept = slot.state === "uploaded" || slot.state === "replace";
  const needsReason = slot.state !== "accepted";

  return (
    <div className="media-review-row">
      <div className="media-review-main">
        <div>
          <strong>
            {slot.label} · {applicantName}
          </strong>
          <small>
            {slot.generatedFileName
              ? `Имя файла: ${slot.generatedFileName}`
              : "Укажите паспорт, чтобы сформировать имя файла."}
          </small>
        </div>
        <Chip tone={mediaMeta[slot.state].tone}>{mediaMeta[slot.state].label}</Chip>
      </div>
      {needsReason ? (
        <div className="field media-review-reason">
          <label htmlFor={`${slot.id}-reason`}>Причина замены</label>
          <input
            id={`${slot.id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Например: изображение размыто"
          />
        </div>
      ) : null}
      <div className="media-review-actions">
        {slot.state === "accepted" ? (
          <Chip tone="success">Файл принят оператором</Chip>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={!canAccept}
              onClick={() =>
                onReviewMediaSlot(submissionId, applicantId, slot.type, "accepted")
              }
            >
              Принять файл
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              onClick={() =>
                onReviewMediaSlot(
                  submissionId,
                  applicantId,
                  slot.type,
                  "replace",
                  reason.trim(),
                )
              }
            >
              Запросить замену
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AdminTimeline({ submission }: { submission: Submission }) {
  const rows = submission.timeline ?? [];

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>Timeline</h2>
          <p>Локальная история решений и изменений статусов.</p>
        </div>
      </div>
      <div className="list">
        {rows.length ? (
          rows
            .slice()
            .reverse()
            .map((item) => (
              <TimelineRow
                key={item.id}
                title={item.comment}
                text={`${item.changedAt} · ${item.changedBy}`}
                chip={<Chip tone="info">{item.toStatus}</Chip>}
              />
            ))
        ) : (
          <EmptyState
            title="История пуста"
            text="Действия оператора появятся после проверки."
          />
        )}
      </div>
    </section>
  );
}

export function TimelineRow({
  title,
  text,
  chip,
}: {
  title: string;
  text: string;
  chip: ReactNode;
}) {
  return (
    <div className="timeline-row">
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
      {chip}
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}

export function DetailView({
  submission,
  admin,
  onBack,
  onSetStatus,
  onReturnOpen,
  onNavigate,
  onUpdateApplicant,
  onAddApplicant,
  onUpdateMediaSlot,
  onReviewMediaSlot,
  onFixCorrection,
  onConfirmFamilyRoles,
  onSubmitPreflight,
}: {
  submission: Submission;
  admin: boolean;
  onBack: () => void;
  onSetStatus: (id: string, status: Submission["status"]) => void;
  onReturnOpen: (id: string) => void;
  onNavigate: (screen: Screen) => void;
  onUpdateApplicant: (
    submissionId: string,
    applicantId: string,
    field: keyof Applicant,
    value: string,
  ) => void;
  onAddApplicant: (submissionId: string) => void;
  onUpdateMediaSlot: (
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    state: "missing" | "uploaded",
  ) => void;
  onReviewMediaSlot: (
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    state: "accepted" | "replace",
    reason?: string,
  ) => void;
  onFixCorrection: (submissionId: string, correctionId: string) => void;
  onConfirmFamilyRoles: (submissionId: string, applySuggestedRoles: boolean) => void;
  onSubmitPreflight: (submissionId: string) => void;
}) {
  const ready = readiness(submission);

  return (
    <>
      <PageHead
        kicker={admin ? "Операции" : "Агент"}
        title={submission.title}
        subtitle={`${submission.id} · ${submission.country}, ${submission.city}`}
        actions={
          <>
            <Button onClick={onBack}>Назад</Button>
            {admin ? (
              <DecisionHeaderActions
                submission={submission}
                onSetStatus={onSetStatus}
              />
            ) : (
              <AgentHeaderActions
                submission={submission}
                onSubmitPreflight={onSubmitPreflight}
              />
            )}
          </>
        }
      />

      <div className={`grid detail ${admin ? "" : "agent-detail"}`}>
        <div className="grid">
          {admin ? (
            <section className="card">
              <div className="detail-title">
                <div className="card-title-row">
                  <StatusChip status={submission.status} />
                  <Chip>{typeLabel(submission.type)}</Chip>
                  <AppointmentChip status={submission.appointment} />
                </div>
                <strong>{ready}%</strong>
              </div>
              <Progress value={ready} label={`Готовность ${ready}%`} />
              <div className="info-grid">
                <div className="info-item">
                  <span>Агент</span>
                  <strong>{submission.agentName}</strong>
                </div>
                <div className="info-item">
                  <span>Заявители</span>
                  <strong>{applicantCountLabel(submission)}</strong>
                </div>
                <div className="info-item">
                  <span>Дата поездки</span>
                  <strong>{submission.travelDate}</strong>
                </div>
                <div className="info-item">
                  <span>Обновлено</span>
                  <strong>{submission.updated}</strong>
                </div>
              </div>
            </section>
          ) : null}

          {admin ? (
            <>
              <AiHelperPanel result={buildAdminReviewSummary(submission)} />

              <section className="card">
                <div className="section-head">
                  <div>
                    <h2>Заявители</h2>
                    <p>Анкета, роль и готовность каждого заявителя.</p>
                  </div>
                </div>
                {submission.applicants.map((person) => (
                  <ApplicantCard key={person.id ?? person.name} person={person} />
                ))}
              </section>

              {submission.type === "family" ? (
                <AdminFamilyReview submission={submission} />
              ) : null}

              <section className="card">
                <div className="section-head">
                  <div>
                    <h2>Медиа review</h2>
                    <p>
                      Оператор принимает файл или запрашивает замену с точной причиной.
                    </p>
                  </div>
                </div>
                <div className="media-review-list">
                  {submission.applicants.flatMap((applicant, index) => {
                    const normalized = ensureMediaSlots(applicant).map((slot) => ({
                      applicant,
                      applicantId: applicant.id ?? `${submission.id}-${index + 1}`,
                      slot,
                    }));
                    return normalized.map(
                      ({ applicant: person, applicantId, slot }) => (
                        <AdminMediaReviewRow
                          key={`${applicantId}-${slot.type}`}
                          applicantName={person.name}
                          applicantId={applicantId}
                          slot={slot}
                          submissionId={submission.id}
                          onReviewMediaSlot={onReviewMediaSlot}
                        />
                      ),
                    );
                  })}
                </div>
              </section>

              <section className="card">
                <div className="section-head">
                  <div>
                    <h2>Замечания</h2>
                    <p>Точные цели возврата и статус исправления.</p>
                  </div>
                </div>
                <div className="list">
                  {submission.notes.length ? (
                    submission.notes.map((note) => (
                      <TimelineRow
                        key={note.id ?? `${note.target}-${note.text}`}
                        title={note.target}
                        text={note.text}
                        chip={
                          <Chip
                            tone={
                              (note.status ?? "open") === "open"
                                ? note.severity === "note"
                                  ? "warning"
                                  : "error"
                                : "success"
                            }
                          >
                            {(note.status ?? "open") === "open"
                              ? note.severity === "note"
                                ? "Заметка"
                                : "Открыто"
                              : "Закрыто"}
                          </Chip>
                        }
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="Замечаний нет"
                      text="Оператор пока не вернул точечные правки."
                    />
                  )}
                </div>
              </section>

              <AdminTimeline submission={submission} />
            </>
          ) : (
            <AgentTaskWorkspace
              submission={submission}
              onUpdateApplicant={onUpdateApplicant}
              onAddApplicant={onAddApplicant}
              onUpdateMediaSlot={onUpdateMediaSlot}
              onFixCorrection={onFixCorrection}
              onConfirmFamilyRoles={onConfirmFamilyRoles}
              onSubmitPreflight={onSubmitPreflight}
            />
          )}
        </div>

        <aside className="decision">
          {admin ? (
            <AdminDecisionPanel
              submission={submission}
              onSetStatus={onSetStatus}
              onReturnOpen={onReturnOpen}
              onNavigate={onNavigate}
            />
          ) : null}
        </aside>
      </div>
    </>
  );
}

type AgentTaskKind = "field" | "media" | "correction" | "family" | "handoff";

interface AgentTask {
  id: string;
  kind: AgentTaskKind;
  title: string;
  problem: string;
  reason: string;
  action: string;
  applicantId?: string;
  applicantName?: string;
  field?: keyof Applicant;
  fields?: Array<keyof Applicant>;
  mediaType?: MediaSlotType;
  noteId?: string;
  tone: Tone;
}

function AgentTaskWorkspace({
  submission,
  onUpdateApplicant,
  onAddApplicant,
  onUpdateMediaSlot,
  onFixCorrection,
  onConfirmFamilyRoles,
  onSubmitPreflight,
}: {
  submission: Submission;
  onUpdateApplicant: (
    submissionId: string,
    applicantId: string,
    field: keyof Applicant,
    value: string,
  ) => void;
  onAddApplicant: (submissionId: string) => void;
  onUpdateMediaSlot: (
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    state: "missing" | "uploaded",
  ) => void;
  onFixCorrection: (submissionId: string, correctionId: string) => void;
  onConfirmFamilyRoles: (submissionId: string, applySuggestedRoles: boolean) => void;
  onSubmitPreflight: (submissionId: string) => void;
}) {
  const suggestion = familySuggestion(submission);
  const preflight = submissionPreflight(submission);
  const applicantSummaries = submission.applicants.map((applicant, index) => {
    const applicantId = getApplicantId(submission, applicant, index);
    const tasks = buildApplicantTasks(submission, applicant, index);
    return { applicant, applicantId, tasks };
  });
  const firstNeedsAttention =
    applicantSummaries.find((item) => item.tasks.length > 0) ?? applicantSummaries[0];
  const [selectedApplicantId, setSelectedApplicantId] = useState(
    firstNeedsAttention?.applicantId ?? "",
  );
  const selectedSummary =
    applicantSummaries.find((item) => item.applicantId === selectedApplicantId) ??
    firstNeedsAttention;
  const applicantTasks = selectedSummary?.tasks ?? [];
  const familyTask = buildFamilyTask(submission);
  const caseTasks = familyTask ? [familyTask, ...applicantTasks] : applicantTasks;
  const handoffTask = buildHandoffTask(submission);
  const tasks = caseTasks.length ? caseTasks : [handoffTask];
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id ?? "");
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const blockersRemaining = preflight.blockers.length;
  const nextActionText = selectedTask
    ? selectedTask.action
    : preflight.canSubmit
      ? "Передать оператору"
      : "Закрыть первый блокер";

  return (
    <div className="agent-workspace">
      <section className="case-command card" aria-label="Case Workspace">
        <div className="case-command-main">
          <div>
            <div className="page-kicker">Рабочее пространство кейса</div>
            <h2>До передачи оператору</h2>
            <p>
              {submission.id} · {submission.country}, {submission.city} · цель: READY
              FOR OPERATOR REVIEW
            </p>
          </div>
          <div className="case-command-answer">
            <span>Следующее действие</span>
            <strong>{nextActionText}</strong>
          </div>
        </div>

        <div className="case-command-grid">
          <div className="case-command-metric">
            <span>Готовность</span>
            <strong>{preflight.readiness}%</strong>
          </div>
          <div className="case-command-metric">
            <span>Блокеры</span>
            <strong>{blockersRemaining}</strong>
          </div>
          <div className="case-command-metric">
            <span>Требуют внимания</span>
            <strong>
              {applicantSummaries.filter((item) => item.tasks.length > 0).length}/
              {applicantSummaries.length}
            </strong>
          </div>
          <div className="case-command-metric">
            <span>Можно передать?</span>
            <strong>{preflight.canSubmit ? "Да" : "Нет"}</strong>
          </div>
        </div>

        <div className="case-answer-grid">
          <div>
            <strong>Кто требует внимания?</strong>
            <p>{attentionAnswer(applicantSummaries)}</p>
          </div>
          <div>
            <strong>Что не готово?</strong>
            <p>{preflight.blockers[0] ?? "Блокеров нет."}</p>
          </div>
          <div>
            <strong>Что делать дальше?</strong>
            <p>{nextActionText}</p>
          </div>
          <div>
            <strong>Можно ли передавать кейс?</strong>
            <p>
              {preflight.canSubmit
                ? "Да, после ручной проверки агентом."
                : `Нет, осталось закрыть ${blockersRemaining} блокер(а).`}
            </p>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="applicant-workqueue card" aria-label="Applicants">
          <div className="section-head">
            <div>
              <h2>Заявители</h2>
              <p>Выберите человека, затем закройте его задачи.</p>
            </div>
            <Button variant="ghost" onClick={() => onAddApplicant(submission.id)}>
              Добавить
            </Button>
          </div>

          <div className="applicant-task-list">
            {applicantSummaries.map(({ applicant, applicantId, tasks }) => (
              <button
                className={`applicant-task-card ${
                  selectedSummary?.applicantId === applicantId ? "active" : ""
                }`}
                type="button"
                key={applicantId}
                onClick={() => {
                  setSelectedApplicantId(applicantId);
                  setSelectedTaskId(tasks[0]?.id ?? handoffTask.id);
                }}
              >
                <span>
                  <strong>{applicant.name}</strong>
                  <small>{applicant.role}</small>
                </span>
                <Progress
                  value={applicantReadiness(applicant)}
                  label={`Готовность ${applicant.name}`}
                />
                <span className="applicant-card-footer">
                  <Chip tone={tasks.length ? "error" : "success"}>
                    {tasks.length ? `${tasks.length} задач` : "Готов"}
                  </Chip>
                  <small>{applicantReadiness(applicant)}%</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="task-workspace card" aria-label="Applicant Tasks">
          <div className="section-head">
            <div>
              <h2>{selectedSummary?.applicant.name ?? "Кейс"}: задачи</h2>
              <p>
                Сначала задача и причина. Данные открываются только для выбранного
                действия.
              </p>
            </div>
            <Chip tone={preflight.canSubmit ? "success" : "warning"}>
              {preflight.canSubmit ? "Готово" : "Не готово"}
            </Chip>
          </div>

          <div className="task-list">
            {tasks.map((task, index) => (
              <button
                className={`task-card ${selectedTask?.id === task.id ? "active" : ""}`}
                type="button"
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <span className="task-number">{index + 1}</span>
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.problem}</small>
                </span>
                <Chip tone={task.tone}>
                  {task.kind === "handoff" ? "Проверка" : "Задача"}
                </Chip>
              </button>
            ))}
          </div>
        </div>
      </section>

      {selectedTask ? (
        <section className="task-detail card" aria-label="Applicant Editing">
          <div className="task-detail-copy">
            <div className="page-kicker">Выбранная задача</div>
            <h2>{selectedTask.title}</h2>
            <dl>
              <div>
                <dt>Проблема</dt>
                <dd>{selectedTask.problem}</dd>
              </div>
              <div>
                <dt>Причина</dt>
                <dd>{selectedTask.reason}</dd>
              </div>
              <div>
                <dt>Что сделать</dt>
                <dd>{selectedTask.action}</dd>
              </div>
            </dl>
          </div>

          <TaskDataEditor
            task={selectedTask}
            submission={submission}
            onUpdateApplicant={onUpdateApplicant}
            onUpdateMediaSlot={onUpdateMediaSlot}
            onFixCorrection={onFixCorrection}
            onConfirmFamilyRoles={onConfirmFamilyRoles}
            onSubmitPreflight={onSubmitPreflight}
          />
        </section>
      ) : null}

      <section className="readiness-review card" aria-label="Readiness Review">
        <div>
          <div className="section-head">
            <div>
              <h2>Проверка готовности</h2>
              <p>Готовность является результатом закрытых задач.</p>
            </div>
            <Button
              variant="primary"
              onClick={() => onSubmitPreflight(submission.id)}
              disabled={
                !["draft", "filling", "ready_for_review", "returned"].includes(
                  submission.status,
                )
              }
            >
              {preflight.canSubmit ? "Передать оператору" : "Проверить готовность"}
            </Button>
          </div>

          <div className="review-checks">
            {preflight.checklist.map((item) => (
              <div className="review-check" key={item.label}>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <Chip tone={item.tone}>{item.ok ? "OK" : "Действие"}</Chip>
              </div>
            ))}
          </div>
        </div>
        {submission.type === "family" ? (
          <div className="support-note">
            <strong>Семейный анализ</strong>
            <p>{suggestion.text}</p>
            <div className="actions">
              <Button onClick={() => onConfirmFamilyRoles(submission.id, false)}>
                Подтвердить вручную
              </Button>
              <Button
                variant="primary"
                onClick={() => onConfirmFamilyRoles(submission.id, true)}
              >
                Применить роли
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TaskDataEditor({
  task,
  submission,
  onUpdateApplicant,
  onUpdateMediaSlot,
  onFixCorrection,
  onConfirmFamilyRoles,
  onSubmitPreflight,
}: {
  task: AgentTask;
  submission: Submission;
  onUpdateApplicant: (
    submissionId: string,
    applicantId: string,
    field: keyof Applicant,
    value: string,
  ) => void;
  onUpdateMediaSlot: (
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    state: "missing" | "uploaded",
  ) => void;
  onFixCorrection: (submissionId: string, correctionId: string) => void;
  onConfirmFamilyRoles: (submissionId: string, applySuggestedRoles: boolean) => void;
  onSubmitPreflight: (submissionId: string) => void;
}) {
  const applicant = task.applicantId
    ? findApplicantById(submission, task.applicantId)
    : undefined;

  if (
    task.kind === "field" &&
    applicant &&
    task.applicantId &&
    (task.field || task.fields?.length)
  ) {
    const fields = task.fields ?? (task.field ? [task.field] : []);
    return (
      <div className="task-data-panel">
        <h3>Данные для этой задачи</h3>
        <div className="form-grid">
          {fields.map((field) => (
            <ApplicantTextField
              applicant={applicant}
              applicantId={task.applicantId ?? ""}
              field={field}
              label={fieldLabel(field)}
              type={String(field).toLowerCase().includes("date") ? "date" : "text"}
              submissionId={submission.id}
              onUpdateApplicant={onUpdateApplicant}
              key={field}
            />
          ))}
        </div>
      </div>
    );
  }

  if (task.kind === "media" && applicant && task.applicantId && task.mediaType) {
    const slot = ensureMediaSlots(applicant).find(
      (item) => item.type === task.mediaType,
    );
    if (!slot) return null;

    return (
      <div className="task-data-panel">
        <h3>Документ для этой задачи</h3>
        <div className="media-card task-media-card">
          <div>
            <div className="card-title-row">
              <h3>{slot.label}</h3>
              <MediaChip row={{ label: slot.label, state: slot.state }} />
            </div>
            <small>
              {slot.generatedFileName ??
                "Укажите номер паспорта, чтобы сформировать имя файла."}
            </small>
          </div>
          <Button
            variant={
              slot.state === "missing" || slot.state === "replace"
                ? "primary"
                : "secondary"
            }
            onClick={() =>
              onUpdateMediaSlot(
                submission.id,
                task.applicantId ?? "",
                slot.type,
                slot.state === "missing" || slot.state === "replace"
                  ? "uploaded"
                  : "missing",
              )
            }
          >
            {slot.state === "missing" || slot.state === "replace"
              ? "Отметить загруженным"
              : "Снять файл"}
          </Button>
        </div>
      </div>
    );
  }

  if (task.kind === "correction") {
    return (
      <div className="task-data-panel">
        <h3>Закрытие замечания</h3>
        <p>Отметьте задачу исправленной только после реального исправления.</p>
        <Button
          variant="primary"
          onClick={() => onFixCorrection(submission.id, task.noteId ?? task.id)}
        >
          Отметить исправленным
        </Button>
      </div>
    );
  }

  if (task.kind === "family") {
    return (
      <div className="task-data-panel">
        <h3>Подтверждение группы</h3>
        <p>Система не объединяет и не меняет роли без явного действия агента.</p>
        <div className="actions">
          <Button onClick={() => onConfirmFamilyRoles(submission.id, false)}>
            Подтвердить вручную
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirmFamilyRoles(submission.id, true)}
          >
            Применить роли
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="task-data-panel">
      <h3>Передача оператору</h3>
      <p>Откройте финальный чеклист и передайте кейс только если блокеров нет.</p>
      <Button variant="primary" onClick={() => onSubmitPreflight(submission.id)}>
        Проверить готовность
      </Button>
    </div>
  );
}

function buildApplicantTasks(
  submission: Submission,
  applicant: Applicant,
  index: number,
): AgentTask[] {
  const applicantId = getApplicantId(submission, applicant, index);
  const tasks: AgentTask[] = [];
  const missingFields = requiredApplicantFields.filter((item) => {
    const value = applicant[item.key];
    return typeof value === "string"
      ? value.trim().length === 0 || value === "-"
      : !value;
  });

  if (missingFields.length) {
    tasks.push({
      id: `${applicantId}-fields-required`,
      kind: "field",
      title: `Заполнить обязательные поля (${missingFields.length})`,
      problem: `${applicant.name}: не хватает ${missingFields
        .slice(0, 3)
        .map((item) => item.label.toLowerCase())
        .join(", ")}${missingFields.length > 3 ? "..." : ""}.`,
      reason: "Неполный профиль блокирует передачу кейса оператору.",
      action: "Заполнить недостающие поля профиля.",
      applicantId,
      applicantName: applicant.name,
      fields: missingFields.map((item) => item.key),
      tone: "warning",
    });
  }

  for (const slot of ensureMediaSlots(applicant)) {
    if (slot.state === "missing" || slot.state === "replace") {
      tasks.push({
        id: `${applicantId}-media-${slot.type}`,
        kind: "media",
        title: `${slot.state === "replace" ? "Заменить" : "Загрузить"}: ${slot.label}`,
        problem:
          slot.state === "replace"
            ? `${applicant.name}: документ требует замены.`
            : `${applicant.name}: документ не загружен.`,
        reason:
          slot.state === "replace"
            ? "Оператор запросил корректный файл для продолжения проверки."
            : "Комплект документов неполный.",
        action:
          slot.state === "replace"
            ? `Загрузить новый файл: ${slot.label.toLowerCase()}.`
            : `Добавить файл: ${slot.label.toLowerCase()}.`,
        applicantId,
        applicantName: applicant.name,
        mediaType: slot.type,
        tone: slot.state === "replace" ? "error" : "warning",
      });
    }
  }

  for (const note of submission.notes) {
    if ((note.status ?? "open") !== "open") continue;
    const belongsToApplicant =
      note.applicantId === applicantId ||
      note.target.includes(applicant.name) ||
      (submission.applicants.length === 1 && !note.applicantId);
    if (!belongsToApplicant) continue;

    tasks.push({
      id: `${applicantId}-correction-${note.id ?? note.target}`,
      kind: "correction",
      title: `Исправить замечание: ${note.target}`,
      problem: note.text,
      reason: "Открытое замечание блокирует готовность кейса.",
      action: "Исправить причину и отметить замечание закрытым.",
      applicantId,
      applicantName: applicant.name,
      noteId: note.id ?? `${note.target}-${note.text}`,
      tone: note.severity === "note" ? "warning" : "error",
    });
  }

  return tasks;
}

function buildFamilyTask(submission: Submission): AgentTask | null {
  if (
    submission.type !== "family" ||
    submission.applicants.length < 2 ||
    submission.familyIntelligence?.status === "confirmed"
  ) {
    return null;
  }

  return {
    id: `${submission.id}-family-confirmation`,
    kind: "family",
    title: "Подтвердить семейную группу",
    problem: "Роли и группа заявителей ещё не подтверждены агентом.",
    reason: "Система не объединяет заявителей автоматически.",
    action: "Проверить роли и подтвердить группу вручную.",
    tone: "warning",
  };
}

function buildHandoffTask(submission: Submission): AgentTask {
  const preflight = submissionPreflight(submission);
  return {
    id: `${submission.id}-handoff`,
    kind: "handoff",
    title: preflight.canSubmit ? "Передать оператору" : "Проверить готовность",
    problem: preflight.canSubmit
      ? "Блокеров нет."
      : (preflight.blockers[0] ?? "Проверьте оставшиеся условия передачи."),
    reason: "Кейс передаётся оператору только после закрытия блокеров.",
    action: preflight.canSubmit
      ? "Открыть финальный чеклист и передать оператору."
      : "Открыть чеклист готовности и закрыть блокеры.",
    tone: preflight.canSubmit ? "success" : "warning",
  };
}

function getApplicantId(submission: Submission, applicant: Applicant, index: number) {
  return applicant.id ?? `${submission.id}-${index + 1}`;
}

function findApplicantById(submission: Submission, applicantId: string) {
  return submission.applicants.find(
    (applicant, index) => getApplicantId(submission, applicant, index) === applicantId,
  );
}

function fieldLabel(field: keyof Applicant) {
  return (
    requiredApplicantFields.find((item) => item.key === field)?.label ?? String(field)
  );
}

function attentionAnswer(
  summaries: Array<{ applicant: Applicant; tasks: AgentTask[] }>,
) {
  const names = summaries
    .filter((item) => item.tasks.length > 0)
    .map((item) => item.applicant.name);
  if (!names.length) return "Никто. Заявители не имеют открытых задач.";
  const visible = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${visible} и ещё ${names.length - 3}` : visible;
}

function ApplicantTextField({
  applicant,
  applicantId,
  field,
  label,
  type = "text",
  wide = false,
  submissionId,
  onUpdateApplicant,
}: {
  applicant: Applicant;
  applicantId: string;
  field: keyof Applicant;
  label: string;
  type?: string;
  wide?: boolean;
  submissionId: string;
  onUpdateApplicant: (
    submissionId: string,
    applicantId: string,
    field: keyof Applicant,
    value: string,
  ) => void;
}) {
  const id = `${submissionId}-${applicantId}-${String(field)}`;
  const value = applicant[field];
  const required = requiredApplicantFields.some((item) => item.key === field);

  return (
    <div className={`field ${wide ? "wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={typeof value === "string" ? value : ""}
        onChange={(event) =>
          onUpdateApplicant(submissionId, applicantId, field, event.target.value)
        }
      />
      {required && (!value || value === "-") ? (
        <small className="field-hint">Обязательное поле для передачи оператору.</small>
      ) : null}
    </div>
  );
}

function DecisionHeaderActions({
  submission,
  onSetStatus,
}: {
  submission: Submission;
  onSetStatus: (id: string, status: Submission["status"]) => void;
}) {
  if (submission.status === "waiting_review") {
    return (
      <Button variant="primary" onClick={() => onSetStatus(submission.id, "in_review")}>
        Начать проверку
      </Button>
    );
  }

  if (submission.status === "accepted") {
    return (
      <Button
        variant="primary"
        onClick={() => onSetStatus(submission.id, "ready_for_excel")}
      >
        К выгрузке
      </Button>
    );
  }

  return null;
}

function AgentHeaderActions({
  submission,
  onSubmitPreflight,
}: {
  submission: Submission;
  onSubmitPreflight: (submissionId: string) => void;
}) {
  if (submission.status === "ready_for_review") {
    return (
      <Button variant="primary" onClick={() => onSubmitPreflight(submission.id)}>
        Отправить
      </Button>
    );
  }

  if (submission.status === "returned") {
    return (
      <Button variant="primary" onClick={() => onSubmitPreflight(submission.id)}>
        Отметить исправленным
      </Button>
    );
  }

  if (["draft", "filling"].includes(submission.status)) {
    return (
      <Button variant="primary" onClick={() => onSubmitPreflight(submission.id)}>
        Проверить готовность
      </Button>
    );
  }

  if (["waiting_review", "in_review"].includes(submission.status)) {
    return <Chip tone="info">Передано оператору</Chip>;
  }

  if (
    [
      "accepted",
      "ready_for_excel",
      "exported",
      "sent_to_appointment",
      "appointment_scheduled",
      "completed",
    ].includes(submission.status)
  ) {
    return <Chip tone="success">Intake завершён</Chip>;
  }

  return null;
}

function AdminDecisionPanel({
  submission,
  onSetStatus,
  onReturnOpen,
  onNavigate,
}: {
  submission: Submission;
  onSetStatus: (id: string, status: Submission["status"]) => void;
  onReturnOpen: (id: string) => void;
  onNavigate: (screen: Screen) => void;
}) {
  const currentBlockers = blockers(submission);
  const media = mediaLifecycleCounts(submission);

  return (
    <>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Решение</h2>
          </div>
        </div>
        <div className="grid">
          {submission.status === "waiting_review" ? (
            <Button
              variant="primary"
              onClick={() => onSetStatus(submission.id, "in_review")}
            >
              Начать проверку
            </Button>
          ) : null}
          {["in_review", "attention_required"].includes(submission.status) ? (
            <Button
              variant="primary"
              onClick={() => onSetStatus(submission.id, "accepted")}
            >
              Принять
            </Button>
          ) : null}
          {submission.status === "accepted" ? (
            <Button
              variant="primary"
              onClick={() => onSetStatus(submission.id, "ready_for_excel")}
            >
              К выгрузке
            </Button>
          ) : null}
          {submission.status === "ready_for_excel" ? (
            <Button variant="primary" onClick={() => onNavigate("admin-export")}>
              Открыть выгрузку
            </Button>
          ) : null}
          {["exported", "sent_to_appointment", "appointment_scheduled"].includes(
            submission.status,
          ) ? (
            <Button variant="primary" onClick={() => onNavigate("admin-appointments")}>
              Открыть запись
            </Button>
          ) : null}
          {["waiting_review", "in_review", "attention_required"].includes(
            submission.status,
          ) ? (
            <Button variant="danger" onClick={() => onReturnOpen(submission.id)}>
              Вернуть
            </Button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Контроль</h2>
          </div>
        </div>
        <div className="list">
          <TimelineRow
            title="Анкета"
            text={`${submission.fields}% заполнения`}
            chip={
              <Chip tone={submission.fields === 100 ? "success" : "warning"}>
                {submission.fields === 100 ? "Заполнено" : "Проверить"}
              </Chip>
            }
          />
          <TimelineRow
            title="Медиа загружены"
            text={`${media.uploaded}/${media.required} файлов`}
            chip={
              <Chip
                tone={
                  media.uploaded === media.required && media.replace === 0
                    ? "success"
                    : "error"
                }
              >
                {media.uploaded === media.required && media.replace === 0
                  ? "Комплект"
                  : "Неполно"}
              </Chip>
            }
          />
          <TimelineRow
            title="Принято оператором"
            text={`${media.accepted}/${media.required} файлов`}
            chip={
              <Chip tone={media.accepted === media.required ? "success" : "warning"}>
                {media.accepted === media.required ? "Принято" : "На проверке"}
              </Chip>
            }
          />
          <TimelineRow
            title="Замечания"
            text={currentBlockers.length ? `${currentBlockers.length} открыто` : "нет"}
            chip={
              <Chip tone={currentBlockers.length ? "error" : "success"}>
                {currentBlockers.length ? "Есть" : "Нет блокеров"}
              </Chip>
            }
          />
        </div>
      </section>
    </>
  );
}

export function MiniExportTable({
  rows,
  onOpen,
}: {
  rows: Submission[];
  onOpen: (submission: Submission, admin: boolean) => void;
}) {
  if (!rows.length) {
    return (
      <EmptyState title="Нет строк" text="Заявки появятся после принятия оператором." />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Заявка</th>
            <th>Агент</th>
            <th>Страна</th>
            <th>Статус</th>
            <th>
              <span className="sr-only">Действие</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((submission) => (
            <tr key={submission.id}>
              <td>{submission.id}</td>
              <td>{submission.title}</td>
              <td>{submission.agentName}</td>
              <td>{submission.country}</td>
              <td>
                <StatusChip status={submission.status} />
              </td>
              <td>
                <Button onClick={() => onOpen(submission, true)}>Открыть</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExportPreviewTable({
  rows,
  submissions,
  onOpen,
}: {
  rows: ExportRow[];
  submissions: Submission[];
  onOpen: (submission: Submission, admin: boolean) => void;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="Нет строк"
        text="Заявки появятся после принятия оператором и закрытия блокеров."
      />
    );
  }

  const byId = new Map(submissions.map((submission) => [submission.id, submission]));

  return (
    <section className="card">
      <div className="card-title-row">
        <h2>Предпросмотр выгрузки</h2>
        <Chip tone="success">{rows.length} строк</Chip>
      </div>
      <p className="muted">
        Одна строка соответствует одному заявителю. Участники семьи остаются рядом в
        порядке заявки.
      </p>
      <div className="table-wrap export-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Группа</th>
              <th>Заявитель</th>
              <th>Паспорт</th>
              <th>Страна</th>
              <th>Файлы</th>
              <th>Статус</th>
              <th>
                <span className="sr-only">Действие</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const submission = byId.get(row["ID заявки"]);
              const groupId = row.familyGroupId;

              return (
                <tr key={`${row["ID заявки"]}-${row["ФИО заявителя"]}-${index}`}>
                  <td>{row["ID заявки"]}</td>
                  <td>
                    {groupId ? (
                      <span className="family-export-group">
                        <span
                          className="group-swatch"
                          style={{ background: row.familyGroupColor }}
                          aria-hidden="true"
                        />
                        {groupId}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{row["ФИО заявителя"]}</td>
                  <td>{row["Номер паспорта"]}</td>
                  <td>{row["Страна"]}</td>
                  <td>
                    {[
                      row["Файл фото на белом фоне"],
                      row["Файл селфи"],
                      row["Файл видео"],
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td>{row["Статус заявки"]}</td>
                  <td>
                    {submission ? (
                      <Button onClick={() => onOpen(submission, true)}>Открыть</Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AppointmentCard({
  submission,
  onOpen,
  onAppointmentChange,
}: {
  submission: Submission;
  onOpen: (submission: Submission, admin: boolean) => void;
  onAppointmentChange: (id: string, status: AppointmentStatus) => void;
}) {
  return (
    <article className="appointment-card">
      <div className="split">
        <div>
          <div className="card-title-row">
            <span className="id">{submission.id}</span>
            <h3>{submission.title}</h3>
            <StatusChip status={submission.status} />
            <AppointmentChip status={submission.appointment} />
          </div>
          <div className="meta-line">
            <span>{submission.agentName}</span>
            <span className="dot" />
            <span>
              {submission.country} · {submission.city}
            </span>
            <span className="dot" />
            <span>{submission.travelDate}</span>
          </div>
        </div>
        <div className="actions">
          <label className="sr-only" htmlFor={`appointment-${submission.id}`}>
            Статус записи
          </label>
          <select
            id={`appointment-${submission.id}`}
            value={submission.appointment}
            onChange={(event) =>
              onAppointmentChange(
                submission.id,
                event.target.value as AppointmentStatus,
              )
            }
          >
            {Object.entries(appointmentMeta).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
          <Button onClick={() => onOpen(submission, true)}>Открыть</Button>
        </div>
      </div>
    </article>
  );
}

export function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop open" aria-hidden={!open} onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`toast ${message ? "show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
