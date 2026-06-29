import {
  buildExportWorkbookMatrix,
  EXPORT_WORKBOOK_COLUMN_COUNT,
  EXPORT_WORKBOOK_RANGE,
  EXPORT_WORKBOOK_SHEET_NAME,
  EXPECTED_EXPORT_CONTRACT_HEADERS,
  exportContractFingerprint,
  exportContractHeaders,
  type ExportContractRow,
} from "../../lib/export/exportContractCore";
import {
  createExportWorkbookBlob,
  EXPORT_WORKBOOK_CONTENT_TYPE,
  parseExportWorkbookBlob,
  type ExportWorkbookRowFill,
  type ParsedExportWorkbook,
} from "../../lib/export/exportWorkbookCore";
import type { ExportPackageIdentity } from "./types";

export {
  createExportWorkbookBlob,
  EXPORT_WORKBOOK_CONTENT_TYPE,
  type ParsedExportWorkbook,
} from "../../lib/export/exportWorkbookCore";
export const exportWorkbookColumns = exportContractHeaders();

export type ExportWorkbookArtifact = {
  blob: Blob;
  contentType: string;
  fileName: string;
  range: typeof EXPORT_WORKBOOK_RANGE;
  rowFills: Array<ExportWorkbookRowFill | null>;
  rows: string[][];
  sheetName: typeof EXPORT_WORKBOOK_SHEET_NAME;
};

export type ExportWorkbookBlockedReason =
  | "download_failed"
  | "export_not_ready"
  | "row_mismatch";

export type ExportWorkbookDownloadResult =
  | { ok: true; fileName: string }
  | {
      ok: false;
      reason: ExportWorkbookBlockedReason;
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

export function buildExportWorkbookRows(rows: ExportContractRow[]): string[][] {
  return buildExportWorkbookMatrix(rows);
}

export function buildExportWorkbookRowFills(
  rows: ExportContractRow[],
): Array<ExportWorkbookRowFill | null> {
  const familyFillsBySubmission = new Map<string, ExportWorkbookRowFill>();
  let familyIndex = 0;

  return [
    null,
    ...rows.map((row) => {
      if (row.appointmentType !== "Family") return null;

      const familyKey = row.familyGroupId ?? row.familySubmissionId ?? row.submissionId;
      const existing = familyFillsBySubmission.get(familyKey);
      if (existing) return existing;

      const fill = `family-${familyIndex + 1}` as ExportWorkbookRowFill;
      familyFillsBySubmission.set(familyKey, fill);
      familyIndex += 1;
      return fill;
    }),
  ];
}

export function createExportWorkbookArtifact(
  rows: ExportContractRow[],
  identity: ExportPackageIdentity,
): ExportWorkbookArtifact {
  const workbookRows = buildExportWorkbookRows(rows);
  const rowFills = buildExportWorkbookRowFills(rows);
  const blob = createExportWorkbookBlob(workbookRows, { rowFills });

  return {
    blob,
    contentType: EXPORT_WORKBOOK_CONTENT_TYPE,
    fileName: identity.fileName,
    range: EXPORT_WORKBOOK_RANGE,
    rowFills,
    rows: workbookRows,
    sheetName: EXPORT_WORKBOOK_SHEET_NAME,
  };
}

export async function parseExportWorkbookArtifact(
  artifact: Pick<ExportWorkbookArtifact, "blob">,
): Promise<ParsedExportWorkbook> {
  return parseExportWorkbookBlob(artifact.blob);
}

export async function verifyExportWorkbookArtifact(
  artifact: ExportWorkbookArtifact,
): Promise<boolean> {
  const parsed = await parseExportWorkbookArtifact(artifact);

  return (
    artifact.sheetName === EXPORT_WORKBOOK_SHEET_NAME &&
    parsed.sheetName === EXPORT_WORKBOOK_SHEET_NAME &&
    artifact.range === EXPORT_WORKBOOK_RANGE &&
    parsed.dimension === `A1:BD${artifact.rows.length}` &&
    parsed.rows[0]?.length === EXPORT_WORKBOOK_COLUMN_COUNT &&
    parsed.rows[0].every(
      (value, index) => value === EXPECTED_EXPORT_CONTRACT_HEADERS[index],
    ) &&
    parsed.rows.length === artifact.rows.length &&
    parsed.rowFills.length === artifact.rowFills.length &&
    parsed.rowFills.every((fill, rowIndex) => fill === artifact.rowFills[rowIndex]) &&
    parsed.rows.every(
      (row, rowIndex) =>
        row.length === artifact.rows[rowIndex]?.length &&
        row.every(
          (value, columnIndex) => value === artifact.rows[rowIndex]?.[columnIndex],
        ),
    )
  );
}

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

  const artifact = createExportWorkbookArtifact(rows, identity);

  const runtime = globalThis as BrowserDownloadRuntime;
  let url = "";

  try {
    url = runtime.URL.createObjectURL(artifact.blob);
    const link = runtime.document.createElement("a");
    link.href = url;
    link.download = artifact.fileName;
    link.rel = "noopener";
    runtime.document.body.append(link);
    link.click();
    link.remove();
    runtime.setTimeout(() => runtime.URL.revokeObjectURL(url), 0);
    return { ok: true, fileName: artifact.fileName };
  } catch {
    if (url) runtime.URL.revokeObjectURL(url);
    return {
      ok: false,
      reason: "download_failed",
      safeMessage: "Не удалось подготовить файл Эксель. Повторите формирование.",
    };
  }
}
