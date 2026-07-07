import { describe, expect, test } from "vitest";
import {
  buildProductIntakeDraft,
  getPrefillPreviewFields,
  type ProductIntakeFile,
} from "../../src/modules/submissions/productIntakeFlow";

describe("product intake passport prefill", () => {
  test("does not seed demo applicant values when no passport data was extracted", () => {
    const passportFile: ProductIntakeFile = {
      extractedFieldKeys: [],
      id: "passport-unreadable",
      kind: "passport",
      name: "passport.jpeg",
      progress: 100,
      status: "needs_review",
    };

    const draft = buildProductIntakeDraft(
      "single",
      [passportFile],
      "2026-07-07T07:00:00.000Z",
    );

    expect(draft.title).toBe("Новый заявитель");
    expect(draft.applicants[0]?.fullName).toBe("Заявитель 1");
    expect(draft.applicants[0]?.fields).toMatchObject({
      firstName: "",
      passportNo: "",
      surname: "",
    });
    expect(JSON.stringify(draft)).not.toMatch(/PETROV|IVAN|SMIRNOVA|ALINA|75 1234567/);
  });

  test("uses extracted passport values instead of demo applicant seed", () => {
    const passportFile: ProductIntakeFile = {
      extractedFieldKeys: ["surname", "firstName", "passportNumber"],
      extractedValues: {
        birthDate: "20.08.1990",
        firstName: "ANTON",
        passportExpiresAt: "26.02.2026",
        passportNo: "752869613",
        surname: "VOLKOV",
      },
      id: "passport-real-sample",
      kind: "passport",
      name: "passport.jpeg",
      progress: 100,
      status: "recognized",
    };

    const draft = buildProductIntakeDraft(
      "single",
      [passportFile],
      "2026-07-07T07:00:00.000Z",
    );

    expect(draft.applicants[0]?.fields).toMatchObject({
      birthDate: "20.08.1990",
      firstName: "ANTON",
      passportExpiresAt: "26.02.2026",
      passportNo: "752869613",
      surname: "VOLKOV",
    });
    expect(getPrefillPreviewFields(draft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "surname",
          sourceFileName: "passport.jpeg",
          value: "VOLKOV",
        }),
        expect.objectContaining({
          key: "passportNo",
          sourceFileName: "passport.jpeg",
          value: "752869613",
        }),
      ]),
    );
  });
});
