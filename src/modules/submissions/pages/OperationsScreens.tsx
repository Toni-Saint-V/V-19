import type { ReactNode } from "react";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import type { ExportSummary } from "../exportRules";
import { counts, nextAuditLine, tripDates } from "../selectors";
import {
  canAddAdminIssue,
  nextProblem,
  responsibleRole,
  statusTone,
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

function adminIssueUnavailableReason(submission: Submission) {
  if (submission.status === "ready_for_export")
    return "Пакет уже принят. Новое замечание доступно только до принятия.";
  if (submission.status === "exported")
    return "Подача уже выгружена. Возврат из истории не выполняется.";
  return "Возврат доступен только для подач на проверке или после исправлений.";
}

export function AgentSubmissionsScreen({
  activeSubmission,
  agentList,
  agentTab,
  filterControl,
  onOpen,
  onSelect,
  onTab,
  searchControl,
  summary,
}: {
  activeSubmission: Submission;
  agentList: Submission[];
  agentTab: AgentTab;
  filterControl?: ReactNode;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AgentTab) => void;
  searchControl: ReactNode;
  summary: ReturnType<typeof counts>;
}) {
  return (
    <>
      <div className="main-grid">
        <CardComponent
          as="section"
          className="submission-panel"
          aria-labelledby="agent-title"
        >
          <PanelHeader
            eyebrow="Очередь действий"
            titleId="agent-title"
            title="Где агент должен действовать"
            tabs={[
              ["action", "Требуют действия"],
              ["progress", "В работе"],
              ["review", "На проверке"],
              ["done", "Готово"],
            ]}
            search={searchControl}
            side={filterControl}
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
        </CardComponent>
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
  filterControl,
  onAddIssue,
  onOpen,
  onSelect,
  onTab,
  reviewList,
  reviewTab,
  searchControl,
}: {
  activeSubmission: Submission;
  filterControl?: ReactNode;
  onAddIssue: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: ReviewTab) => void;
  reviewList: Submission[];
  reviewTab: ReviewTab;
  searchControl: ReactNode;
}) {
  const canAddIssue = canAddAdminIssue(activeSubmission, "admin");
  const addIssueReason = canAddIssue
    ? ""
    : adminIssueUnavailableReason(activeSubmission);
  const firstReview = reviewList[0];
  const activeIsFirst = firstReview?.id === activeSubmission.id;

  return (
    <>
      <div className="main-grid admin-review-grid magic-admin-stage">
        <CardComponent
          as="section"
          className={`selected-context magic-admin-decision tone-${statusTone[activeSubmission.status]}`}
          aria-label="Текущее решение администратора"
        >
          <div className="magic-admin-decision-copy">
            <p className="kicker">Фокус проверки</p>
            <h2>{activeSubmission.title}</h2>
            <p>
              {activeSubmission.id} · {activeSubmission.city} · {tripDates(activeSubmission)}
            </p>
          </div>
          <div className="magic-admin-decision-facts">
            <StatusChip submission={activeSubmission} />
            <span>{nextAuditLine(activeSubmission)}</span>
            <strong>{nextProblem(activeSubmission)}</strong>
            <dl>
              <div>
                <dt>Ответственный</dt>
                <dd>{responsibleRole(activeSubmission)}</dd>
              </div>
            </dl>
          </div>
          <div className="magic-admin-decision-actions">
            <Button wide onClick={() => onOpen(activeSubmission)}>
              Открыть проверку
            </Button>
            <Button
              aria-describedby={!canAddIssue ? "admin-return-disabled-note" : undefined}
              disabled={!canAddIssue}
              variant="secondary"
              wide
              onClick={onAddIssue}
            >
              Вернуть с замечанием
            </Button>
          </div>
          {!canAddIssue ? (
            <p className="action-disabled-note" id="admin-return-disabled-note">
              {addIssueReason}
            </p>
          ) : null}
        </CardComponent>
        <CardComponent
          as="section"
          className="submission-panel magic-admin-queue"
          aria-labelledby="review-title"
        >
          <PanelHeader
            action={
              activeIsFirst ? null : (
                <Button
                  variant="secondary"
                  onClick={() => firstReview && onOpen(firstReview)}
                >
                  Открыть первую
                </Button>
              )
            }
            eyebrow="Очередь проверки"
            titleId="review-title"
            title="Кого проверить сейчас"
            tabs={[
              ["review", "На проверке"],
              ["corrections", "Исправления"],
              ["ready", "К выгрузке"],
            ]}
            search={searchControl}
            side={filterControl}
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
        </CardComponent>
        <CardComponent as="aside" className="right-rail magic-admin-aside" aria-label="Контекст проверки">
          <CardComponent as="section" className="rail-panel rail-rule magic-admin-rule">
            <p className="kicker">Правило проверки</p>
            <p className="rail-copy">
              Решение принимается после проверки пакета. Возврат только с конкретным
              замечанием.
            </p>
          </CardComponent>
        </CardComponent>
      </div>
    </>
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
                <CardComponent as="article" className="export-row magic-export-row" key={submission.id}>
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
                <CardComponent as="article" className="export-row magic-export-row" key={submission.id}>
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

        <CardComponent as="aside" className="export-side magic-export-side" aria-label="Информация и предпросмотр выгрузки">
          <CardComponent as="section" className="rail-panel rail-summary magic-export-summary">
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
          <CardComponent as="section" className="export-preview magic-export-preview" aria-label="Предпросмотр Эксель">
            <div className="preview-header">
              <div>
                <p className="kicker">Пакет выгрузки</p>
                <h2>{exportPackageTitle(exportPlan)}</h2>
                <p className="export-package-line">{exportPackageLine(exportPlan)}</p>
              </div>
              <Badge className={exportPlan.ready ? "visa-tag visa-tag-ready" : "visa-tag visa-tag-danger"}>
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
