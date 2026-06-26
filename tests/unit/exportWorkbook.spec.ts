import { describe, expect, test, vi } from "vitest";
import {
  buildExportPackageIdentity,
  exportRowsMatchPackageIdentity,
  exportSummary,
} from "../../src/modules/submissions/exportRules";
import {
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
} from "../../src/modules/submissions/exportContract";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

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
