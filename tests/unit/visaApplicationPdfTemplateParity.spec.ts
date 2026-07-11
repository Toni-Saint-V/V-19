import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { verifyVisaApplicationPdfTemplateParity } from "../../src/lib/export/visaApplicationPdfTemplateParity";

const filledReferencePath = "docs/пиздец/Выгрузка_Анкета.pdf";
const allegedBlankTemplatePath = "docs/пиздец/Щаблон_анкета.pdf";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pdfPageCount(bytes: Uint8Array): number {
  return (Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [])
    .length;
}

describe("visa application PDF template parity gate", () => {
  test("fails closed because the alleged blank template is the filled example", async () => {
    const [filled, allegedBlank] = await Promise.all([
      readFile(filledReferencePath),
      readFile(allegedBlankTemplatePath),
    ]);

    expect(
      verifyVisaApplicationPdfTemplateParity({
        approvedBlankTemplateSha256: null,
        blankTemplatePageCount: pdfPageCount(allegedBlank),
        blankTemplateSha256: sha256(allegedBlank),
        filledExamplePageCount: pdfPageCount(filled),
        filledExampleSha256: sha256(filled),
      }),
    ).toEqual({
      ok: false,
      reason: "blank_template_matches_filled_example",
    });
  });

  test("opens only for a distinct explicitly approved four-page blank template", () => {
    expect(
      verifyVisaApplicationPdfTemplateParity({
        approvedBlankTemplateSha256: "b".repeat(64),
        blankTemplatePageCount: 4,
        blankTemplateSha256: "b".repeat(64),
        filledExamplePageCount: 4,
        filledExampleSha256: "a".repeat(64),
      }),
    ).toEqual({ ok: true });
  });
});
