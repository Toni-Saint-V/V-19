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

export function createExportWorkbookBlob(
  workbookRows: readonly (readonly string[])[],
  options: CreateExportWorkbookBlobOptions = {},
): Blob {
  const rowFills = options.rowFills ?? [];
  const styleIds = rowFillStyleIds(rowFills);
  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": packageRelsXml(),
    "xl/workbook.xml": workbookXml(),
    "xl/_rels/workbook.xml.rels": workbookRelsXml(),
    "xl/styles.xml": stylesXml(styleIds.size),
    "xl/worksheets/sheet1.xml": worksheetXml(workbookRows, rowFills, styleIds),
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
  const sheetName = workbook.match(/<sheet[^>]+name="([^"]+)"/)?.[1] ?? "";
  const dimension = worksheet.match(/<dimension[^>]+ref="([^"]+)"/)?.[1] ?? "";

  return {
    dimension,
    rowFills: parseWorksheetRowFills(worksheet),
    rows: parseWorksheetRows(worksheet),
    sheetName,
  };
}

function contentTypesXml(): string {
  return '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
}

function packageRelsXml(): string {
  return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
}

function workbookXml(): string {
  return `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${EXPORT_WORKBOOK_SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelsXml(): string {
  return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
}

function stylesXml(fillCount: number): string {
  const fills = Array.from(
    { length: fillCount },
    (_, index) =>
      `<fill><patternFill patternType="solid"><fgColor rgb="${pastelArgb(
        index + 1,
      )}"/></patternFill></fill>`,
  ).join("");
  const xfs = Array.from(
    { length: fillCount },
    (_, index) =>
      `<xf numFmtId="0" fontId="0" fillId="${index + 1}" borderId="0" xfId="0" applyFill="1"/>`,
  ).join("");
  return `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="${fillCount + 1}"><fill><patternFill patternType="none"/></fill>${fills}</fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${fillCount + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function worksheetXml(
  rows: readonly (readonly string[])[],
  rowFills: readonly (ExportWorkbookRowFill | null | undefined)[],
  styleIds: ReadonlyMap<ExportWorkbookRowFill, number>,
): string {
  const dimension = `A1:BD${Math.max(rows.length, 1)}`;
  const sheetRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const fill = rowFills[rowIndex] ?? null;
      const styleId = fill ? (styleIds.get(fill) ?? 0) : 0;
      const styleAttribute = styleId ? ` s="${styleId}"` : "";
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
          return `<c r="${cellRef}"${styleAttribute} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetData>${sheetRows}</sheetData></worksheet>`;
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

function parseWorksheetRows(xml: string): string[][] {
  return [...xml.matchAll(/<row[^>]*>(.*?)<\/row>/g)].map((rowMatch) => {
    const cells = rowMatch[1];
    if (cells === undefined) return [];

    return [...cells.matchAll(/<t>(.*?)<\/t>/g)].map((cellMatch) =>
      unescapeXml(cellMatch[1] ?? ""),
    );
  });
}

function parseWorksheetRowFills(xml: string): Array<ExportWorkbookRowFill | null> {
  return [...xml.matchAll(/<row[^>]*>(.*?)<\/row>/g)].map((rowMatch) => {
    const cells = rowMatch[1] ?? "";
    const styleId = Number(cells.match(/<c\b[^>]*\bs="(\d+)"/)?.[1] ?? 0);
    return styleId > 0 ? (`family-${styleId}` as ExportWorkbookRowFill) : null;
  });
}

function rowFillStyleIds(
  rowFills: readonly (ExportWorkbookRowFill | null | undefined)[],
): Map<ExportWorkbookRowFill, number> {
  const styleIds = new Map<ExportWorkbookRowFill, number>();
  for (const fill of rowFills) {
    if (!fill || styleIds.has(fill)) continue;
    styleIds.set(fill, styleIds.size + 1);
  }
  return styleIds;
}

function pastelArgb(index: number): string {
  return `ff${(204 + ((index * 17) % 32)).toString(16)}${(
    204 +
    ((index * 29) % 32)
  ).toString(16)}${(204 + ((index * 43) % 32)).toString(16)}`;
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
