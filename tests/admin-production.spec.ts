import { expect, test } from "@playwright/test";
import JSZip from "jszip";

import {
  applySubmissionActionResult,
  getPrimaryAction,
  markSubmissionIssueFixedResult,
} from "../src/modules/submissions/status";
import {
  applyExportStateToSelection,
} from "../src/modules/submissions/submissionActions";
import {
  buildExportPackageIdentity,
  buildExportRows,
  exportSummary,
} from "../src/modules/submissions/exportRules";
import {
  buildLocalDemoExportMediaZipOptions,
  prepareExportMediaZip,
} from "../src/modules/submissions/exportMediaZip";
import { completeExportPackage } from "../src/modules/submissions/exportWorkflow";
import type {
  Applicant,
  City,
  Issue,
  Submission,
  SubmissionFile,
  SubmissionStatus,
  SubmissionType,
} from "../src/modules/submissions/types";

type SubmissionSeed = {
  applicantPassports: string[];
  city?: City;
  id: string;
  issue?: Issue;
  status?: SubmissionStatus;
  title: string;
  tripDateFrom?: string;
  tripDateTo?: string;
  type: SubmissionType;
};

const defaultCity: City = "Санкт-Петербург";
const defaultTripFrom = "20.05.2026";
const defaultTripTo = "28.05.2026";

function makeApplicant(index: number, passportNo: string, familyName: string): Applicant {
  const firstName = `Applicant${index}`;
  const surname = familyName.replace(/\s+/g, "") || `Family${index}`;
  return {
    id: `app-${passportNo}`,
    fullName: `${firstName} ${surname}`,
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
        extractedPassportField("passportNumber", passportNo),
        extractedPassportField("passportType", "Ordinary Passport"),
        extractedPassportField("passportIssuedAt", "2024-08-08"),
        extractedPassportField("passportExpiresAt", "2029-08-08"),
      ],
      status: "ready",
      verifiedAtIso: "2026-05-12T00:00:00.000Z",
    },
    sections: [
      {
        id: "personal",
        title: "Personal",
        status: "complete",
        fields: [
          field("surname", surname),
          field("first-name", firstName),
          field("birth-date", "1980-01-01"),
          field("birth-place", "LENINGRAD"),
          field("birth-country", "Russian Federation"),
          field("nationality", "Russian Federation"),
          field("gender", "Male"),
          field("marital-status", "Single"),
        ],
      },
      {
        id: "appointment",
        title: "Appointment",
        status: "complete",
        fields: [
          field("appointment-city", defaultCity),
          field("visa-type", "Schengen"),
          field("visa-sub-type", "Tourism"),
          field("category", "Normal"),
        ],
      },
      {
        id: "passport",
        title: "Passport",
        status: "complete",
        fields: [
          field("passport-type", "Ordinary Passport"),
          field("passport-no", passportNo),
          field("passport-issue-date", "2024-08-08"),
          field("passport-expiry-date", "2029-08-08"),
          field("passport-issue-country", "Russian Federation"),
          field("passport-issue-place", "Russian Federation"),
        ],
      },
      {
        id: "contacts",
        title: "Contacts",
        status: "complete",
        fields: [
          field("home-address", "BELGRADSKAYA STR 26"),
          field("email", `${passportNo}@example.test`),
          field("contact-number", "9119900886"),
          field("home-country", "Russian Federation"),
          field("home-city", "ST PETERSBURG"),
          field("postal-code", "197567"),
        ],
      },
      {
        id: "trip",
        title: "Trip",
        status: "complete",
        fields: [
          field("purpose", "TOURISM"),
          field("main-destination", "Spain"),
          field("first-entry-country", "Spain"),
          field("entry-count", "Multiple Entry"),
          field("arrival-date", defaultTripFrom),
          field("departure-date", defaultTripTo),
          field("travel-date", defaultTripFrom),
          field("stay-duration", "9"),
        ],
      },
      {
        id: "hotel",
        title: "Hotel",
        status: "complete",
        fields: [
          field("hotel-name", "HOTEL"),
          field("hotel-country", "Spain"),
          field("hotel-city", "Madrid"),
          field("hotel-postal-code", "29680"),
          field("hotel-email", "hotel@example.test"),
          field("hotel-address", "CALLE 10"),
          field("hotel-contact", "34521425255"),
          field("hotel-contact-last-name", "HOTEL"),
        ],
      },
      {
        id: "employment",
        title: "Employment",
        status: "complete",
        fields: [
          field("occupation", "RETIRED"),
          field("employer-name", "RETIRED"),
        ],
      },
      {
        id: "payment",
        title: "Payment",
        status: "complete",
        fields: [
          field("cost-covered-by", "Applicant"),
          field("means-of-support", "Cash"),
        ],
      },
    ],
  };
}

function extractedPassportField(key: "passportNumber" | "passportType" | "passportIssuedAt" | "passportExpiresAt", value: string) {
  return {
    confidence: "high" as const,
    key,
    needsManualReview: false,
    source: "passport_scan" as const,
    value,
    verified: true,
  };
}

function field(id: string, value: string) {
  return {
    id,
    label: id,
    value,
    required: true,
  };
}

function makeSubmission(seed: SubmissionSeed): Submission {
  const applicants = seed.applicantPassports.map((passport, index) =>
    makeApplicant(index + 1, passport, seed.title),
  );
  const status = seed.status ?? "ready_for_export";
  const files = applicants.flatMap((applicant) =>
    makeFilesForApplicant(seed.id, applicant.id, applicant.sections[2]?.fields.find((item) => item.id === "passport-no")?.value ?? applicant.id, status),
  );

  return {
    id: seed.id,
    agentId: "agent-prod-test",
    title: seed.title,
    listTitle: seed.type === "family" ? seed.title : undefined,
    type: seed.type,
    country: "Испания",
    city: seed.city ?? defaultCity,
    tripDateFrom: seed.tripDateFrom ?? defaultTripFrom,
    tripDateTo: seed.tripDateTo ?? defaultTripTo,
    status,
    applicants,
    issues: seed.issue ? [seed.issue] : [],
    files,
    completeness: { questionnaire: 100, files: 100, total: 100 },
    exportState: status === "ready_for_export" ? "ready" : "not_ready",
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    history: [],
  };
}

function makeFilesForApplicant(
  submissionId: string,
  applicantId: string,
  passportNo: string,
  status: SubmissionStatus,
): SubmissionFile[] {
  const reviewStatus = status === "ready_for_export" ? "accepted" : "not_reviewed";
  const fileStatus = status === "ready_for_export" ? "accepted" : "pending_review";
  return [
    makeFile(submissionId, applicantId, passportNo, "passport_scan", fileStatus, reviewStatus, "application/pdf", "pdf"),
    makeFile(submissionId, applicantId, passportNo, "selfie", fileStatus, reviewStatus, "image/jpeg", "jpg"),
    makeFile(submissionId, applicantId, passportNo, "selfie_2", fileStatus, reviewStatus, "image/jpeg", "jpg"),
  ];
}

function makeFile(
  submissionId: string,
  applicantId: string,
  passportNo: string,
  type: SubmissionFile["type"],
  status: SubmissionFile["status"],
  reviewStatus: NonNullable<SubmissionFile["reviewStatus"]>,
  mimeType: string,
  extension: string,
): SubmissionFile {
  return {
    id: `${submissionId}-${applicantId}-${type}`,
    applicantId,
    type,
    status,
    generatedFileName: `${passportNo}_${type}.${extension}`,
    originalFileName: `${passportNo}_${type}.${extension}`,
    mimeType,
    reviewStatus,
    sizeBytes: 256,
    uploadStatus: "uploaded",
    uploadedAtIso: "2026-05-12T00:00:00.000Z",
  };
}

function makeFileIssue(submission: Submission): Issue {
  const applicant = submission.applicants[0]!;
  return {
    id: `${submission.id}-issue-selfie`,
    type: "file",
    target: {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      section: "Файлы",
      fileType: "selfie",
    },
    reason: "Селфи 1",
    comment: "Заменить селфи 1 перед принятием.",
    severity: "warning",
    status: "open",
    createdBy: "admin",
    createdAt: "2026-05-12T00:00:00.000Z",
  };
}

test("admin review cycle: return with issue, agent correction, admin acceptance to ready_for_export", () => {
  const reviewBase = makeSubmission({
    applicantPassports: ["669308614"],
    id: "SUB-REVIEW-1",
    status: "submitted_for_review",
    title: "Review Applicant",
    type: "single",
  });
  const withIssue: Submission = { ...reviewBase, issues: [makeFileIssue(reviewBase)] };

  const primary = getPrimaryAction(withIssue, "admin", "review");
  expect(primary.action).toBe("return_with_issues");
  expect(primary.disabled).toBeFalsy();

  const returned = applySubmissionActionResult(withIssue, "return_with_issues", "admin", "admin-prod-test");
  expect(returned.ok).toBe(true);
  if (!returned.ok) throw new Error(returned.error.message);
  expect(returned.data.status).toBe("returned");

  const fixed = markSubmissionIssueFixedResult(returned.data, returned.data.issues[0]!.id, "agent");
  expect(fixed.ok).toBe(true);
  if (!fixed.ok) throw new Error(fixed.error.message);
  expect(fixed.data.issues[0]!.status).toBe("fixed_by_agent");

  const corrections = applySubmissionActionResult(fixed.data, "submit_corrections", "agent", "agent-prod-test");
  if (!corrections.ok) throw new Error(corrections.error.message);
  expect(corrections.ok).toBe(true);
  expect(corrections.data.status).toBe("corrections_received");

  const accepted = applySubmissionActionResult(corrections.data, "close_issues_accept", "admin", "admin-prod-test");
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) throw new Error(accepted.error.message);
  expect(accepted.data.status).toBe("ready_for_export");
  expect(accepted.data.exportState).toBe("ready");
  expect(accepted.data.issues.every((issue) => issue.status === "closed_by_admin")).toBe(true);
  expect(accepted.data.files.every((file) => file.status === "accepted" && file.reviewStatus === "accepted")).toBe(true);
});


test("export rules: same-city mixed trip dates are warnings, mixed cities stay blocking", () => {
  const sameCityDifferentDates: Submission[] = [
    makeSubmission({
      applicantPassports: ["669309001"],
      id: "DATE-A",
      title: "Date A",
      tripDateFrom: "20.05.2026",
      tripDateTo: "28.05.2026",
      type: "single",
    }),
    makeSubmission({
      applicantPassports: ["669309002"],
      id: "DATE-B",
      title: "Date B",
      tripDateFrom: "04.09.2026",
      tripDateTo: "14.09.2026",
      type: "single",
    }),
  ];

  const sameCitySummary = exportSummary(sameCityDifferentDates);
  expect(sameCitySummary.blockers.map((blocker) => blocker.reason)).not.toContain(
    "Нельзя смешивать разные даты поездки",
  );
  expect(sameCitySummary.canGenerate).toBe(true);
  expect(sameCitySummary.warnings.map((warning) => warning.reason)).toContain(
    "В одном городе разные даты поездки. Excel и ZIP доступны, проверьте слот/дату перед BLS выгрузкой.",
  );

  const mixedCities = exportSummary([
    ...sameCityDifferentDates,
    makeSubmission({
      applicantPassports: ["669309003"],
      city: "Москва",
      id: "CITY-C",
      title: "City C",
      type: "single",
    }),
  ]);
  expect(mixedCities.canGenerate).toBe(false);
  expect(mixedCities.blockers.map((blocker) => blocker.reason)).toContain(
    "Нельзя смешивать разные города",
  );
});

test("admin export package: same-city sorting, Excel state, ZIP folders, passport-number file names, visa form PDF, marked exported", async () => {
  const submissions: Submission[] = [
    makeSubmission({
      applicantPassports: ["669308601", "669308602", "669308603"],
      id: "FAM-ALPHA",
      title: "Family Alpha",
      type: "family",
    }),
    makeSubmission({
      applicantPassports: ["669308604", "669308605", "669308606", "669308607"],
      id: "FAM-BETA",
      title: "Family Beta",
      type: "family",
    }),
    makeSubmission({ applicantPassports: ["669308608"], id: "SINGLE-1", title: "Single One", type: "single" }),
    makeSubmission({ applicantPassports: ["669308609"], id: "SINGLE-2", title: "Single Two", type: "single" }),
    makeSubmission({ applicantPassports: ["669308610"], id: "SINGLE-3", title: "Single Three", type: "single" }),
    makeSubmission({ applicantPassports: ["669308611"], id: "SINGLE-4", title: "Single Four", type: "single" }),
  ];
  const ids = submissions.map((submission) => submission.id);

  const rows = buildExportRows(submissions);
  expect(rows).toHaveLength(11);
  expect(rows.slice(0, 3).every((row) => row.familySubmissionId === "FAM-ALPHA")).toBe(true);
  expect(rows.slice(3, 7).every((row) => row.familySubmissionId === "FAM-BETA")).toBe(true);
  expect(rows.slice(7).every((row) => !row.familySubmissionId)).toBe(true);
  expect(exportSummary(submissions).canGenerate).toBe(true);

  const mixedCityBlockers = exportSummary([
    ...submissions,
    makeSubmission({
      applicantPassports: ["669308612"],
      city: "Москва",
      id: "OTHER-CITY",
      title: "Other City",
      type: "single",
    }),
  ]).blockers.map((blocker) => blocker.reason);
  expect(mixedCityBlockers).toContain("Нельзя смешивать разные города");

  const generated = applyExportStateToSelection(submissions, ids, "file_generated");
  expect(generated).not.toBe(submissions);
  const selectedGenerated = generated.filter((submission) => ids.includes(submission.id));
  const generatedSummary = exportSummary(selectedGenerated);
  expect(generatedSummary.exportState).toBe("file_generated");
  expect(generatedSummary.canDownload).toBe(true);

  const identity = buildExportPackageIdentity(selectedGenerated);
  expect(identity).not.toBeNull();
  const zipResult = await prepareExportMediaZip(
    selectedGenerated,
    identity,
    {
      ...buildLocalDemoExportMediaZipOptions(selectedGenerated),
      exportDate: "2026-05-20T09:00:00.000Z",
    },
  );
  if (!zipResult.ok) throw new Error(`${zipResult.reason}: ${zipResult.safeMessage}`);
  expect(zipResult.ok).toBe(true);
  expect(zipResult.artifact.applicantCount).toBe(11);
  expect(zipResult.artifact.fileCount).toBe(44);

  const zip = await JSZip.loadAsync(await zipResult.artifact.blob.arrayBuffer());
  const files = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir);
  expect(files.some((name) => name.endsWith(".xlsx"))).toBe(true);
  expect(files).toContain("VisaFlow_Export_2026-05-20/Санкт-Петербург/Family Alpha/669308601_passport_scan.pdf");
  expect(files).toContain("VisaFlow_Export_2026-05-20/Санкт-Петербург/Family Alpha/669308601_selfie_1.jpg");
  expect(files).toContain("VisaFlow_Export_2026-05-20/Санкт-Петербург/Family Alpha/669308601_selfie_2.jpg");
  expect(files).toContain("VisaFlow_Export_2026-05-20/Санкт-Петербург/Family Alpha/669308601_visa_form.pdf");
  expect(files).toContain("VisaFlow_Export_2026-05-20/Санкт-Петербург/Applicant1 SingleFour/669308611_visa_form.pdf");

  const manifestFile = zip.file("VisaFlow_Export_2026-05-20/manifest.json");
  expect(manifestFile).not.toBeNull();
  const manifest = JSON.parse(await manifestFile!.async("string"));
  expect(manifest.requiredDocumentTypes).toEqual(["passport_scan", "selfie_1", "selfie_2", "visa_form"]);
  expect(manifest.documentEntries).toHaveLength(44);
  expect(manifest.applicantCount).toBe(11);

  const formPdf = await zip.file("VisaFlow_Export_2026-05-20/Санкт-Петербург/Family Alpha/669308601_visa_form.pdf")!.async("uint8array");
  expect(new TextDecoder().decode(formPdf.slice(0, 8))).toBe("%PDF-1.4");

  const downloaded = applyExportStateToSelection(selectedGenerated, ids, "file_downloaded");
  expect(exportSummary(downloaded).canMarkExported).toBe(true);
  const completed = await completeExportPackage(downloaded, {
    createdAt: "2026-05-20T10:00:00.000Z",
    createdBy: "admin-prod-test",
    format: "xlsx",
    commitPackage: async (batch) => ({
      batch,
      changedSubmissions: batch.submissionIds.length,
      duplicate: false,
      statusHistory: batch.submissionIds.length,
    }),
  });
  expect(completed.status).toBe("exported");
  if (completed.status !== "exported") throw new Error(completed.blockers.join("; "));
  expect(completed.submissions.every((submission) => submission.status === "exported" && submission.exportState === "marked_exported")).toBe(true);
});

import {
  adminReviewActionNotice,
  applyAdminReviewFieldAction,
  summarizeAdminReviewFields,
  type AdminReviewField,
} from "../src/modules/submissions/adminInteractiveReview";
import { describeAdminExportActionFeedback } from "../src/modules/submissions/adminExportActions";

test("admin clickable UX contract: OK, remark, tourist actions and export buttons always produce state or visible feedback", () => {
  const fields: AdminReviewField[] = [
    {
      label: "Имя",
      value: "IVAN",
      source: "MRZ line 2",
      confidence: "99%",
      state: "pending",
    },
    {
      label: "Номер паспорта",
      value: "751234567",
      source: "MRZ line 1",
      confidence: "96%",
      state: "warning",
    },
  ];

  const approved = applyAdminReviewFieldAction(fields, "Имя", "approve");
  expect(approved[0]!.state).toBe("approved");
  expect(adminReviewActionNotice("Имя", "approve")).toContain("OK");
  expect(summarizeAdminReviewFields(approved).approved).toBe(1);

  const remarked = applyAdminReviewFieldAction(approved, "Номер паспорта", "remark");
  const summary = summarizeAdminReviewFields(remarked);
  expect(remarked[1]!.state).toBe("remarked");
  expect(summary.remarks).toBe(1);
  expect(summary.canFinish).toBe(false);
  expect(summary.nextAction).toContain("Отправить замечание");
  expect(adminReviewActionNotice("Номер паспорта", "remark")).toContain("Замечание");

  const noSelection = describeAdminExportActionFeedback({
    action: "prepare_excel",
    blockerReasons: [],
    selectedCount: 0,
  });
  expect(noSelection.canRun).toBe(false);
  expect(noSelection.tone).toBe("warning");
  expect(noSelection.message).toContain("Выберите хотя бы один пакет");

  const blockedZip = describeAdminExportActionFeedback({
    action: "download_zip",
    blockerReasons: ["Нет файла: Селфи 2"],
    selectedCount: 1,
  });
  expect(blockedZip.canRun).toBe(false);
  expect(blockedZip.tone).toBe("danger");
  expect(blockedZip.message).toContain("Нельзя скачать ZIP с Excel");
  expect(blockedZip.message).toContain("Нет файла: Селфи 2");

  const readyZip = describeAdminExportActionFeedback({
    action: "download_zip",
    blockerReasons: [],
    prepared: false,
    selectedCount: 1,
  });
  expect(readyZip.canRun).toBe(true);
  expect(readyZip.tone).toBe("success");
  expect(readyZip.nextAction).toBe("Excel → ZIP");
});
