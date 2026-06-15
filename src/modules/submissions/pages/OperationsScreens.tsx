import type { ReactNode } from "react";
import type { ExportSummary } from "../exportRules";
import { counts, nextAuditLine, tripDates } from "../selectors";
import {
  canAddAdminIssue,
  getCardActionLabel,
  nextProblem,
  responsibleRole,
  typeLabels,
} from "../status";
import type { DrawerTab, Submission } from "../types";
import type { AgentTab, ExportTab, ReviewTab } from "../uiTypes";
import {
  EmptyState,
  PanelHeader,
  StatusChip,
  SummaryRow,
} from "../components/Primitives";
import { RightRail, SubmissionList } from "../components/SubmissionList";

function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function AgentSubmissionsScreen({
  activeSubmission,
  agentList,
  agentTab,
  onOpen,
  onSelect,
  onTab,
  searchControl,
  summary,
}: {
  activeSubmission: Submission;
  agentList: Submission[];
  agentTab: AgentTab;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AgentTab) => void;
  searchControl: ReactNode;
  summary: ReturnType<typeof counts>;
}) {
  return (
    <>
      <div className="main-grid">
        <section className="submission-panel" aria-labelledby="agent-title">
          <PanelHeader
            eyebrow="Очередь действий"
            title="Где агент должен действовать"
            tabs={[
              ["action", "Требуют действия"],
              ["progress", "В работе"],
              ["review", "На проверке"],
              ["done", "Готово"],
            ]}
            search={searchControl}
            value={agentTab}
            onTab={onTab}
          />
          <SubmissionList
            activeSubmission={activeSubmission}
            empty="В этой вкладке нет подач."
            onOpen={onOpen}
            onSelect={onSelect}
            role="agent"
            submissions={agentList}
          />
        </section>
        <RightRail
          activeSubmission={activeSubmission}
          onOpen={onOpen}
          summaryChips={[
            ["danger", String(summary.requiresAction), "требуют действия"],
            ["blue", String(summary.inReview), "на проверке"],
            ["teal", String(summary.ready), "к выгрузке"],
          ]}
        />
      </div>
    </>
  );
}

export function AdminReviewScreen({
  activeSubmission,
  onAddIssue,
  onOpen,
  onSelect,
  onTab,
  reviewList,
  reviewTab,
  searchControl,
  summary,
}: {
  activeSubmission: Submission;
  onAddIssue: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: ReviewTab) => void;
  reviewList: Submission[];
  reviewTab: ReviewTab;
  searchControl: ReactNode;
  summary: ReturnType<typeof counts>;
}) {
  const canAddIssue = canAddAdminIssue(activeSubmission, "admin");

  return (
    <>
      <div className="main-grid">
        <section className="submission-panel" aria-labelledby="review-title">
          <PanelHeader
            action={
              <button
                className="primary-button"
                type="button"
                onClick={() => reviewList[0] && onOpen(reviewList[0])}
              >
                Открыть первую
              </button>
            }
            eyebrow="Очередь проверки"
            title="Что администратор должен проверить первым"
            tabs={[
              ["review", "На проверке"],
              ["corrections", "Исправления получены"],
              ["ready", "Готово к выгрузке"],
            ]}
            search={searchControl}
            value={reviewTab}
            onTab={onTab}
          />
          <SubmissionList
            activeSubmission={activeSubmission}
            empty="Очередь проверки пуста."
            onOpen={onOpen}
            onSelect={onSelect}
            role="admin"
            submissions={reviewList}
          />
        </section>
        <aside className="right-rail" aria-label="Контекст проверки">
          <section className="rail-panel rail-summary">
            <p className="kicker">Информация по заявкам</p>
            <SummaryRow
              chips={[
                ["blue", String(summary.inReview), "на проверке"],
                ["amber", String(summary.corrections), "исправления получены"],
                ["teal", String(summary.ready), "к выгрузке"],
              ]}
            />
          </section>
          <section className="rail-panel selected-context">
            <p className="kicker">Выбранная подача</p>
            <h2>{activeSubmission.title}</h2>
            <StatusChip submission={activeSubmission} />
            <dl>
              <div>
                <dt>Что проверить</dt>
                <dd>{nextAuditLine(activeSubmission)}</dd>
              </div>
              <div>
                <dt>Проблема</dt>
                <dd>{nextProblem(activeSubmission)}</dd>
              </div>
              <div>
                <dt>Ответственный</dt>
                <dd>{responsibleRole(activeSubmission)}</dd>
              </div>
            </dl>
            <div className="stacked-actions">
              <button
                className="primary-button wide"
                type="button"
                onClick={() => onOpen(activeSubmission)}
              >
                {getCardActionLabel(activeSubmission, "admin")}
              </button>
              <button
                className="secondary-button wide"
                disabled={!canAddIssue}
                type="button"
                onClick={onAddIssue}
              >
                Добавить замечание
              </button>
            </div>
          </section>
          <section className="rail-panel">
            <p className="kicker">Правило проверки</p>
            <p className="rail-copy">
              Вернуть можно только с точной целью. Принять можно только без открытых
              блокеров.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

export function ExportScreen({
  exportPlan,
  exportTab,
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
  exportPlan: ExportSummary;
  exportTab: ExportTab;
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
  const actionHint = exportActionHint(exportPlan);

  return (
    <>
      <div className="export-grid">
        <section className="submission-panel" aria-labelledby="export-title">
          <PanelHeader
            eyebrow="Выгрузка"
            title="Что можно безопасно выгрузить"
            tabs={[
              ["ready", "Готовы"],
              ["history", "История"],
            ]}
            search={searchControl}
            value={exportTab}
            onTab={onTab}
          />
          {exportTab === "ready" ? (
            <div className="submission-list">
              {readyList.map((submission) => (
                <article className="export-row" key={submission.id}>
                  <label className="export-check">
                    <input
                      checked={selectedExportIds.includes(submission.id)}
                      type="checkbox"
                      onChange={() => onToggle(submission.id)}
                    />
                    <span className="sr-only">Выбрать подачу</span>
                  </label>
                  <button
                    className="export-row-main"
                    type="button"
                    onClick={() => onOpen(submission)}
                  >
                    <strong>{submission.title}</strong>
                    <span>
                      {submission.id} · {typeLabels[submission.type]} ·{" "}
                      {submission.city} · {tripDates(submission)}
                    </span>
                  </button>
                  <button type="button" onClick={() => onOpen(submission)}>
                    Смотреть пакет
                  </button>
                </article>
              ))}
              {readyList.length === 0 ? (
                <EmptyState text="Нет подач готовых к выгрузке." />
              ) : null}
            </div>
          ) : (
            <div className="submission-list">
              {historyList.map((submission) => (
                <article className="export-row" key={submission.id}>
                  <div>
                    <strong>{submission.title}</strong>
                    <p>
                      {submission.id} · {submission.city} · {tripDates(submission)}
                    </p>
                  </div>
                  <span>Выгружено</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="export-side" aria-label="Информация и предпросмотр выгрузки">
          <section className="rail-panel rail-summary">
            <p className="kicker">Информация по заявкам</p>
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
          </section>
          <section className="export-preview" aria-label="Предпросмотр Эксель">
            <div className="preview-header">
              <div>
                <p className="kicker">Предпросмотр Эксель</p>
                <h2>{exportPlan.rowCount} строк</h2>
              </div>
              <span className={`status-chip ${exportPlan.ready ? "teal" : "danger"}`}>
                {exportPlan.ready
                  ? exportStateLabel(exportPlan.exportState)
                  : "Блокировано"}
              </span>
            </div>
            {exportPlan.blockers.length ? (
              <div className="blocker-box">
                {exportPlan.blockers.map((blocker) => (
                  <p key={blocker.reason}>{blocker.reason}</p>
                ))}
              </div>
            ) : (
              <div className="export-checklist" aria-label="Проверки перед выгрузкой">
                <span>Город совпадает</span>
                <span>Даты совпадают</span>
                <span>Тип подачи совпадает</span>
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
            <div className="export-actions" aria-describedby="export-action-hint">
              <button
                className="primary-button"
                disabled={!exportPlan.canGenerate}
                type="button"
                onClick={onGenerate}
              >
                Сформировать Эксель
              </button>
              <button
                className="secondary-button"
                disabled={!exportPlan.canDownload}
                type="button"
                onClick={onDownload}
              >
                Скачать
              </button>
              <button
                className="secondary-button"
                disabled={!exportPlan.canMarkExported}
                type="button"
                onClick={onMarkExported}
              >
                Отметить выгружено
              </button>
            </div>
            <p className="export-action-hint" id="export-action-hint">
              {actionHint}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
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
