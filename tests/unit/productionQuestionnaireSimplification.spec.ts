import { describe, expect, test } from "vitest";
import {
  canonicalQuestionnaireHomeAddress,
  composeLatinQuestionnaireHomeAddress,
  composeQuestionnaireHomeAddress,
  latinQuestionnaireHomeAddressFromText,
  structuredQuestionnaireHomeAddressFromText,
  transliterateQuestionnaireText,
} from "../../src/modules/submissions/questionnaireAddressFields";
import {
  createQuestionnaireSections,
  questionnaireSectionPreviews,
} from "../../src/modules/submissions/questionnaire";
import {
  isBlsQuestionnaireFieldRequired,
  validateBlsQuestionnaireField,
} from "../../src/modules/submissions/questionnaireBlsRules";

describe("production questionnaire simplification", () => {
  test("uses the simplified seven-section order", () => {
    expect(questionnaireSectionPreviews().map((section) => section.id)).toEqual([
      "contacts",
      "trip",
      "hotel",
      "appointment",
      "personal",
      "passport",
      "employment",
    ]);
  });

  test("keeps only the two visible appointment questions plus compatibility defaults", () => {
    const appointment = createQuestionnaireSections("app-1", "TEST", "empty").find(
      (section) => section.id.endsWith("-appointment"),
    );
    const fields = appointment?.fields ?? [];

    expect(fields.map((field) => field.id)).toEqual([
      "appointment-city",
      "desired-date-1",
      "desired-date-2",
      "visa-type",
      "category",
    ]);
    expect(fields.find((field) => field.id === "visa-type")?.value).toBe("Шенгенская");
    expect(fields.find((field) => field.id === "category")?.value).toBe("Normal");
  });

  test("validates the desired appointment interval", () => {
    const field = {
      error: undefined,
      id: "desired-date-2",
      label: "Желаемый интервал — по",
      required: true,
      value: "01.08.2026",
    };

    expect(
      validateBlsQuestionnaireField({
        field,
        formData: { desiredDate1: "05.08.2026", desiredDate2: field.value },
      }),
    ).toBe("Конец интервала должен быть не раньше начала");
  });

  test("composes structured address fields for legacy export consumers", () => {
    expect(
      composeQuestionnaireHomeAddress({
        homeBuilding: "2",
        homeHouse: "15",
        homeStreet: "улица Ленина",
        homeUnit: "офис 4",
      }),
    ).toBe("улица Ленина, д 15, корп 2, офис 4");
  });

  test("splits a short normalized home address back into structured fields", () => {
    expect(
      structuredQuestionnaireHomeAddressFromText(
        "ул ленина д 5 корп 2 кв 12",
      ),
    ).toEqual({
      homeBuilding: "2",
      homeHouse: "5",
      homeStreet: "улица Ленина",
      homeUnit: "12",
    });
  });

  test("keeps every address suffix when structured fields are recomposed", () => {
    const structured = structuredQuestionnaireHomeAddressFromText(
      "ул ленина д 5 корп 2 стр 1 кв 12 под 3 этаж 4",
    );

    expect(structured).toEqual({
      homeBuilding: "корпус 2, строение 1",
      homeHouse: "5",
      homeStreet: "улица Ленина",
      homeUnit: "квартира 12, подъезд 3, этаж 4",
    });
    expect(structured && composeQuestionnaireHomeAddress(structured)).toBe(
      "улица Ленина, д 5, корпус 2, строение 1, квартира 12, подъезд 3, этаж 4",
    );
  });

  test("parses common international address orders without Russian tokens", () => {
    expect(
      structuredQuestionnaireHomeAddressFromText("Calle Mayor, 14, 2"),
    ).toEqual({
      homeBuilding: "",
      homeHouse: "14",
      homeStreet: "Calle Mayor",
      homeUnit: "2",
    });
    expect(
      structuredQuestionnaireHomeAddressFromText("221B Baker Street, Flat 2"),
    ).toEqual({
      homeBuilding: "",
      homeHouse: "221B",
      homeStreet: "Baker Street",
      homeUnit: "Flat 2",
    });
    expect(structuredQuestionnaireHomeAddressFromText("Baker Street")).toBeUndefined();
  });

  test("uses one deterministic aggregate-first address invariant", () => {
    const structured = {
      homeBuilding: "2",
      homeHouse: "15",
      homeStreet: "улица Ленина",
      homeUnit: "12",
    };

    expect(
      canonicalQuestionnaireHomeAddress({
        ...structured,
        homeAddress: "Сохранённый адрес",
      }),
    ).toBe("Сохранённый адрес");
    expect(
      canonicalQuestionnaireHomeAddress({ ...structured, homeAddress: "" }),
    ).toBe("улица Ленина, д 15, корп 2, кв 12");
  });

  test("turns Russian UI input into a Latin address without losing its parts", () => {
    expect(transliterateQuestionnaireText("МВД 78007")).toBe("MVD 78007");
    expect(
      latinQuestionnaireHomeAddressFromText(
        "ул ленина д 5 корп 2 кв 12",
      ),
    ).toBe("ulitsa Lenina, 5, bldg. 2, apt. 12");
    expect(
      composeLatinQuestionnaireHomeAddress({
        homeBuilding: "2",
        homeHouse: "10",
        homeStreet: "проспект Мира",
        homeUnit: "офис 4",
      }),
    ).toBe("prospekt Mira, 10, bldg. 2, ofis 4");
  });

  test("keeps guardian details optional even for a child", () => {
    expect(
      isBlsQuestionnaireFieldRequired({
        applicantRole: "child",
        field: {
          error: undefined,
          id: "guardian-info",
          label: "Родитель/опекун несовершеннолетнего",
          required: false,
          value: "",
        },
        formData: { dob: "01.01.2015" },
      }),
    ).toBe(false);
  });
});
