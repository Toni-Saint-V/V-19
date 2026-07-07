import {
  EXPORT_WORKBOOK_COLUMN_COUNT,
  EXPORT_WORKBOOK_RANGE,
  EXPORT_WORKBOOK_SHEET_NAME,
  EXPECTED_EXPORT_CONTRACT_HEADERS,
} from "../../lib/export/exportContractCore";
import {
  parseExportWorkbookBlob,
  type ExportWorkbookRowFill,
  type ParsedExportWorkbook,
} from "../../lib/export/exportWorkbookCore";
import type { ExportWorkbookArtifact } from "./exportWorkbook";

export type { ParsedExportWorkbook } from "../../lib/export/exportWorkbookCore";

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
    parsed.dimension === "A1:BE1048572" &&
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
          (value, columnIndex) =>
            value ===
            expectedParsedWorkbookValue(
              artifact.rows,
              artifact.rowFills,
              rowIndex,
              columnIndex,
            ),
        ),
    )
  );
}

function expectedParsedWorkbookValue(
  rows: string[][],
  rowFills: Array<ExportWorkbookRowFill | null>,
  rowIndex: number,
  columnIndex: number,
) {
  const value = rows[rowIndex]?.[columnIndex] ?? "";
  if (
    columnIndex === 54 &&
    rows[rowIndex]?.[54] === "Family" &&
    rowFills[rowIndex]
  ) {
    return "Family";
  }
  return value;
}
