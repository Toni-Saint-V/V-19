import { EXPORT_WORKBOOK_SHEET_NAME } from "./exportContractCore";

export const EXPORT_WORKBOOK_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ExportWorkbookRowFill = `family-${number}`;

export type ParsedExportWorkbook = {
  dimension: string;
  rowFills: Array<ExportWorkbookRowFill | null>;
  rows: string[][];
  sheetName: string;
};

export type CreateExportWorkbookBlobOptions = {
  rowFills?: readonly (ExportWorkbookRowFill | null | undefined)[];
};

const templateDataRowLimit = 216;
const templateFinalRow = 1_048_572;
const templateColumnCount = 56;
const templateVisibleColumnCount = 57;
const dateColumnNames = new Set(["L", "R", "T", "U", "AJ", "AK"]);
const numericColumnNames = new Set([
  "F",
  "G",
  "Z",
  "AA",
  "AD",
  "AH",
  "AO",
  "AR",
  "AW",
  "AZ",
]);
const familyStyleBaseId = 52;
const familyStyleVariantCount = 4;
const familyWorkbookFills = [
  "C6E0B4",
  "FFF2CC",
  "BDD7EE",
  "F4CCCC",
  "D9EAD3",
  "D9D2E9",
  "FCE5CD",
  "CFE2F3",
] as const;

export function createExportWorkbookBlob(
  workbookRows: readonly (readonly string[])[],
  options: CreateExportWorkbookBlobOptions = {},
): Blob {
  const rowFills = options.rowFills ?? [];
  const sharedStrings = buildSharedStrings(workbookRows);
  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": packageRelsXml(),
    "xl/workbook.xml": workbookXml(),
    "xl/_rels/workbook.xml.rels": workbookRelsXml(),
    "xl/styles.xml": stylesXml(),
    "xl/theme/theme1.xml": themeXml(),
    "xl/sharedStrings.xml": sharedStringsXml(sharedStrings),
    "xl/worksheets/sheet1.xml": worksheetXml(workbookRows, rowFills, sharedStrings),
    "xl/worksheets/_rels/sheet1.xml.rels": worksheetRelsXml(),
    "docProps/app.xml": appPropertiesXml(),
    "docProps/core.xml": corePropertiesXml(),
  };
  const zip = zipStore(files);
  const buffer = new ArrayBuffer(zip.byteLength);
  new Uint8Array(buffer).set(zip);

  return new Blob([buffer], { type: EXPORT_WORKBOOK_CONTENT_TYPE });
}

export async function parseExportWorkbookBlob(
  blob: Blob,
): Promise<ParsedExportWorkbook> {
  const files = unzipStore(await blob.arrayBuffer());
  const workbook = files["xl/workbook.xml"] ?? "";
  const worksheet = files["xl/worksheets/sheet1.xml"] ?? "";
  const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"] ?? "");
  const sheetName = workbook.match(/<sheet[^>]+name="([^"]+)"/)?.[1] ?? "";
  const dimension = worksheet.match(/<dimension[^>]+ref="([^"]+)"/)?.[1] ?? "";
  const parsedRows = parseWorksheetRows(worksheet, sharedStrings);

  return {
    dimension,
    rowFills: parseWorksheetRowFills(parsedRows),
    rows: parsedRows.map((row) => row.values),
    sheetName,
  };
}

function contentTypesXml(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
}

function packageRelsXml(): string {
  return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl" lastEdited="7" lowestEdited="6" rupBuild="27932"/><workbookPr/><bookViews><workbookView xWindow="7590" yWindow="735" windowWidth="15960" windowHeight="14745"/></bookViews><sheets><sheet name="${EXPORT_WORKBOOK_SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Sheet1!$A$1:$BE$216</definedName></definedNames><calcPr calcId="162913"/></workbook>`;
}

function workbookRelsXml(): string {
  return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
}

function stylesXml(): string {
  const baseXfs = Array.from({ length: 52 }, (_, index) => {
    const dateStyle = [2, 5, 15, 16, 29, 35, 44].includes(index);
    const fillId = index === 1 || index === 2 || index === 3 ? 2 : 0;
    return `<xf numFmtId="${dateStyle ? 164 : 0}" fontId="0" fillId="${fillId}" borderId="1" xfId="0"${dateStyle ? ' applyNumberFormat="1"' : ""}/>`;
  }).join("");
  const familyXfs = familyWorkbookFills.flatMap((_, paletteIndex) => {
    const fillId = paletteIndex + 3;
    return [
      `<xf numFmtId="0" fontId="0" fillId="${fillId}" borderId="1" xfId="0" applyFill="1"/>`,
      `<xf numFmtId="0" fontId="0" fillId="${fillId}" borderId="1" xfId="0" applyFill="1"/>`,
      `<xf numFmtId="164" fontId="0" fillId="${fillId}" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1"/>`,
      `<xf numFmtId="0" fontId="0" fillId="${fillId}" borderId="1" xfId="0" applyFill="1"/>`,
    ];
  }).join("");
  const familyFills = familyWorkbookFills
    .map(
      (rgb) =>
        `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd;@"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts><fills count="${3 + familyWorkbookFills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.59999389629810485"/><bgColor indexed="64"/></patternFill></fill>${familyFills}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${52 + familyWorkbookFills.length * familyStyleVariantCount}">${baseXfs}${familyXfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function worksheetXml(
  rows: readonly (readonly string[])[],
  rowFills: readonly (ExportWorkbookRowFill | null | undefined)[],
  sharedStrings: ReadonlyMap<string, number>,
): string {
  const dataRows = rows.slice(1);
  const templateRows = [
    headerRowXml(rows[0] ?? [], sharedStrings),
    ...dataRows.map((row, index) =>
      dataRowXml(
        row,
        index + 2,
        rowFills[index + 1] ?? null,
        rowFills[index] ?? null,
        sharedStrings,
      ),
    ),
    ...blankTemplateRowsXml(rows, Math.max(dataRows.length + 2, 4), sharedStrings),
    `<row r="${templateFinalRow}" spans="57:57"><c r="BE${templateFinalRow}" s="4" t="s"><v>${sharedStringIndex(sharedStrings, "NA")}</v></c></row>`,
  ].join("");
  const mergeCells = familyMergeCells(rowFills);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:BE1048572"/><sheetViews><sheetView tabSelected="1" zoomScale="85" zoomScaleNormal="85" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="F16" sqref="F16"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="40.5703125" defaultRowHeight="15"/><cols>${templateColumnsXml()}</cols><sheetData>${templateRows}</sheetData><autoFilter ref="A1:BE216"/>${mergeCells}<phoneticPr fontId="1" type="noConversion"/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

function headerRowXml(
  row: readonly string[],
  sharedStrings: ReadonlyMap<string, number>,
): string {
  const cells = Array.from({ length: templateVisibleColumnCount }, (_, index) => {
    const column = columnName(index + 1);
    if (index >= templateColumnCount) return `<c r="${column}1" s="1"/>`;
    const styleId = dateColumnNames.has(column) ? 2 : 1;
    return sharedStringCell(column, 1, row[index] ?? "", sharedStrings, styleId);
  }).join("");
  return `<row r="1" spans="1:57" s="3" customFormat="1" ht="45.75" thickBot="1">${cells}</row>`;
}

function dataRowXml(
  row: readonly string[],
  rowNumber: number,
  rowFill: ExportWorkbookRowFill | null,
  previousRowFill: ExportWorkbookRowFill | null,
  sharedStrings: ReadonlyMap<string, number>,
): string {
  const isFirstFamilyRow = Boolean(rowFill) && rowFill !== previousRowFill;
  const cells = Array.from({ length: templateVisibleColumnCount }, (_, index) => {
    const column = columnName(index + 1);
    if (index >= templateColumnCount) {
      return `<c r="${column}${rowNumber}" s="${rowFill ? familyStyleId("", rowFill) : 33}"/>`;
    }

    let value = row[index] ?? "";
    if (column === "BC" && rowFill) {
      value = isFirstFamilyRow ? familyAppointmentNote(row) : "";
    }

    return templateCell(
      column,
      rowNumber,
      value,
      sharedStrings,
      rowFill ? familyStyleId(column, rowFill) : dataStyleId(column),
    );
  }).join("");
  return `<row r="${rowNumber}" spans="1:57" s="40" customFormat="1">${cells}</row>`;
}

function blankTemplateRowsXml(
  rows: readonly (readonly string[])[],
  startRow: number,
  sharedStrings: ReadonlyMap<string, number>,
): string[] {
  const firstDataRow = rows[1] ?? [];
  const defaults = [
    firstDataRow[0] || "SPB",
    firstDataRow[1] || "Schengen",
    firstDataRow[2] || "Tourism",
    firstDataRow[3] || "Normal",
  ];
  const result: string[] = [];
  for (let rowNumber = startRow; rowNumber <= 219; rowNumber += 1) {
    const cells = Array.from({ length: templateColumnCount }, (_, index) => {
      const column = columnName(index + 1);
      const value = index < defaults.length && rowNumber <= templateDataRowLimit
        ? defaults[index]
        : "";
      return templateCell(column, rowNumber, value, sharedStrings, blankStyleId(column));
    }).join("");
    result.push(`<row r="${rowNumber}" spans="1:56" s="12" customFormat="1">${cells}</row>`);
  }
  return result;
}

function templateCell(
  column: string,
  rowNumber: number,
  value: string,
  sharedStrings: ReadonlyMap<string, number>,
  styleId: number,
): string {
  const cellRef = `${column}${rowNumber}`;
  if (!value) return `<c r="${cellRef}" s="${styleId}"/>`;
  if (dateColumnNames.has(column)) {
    const serial = excelSerialDate(value);
    if (serial !== null) return `<c r="${cellRef}" s="${styleId}"><v>${serial}</v></c>`;
  }
  if (numericColumnNames.has(column) && /^\d+$/.test(value)) {
    return `<c r="${cellRef}" s="${styleId}"><v>${value}</v></c>`;
  }
  return sharedStringCell(column, rowNumber, value, sharedStrings, styleId);
}

function sharedStringCell(
  column: string,
  rowNumber: number,
  value: string,
  sharedStrings: ReadonlyMap<string, number>,
  styleId: number,
): string {
  return `<c r="${column}${rowNumber}" s="${styleId}" t="s"><v>${sharedStringIndex(
    sharedStrings,
    value,
  )}</v></c>`;
}

function dataStyleId(column: string) {
  if (dateColumnNames.has(column)) return 35;
  if (column === "E" || column === "AP" || column === "AY") return 34;
  if (column === "BC") return 50;
  return 33;
}

function familyStyleId(column: string, rowFill: ExportWorkbookRowFill) {
  const styleBaseId =
    familyStyleBaseId +
    familyWorkbookFillIndex(rowFill) * familyStyleVariantCount;
  if (dateColumnNames.has(column)) return styleBaseId + 2;
  if (column === "E" || column === "AP" || column === "AY") {
    return styleBaseId + 1;
  }
  if (column === "BC") return styleBaseId + 3;
  return styleBaseId;
}

function familyWorkbookFillIndex(rowFill: ExportWorkbookRowFill): number {
  const parsedIndex = Number(rowFill.slice("family-".length));
  if (!Number.isSafeInteger(parsedIndex) || parsedIndex < 1) return 0;
  return (parsedIndex - 1) % familyWorkbookFills.length;
}

function blankStyleId(column: string) {
  if (dateColumnNames.has(column)) return 15;
  if (column === "E" || column === "AP" || column === "AY") return 11;
  return 11;
}

function familyAppointmentNote(row: readonly string[]) {
  return `FAMILY \r\nPLEASE SCHEDULE FROM ${row[35] || ""} TILL ${row[36] || ""}`.trim();
}

function familyMergeCells(
  rowFills: readonly (ExportWorkbookRowFill | null | undefined)[],
) {
  const ranges: string[] = [];
  let index = 1;
  while (index < rowFills.length) {
    const fill = rowFills[index];
    if (!fill) {
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < rowFills.length && rowFills[end + 1] === fill) {
      end += 1;
    }
    if (end > index) ranges.push(`BC${index + 1}:BC${end + 1}`);
    index = end + 1;
  }
  if (!ranges.length) return "";
  return `<mergeCells count="${ranges.length}">${ranges
    .map((range) => `<mergeCell ref="${range}"/>`)
    .join("")}</mergeCells>`;
}

function templateColumnsXml() {
  const widths = [
    "10.5703125", "10.7109375", "10.42578125", "23.140625", "30.5703125",
    "21.140625", "16", "17.7109375", "17.7109375", "16", "17",
    "20.7109375", "25.42578125", "14", "14.28515625", "16.5703125",
    "22.28515625", "19.28515625", "24.42578125", "25.5703125",
    "26.28515625", "24.140625", "28.140625", "37.7109375", "39.140625",
    "15.140625", "14.7109375", "14", "50.5703125", "15.7109375",
    "41.7109375", "34.7109375", "31.140625", "15.85546875",
    "49.85546875", "18.140625", "20.85546875", "45.140625",
    "19.140625", "16.140625", "19.5703125", "30", "19.28515625",
    "21.28515625", "19.5703125", "19.28515625", "17.42578125",
    "14.5703125", "17.85546875", "40.28515625", "38.85546875",
    "16.7109375", "26.28515625", "37.7109375", "57.140625",
    "40.5703125",
  ];
  return `${widths
    .map((width, index) => {
      const column = index + 1;
      const style = dateColumnNames.has(columnName(column)) ? 16 : 13;
      return `<col min="${column}" max="${column}" width="${width}" style="${style}" customWidth="1"/>`;
    })
    .join("")}<col min="57" max="16384" width="40.5703125" style="14"/>`;
}

function excelSerialDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date)) return null;
  return Math.round(date / 86_400_000 + 25_569);
}

function buildSharedStrings(
  rows: readonly (readonly string[])[],
): Map<string, number> {
  const strings = new Map<string, number>();
  const add = (value: string) => {
    if (!strings.has(value)) strings.set(value, strings.size);
  };
  rows.forEach((row) => row.forEach((value) => add(value)));
  ["SPB", "Schengen", "Tourism", "Normal", "NA"].forEach(add);
  rows.slice(1).forEach((row) => {
    if (row[54] === "Family") add(familyAppointmentNote(row));
  });
  return strings;
}

function sharedStringIndex(sharedStrings: ReadonlyMap<string, number>, value: string) {
  const index = sharedStrings.get(value);
  if (index === undefined) throw new Error(`Missing shared string: ${value}`);
  return index;
}

function sharedStringsXml(sharedStrings: ReadonlyMap<string, number>) {
  const values = [...sharedStrings.entries()]
    .sort(([, left], [, right]) => left - right)
    .map(([value]) => `<si><t>${escapeXml(value)}</t></si>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.size}" uniqueCount="${sharedStrings.size}">${values}</sst>`;
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map((match) =>
    [...(match[1] ?? "").matchAll(/<t[^>]*>(.*?)<\/t>/gs)]
      .map((textMatch) => unescapeXml(textMatch[1] ?? ""))
      .join(""),
  );
}

function themeXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>';
}

function worksheetRelsXml() {
  return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Листы</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Sheet1</vt:lpstr></vt:vector></TitlesOfParts><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>`;
}

function corePropertiesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>VisaFlow</dc:creator><cp:lastModifiedBy>VisaFlow</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2015-06-05T18:17:20Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-06-23T06:38:27Z</dcterms:modified></cp:coreProperties>';
}

function columnName(index: number): string {
  let value = "";
  let current = index;
  while (current > 0) {
    const mod = (current - 1) % 26;
    value = String.fromCharCode(65 + mod) + value;
    current = Math.floor((current - mod) / 26);
  }
  return value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unzipStore(buffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const files: Record<string, string> = {};
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const signature = view.getUint32(0, true);
    if (signature !== 0x04034b50) break;

    const dataLength = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const fileName = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    files[fileName] = decoder.decode(bytes.slice(dataStart, dataStart + dataLength));
    offset = dataStart + dataLength;
  }

  return files;
}

function parseWorksheetRows(
  xml: string,
  sharedStrings: readonly string[],
): Array<{ familyStart: boolean; rowNumber: number; values: string[] }> {
  const familyRows = familyRowsFromMergeCells(xml);
  const rows: Array<{ familyStart: boolean; rowNumber: number; values: string[] }> = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    const rowNumber = Number(rowMatch[1]);
    if (!Number.isFinite(rowNumber) || rowNumber > templateDataRowLimit) continue;

    const values = Array.from({ length: templateColumnCount }, () => "");
    const body = rowMatch[2] ?? "";
    for (const cell of parseWorksheetCells(body)) {
      const column = cell.column;
      const columnIndex = columnNumber(column) - 1;
      if (columnIndex < 0 || columnIndex >= templateColumnCount) continue;
      const attrs = cell.attrs;
      const cellBody = cell.body;
      if (attrs.includes('t="s"')) {
        const sharedIndex = Number(cellBody.match(/<v>(\d+)<\/v>/)?.[1] ?? -1);
        values[columnIndex] = sharedStrings[sharedIndex] ?? "";
      } else if (attrs.includes('t="inlineStr"')) {
        values[columnIndex] = [...cellBody.matchAll(/<t[^>]*>(.*?)<\/t>/gs)]
          .map((textMatch) => unescapeXml(textMatch[1] ?? ""))
          .join("");
      } else {
        const rawValue = cellBody.match(/<v>(.*?)<\/v>/)?.[1] ?? "";
        values[columnIndex] =
          dateColumnNames.has(column) && rawValue
            ? excelSerialToIsoDate(rawValue) ?? rawValue
            : rawValue;
      }
    }

    const familyStart = values[54].startsWith("FAMILY");
    if (familyRows.has(rowNumber) || familyStart) {
      values[54] = "Family";
    }
    const isHeader = rowNumber === 1;
    const isApplicantRow = Boolean(values[6] || values[7] || values[9]);
    if (isHeader || isApplicantRow) rows.push({ familyStart, rowNumber, values });
  }
  return rows;
}

function parseWorksheetCells(
  rowBody: string,
): Array<{ attrs: string; body: string; column: string }> {
  const cells: Array<{ attrs: string; body: string; column: string }> = [];
  for (const match of rowBody.matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>(.*?)<\/c>/gs)) {
    const attrs = match[1] ?? match[2] ?? "";
    const column = attrs.match(/\br="([A-Z]+)\d+"/)?.[1] ?? "";
    if (!column) continue;
    cells.push({ attrs, body: match[3] ?? "", column });
  }
  return cells;
}

function familyRowsFromMergeCells(xml: string) {
  const rows = new Set<number>();
  for (const mergeMatch of xml.matchAll(/<mergeCell ref="BC(\d+):BC(\d+)"/g)) {
    const start = Number(mergeMatch[1]);
    const end = Number(mergeMatch[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let row = start; row <= end; row += 1) rows.add(row);
  }
  return rows;
}

function excelSerialToIsoDate(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return null;
  const date = new Date(Math.round((serial - 25_569) * 86_400_000));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseWorksheetRowFills(
  rows: readonly {
    familyStart: boolean;
    rowNumber: number;
    values: readonly string[];
  }[],
): Array<ExportWorkbookRowFill | null> {
  let familyIndex = 0;
  return rows.map((row) => {
    if (row.rowNumber === 1 || row.values[54] !== "Family") {
      return null;
    }
    if (row.familyStart || familyIndex === 0) familyIndex += 1;
    return `family-${familyIndex}` as ExportWorkbookRowFill;
  });
}

function columnNumber(column: string): number {
  return [...column].reduce(
    (value, character) => value * 26 + character.charCodeAt(0) - 64,
    0,
  );
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function zipStore(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = localHeader(nameBytes, data, crc);
    const central = centralHeader(nameBytes, data, crc, offset);

    localParts.push(local, data);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = endOfCentralDirectory(Object.keys(files).length, centralSize, offset);
  return concatBytes([...localParts, ...centralParts, end]);
}

function localHeader(name: Uint8Array, data: Uint8Array, crc: number): Uint8Array {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(8, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  header.set(name, 30);
  return header;
}

function centralHeader(
  name: Uint8Array,
  data: Uint8Array,
  crc: number,
  offset: number,
): Uint8Array {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  header.set(name, 46);
  return header;
}

function endOfCentralDirectory(
  fileCount: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return end;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
