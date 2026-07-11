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
    parsed.dimension === `A1:BD${artifact.rows.length}` &&
    canonicalWorkbookLayoutMatches(parsed, artifact.rows.length) &&
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

function canonicalWorkbookLayoutMatches(
  parsed: ParsedExportWorkbook,
  expectedRowCount: number,
): boolean {
  const layout = parsed.layout;
  return (
    layout.autoFilter === `ref=A1:BD${expectedRowCount}` &&
    layout.borderCount === 9 &&
    layout.cellXfCount === 84 &&
    layout.columnCount === EXPORT_WORKBOOK_COLUMN_COUNT &&
    layout.conditionalFormattingCount === 3 &&
    layout.dataRowsMatchCanonicalStyle &&
    layout.dxfCount === 3 &&
    layout.fillCount === 11 &&
    layout.fontCount === 8 &&
    layout.freezePane ===
      "activePane=bottomLeft|state=frozen|topLeftCell=A2|ySplit=1" &&
    !layout.hasBeCells &&
    !layout.hasExcelMaximumRowSentinel &&
    layout.headerRowMatchesCanonicalStyle &&
    layout.pageMargins ===
      "bottom=0.75|footer=0.3|header=0.3|left=0.7|right=0.7|top=0.75" &&
    layout.rowElementCount === expectedRowCount &&
    layout.sheetFormat ===
      "defaultColWidth=40.5703125|defaultRowHeight=15|x14ac:dyDescent=0.25" &&
    layout.sheetView ===
      "tabSelected=1|workbookViewId=0|zoomScale=85|zoomScaleNormal=85" &&
    layout.workbookView ===
      "windowHeight=14745|windowWidth=15960|xWindow=7590|yWindow=735"
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
