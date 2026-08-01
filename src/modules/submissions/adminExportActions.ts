export type AdminExportActionKind = "prepare_excel" | "download_excel" | "download_zip";

export type AdminActionTone = "danger" | "info" | "success" | "warning";

export type AdminExportActionFeedback = {
  canRun: boolean;
  message: string;
  nextAction: string;
  tone: AdminActionTone;
};

export const adminDocumentPackageExportEnabled = false;

export function assertAdminDocumentPackageExportEnabled() {
  if (!adminDocumentPackageExportEnabled) {
    throw new Error("Действие недоступно в текущем статусе");
  }
}

const actionLabel: Record<AdminExportActionKind, string> = {
  prepare_excel: "сформировать Excel",
  download_excel: "скачать Excel",
  download_zip: "скачать ZIP с Excel",
};

const actionNextLabel: Record<AdminExportActionKind, string> = {
  prepare_excel: "Сформировать Excel",
  download_excel: "Скачать Excel",
  download_zip: "Скачать ZIP с Excel",
};

export function describeAdminExportActionFeedback({
  action,
  blockerReasons,
  isExporting = false,
  prepared = false,
  selectedCount,
}: {
  action: AdminExportActionKind;
  blockerReasons: string[];
  isExporting?: boolean;
  prepared?: boolean;
  selectedCount: number;
}): AdminExportActionFeedback {
  if (isExporting) {
    return {
      canRun: false,
      message: "Идёт формирование пакета. Дождитесь завершения текущего действия.",
      nextAction: "Дождаться завершения",
      tone: "info",
    };
  }

  if (action === "download_zip" && !adminDocumentPackageExportEnabled) {
    return {
      canRun: false,
      message: "Действие недоступно в текущем статусе",
      nextAction: "Сформировать Excel",
      tone: "warning",
    };
  }

  if (selectedCount === 0) {
    return {
      canRun: false,
      message:
        "Выберите хотя бы один пакет слева — после выбора кнопки выполнят действие сразу.",
      nextAction: "Выбрать пакет",
      tone: "warning",
    };
  }

  if (blockerReasons.length > 0) {
    const firstReason = blockerReasons[0] ?? "Открытый блокер";
    return {
      canRun: false,
      message: `Нельзя ${actionLabel[action]}: ${firstReason}`,
      nextAction: "Закрыть блокеры",
      tone: "danger",
    };
  }

  if (action === "download_zip" && !prepared) {
    return {
      canRun: true,
      message:
        "Excel будет сформирован автоматически, затем соберётся ZIP с документами.",
      nextAction: "Excel → ZIP",
      tone: "success",
    };
  }

  return {
    canRun: true,
    message:
      action === "prepare_excel"
        ? "Можно формировать Excel preview для выбранной выгрузки."
        : action === "download_excel"
          ? "Можно скачать Excel для выбранной выгрузки."
          : "Можно скачать ZIP с Excel и документами.",
    nextAction: actionNextLabel[action],
    tone: "success",
  };
}

export function exportActionNoticeId(action: AdminExportActionKind) {
  return `admin-export-action:${action}`;
}
