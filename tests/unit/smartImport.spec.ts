import { describe, expect, it } from "vitest";

import {
  buildSmartImportReview,
  mergeSmartImportParsedResults,
  parseSmartImportText,
  type SmartImportCandidate,
} from "../../src/modules/submissions/smartImport";

function candidate(result: ReturnType<typeof parseSmartImportText>, fieldId: string) {
  return result.candidates.find((item) => item.fieldId === fieldId);
}

function candidateValue(
  result: ReturnType<typeof parseSmartImportText>,
  fieldId: string,
) {
  return candidate(result, fieldId)?.value;
}

describe("parseSmartImportText", () => {
  it("extracts a labelled filled form into the canonical whitelist", () => {
    const result = parseSmartImportText(`
      Фамилия: Волков
      Имя: Антон
      Телефон: +7 (921) 555-22-11
      Email: ANTON@example.com
      Работодатель: ООО «СтройТранс»
      Должность: инженер
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("ВОЛКОВ");
    expect(candidateValue(result, "first-name")).toBe("АНТОН");
    expect(candidateValue(result, "contact-number")).toBe("+79215552211");
    expect(candidateValue(result, "email")).toBe("anton@example.com");
    expect(candidateValue(result, "employer-name")).toBe("ООО «СТРОЙТРАНС»");
    expect(candidateValue(result, "occupation")).toBe("ENGINEER");
  });

  it("extracts email and telephone from a free-form contact note", () => {
    const result = parseSmartImportText(
      "Связаться со мной можно по телефону +7 921 555 22 11 или anton@example.com.",
    );

    expect(result.documentKind).toBe("contact_note");
    expect(candidateValue(result, "contact-number")).toBe("+79215552211");
    expect(candidateValue(result, "email")).toBe("anton@example.com");
  });

  it("extracts a structured Russian registration address", () => {
    const result = parseSmartImportText(`
      ЗАРЕГИСТРИРОВАН ПО МЕСТУ ЖИТЕЛЬСТВА
      198216, Г. САНКТ-ПЕТЕРБУРГ,
      ЛЕНИНСКИЙ ПР-Т, Д. 40, КОРП. 2, КВ. 14
    `);

    expect(result.documentKind).toBe("russian_registration");
    expect(candidateValue(result, "home-country")).toBe("Russian Federation");
    expect(candidateValue(result, "postal-code")).toBe("198216");
    expect(candidateValue(result, "home-city")).toBe("Санкт-Петербург");
    expect(candidateValue(result, "home-street")).toBe("проспект Ленинский");
    expect(candidateValue(result, "home-house")).toBe("40");
    expect(candidateValue(result, "home-building")).toBe("2");
    expect(candidateValue(result, "home-unit")).toBe("14");
    expect(candidate(result, "home-address")).toBeUndefined();
  });

  it("extracts a labelled home address from an ordinary paper form", () => {
    const result = parseSmartImportText(`
      ФИО: Волков Антон Сергеевич
      Адрес: 198216, Санкт-Петербург, Ленинский пр-т, д. 40, корп. 2, кв. 14
      Телефон: +7 921 555-22-11
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("ВОЛКОВ");
    expect(candidateValue(result, "first-name")).toBe("АНТОН");
    expect(candidateValue(result, "home-country")).toBe("Russian Federation");
    expect(candidateValue(result, "postal-code")).toBe("198216");
    expect(candidateValue(result, "home-city")).toBe("Санкт-Петербург");
    expect(candidateValue(result, "home-street")).toBe("проспект Ленинский");
    expect(candidateValue(result, "home-house")).toBe("40");
    expect(candidateValue(result, "home-building")).toBe("2");
    expect(candidateValue(result, "home-unit")).toBe("14");
  });

  it("classifies an invitation before generic labelled-form detection", () => {
    const result = parseSmartImportText(`
      Invitation
      Inviting company: Iberia Partner SL
      Host address: Calle Mayor 14, Madrid
      Phone: +34 910 000 000
      Email: host@example.com
    `);

    expect(result.documentKind).toBe("invitation");
    expect(candidateValue(result, "hotel-contact")).toBe("+34910000000");
    expect(candidateValue(result, "hotel-email")).toBe("host@example.com");
    expect(candidate(result, "employer-name")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
    expect(candidate(result, "email")).toBeUndefined();
  });

  it("classifies an employment letter before generic labelled-form detection", () => {
    const result = parseSmartImportText(`
      Справка с места работы
      Работодатель: ООО СтройТранс
      Должность: инженер
      Адрес работодателя: Санкт-Петербург, Невский проспект, д. 10
      Телефон работодателя: +7 812 555-00-00
    `);

    expect(result.documentKind).toBe("employment");
    expect(candidateValue(result, "employer-name")).toBe("ООО СТРОЙТРАНС");
    expect(candidateValue(result, "occupation")).toBe("ENGINEER");
    expect(candidateValue(result, "employer-contact")).toBe("+78125550000");
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("does not treat airline contacts as applicant contacts", () => {
    const result = parseSmartImportText(`
      Электронный билет
      Рейс SU 123
      Дата вылета: 18.09.2026
      Airline phone: +7 495 555-00-00
      Support email: support@airline.example
    `);

    expect(result.documentKind).toBe("travel_ticket");
    expect(candidate(result, "contact-number")).toBeUndefined();
    expect(candidate(result, "email")).toBeUndefined();
  });

  it("routes booking contacts to hotel fields and extracts stay dates", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Hotel Madrid Central
      Address: Calle Mayor 14
      28013 Madrid, Spain
      Phone: +34 910 000 000
      Email: stay@madrid-central.example
      Check-in: 18.09.2026
      Check-out: 27.09.2026
    `);

    expect(result.documentKind).toBe("booking");
    expect(candidateValue(result, "inviting-party-type")).toBe(
      "Гостиница/временное жилье",
    );
    expect(candidateValue(result, "hotel-name")).toBe("HOTEL MADRID CENTRAL");
    expect(candidateValue(result, "hotel-address")).toBe("Calle Mayor 14");
    expect(candidateValue(result, "hotel-postal-code")).toBe("28013");
    expect(candidateValue(result, "hotel-city")).toBe("Madrid");
    expect(candidateValue(result, "hotel-country")).toBe("Spain");
    expect(candidateValue(result, "hotel-contact")).toBe("+34910000000");
    expect(candidateValue(result, "hotel-email")).toBe(
      "stay@madrid-central.example",
    );
    expect(candidateValue(result, "arrival-date")).toBe("18.09.2026");
    expect(candidateValue(result, "departure-date")).toBe("27.09.2026");
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("uses a Russian internal passport only for personal data", () => {
    const result = parseSmartImportText(`
      РОССИЙСКАЯ ФЕДЕРАЦИЯ
      Фамилия ИВАНОВ
      Имя ИВАН
      Отчество ИВАНОВИЧ
      Пол МУЖ.
      Дата рождения 12.11.1990
      Место рождения Г. ТОМСК ТОМСКОЙ ОБЛАСТИ
      Серия 70 10 Номер 123456
      Дата выдачи 04.03.2015
      PNRUSIVANOV<<IVAN<IVANOVI3<<<<<<<<<<<<<<<<<<
      7001234564RUS9011126M<<<<<<<<<<<<<<<<<<<<<<<
    `);

    expect(result.documentKind).toBe("russian_internal_passport");
    expect(candidateValue(result, "surname")).toBe("ИВАНОВ");
    expect(candidateValue(result, "first-name")).toBe("ИВАН");
    expect(candidateValue(result, "birth-date")).toBe("12.11.1990");
    expect(candidateValue(result, "birth-place")).toContain("ТОМСК");
    expect(candidateValue(result, "gender")).toBe("Мужской");
    expect(candidateValue(result, "nationality")).toBe("Russian Federation");

    const forbidden = new Set([
      "passport-type",
      "passport-no",
      "passport-issue-date",
      "passport-expiry-date",
      "passport-issue-country",
      "passport-issue-place",
    ]);
    expect(result.candidates.some((item) => forbidden.has(item.fieldId))).toBe(false);
  });

  it("recovers visual identity lines from an OCR layout without labels", () => {
    const result = parseSmartImportText(`
      РОССИЙСКАЯ ФЕДЕРАЦИЯ
      ПАСПОРТ ВЫДАН ТЕСТОВЫМ ОТДЕЛОМ
      ИВАНОВ
      ИВАН
      ИВАНОВИЧ
      МУЖ. 12.11.1990
      Г. ТОМСК
      ТОМСКОЙ ОБЛАСТИ
      СЕРИЯ 70 10 НОМЕР 123456
    `);

    expect(result.documentKind).toBe("russian_internal_passport");
    expect(candidateValue(result, "surname")).toBe("ИВАНОВ");
    expect(candidateValue(result, "first-name")).toBe("ИВАН");
    expect(candidateValue(result, "birth-date")).toBe("12.11.1990");
    expect(candidateValue(result, "gender")).toBe("Мужской");
    expect(candidateValue(result, "birth-place")).toContain("ТОМСК");
  });

  it("transliterates Russian internal passport MRZ names conservatively", () => {
    const result = parseSmartImportText(`
      PNRUSIVANOV<<IVAN<IVANOVI3<<<<<<<<<<<<<<<<<<
      7001234564RUS9011126M<<<<<<<<<<<<<<<<<<<<<<<
    `);

    expect(result.documentKind).toBe("russian_internal_passport");
    expect(candidateValue(result, "surname")).toBe("ИВАНОВ");
    expect(candidateValue(result, "first-name")).toBe("ИВАН");
    expect(candidate(result, "surname")?.confidence).toBe("low");
    expect(candidate(result, "first-name")?.confidence).toBe("low");
    expect(candidateValue(result, "birth-date")).toBe("12.11.1990");
    expect(candidateValue(result, "gender")).toBe("Мужской");
  });

  it("rejects internal-passport MRZ birth data with an invalid check digit", () => {
    const result = parseSmartImportText(`
      PNRUSIVANOV<<IVAN<IVANOVI3<<<<<<<<<<<<<<<<<<
      7001234564RUS9011129M<<<<<<<<<<<<<<<<<<<<<<<
    `);

    expect(candidateValue(result, "birth-date")).toBeUndefined();
    expect(candidateValue(result, "gender")).toBeUndefined();
    expect(candidateValue(result, "surname")).toBe("ИВАНОВ");
  });

  it("does not infer birth date from an unrelated unlabelled date", () => {
    const result = parseSmartImportText(`
      Маршрутная квитанция
      Рейс SU 123
      18.09.2026 Москва — Мадрид
    `);

    expect(result.documentKind).toBe("travel_ticket");
    expect(candidate(result, "birth-date")).toBeUndefined();
  });

  it("deduplicates each canonical field and keeps the stronger candidate", () => {
    const result = parseSmartImportText(`
      Email: strong@example.com
      Для связи strong@example.com
    `);

    expect(result.candidates.filter((item) => item.fieldId === "email")).toHaveLength(1);
    expect(candidate(result, "email")?.confidence).toBe("high");
  });

  it("returns no raw source, filename, blob, or file object in the public result", () => {
    const result = parseSmartImportText("Телефон: +7 921 555-22-11");
    const serialized = JSON.stringify(result).toLowerCase();

    expect(serialized).not.toContain("rawtext");
    expect(serialized).not.toContain("rawvalue");
    expect(serialized).not.toContain("filename");
    expect(serialized).not.toContain("blob");
    expect(Object.keys(result).sort()).toEqual([
      "candidates",
      "documentKind",
      "summary",
    ]);
  });
});

describe("buildSmartImportReview", () => {
  it("classifies new, same, conflict, and low-confidence values", () => {
    const parsed = {
      candidates: [
        {
          confidence: "high",
          fieldId: "email",
          label: "Email",
          sectionId: "contacts",
          value: "anton@example.com",
        },
        {
          confidence: "high",
          fieldId: "contact-number",
          label: "Телефон",
          sectionId: "contacts",
          value: "+79215552211",
        },
        {
          confidence: "high",
          fieldId: "employer-name",
          label: "Работодатель",
          sectionId: "employment",
          value: "ООО СТРОЙТРАНС",
        },
        {
          confidence: "low",
          fieldId: "home-city",
          label: "Город",
          sectionId: "contacts",
          value: "Санкт-Петербург",
        },
      ] satisfies SmartImportCandidate[],
      documentKind: "filled_form" as const,
      summary: "Найдено 4 поля",
    };

    const review = buildSmartImportReview({
      parsed,
      currentValues: {
        "contact-number": "8 (921) 555-22-11",
        "employer-name": "ДРУГАЯ КОМПАНИЯ",
      },
    });
    const byField = new Map(review.items.map((item) => [item.fieldId, item]));

    expect(byField.get("email")).toMatchObject({
      selectedByDefault: true,
      status: "new",
    });
    expect(byField.get("contact-number")).toMatchObject({
      selectedByDefault: false,
      status: "same",
    });
    expect(byField.get("employer-name")).toMatchObject({
      selectedByDefault: false,
      status: "conflict",
    });
    expect(byField.get("home-city")).toMatchObject({
      selectedByDefault: false,
      status: "low_confidence",
    });
  });
});

describe("mergeSmartImportParsedResults", () => {
  it("keeps conflicting sanitized values from a package for manual choice", () => {
    const merged = mergeSmartImportParsedResults([
      parseSmartImportText("Email: first@example.com"),
      parseSmartImportText("Email: second@example.com"),
    ]);
    const review = buildSmartImportReview({ currentValues: {}, parsed: merged });
    const emailItems = review.items.filter((item) => item.fieldId === "email");

    expect(merged.documentKind).toBe("mixed_package");
    expect(emailItems.map((item) => item.value).sort()).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    expect(emailItems.every((item) => item.status === "source_conflict")).toBe(
      true,
    );
    expect(emailItems.every((item) => !item.selectedByDefault)).toBe(true);
    expect(merged.summary).toContain("Конфликтов между источниками: 1");
  });

  it("deduplicates an identical value found in multiple package sources", () => {
    const merged = mergeSmartImportParsedResults([
      parseSmartImportText("Email: same@example.com"),
      parseSmartImportText("Контактный email: same@example.com"),
    ]);

    expect(merged.candidates.filter((item) => item.fieldId === "email")).toHaveLength(
      1,
    );
  });
});
