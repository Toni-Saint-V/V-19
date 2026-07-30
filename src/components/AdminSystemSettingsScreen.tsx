import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Contrast,
  Database,
  Gauge,
  LayoutList,
  MonitorCog,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "../shared/ui/primitives";
import {
  applyExperiencePreferences,
  experiencePreferencesDefaults,
  readExperiencePreferences,
  saveExperiencePreferences,
  type ExperiencePreferences,
} from "../shared/ui/experiencePreferences";
import {
  agentInteractionProps,
  type AgentInteractionId,
} from "../modules/submissions/agentInteractionContract";

export type WorkspaceExperienceSettingsScreenProps = {
  audience?: "admin" | "agent";
  currentIdentity: string;
  instrumentAgentInteractions?: boolean;
  usesSupabase?: boolean;
};

export function WorkspaceExperienceSettingsScreen({
  audience = "agent",
  currentIdentity,
  instrumentAgentInteractions = false,
  usesSupabase = false,
}: WorkspaceExperienceSettingsScreenProps) {
  const isAdmin = audience === "admin";
  const [preferences, setPreferences] = useState<ExperiencePreferences>(() => {
    const current = readExperiencePreferences();
    applyExperiencePreferences(current);
    return current;
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const activeCount = useMemo(
    () => Object.values(preferences).filter(Boolean).length,
    [preferences],
  );

  function update<K extends keyof ExperiencePreferences>(
    key: K,
    value: ExperiencePreferences[K],
  ) {
    const next = { ...preferences, [key]: value };
    if (!saveExperiencePreferences(next)) {
      setSaved(false);
      setSaveError(
        "Не удалось сохранить настройку в этом браузере. Предыдущее значение сохранено; попробуйте ещё раз.",
      );
      return;
    }
    setPreferences(next);
    setSaveError("");
    setSaved(true);
  }

  function reset() {
    if (!saveExperiencePreferences(experiencePreferencesDefaults)) {
      setSaved(false);
      setSaveError(
        "Не удалось сбросить настройки в этом браузере. Текущие значения сохранены; попробуйте ещё раз.",
      );
      return;
    }
    setPreferences(experiencePreferencesDefaults);
    setSaveError("");
    setSaved(true);
  }

  const preferenceInteractionId: AgentInteractionId | undefined =
    instrumentAgentInteractions ? "settings.toggle-preference" : undefined;
  const resetInteractionId: AgentInteractionId | undefined = instrumentAgentInteractions
    ? "settings.reset-preferences"
    : undefined;

  return (
    <section
      className={
        isAdmin
          ? "v19-system-settings is-admin-workstation"
          : "v19-system-settings is-agent-workstation"
      }
      aria-labelledby="v19-settings-title"
    >
      <header className="v19-settings-hero">
        <div>
          <span className="v19-settings-eyebrow">
            <MonitorCog aria-hidden="true" />
            {isAdmin ? "Рабочее место администратора" : "Рабочее место агента"}
          </span>
          <h2 id="v19-settings-title">
            {isAdmin ? "Интерфейс и доступность" : "Интерфейс и помощники"}
          </h2>
          <p>
            {isAdmin
              ? "Параметры применяются сразу и сохраняются только в этом браузере."
              : "Настройте плотность, доступность и подсказки. Изменения применяются сразу и сохраняются только в этом браузере."}
          </p>
        </div>
        <div
          className="v19-settings-score"
          aria-label={
            isAdmin
              ? `Активно параметров: ${activeCount} из 4`
              : `${activeCount} активных параметра`
          }
        >
          <span>{activeCount}</span>
          <small>{isAdmin ? "из 4 включено" : "активно"}</small>
        </div>
      </header>

      <div className="v19-settings-grid">
        <section className="v19-settings-panel" aria-labelledby="appearance-settings">
          <div className="v19-settings-panel-head">
            <span aria-hidden="true">
              <Gauge />
            </span>
            <div>
              <h3 id="appearance-settings">
                {isAdmin ? "Интерфейс в этом браузере" : "Работа с подачами"}
              </h3>
              <p>Для всех рабочих экранов и аккаунтов в этом браузере.</p>
            </div>
          </div>

          <div className="v19-settings-rows">
            <PreferenceRow
              checked={preferences.compactDensity}
              description="Уменьшает вертикальные отступы в очередях и таблицах."
              icon={LayoutList}
              label="Компактная плотность"
              interactionId={preferenceInteractionId}
              onChange={(value) => update("compactDensity", value)}
            />
            <PreferenceRow
              checked={preferences.showAiContext}
              description={
                isAdmin
                  ? "Показывает AI-контекст и подсказки на рабочих экранах."
                  : "Показывает Case Copilot и AI-пульс на рабочих экранах."
              }
              icon={Bot}
              label="AI-контекст в работе"
              interactionId={preferenceInteractionId}
              onChange={(value) => update("showAiContext", value)}
            />
            <PreferenceRow
              checked={preferences.reducedMotion}
              description="Отключает необязательные переходы независимо от настроек ОС."
              icon={Sparkles}
              label="Минимум анимации"
              interactionId={preferenceInteractionId}
              onChange={(value) => update("reducedMotion", value)}
            />
            <PreferenceRow
              checked={preferences.highContrast}
              description="Усиливает границы и вторичный текст для сложных условий просмотра."
              icon={Contrast}
              label="Повышенный контраст"
              interactionId={preferenceInteractionId}
              onChange={(value) => update("highContrast", value)}
            />
          </div>

          <footer className="v19-settings-panel-footer">
            <span aria-live="polite" role={saveError ? "alert" : "status"}>
              {saveError ? (
                saveError
              ) : saved ? (
                <>
                  <Check aria-hidden="true" /> Настройки сохранены
                </>
              ) : (
                "Автосохранение включено"
              )}
            </span>
            <Button
              {...(resetInteractionId ? agentInteractionProps(resetInteractionId) : {})}
              variant="secondary"
              onClick={reset}
            >
              <RotateCcw aria-hidden="true" />
              Сбросить
            </Button>
          </footer>
        </section>

        <aside
          className="v19-settings-runtime"
          aria-label={isAdmin ? "Состояние рабочего места" : "Состояние системы"}
        >
          <div className="v19-settings-runtime-head">
            <span aria-hidden="true">
              <ShieldCheck />
            </span>
            <div>
              <h3>{isAdmin ? "Рабочий контур" : "Состояние контура"}</h3>
              <p>Текущая конфигурация рабочего места.</p>
            </div>
          </div>
          <RuntimeRow
            icon={Database}
            label="Хранилище"
            value={usesSupabase ? "Рабочий контур Supabase" : "Локальная демо-среда"}
            tone={usesSupabase ? "live" : "local"}
          />
          <RuntimeRow
            icon={ShieldCheck}
            label="Решения AI"
            value="Только после подтверждения"
            tone="safe"
          />
          <RuntimeRow
            icon={MonitorCog}
            label="Сессия"
            value={currentIdentity}
            tone="neutral"
          />
          <div className="v19-settings-guardrail">
            <Sparkles aria-hidden="true" />
            <div>
              <strong>Контроль AI включён</strong>
              <p>
                Сводки объясняют приоритет и готовят план, но не меняют подачу и не
                принимают решение за администратора.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PreferenceRow({
  checked,
  description,
  icon: Icon,
  interactionId,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  icon: typeof Bot;
  interactionId?: AgentInteractionId;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="v19-preference-row">
      <span className="v19-preference-icon" aria-hidden="true">
        <Icon />
      </span>
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        {...(interactionId ? agentInteractionProps(interactionId) : {})}
        aria-checked={checked}
        aria-label={label}
        className={checked ? "is-on" : undefined}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

export function AdminSystemSettingsScreen(
  props: Omit<
    WorkspaceExperienceSettingsScreenProps,
    "audience" | "instrumentAgentInteractions"
  >,
) {
  return <WorkspaceExperienceSettingsScreen {...props} audience="admin" />;
}

function RuntimeRow({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Database;
  label: string;
  tone: "live" | "local" | "neutral" | "safe";
  value: string;
}) {
  return (
    <div className="v19-settings-runtime-row">
      <span aria-hidden="true">
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <i className={`is-${tone}`} aria-hidden="true" />
    </div>
  );
}
