import type { ReactNode } from "react";
import {
  ArrowRight,
  ChevronRight,
  Download,
  FolderCheck,
  History,
  UploadCloud,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type AdminExportPanelTone = "neutral" | "review" | "success" | "warning";

export type AdminExportPanelCheck = {
  icon: LucideIcon;
  label: string;
  state: "neutral" | "ok" | "warn";
  value: string;
};

export type AdminExportPanelActivePackage = {
  stats: Array<{
    label: string;
    value: ReactNode;
  }>;
  statusLabel: ReactNode;
  statusTone: AdminExportPanelTone;
  title: string;
};

export type AdminExportPanelCompositionItem = {
  applicantCount: number;
  id: string;
  title: string;
  type: "family" | "single";
};

export type AdminExportPanelHistoryEntry = {
  detail: string;
  id: string;
  title: string;
};

export function AdminExportRightPanel({
  actionHint,
  actionHintId = "admin-export-action-hint",
  activePackage,
  checks,
  compositionItems,
  downloadDisabled,
  exportBusy = false,
  factsLabel,
  generateDisabled,
  historyEntries,
  historyToggleLabel,
  markExportedDisabled,
  onDownload,
  onGenerate,
  onMarkExported,
  onOpenCompositionItem,
  onOpenHistoryItem,
  onToggleHistory,
  preflightStatus,
}: {
  actionHint: string;
  actionHintId?: string;
  activePackage: AdminExportPanelActivePackage | null;
  checks: AdminExportPanelCheck[];
  compositionItems: AdminExportPanelCompositionItem[];
  downloadDisabled: boolean;
  exportBusy?: boolean;
  factsLabel: ReactNode;
  generateDisabled: boolean;
  historyEntries: AdminExportPanelHistoryEntry[];
  historyToggleLabel: string;
  markExportedDisabled: boolean;
  onDownload: () => void;
  onGenerate: () => void;
  onMarkExported: () => void;
  onOpenCompositionItem: (id: string) => void;
  onOpenHistoryItem: (id: string) => void;
  onToggleHistory: () => void;
  preflightStatus: {
    label: ReactNode;
    tone: AdminExportPanelTone;
  };
}) {
  return (
    <aside className="v19-admin-export-side" aria-label="Контекст выгрузки">
      <div className="v19-admin-export-side-head">
        <div>
          <span>Export cockpit</span>
          <h3>Правая панель</h3>
          <p>Контроль состава, блокеров, manifest и истории перед Excel.</p>
        </div>
        <div className="v19-admin-export-side-icon" aria-hidden="true">
          <FolderCheck focusable="false" size={20} />
        </div>
      </div>

      <div className="v19-admin-export-side-body">
        <section className="v19-admin-export-rail-card">
          <div className="v19-admin-export-active-head">
            <div>
              <span>Активный пакет</span>
              <strong>{activePackage?.title ?? "Не выбран"}</strong>
            </div>
            {activePackage ? (
              <AdminExportStatusPill tone={activePackage.statusTone}>
                {activePackage.statusLabel}
              </AdminExportStatusPill>
            ) : null}
          </div>
          {activePackage ? (
            <div className="v19-admin-export-active-grid">
              {activePackage.stats.map((stat) => (
                <span key={stat.label}>
                  <small>{stat.label}</small>
                  <strong>{stat.value}</strong>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="v19-admin-export-rail-card">
          <div className="v19-admin-export-card-head">
            <h4>Pre-flight checks</h4>
            <AdminExportStatusPill tone={preflightStatus.tone}>
              {preflightStatus.label}
            </AdminExportStatusPill>
          </div>
          <div className="v19-admin-export-checks">
            {checks.map((check) => (
              <AdminExportCheckRow key={check.label} {...check} />
            ))}
          </div>
        </section>

        <section className="v19-admin-export-rail-card">
          <div className="v19-admin-export-card-head">
            <h4>Состав выгрузки</h4>
            <span>{compositionItems.length} пак.</span>
          </div>
          <div className="v19-admin-export-composition">
            {compositionItems.length > 0 ? (
              compositionItems.map((item) => (
                <AdminExportCompositionItem
                  item={item}
                  key={item.id}
                  onOpen={() => onOpenCompositionItem(item.id)}
                />
              ))
            ) : (
              <div className="v19-admin-export-empty-inline">Выберите пакеты слева</div>
            )}
          </div>
        </section>

        <section className="v19-admin-export-rail-card">
          <div className="v19-admin-export-card-head is-left">
            <History aria-hidden="true" focusable="false" size={16} />
            <h4>История сегодня</h4>
            <button type="button" onClick={onToggleHistory}>
              {historyToggleLabel}
            </button>
          </div>
          <div className="v19-admin-export-history">
            {historyEntries.length > 0 ? (
              historyEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onOpenHistoryItem(entry.id)}
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.detail}</span>
                </button>
              ))
            ) : (
              <span>Сегодня ещё нет завершённых выгрузок</span>
            )}
          </div>
        </section>
      </div>

      <div className="v19-admin-export-footer">
        <button
          className="linear-product-action linear-product-action--primary v19-admin-export-primary-action"
          type="button"
          disabled={generateDisabled}
          aria-describedby={actionHintId}
          onClick={onGenerate}
        >
          {exportBusy ? (
            <UploadCloud aria-hidden="true" focusable="false" size={16} />
          ) : (
            <Download aria-hidden="true" focusable="false" size={16} />
          )}
          <span>{exportBusy ? "Формируем Excel..." : "Сформировать Excel"}</span>
          {!exportBusy ? (
            <ArrowRight aria-hidden="true" focusable="false" size={16} />
          ) : null}
        </button>
        <div className="v19-admin-export-secondary-actions">
          <button
            className="linear-product-action linear-product-action--outline linear-product-action--compact"
            type="button"
            disabled={downloadDisabled}
            onClick={onDownload}
          >
            Скачать
          </button>
          <button
            className="linear-product-action linear-product-action--outline linear-product-action--compact"
            type="button"
            disabled={markExportedDisabled}
            onClick={onMarkExported}
          >
            Отметить
          </button>
        </div>
        <p id={actionHintId}>{actionHint}</p>
        <p>{factsLabel}</p>
      </div>
    </aside>
  );
}

export function AdminExportStatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: AdminExportPanelTone;
}) {
  return <span className={`v19-admin-export-status tone-${tone}`}>{children}</span>;
}

export function AdminExportCheckRow({
  icon: Icon,
  label,
  state,
  value,
}: AdminExportPanelCheck) {
  return (
    <div className={`v19-admin-export-check state-${state}`}>
      <span>
        <Icon aria-hidden="true" focusable="false" size={16} />
        <strong>{label}</strong>
      </span>
      <em>{value}</em>
    </div>
  );
}

function AdminExportCompositionItem({
  item,
  onOpen,
}: {
  item: AdminExportPanelCompositionItem;
  onOpen: () => void;
}) {
  return (
    <button
      className="v19-admin-export-composition-item"
      type="button"
      onClick={onOpen}
    >
      <span aria-hidden="true">
        {item.type === "family" ? (
          <UsersRound focusable="false" size={16} />
        ) : (
          <UserRound focusable="false" size={16} />
        )}
      </span>
      <strong>{item.title}</strong>
      <small>
        {item.id} · {item.applicantCount} чел.
      </small>
      <ChevronRight aria-hidden="true" focusable="false" size={16} />
    </button>
  );
}
