import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { describe, expect, test } from "vitest";
import { EXPECTED_EXPORT_CONTRACT_HEADERS } from "../../src/lib/export/exportContractCore";
import { createExportWorkbookBlob } from "../../src/lib/export/exportWorkbookCore";

const filledReferencePath = "tests/fixtures/reference-exports/Выгрузка_excel.xlsx";
const templateReferencePath = "tests/fixtures/reference-exports/Шаблон_ексель.xlsx";

type OoxmlParts = {
  sharedStrings: string;
  styles: string;
  theme: string;
  workbook: string;
  worksheet: string;
};

async function readOoxml(source: Blob | Uint8Array): Promise<OoxmlParts> {
  const bytes = source instanceof Blob ? await source.arrayBuffer() : source;
  const zip = await JSZip.loadAsync(bytes);
  const text = async (name: string) => (await zip.file(name)?.async("string")) ?? "";
  return {
    sharedStrings: await text("xl/sharedStrings.xml"),
    styles: await text("xl/styles.xml"),
    theme: await text("xl/theme/theme1.xml"),
    workbook: await text("xl/workbook.xml"),
    worksheet: await text("xl/worksheets/sheet1.xml"),
  };
}

function compactXml(value: string): string {
  return value.replace(/\r?\n/g, "").replace(/>\s+</g, "><").trim();
}

function attributes(value: string): Record<string, string> {
  return Object.fromEntries(
    [...value.matchAll(/([\w:]+)="([^"]*)"/g)].map((match) => [
      match[1] ?? "",
      match[2] ?? "",
    ]),
  );
}

function elementAttributes(xml: string, name: string): Record<string, string> {
  return attributes(xml.match(new RegExp(`<${name}\\b([^>]*)`))?.[1] ?? "");
}

function sectionBody(xml: string, name: string): string {
  return xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1] ?? "";
}

function elements(xml: string, name: string): string[] {
  return [
    ...xml.matchAll(
      new RegExp(`<${name}\\b[^>]*\\/>|<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "g"),
    ),
  ].map((match) => compactXml(match[0]));
}

function headerValues(parts: OoxmlParts): string[] {
  const strings = [...parts.sharedStrings.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (match) =>
      [...(match[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((text) => text[1] ?? "")
        .join(""),
  );
  const row =
    parts.worksheet.match(/<row\b[^>]*r="1"[^>]*>([\s\S]*?)<\/row>/)?.[1] ?? "";
  return [...row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)]
    .filter((cell) => {
      const column = cell[1]?.match(/\br="([A-Z]+)1"/)?.[1] ?? "";
      return columnNumber(column) <= 56;
    })
    .map((cell) => {
      const index = Number(cell[2]?.match(/<v>(\d+)<\/v>/)?.[1] ?? -1);
      return strings[index] ?? "";
    });
}

function columnNumber(column: string): number {
  return [...column].reduce(
    (value, character) => value * 26 + character.charCodeAt(0) - 64,
    0,
  );
}

function safeWorksheetSignature(xml: string) {
  const columns = elements(sectionBody(xml, "cols"), "col").slice(0, 56);
  const conditionalFormatting = elements(xml, "conditionalFormatting");
  const header =
    xml
      .match(/<row\b([^>]*)r="1"([^>]*)>/)
      ?.slice(1)
      .join(" ") ?? "";
  return {
    columns,
    conditionalFormatting,
    header: attributes(header),
    margins: elementAttributes(xml, "pageMargins"),
    pane: elementAttributes(xml, "pane"),
    sheetFormat: elementAttributes(xml, "sheetFormatPr"),
    sheetView: elementAttributes(xml, "sheetView"),
  };
}

function safeStyleBaseSignature(xml: string) {
  return {
    borders: elements(sectionBody(xml, "borders"), "border").slice(0, 9),
    cellXfs: elements(sectionBody(xml, "cellXfs"), "xf").slice(0, 52),
    dxfs: elements(sectionBody(xml, "dxfs"), "dxf").slice(0, 3),
    fills: elements(sectionBody(xml, "fills"), "fill").slice(0, 3),
    fonts: elements(sectionBody(xml, "fonts"), "font").slice(0, 8),
  };
}

describe("BLS XLSX cleaned A:BD template parity", () => {
  test("matches the safe visual structure of the filled reference and the clean contract of the template", async () => {
    const generated = await readOoxml(
      createExportWorkbookBlob([
        [...EXPECTED_EXPORT_CONTRACT_HEADERS],
        Array.from({ length: 56 }, () => ""),
      ]),
    );
    const filled = await readOoxml(new Uint8Array(await readFile(filledReferencePath)));
    const template = await readOoxml(
      new Uint8Array(await readFile(templateReferencePath)),
    );

    expect(headerValues(generated)).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);
    expect(headerValues(filled)).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);
    expect(headerValues(template)).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);

    const generatedSheet = safeWorksheetSignature(generated.worksheet);
    const filledSheet = safeWorksheetSignature(filled.worksheet);
    const templateSheet = safeWorksheetSignature(template.worksheet);
    expect(generatedSheet.columns).toEqual(filledSheet.columns);
    expect(generatedSheet.pane).toEqual(filledSheet.pane);
    expect(generatedSheet.sheetView).toEqual(filledSheet.sheetView);
    expect(generatedSheet.sheetFormat).toEqual(filledSheet.sheetFormat);
    expect(generatedSheet.header).toEqual({
      ...filledSheet.header,
      spans: "1:56",
    });
    expect(generatedSheet.conditionalFormatting).toEqual(
      filledSheet.conditionalFormatting,
    );
    expect(generatedSheet.conditionalFormatting).toEqual(
      templateSheet.conditionalFormatting,
    );
    expect(generatedSheet.margins).toEqual(filledSheet.margins);
    expect(generatedSheet.margins).toEqual(templateSheet.margins);

    expect(safeStyleBaseSignature(generated.styles)).toEqual(
      safeStyleBaseSignature(filled.styles),
    );
    expect(compactXml(generated.theme)).toBe(compactXml(filled.theme));
    expect(elementAttributes(generated.workbook, "workbookView")).toMatchObject({
      windowHeight: "14745",
      windowWidth: "15960",
      xWindow: "7590",
      yWindow: "735",
    });

    expect(elementAttributes(generated.worksheet, "dimension").ref).toBe("A1:BD2");
    expect(elementAttributes(template.worksheet, "dimension").ref).toBe("A1:BD2");
    expect(generated.worksheet).toContain('<autoFilter ref="A1:BD2"/>');
    expect(generated.worksheet).not.toMatch(/\bBE\d+\b/);
    expect(generated.worksheet).not.toContain("1048572");
  });
});
