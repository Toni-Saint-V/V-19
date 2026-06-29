import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../shared/ui/primitives";
import type { AccessRequest } from "../../../shared/authRegistration";
import type { Role } from "../types";
import "./SettingsScreen.css";

type WorkspaceSettings = {
  compactLists: boolean;
  digest: "instant" | "daily";
  drawerHints: boolean;
};

type SettingsSectionId =
  | "profile"
  | "access-requests"
  | "team"
  | "notifications"
  | "export-defaults"
  | "interface";

const agentSections: SettingsSectionId[] = [
  "profile",
  "notifications",
  "interface",
];

const adminSections: SettingsSectionId[] = [
  "profile",
  "access-requests",
  "team",
  "notifications",
  "export-defaults",
  "interface",
];

const sectionLabels: Record<SettingsSectionId, string> = {
  "access-requests": "Входящие заявки",
  "export-defaults": "Выгрузка",
  interface: "Интерфейс",
  notifications: "Уведомления",
  profile: "Профиль",
  team: "Команда и роли",
};

export default function SettingsScreen({
  accessRequests,
  accessRequestsBusy,
  confirmLeave,
  dirty,
  email,
  isSupabaseMode,
  onApproveAccessRequest,
  onCancelLeave,
  onConfirmLeave,
  onRejectAccessRequest,
  onReset,
  onSave,
  onSettings,
  onSignOut,
  role,
  saveState,
  settings,
}: {
  accessRequests: AccessRequest[];
  accessRequestsBusy: boolean;
  confirmLeave: boolean;
  dirty: boolean;
  email: string;
  isSupabaseMode: boolean;
  onApproveAccessRequest: (requestId: string) => void;
  onCancelLeave: () => void;
  onConfirmLeave: () => void;
  onRejectAccessRequest: (requestId: string) => void;
  onReset: () => void;
  onSave: () => void;
  onSettings: (patch: Partial<WorkspaceSettings>) => void;
  onSignOut: () => void | Promise<void>;
  role: Role;
  saveState: "idle" | "saved";
  settings: WorkspaceSettings;
}) {
  const roleLabel = role === "agent" ? "Агент" : "Администратор";
  const sections = role === "agent" ? agentSections : adminSections;
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("notifications");
  const activeSectionSafe = sections.includes(activeSection)
    ? activeSection
    : sections[0];
  const displayEmail = email || "t.novikova@example.test";
  const userDisplayName = useMemo(
    () => (role === "agent" ? "Татьяна Новикова" : "Ирина Лебедева"),
    [role],
  );

  return (
    <section className="workspace-settings" aria-labelledby="settings-title">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Разделы настроек">
          {sections.map((section) => (
            <button
              aria-current={activeSectionSafe === section ? "page" : undefined}
              className={activeSectionSafe === section ? "active" : undefined}
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
            >
              {sectionLabels[section]}
            </button>
          ))}
        </nav>

        <div className="settings-form">
          <SettingsSectionContent
            accessRequests={accessRequests}
            accessRequestsBusy={accessRequestsBusy}
            activeSection={activeSectionSafe}
            displayEmail={displayEmail}
            isSupabaseMode={isSupabaseMode}
            onApproveAccessRequest={onApproveAccessRequest}
            onRejectAccessRequest={onRejectAccessRequest}
            onSettings={onSettings}
            onSignOut={onSignOut}
            role={role}
            roleLabel={roleLabel}
            settings={settings}
            userDisplayName={userDisplayName}
          />

          {dirty ? (
            <div className="settings-save-bar is-dirty" role="status" aria-live="polite">
              <span>Есть несохранённые изменения</span>
              <div className="settings-save-actions">
                <Button variant="secondary" onClick={onReset}>
                  Отменить
                </Button>
                <Button onClick={onSave}>Сохранить</Button>
              </div>
            </div>
          ) : (
            <div className="settings-save-state" role="status" aria-live="polite">
              {saveState === "saved" ? "Настройки сохранены" : "Изменений нет"}
            </div>
          )}
        </div>
      </div>

      {confirmLeave ? (
        <SettingsLeaveDialog
          onCancel={onCancelLeave}
          onConfirm={onConfirmLeave}
        />
      ) : null}
    </section>
  );
}

function SettingsSectionContent({
  accessRequests,
  accessRequestsBusy,
  activeSection,
  displayEmail,
  isSupabaseMode,
  onApproveAccessRequest,
  onRejectAccessRequest,
  onSettings,
  onSignOut,
  role,
  roleLabel,
  settings,
  userDisplayName,
}: {
  accessRequests: AccessRequest[];
  accessRequestsBusy: boolean;
  activeSection: SettingsSectionId;
  displayEmail: string;
  isSupabaseMode: boolean;
  onApproveAccessRequest: (requestId: string) => void;
  onRejectAccessRequest: (requestId: string) => void;
  onSettings: (patch: Partial<WorkspaceSettings>) => void;
  onSignOut: () => void | Promise<void>;
  role: Role;
  roleLabel: string;
  settings: WorkspaceSettings;
  userDisplayName: string;
}) {
  if (activeSection === "profile") {
    return (
      <section className="settings-block" aria-labelledby="settings-title">
        <h2 id="settings-title">Профиль</h2>
        <p>Имя и рабочие контакты пользователя.</p>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Имя</div>
            <div className="settings-form-help">Отображается в истории действий.</div>
          </div>
          <input className="settings-field-control" readOnly value={userDisplayName} />
        </div>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Рабочая почта</div>
            <div className="settings-form-help">Тестовый адрес в прототипе.</div>
          </div>
          <input className="settings-field-control" readOnly value={displayEmail} />
        </div>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Сессия</div>
            <div className="settings-form-help">
              {isSupabaseMode ? "Supabase workspace." : "Локальный демо-режим."}
            </div>
          </div>
          <Button variant="secondary" onClick={() => void onSignOut()}>
            {isSupabaseMode ? "Выйти" : "Сбросить почту"}
          </Button>
        </div>
      </section>
    );
  }

  if (activeSection === "access-requests") {
    return (
      <AccessRequestsSection
        busy={accessRequestsBusy}
        requests={accessRequests}
        onApprove={onApproveAccessRequest}
        onReject={onRejectAccessRequest}
      />
    );
  }

  if (activeSection === "team") {
    return (
      <section className="settings-block" aria-labelledby="settings-title">
        <h2 id="settings-title">Команда и роли</h2>
        <p>Управление доступом остаётся подразделом настроек, а не отдельным продуктом.</p>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Строгое разделение ролей</div>
            <div className="settings-form-help">Агент не видит Проверку и Выгрузку.</div>
          </div>
          <SwitchButton checked ariaLabel="Строгое разделение ролей" />
        </div>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Текущая роль</div>
            <div className="settings-form-help">Назначается в рабочей среде.</div>
          </div>
          <button className="settings-small-button" disabled type="button">
            {roleLabel}
          </button>
        </div>
      </section>
    );
  }

  if (activeSection === "export-defaults") {
    return (
      <section className="settings-block" aria-labelledby="settings-title">
        <h2 id="settings-title">Выгрузка</h2>
        <p>Только defaults и naming. Сам workflow находится в разделе «Выгрузка».</p>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Шаблон имени</div>
            <div className="settings-form-help">Не генерирует файл в прототипе.</div>
          </div>
          <input
            className="settings-field-control is-mono"
            readOnly
            value="VF_{city}_{date}_{batch}"
          />
        </div>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Fail closed</div>
            <div className="settings-form-help">
              Блокировать несовместимые и повторные пакеты.
            </div>
          </div>
          <SwitchButton checked ariaLabel="Fail closed" />
        </div>
      </section>
    );
  }

  if (activeSection === "interface") {
    return (
      <section className="settings-block" aria-labelledby="settings-title">
        <h2 id="settings-title">Интерфейс</h2>
        <p>Тёмная тема — фиксированный baseline текущего scope.</p>
        <div className="settings-form-row">
          <div>
            <div className="settings-form-label">Тема</div>
            <div className="settings-form-help">Светлая тема не реализована.</div>
          </div>
          <button className="settings-small-button" disabled type="button">
            Тёмная
          </button>
        </div>
        <label className="settings-form-row" htmlFor="settings-density">
          <div>
            <div className="settings-form-label">Плотность списков</div>
            <div className="settings-form-help">Локально может меняться в меню «Вид».</div>
          </div>
          <select
            aria-label="Плотность списков"
            className="settings-field-control"
            id="settings-density"
            value={settings.compactLists ? "compact" : "comfortable"}
            onChange={(event) =>
              onSettings({ compactLists: event.currentTarget.value === "compact" })
            }
          >
            <option value="compact">Компактно</option>
            <option value="comfortable">Комфортно</option>
          </select>
        </label>
      </section>
    );
  }

  return (
    <section className="settings-block" aria-labelledby="settings-title">
      <h2 id="settings-title">Уведомления</h2>
      <p>События попадают во «Входящие»; здесь настраиваются только каналы.</p>
      <div className="settings-form-row">
        <div>
          <div className="settings-form-label">Возврат подачи</div>
          <div className="settings-form-help">Показывать событие и точное действие.</div>
        </div>
        <SwitchButton
          ariaLabel="Возврат подачи"
          checked={settings.digest === "instant"}
          onChange={(checked) => onSettings({ digest: checked ? "instant" : "daily" })}
        />
      </div>
      <label className="settings-form-row" htmlFor="settings-action-digest">
        <div>
          <div className="settings-form-label">Сводка по действиям</div>
          <div className="settings-form-help">Как часто показывать сводку задач агента.</div>
        </div>
        <select
          aria-label="Сводка по действиям"
          className="settings-field-control"
          id="settings-action-digest"
          value={settings.digest}
          onChange={(event) =>
            onSettings({ digest: event.currentTarget.value as WorkspaceSettings["digest"] })
          }
        >
          <option value="instant">Сразу</option>
          <option value="daily">Ежедневно</option>
        </select>
      </label>
      <div className="settings-form-row">
        <div>
          <div className="settings-form-label">Новые замечания</div>
          <div className="settings-form-help">
            Открывать drawer на вкладке «Замечания».
          </div>
        </div>
        <SwitchButton
          ariaLabel="Новые замечания"
          checked={settings.drawerHints}
          onChange={(checked) => onSettings({ drawerHints: checked })}
        />
      </div>
      <div className="settings-form-row">
        <div>
          <div className="settings-form-label">Ошибки выгрузки</div>
          <div className="settings-form-help">Только для роли администратора.</div>
        </div>
        <SwitchButton
          ariaLabel="Ошибки выгрузки"
          checked={role === "admin"}
          disabled={role !== "admin"}
        />
      </div>
    </section>
  );
}

function AccessRequestsSection({
  busy,
  requests,
  onApprove,
  onReject,
}: {
  busy: boolean;
  requests: AccessRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}) {
  return (
    <section
      className="settings-block settings-access-requests"
      aria-labelledby="settings-title"
      data-testid="admin-access-queue"
    >
      <div className="settings-access-head">
        <div>
          <h2 id="settings-title">Входящие заявки</h2>
          <p>Администратор одобряет доступ агента до входа в рабочий кабинет.</p>
        </div>
        <span aria-label={`Новых заявок: ${requests.length}`}>{requests.length}</span>
      </div>

      {requests.length ? (
        <div className="settings-access-list">
          {requests.map((request) => (
            <article className="settings-access-row" key={request.id}>
              <div className="settings-access-main">
                <strong>{request.displayName}</strong>
                <span>{request.organizationName}</span>
                <small>
                  {request.email} · agent · pending · {formatAccessRequestDate(request.createdAt)}
                </small>
              </div>
              <div className="settings-access-actions">
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() => onReject(request.id)}
                >
                  Отклонить
                </Button>
                <Button disabled={busy} onClick={() => onApprove(request.id)}>
                  Одобрить
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="settings-access-empty">
          <strong>Новых заявок нет.</strong>
          <span>Pending и rejected email не получают доступ к кабинету.</span>
        </div>
      )}
    </section>
  );
}

function formatAccessRequestDate(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function SwitchButton({
  ariaLabel,
  checked,
  disabled = false,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`settings-switch ${checked ? "on" : ""}`}
      disabled={disabled || !onChange}
      role="switch"
      type="button"
      onClick={() => onChange?.(!checked)}
    >
      <span />
    </button>
  );
}

function SettingsLeaveDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-leave-title"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onCancel();
        }}
      >
        <p className="kicker">Несохранённые настройки</p>
        <h2 id="settings-leave-title">Уйти без сохранения?</h2>
        <p>Изменения останутся только на экране настроек и будут сброшены.</p>
        <div className="dialog-actions">
          <Button variant="secondary" ref={cancelButtonRef} onClick={onCancel}>
            Остаться
          </Button>
          <Button danger onClick={onConfirm}>
            Уйти без сохранения
          </Button>
        </div>
      </section>
    </div>
  );
}
