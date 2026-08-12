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

  it("parses nested JSON values and repairs safe OCR spacing", () => {
    const result = parseSmartImportText(
      `{"applicant":{"family_name":"O'Connor-Smith","given_name":"Anne Marie","date_of_birth":"31 January 1990","email":"anne.smith @ example.com","phone":"8 (921) 555-22-11"}}`,
    );

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("O'CONNOR-SMITH");
    expect(candidateValue(result, "first-name")).toBe("ANNE MARIE");
    expect(candidateValue(result, "birth-date")).toBe("31.01.1990");
    expect(candidateValue(result, "email")).toBe("anne.smith@example.com");
    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "surname:O'CONNOR-SMITH",
      "first-name:ANNE MARIE",
      "birth-date:31.01.1990",
      "email:anne.smith@example.com",
      "contact-number:+79215552211",
    ]);
  });

  it("parses a two-column field-value table", () => {
    const result = parseSmartImportText(`
      Поле | Значение
      Фамилия | Волкова
      Имя | Анна
      Дата рождения | 2 февраля 1992
      Email | anna@example.com
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("ВОЛКОВА");
    expect(candidateValue(result, "first-name")).toBe("АННА");
    expect(candidateValue(result, "birth-date")).toBe("02.02.1992");
    expect(candidateValue(result, "email")).toBe("anna@example.com");
  });

  it("parses horizontal CSV with quoted values", () => {
    const result = parseSmartImportText(`
      family_name;given_name;date_of_birth;email;phone
      "de la Cruz";"Maria-Jose";"09/07/1988";"maria@example.es";"0034 612 345 678"
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("DE LA CRUZ");
    expect(candidateValue(result, "first-name")).toBe("MARIA-JOSE");
    expect(candidateValue(result, "birth-date")).toBe("09.07.1988");
    expect(candidateValue(result, "email")).toBe("maria@example.es");
    expect(candidateValue(result, "contact-number")).toBe("+34612345678");
  });

  it("treats an apostrophe inside an unquoted CSV cell as data", () => {
    const result = parseSmartImportText(
      "family_name,given_name,date_of_birth\nO'Connor,Anne,01.01.1990",
    );

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("O'CONNOR");
    expect(candidateValue(result, "first-name")).toBe("ANNE");
    expect(candidateValue(result, "birth-date")).toBe("01.01.1990");
  });

  it("preserves tab delimiters when parsing pasted spreadsheet rows", () => {
    const result = parseSmartImportText(
      "family_name\tgiven_name\tdate_of_birth\temail\nIvanova\tAnna\t14.06.1991\tanna@example.com",
    );

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("IVANOVA");
    expect(candidateValue(result, "first-name")).toBe("ANNA");
    expect(candidateValue(result, "birth-date")).toBe("14.06.1991");
    expect(candidateValue(result, "email")).toBe("anna@example.com");
  });

  it.each([
    "Field,Value\nSurname,Ivanov\nFirst name,Ivan\nBirth date,01.01.1990",
    "Поле;Значение\nФамилия;Иванов\nИмя;Иван\nДата рождения;01.01.1990",
  ])("parses vertical comma or semicolon field-value tables", (source) => {
    const result = parseSmartImportText(source);

    expect(candidateValue(result, "surname")).toMatch(/^(?:IVANOV|ИВАНОВ)$/u);
    expect(candidateValue(result, "first-name")).toMatch(/^(?:IVAN|ИВАН)$/u);
    expect(candidateValue(result, "birth-date")).toBe("01.01.1990");
  });

  it.each(["surname,notes\nIvanov,verified", "surname,unknown1,unknown2\nIvanov,x,y"])(
    "keeps a recognized horizontal CSV column beside metadata columns",
    (source) => {
      const result = parseSmartImportText(source);

      expect(candidateValue(result, "surname")).toBe("IVANOV");
      expect(result.candidates).toHaveLength(1);
    },
  );

  it("rejects typed JSON scalars that cannot satisfy their field schema", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        date_of_birth: "01.01.1990",
        first_name: false,
        postal_code: true,
        stay_duration: -5,
        surname: true,
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "birth-date:01.01.1990",
    ]);
  });

  it("accepts only explicitly numeric-compatible JSON fields", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        employer_address: 42,
        entry_count: 1,
        home_city: 123456,
        home_house: 12,
        hotel_name: 500,
        main_destination: 123,
        occupation: 999,
        postal_code: 28013,
        stay_duration: 10,
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "home-house:12",
      "postal-code:28013",
      "entry-count:Однократная",
      "stay-duration:10",
    ]);
  });

  it("routes explicit nested accommodation contacts to hotel fields", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        booking: {
          property: {
            email: "stay@hotel.example",
            phone: "+34910000000",
          },
        },
      }),
    );

    expect(candidateValue(result, "hotel-email")).toBe("stay@hotel.example");
    expect(candidateValue(result, "hotel-contact")).toBe("+34910000000");
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("routes every explicit booking property attribute to hotel fields", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        booking: {
          property: {
            address: "Calle Mayor 14",
            city: "Madrid",
            country: "Spain",
            email: "stay@hotel.example",
            name: "Central Hotel",
            phone: "+34910000000",
            postal_code: "28013",
          },
        },
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "hotel-name:CENTRAL HOTEL",
      "hotel-address:Calle Mayor 14",
      "hotel-country:Spain",
      "hotel-city:Madrid",
      "hotel-postal-code:28013",
      "hotel-email:stay@hotel.example",
      "hotel-contact:+34910000000",
    ]);
  });

  it("uses only the value member from structured JSON field wrappers", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        home_city: { source: "manual", value: "Madrid" },
        hotel_name: { confidence: "high", source: "ocr", value: "Central" },
        surname: { confidence: "high", value: "Ivanov" },
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "surname:IVANOV",
      "home-city:Madrid",
      "hotel-name:CENTRAL",
    ]);
  });

  it.each([
    JSON.stringify({ surname: { error: "must match passport", value: "Ivanov" } }),
    JSON.stringify({
      surname: {
        metadata: { note: "verified manually", reviewer: "Smith" },
        value: "Ivanov",
      },
    }),
  ])("never reinterprets JSON wrapper metadata as field values", (source) => {
    const result = parseSmartImportText(source);

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "surname:IVANOV",
    ]);
  });

  it("does not mistake named entity objects for field-value wrappers", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        hotel: {
          address: "Calle 1",
          name: "Central",
          text: "Near airport",
        },
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "hotel-name:CENTRAL",
      "hotel-address:Calle 1",
    ]);
  });

  it.each([
    JSON.stringify({ field: "surname", first_name: "John", value: "123" }),
    JSON.stringify({
      applicant: { field: "surname", first_name: "John", value: "123" },
    }),
    JSON.stringify({
      applicant: { first_name: "John", name: "surname", value: "123" },
    }),
  ])("keeps valid siblings beside an invalid field-value record", (source) => {
    const result = parseSmartImportText(source);

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "first-name:JOHN",
    ]);
  });

  it.each([
    [
      JSON.stringify([
        { field: "surname", value: "Ivanov" },
        { field: "first_name", value: "Ivan" },
      ]),
      ["surname:IVANOV", "first-name:IVAN"],
    ],
    [
      JSON.stringify({ fields: [{ name: "surname", value: "Ivanov" }] }),
      ["surname:IVANOV"],
    ],
    [JSON.stringify([{ label: "Surname", text: "Ivanov" }]), ["surname:IVANOV"]],
  ] as const)(
    "parses field-value record JSON without retaining metadata",
    (source, expected) => {
      const result = parseSmartImportText(source);

      expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
        ...expected,
      ]);
    },
  );

  it("keeps enclosing roles when parsing nested field-value record arrays", () => {
    const booking = parseSmartImportText(
      JSON.stringify({
        booking: {
          property: {
            fields: [
              { field: "name", value: "Central Hotel" },
              { field: "address", value: "Calle Mayor 14" },
              { field: "city", value: "Madrid" },
              { field: "country", value: "Spain" },
              { field: "email", value: "stay@hotel.example" },
              { field: "phone", value: "+34910000000" },
            ],
          },
        },
      }),
    );
    const employer = parseSmartImportText(
      JSON.stringify({
        applicant: {
          employer: {
            fields: [
              { field: "name", value: "ACME" },
              { field: "address", value: "Main Street 1" },
              { field: "phone", value: "+34910000001" },
              { field: "email", value: "hr@acme.example" },
            ],
          },
        },
      }),
    );

    expect(booking.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "hotel-name:CENTRAL HOTEL",
      "hotel-address:Calle Mayor 14",
      "hotel-country:Spain",
      "hotel-city:Madrid",
      "hotel-email:stay@hotel.example",
      "hotel-contact:+34910000000",
    ]);
    expect(employer.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "employer-name:ACME",
      "employer-contact:+34910000001",
      "employer-address:Main Street 1",
    ]);
  });

  it.each([
    JSON.stringify({
      booking: {
        hotel: {
          rooms: [{ email: "room@example.com", name: "Deluxe Suite" }],
        },
      },
    }),
    JSON.stringify({
      hotel: {
        owner: {
          email: "owner@example.com",
          name: "John Owner",
          phone: "+34910000000",
        },
      },
    }),
    JSON.stringify({
      employer: {
        departments: [{ name: "Research", phone: "+34910000000" }],
      },
    }),
    JSON.stringify({
      supplier: {
        address: { postal_code: "28001", street: "Supplier Street 1" },
      },
    }),
    JSON.stringify({
      tour_operator: {
        address: { postal_code: "28001", street: "Operator Street 1" },
      },
    }),
    JSON.stringify({
      отель: {
        владелец: {
          имя: "Иван Владелец",
          телефон: "+79215552211",
        },
      },
    }),
    JSON.stringify({
      работодатель: {
        отделы: [{ название: "Исследования", телефон: "+79215552211" }],
      },
    }),
    JSON.stringify({
      поставщик: {
        адрес: { индекс: "28001", улица: "Улица Поставщика 1" },
      },
    }),
    JSON.stringify({
      hotel: { facilities: [{ email: "spa@example.com", name: "Spa" }] },
    }),
    JSON.stringify({ hotel: { amenities: [{ name: "Pool" }] } }),
    JSON.stringify({ hotel: { management: { name: "Hotel Management" } } }),
    JSON.stringify({ hotel: { front_desk: { email: "desk@example.com" } } }),
    JSON.stringify({
      employer: { locations: [{ name: "Madrid Branch", phone: "+34910000000" }] },
    }),
    JSON.stringify({ employer: { offices: [{ name: "Madrid Office" }] } }),
    JSON.stringify({ school: { campuses: [{ name: "North Campus" }] } }),
    JSON.stringify({ company: { projects: [{ name: "Project Atlas" }] } }),
    JSON.stringify({
      merchant: { address: { postal_code: "28001", street: "Merchant St" } },
    }),
    JSON.stringify({
      broker: { address: { postal_code: "28001", street: "Broker St" } },
    }),
    JSON.stringify({
      platform: { address: { postal_code: "28001", street: "Platform St" } },
    }),
    JSON.stringify({
      travel_partner: {
        address: { postal_code: "28001", street: "Partner St" },
      },
    }),
    JSON.stringify({ insurance_company: { name: "InsureCo", phone: "+34910000000" } }),
  ])("does not promote nested subordinate or service entities", (source) => {
    expect(parseSmartImportText(source).candidates).toEqual([]);
  });

  it.each([
    JSON.stringify({ hotel_contact_name: "Jane Host" }),
    JSON.stringify({ hotel_facility_name: "Spa" }),
    JSON.stringify({ hotel_management_name: "Ops Team" }),
    JSON.stringify({ employer_contact_name: "Jane HR" }),
    JSON.stringify({ employer_location_name: "Madrid Branch" }),
    JSON.stringify({ company_project_name: "Atlas" }),
    JSON.stringify({ insurance_company_name: "InsureCo" }),
    JSON.stringify({ merchant_address_street: "Merchant St" }),
    JSON.stringify({ booking_address_street: "Calle Mayor" }),
    JSON.stringify({ invitation_person_email: "host@example.com" }),
    JSON.stringify({ booking_company_name: "Booking Holdings" }),
    JSON.stringify({ external_entity_address_street: "External Street" }),
    JSON.stringify({ external_entity_email: "external@example.com" }),
    JSON.stringify({
      payload: {
        external_entity_address_street: "External Street",
        external_entity_email: "external@example.com",
      },
    }),
    JSON.stringify({ data: { representative_email: "rep@example.com" } }),
    JSON.stringify({ response: { spouse_phone: "+34910000001" } }),
    JSON.stringify({
      application: { emergency_contact_email: "emergency@example.com" },
    }),
    JSON.stringify({
      applicant: { emergency_contact_email: "emergency@example.com" },
    }),
    JSON.stringify({ hotel: { billing_email: "billing@example.com" } }),
    JSON.stringify({ employer: { reception_phone: "+34910000003" } }),
    JSON.stringify({ booking: { email: "stay@hotel.example", phone: "+34910000000" } }),
    JSON.stringify({
      booking: { address: { postal_code: "28013", street: "Calle Mayor" } },
    }),
    JSON.stringify({
      invitation: {
        address: { postal_code: "28014", street: "Calle Host" },
        contact: { email: "host@example.com", phone: "+34910000002" },
      },
    }),
  ])(
    "fails closed for ambiguous flattened or wrapper-owned JSON roles: %s",
    (source) => {
      expect(parseSmartImportText(source).candidates).toEqual([]);
    },
  );

  it.each([
    {
      expected: "first-name:JOHN",
      source: JSON.stringify({
        applicant: { personal_info: { first_name: "John" } },
      }),
    },
    {
      expected: "employer-name:ACME",
      source: JSON.stringify({ employment: { employer: { name: "ACME" } } }),
    },
    {
      expected: "hotel-name:CENTRAL",
      source: JSON.stringify({
        booking: { details: { property: { name: "Central" } } },
      }),
    },
  ])(
    "preserves supported fields through common JSON containers: $expected",
    ({ expected, source }) => {
      expect(
        parseSmartImportText(source).candidates.map(
          (item) => `${item.fieldId}:${item.value}`,
        ),
      ).toContain(expected);
    },
  );

  it("rejects compound structured metadata suffixes", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        birth_place_source_type: "passport",
        home_city_code: "MAD",
        previous_surname_source_type: "registry",
      }),
    );

    expect(result.candidates).toEqual([]);
  });

  it("accepts the authoritative structured inviting-party type", () => {
    const result = parseSmartImportText(
      JSON.stringify({ inviting_party_type: "Приглашающая компания/организация" }),
    );

    expect(candidateValue(result, "inviting-party-type")).toBe(
      "Приглашающая компания/организация",
    );
  });

  it("preserves conflicting structured inviting-party types for review", () => {
    const parsed = parseSmartImportText(
      JSON.stringify({ inviting_party_type: "company or person" }),
    );
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const alternatives = review.items.filter(
      (item) => item.fieldId === "inviting-party-type",
    );

    expect(alternatives.map((item) => item.value).sort()).toEqual([
      "Приглашающая компания/организация",
      "Приглашающее лицо",
    ]);
    expect(alternatives.every((item) => item.status === "source_conflict")).toBe(true);
    expect(alternatives.every((item) => !item.selectedByDefault)).toBe(true);
  });

  it.each(["application", "submission", "response", "payload"])(
    "accepts applicant fields under the neutral %s wrapper",
    (wrapper) => {
      const result = parseSmartImportText(
        JSON.stringify({ [wrapper]: { applicant: { first_name: "John" } } }),
      );

      expect(candidateValue(result, "first-name")).toBe("JOHN");
    },
  );

  it("keeps nested applicant address components in the applicant address role", () => {
    const directHome = parseSmartImportText(
      JSON.stringify({
        home: {
          city: "Madrid",
          country: "Spain",
          house: "14",
          postal_code: "28013",
          street: "Calle Mayor",
          unit: "2",
        },
      }),
    );
    const applicantAddress = parseSmartImportText(
      JSON.stringify({
        applicant: {
          address: {
            city: "Madrid",
            country: "Spain",
            house: "14",
            postal_code: "28013",
            street: "Calle Mayor",
            unit: "2",
          },
        },
      }),
    );
    const expected = [
      "home-country:Spain",
      "home-city:Madrid",
      "home-street:Calle Mayor",
      "home-house:14",
      "home-unit:2",
      "postal-code:28013",
    ];

    expect(
      directHome.candidates.map((item) => `${item.fieldId}:${item.value}`),
    ).toEqual(expected);
    expect(
      applicantAddress.candidates.map((item) => `${item.fieldId}:${item.value}`),
    ).toEqual(expected);
  });

  it.each([
    [
      "employer.address",
      JSON.stringify({
        employer: {
          address: {
            city: "Madrid",
            country: "Spain",
            house: "1",
            postal_code: "28013",
            street: "Work Street",
          },
        },
      }),
    ],
    [
      "company.address",
      JSON.stringify({
        company: {
          address: {
            city: "Madrid",
            country: "Spain",
            house: "1",
            postal_code: "28013",
            street: "Work Street",
          },
        },
      }),
    ],
    [
      "работодатель.адрес",
      JSON.stringify({
        работодатель: {
          адрес: {
            город: "Madrid",
            дом: "1",
            индекс: "28013",
            страна: "Spain",
            улица: "Work Street",
          },
        },
      }),
    ],
    [
      "company.адрес",
      JSON.stringify({
        company: {
          адрес: { дом: "1", улица: "Work Street" },
        },
      }),
    ],
    [
      "employer.address with Russian components",
      JSON.stringify({
        employer: {
          address: { дом: "1", улица: "Work Street" },
        },
      }),
    ],
    [
      "direct company location components",
      JSON.stringify({
        company: {
          city: "Madrid",
          country: "Spain",
          street: "Work Street",
        },
      }),
    ],
    [
      "unknown metadata inside company.address",
      JSON.stringify({
        company: {
          address: { name: "Headquarters" },
        },
      }),
    ],
  ] as const)(
    "does not reinterpret nested %s components as home fields",
    (_shape, source) => {
      const result = parseSmartImportText(source);

      expect(result.candidates).toEqual([]);
    },
  );

  it("drops unsupported company email without corrupting the employer name", () => {
    const emailOnly = parseSmartImportText(
      JSON.stringify({ company: { email: "hr@acme.example" } }),
    );
    const namedCompany = parseSmartImportText(
      JSON.stringify({
        company: {
          email: "hr@acme.example",
          name: "ACME",
        },
      }),
    );

    expect(emailOnly.candidates).toEqual([]);
    expect(
      namedCompany.candidates.map((item) => `${item.fieldId}:${item.value}`),
    ).toEqual(["employer-name:ACME"]);
  });

  it.each([
    "host_company",
    "inviting_company",
    "inviting_organization",
    "приглашающая_компания",
  ])("keeps an explicit %s contact in the accommodation role", (hostRole) => {
    const result = parseSmartImportText(
      JSON.stringify({
        invitation: {
          [hostRole]: {
            address: "Calle Mayor 14",
            email: "host@example.com",
            name: "Iberia Partner SL",
            phone: "+34910000000",
          },
        },
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "hotel-name:IBERIA PARTNER SL",
      "hotel-address:Calle Mayor 14",
      "hotel-email:host@example.com",
      "hotel-contact:+34910000000",
    ]);
  });

  it.each([
    "Full name: John Smith",
    JSON.stringify({ full_name: "John Smith" }),
    JSON.stringify({ applicant: { full_name: "John Smith" } }),
  ])("keeps an order-ambiguous English full name unselected: %s", (source) => {
    const parsed = parseSmartImportText(source);
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const nameItems = review.items.filter(
      (item) => item.fieldId === "surname" || item.fieldId === "first-name",
    );

    expect(nameItems).toHaveLength(2);
    expect(nameItems.every((item) => item.confidence === "low")).toBe(true);
    expect(nameItems.every((item) => item.status === "low_confidence")).toBe(true);
    expect(nameItems.every((item) => !item.selectedByDefault)).toBe(true);
  });

  it("rejects oversized structured values instead of retaining them in review", () => {
    const result = parseSmartImportText(
      JSON.stringify({ hotel_address: "A".repeat(50_000) }),
    );

    expect(candidate(result, "hotel-address")).toBeUndefined();
    expect(JSON.stringify(result).length).toBeLessThan(1_000);
  });

  it("parses semicolon-delimited key-value pairs on one line", () => {
    const result = parseSmartImportText(
      "Фамилия=Петрова; Имя=Елена; Дата рождения=03.04.1985; Email=e.petrova (at) example (dot) com",
    );

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("ПЕТРОВА");
    expect(candidateValue(result, "first-name")).toBe("ЕЛЕНА");
    expect(candidateValue(result, "birth-date")).toBe("03.04.1985");
    expect(candidateValue(result, "email")).toBe("e.petrova@example.com");
  });

  it("recovers labelled OCR rows when separators are missing", () => {
    const result = parseSmartImportText(`
      ФАМИЛИЯ СИДОРОВА
      ИМЯ ОЛЬГА
      ДАТА РОЖДЕНИЯ 17 СЕНТЯБРЯ 1979
      ПОЛ Ж
      ЭЛЕКТРОННАЯ ПОЧТА olga @ example.ru
      ТЕЛЕФОН 8 999 123 45 67
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("СИДОРОВА");
    expect(candidateValue(result, "first-name")).toBe("ОЛЬГА");
    expect(candidateValue(result, "birth-date")).toBe("17.09.1979");
    expect(candidateValue(result, "gender")).toBe("Женский");
    expect(candidateValue(result, "email")).toBe("olga@example.ru");
    expect(candidateValue(result, "contact-number")).toBe("+79991234567");
  });

  it.each([
    ["Surname: Ivanov First name: Ivan Birth date: 01.01.1990", "IVANOV", "IVAN"],
    ["Фамилия Иванов Имя Иван Дата рождения 01.01.1990", "ИВАНОВ", "ИВАН"],
  ])(
    "splits multiple OCR-labelled fields collapsed onto one line",
    (source, surname, firstName) => {
      const result = parseSmartImportText(source);

      expect(candidateValue(result, "surname")).toBe(surname);
      expect(candidateValue(result, "first-name")).toBe(firstName);
      expect(candidateValue(result, "birth-date")).toBe("01.01.1990");
      expect(result.candidates.every((item) => item.confidence === "low")).toBe(true);
      expect(
        buildSmartImportReview({ currentValues: {}, parsed: result }).items.every(
          (item) => !item.selectedByDefault,
        ),
      ).toBe(true);
    },
  );

  it("parses label-then-value blocks with normalized text values", () => {
    const result = parseSmartImportText(`
      Фамилия
      Морозова
      Имя
      Дарья
      Дата рождения
      5 марта 1987
      Электронная почта
      d.morozova @ example.ru
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "surname")).toBe("МОРОЗОВА");
    expect(candidateValue(result, "first-name")).toBe("ДАРЬЯ");
    expect(candidateValue(result, "birth-date")).toBe("05.03.1987");
    expect(candidateValue(result, "email")).toBe("d.morozova@example.ru");
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

  it("decomposes a compact Russian address without comma separators", () => {
    const result = parseSmartImportText(`
      Адрес проживания: 170100 Россия Тверская область г. Тверь ул. Советская д. 12 корп. 2 стр. 1 кв. 34
      Телефон: +7 900 000-00-00
      Email: applicant@example.com
    `);

    expect(candidateValue(result, "home-country")).toBe("Russian Federation");
    expect(candidateValue(result, "postal-code")).toBe("170100");
    expect(candidateValue(result, "home-city")).toBe("Тверь");
    expect(candidateValue(result, "home-street")).toBe("улица Советская");
    expect(candidateValue(result, "home-house")).toBe("12");
    expect(candidateValue(result, "home-building")).toBe("2, стр. 1");
    expect(candidateValue(result, "home-unit")).toBe("34");
  });

  it("does not consume the apartment abbreviation as a building token", () => {
    const result = parseSmartImportText(
      "Адрес проживания: 170100 г. Тверь ул. Советская д. 12 кв. 34",
    );

    expect(candidateValue(result, "home-house")).toBe("12");
    expect(candidate(result, "home-building")).toBeUndefined();
    expect(candidateValue(result, "home-unit")).toBe("34");
  });

  it.each([
    "115583 г. Москва ул. Домодедовская д. 20 кв. 5",
    "115583 г. Москва Домашний проезд д. 7 кв. 5",
    "115583 г. Москва ул. Строителей д. 8 кв. 5",
    "115583 страна Россия г. Москва ул. Ленина д. 9 квартал 7 кв. 5",
  ])("requires token boundaries for Russian address abbreviations: %s", (address) => {
    const result = parseSmartImportText(`Адрес проживания: ${address}`);

    expect(candidate(result, "home-house")?.value).toMatch(/^(?:20|7|8|9)$/u);
    expect(candidate(result, "home-building")).toBeUndefined();
    expect(candidateValue(result, "home-unit")).toBe("5");
  });

  it("decomposes a Russian home address supplied as a JSON field", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        home_address:
          "170100 Россия Тверская область г. Тверь ул. Советская д. 12 кв. 34",
      }),
    );

    expect(candidateValue(result, "home-country")).toBe("Russian Federation");
    expect(candidateValue(result, "postal-code")).toBe("170100");
    expect(candidateValue(result, "home-city")).toBe("Тверь");
    expect(candidateValue(result, "home-street")).toBe("улица Советская");
    expect(candidateValue(result, "home-house")).toBe("12");
    expect(candidateValue(result, "home-unit")).toBe("34");
  });

  it("prefers an explicit city marker over a city name embedded in the street", () => {
    const result = parseSmartImportText(
      "Адрес проживания: 123456 г. Москва ул. Санкт-Петербургская д. 10",
    );

    expect(candidateValue(result, "home-city")).toBe("Москва");
    expect(candidateValue(result, "home-house")).toBe("10");
  });

  it.each([
    ["Адрес проживания: Казахстан, 050000, г. Алматы, ул. Абая, д. 10", "Kazakhstan"],
    ["Home address: Belarus, 220000, г. Минск, ул. Ленина, д. 1", "Belarus"],
  ])(
    "uses an explicit foreign country instead of forcing Russia",
    (source, country) => {
      const result = parseSmartImportText(source);

      expect(candidateValue(result, "home-country")).toBe(country);
    },
  );

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
    expect(candidateValue(result, "inviting-party-type")).toBe(
      "Приглашающая компания/организация",
    );
    expect(candidate(result, "employer-name")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
    expect(candidate(result, "email")).toBeUndefined();
  });

  it("does not classify a bare confirmation field as accommodation evidence", () => {
    const result = parseSmartImportText("Confirmation: accepted");

    expect(result.documentKind).not.toBe("booking");
    expect(candidate(result, "inviting-party-type")).toBeUndefined();
  });

  it("does not classify an applicant apartment field as a booking", () => {
    const result = parseSmartImportText(`
      Home address: 123 Main Street
      Apartment: 5
      Email: resident@example.com
    `);

    expect(result.documentKind).not.toBe("booking");
    expect(candidate(result, "inviting-party-type")).toBeUndefined();
    expect(candidate(result, "hotel-address")).toBeUndefined();
    expect(candidateValue(result, "email")).toBe("resident@example.com");
  });

  it.each([
    "No hotel; staying with family",
    "Hotel: none",
    "Гостиница не требуется, живу у друзей",
  ])("does not propose accommodation from negated booking evidence", (source) => {
    const result = parseSmartImportText(source);

    expect(candidate(result, "inviting-party-type")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
  });

  it.each(["No booking was made", "Reservation status: cancelled"])(
    "does not invent accommodation for a cancelled or absent reservation",
    (source) => {
      const result = parseSmartImportText(source);

      expect(candidate(result, "inviting-party-type")).toBeUndefined();
      expect(candidate(result, "hotel-name")).toBeUndefined();
    },
  );

  it.each([
    `Booking confirmation
Hotel Central
Status: cancelled`,
    `Booking confirmation: cancelled
Hotel Central`,
    "Hotel booking cancelled",
    `Invitation letter
Host name: John Smith
Status: declined`,
  ])("does not auto-select data from a cancelled source: %s", (source) => {
    const parsed = parseSmartImportText(source);
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const accommodation = review.items.filter(
      (item) =>
        item.fieldId === "inviting-party-type" || item.fieldId.startsWith("hotel-"),
    );

    expect(candidate(parsed, "inviting-party-type")).toBeUndefined();
    expect(accommodation.every((item) => !item.selectedByDefault)).toBe(true);
  });

  it.each([
    "Hotel name: not required",
    "Hotel name: none",
    "Hotel name: to be confirmed",
    "Hotel address: not provided",
  ])("does not invent accommodation from a placeholder-only field: %s", (source) => {
    const result = parseSmartImportText(source);

    expect(result.documentKind).not.toBe("booking");
    expect(candidate(result, "inviting-party-type")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
    expect(candidate(result, "hotel-address")).toBeUndefined();
  });

  it.each([
    "Hotel email: invalid",
    "Hotel phone: abc",
    "Hotel postal code: abc",
    "Check-in: 31.02.2026",
  ])("does not classify an invalid-only typed row as accommodation: %s", (source) => {
    const result = parseSmartImportText(source);

    expect(result.documentKind).not.toBe("booking");
    expect(candidate(result, "inviting-party-type")).toBeUndefined();
  });

  it.each([
    ["Arrival date: 18.09.2026", "arrival-date"],
    ["Departure date: 27.09.2026", "departure-date"],
  ] as const)(
    "does not treat a bare trip date as accommodation evidence: %s",
    (source, fieldId) => {
      const result = parseSmartImportText(source);

      expect(result.documentKind).not.toBe("booking");
      expect(candidateValue(result, fieldId)).toMatch(/\.09\.2026$/u);
      expect(candidate(result, "inviting-party-type")).toBeUndefined();
    },
  );

  it("routes Russian inviting-company child aliases to accommodation fields", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        приглашение: {
          приглашающая_компания: {
            email: "host@example.com",
            адрес: "Calle Mayor 14",
            название: "Iberia Partner",
            телефон: "+34910000000",
          },
        },
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "hotel-name:IBERIA PARTNER",
      "hotel-address:Calle Mayor 14",
      "hotel-email:host@example.com",
      "hotel-contact:+34910000000",
    ]);
  });

  it("does not promote nested booking guests to accommodation fields", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        booking: {
          hotel: {
            guest: {
              address: "Guest Street 1",
              country: "Russia",
              email: "guest@example.com",
              name: "Ivan Ivanov",
              phone: "+79215552211",
            },
          },
        },
      }),
    );

    expect(
      result.candidates.filter(
        (item) => item.fieldId.startsWith("hotel-") || item.fieldId === "email",
      ),
    ).toEqual([]);
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("does not promote guests from a nested booking array to accommodation fields", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        booking: {
          hotel: {
            guests: [
              {
                address: "Guest Street 1",
                email: "guest@example.com",
                name: "Ivan Ivanov",
                phone: "+79215552211",
              },
            ],
          },
        },
      }),
    );

    expect(result.candidates).toEqual([]);
  });

  it("fails closed for unsupported metadata inside hotel and employer roles", () => {
    const hotel = parseSmartImportText(
      JSON.stringify({
        hotel: {
          amenities: "pool",
          description: "city centre",
          name: "Central",
          policy: "no refunds",
          website: "central.example",
        },
      }),
    );
    const employer = parseSmartImportText(
      JSON.stringify({
        employer: {
          department: "R&D",
          name: "ACME",
          position: "Engineer",
          website: "acme.example",
        },
      }),
    );

    expect(
      hotel.candidates
        .filter((item) => item.fieldId === "hotel-name")
        .map((item) => item.value),
    ).toEqual(["CENTRAL"]);
    expect(employer.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "occupation:ENGINEER",
      "employer-name:ACME",
    ]);
  });

  it("does not reinterpret JSON metadata suffixes as questionnaire values", () => {
    const result = parseSmartImportText(
      JSON.stringify({ birth_place_confidence: "0.98", home_city_id: "123" }),
    );

    expect(result.candidates).toEqual([]);
  });

  it("routes supported school fields as employer data and drops school metadata", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        school: {
          address: "Calle School 1",
          email: "school@example.com",
          name: "Madrid University",
          phone: "+34910000000",
          website: "school.example",
        },
      }),
    );

    expect(result.candidates.map((item) => `${item.fieldId}:${item.value}`)).toEqual([
      "employer-name:MADRID UNIVERSITY",
      "employer-contact:+34910000000",
      "employer-address:Calle School 1",
    ]);
    expect(candidate(result, "home-street")).toBeUndefined();
    expect(candidate(result, "email")).toBeUndefined();
  });

  it.each([
    JSON.stringify({
      airline: { address: { postal_code: "28001", street: "Calle Airline 1" } },
    }),
    JSON.stringify({
      booking: {
        provider: { address: { postal_code: "28001", street: "Calle Provider 1" } },
      },
    }),
  ])(
    "does not route service-provider addresses into applicant residence: %s",
    (source) => {
      const result = parseSmartImportText(source);

      expect(candidate(result, "home-street")).toBeUndefined();
      expect(candidate(result, "postal-code")).toBeUndefined();
    },
  );

  it.each([
    JSON.stringify({
      invitation: { host_company: { contact_person: { name: "John Smith" } } },
    }),
    JSON.stringify({ employer: { contact_person: { name: "Jane Smith" } } }),
    JSON.stringify({ invitation: { host_company: { position: "Manager" } } }),
  ])("does not reinterpret nested role metadata as a named entity: %s", (source) => {
    const result = parseSmartImportText(source);

    expect(candidate(result, "hotel-name")).toBeUndefined();
    expect(candidate(result, "employer-name")).toBeUndefined();
    expect(candidate(result, "occupation")).toBeUndefined();
  });

  it.each([
    "The hotel name field is required.",
    "Use the hotel address from your confirmation.",
    "Hotel policy applies to all reservations.",
    "Reservation terms and conditions apply.",
  ])(
    "does not classify booking vocabulary in prose as accommodation evidence",
    (source) => {
      const result = parseSmartImportText(source);

      expect(result.documentKind).not.toBe("booking");
      expect(candidate(result, "inviting-party-type")).toBeUndefined();
      expect(candidate(result, "hotel-name")).toBeUndefined();
    },
  );

  it.each([
    "No booking fees",
    "No hotel fees apply",
    "Free cancellation, no reservation fee",
    "No accommodation tax included",
  ])("does not treat a fee or tax disclaimer as absence of a booking", (disclaimer) => {
    const parsed = parseSmartImportText(`
      Booking confirmation
      Hotel Central
      Hotel address: Calle Mayor 14
      ${disclaimer}
    `);
    const review = buildSmartImportReview({ currentValues: {}, parsed });

    expect(candidateValue(parsed, "inviting-party-type")).toBe(
      "Гостиница/временное жилье",
    );
    expect(candidateValue(parsed, "hotel-name")).toBe("HOTEL CENTRAL");
    expect(candidateValue(parsed, "hotel-address")).toBe("Calle Mayor 14");
    expect(candidate(parsed, "hotel-city")).toBeUndefined();
    expect(
      review.items
        .filter((item) =>
          ["inviting-party-type", "hotel-name", "hotel-address"].includes(item.fieldId),
        )
        .every((item) => item.selectedByDefault),
    ).toBe(true);
  });

  it("does not parse a numbered hotel amenity as postal, city, and country", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Hotel Central
      24 hour reception, free parking
    `);

    expect(candidate(result, "hotel-postal-code")).toBeUndefined();
    expect(candidate(result, "hotel-city")).toBeUndefined();
    expect(candidate(result, "hotel-country")).toBeUndefined();
  });

  it.each([
    `No hotel required
Hotel name: Central
Hotel email: stay@central.example`,
    `No invitation required
Host name: John Smith
Host email: john@example.com`,
  ])(
    "keeps fields contradicting a global negation visible but unselected",
    (source) => {
      const parsed = parseSmartImportText(source);
      const review = buildSmartImportReview({ currentValues: {}, parsed });
      const accommodation = review.items.filter(
        (item) => item.fieldId === "hotel-name" || item.fieldId === "hotel-email",
      );

      expect(candidate(parsed, "inviting-party-type")).toBeUndefined();
      expect(accommodation).toHaveLength(2);
      expect(accommodation.every((item) => item.status === "low_confidence")).toBe(
        true,
      );
      expect(accommodation.every((item) => !item.selectedByDefault)).toBe(true);
    },
  );

  it.each([
    "Invitation letter",
    "Invitation declined",
    "No invitation required",
    "Приглашение",
  ])("does not invent an invitation host type without role evidence", (source) => {
    const result = parseSmartImportText(source);

    expect(candidate(result, "inviting-party-type")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
  });

  it.each([
    ["Hotel email: stay@central.example", "hotel-email", "stay@central.example"],
    ["Hotel phone: +34 910 000 000", "hotel-contact", "+34910000000"],
    ["Hotel city: Madrid", "hotel-city", "Madrid"],
    ["Hotel address Calle Mayor 14", "hotel-address", "Calle Mayor 14"],
    ["Hotel city Madrid", "hotel-city", "Madrid"],
  ] as const)(
    "does not reinterpret a typed hotel row as the hotel name: %s",
    (line, fieldId, expectedValue) => {
      const result = parseSmartImportText(`Booking confirmation\n${line}`);

      expect(candidateValue(result, fieldId)).toBe(expectedValue);
      expect(candidate(result, "hotel-name")).toBeUndefined();
    },
  );

  it.each([
    "Postal code: abc",
    "Почтовый индекс: Москва",
    "Booking confirmation\nHotel postal code: nope",
  ])("rejects postal values without a digit: %s", (source) => {
    const result = parseSmartImportText(source);

    expect(candidate(result, "postal-code")).toBeUndefined();
    expect(candidate(result, "hotel-postal-code")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
  });

  it.each([
    "Hotel ID: 12345",
    "Hotel reference: ABC123",
    "Hotel status: confirmed",
    "Hotel type: 4-star",
  ])("does not reinterpret hotel metadata as the hotel name: %s", (line) => {
    const result = parseSmartImportText(`Booking confirmation\n${line}`);

    expect(candidate(result, "hotel-name")).toBeUndefined();
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

  it("does not route applicant company data into an invitation host", () => {
    const result = parseSmartImportText(`
      Invitation letter
      Applicant company: ACME
      Host name: John Smith
      Host address: Calle Mayor 1
    `);

    expect(candidateValue(result, "inviting-party-type")).toBe("Приглашающее лицо");
    expect(
      result.candidates
        .filter((item) => item.fieldId === "hotel-name")
        .map((item) => item.value),
    ).toEqual(["JOHN SMITH"]);
  });

  it("does not infer an employer name from an employment document heading", () => {
    const result = parseSmartImportText(`
      Company letter
      Position: Engineer
    `);

    expect(result.documentKind).toBe("employment");
    expect(candidateValue(result, "occupation")).toBe("ENGINEER");
    expect(candidate(result, "employer-name")).toBeUndefined();
  });

  it.each([
    "Employer ID: 12345",
    "Employer status: active",
    "Employer reference: ABC",
    "Employer tax number: 12345",
  ])("does not reinterpret employer metadata as the employer name: %s", (line) => {
    const result = parseSmartImportText(`Employment letter\n${line}`);

    expect(candidate(result, "employer-name")).toBeUndefined();
  });

  it("does not reinterpret inviting-company metadata as its name", () => {
    const result = parseSmartImportText(
      "Invitation letter\nInviting company registration number: 12345",
    );

    expect(candidate(result, "hotel-name")).toBeUndefined();
  });

  it.each([
    {
      expected: "invitation",
      source: `
        Invitation letter
        Surname: Ivanov
        First name: Ivan
        Inviting company: Iberia Partner SL
        Host address: Calle Mayor 14, Madrid
      `,
    },
    {
      expected: "employment",
      source: `
        Certificate of employment
        Surname: Ivanov
        First name: Ivan
        Employer: Acme SL
        Position: Engineer
      `,
    },
    {
      expected: "travel_ticket",
      source: `
        E-ticket itinerary
        Surname: Ivanov
        First name: Ivan
        Flight: SU 123
        Departure date: 18.09.2026
      `,
    },
  ] as const)(
    "keeps strong $expected document evidence above generic identity labels",
    ({ expected, source }) => {
      expect(parseSmartImportText(source).documentKind).toBe(expected);
    },
  );

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

  it("classifies a flight booking confirmation by its travel evidence", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Flight SU 123
      Departure date: 18.09.2026
      Airline phone: +7 495 555-00-00
      Support email: support@airline.example
    `);

    expect(result.documentKind).toBe("travel_ticket");
    expect(candidate(result, "inviting-party-type")).toBeUndefined();
    expect(candidate(result, "hotel-email")).toBeUndefined();
    expect(candidate(result, "hotel-contact")).toBeUndefined();
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("keeps an outbound flight date separate from a return date", () => {
    const outbound = parseSmartImportText(`
      E-ticket itinerary
      Flight SU 123
      Departure date: 18.09.2026
    `);
    const roundTrip = parseSmartImportText(`
      E-ticket itinerary
      Flight SU 123
      Departure date: 18.09.2026
      Return date: 27.09.2026
    `);
    const roundTripReview = buildSmartImportReview({
      currentValues: {},
      parsed: roundTrip,
    });

    expect(candidateValue(outbound, "arrival-date")).toBe("18.09.2026");
    expect(candidate(outbound, "departure-date")).toBeUndefined();
    expect(candidate(outbound, "stay-duration")).toBeUndefined();
    expect(candidateValue(roundTrip, "arrival-date")).toBe("18.09.2026");
    expect(candidateValue(roundTrip, "departure-date")).toBe("27.09.2026");
    expect(
      roundTripReview.items
        .filter(
          (item) =>
            item.fieldId === "arrival-date" || item.fieldId === "departure-date",
        )
        .every((item) => item.selectedByDefault),
    ).toBe(true);
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
    expect(candidateValue(result, "hotel-email")).toBe("stay@madrid-central.example");
    expect(
      result.candidates
        .filter((item) => item.fieldId === "hotel-name")
        .map((item) => item.value),
    ).toEqual(["HOTEL MADRID CENTRAL"]);
    expect(candidateValue(result, "arrival-date")).toBe("18.09.2026");
    expect(candidateValue(result, "departure-date")).toBe("27.09.2026");
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("keeps a booking classification when the receipt includes guest identity", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Surname: Ivanov
      First name: Ivan
      Hotel name: Madrid Central
      Check-in: 18.09.2026
      Check-out: 27.09.2026
    `);

    expect(result.documentKind).toBe("booking");
    expect(candidateValue(result, "hotel-name")).toBe("MADRID CENTRAL");
  });

  it("does not route labelled guest contacts into hotel contact fields", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Guest email: guest@example.com
      Guest phone: +7 921 111-22-33
      Hotel email: stay@hotel.example
      Hotel phone: +34 910 000 000
    `);

    expect(
      result.candidates
        .filter((item) => item.fieldId === "hotel-email")
        .map((item) => item.value),
    ).toEqual(["stay@hotel.example"]);
    expect(
      result.candidates
        .filter((item) => item.fieldId === "hotel-contact")
        .map((item) => item.value),
    ).toEqual(["+34910000000"]);
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("does not recover guest-only booking contacts through generic fallback", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Guest email: guest@example.com
      Guest phone: +7 921 111-22-33
      Hotel name: Central
    `);

    expect(candidate(result, "hotel-email")).toBeUndefined();
    expect(candidate(result, "hotel-contact")).toBeUndefined();
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("does not mirror hotel-only contacts into applicant fields", () => {
    const result = parseSmartImportText(`
      Фамилия: Иванов
      Имя: Иван
      Дата рождения: 01.01.1990
      Hotel name: Central
      Hotel email: stay@central.example
      Hotel phone: +34 910 000 000
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "hotel-email")).toBe("stay@central.example");
    expect(candidateValue(result, "hotel-contact")).toBe("+34910000000");
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it.each(["Employer email: hr@acme.example", "Email работодателя: hr@acme.example"])(
    "does not route unsupported employer email label %s into another field",
    (line) => {
      const result = parseSmartImportText(`
        Фамилия: Иванов
        Имя: Иван
        ${line}
      `);

      expect(candidate(result, "employer-name")).toBeUndefined();
      expect(candidate(result, "email")).toBeUndefined();
      expect(candidate(result, "hotel-email")).toBeUndefined();
    },
  );

  it.each([
    "Support email: help@example.com",
    "Agency email: agent@example.com",
    "Airline email: info@air.example",
    "Customer service phone: +44 20 7123 4567",
    "Agency phone: +44 20 7123 4568",
    "Email поддержки: help@example.com",
  ])("does not route a service contact into applicant contacts: %s", (line) => {
    const result = parseSmartImportText(`
      Анкета заявителя
      Фамилия: Иванов
      Имя: Иван
      ${line}
    `);

    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("does not treat reservation or order identifiers as telephone numbers", () => {
    const booking = parseSmartImportText(`
      Booking confirmation
      Reservation number: 1234567890
      Hotel name: Central
    `);
    const note = parseSmartImportText("Номер заказа: 1234567890");

    expect(candidate(booking, "hotel-contact")).toBeUndefined();
    expect(candidate(note, "contact-number")).toBeUndefined();
  });

  it.each([",", ";", "\t"])(
    "does not mine a forbidden passport column as a telephone: %s",
    (delimiter) => {
      const result = parseSmartImportText(
        [
          ["surname", "first_name", "birth_date", "passport_number"].join(delimiter),
          ["Ivanov", "Ivan", "01.01.1990", "123456789"].join(delimiter),
        ].join("\n"),
      );

      expect(candidateValue(result, "surname")).toBe("IVANOV");
      expect(candidateValue(result, "first-name")).toBe("IVAN");
      expect(candidateValue(result, "birth-date")).toBe("01.01.1990");
      expect(candidate(result, "contact-number")).toBeUndefined();
      expect(
        result.candidates.some((item) => item.fieldId.startsWith("passport")),
      ).toBe(false);
    },
  );

  it.each([
    "номер паспорта",
    "номер загранпаспорта",
    "серия и номер паспорта",
    "document_number",
  ])("keeps passport alias column %s outside every proposal", (passportHeader) => {
    const result = parseSmartImportText(
      [
        ["surname", "first_name", "birth_date", passportHeader].join(","),
        ["Ivanov", "Ivan", "01.01.1990", "123456789"].join(","),
      ].join("\n"),
    );

    expect(
      result.candidates
        .filter((item) => item.fieldId === "surname")
        .map((item) => item.value),
    ).toEqual(["IVANOV"]);
    expect(
      result.candidates
        .filter((item) => item.fieldId === "first-name")
        .map((item) => item.value),
    ).toEqual(["IVAN"]);
    expect(candidate(result, "contact-number")).toBeUndefined();
    expect(result.candidates.some((item) => item.value === "123456789")).toBe(false);
  });

  it("keeps impossible chronology visible as low-confidence review evidence", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Hotel Madrid Central
      Check-in: 27.09.2026
      Check-out: 18.09.2026
    `);
    const review = buildSmartImportReview({ currentValues: {}, parsed: result });
    const dateItems = review.items.filter(
      (item) => item.fieldId === "arrival-date" || item.fieldId === "departure-date",
    );

    expect(candidateValue(result, "arrival-date")).toBe("27.09.2026");
    expect(candidateValue(result, "departure-date")).toBe("18.09.2026");
    expect(dateItems).toHaveLength(2);
    expect(dateItems.every((item) => item.status === "low_confidence")).toBe(true);
    expect(dateItems.every((item) => !item.selectedByDefault)).toBe(true);
    expect(candidate(result, "stay-duration")).toBeUndefined();
  });

  it("keeps a stated duration conflict beside the calculated duration", () => {
    const result = parseSmartImportText(`
      Booking confirmation
      Hotel Madrid Central
      Check-in: 18.09.2026
      Check-out: 27.09.2026
      Duration: 5 days
    `);
    const review = buildSmartImportReview({ currentValues: {}, parsed: result });
    const durationItems = review.items.filter(
      (item) => item.fieldId === "stay-duration",
    );

    expect(candidateValue(result, "arrival-date")).toBe("18.09.2026");
    expect(candidateValue(result, "departure-date")).toBe("27.09.2026");
    expect(durationItems.map((item) => item.value).sort()).toEqual(["10", "5"]);
    expect(durationItems.every((item) => item.status === "source_conflict")).toBe(true);
    expect(durationItems.every((item) => !item.selectedByDefault)).toBe(true);
  });

  it("does not propose a duration while trip dates remain ambiguous", () => {
    const result = parseSmartImportText(`
      Дата въезда: 18.09.2026
      Дата въезда: 19.09.2026
      Дата выезда: 27.09.2026
      Длительность: 10 дней
    `);
    const review = buildSmartImportReview({ currentValues: {}, parsed: result });

    expect(review.items.filter((item) => item.fieldId === "arrival-date")).toHaveLength(
      2,
    );
    expect(
      review.items
        .filter((item) => item.fieldId === "arrival-date")
        .every((item) => item.status === "source_conflict"),
    ).toBe(true);
    expect(candidateValue(result, "stay-duration")).toBe("10");
    expect(review.items.find((item) => item.fieldId === "stay-duration")).toMatchObject(
      { selectedByDefault: false, status: "low_confidence" },
    );
  });

  it("keeps applicant and hotel contacts separate in a filled questionnaire", () => {
    const result = parseSmartImportText(`
      Анкета заявителя
      Фамилия: Иванов
      Имя: Иван
      Email: applicant@example.com
      Название отеля: Hotel Central
      Email отеля: stay@hotel-central.example
      Адрес отеля: Calle Mayor 14, Madrid
    `);

    expect(result.documentKind).toBe("filled_form");
    expect(candidateValue(result, "email")).toBe("applicant@example.com");
    expect(candidateValue(result, "hotel-email")).toBe("stay@hotel-central.example");
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
    expect(result.candidates.filter((item) => item.fieldId === "surname")).toHaveLength(
      1,
    );
    expect(
      result.candidates.filter((item) => item.fieldId === "first-name"),
    ).toHaveLength(1);

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

  it("rejects non-personal fields embedded in an internal-passport source", () => {
    const result = parseSmartImportText(`
      РОССИЙСКАЯ ФЕДЕРАЦИЯ
      ПАСПОРТ ВЫДАН ОТДЕЛОМ
      Фамилия: Иванов
      Имя: Иван
      Email: note@example.com
      Работодатель: ACME
      Hotel name: Central
      Адрес проживания: 220030 Беларусь, г. Минск, ул. Ленина, д. 1
    `);

    expect(result.documentKind).toBe("russian_internal_passport");
    expect(candidateValue(result, "surname")).toBe("ИВАНОВ");
    expect(candidateValue(result, "first-name")).toBe("ИВАН");
    expect(candidate(result, "email")).toBeUndefined();
    expect(candidate(result, "employer-name")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
    expect(candidate(result, "home-country")).toBeUndefined();
    expect(candidate(result, "home-city")).toBeUndefined();
    expect(candidate(result, "home-street")).toBeUndefined();
    expect(candidate(result, "home-house")).toBeUndefined();
    expect(candidate(result, "postal-code")).toBeUndefined();
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

  it("prioritizes the passport boundary for combined registration and MRZ text", () => {
    const result = parseSmartImportText(`
      ЗАРЕГИСТРИРОВАН ПО МЕСТУ ЖИТЕЛЬСТВА
      170100, Г. ТВЕРЬ, УЛ. СОВЕТСКАЯ, Д. 12
      PNRUSIVANOV<<IVAN<IVANOVI3<<<<<<<<<<<<<<<<<<
      7001234564RUS9011126M<<<<<<<<<<<<<<<<<<<<<<<
    `);

    expect(result.documentKind).toBe("russian_internal_passport");
    expect(candidate(result, "contact-number")).toBeUndefined();
    expect(candidate(result, "hotel-contact")).toBeUndefined();
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

  it("does not mistake a labelled calendar date for a telephone number", () => {
    const result = parseSmartImportText("Телефон: дата 31.12.2026");

    expect(candidate(result, "contact-number")).toBeUndefined();
  });

  it("removes calendar digits before normalizing an adjacent telephone", () => {
    const result = parseSmartImportText("Телефон: 31.12.2026 1234567");

    expect(candidateValue(result, "contact-number")).toBe("1234567");
  });

  it.each([
    "Passport number 123456789 phone +34 910 000 000",
    "Identity card number 123456789 phone +34 910 000 000",
    "Phone: Passport number 123456789 phone +34 910 000 000",
  ])(
    "uses the explicitly labelled phone instead of an earlier identifier: %s",
    (source) => {
      const result = parseSmartImportText(source);

      expect(
        result.candidates
          .filter((item) => item.fieldId === "contact-number")
          .map((item) => item.value),
      ).toEqual(["+34910000000"]);
    },
  );

  it("does not treat travel or identity document identifiers as phone numbers", () => {
    for (const source of [
      "Travel document number: 123456789",
      "Identity document number: 123456789",
      "Identity card number: 123456789",
      "National ID number: 123456789",
      "ID number: 123456789",
      "Document number: 123456789",
      "Номер проездного документа: 123456789",
      "Удостоверение личности номер: 123456789",
    ]) {
      const result = parseSmartImportText(source);

      expect(candidate(result, "contact-number"), source).toBeUndefined();
    }
  });

  it.each([
    ["Phone: Passport number: 123456789", "contact-number"],
    ["Phone: Passport # 123456789", "contact-number"],
    ["Phone: Travel document # 123456789", "contact-number"],
    ["Телефон: Номер паспорта 123456789", "contact-number"],
    ["Телефон: Паспорт № 123456789", "contact-number"],
    ["Телефон: № паспорта 123456789", "contact-number"],
    [
      "Booking confirmation\nHotel phone: Reservation number 1234567890",
      "hotel-contact",
    ],
    ["Arrival date: Passport expiry date: 01.01.2030", "arrival-date"],
    ["Birth date: Passport issue date: 01.01.2020", "birth-date"],
    ["Departure date: Passport expiry date: 01.01.2030", "departure-date"],
    ["Nationality: Passport number: 123456789", "nationality"],
    ["First entry country: Passport issue country: Russia", "first-entry-country"],
    ["Birth country: Passport issuing country: Russia", "birth-country"],
  ])("does not route a nested identifier label into %s", (source, fieldId) => {
    expect(candidate(parseSmartImportText(source), fieldId)).toBeUndefined();
  });

  it.each([
    ["Phone: 1234567 Passport number: 7654321", "contact-number", "1234567"],
    ["Phone: +34910000000 Reservation number: 1234", "contact-number", "+34910000000"],
    [
      "Booking confirmation\nHotel address: Calle Mayor 14 Passport number: 123456789",
      "hotel-address",
      "Calle Mayor 14",
    ],
    ["Birth country: USSR Passport issue country: Russia", "birth-country", "USSR"],
    [
      "Arrival date: 18.09.2026 Passport expiry date: 01.01.2030",
      "arrival-date",
      "18.09.2026",
    ],
    [
      "Hotel address: Calle Mayor 14 Passport issued by: FMS 78039",
      "hotel-address",
      "Calle Mayor 14",
    ],
    ["Место рождения: Москва Кем выдан: ФМС 78039", "birth-place", "Москва"],
    [
      "Occupation: Engineer Passport issuing authority: FMS 78039",
      "occupation",
      "ENGINEER",
    ],
    ["Hotel address: Calle 14 Passport # 123456789", "hotel-address", "Calle 14"],
    ["Birth country: USSR Passport # Russia", "birth-country", "USSR"],
    [
      "Arrival date: 18.09.2026 Passport Expiry: 01.01.2030",
      "arrival-date",
      "18.09.2026",
    ],
  ])(
    "keeps the valid value before a nested identifier label: %s",
    (source, fieldId, expectedValue) => {
      expect(candidateValue(parseSmartImportText(source), fieldId)).toBe(expectedValue);
    },
  );

  it.each([
    [
      "Arrival date: 18.09.2026 Passport expiry date: 01.01.2030",
      "arrival-date",
      "18.09.2026",
    ],
    [
      "Birth date: 01.01.1990 Passport issue date: 02.02.2020",
      "birth-date",
      "01.01.1990",
    ],
    [
      "Departure date: 27.09.2026 Passport expiry date: 01.01.2030",
      "departure-date",
      "27.09.2026",
    ],
  ])(
    "removes a passport tail before expanding alternatives: %s",
    (source, fieldId, expectedValue) => {
      const parsed = parseSmartImportText(source);
      expect(
        parsed.candidates
          .filter((item) => item.fieldId === fieldId)
          .map((item) => item.value),
      ).toEqual([expectedValue]);
      expect(buildSmartImportReview({ currentValues: {}, parsed }).items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldId,
            selectedByDefault: true,
            status: "new",
            value: expectedValue,
          }),
        ]),
      );
    },
  );

  it("parses English ordinal textual dates", () => {
    const result = parseSmartImportText("Birth date: 31st January 1990");

    expect(candidateValue(result, "birth-date")).toBe("31.01.1990");
  });

  it("does not invent categorical defaults for unknown or placeholder values", () => {
    const result = parseSmartImportText(`
      Пол: не указано
      Семейное положение: неизвестно
      Цель поездки: TBD
      Количество въездов: уточняется
      Основная страна назначения: уточняется
      Страна первого въезда: TBD
      Страна проживания: неизвестно
      Кто оплачивает: не указано
      Средства заявителя: TBD
    `);

    expect(candidate(result, "gender")).toBeUndefined();
    expect(candidate(result, "marital-status")).toBeUndefined();
    expect(candidate(result, "purpose")).toBeUndefined();
    expect(candidate(result, "entry-count")).toBeUndefined();
    expect(candidate(result, "main-destination")).toBeUndefined();
    expect(candidate(result, "first-entry-country")).toBeUndefined();
    expect(candidate(result, "home-country")).toBeUndefined();
    expect(candidate(result, "cost-covered-by")).toBeUndefined();
    expect(candidate(result, "means-of-support")).toBeUndefined();
  });

  it("rejects categorical values outside the authoritative questionnaire options", () => {
    const result = parseSmartImportText(`
      Gender: X
      Средства заявителя: cash and credit card
    `);

    expect(candidate(result, "gender")).toBeUndefined();
    expect(candidate(result, "means-of-support")).toBeUndefined();
  });

  it("keeps the questionnaire's explicit no-previous-surname value", () => {
    const result = parseSmartImportText("Предыдущая фамилия: нет");

    expect(candidateValue(result, "previous-surname")).toBe("НЕТ");
  });

  it.each([
    "Purpose: not tourism",
    "Цель поездки: не туризм",
    "Means of support: no cash",
    "Средства заявителя: без наличных",
    "Cost covered by: not applicant",
    "Кто оплачивает: не спонсор",
    "Nationality: not Russian",
    "Гражданство: не Россия",
    "Main destination: not Spain",
    "Marital status: not divorced",
    "Семейное положение: не вдова",
  ])("does not invert a negated categorical value: %s", (line) => {
    const result = parseSmartImportText(line);

    expect(result.candidates).toEqual([]);
  });

  it.each(["не женат", "not married", "never married"])(
    "maps negated marital status %s before the positive married matcher",
    (value) => {
      const result = parseSmartImportText(`Семейное положение: ${value}`);

      expect(candidateValue(result, "marital-status")).toBe("Холост/не замужем");
    },
  );

  it("bounds unknown structured-label work for large OCR input", () => {
    const source = Array.from(
      { length: 1_000 },
      (_, index) => `UNRECOGNIZED LABEL ${index} VALUE ${index}`,
    ).join("\n");
    const startedAt = performance.now();

    const result = parseSmartImportText(source);
    const elapsedMs = performance.now() - startedAt;

    expect(result.candidates).toEqual([]);
    expect(elapsedMs).toBeLessThan(1_500);
  }, 15_000);

  it("bounds a single oversized unrecognized OCR token", () => {
    const startedAt = performance.now();
    const result = parseSmartImportText("A".repeat(50_000));
    const elapsedMs = performance.now() - startedAt;

    expect(result.candidates).toEqual([]);
    expect(elapsedMs).toBeLessThan(500);
  }, 15_000);

  it("rejects an oversized recognized scalar before domain parsing", () => {
    const source = `Home address: ${"A".repeat(99_985)}`;
    const startedAt = performance.now();
    const result = parseSmartImportText(source);
    const elapsedMs = performance.now() - startedAt;

    expect(source).toHaveLength(99_999);
    expect(result.candidates).toEqual([]);
    expect(elapsedMs).toBeLessThan(1_500);
  }, 15_000);

  it("bounds a maximum-size recognized horizontal CSV", () => {
    const columnCount = 5_000;
    const source = `${Array(columnCount).fill("email").join(",")}\n${Array(columnCount)
      .fill("x@example.com")
      .join(",")}`;
    const startedAt = performance.now();
    const result = parseSmartImportText(source);
    const elapsedMs = performance.now() - startedAt;

    expect(result.candidates.length).toBeLessThanOrEqual(5);
    expect(elapsedMs).toBeLessThan(1_500);
  }, 15_000);

  it("bounds repeated alternatives while preserving an explicit conflict", () => {
    const startedAt = performance.now();
    const result = parseSmartImportText(
      Array.from(
        { length: 2_000 },
        (_, index) => `Email: person${index}@example.com`,
      ).join("\n"),
    );
    const elapsedMs = performance.now() - startedAt;
    const review = buildSmartImportReview({ currentValues: {}, parsed: result });
    const emails = review.items.filter((item) => item.fieldId === "email");

    expect(emails.length).toBeGreaterThan(1);
    expect(emails.length).toBeLessThanOrEqual(5);
    expect(emails.every((item) => item.status === "source_conflict")).toBe(true);
    expect(emails.every((item) => !item.selectedByDefault)).toBe(true);
    expect(result.summary).toContain("Ограничено вариантов");
    expect(elapsedMs).toBeLessThan(1_500);
  }, 15_000);

  it("rejects placeholders from free-text identity, employer, and host fields", () => {
    const result = parseSmartImportText(`
      Фамилия: не указано
      Имя: unknown
      Работодатель: N/A
      Адрес работодателя: TBD
      Название отеля: pending
      Адрес отеля: нет данных
    `);

    expect(candidate(result, "surname")).toBeUndefined();
    expect(candidate(result, "first-name")).toBeUndefined();
    expect(candidate(result, "employer-name")).toBeUndefined();
    expect(candidate(result, "employer-address")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
    expect(candidate(result, "hotel-address")).toBeUndefined();
  });

  it("rejects qualified placeholder phrases in free-text fields", () => {
    const result = parseSmartImportText(`
      Surname: Not provided yet
      Employer: Not provided by applicant
      Hotel name: Unknown at this time
      Birth place: нет данных пока
      First name: write here
      Previous surname: not provided due to privacy
      Home city: unknown pending
      Hotel address: to be confirmed
    `);

    expect(candidate(result, "surname")).toBeUndefined();
    expect(candidate(result, "employer-name")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
    expect(candidate(result, "birth-place")).toBeUndefined();
    expect(candidate(result, "first-name")).toBeUndefined();
    expect(candidate(result, "previous-surname")).toBeUndefined();
    expect(candidate(result, "home-city")).toBeUndefined();
    expect(candidate(result, "hotel-address")).toBeUndefined();
  });

  it("rejects blank-form prompts instead of proposing them as applicant data", () => {
    const result = parseSmartImportText(`
      Surname: enter surname here
      First name: write here
      Hotel name: to be confirmed
    `);

    expect(result.candidates).toEqual([]);
  });

  it.each([
    `Field,Value
Surname,required
First name,optional
Employer,enter company name
Hotel name,to be completed`,
    `surname,first_name,employer_name
required,optional,enter company name`,
    JSON.stringify({
      employer_name: "enter company name",
      first_name: "optional",
      surname: "required",
    }),
    `Surname
Required
First name
Optional`,
  ])("rejects blank-template prompts in every structured format", (source) => {
    const result = parseSmartImportText(source);

    expect(candidate(result, "surname")).toBeUndefined();
    expect(candidate(result, "first-name")).toBeUndefined();
    expect(candidate(result, "employer-name")).toBeUndefined();
    expect(candidate(result, "hotel-name")).toBeUndefined();
  });

  it.each([
    "Surname: Please enter surname",
    "First name: Please provide first name",
    "Employer: Not applicable",
    "Previous surname: Same as above",
    "Home city: Select city",
    "Hotel name: Not applicable",
    "Hotel name: No hotel",
    "Hotel address: Not applicable",
  ])("rejects common prompts and absence placeholders: %s", (source) => {
    expect(parseSmartImportText(source).candidates).toEqual([]);
  });

  it.each([
    "Surname: Please enter your full legal surname exactly as shown in passport",
    "First name: Please provide your complete legal first name exactly as printed",
    "Employer: Please enter the full legal company name from your employment letter",
    "Hotel name: Please enter the complete accommodation name from your booking confirmation",
    "Фамилия: Пожалуйста укажите полную фамилию точно как она напечатана в паспорте",
  ])("rejects long form instructions: %s", (source) => {
    expect(parseSmartImportText(source).candidates).toEqual([]);
  });

  it("rejects an uncertain phrase that merely contains an English month", () => {
    const result = parseSmartImportText("Birth date: 12 may be 1990");

    expect(candidate(result, "birth-date")).toBeUndefined();
  });

  it.each([
    ["Maiden name: Smith", "previous-surname", "SMITH"],
    ["Workplace: ACME", "employer-name", "ACME"],
    ["School: Madrid University", "employer-name", "MADRID UNIVERSITY"],
    ["University: UCM", "employer-name", "UCM"],
    ["Paid by: employer", "cost-covered-by", "Спонсор"],
    ["Entries: single", "entry-count", "Однократная"],
    ["Number of entries: two", "entry-count", "Двукратная"],
  ] as const)(
    "keeps an authoritative questionnaire alias reachable: %s",
    (source, fieldId, value) => {
      expect(candidateValue(parseSmartImportText(source), fieldId)).toBe(value);
    },
  );

  it.each([
    ["number_of_entries", 1, "Однократная"],
    ["entries", 2, "Двукратная"],
  ] as const)("accepts numeric JSON entry alias %s", (label, value, expected) => {
    expect(
      candidateValue(
        parseSmartImportText(JSON.stringify({ [label]: value })),
        "entry-count",
      ),
    ).toBe(expected);
  });

  it("normalizes common camelCase JSON labels before routing", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        dateOfBirth: "01.01.1990",
        entryCount: 1,
        firstName: "Ivan",
        homeCity: "Madrid",
        hotelName: "Central",
        lastName: "Ivanov",
        postalCode: "28013",
      }),
    );

    expect(candidateValue(result, "surname")).toBe("IVANOV");
    expect(candidateValue(result, "first-name")).toBe("IVAN");
    expect(candidateValue(result, "birth-date")).toBe("01.01.1990");
    expect(candidateValue(result, "home-city")).toBe("Madrid");
    expect(candidateValue(result, "postal-code")).toBe("28013");
    expect(candidateValue(result, "entry-count")).toBe("Однократная");
    expect(candidateValue(result, "hotel-name")).toBe("CENTRAL");
  });

  it("does not let unknown JSON metadata consume the recognized-row budget", () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 250 }, (_, index) => [
        `metadata_${index}`,
        `value_${index}`,
      ]),
    );
    const objectResult = parseSmartImportText(
      JSON.stringify({ ...metadata, surname: "Ivanov" }),
    );
    const roleMetadataResult = parseSmartImportText(
      JSON.stringify({
        ...Object.fromEntries(
          Array.from({ length: 250 }, (_, index) => [
            `company_metadata_${index}`,
            `value_${index}`,
          ]),
        ),
        surname: "Ivanov",
      }),
    );
    const schoolMetadataResult = parseSmartImportText(
      JSON.stringify({
        ...Object.fromEntries(
          Array.from({ length: 250 }, (_, index) => [
            `school_metadata_${index}`,
            `value_${index}`,
          ]),
        ),
        surname: "Ivanov",
      }),
    );
    const wrapperResult = parseSmartImportText(
      JSON.stringify([
        ...Array.from({ length: 130 }, (_, index) => ({
          field: `metadata_${index}`,
          value: `value_${index}`,
        })),
        { field: "surname", value: "Ivanov" },
      ]),
    );

    expect(candidateValue(objectResult, "surname")).toBe("IVANOV");
    expect(candidateValue(roleMetadataResult, "surname")).toBe("IVANOV");
    expect(candidateValue(schoolMetadataResult, "surname")).toBe("IVANOV");
    expect(candidateValue(wrapperResult, "surname")).toBe("IVANOV");
  });

  it("does not let unsupported questionnaire fields consume the smart-import row budget", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        fields: [
          ...Array.from({ length: 250 }, (_, index) => ({
            field: "residence permit number",
            value: `RP${index}`,
          })),
          { field: "surname", value: "Ivanov" },
        ],
      }),
    );

    expect(candidateValue(result, "surname")).toBe("IVANOV");
  });

  it("does not let duplicate supported JSON rows consume the smart-import row budget", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        fields: [
          ...Array.from({ length: 250 }, () => ({
            field: "email",
            value: "same@example.com",
          })),
          { field: "surname", value: "Ivanov" },
        ],
      }),
    );

    expect(candidateValue(result, "email")).toBe("same@example.com");
    expect(candidateValue(result, "surname")).toBe("IVANOV");
  });

  it("keeps later JSON fields and reports bounded unique alternatives", () => {
    const result = parseSmartImportText(
      JSON.stringify({
        fields: [
          ...Array.from({ length: 250 }, (_, index) => ({
            field: "email",
            value: `person${index}@example.com`,
          })),
          { field: "surname", value: "Ivanov" },
        ],
      }),
    );

    expect(result.candidates.filter((item) => item.fieldId === "email")).toHaveLength(
      5,
    );
    expect(candidateValue(result, "surname")).toBe("IVANOV");
    expect(result.summary).toContain("Ограничено вариантов: 245");
  });

  it.each([
    ["email", "email", "valid@example.com", "valid@example.com"],
    ["birth_date", "birth-date", "01.01.1990", "01.01.1990"],
    ["phone", "contact-number", "+34910000000", "+34910000000"],
    ["entry_count", "entry-count", "single", "Однократная"],
    ["gender", "gender", "M", "Мужской"],
  ] as const)(
    "does not let invalid %s values consume the structured alternative budget",
    (field, fieldId, validValue, expectedValue) => {
      const invalidValue =
        field === "birth_date"
          ? (index: number) => `31.02.199${index}`
          : (index: number) => `invalid-${index}`;
      const result = parseSmartImportText(
        JSON.stringify({
          fields: [
            ...Array.from({ length: 5 }, (_, index) => ({
              field,
              value: invalidValue(index),
            })),
            { field, value: validValue },
            { field: "surname", value: "Ivanov" },
          ],
        }),
      );

      expect(candidateValue(result, fieldId)).toBe(expectedValue);
      expect(candidateValue(result, "surname")).toBe("IVANOV");
      expect(result.summary).not.toContain("Ограничено вариантов");
    },
  );

  it("deduplicates each canonical field and keeps the stronger candidate", () => {
    const result = parseSmartImportText(`
      Email: strong@example.com
      Для связи strong@example.com
    `);

    expect(result.candidates.filter((item) => item.fieldId === "email")).toHaveLength(
      1,
    );
    expect(candidate(result, "email")?.confidence).toBe("high");
  });

  it("preserves contradictory values repeated inside one source for manual choice", () => {
    const parsed = parseSmartImportText(`
      Email: first@example.com
      Email: second@example.com
    `);
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const alternatives = review.items.filter((item) => item.fieldId === "email");

    expect(alternatives.map((item) => item.value).sort()).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    expect(alternatives.every((item) => item.status === "source_conflict")).toBe(true);
    expect(alternatives.every((item) => !item.selectedByDefault)).toBe(true);
    expect(parsed.summary).toContain("Найдено полей: 1");
    expect(parsed.summary).toContain("Требуют выбора: 1");
  });

  it("preserves multiple emails inside one labelled value for manual choice", () => {
    const parsed = parseSmartImportText("Email: first@example.com, second@example.com");
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const emails = review.items.filter((item) => item.fieldId === "email");

    expect(emails.map((item) => item.value).sort()).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    expect(emails.every((item) => item.status === "source_conflict")).toBe(true);
    expect(emails.every((item) => !item.selectedByDefault)).toBe(true);
  });

  it("preserves multiple dates inside one labelled value for manual choice", () => {
    const parsed = parseSmartImportText("Arrival date: 18.09.2026 or 19.09.2026");
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const dates = review.items.filter((item) => item.fieldId === "arrival-date");

    expect(dates.map((item) => item.value).sort()).toEqual([
      "18.09.2026",
      "19.09.2026",
    ]);
    expect(dates.every((item) => item.status === "source_conflict")).toBe(true);
    expect(dates.every((item) => !item.selectedByDefault)).toBe(true);
  });

  it.each([
    [
      "Arrival date: 18 September 2026 or 19 September 2026",
      "arrival-date",
      ["18.09.2026", "19.09.2026"],
    ],
    [
      "Дата въезда: 18 сентября 2026 или 19 сентября 2026",
      "arrival-date",
      ["18.09.2026", "19.09.2026"],
    ],
    [
      "Birth date: 31st January 1990 / 1st February 1990",
      "birth-date",
      ["01.02.1990", "31.01.1990"],
    ],
    [
      "Birth date: 31st January 1990/1st February 1990",
      "birth-date",
      ["01.02.1990", "31.01.1990"],
    ],
  ] as const)(
    "preserves textual date alternatives from %s",
    (source, fieldId, expectedValues) => {
      const parsed = parseSmartImportText(source);
      const review = buildSmartImportReview({ currentValues: {}, parsed });
      const dates = review.items.filter((item) => item.fieldId === fieldId);

      expect(dates.map((item) => item.value).sort()).toEqual([...expectedValues]);
      expect(dates.every((item) => item.status === "source_conflict")).toBe(true);
      expect(dates.every((item) => !item.selectedByDefault)).toBe(true);
    },
  );

  it("keeps the valid part of a partly invalid date alternative as low confidence", () => {
    const parsed = parseSmartImportText("Arrival date: 31.02.2026 or 01.03.2026");
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const arrival = review.items.find((item) => item.fieldId === "arrival-date");

    expect(arrival).toMatchObject({
      selectedByDefault: false,
      status: "low_confidence",
      value: "01.03.2026",
    });
  });

  it.each([
    "Phone: +1 202 555 0100 / +1 202 555 0101",
    "Phone: +12025550100/+12025550101",
  ])("preserves multiple telephone values inside one labelled value: %s", (source) => {
    const parsed = parseSmartImportText(source);
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const phones = review.items.filter((item) => item.fieldId === "contact-number");

    expect(phones.map((item) => item.value).sort()).toEqual([
      "+12025550100",
      "+12025550101",
    ]);
    expect(phones.every((item) => item.status === "source_conflict")).toBe(true);
    expect(phones.every((item) => !item.selectedByDefault)).toBe(true);
  });

  it("keeps a legal country name containing a conjunction", () => {
    const result = parseSmartImportText("Nationality: Bosnia and Herzegovina");

    expect(candidateValue(result, "nationality")).toBe("Bosnia and Herzegovina");
  });

  it("does not split an official country name at its comma", () => {
    const parsed = parseSmartImportText(
      "Nationality: Congo, Democratic Republic of the",
    );
    const review = buildSmartImportReview({ currentValues: {}, parsed });
    const nationalities = review.items.filter((item) => item.fieldId === "nationality");

    expect(nationalities.map((item) => item.value)).toEqual([
      "Congo, Democratic Republic of the",
    ]);
    expect(nationalities[0]?.status).toBe("new");
  });

  it.each([
    ["Purpose: tourism or business", "purpose", ["BUSINESS", "TOURISM"]],
    ["Purpose: tourism/business", "purpose", ["BUSINESS", "TOURISM"]],
    ["Цель поездки: туризм / лечение", "purpose", ["MEDICAL TREATMENT", "TOURISM"]],
    ["Main destination: Spain or France", "main-destination", ["France", "Spain"]],
    ["Nationality: Spain, France", "nationality", ["France", "Spain"]],
    ["Nationality: Russia / France", "nationality", ["France", "Russian Federation"]],
    ["Nationality: Russia/France", "nationality", ["France", "Russian Federation"]],
    [
      "Marital status: married or divorced",
      "marital-status",
      ["Женат/замужем", "Разведен(а)"],
    ],
    [
      "Количество въездов: однократная или многократная",
      "entry-count",
      ["Многократная", "Однократная"],
    ],
    [
      "Кто оплачивает: заявитель или работодатель",
      "cost-covered-by",
      ["Сам заявитель", "Спонсор"],
    ],
    [
      "First entry country: USA or Canada",
      "first-entry-country",
      ["Canada", "United States"],
    ],
    [
      "First entry country: Bosnia and Herzegovina or Spain",
      "first-entry-country",
      ["Bosnia and Herzegovina", "Spain"],
    ],
  ] as const)(
    "preserves categorical alternatives from %s",
    (source, fieldId, expectedValues) => {
      const parsed = parseSmartImportText(source);
      const review = buildSmartImportReview({ currentValues: {}, parsed });
      const items = review.items.filter((item) => item.fieldId === fieldId);

      expect(items.map((item) => item.value).sort()).toEqual([...expectedValues]);
      expect(items.every((item) => item.status === "source_conflict")).toBe(true);
      expect(items.every((item) => !item.selectedByDefault)).toBe(true);
    },
  );

  it.each([
    ["Surname: Ivanov or Petrov", "surname", ["IVANOV", "PETROV"]],
    ["Фамилия: Иванов или Петров", "surname", ["ИВАНОВ", "ПЕТРОВ"]],
    ["First name: Ivan or John", "first-name", ["IVAN", "JOHN"]],
    ["Previous surname: Smith or Jones", "previous-surname", ["JONES", "SMITH"]],
    ["Employer: ACME or BETA", "employer-name", ["ACME", "BETA"]],
    ["Hotel name: Central or Plaza", "hotel-name", ["CENTRAL", "PLAZA"]],
  ] as const)(
    "preserves explicit free-text alternatives from %s",
    (source, fieldId, expectedValues) => {
      const parsed = parseSmartImportText(source);
      const review = buildSmartImportReview({ currentValues: {}, parsed });
      const items = review.items.filter((item) => item.fieldId === fieldId);

      expect(items.map((item) => item.value).sort()).toEqual([...expectedValues]);
      expect(items.every((item) => item.status === "source_conflict")).toBe(true);
      expect(items.every((item) => !item.selectedByDefault)).toBe(true);
    },
  );

  it("does not treat instructional prose as collapsed OCR field data", () => {
    const instructions = parseSmartImportText(
      "The first name field and last name field are required",
    );
    const policy = parseSmartImportText(
      "Company policy contact support email help@example.com",
    );

    expect(candidate(instructions, "first-name")).toBeUndefined();
    expect(candidate(instructions, "surname")).toBeUndefined();
    expect(candidate(policy, "employer-name")).toBeUndefined();
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
    expect(emailItems.every((item) => item.status === "source_conflict")).toBe(true);
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

  it("keeps every conflicting value from the bounded ten-file package", () => {
    const merged = mergeSmartImportParsedResults(
      Array.from({ length: 10 }, (_, index) =>
        parseSmartImportText(`Email: package${index}@example.com`),
      ),
    );
    const review = buildSmartImportReview({ currentValues: {}, parsed: merged });
    const emails = review.items.filter((item) => item.fieldId === "email");

    expect(emails).toHaveLength(10);
    expect(emails.every((item) => item.status === "source_conflict")).toBe(true);
    expect(emails.every((item) => !item.selectedByDefault)).toBe(true);
    expect(merged.summary).not.toContain("Ограничено вариантов");
  });

  it("propagates a source truncation signal into the package summary", () => {
    const truncatedSource = parseSmartImportText(
      Array.from(
        { length: 6 },
        (_, index) => `Email: alternative${index}@example.com`,
      ).join("\n"),
    );
    const merged = mergeSmartImportParsedResults([
      truncatedSource,
      parseSmartImportText("Surname: Ivanov"),
    ]);

    expect(
      truncatedSource.candidates.filter((item) => item.fieldId === "email"),
    ).toHaveLength(5);
    expect(truncatedSource.summary).toContain("Ограничено вариантов: 1");
    expect(merged.summary).toContain("Ограничено вариантов: 1");
  });

  it("revalidates cross-field consistency after package sources are merged", () => {
    const merged = mergeSmartImportParsedResults([
      parseSmartImportText(`
        Booking confirmation
        Check-in: 18.09.2026
        Check-out: 27.09.2026
      `),
      parseSmartImportText(`
        Booking confirmation
        Check-in: 19.09.2026
        Check-out: 27.09.2026
      `),
    ]);

    expect(
      merged.candidates.filter((item) => item.fieldId === "arrival-date"),
    ).toHaveLength(2);
    const review = buildSmartImportReview({ currentValues: {}, parsed: merged });
    const durations = review.items.filter((item) => item.fieldId === "stay-duration");
    expect(durations.map((item) => item.value).sort()).toEqual(["10", "9"]);
    expect(durations.every((item) => item.status === "source_conflict")).toBe(true);
    expect(durations.every((item) => !item.selectedByDefault)).toBe(true);
  });
});
