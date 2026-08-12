import { describe, expect, test } from "vitest";
import {
  parsePassportMrzText,
  parsePassportVisualText,
} from "../../src/modules/submissions/passportExtractionService";

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

  test("does not replace noisy visual OCR with fixture-specific identity values", () => {
    const fields = parsePassportVisualText(`
      Passport No
      123456789
      BORKOB
      AHTOH
      Date of birth
      20081990
      Place of birth
      LENUH / USSR
      Date of expiry
      26022026
    `);

    expect(fields.map((field) => field.value)).not.toEqual(
      expect.arrayContaining(["VOLKOV", "ANTON", "LENINGRAD"]),
    );
  });

  test("does not emit identity fields from an unvalidated MRZ name line", () => {
    const fields = parsePassportVisualText(
      "P<RUSVOLKOV<<ANTON<<<<<<<<<<<<<<<<<<<<<<<<<<",
    );

    expect(fields.map((field) => field.key)).not.toEqual(
      expect.arrayContaining(["surname", "firstName"]),
    );
  });

  test("recognizes a validated MRZ pair when its lines arrive in reverse order", () => {
    const fields = parsePassportMrzText(`
      7528696137RUS9008205M2602268<<<<<<<<<<<<<<00
      P<RUSVOLKOV<<ANTON<<<<<<<<<<<<<<<<<<<<<<<<<<
    `);

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "surname", value: "VOLKOV" }),
        expect.objectContaining({ key: "firstName", value: "ANTON" }),
        expect.objectContaining({ key: "passportNumber", value: "752869613" }),
      ]),
    );
  });

  test("does not combine partial MRZ identity data from separate OCR frames", () => {
    expect(
      parsePassportMrzText("P<RUSVOLKOV<<ANTON<<<<<<<<<<<<<<<<<<<<<<<<<<"),
    ).toEqual([]);

    const fields = parsePassportMrzText(
      "7528696137RUS9008205M2602268<<<<<<<<<<<<<<00",
    );
    expect(fields.map((field) => field.key)).not.toEqual(
      expect.arrayContaining(["surname", "firstName"]),
    );
  });
});
