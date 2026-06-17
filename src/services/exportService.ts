import type {
  Applicant,
  ExportBatch,
  MediaSlotType,
  Submission,
} from "../types/domain";
import {
  appendExportBatch,
  appointmentMeta,
  blockers,
  ensureMediaSlots,
  familyGroupColor,
  normalizeSubmission,
  statusMeta,
} from "../lib/workflow";

export const exportColumns = [
  "Агент",
  "Email агента",
  "ID заявки",
  "Тип заявки",
  "Название семьи / заявки",
  "ФИО заявителя",
  "Номер паспорта",
  "Телефон",
  "Email",
  "Занятость",
  "Страна",
  "Город подачи",
  "Даты поездки",
  "Длительность",
  "Тип въезда",
  "Отель",
  "Адрес отеля",
  "Файл фото на белом фоне",
  "Файл селфи 1",
  "Файл селфи 2",
  "Файл загранпаспорта",
  "Файл видео",
  "Статус заявки",
  "Статус заявителя",
  "Замечания",
  "Статус записи",
  "familyGroupId",
  "familyGroupColor",
] as const;

export type ExportColumn = (typeof exportColumns)[number];
export type ExportRow = Record<ExportColumn, string>;

export interface ExportBlocker {
  submissionId: string;
  title: string;
  reason: string;
}

export interface ExportPlan {
  rows: ExportRow[];
  readySubmissions: Submission[];
  blocked: ExportBlocker[];
  applicantRowCount: number;
  familySubmissionCount: number;
}

export type ExportPackageFormat = ExportBatch["format"];

export interface ExportPackageOptions {
  batchId?: string;
  createdAt: string;
  createdBy: string;
  format: ExportPackageFormat;
}

export interface ExportPackageArtifact {
  blob: Blob;
  contentType: string;
  fileName: string;
}

export interface ExportPackageBlocked {
  status: "blocked";
  blockers: ExportBlocker[];
  idempotencyKey: string;
  plan: ExportPlan;
}

export interface ExportPackageDuplicate {
  status: "duplicate";
  artifact: ExportPackageArtifact;
  batch: ExportBatch;
  idempotencyKey: string;
  plan: ExportPlan;
  rows: ExportRow[];
}

export interface ExportPackageReady {
  status: "ready";
  artifact: ExportPackageArtifact;
  batch: ExportBatch;
  idempotencyKey: string;
  plan: ExportPlan;
  rows: ExportRow[];
}

export type ExportPackageDraft =
  | ExportPackageBlocked
  | ExportPackageDuplicate
  | ExportPackageReady;

const exportableStatuses = new Set(["accepted"]);

const agentEmails: Record<string, string> = {
  "agent-1": "nord@travel.example",
  "agent-2": "mira@travel.example",
  "agent-3": "atlas@visa.example",
  "agent-4": "globe@desk.example",
};

export function buildExportPlan(submissions: Submission[]): ExportPlan {
  const normalized = submissions.map(normalizeSubmission);
  const readySubmissions: Submission[] = [];
  const blocked: ExportBlocker[] = [];

  for (const submission of normalized) {
    const reasons = exportBlockers(submission);
    if (reasons.length) {
      blocked.push(
        ...reasons.map((reason) => ({
          submissionId: submission.id,
          title: submission.title,
          reason,
        })),
      );
      continue;
    }

    readySubmissions.push(submission);
  }

  const orderedReadySubmissions = sortSubmissionsForExport(readySubmissions);
  const rows = orderedReadySubmissions.flatMap((submission) =>
    submission.applicants.map((applicant, index) =>
      buildExportRow(submission, applicant, index),
    ),
  );

  return {
    rows,
    readySubmissions: orderedReadySubmissions,
    blocked,
    applicantRowCount: rows.length,
    familySubmissionCount: orderedReadySubmissions.filter(
      (submission) => submission.type === "family",
    ).length,
  };
}

export function buildExportPackageDraft(
  submissions: Submission[],
  options: ExportPackageOptions,
): ExportPackageDraft {
  const plan = buildExportPlan(submissions);
  const contentFingerprint = exportPackageContentFingerprint(plan, options.format);
  const idempotencyKey = stableKey(contentFingerprint);

  if (plan.blocked.length > 0 || plan.readySubmissions.length === 0) {
    return {
      status: "blocked",
      blockers:
        plan.blocked.length > 0
          ? plan.blocked
          : [{ submissionId: "", title: "", reason: "нет заявок для выгрузки" }],
      idempotencyKey,
      plan,
    };
  }

  const artifact = buildExportPackageArtifact(
    plan.rows,
    options.format,
    idempotencyKey,
  );
  const duplicate = findExistingExportBatch(
    plan.readySubmissions,
    options.format,
    plan.rows.length,
    contentFingerprint,
    idempotencyKey,
  );

  if (duplicate) {
    return {
      status: "duplicate",
      artifact,
      batch: duplicate,
      idempotencyKey,
      plan,
      rows: plan.rows,
    };
  }

  return {
    status: "ready",
    artifact,
    batch: {
      id: options.batchId ?? crypto.randomUUID(),
      createdBy: options.createdBy,
      createdAt: options.createdAt,
      format: options.format,
      contentFingerprint,
      idempotencyKey,
      fileName: artifact.fileName,
      rowCount: plan.rows.length,
      submissionIds: sortedSubmissionIds(plan.readySubmissions),
    },
    idempotencyKey,
    plan,
    rows: plan.rows,
  };
}

export function applyExportPackageDraft(
  submissions: Submission[],
  draft: ExportPackageDraft,
): Submission[] {
  if (draft.status !== "ready") return submissions;

  const ids = new Set(draft.batch.submissionIds);
  const selected = submissions.filter((submission) => ids.has(submission.id));
  const currentPlan = buildExportPlan(selected);

  if (!exportPlanMatchesDraft(currentPlan, draft)) return submissions;

  return submissions.map((submission) =>
    ids.has(submission.id)
      ? appendExportBatchOnce(
          submission,
          draft.batch,
          draft.batch.createdBy,
          draft.batch.createdAt,
        )
      : submission,
  );
}

export function exportBlockers(submission: Submission): string[] {
  const reasons: string[] = [];

  if (!exportableStatuses.has(submission.status)) {
    reasons.push(`статус ${statusMeta[submission.status].label}`);
    return reasons;
  }

  const deterministicBlockers = blockers(submission);
  if (deterministicBlockers.length) {
    reasons.push(...deterministicBlockers.slice(0, 2));
  }

  if (
    submission.type === "family" &&
    submission.applicants.length > 1 &&
    submission.familyIntelligence?.status !== "confirmed"
  ) {
    reasons.push("семейная группа не подтверждена агентом");
  }

  for (const applicant of submission.applicants) {
    const passport = cleanPassport(applicant.passport);
    if (!passport) {
      reasons.push(`${applicant.name}: нет номера паспорта для строки экспорта`);
    }

    const mediaSlots = ensureMediaSlots(applicant);
    const unaccepted = mediaSlots.filter((slot) => slot.state !== "accepted");
    if (unaccepted.length) {
      reasons.push(`${applicant.name}: медиа не принято оператором`);
    }
  }

  return Array.from(new Set(reasons));
}

function buildExportPackageArtifact(
  rows: ExportRow[],
  format: ExportPackageFormat,
  idempotencyKey: string,
): ExportPackageArtifact {
  const contentType =
    format === "csv"
      ? "text/csv;charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return {
    blob: format === "csv" ? createCsvBlob(rows) : createXlsxBlob(rows),
    contentType,
    fileName: `visaflow-export-${idempotencyKey}.${format}`,
  };
}

function appendExportBatchOnce(
  submission: Submission,
  batch: ExportBatch,
  changedBy: string,
  changedAt: string,
): Submission {
  const normalized = normalizeSubmission(submission);
  const existingBatch = normalized.exportHistory?.find((existing) =>
    exportBatchMatches(existing, batch),
  );

  if (existingBatch && normalized.status === "exported") {
    return normalized;
  }

  if (!existingBatch) {
    return appendExportBatch(normalized, batch, changedBy, changedAt);
  }

  return appendExportBatch(
    {
      ...normalized,
      exportHistory: normalized.exportHistory?.filter(
        (existing) => !exportBatchMatches(existing, batch),
      ),
    },
    existingBatch,
    changedBy,
    changedAt,
  );
}

function findExistingExportBatch(
  submissions: Submission[],
  format: ExportPackageFormat,
  rowCount: number,
  contentFingerprint: string,
  idempotencyKey: string,
): ExportBatch | undefined {
  const ids = sortedSubmissionIds(submissions);
  const [first] = submissions;

  return first?.exportHistory?.find(
    (batch) =>
      batch.format === format &&
      batch.rowCount === rowCount &&
      batch.contentFingerprint === contentFingerprint &&
      batch.idempotencyKey === idempotencyKey &&
      sameStringSet(batch.submissionIds, ids) &&
      submissions.every((submission) =>
        submission.exportHistory?.some((existing) =>
          exportBatchMatches(existing, batch),
        ),
      ),
  );
}

function exportBatchMatches(left: ExportBatch, right: ExportBatch): boolean {
  if (left.contentFingerprint || right.contentFingerprint) {
    return (
      left.contentFingerprint === right.contentFingerprint &&
      left.idempotencyKey === right.idempotencyKey &&
      left.format === right.format &&
      left.rowCount === right.rowCount &&
      sameStringSet(left.submissionIds, right.submissionIds)
    );
  }

  if (left.idempotencyKey && right.idempotencyKey) {
    return left.idempotencyKey === right.idempotencyKey;
  }

  return (
    left.id === right.id &&
    left.format === right.format &&
    left.rowCount === right.rowCount &&
    sameStringSet(left.submissionIds, right.submissionIds)
  );
}

function exportPlanMatchesDraft(plan: ExportPlan, draft: ExportPackageReady): boolean {
  if (plan.blocked.length > 0) return false;
  if (plan.rows.length !== draft.batch.rowCount) return false;
  if (!draft.batch.contentFingerprint) return false;
  if (
    !sameStringSet(
      sortedSubmissionIds(plan.readySubmissions),
      draft.batch.submissionIds,
    )
  ) {
    return false;
  }

  const contentFingerprint = exportPackageContentFingerprint(plan, draft.batch.format);
  return (
    contentFingerprint === draft.batch.contentFingerprint &&
    stableKey(contentFingerprint) === draft.idempotencyKey
  );
}

function exportPackageContentFingerprint(
  plan: ExportPlan,
  format: ExportPackageFormat,
): string {
  const source = plan.rows
    .map((row) => exportColumns.map((column) => row[column]).join("\u001f"))
    .join("|");

  return [format, plan.rows.length, source].join("|");
}

function sortedSubmissionIds(submissions: Submission[]): string[] {
  return submissions.map((submission) => submission.id).sort();
}

function sortSubmissionsForExport(submissions: Submission[]): Submission[] {
  return [...submissions].sort((left, right) => left.id.localeCompare(right.id));
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function stableKey(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function createCsvBlob(rows: ExportRow[]): Blob {
  const csvRows = [
    exportColumns.join(","),
    ...rows.map((row) =>
      exportColumns.map((column) => escapeCsv(row[column])).join(","),
    ),
  ];

  return new Blob([`\uFEFF${csvRows.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
}

export function createXlsxBlob(rows: ExportRow[]): Blob {
  const matrix = [
    exportColumns,
    ...rows.map((row) => exportColumns.map((column) => row[column])),
  ];
  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": packageRelsXml(),
    "xl/workbook.xml": workbookXml(),
    "xl/_rels/workbook.xml.rels": workbookRelsXml(),
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(matrix),
  };

  const zip = zipStore(files);
  const buffer = new ArrayBuffer(zip.byteLength);
  new Uint8Array(buffer).set(zip);

  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildExportRow(
  submission: Submission,
  applicant: Applicant,
  index: number,
): ExportRow {
  const media = mediaFilesByType(applicant);
  const familyGroupId =
    submission.type === "family"
      ? (submission.familyGroupId ?? `FAM-${submission.id}`)
      : "";
  const groupColor =
    submission.type === "family"
      ? (submission.familyGroupColor ?? familyGroupColor(submission.id))
      : "";

  return {
    Агент: submission.agentName,
    "Email агента": agentEmails[submission.agentId] ?? "",
    "ID заявки": submission.id,
    "Тип заявки": submission.type === "family" ? "Семья" : "Турист",
    "Название семьи / заявки": submission.title,
    "ФИО заявителя": applicant.name,
    "Номер паспорта": cleanPassport(applicant.passport),
    Телефон: applicant.phone ?? "",
    Email: applicant.email ?? "",
    Занятость: applicant.employment ?? "Не указано",
    Страна: applicant.country ?? submission.country,
    "Город подачи": applicant.city ?? submission.city,
    "Даты поездки": applicant.tripDates ?? submission.travelDate,
    Длительность:
      applicant.tripDuration ??
      tripDuration(applicant.tripDates ?? submission.travelDate),
    "Тип въезда": applicant.tripPurpose ?? "Туризм",
    Отель: applicant.hotelName ?? "",
    "Адрес отеля": applicant.hotelAddress ?? "",
    "Файл фото на белом фоне": media.photo_white ?? "",
    "Файл селфи 1": media.selfie ?? "",
    "Файл селфи 2": media.selfie_2 ?? "",
    "Файл загранпаспорта": media.passport_scan ?? "",
    "Файл видео": media.video ?? "",
    "Статус заявки": statusMeta[submission.status].label,
    "Статус заявителя": "Принято",
    Замечания: applicant.role ? `Роль: ${applicant.role}` : `Заявитель ${index + 1}`,
    "Статус записи": appointmentMeta[submission.appointment].label,
    familyGroupId: familyGroupId,
    familyGroupColor: groupColor,
  };
}

function mediaFilesByType(
  applicant: Applicant,
): Partial<Record<MediaSlotType, string>> {
  return ensureMediaSlots(applicant).reduce<Partial<Record<MediaSlotType, string>>>(
    (acc, slot) => {
      acc[slot.type] = slot.generatedFileName ?? "";
      return acc;
    },
    {},
  );
}

function cleanPassport(value: string): string {
  return value.replace(/\D/g, "");
}

function escapeCsv(value: string): string {
  const safe = safeSpreadsheetValue(value);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }

  return safe;
}

function safeSpreadsheetValue(value: string): string {
  const trimmed = value.trimStart();
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value;
}

function tripDuration(value: string): string {
  const match = value.match(/(\d{4}-\d{2}-\d{2}).*(\d{4}-\d{2}-\d{2})/);
  if (!match) return "";

  const start = new Date(`${match[1]}T00:00:00Z`);
  const end = new Date(`${match[2]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  return `${days} дней`;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function packageRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="VisaFlow Export" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function workbookRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(rows: readonly (readonly string[])[]): string {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex + 1)}${rowNumber}`;
          return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(
            safeSpreadsheetValue(value),
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
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
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
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
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
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
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
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
