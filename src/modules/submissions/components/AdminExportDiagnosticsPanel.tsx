import { XCircle } from "lucide-react";

const defaultRecoveryAction =
  "Обновите страницу. Если ошибка сохраняется, передайте администратору текст причины и ID пакета.";

function exportRecoveryAction(reason: string) {
  const normalizedReason = reason.toLowerCase();

  if (normalizedReason.includes("разные города")) {
    return "Оставьте в выборе подачи одного города и сформируйте отдельный пакет для остальных.";
  }
  if (normalizedReason.includes("контракт excel a:bd")) {
    return "Обновите страницу и повторите действие. Если ошибка сохраняется, передайте её администратору — данные пакета менять не нужно.";
  }
  if (normalizedReason.includes("уже выгруженные подачи")) {
    return "Уберите уже выгруженные подачи из выбора или откройте их в истории выгрузок.";
  }
  if (normalizedReason.includes("подачи без заявителей")) {
    return "Добавьте хотя бы одного заявителя в пакет и снова запустите проверку.";
  }
  if (
    normalizedReason.includes("выбор изменился") ||
    normalizedReason.includes("данные изменились") ||
    normalizedReason.includes("устарел") ||
    normalizedReason.includes("внутреннюю проверку")
  ) {
    return "Проверьте текущий состав пакета и сформируйте файл заново.";
  }
  if (normalizedReason.includes("канонического пакета медиа")) {
    return "Откройте пакет в «Проверке» и добавьте или примите обязательные документы.";
  }
  if (normalizedReason.includes("повторяется номер паспорта")) {
    return "Сверьте паспорта заявителей, исправьте повторяющийся номер и подтвердите проверку.";
  }
  if (normalizedReason.includes("повторяются фио")) {
    return "Сверьте данные заявителей, исправьте повторяющиеся ФИО и снова запустите проверку.";
  }
  if (normalizedReason.includes("способ оплаты")) {
    return "Откройте анкету пакета, выберите поддерживаемый способ оплаты и снова запустите проверку.";
  }
  if (normalizedReason.includes("паспорт")) {
    return "Откройте паспорт в «Проверке», исправьте данные и подтвердите результат проверки.";
  }
  if (
    normalizedReason.includes("анкеты") ||
    normalizedReason.includes("bls-проверку") ||
    normalizedReason.includes("заявители без фио") ||
    normalizedReason.includes("телефон заявителя") ||
    normalizedReason.includes("email и телефон") ||
    normalizedReason.includes("без дат поездки")
  ) {
    return "Откройте анкету пакета, исправьте отмеченные поля и снова запустите проверку.";
  }
  if (normalizedReason.includes("замечания")) {
    return "Закройте блокирующие замечания в «Проверке», затем вернитесь к выгрузке.";
  }
  if (
    normalizedReason.includes("не готовые к выгрузке") ||
    normalizedReason.includes("разные состояния выгрузки")
  ) {
    return "Завершите проверку пакета до статуса «Готов к выгрузке» и повторите действие.";
  }

  return defaultRecoveryAction;
}

export function AdminExportDiagnosticsPanel({
  onShowPackage,
  reasons,
  title,
}: {
  onShowPackage?: () => void;
  reasons: string[];
  title: string;
}) {
  const uniqueReasons = [...new Set(reasons)];
  const firstReason = uniqueReasons[0];
  const firstAction = firstReason ? exportRecoveryAction(firstReason) : "";

  if (uniqueReasons.length === 0) return null;

  return (
    <section
      aria-label="Почему выгрузка остановлена"
      className="rounded-2xl border border-[var(--v19b-admin-red-border)] bg-[var(--v19b-admin-red-soft)] p-4"
      data-testid="export-blocker-diagnostics"
    >
      <p aria-atomic="true" className="sr-only" role="alert">
        {title}. {firstReason}. {firstAction}
      </p>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--v19b-admin-red-soft)] text-[var(--v19b-admin-red)]">
          <XCircle aria-hidden="true" className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--v19b-admin-red)]">
            Выгрузка остановлена
          </div>
          <h4 className="mt-1 text-[15px] font-semibold text-white">{title}</h4>
          <p className="mt-1 text-[12px] leading-relaxed text-white/55">
            Исправьте причины ниже. До этого Excel и статусы подач не изменятся.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {uniqueReasons.map((reason) => (
          <div
            className="rounded-xl border border-[var(--v19b-admin-red-border)] bg-black/10 px-3 py-2.5"
            key={reason}
          >
            <div className="text-[12px] font-semibold leading-snug text-white/88">
              {reason}
            </div>
            <div className="mt-2 border-t border-white/5 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Что сделать
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-white/68">
                {exportRecoveryAction(reason)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {onShowPackage ? (
        <button
          className="mt-3 h-9 rounded-[9px] border border-[var(--v19b-admin-red-border)] bg-[#1e1e21] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#27272b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
          onClick={onShowPackage}
          type="button"
        >
          Показать пакет в очереди
        </button>
      ) : null}
    </section>
  );
}
