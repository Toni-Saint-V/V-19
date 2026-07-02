import { describe, expect, test } from "vitest";
import { parsePassportVisualText } from "../../src/modules/submissions/passportExtractionService";

describe("passport visual OCR parsing", () => {
  test("normalizes common Cyrillic OCR noise for Russian surname and given name", () => {
    const fields = parsePassportVisualText(`
      RUS752869613
      IBORKOB
      AHTOH
      20081990
      P<RUSVOLKOV<<ANTONK<<<<<<<<<<<KKKKKKKKKKKKKK
      7528696137RUS9008205M2602268<<<<<<<<<<<<<<00
    `);

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "surname", value: "VOLKOV" }),
        expect.objectContaining({ key: "firstName", value: "ANTON" }),
        expect.objectContaining({ key: "passportNumber", value: "752869613" }),
      ]),
    );
  });
});
