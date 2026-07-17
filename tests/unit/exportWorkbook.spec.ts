import { describe, expect, test, vi } from "vitest";
import {
  buildExportInternalMappings,
  buildExportPackageIdentity,
  buildExportRows,
  exportRowsMatchPackageIdentity,
  exportSummary,
  isSubmissionSelectableForExport,
} from "../../src/modules/submissions/exportRules";
import {
  buildExportWorkbookRowFills,
  buildExportWorkbookRows,
  createExportWorkbookBlob,
  createExportWorkbookArtifact,
  default as downloadExportWorkbook,
} from "../../src/modules/submissions/exportWorkbook";
import {
  parseExportWorkbookArtifact,
  verifyExportWorkbookArtifact,
} from "../../src/modules/submissions/exportWorkbookVerification";
import {
  buildExportContractRows,
  EXPORT_WORKBOOK_COLUMN_COUNT,
  EXPORT_WORKBOOK_RANGE,
  EXPORT_WORKBOOK_SHEET_NAME,
  EXPECTED_EXPORT_CONTRACT_HEADERS,
  exportContractHeaders,
  isRealBlsApplicantRow,
  normalizeExportContractDateInput,
} from "../../src/modules/submissions/exportContract";
import { buildApplicantDocumentFileName } from "../../src/modules/submissions/filenamePolicy";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  BLS_CITY_OPTIONS,
  createQuestionnaireSections,
} from "../../src/modules/submissions/questionnaire";
import {
  cityFilterValuesForSubmissions,
  searchSubmissions,
} from "../../src/modules/submissions/selectors";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import type {
  ExportPackageIdentity,
  Submission,
} from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
}

function canonicalMediaSubmission(submission: Submission): Submission {
  return {
    ...submission,
    files: submission.files.filter(
      (file) =>
        file.type === "passport_scan" ||
        file.type === "selfie" ||
        file.type === "selfie_2",
    ),
  };
}

function readySubmission(): Submission {
  return fillRequiredQuestionnaireForTest(
    canonicalMediaSubmission(byId("ПД-1056")),
  );
}

function withoutQuestionnaireField(
  submission: Submission,
  fieldId: string,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.id !== fieldId),
      })),
    })),
  };
}

function withQuestionnaireFieldValues(
  submission: Submission,
  values: Record<string, string>,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({
          ...field,
          value: values[field.id] ?? field.value,
        })),
      })),
    })),
  };
}

function withApplicantQuestionnaireFieldValues(
  submission: Submission,
  applicantIndex: number,
  values: Record<string, string>,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant, index) =>
      index === applicantIndex
        ? {
            ...applicant,
            sections: applicant.sections.map((section) => ({
              ...section,
              fields: section.fields.map((field) => ({
                ...field,
                value: values[field.id] ?? field.value,
              })),
            })),
          }
        : applicant,
    ),
  };
}

function withApplicantPassports(
  submission: Submission,
  passportNumbers: string[],
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant, applicantIndex) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) =>
          field.id === "passport-no"
            ? { ...field, value: passportNumbers[applicantIndex] ?? field.value }
            : field,
        ),
      })),
    })),
  };
}

function withSubmissionIdentity(
  submission: Submission,
  id: string,
  title: string,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant, index) => ({
      ...applicant,
      id: `${id}-applicant-${index + 1}`,
    })),
    files: submission.files.map((file) => ({
      ...file,
      applicantId: `${id}-applicant-${submission.applicants.findIndex(
        (applicant) => applicant.id === file.applicantId,
      ) + 1}`,
      id: `${id}-${file.id}`,
    })),
    id,
    title,
  };
}

function withFirstApplicantNameOnly(
  submission: Submission,
  fullName: string,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant, index) => ({
      ...applicant,
      fullName: index === 0 ? fullName : applicant.fullName,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.filter(
          (field) =>
            !["first-name", "surname", "previous-surname"].includes(field.id),
        ),
      })),
    })),
  };
}

async function workbookFilesFromBlob(blob: Blob): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
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

describe("V-19 export workbook contract", () => {
  test("rejects workbook rows that are not exactly 56 columns wide", () => {
    expect(() =>
      createExportWorkbookBlob([Array.from({ length: 55 }, () => "")]),
    ).toThrow("must contain exactly 56 columns");
    expect(() =>
      createExportWorkbookBlob([Array.from({ length: 57 }, () => "")]),
    ).toThrow("must contain exactly 56 columns");
  });

  test("generates a parseable Sheet1 workbook with exact A:BD 56-column shape", async () => {
    const selection = applyExportStateToSelection(
      [readySubmission()],
      ["ПД-1056"],
      "file_generated",
    );
    const plan = exportSummary(selection);
    if (!plan.downloadPackageIdentity) throw new Error("expected package identity");

    const artifact = createExportWorkbookArtifact(
      plan.rows,
      plan.downloadPackageIdentity,
    );
    const parsed = await parseExportWorkbookArtifact(artifact);

    expect(artifact.sheetName).toBe(EXPORT_WORKBOOK_SHEET_NAME);
    expect(artifact.range).toBe(EXPORT_WORKBOOK_RANGE);
    expect(parsed.sheetName).toBe("Sheet1");
    expect(parsed.dimension).toBe("A1:BD2");
    expect(parsed.rows[0]).toHaveLength(EXPORT_WORKBOOK_COLUMN_COUNT);
    expect(exportContractHeaders()).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);
    expect(parsed.rows[0]).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);
    expect(parsed.rows[0]?.at(0)).toBe("Location");
    expect(parsed.rows[0]?.at(-1)).toBe("Nationality At Birth");
    expect(parsed.rows).toHaveLength(2);
    const workbookFiles = await workbookFilesFromBlob(artifact.blob);
    const worksheetXml = workbookFiles["xl/worksheets/sheet1.xml"] ?? "";
    const workbookXml = workbookFiles["xl/workbook.xml"] ?? "";
    expect(worksheetXml).toContain('<dimension ref="A1:BD2"/>');
    expect(worksheetXml).toContain('<autoFilter ref="A1:BD2"/>');
    expect(workbookXml).toContain("Sheet1!$A$1:$BD$2");
    expect(worksheetXml.match(/<row\b/g)).toHaveLength(2);
    expect(worksheetXml).not.toMatch(/\br="BE\d+"/);
    expect(worksheetXml).not.toContain("1048572");
    expect(await verifyExportWorkbookArtifact(artifact)).toBe(true);
  });

  test("writes Passport No into column G and keeps external BLS headers free of Agent or Family debug columns", () => {
    const passportNumber = "669308614";
    const plan = exportSummary([
      withQuestionnaireFieldValues(readySubmission(), {
        "passport-no": passportNumber,
      }),
    ]);
    const passportColumn = exportContractHeaders().indexOf("Passport No");

    expect(passportColumn).toBe(6);
    expect(plan.preview.rows[0]?.[passportColumn]).toBe(passportNumber);
    expect(exportContractHeaders()).not.toEqual(
      expect.arrayContaining(["Agent", "Family", "Debug"]),
    );
  });

  test("maps Russian surname-first applicant names into BLS surname and first name columns", () => {
    const [row] = buildExportContractRows([
      withFirstApplicantNameOnly(readySubmission(), "Сергеева Анна"),
    ]);

    expect(row?.surnameFamilyName).toBe("Сергеева");
    expect(row?.firstName).toBe("Анна");
    expect(row?.lastName).toBe("Сергеева");
  });

  test("normalizes Russian questionnaire choices and hotel location into the BLS row", () => {
    const [row] = buildExportContractRows([
      withQuestionnaireFieldValues(readySubmission(), {
        "cost-covered-by": "Сам заявитель",
        gender: "Мужской",
        "hotel-city": "Madrid",
        "hotel-country": "Spain",
        "hotel-postal-code": "28001",
        "marital-status": "Женат/замужем",
        "means-of-support": "Наличные",
        "contact-number": "+7 900 111-22-33",
      }),
    ]);

    expect(row).toMatchObject({
      costCoveredBy: "Applicant",
      gender: "Male",
      invitingCompanyCity: "Madrid",
      invitingCompanyCountry: "Spain",
      invitingCompanyZipCode: "28001",
      maritalStatus: "Married",
      meansOfSupport: "Cash",
      applicantMobile: "9001112233",
      addressContactNo: "79001112233",
    });
  });

  test("preserves canonical identity and simplified production fields in the parsed workbook", async () => {
    const submission = withQuestionnaireFieldValues(readySubmission(), {
      "arrival-date": "04.09.2026",
      "birth-citizenship": "USSR",
      "birth-country": "Russian Federation",
      "birth-date": "17.06.1993",
      "birth-place": "TULA",
      category: "Normal",
      "company-contact-person": "MARIA LOPEZ",
      "company-phone": "+34 900 000 777",
      "contact-number": "+7 900 111-22-33",
      "cost-covered-by": "Сам заявитель",
      "departure-date": "14.09.2026",
      email: "olga@example.com",
      "employer-address": "10 WORK ROAD",
      "employer-contact": "+7 900 222-33-44",
      "employer-name": "EXAMPLE LLC",
      "entry-count": "Двукратная",
      "first-name": "OLGA",
      gender: "Женский",
      "home-address": "1 HOME STREET",
      "home-city": "MOSCOW",
      "home-country": "Russian Federation",
      "hotel-address": "1 HOTEL ROAD",
      "hotel-city": "MADRID",
      "hotel-contact": "+34 900 000 111",
      "hotel-country": "Spain",
      "hotel-email": "hotel@example.com",
      "hotel-name": "HOST COMPANY",
      "hotel-postal-code": "28001",
      "inviting-party-type": "Приглашающая компания/организация",
      "marital-status": "Холост/не замужем",
      "means-of-support": "Наличные",
      nationality: "Russian Federation",
      occupation: "PRODUCT MANAGER",
      "passport-no": "AB 12-34 567",
      "passport-expiry-date": "20.02.2034",
      "passport-issue-country": "Russian Federation",
      "passport-issue-date": "20.02.2024",
      "passport-issue-place": "MVD 77001",
      "passport-type": "Ordinary Passport",
      "postal-code": "119991",
      "previous-surname": "SMITH",
      purpose: "OTHER",
      "stay-duration": "11",
      "stay-purpose-details": "CONFERENCE",
      surname: "MOROZOVA",
    });
    const rows = buildExportContractRows([submission]);
    const identity = buildExportPackageIdentity([submission]);
    if (!identity) throw new Error("expected package identity");

    const parsed = await parseExportWorkbookArtifact(
      createExportWorkbookArtifact(rows, identity),
    );
    const headers = parsed.rows[0] ?? [];
    const row = parsed.rows[1] ?? [];
    const valueFor = (header: string) => row[headers.indexOf(header)] ?? "";

    const expectedByHeader: Record<string, string> = {
      Location: "MOW",
      "Visa Type": "C",
      "Visa Sub Type": "CONFERENCE",
      "Appointment Category(Normal)": "NORMAL",
      "Applicant Email": "olga@example.com",
      "Applicant Mobile(10 Digit, No space or -,leading zero)": "9001112233",
      "Passport No": "AB1234567",
      "Surname (Family Name)": "MOROZOVA",
      "Surname At Birth": "SMITH",
      FirstName: "OLGA",
      LastName: "MOROZOVA",
      "Date of Birth(YYYY-MM-DD)": "1993-06-17",
      "Place Of Birth": "TULA",
      "Country Of Birth": "Russian Federation",
      "Current Nationality": "Russian Federation",
      "Gender(Male/Female)": "Female",
      "Marital Status(Single/Married)": "Single",
      "TravelDate(YYYY-MM-DD)": "2026-09-04",
      "Passport Type(Ordinary Passport)": "Ordinary Passport",
      "Passport Issue Date(YYYY-MM-DD)": "2024-02-20",
      "Passport Expiry Date(YYYY-MM-DD)": "2034-02-20",
      "Passport Issue Place": "MVD 77001",
      "Passport Issue Country": "Russian Federation",
      "Address Line 1": "1 HOME STREET",
      "Address City": "MOSCOW",
      "Address Postal Code": "119991",
      "Address Contact No": "79001112233",
      "Address Country": "Russian Federation",
      "Employer Name": "EXAMPLE LLC",
      "Employer Contact No": "79002223344",
      "Employer Address": "10 WORK ROAD",
      "Employer Occupation": "PRODUCT MANAGER",
      "Purpose of journey": "OTHER",
      "Stay Duration in Days": "11",
      "Number of Entries Requested(Single Entry/Two Entry/Multiple Entry)": "TWO",
      "Intended Date Of Arrival": "2026-09-04",
      "Intended Date Of Departure": "2026-09-14",
      "Inviting Company Name": "HOST COMPANY",
      "Inviting Company Country": "Spain",
      "Inviting Company City": "MADRID",
      "Inviting Company Zip Code": "28001",
      "Inviting Company Email": "hotel@example.com",
      "Inviting Company Address": "1 HOTEL ROAD",
      "Inviting Company Contact No": "34900000777",
      "Contact Person First Name": "MARIA",
      "Contact Person Last Name": "LOPEZ",
      "Contact Person Country": "Spain",
      "Contact Person City": "MADRID",
      "Contact Person Zip Code": "28001",
      "Contact Person address": "1 HOTEL ROAD",
      "Contact Person Email": "hotel@example.com",
      "Contact Person Mobile": "34900000777",
      "Cost Covered By(Sponsor/Applicant)": "Applicant",
      "Means Of Support(Accommodation Provided/All expenses covered/Cash/CreditCard)":
        "Cash",
      "Appointment Type(For Family, applicant email and contact number should be same for all family members)":
        "Individual",
      "Nationality At Birth": "USSR",
    };

    expect(Object.keys(expectedByHeader)).toEqual(headers);
    for (const [header, expected] of Object.entries(expectedByHeader)) {
      expect(valueFor(header), header).toBe(expected);
    }
  });

  test("does not leak hidden stale company contact fields into hotel rows", () => {
    const [row] = buildExportContractRows([
      withQuestionnaireFieldValues(readySubmission(), {
        "company-contact-person": "STALE COMPANY CONTACT",
        "company-phone": "+34 900 000 999",
        "hotel-contact": "+34 900 000 111",
        "hotel-name": "HOTEL MADRID",
        "inviting-party-type": "Гостиница/временное жилье",
        purpose: "TOURISM",
      }),
    ]);

    expect(row?.contactPersonFirstName).toBe("HOTEL MADRID");
    expect(row?.contactPersonMobile).toBe("34900000111");
    expect(row?.invitingCompanyContactNo).toBe("34900000111");
  });

  test("splits a private host name into the Excel contact person columns", () => {
    const [row] = buildExportContractRows([
      withQuestionnaireFieldValues(readySubmission(), {
        "hotel-name": "JUAN PEREZ",
        "inviting-party-type": "Приглашающее лицо",
        purpose: "TOURISM",
      }),
    ]);

    expect(row?.contactPersonFirstName).toBe("JUAN");
    expect(row?.contactPersonLastName).toBe("PEREZ");
  });

  test("fails closed when questionnaire means cannot be represented by the Excel contract", () => {
    const applicantMeans = exportSummary([
      withQuestionnaireFieldValues(readySubmission(), {
        "cost-covered-by": "Сам заявитель",
        "means-of-support": "Дорожные чеки",
      }),
    ]);
    expect(applicantMeans.ready).toBe(false);
    expect(applicantMeans.canGenerate).toBe(false);
    expect(applicantMeans.blockers.map((blocker) => blocker.reason)).toContain(
      "В строках выгрузки есть способ оплаты, который не поддерживается Excel-контрактом",
    );
  });

  test("fails closed for duplicate passports and repeated applicant identity profiles", () => {
    const primary = readySubmission();
    const duplicatePassport = withSubmissionIdentity(
      primary,
      "ПД-DUPLICATE-PASSPORT",
      "Duplicate passport",
    );
    const repeatedIdentity = withQuestionnaireFieldValues(
      withSubmissionIdentity(primary, "ПД-DUPLICATE-IDENTITY", "Duplicate identity"),
      { "passport-no": "AB9876543" },
    );

    const passportPlan = exportSummary([primary, duplicatePassport]);
    const identityPlan = exportSummary([primary, repeatedIdentity]);

    expect(passportPlan.ready).toBe(false);
    expect(passportPlan.blockers.map((blocker) => blocker.reason)).toContain(
      "В строках выгрузки повторяется номер паспорта у разных заявителей",
    );
    expect(identityPlan.ready).toBe(false);
    expect(identityPlan.blockers.map((blocker) => blocker.reason)).toContain(
      "В строках выгрузки повторяются ФИО и дата рождения у разных заявителей",
    );
  });

  test("fails closed when family contacts differ or applicant mobile is not 10 digits", () => {
    const familyWithDifferentEmail = withApplicantQuestionnaireFieldValues(
      byId("SUB-1102"),
      1,
      { email: "another-family-member@example.com" },
    );
    const familyWithDifferentPhone = withApplicantQuestionnaireFieldValues(
      byId("SUB-1102"),
      2,
      { "contact-number": "+7 900 555-01-02" },
    );
    const invalidMobile = withQuestionnaireFieldValues(readySubmission(), {
      "contact-number": "+34 600 123 456",
    });

    for (const family of [familyWithDifferentEmail, familyWithDifferentPhone]) {
      const plan = exportSummary([family]);
      expect(plan.ready).toBe(false);
      expect(plan.blockers.map((blocker) => blocker.reason)).toContain(
        "В семейной подаче email и телефон должны совпадать у всех заявителей",
      );
    }

    const mobilePlan = exportSummary([invalidMobile]);
    expect(mobilePlan.ready).toBe(false);
    expect(mobilePlan.blockers.map((blocker) => blocker.reason)).toContain(
      "В строках выгрузки есть телефон заявителя не в формате 10 цифр",
    );
  });

  test("revalidates conditional questionnaire requirements before export", () => {
    const plan = exportSummary([
      withQuestionnaireFieldValues(readySubmission(), {
        "company-phone": "",
        "inviting-party-type": "Приглашающая компания/организация",
        purpose: "BUSINESS",
      }),
    ]);

    expect(plan.ready).toBe(false);
    expect(plan.canGenerate).toBe(false);
    expect(plan.blockers.map((blocker) => blocker.reason)).toContain(
      "В выборке есть анкеты, которые не прошли актуальную BLS-проверку",
    );
  });

  test("does not pre-fill questionnaire name fields from applicant display names", () => {
    const sections = createQuestionnaireSections(
      "applicant-test",
      "Сергеева Анна",
      "complete",
    );
    const fields = new Map(
      sections.flatMap((section) =>
        section.fields.map((field) => [field.id, field.value]),
      ),
    );

    expect(fields.get("first-name")).toBe("");
    expect(fields.get("surname")).toBe("");
    expect(fields.get("previous-surname")).toBe("");
  });

  test("ignores blank BLS template rows without Passport No and applicant name", () => {
    expect(
      isRealBlsApplicantRow({
        location: "SPB",
        visaType: "Schengen",
      }),
    ).toBe(false);
    expect(isRealBlsApplicantRow({ passportNo: "669308614" })).toBe(true);
    expect(
      isRealBlsApplicantRow([
        "SPB",
        "Schengen",
        "Tourism",
        "Normal",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
    ).toBe(false);
  });

  test("normalizes Excel serial dates consistently for workbook date matching", () => {
    expect(normalizeExportContractDateInput(25569)).toBe("1970-01-01");
    expect(normalizeExportContractDateInput("25569")).toBe("1970-01-01");
    expect(normalizeExportContractDateInput("04.09.2026")).toBe("2026-09-04");
  });

  test("stores internal export mapping with row number, passport, owner and family metadata", () => {
    const family = withApplicantPassports(byId("SUB-1102"), [
      "111111111",
      "222222222",
      "333333333",
    ]);
    const single = withApplicantPassports(readySubmission(), ["669308614"]);
    const mappings = buildExportInternalMappings([single, family], "pkg-city-moscow");

    expect(mappings.map((mapping) => mapping.submissionId)).toEqual([
      "SUB-1102",
      "SUB-1102",
      "SUB-1102",
      "ПД-1056",
    ]);
    expect(mappings[0]).toMatchObject({
      applicantId: "з-1102-1",
      city: "Москва",
      excelRowNumber: 2,
      exportPackageId: "pkg-city-moscow",
      familyGroupId: "SUB-1102",
      familySubmissionId: "SUB-1102",
      ownerAgentId: family.agentId,
      passportNumber: "111111111",
      submissionId: "SUB-1102",
    });
    expect(mappings[3]).toMatchObject({
      applicantId: "з-1056-1",
      excelRowNumber: 5,
      familyGroupId: undefined,
      ownerAgentName: single.agentId,
      passportLast3: "614",
    });
  });

  test("derives stay duration from arrival and departure dates when field is blank", () => {
    const selection = [
      withoutQuestionnaireField(
        withQuestionnaireFieldValues(byId("ПД-1056"), {
          "arrival-date": "04.09.2026",
          "departure-date": "14.09.2026",
        }),
        "stay-duration",
      ),
    ];
    const plan = exportSummary(selection);
    const durationIndex = exportContractHeaders().indexOf("Stay Duration in Days");
    const arrivalIndex = exportContractHeaders().indexOf("Intended Date Of Arrival");
    const departureIndex = exportContractHeaders().indexOf(
      "Intended Date Of Departure",
    );

    expect(plan.preview.rows[0]?.[arrivalIndex]).toBe("2026-09-04");
    expect(plan.preview.rows[0]?.[departureIndex]).toBe("2026-09-14");
    expect(plan.preview.rows[0]?.[durationIndex]).toBe("10");
  });

  test("rejects parsed workbook proof when row count or header shape drifts", async () => {
    const selection = applyExportStateToSelection(
      [readySubmission()],
      ["ПД-1056"],
      "file_generated",
    );
    const plan = exportSummary(selection);
    if (!plan.downloadPackageIdentity) throw new Error("expected package identity");

    const artifact = createExportWorkbookArtifact(
      plan.rows,
      plan.downloadPackageIdentity,
    );

    await expect(
      verifyExportWorkbookArtifact({
        ...artifact,
        rows: artifact.rows.slice(0, 1),
      }),
    ).resolves.toBe(false);
    await expect(
      verifyExportWorkbookArtifact({
        ...artifact,
        rows: [artifact.rows[0]?.slice(0, -1) ?? [], ...artifact.rows.slice(1)],
      }),
    ).resolves.toBe(false);
  });

  test("uses the same canonical row model for preview and workbook serialization", async () => {
    const selection = applyExportStateToSelection(
      [readySubmission()],
      ["ПД-1056"],
      "file_generated",
    );
    const plan = exportSummary(selection);
    if (!plan.downloadPackageIdentity) throw new Error("expected package identity");

    const artifact = createExportWorkbookArtifact(
      plan.rows,
      plan.downloadPackageIdentity,
    );
    const parsed = await parseExportWorkbookArtifact(artifact);
    const workbookDataRows = parsed.rows.slice(1);

    expect(plan.preview.headers).toEqual(parsed.rows[0]);
    expect(plan.preview.rows).toEqual(workbookDataRows);
    expect(buildExportWorkbookRows(plan.rows)).toEqual(parsed.rows);
    expect(plan.preview.rows[0]?.[0]).toBe("MOW");
    expect(plan.preview.rows[0]).not.toEqual(
      expect.arrayContaining(["Schengen", "Tourism", "Normal"]),
    );
  });

  test("writes family row fills into the parsed workbook artifact", async () => {
    const baseRow = exportSummary([readySubmission()]).rows[0];
    if (!baseRow) throw new Error("expected base export row");
    const rows = [
      {
        ...baseRow,
        applicantIndex: 1,
        appointmentType: "Family",
        submissionId: "family-1",
        type: "Семья",
      },
      {
        ...baseRow,
        applicantIndex: 2,
        appointmentType: "Family",
        submissionId: "family-1",
        type: "Семья",
      },
      {
        ...baseRow,
        applicantIndex: 1,
        appointmentType: "Family",
        submissionId: "family-2",
        type: "Семья",
      },
      {
        ...baseRow,
        applicantIndex: 1,
        appointmentType: "Individual",
        submissionId: "single-1",
        type: "Один заявитель",
      },
    ];
    const identity: ExportPackageIdentity = {
      contentFingerprint: "style-proof",
      fileName: "style-proof.xlsx",
      format: "xlsx",
      idempotencyKey: "style-proof",
      rowCount: rows.length,
      submissionIds: ["family-1", "family-2", "single-1"],
    };

    const artifact = createExportWorkbookArtifact(rows, identity);
    const parsed = await parseExportWorkbookArtifact(artifact);

    expect(buildExportWorkbookRowFills(rows)).toEqual([
      null,
      "family-1",
      "family-1",
      "family-2",
      null,
    ]);
    expect(artifact.rowFills).toEqual([
      null,
      "family-1",
      "family-1",
      "family-2",
      null,
    ]);
    expect(parsed.rowFills).toEqual(artifact.rowFills);
    expect(await verifyExportWorkbookArtifact(artifact)).toBe(true);
  });

  test("keeps the fourth family visually distinct", () => {
    const baseRow = exportSummary([readySubmission()]).rows[0];
    if (!baseRow) throw new Error("expected base export row");
    const rows = Array.from({ length: 4 }, (_, index) => ({
      ...baseRow,
      appointmentType: "Family",
      familySubmissionId: `family-${index + 1}`,
      familyGroupId: `family-${index + 1}`,
      submissionId: `family-${index + 1}`,
      type: "Семья",
    }));

    const rowFills = buildExportWorkbookRowFills(rows);

    expect(rowFills).toEqual([
      null,
      "family-1",
      "family-2",
      "family-3",
      "family-4",
    ]);
  });

  test("exports all family blocks before singles, keeps families contiguous, and gives each family a distinct fill", async () => {
    const familyOne = withApplicantPassports(byId("SUB-1102"), [
      "111111111",
      "222222222",
      "333333333",
    ]);
    const familyTwo = withApplicantPassports(
      withSubmissionIdentity(byId("SUB-1102"), "SUB-FAMILY-2", "Семья Ивановых"),
      ["444444444", "555555555", "666666666"],
    );
    const single = withApplicantPassports(readySubmission(), ["669308614"]);
    const rows = buildExportRows([single, familyTwo, familyOne]);
    const identity: ExportPackageIdentity = {
      contentFingerprint: "family-order-proof",
      fileName: "family-order-proof.xlsx",
      format: "xlsx",
      idempotencyKey: "family-order-proof",
      rowCount: rows.length,
      submissionIds: [single.id, familyTwo.id, familyOne.id],
    };
    const artifact = createExportWorkbookArtifact(rows, identity);
    const parsed = await parseExportWorkbookArtifact(artifact);
    const workbookFiles = await workbookFilesFromBlob(artifact.blob);
    const worksheetXml = workbookFiles["xl/worksheets/sheet1.xml"] ?? "";
    const stylesXml = workbookFiles["xl/styles.xml"] ?? "";

    expect(rows.map((row) => row.submissionId)).toEqual([
      "SUB-1102",
      "SUB-1102",
      "SUB-1102",
      "SUB-FAMILY-2",
      "SUB-FAMILY-2",
      "SUB-FAMILY-2",
      "ПД-1056",
    ]);
    expect(new Set(artifact.rowFills.slice(1, 4)).size).toBe(1);
    expect(new Set(artifact.rowFills.slice(4, 7)).size).toBe(1);
    expect(artifact.rowFills[1]).toBeTruthy();
    expect(artifact.rowFills[4]).toBeTruthy();
    expect(artifact.rowFills[1]).not.toBe(artifact.rowFills[4]);
    expect(artifact.rowFills[7]).toBeNull();
    expect(parsed.rowFills).toEqual(artifact.rowFills);
    expect(parsed.rows[0]).toEqual(EXPECTED_EXPORT_CONTRACT_HEADERS);
    expect(parsed.rows[0]).not.toEqual(
      expect.arrayContaining(["Agent", "Family", "Debug"]),
    );
    expect(stylesXml).toContain('<fills count="11">');
    expect(stylesXml).toContain('<fonts count="8"');
    expect(stylesXml).toContain('<borders count="9">');
    expect(stylesXml).toContain('<dxfs count="3">');
    expect(stylesXml).toContain('<fgColor rgb="C6E0B4"/>');
    expect(stylesXml).toContain('<fgColor rgb="FFF2CC"/>');
    expect(stylesXml).toContain('<fgColor rgb="BDD7EE"/>');
    expect(stylesXml).toContain('<fgColor rgb="F4CCCC"/>');
    expect(stylesXml).toContain('<cellXfs count="84">');
    expect(stylesXml).toMatch(/<xf\b[^>]*fillId="3"[^>]*applyFill="1"[^>]*>/);
    expect(stylesXml).toMatch(/<xf\b[^>]*fillId="4"[^>]*applyFill="1"[^>]*>/);
    expect(worksheetXml.match(/<conditionalFormatting\b/g)).toHaveLength(3);
    expect(worksheetXml).toContain('<c r="A2" s="52"');
    expect(worksheetXml).toContain('<c r="E2" s="53"');
    expect(worksheetXml).toContain('<c r="L2" s="54"');
    expect(worksheetXml).toContain('<c r="BC2" s="55"');
    expect(worksheetXml).toContain('<c r="A5" s="56"');
    expect(worksheetXml).toContain('<c r="A8" s="33"');
  });

  test("keeps row order and package identity deterministic for the same selected set", () => {
    const family = withApplicantPassports(byId("SUB-1102"), [
      "111111111",
      "222222222",
      "333333333",
    ]);
    const single = withApplicantPassports(readySubmission(), ["669308614"]);
    const firstOrder = [single, family];
    const secondOrder = [family, single];

    expect(buildExportRows(firstOrder).map((row) => row.submissionId)).toEqual(
      buildExportRows(secondOrder).map((row) => row.submissionId),
    );
    expect(buildExportWorkbookRows(buildExportRows(firstOrder))).toEqual(
      buildExportWorkbookRows(buildExportRows(secondOrder)),
    );
    expect(buildExportPackageIdentity(firstOrder)).toEqual(
      buildExportPackageIdentity(secondOrder),
    );
  });

  test("ties package identity to the full 56-column serialized row model", () => {
    const selection = applyExportStateToSelection(
      [readySubmission()],
      ["ПД-1056"],
      "file_generated",
    );
    const plan = exportSummary(selection);
    const staleRows = plan.rows.map((row) => ({
      ...row,
      passportNo: `${row.passportNo}9`,
    }));

    expect(
      exportRowsMatchPackageIdentity(plan.rows, plan.downloadPackageIdentity),
    ).toBe(true);
    expect(
      exportRowsMatchPackageIdentity(staleRows, plan.downloadPackageIdentity),
    ).toBe(false);
  });

  test("fails closed for blocked export states and open admin blockers", () => {
    const blockedByState = exportSummary([byId("ПД-1053")]);
    const blockedByIssue = exportSummary([
      {
        ...byId("ПД-1056"),
        ...readySubmission(),
        issues: [
          {
            ...byId("ПД-1048").issues[0]!,
            status: "fixed_by_agent",
          },
        ],
      },
    ]);

    expect(blockedByState).toMatchObject({
      canDownload: false,
      canGenerate: false,
      canMarkExported: false,
      ready: false,
    });
    expect(
      blockedByState.blockers.map((blocker) => blocker.reason).join(" "),
    ).toContain("не готовые к выгрузке");
    expect(blockedByIssue.ready).toBe(false);
    expect(
      blockedByIssue.blockers.map((blocker) => blocker.reason).join(" "),
    ).toContain("блокирующие замечания");
  });

  test("allows same-city mixed-agent export with warning and no external Agent column", () => {
    const primary = readySubmission();
    const alternateApplicantId = "з-mixed-agent-1";
    const alternate = withQuestionnaireFieldValues(
      {
        ...primary,
        agentId: "local-agent-partner",
        applicants: primary.applicants.map((applicant) => ({
          ...applicant,
          fullName: "OLGA MOROZOVA",
          id: alternateApplicantId,
        })),
        files: primary.files.map((file) => ({
          ...file,
          applicantId: alternateApplicantId,
          id: `mixed-agent-${file.id}`,
        })),
        id: "ПД-MIXED-AGENT",
        title: "Ольга Морозова",
      },
      {
        "birth-date": "1993-06-17",
        "first-name": "OLGA",
        "passport-no": "675450001",
        surname: "MOROZOVA",
      },
    );
    const plan = exportSummary([primary, alternate]);

    expect(plan.ready, JSON.stringify(plan.blockers)).toBe(true);
    expect(plan.canGenerate).toBe(true);
    expect(plan.blockers.map((blocker) => blocker.reason)).not.toContain(
      "Нельзя смешивать подачи разных агентов",
    );
    expect(plan.warnings.map((warning) => warning.reason).join(" ")).toContain(
      "разных агентов",
    );
    expect(plan.preview.headers.some((header) => /agent/i.test(header))).toBe(false);
    expect(
      buildExportWorkbookRows(plan.rows)[0]?.some((header) => /agent/i.test(header)),
    ).toBe(false);
  });

  test("blocks mixed-city export even when rows are individually ready", () => {
    const primary = byId("SUB-1101");
    const differentCity: Submission = {
      ...primary,
      city: "Санкт-Петербург",
      id: "ПД-MIXED-CITY",
      title: "Городской конфликт",
      tripDateFrom: primary.tripDateFrom,
      tripDateTo: primary.tripDateTo,
    };
    const plan = exportSummary([primary, differentCity]);

    expect(plan.ready).toBe(false);
    expect(plan.blockers.map((blocker) => blocker.reason)).toContain(
      "Нельзя смешивать разные города",
    );
  });

  test("search by passport number finds applicant from family and single submissions", () => {
    const family = withApplicantPassports(byId("SUB-1102"), [
      "111111111",
      "222222222",
      "333333333",
    ]);
    const single = withApplicantPassports(readySubmission(), ["669308614"]);

    expect(
      searchSubmissions([family, single], "222222222", "Все города").map(
        (submission) => submission.id,
      ),
    ).toEqual(["SUB-1102"]);
    expect(
      searchSubmissions([family, single], "669308614", "Все города").map(
        (submission) => submission.id,
      ),
    ).toEqual(["ПД-1056"]);
  });

  test("city search and filter options include submission city and appointment city", () => {
    const submission: Submission = {
      ...withQuestionnaireFieldValues(readySubmission(), {
        "appointment-city": "Казань",
      }),
      city: "Санкт-Петербург",
    };

    expect(searchSubmissions([submission], "", "Санкт-Петербург")).toEqual([
      submission,
    ]);
    expect(searchSubmissions([submission], "", "Казань")).toEqual([submission]);
    expect(searchSubmissions([submission], "", "Москва")).toEqual([]);
    expect(cityFilterValuesForSubmissions([submission])).toEqual([
      "Все города",
      ...[...BLS_CITY_OPTIONS].sort((left, right) => left.localeCompare(right, "ru")),
    ]);
  });

  test("filename builder sanitizes and prefixes passport numbers for active applicant documents", () => {
    const submission = withQuestionnaireFieldValues(readySubmission(), {
      "first-name": "ANATOLII",
      "passport-no": "669308614",
      surname: "BOGDANOV",
    });
    const applicant = { ...submission.applicants[0]!, fullName: "ANATOLII BOGDANOV" };

    expect(
      buildApplicantDocumentFileName({
        applicant,
        documentType: "application_form_pdf",
      }),
    ).toBe("669308614_application_form_pdf_bogdanov_anatolii.pdf");
    for (const documentType of [
      "appointment_pdf",
      "selfie",
      "selfie_2",
      "passport_scan",
      "questionnaire",
      "application_form_pdf",
    ] as const) {
      expect(
        buildApplicantDocumentFileName({ applicant, documentType }).startsWith(
          "669308614_",
        ),
      ).toBe(true);
    }
  });

  test("missing passport filenames fail closed instead of creating a fallback name", () => {
    const applicant = withQuestionnaireFieldValues(readySubmission(), {
      "passport-no": "",
    }).applicants[0]!;

    expect(() =>
      buildApplicantDocumentFileName({
        applicant,
        applicantId: applicant.id,
        documentType: "passport_scan",
      }),
    ).toThrow("отсутствует номер паспорта");
  });

  test("keeps generated multi-row package members selectable while blocker rows are hidden", () => {
    const primary = readySubmission();
    const alternateApplicantId = "з-generated-selection-2";
    const secondary = withQuestionnaireFieldValues(
      {
        ...primary,
        applicants: primary.applicants.map((applicant) => ({
          ...applicant,
          fullName: "IVAN PETROV",
          id: alternateApplicantId,
        })),
        files: primary.files.map((file) => ({
          ...file,
          applicantId: alternateApplicantId,
          id: `generated-package-${file.id}`,
        })),
        id: "ПД-GENERATED-2",
        title: "Иван Петров",
      },
      {
        "birth-date": "1987-04-12",
        "first-name": "IVAN",
        "passport-no": "675450002",
        surname: "PETROV",
      },
    );
    const generated = applyExportStateToSelection(
      [primary, secondary],
      [primary.id, secondary.id],
      "file_generated",
    );
    const missingMedia = {
      ...primary,
      files: primary.files.filter((file) => file.type !== "selfie_2"),
    };

    expect(
      generated.every(isSubmissionSelectableForExport),
      JSON.stringify(
        generated.map((submission) => exportSummary([submission]).blockers),
      ),
    ).toBe(true);
    expect(exportSummary([generated[0]!]).ready).toBe(false);
    expect(isSubmissionSelectableForExport(missingMedia)).toBe(false);
  });

  test("does not start browser download when artifact identity is missing or stale", () => {
    const selection = [readySubmission()];
    const plan = exportSummary(selection);
    const createObjectURL = vi.fn();
    const originalUrl = globalThis.URL;

    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: { createObjectURL, revokeObjectURL: vi.fn() },
    });

    try {
      expect(
        downloadExportWorkbook(plan.rows, plan.downloadPackageIdentity),
      ).toMatchObject({
        ok: false,
        reason: "export_not_ready",
      });

      const identity = buildExportPackageIdentity(selection);
      expect(
        downloadExportWorkbook(
          plan.rows.map((row) => ({ ...row, firstName: `${row.firstName} stale` })),
          identity,
        ),
      ).toMatchObject({
        ok: false,
        reason: "row_mismatch",
      });
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "URL", {
        configurable: true,
        value: originalUrl,
      });
    }
  });

  test("keeps spreadsheet formula-like values inert in generated cells", () => {
    const plan = exportSummary([readySubmission()]);
    const row = {
      ...plan.rows[0]!,
      applicantEmail: "=cmd|' /C calc'!A0",
      firstName: "+unsafe",
    };

    expect(buildExportWorkbookRows([row])[1]).toContain("'=cmd|' /C calc'!A0");
    expect(buildExportWorkbookRows([row])[1]).toContain("'+unsafe");
  });
});
