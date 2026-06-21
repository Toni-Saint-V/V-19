import { buildExportPackageIdentity } from "./exportRules";
import type { ExportPackageIdentity, ExportRow, Submission } from "./types";

export const exportWorkbookColumns = [
  ["submissionCode", "Подача"],
  ["submissionId", "ID подачи"],
  ["submissionTitle", "Название"],
  ["applicantName", "Заявитель"],
  ["city", "Город"],
  ["tripDates", "Даты"],
  ["type", "Тип"],
  ["groupKey", "Группа"],
  ["groupLabel", "Тип группы"],
  ["applicantIndex", "Номер в группе"],
  ["applicantCount", "Всего в группе"],
] as const satisfies readonly [keyof ExportRow, string][];

export type ExportWorkbookArtifact = {
  blob: Blob;
  contentType: string;
  fileName: string;
  rows: string[][];
};

export type ExportWorkbookDownloadResult =
  | { ok: true; fileName: string }
  | {
      ok: false;
      reason: "download_failed" | "empty_package";
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

export function buildExportWorkbookRows(rows: ExportRow[]): string[][] {
  return [
    exportWorkbookColumns.map(([, label]) => label),
    ...rows.map((row) =>
      exportWorkbookColumns.map(([field]) => safeSpreadsheetValue(String(row[field]))),
    ),
  ];
}

export function createExportWorkbookArtifact(
  rows: ExportRow[],
  identity: ExportPackageIdentity,
): ExportWorkbookArtifact {
  const workbookRows = buildExportWorkbookRows(rows);
  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": packageRelsXml(),
    "xl/workbook.xml": workbookXml(),
    "xl/_rels/workbook.xml.rels": workbookRelsXml(),
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(workbookRows),
  };
  const zip = zipStore(files);
  const buffer = new ArrayBuffer(zip.byteLength);
  new Uint8Array(buffer).set(zip);

  return {
    blob: new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: identity.fileName,
    rows: workbookRows,
  };
}

export function createSubmissionExportWorkbookArtifact(
  rows: ExportRow[],
  submissions: Submission[],
): ExportWorkbookArtifact | null {
  const identity = buildExportPackageIdentity(submissions, "xlsx");
  return identity ? createExportWorkbookArtifact(rows, identity) : null;
}

export default function downloadExportWorkbook(
  rows: ExportRow[],
  submissions: Submission[],
): ExportWorkbookDownloadResult {
  const artifact = createSubmissionExportWorkbookArtifact(rows, submissions);
  if (!artifact) {
    return {
      ok: false,
      reason: "empty_package",
      safeMessage: "Пакет выгрузки пуст. Обновите выборку и сформируйте файл заново.",
    };
  }

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

function safeSpreadsheetValue(value: string): string {
  const trimmed = value.trimStart();
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value;
}

function contentTypesXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
}

function packageRelsXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
}

function workbookXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="VisaFlow Export" sheetId="1" r:id="rId1"/></sheets></workbook>';
}

function workbookRelsXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
}

function stylesXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

function worksheetXml(rows: readonly (readonly string[])[]): string {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
          return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
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
