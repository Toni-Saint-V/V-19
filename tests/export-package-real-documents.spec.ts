import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

import {
  buildExportPackageIdentity,
  exportSummary,
} from "../src/modules/submissions/exportRules";
import {
  prepareExportMediaZip,
} from "../src/modules/submissions/exportMediaZip";
import { buildLocalDemoExportMediaZipOptions } from "../src/modules/submissions/exportMediaZipLocalDemo";
import { parseExportWorkbookBlob } from "../src/lib/export/exportWorkbookCore";
import { createVisaApplicationFormPdfBlob } from "../src/modules/submissions/visaApplicationFormPdf";
import { normalizeSubmissionQuestionnaire } from "../src/modules/submissions/questionnaire";
import { fillRequiredQuestionnaireForTest } from "./unit/helpers/questionnaireTestFill";
import type {
  Applicant,
  City,
  ExportPackageIdentity,
  Submission,
  SubmissionFile,
} from "../src/modules/submissions/types";

const city: City = "Санкт-Петербург";
const tripFrom = "20.05.2026";
const tripTo = "28.05.2026";
const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(testDir, "../src/assets/export-demo");

test("ZIP contains Excel, every passport scan, and selfies only for the primary applicant", async () => {
  const submission = withGeneratedExportPackage(
    fillRequiredQuestionnaireForTest(
      normalizeSubmissionQuestionnaire(
        makeSubmission({
          applicants: [
            makeApplicant("app-1", "VOLKOV ANTON", "752869613"),
            makeApplicant("app-2", "VOLKOVA IRINA", "752869614"),
          ],
          id: "PD-REAL-1",
          title: "Семья Волковых",
          type: "family",
        }),
      ),
    ),
  );

  const summary = exportSummary([submission]);
  expect(summary.ready, JSON.stringify(summary.blockers)).toBe(true);
  expect(summary.canDownload).toBe(true);
  expect(summary.rowCount).toBe(2);
  expect(summary.rows[0].location).toBe("SPB");
  expect(summary.rows[0].visaType).toBe("C");
  expect(summary.rows[0].visaSubType).toBe("NA");
  expect(summary.rows[0].appointmentCategory).toBe("NORMAL");
  expect(summary.rows[0].appointmentType).toContain("FAMILY");
  expect(summary.rows[0].entriesRequested).toBe("MULTIPLE");

  const localDemoOptions = buildLocalDemoExportMediaZipOptions([submission]);
  const result = await prepareExportMediaZip(
    [submission],
    submission.exportPackage ?? null,
    {
      documentAssets: localDemoOptions.documentAssets,
      downloadDocument: async (asset) => {
        const fixturePath = {
          passport_scan: path.join(fixtureRoot, "passport_scan.jpeg"),
          selfie_1: path.join(fixtureRoot, "selfie_1.jpg"),
          selfie_2: path.join(fixtureRoot, "selfie_2.jpg"),
        }[asset.type];
        if (!fixturePath) return null;
        const bytes = await fs.readFile(fixturePath);
        return new Blob(
          [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
          { type: asset.mime ?? "image/jpeg" },
        );
      },
      exportDate: "2026-05-20T00:00:00.000Z",
    },
  );

  if (!result.ok) throw new Error(result.safeMessage);
  expect(result.ok).toBe(true);

  const zip = await JSZip.loadAsync(await result.artifact.blob.arrayBuffer());
  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  expect(result.artifact.applicantCount).toBe(2);
  expect(result.artifact.fileCount).toBe(4);
  expect(fileNames).toContain(
    "VisaFlow_Export_2026-05-20/Санкт-Петербург/Семья Волковых/752869613_passport_scan.jpg",
  );
  expect(fileNames).toContain(
    "VisaFlow_Export_2026-05-20/Санкт-Петербург/Семья Волковых/752869613_selfie_1.jpg",
  );
  expect(fileNames).toContain(
    "VisaFlow_Export_2026-05-20/Санкт-Петербург/Семья Волковых/752869613_selfie_2.jpg",
  );
  expect(fileNames.some((name) => name.endsWith("_visa_form.pdf"))).toBe(false);
  expect(fileNames).toContain(
    `VisaFlow_Export_2026-05-20/${result.artifact.workbookFileName}`,
  );
  expect(fileNames).toContain("VisaFlow_Export_2026-05-20/manifest.json");

  const workbookBytes = await zip
    .file(`VisaFlow_Export_2026-05-20/${result.artifact.workbookFileName}`)!
    .async("uint8array");
  expect(asciiPrefix(workbookBytes, 2)).toBe("PK");

  const workbookBuffer = workbookBytes.buffer.slice(
    workbookBytes.byteOffset,
    workbookBytes.byteOffset + workbookBytes.byteLength,
  ) as ArrayBuffer;
  const workbook = await parseExportWorkbookBlob(
    new Blob([workbookBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  expect(workbook.sheetName).toBe("Sheet1");
  expect(workbook.rows[0][0]).toBe("Location");
  expect(workbook.rows[1][0]).toBe("SPB");
  expect(workbook.rows[1][1]).toBe("C");
  expect(workbook.rows[1][2]).toBe("NA");
  expect(workbook.rows[1][3]).toBe("NORMAL");
  expect(workbook.rows[1][6]).toBe("752869613");
  expect(workbook.rows[1][54]).toBe("Family");
  expect(workbook.rowFills[1]).toBe("family-1");

  for (const passport of ["752869613", "752869614"]) {
    const passportBytes = await zip
      .file(
        `VisaFlow_Export_2026-05-20/Санкт-Петербург/Семья Волковых/${passport}_passport_scan.jpg`,
      )!
      .async("uint8array");
    expect(isJpeg(passportBytes)).toBe(true);
    expect(passportBytes.length).toBeGreaterThan(200_000);

  }

  for (const type of ["selfie_1", "selfie_2"] as const) {
    const bytes = await zip
      .file(
        `VisaFlow_Export_2026-05-20/Санкт-Петербург/Семья Волковых/752869613_${type}.jpg`,
      )!
      .async("uint8array");
    expect(isJpeg(bytes)).toBe(true);
  }
  expect(fileNames.some((name) => /752869614_selfie_[12]\.jpg$/.test(name))).toBe(false);

  const manifest = JSON.parse(
    await zip.file("VisaFlow_Export_2026-05-20/manifest.json")!.async("string"),
  );
  expect(manifest.requiredDocumentTypes).toEqual([
    "passport_scan",
    "selfie_1",
    "selfie_2",
  ]);
  expect(manifest.fileCount).toBe(4);
  expect(manifest.submissions[0].applicants[0].documentTypes).toEqual([
    "passport_scan",
    "selfie_1",
    "selfie_2",
  ]);
  expect(manifest.submissions[0].applicants[1].documentTypes).toEqual([
    "passport_scan",
  ]);
});

test("generated visa form is a four-page filled PDF, not a text placeholder", async () => {
  const submission = makeSubmission({
    applicants: [makeApplicant("app-3", "PETROV IVAN", "751234567")],
    id: "PD-FORM-1",
    title: "PETROV IVAN",
    type: "single",
  });
  const pdf = createVisaApplicationFormPdfBlob(submission, submission.applicants[0]);
  const text = new TextDecoder().decode(await pdf.arrayBuffer());

  expect(pdf.type).toBe("application/pdf");
  expect(pdf.size).toBeGreaterThan(5_000);
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text).toContain("/Count 4");
  expect(text).toContain("PETROV");
  expect(text).toContain("IVAN");
  expect(text).toContain("751234567");
  expect(text).toContain("/VF");
});

function withGeneratedExportPackage(submission: Submission): Submission {
  const identity = buildExportPackageIdentity([submission]) as ExportPackageIdentity;
  return {
    ...submission,
    exportPackage: identity,
    exportState: "file_generated",
  };
}

function makeSubmission(input: {
  applicants: Applicant[];
  id: string;
  title: string;
  type: "family" | "single";
}): Submission {
  return {
    id: input.id,
    agentId: "local-agent-tony",
    title: input.title,
    listTitle: input.title,
    type: input.type,
    country: "Испания",
    countryCode: "ES",
    city,
    tripDateFrom: tripFrom,
    tripDateTo: tripTo,
    status: "ready_for_export",
    applicants: input.applicants,
    issues: [],
    files: input.applicants.flatMap((applicant) =>
      [
        makeFile(applicant, "passport_scan"),
        makeFile(applicant, "selfie"),
        makeFile(applicant, "selfie_2"),
      ],
    ),
    completeness: { questionnaire: 100, files: 100, total: 100 },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    history: [],
  };
}

function makeApplicant(id: string, fullName: string, passportNo: string): Applicant {
  const [surname, firstName] = fullName.split(" ");
  return {
    id,
    fullName,
    role: id.endsWith("1") ? "main" : "spouse",
    questionnaireStatus: "complete",
    fileStatus: "complete",
    passportExtraction: {
      appliedFieldKeys: [
        "passportNumber",
        "passportType",
        "passportIssuedAt",
        "passportExpiresAt",
      ],
      attemptCount: 1,
      extractedFields: [
        verifiedPassportField("passportNumber", passportNo),
        verifiedPassportField("passportType", "Ordinary Passport"),
        verifiedPassportField("passportIssuedAt", "2016-02-26"),
        verifiedPassportField("passportExpiresAt", "2032-02-26"),
      ],
      status: "ready",
      verifiedAtIso: "2026-05-12T00:00:00.000Z",
    },
    sections: [
      section(id, "appointment", [
        field("appointment-city", city),
        field("visa-type", "Шенгенская"),
        field("category", "Normal"),
        field("desired-date-1", "2026-05-20"),
      ]),
      section(id, "personal", [
        field("surname", surname),
        field("surname-at-birth", surname),
        field("first-name", firstName),
        field("birth-date", "1990-08-20"),
        field("birth-place", "LENINGRAD"),
        field("birth-country", "USSR"),
        field("nationality", "Russian Federation"),
        field("gender", "Male"),
        field("marital-status", "Single"),
      ]),
      section(id, "passport", [
        field("passport-type", "Ordinary Passport"),
        field("passport-no", passportNo),
        field("passport-issue-date", "2016-02-26"),
        field("passport-expiry-date", "2032-02-26"),
        field("passport-issue-place", "MVD 78039"),
        field("passport-issue-country", "Russian Federation"),
      ]),
      section(id, "contacts", [
        field("home-address", "KOMENDANTSKII AVENUE 60 1 1 879"),
        field("home-city", "ST PETERSBURG"),
        field("home-country", "Russian Federation"),
        field("postal-code", "197376"),
        field("email", "olga.gubko@gmail.com"),
        field("contact-number", "79213434543"),
      ]),
      section(id, "employment", [
        field("occupation", "NO OCCUPATION"),
        field("employer-name", "NO OCCUPATION"),
        field("employer-contact", ""),
        field("employer-address", "NO OCCUPATION"),
      ]),
      section(id, "trip", [
        field("visa-type", "Schengen"),
        field("visa-sub-type", "Tourism"),
        field("category", "Normal"),
        field("purpose", "Tourism"),
        field("main-destination", "Spain"),
        field("first-entry-country", "Spain"),
        field("entry-count", "Multiple Entry"),
        field("arrival-date", "2026-05-20"),
        field("departure-date", "2026-05-28"),
        field("travel-date", "2026-05-20"),
        field("stay-duration", "9"),
        field("previous-biometrics", "Нет"),
      ]),
      section(id, "hotel", [
        field("inviting-party-type", "Гостиница/временное жилье"),
        field("hotel-name", "HOTEL"),
        field("hotel-country", "Spain"),
        field("hotel-city", "BARCELONA"),
        field("hotel-postal-code", "12345"),
        field("hotel-email", "HOTEL@MAIL.COM"),
        field("hotel-address", "CALLE"),
        field("hotel-contact", "34111223344"),
        field("hotel-contact-last-name", "HOTEL BARCELONA"),
      ]),
      section(id, "payment", [
        field("cost-covered-by", "Applicant"),
        field("means-of-support", "Cash"),
      ]),
    ],
  };
}

function verifiedPassportField(
  key: "passportNumber" | "passportType" | "passportIssuedAt" | "passportExpiresAt",
  value: string,
) {
  return {
    confidence: "high" as const,
    key,
    needsManualReview: false,
    source: "passport_scan" as const,
    value,
    verified: true,
  };
}

function makeFile(applicant: Applicant, type: SubmissionFile["type"]): SubmissionFile {
  const passport = applicant.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "passport-no")?.value;
  const documentName = type === "selfie" ? "selfie_1" : type;
  return {
    id: `${applicant.id}-${type}`,
    applicantId: applicant.id,
    type,
    status: "accepted",
    generatedFileName: `${passport}_${documentName}.jpg`,
    mimeType: "image/jpeg",
    originalFileName: `${passport}_${documentName}.jpg`,
    reviewedAtIso: "2026-05-12T00:00:00.000Z",
    reviewStatus: "accepted",
    sizeBytes: 2048,
    storageAdapter: "local-dev",
    uploadStatus: "uploaded",
    uploadedAtIso: "2026-05-12T00:00:00.000Z",
  };
}

function section(
  applicantId: string,
  id: string,
  fields: Array<ReturnType<typeof field>>,
): Applicant["sections"][number] {
  return { id: `${applicantId}-${id}`, title: id, status: "complete", fields };
}

function field(id: string, value: string): Applicant["sections"][number]["fields"][number] {
  return { id, label: id, value, required: true };
}

function asciiPrefix(bytes: Uint8Array, length: number): string {
  return new TextDecoder().decode(bytes.slice(0, length));
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}
