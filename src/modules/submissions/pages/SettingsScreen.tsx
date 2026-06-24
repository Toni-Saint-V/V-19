import { useEffect, useRef } from "react";
import { Button } from "../../../shared/ui/primitives";
import type { Role } from "../types";
import "./SettingsScreen.css";

type WorkspaceSettings = {
  compactLists: boolean;
  digest: "instant" | "daily";
  drawerHints: boolean;
};

export default function SettingsScreen({
  confirmLeave,
  dirty,
  email,
  isSupabaseMode,
  onCancelLeave,
  onConfirmLeave,
  onReset,
  onSave,
  onSettings,
  onSignOut,
  role,
  saveState,
  settings,
}: {
  confirmLeave: boolean;
  dirty: boolean;
  email: string;
  isSupabaseMode: boolean;
  onCancelLeave: () => void;
  onConfirmLeave: () => void;
  onReset: () => void;
  onSave: () => void;
  onSettings: (patch: Partial<WorkspaceSettings>) => void;
  onSignOut: () => void | Promise<void>;
  role: Role;
  saveState: "idle" | "saved";
  settings: WorkspaceSettings;
}) {
  const roleLabel = role === "agent" ? "Агент" : "Администратор";
  const modeLabel = isSupabaseMode ? "Supabase" : "Локальный демо-режим";
  const saveStatusLabel = dirty
    ? "Есть изменения"
    : saveState === "saved"
      ? "Сохранено"
      : "Без изменений";

  return (
    <section className="workspace-settings" aria-labelledby="settings-title">
      <header className="settings-header">
        <p className="kicker">Рабочее место</p>
        <h2 id="settings-title">Настройки доступа</h2>
        <p>Параметры рабочего места без изменения подач.</p>
        <dl className="settings-context-strip" aria-label="Состояние рабочего места">
          <div>
            <dt>Роль</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div>
            <dt>Данные</dt>
            <dd>{modeLabel}</dd>
          </div>
          <div className={dirty ? "is-dirty" : undefined}>
            <dt>Сохранение</dt>
            <dd>{saveStatusLabel}</dd>
          </div>
        </dl>
      </header>

      <div className="settings-grid">
        <section className="settings-card" aria-labelledby="settings-workflow-title">
          <h3 id="settings-workflow-title">Рабочие уведомления</h3>
          <label className="settings-field" htmlFor="settings-digest">
            <span>Сводка по действиям</span>
            <select
              id="settings-digest"
              value={settings.digest}
              onChange={(event) =>
                onSettings({
                  digest: event.currentTarget.value === "daily" ? "daily" : "instant",
                })
              }
            >
              <option value="instant">Сразу</option>
              <option value="daily">Ежедневная сводка</option>
            </select>
          </label>

          <label className="settings-toggle">
            <input
              checked={settings.drawerHints}
              type="checkbox"
              onChange={(event) =>
                onSettings({ drawerHints: event.currentTarget.checked })
              }
            />
            <span>
              Подсказки в панели подачи
              <small>Показывать подсказки следующего шага.</small>
            </span>
          </label>

          <label className="settings-toggle">
            <input
              checked={settings.compactLists}
              type="checkbox"
              onChange={(event) =>
                onSettings({ compactLists: event.currentTarget.checked })
              }
            />
            <span>
              Плотные списки
              <small>Уплотнять рабочие очереди.</small>
            </span>
          </label>
        </section>

        <aside className="settings-card" aria-labelledby="settings-access-title">
          <h3 id="settings-access-title">Доступ</h3>
          <dl className="export-package-summary" aria-label="Параметры рабочего места">
            <div>
              <dt>Роль</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div>
              <dt>Данные</dt>
              <dd>{modeLabel}</dd>
            </div>
            <div className="settings-access-email">
              <dt>Почта</dt>
              <dd>{email || "Не задана"}</dd>
            </div>
          </dl>
          <Button variant="secondary" onClick={() => void onSignOut()}>
            {isSupabaseMode ? "Выйти из Supabase" : "Сбросить рабочую почту"}
          </Button>
        </aside>
      </div>

      <div
        className={`settings-save-bar ${dirty ? "is-dirty" : "is-clean"}`}
        role="status"
        aria-live="polite"
      >
        <span>
          {dirty
            ? "Есть несохранённые изменения"
            : saveState === "saved"
              ? "Настройки сохранены"
              : "Изменений нет"}
        </span>
        <div className="settings-save-actions">
          <Button variant="secondary" disabled={!dirty} onClick={onReset}>
            Отменить
          </Button>
          <Button disabled={!dirty} onClick={onSave}>
            Сохранить
          </Button>
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
