import {
  buildExportWorkbookMatrix,
  exportContractFingerprint,
  type ExportContractRow,
} from "../../lib/export/exportContractCore";
import {
  createExportWorkbookBlob,
  EXPORT_WORKBOOK_CONTENT_TYPE,
} from "../../lib/export/exportWorkbookCore";
import type { ExportPackageIdentity } from "./types";

export type ExportWorkbookDownloadResult =
  | { ok: true; fileName: string }
  | {
      ok: false;
      reason: "download_failed" | "export_not_ready" | "row_mismatch";
      safeMessage: string;
    };

type BrowserDownloadRuntime = typeof globalThis & {
  URL: {
    createObjectURL(blob: Blob): string;
    revokeObjectURL(url: string): void;
  };
  document: {
    body: { append(node: unknown): void };
    createElement(tagName: "a"): {
      click(): void;
      download: string;
      href: string;
      rel: string;
      remove(): void;
    };
  };
  setTimeout(callback: () => void, timeout: number): unknown;
};

export default function downloadExportWorkbook(
  rows: ExportContractRow[],
  identity: ExportPackageIdentity | null,
): ExportWorkbookDownloadResult {
  if (!identity || identity.rowCount < 1) {
    return {
      ok: false,
      reason: "export_not_ready",
      safeMessage: "Сначала сформируйте файл выгрузки для текущей выборки.",
    };
  }

  if (
    identity.rowCount !== rows.length ||
    identity.contentFingerprint !== exportContractFingerprint(rows, identity.format)
  ) {
    return {
      ok: false,
      reason: "row_mismatch",
      safeMessage: "Предпросмотр устарел. Обновите выборку и сформируйте файл заново.",
    };
  }

  const blob = createExportWorkbookBlob(buildExportWorkbookMatrix(rows));
  const runtime = globalThis as BrowserDownloadRuntime;
  let url = "";

  try {
    url = runtime.URL.createObjectURL(blob);
    const link = runtime.document.createElement("a");
    link.href = url;
    link.download = identity.fileName;
    link.rel = "noopener";
    runtime.document.body.append(link);
    link.click();
    link.remove();
    runtime.setTimeout(() => runtime.URL.revokeObjectURL(url), 0);
    return { ok: true, fileName: identity.fileName };
  } catch {
    if (url) runtime.URL.revokeObjectURL(url);
    return {
      ok: false,
      reason: "download_failed",
      safeMessage: "Не удалось подготовить файл Эксель. Повторите формирование.",
    };
  }
}

export { EXPORT_WORKBOOK_CONTENT_TYPE };
