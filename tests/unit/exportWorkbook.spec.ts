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
  createExportWorkbookArtifact,
  default as downloadExportWorkbook,
  parseExportWorkbookArtifact,
  verifyExportWorkbookArtifact,
} from "../../src/modules/submissions/exportWorkbook";
import {
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
import { searchSubmissions } from "../../src/modules/submissions/selectors";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import type {
  ExportPackageIdentity,
  Submission,
} from "../../src/modules/submissions/types";

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
  return canonicalMediaSubmission(byId("ПД-1056"));
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

describe("V-19 export workbook contract", () => {
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
    expect(parsed.dimension).toBe(`A1:BD${artifact.rows.length}`);
    expect(parsed.rows[0]).toHaveLength(EXPORT_WORKBOOK_COLUMN_COUNT);
    expect(exportContractHeaders()).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);
    expect(parsed.rows[0]).toEqual([...EXPECTED_EXPORT_CONTRACT_HEADERS]);
    expect(parsed.rows[0]?.at(0)).toBe("Location");
    expect(parsed.rows[0]?.at(-1)).toBe("Nationality At Birth");
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
      ownerAgentName: "Татьяна Николаева",
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
    expect(plan.preview.rows[0]).toEqual(
      expect.arrayContaining(["Москва", "Schengen", "Tourism", "Normal"]),
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

  test("exports family blocks before singles, keeps each family contiguous, and leaves singles uncolored", async () => {
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

    expect(rows.map((row) => row.submissionId)).toEqual([
      "SUB-FAMILY-2",
      "SUB-FAMILY-2",
      "SUB-FAMILY-2",
      "SUB-1102",
      "SUB-1102",
      "SUB-1102",
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
    const alternate: Submission = {
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
    };
    const plan = exportSummary([primary, alternate]);

    expect(plan.ready).toBe(true);
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

  test("missing passport filenames use fallback that can feed blockers", () => {
    const applicant = withQuestionnaireFieldValues(readySubmission(), {
      "passport-no": "",
    }).applicants[0]!;

    expect(
      buildApplicantDocumentFileName({
        applicant,
        applicantId: applicant.id,
        documentType: "passport_scan",
      }),
    ).toBe(`missing-passport_passport_scan_${applicant.id}.pdf`);
  });

  test("keeps generated multi-row package members selectable while blocker rows are hidden", () => {
    const primary = readySubmission();
    const alternateApplicantId = "з-generated-selection-2";
    const secondary: Submission = {
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
    };
    const generated = applyExportStateToSelection(
      [primary, secondary],
      [primary.id, secondary.id],
      "file_generated",
    );
    const missingMedia = {
      ...primary,
      files: primary.files.filter((file) => file.type !== "selfie_2"),
    };

    expect(generated.every(isSubmissionSelectableForExport)).toBe(true);
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
