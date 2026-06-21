import { describe, expect, test } from "vitest";
import {
  buildExportPackageIdentity,
  exportSummary,
} from "../../src/modules/submissions/exportRules";
import {
  buildExportWorkbookRows,
  createExportWorkbookArtifact,
} from "../../src/modules/submissions/exportWorkbook";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { ExportRow, Submission } from "../../src/modules/submissions/types";

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
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
  return [...xml.matchAll(/<row[^>]*>(.*?)<\/row>/g)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<t>(.*?)<\/t>/g)].map((cellMatch) =>
      unescapeXml(cellMatch[1]),
    ),
  );
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

describe("V-19 export workbook", () => {
  test("generates a parseable xlsx from the same row model as the Excel preview", async () => {
    const selection = [byId("ПД-1056")];
    const plan = exportSummary(selection);
    const identity = buildExportPackageIdentity(selection, "xlsx");
    if (!identity) throw new Error("expected export package identity");

    const artifact = createExportWorkbookArtifact(plan.rows, identity);
    const files = unzipStore(await artifact.blob.arrayBuffer());
    const parsedRows = parseWorksheetRows(files["xl/worksheets/sheet1.xml"] ?? "");

    expect(artifact.fileName).toBe(identity.fileName);
    expect(artifact.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(parsedRows).toEqual(buildExportWorkbookRows(plan.rows));
    expect(parsedRows[1]).toEqual(buildExportWorkbookRows(plan.rows)[1]);
    expect(parsedRows[1]).toEqual(
      expect.arrayContaining(["ПД-1056", "Дмитрий Орлов", "Москва"]),
    );
  });

  test("keeps spreadsheet formula-like values inert in generated cells", () => {
    const row: ExportRow = {
      applicantCount: 1,
      applicantIndex: 1,
      applicantName: "=cmd|' /C calc'!A0",
      city: "Москва",
      groupKey: "VF-FORMULA",
      groupLabel: "Один заявитель",
      submissionCode: "VF-FORMULA",
      submissionId: "VF-FORMULA",
      submissionTitle: "+unsafe",
      tripDates: "18.08-26.08",
      type: "Один заявитель",
    };

    expect(buildExportWorkbookRows([row])[1]).toContain("'=cmd|' /C calc'!A0");
    expect(buildExportWorkbookRows([row])[1]).toContain("'+unsafe");
  });
});
