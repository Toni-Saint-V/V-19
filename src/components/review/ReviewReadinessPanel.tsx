import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";

type ReviewReadinessPanelProps = {
  closedIssueCount: number;
  filledFieldCount: number;
  fixedIssueCount: number;
  mediaReadyCount: number;
  mediaTotal: number;
  mediaLoadingCount: number;
  mediaUnavailableCount: number;
  onNextStep: () => void;
  openIssueCount: number;
  packageGuardReason: string;
  readOnly: boolean;
  totalFieldCount: number;
};

function readinessHeadline({
  filledFieldCount,
  mediaReadyCount,
  mediaTotal,
  openIssueCount,
  readOnly,
  totalFieldCount,
}: Pick<
  ReviewReadinessPanelProps,
  | "filledFieldCount"
  | "mediaReadyCount"
  | "mediaTotal"
  | "openIssueCount"
  | "readOnly"
  | "totalFieldCount"
>) {
  if (readOnly) return "Просмотр без изменений";
  if (openIssueCount > 0) return "Ждём исправление от агента";
  if (mediaReadyCount < mediaTotal) return "Нужны защищённые оригиналы";
  if (filledFieldCount < totalFieldCount) return "Есть неполные паспортные данные";
  return "Паспортная секция готова к подтверждению";
}

export function ReviewReadinessPanel({
  closedIssueCount,
  filledFieldCount,
  fixedIssueCount,
  mediaReadyCount,
  mediaTotal,
  mediaLoadingCount,
  mediaUnavailableCount,
  onNextStep,
  openIssueCount,
  packageGuardReason,
  readOnly,
  totalFieldCount,
}: ReviewReadinessPanelProps) {
  const headline = readinessHeadline({
    filledFieldCount,
    mediaReadyCount,
    mediaTotal,
    openIssueCount,
    readOnly,
    totalFieldCount,
  });
  const mediaStatusLabel = [
    mediaUnavailableCount > 0 ? `недоступно ${mediaUnavailableCount}` : "",
    mediaLoadingCount > 0 ? `загружается ${mediaLoadingCount}` : "",
    `доступно ${mediaReadyCount} из ${mediaTotal}`,
  ]
    .filter(Boolean)
    .join("; ");

  return (
    <section
      aria-label="Готовность паспортной проверки"
      className={`v19-review-readiness${readOnly ? " is-read-only" : ""}`}
    >
      <div className="v19-review-readiness-primary">
        <span aria-hidden="true" className="v19-review-readiness-icon">
          <ScanSearch />
        </span>
        <div className="v19-review-readiness-copy">
          <span className="v19-review-guard-label">Контроль проверки</span>
          <h2>{headline}</h2>
          <p>Показаны только факты из паспортного и пакетного guard.</p>
          {readOnly ? null : (
            <button
              className="v19-review-next-step"
              onClick={onNextStep}
              type="button"
            >
              Перейти к следующему незавершённому шагу
            </button>
          )}
        </div>
      </div>

      <div aria-label="Состояние проверки" className="v19-review-status-strip" role="status">
        <span className={filledFieldCount < totalFieldCount ? "has-warning" : undefined}>
          <CheckCircle2 aria-hidden="true" />
          Поля <strong>{filledFieldCount}/{totalFieldCount}</strong>
        </span>
        <span className={openIssueCount ? "has-warning" : undefined}>
          <AlertCircle aria-hidden="true" />
          Открыто <strong>{openIssueCount}</strong>
        </span>
        <span
          aria-label={`Оригиналы: ${mediaStatusLabel}`}
          className={
            mediaUnavailableCount > 0
              ? "has-warning"
              : mediaLoadingCount > 0
                ? "is-loading"
                : undefined
          }
        >
          <ShieldCheck aria-hidden="true" />
          Оригиналы <strong>{mediaReadyCount}/{mediaTotal}</strong>
        </span>
      </div>

      <div aria-label="Lifecycle замечаний" className="v19-review-issue-lifecycle">
        <span><strong>{openIssueCount}</strong> открыто</span>
        <span><strong>{fixedIssueCount}</strong> исправлено агентом</span>
        <span><strong>{closedIssueCount}</strong> закрыто администратором</span>
      </div>

      <div className="v19-review-questionnaire-entry">
        <FileSpreadsheet aria-hidden="true" />
        <span>
          <strong>Пакетный guard</strong>
          <small>{packageGuardReason}</small>
        </span>
      </div>
    </section>
  );
}
