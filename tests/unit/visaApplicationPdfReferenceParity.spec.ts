import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { createReferenceVisaApplicationFormPdfBlob } from "../../src/modules/submissions/visaApplicationFormReferencePdf";
import {
  resolveVisaFormSelections,
  VisaApplicationFormRenderError,
  visaFormTextFits,
} from "../../src/modules/submissions/visaApplicationFormRenderContract";
import { VISA_APPLICATION_FORM_TEMPLATE_BASE64 } from "../../src/modules/submissions/visaApplicationFormTemplate";
import type { VisaFormData } from "../../src/modules/submissions/visaApplicationFormPdf";

type PdfTextItem = {
  fontName: string;
  str: string;
  transform: number[];
};

const filledReferencePath = "docs/пиздец/Выгрузка_Анкета.pdf";

const formData: VisaFormData = {
  address: "12 TEST STREET",
  addressCity: "MOSCOW",
  birthCountry: "RUSSIA",
  birthDate: "01.01.1990",
  birthPlace: "MOSCOW",
  citizenship: "RUSSIA",
  companyContact: "TEST CONTACT",
  companyDetails: "TEST COMPANY",
  companyPhone: "70000000000",
  costCoveredBy: "APPLICANT",
  duration: "7",
  email: "TEST@EXAMPLE.COM",
  employer: "TEST EMPLOYER",
  entries: "SINGLE",
  firstEntryCountry: "SPAIN",
  firstName: "ALICE",
  gender: "female",
  hotelAddress: "1 HOTEL ROAD",
  hotelCity: "MADRID",
  hotelCountry: "SPAIN",
  hotelEmail: "HOTEL@EXAMPLE.COM",
  hotelName: "TEST HOTEL",
  hotelPhone: "+70000000000",
  issueCountry: "RUSSIA",
  issueDate: "01.01.2020",
  issuePlace: "MOSCOW",
  maritalStatus: "single",
  mainDestination: "SPAIN",
  meansOfSupport: "CASH",
  nationalityAtBirth: "RUSSIA",
  occupation: "ENGINEER",
  passportExpiry: "01.01.2030",
  passportNo: "AA1234567",
  passportType: "ordinary",
  phone: "+70000000000",
  postalCode: "100000",
  purpose: "tourism",
  residenceCountry: "RUSSIA",
  surname: "SYNTHETIC",
  surnameAtBirth: "SYNTHETIC",
  tripFrom: "01.08.2026",
  tripTo: "08.08.2026",
  visaSubType: "C",
};

describe("visa application PDF reference parity", () => {
  test("removes every filled-source field while retaining the four-page form", async () => {
    const [filledReference, template] = await Promise.all([
      readFile(filledReferencePath),
      Promise.resolve(decodeTemplate()),
    ]);
    const [filledItems, templateItems] = await Promise.all([
      readPdfTextItems(filledReference),
      readPdfTextItems(template),
    ]);

    expect(templateItems).toHaveLength(4);

    const sourceFieldCoordinates = filledItems.flatMap((items, pageIndex) =>
      items
        .filter((item) => isFilledSourceField(pageIndex, item))
        .map((item) => coordinateKey(pageIndex, item)),
    );
    const templateCoordinates = new Set(
      templateItems.flatMap((items, pageIndex) =>
        items
          .filter((item) => item.str.trim())
          .map((item) => coordinateKey(pageIndex, item)),
      ),
    );

    expect(sourceFieldCoordinates.length).toBeGreaterThan(20);
    for (const coordinate of sourceFieldCoordinates) {
      expect(templateCoordinates).not.toContain(coordinate);
    }
  });

  test("preserves the sanitised source bytes and writes data at extracted field baselines", async () => {
    const template = decodeTemplate();
    const generated = new Uint8Array(
      await createReferenceVisaApplicationFormPdfBlob(formData).arrayBuffer(),
    );

    expect(sha256(generated.subarray(0, template.length))).toBe(sha256(template));
    const pages = await readPdfTextItems(generated);

    expect(pages).toHaveLength(4);
    expect(hasTextAt(pages[0] ?? [], "SYNTHETIC", 66.75, 576.75)).toBe(true);
    expect(hasTextAt(pages[0] ?? [], "AA1234567", 66.75, 225)).toBe(true);
    expect(hasTextAt(pages[1] ?? [], "TEST@EXAMPLE.COM", 59.75, 670.5)).toBe(true);
    expect(hasTextAt(pages[2] ?? [], "TEST COMPANY", 59.75, 694.25)).toBe(true);
    expect(hasTextAt(pages[2] ?? [], "TEST CONTACT", 59.75, 655.98)).toBe(true);
    expect(hasTextAt(pages[2] ?? [], "70000000000", 295.96, 663.05)).toBe(true);
    expect(hasTextAt(pages[2] ?? [], "APPLICANT", 59.75, 656)).toBe(false);
    expect(
      textAt(pages[0] ?? [], "SYNTHETIC", 66.75, 576.75)?.transform[3] ?? 0,
    ).toBeGreaterThan(0);
  });

  test("maps canonical questionnaire selections to their exact reference checkbox positions", async () => {
    const generated = new TextDecoder("iso-8859-1").decode(
      new Uint8Array(
        await createReferenceVisaApplicationFormPdfBlob({
          ...formData,
          costCoveredBy: "Сам заявитель",
          entries: "Многократная",
          gender: "Мужской",
          maritalStatus: "Женат/замужем",
          meansOfSupport: "Дорожные чеки",
          passportType: "Special Passport",
          purpose: "MEDICAL TREATMENT",
        }).arrayBuffer(),
      ),
    );

    expect(generated).toContain(checkboxStrokeAt(57.37, 423.98));
    expect(generated).toContain(checkboxStrokeAt(295.02, 423.98));
    expect(generated).toContain(checkboxStrokeAt(305.39, 285.83));
    expect(generated).toContain(checkboxStrokeAt(173.36, 492.83));
    expect(generated).toContain(checkboxStrokeAt(193.64, 361.27));
    expect(generated).toContain(checkboxStrokeAt(57.37, 558.84));
    expect(generated).not.toContain(checkboxStrokeAt(196.47, 503.2));
  });

  test("renders the conditional sponsor selections in the right side of field 33", async () => {
    const generated = new TextDecoder("iso-8859-1").decode(
      new Uint8Array(
        await createReferenceVisaApplicationFormPdfBlob({
          ...formData,
          costCoveredBy: "Спонсор",
          meansOfSupport: "",
          sponsorInHostFields: "Да",
          sponsorMeans: "Все расходы оплачиваются",
        }).arrayBuffer(),
      ),
    );

    expect(generated).toContain(checkboxStrokeAt(293.6, 602.22));
    expect(generated).toContain(checkboxStrokeAt(303.03, 582.89));
    expect(generated).toContain(checkboxStrokeAt(293.6, 514.99));
    expect(generated).not.toContain(checkboxStrokeAt(57.37, 571.1));
  });

  test("covers every supported canonical select value and fails closed on unsafe values", () => {
    for (const [value, expected] of [
      ["Мужской", "male"],
      ["Женский", "female"],
    ] as const) {
      expect(resolveVisaFormSelections({ ...formData, gender: value }).gender).toBe(
        expected,
      );
    }
    for (const [value, expected] of [
      ["Холост/не замужем", "single"],
      ["Женат/замужем", "married"],
      ["Зарегистрированное партнерство", "registered"],
      ["Раздельно", "separated"],
      ["Разведен(а)", "divorced"],
      ["Вдовец/вдова", "widow"],
    ] as const) {
      expect(
        resolveVisaFormSelections({ ...formData, maritalStatus: value }).maritalStatus,
      ).toBe(expected);
    }
    for (const [value, expected] of [
      ["Ordinary Passport", "ordinary"],
      ["Diplomatic Passport", "diplomatic"],
      ["Service Passport", "service"],
      ["Official Passport", "official"],
      ["Special Passport", "special"],
      ["Travel Document", "otherDocument"],
      ["Other", "otherDocument"],
    ] as const) {
      expect(
        resolveVisaFormSelections({ ...formData, passportType: value }).passportType,
      ).toBe(expected);
    }
    for (const [value, expected] of [
      ["TOURISM", "tourism"],
      ["BUSINESS", "business"],
      ["VISITING FAMILY OR FRIENDS", "visit"],
      ["STUDY", "study"],
      ["MEDICAL TREATMENT", "medical"],
      ["OFFICIAL VISIT", "official"],
      ["CULTURAL", "cultural"],
      ["SPORTS", "sports"],
      ["TRANSIT", "transit"],
      ["OTHER", "other"],
    ] as const) {
      expect(resolveVisaFormSelections({ ...formData, purpose: value }).purpose).toBe(
        expected,
      );
    }
    for (const [value, expected] of [
      ["Однократная", "single"],
      ["Двукратная", "two"],
      ["Многократная", "multiple"],
    ] as const) {
      expect(resolveVisaFormSelections({ ...formData, entries: value }).entries).toBe(
        expected,
      );
    }
    for (const [value, expected] of [
      ["Сам заявитель", "applicant"],
      ["Спонсор", "sponsor"],
    ] as const) {
      expect(
        resolveVisaFormSelections({ ...formData, costCoveredBy: value }).costCoveredBy,
      ).toBe(expected);
    }
    for (const [value, expected] of [
      ["Наличные", "cash"],
      ["Дорожные чеки", "cheques"],
      ["Кредитная карта", "credit"],
      ["Жилье предоплачено", "accommodation"],
      ["Транспорт предоплачен", "transport"],
      ["Иное", "other"],
    ] as const) {
      expect(
        resolveVisaFormSelections({ ...formData, meansOfSupport: value })
          .meansOfSupport,
      ).toBe(expected);
    }
    for (const [value, expected] of [
      ["Наличные", "cash"],
      ["Жилье предоставляется", "accommodation"],
      ["Все расходы оплачиваются", "allExpenses"],
      ["Транспорт предоплачен", "transport"],
      ["Иное", "other"],
    ] as const) {
      expect(
        resolveVisaFormSelections({ ...formData, sponsorMeans: value }).sponsorMeans,
      ).toBe(expected);
    }
    expect(
      resolveVisaFormSelections({ ...formData, sponsorInHostFields: "Да" })
        .sponsorInHostFields,
    ).toBe("listed");
    expect(
      resolveVisaFormSelections({ ...formData, sponsorInHostFields: "Нет" })
        .sponsorInHostFields,
    ).toBe("other");

    expect(() =>
      createReferenceVisaApplicationFormPdfBlob({
        ...formData,
        maritalStatus: "Иное",
      }),
    ).toThrow(VisaApplicationFormRenderError);
    expect(() =>
      createReferenceVisaApplicationFormPdfBlob({
        ...formData,
        address: "A".repeat(500),
      }),
    ).toThrow(VisaApplicationFormRenderError);
    expect(visaFormTextFits("W".repeat(33), 6.13, 112)).toBe(false);
    expect(visaFormTextFits("I".repeat(33), 6.13, 112)).toBe(true);
    expect(() =>
      createReferenceVisaApplicationFormPdfBlob({
        ...formData,
        surname: "W".repeat(33),
      }),
    ).toThrow(VisaApplicationFormRenderError);
    expect(() =>
      createReferenceVisaApplicationFormPdfBlob({
        ...formData,
        passportNo: "I".repeat(33),
      }),
    ).toThrow(VisaApplicationFormRenderError);
    expect(() =>
      createReferenceVisaApplicationFormPdfBlob({
        ...formData,
        phone: "CALL ME",
      }),
    ).toThrow(VisaApplicationFormRenderError);
    expect(() =>
      createReferenceVisaApplicationFormPdfBlob({
        ...formData,
        tripFrom: "01.08.2026junk",
      }),
    ).toThrow(VisaApplicationFormRenderError);
    expect(() =>
      createReferenceVisaApplicationFormPdfBlob({
        ...formData,
        firstName: "李",
      }),
    ).toThrow(VisaApplicationFormRenderError);
  });
});

function decodeTemplate() {
  return Uint8Array.from(atob(VISA_APPLICATION_FORM_TEMPLATE_BASE64), (character) =>
    character.charCodeAt(0),
  );
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readPdfTextItems(bytes: Uint8Array): Promise<PdfTextItem[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: Uint8Array.from(bytes) }).promise;
  const pages: PdfTextItem[][] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const content = await (await pdf.getPage(index)).getTextContent();
    pages.push(
      (content.items.filter(isPdfTextItem) as PdfTextItem[]).map((item) => ({
        fontName: item.fontName,
        str: item.str,
        transform: item.transform,
      })),
    );
  }
  return pages;
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "fontName" in item &&
    "str" in item &&
    "transform" in item
  );
}

function isFilledSourceField(pageIndex: number, item: PdfTextItem) {
  if (!item.str.trim() || !/f2/.test(item.fontName)) return false;
  const x = item.transform[4] ?? 0;
  const y = item.transform[5] ?? 0;
  if (pageIndex === 0) return x < 440;
  if (pageIndex === 1) return true;
  if (pageIndex === 2) return y >= 285;
  return false;
}

function coordinateKey(pageIndex: number, item: PdfTextItem) {
  return [
    pageIndex,
    Math.round((item.transform[4] ?? 0) * 100),
    Math.round((item.transform[5] ?? 0) * 100),
  ].join(":");
}

function hasTextAt(items: PdfTextItem[], value: string, x: number, y: number) {
  return Boolean(textAt(items, value, x, y));
}

function textAt(items: PdfTextItem[], value: string, x: number, y: number) {
  return items.find(
    (item) =>
      item.str === value &&
      Math.abs((item.transform[4] ?? 0) - x) < 0.2 &&
      Math.abs((item.transform[5] ?? 0) - y) < 0.2,
  );
}

function checkboxStrokeAt(x: number, y: number) {
  const inset = 2.6;
  return [
    "0.65 w",
    n((x + inset - 42.75) / 0.75),
    n((771.5 - (y + inset)) / 0.75),
    "m",
  ].join(" ");
}

function n(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
