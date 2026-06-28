import { describe, expect, test } from "vitest";
import {
  applyFamilySharedAnswers,
  applyPassportAutofillResult,
  applyReturnedPdfPackageReview,
  buildAgentHandoffPackage,
  buildApplicantArtifactFileNames,
  buildCityExportBatchPlan,
  confirmReturnedPdfMismatchIssue,
  confirmQuestionnaireReviewFields,
  createOperationalDraft,
  resolveIssueFocusTarget,
  submitOperationalForReview,
  type ReturnedPdfArtifact,
} from "../../src/modules/submissions/operationalWorkflow";
import { normalizeSubmissionQuestionnaire } from "../../src/modules/submissions/questionnaire";
import { finishPassportExtraction } from "../../src/modules/submissions/passportExtraction";
import {
  completeQuestionnaire,
  createDraftSubmission,
  uploadRequiredFile,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import { applySubmissionAction } from "../../src/modules/submissions/status";
import {
  buildAppointmentPdfStorageTarget,
  buildVisaApplicationPdfStorageTarget,
} from "../../src/modules/submissions/mediaStoragePolicy";
import {
  confirmVisaApplicationPdfManualReview,
  type VisaApplicationPdfArtifactInput,
} from "../../src/modules/submissions/visaApplicationPdfReconciliation";
import type {
  CommandResult,
  Issue,
  Submission,
  VisaApplicationPdfReviewState,
} from "../../src/modules/submissions/types";

type ApplicantFieldValues = Record<string, string>;

const mainReference = {
  birthCountry: "USSR",
  birthDate: "20.08.1990",
  birthPlace: "LENINGRAD",
  citizenship: "Russian Federation",
  firstName: "ANTON",
  passportExpiresAt: "26.02.2028",
  passportIssueCountry: "Russian Federation",
  passportIssuedAt: "26.02.2016",
  passportNumber: "752869613",
  surname: "VOLKOV",
};

const appointmentPdf: ReturnedPdfArtifact = {
  fileName: "appointment-list.pdf",
  mimeType: "application/pdf",
  sha256: "a".repeat(64),
  sizeBytes: 24_000,
  storageBucket: buildAppointmentPdfStorageTarget({
    sha256: "a".repeat(64),
    submissionId: "exported-main",
  }).bucket,
  storagePath: buildAppointmentPdfStorageTarget({
    sha256: "a".repeat(64),
    submissionId: "exported-main",
  }).path,
};

describe("operational workflow logic spine", () => {
  test("keeps draft creation non-blocking but blocks review submission without a full package", () => {
    const draft = unwrap(
      createOperationalDraft({
        applicantNames: ["ANTON VOLKOV"],
        city: "Москва",
        familyCount: 1,
        submissions: [],
        type: "single",
      }),
    );

    expect(draft.status).toBe("draft");
    expect(draft.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "missing", type: "passport_scan" }),
        expect.objectContaining({ status: "missing", type: "selfie" }),
        expect.objectContaining({ status: "missing", type: "selfie_2" }),
      ]),
    );

    const savedDraft = applySubmissionAction(draft, "save_progress", "agent");

    expect(submitOperationalForReview(savedDraft, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Questionnaire and files must be complete.",
      },
    });
  });

  test("marks passport autofill fields as needs_review and blocks submit until confirmed", () => {
    const inProgress = completeInProgressSubmission();
    const applied = unwrap(
      applyPassportAutofillResult(inProgress, {
        applicantId: inProgress.applicants[0]?.id ?? "",
        fields: [
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: false,
            source: "passport_scan",
            value: mainReference.passportNumber,
          },
        ],
        nowIso: "2026-06-27T08:00:00.000Z",
        status: "ready",
      }),
    );

    expect(field(applied, 0, "passport-no")).toMatchObject({
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
      value: mainReference.passportNumber,
    });
    expect(applied.history[0]).toMatchObject({
      source: "system",
      text: "AI/OCR заполнил паспортные поля для ручной проверки",
    });
    expect(submitOperationalForReview(applied, "agent")).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("confirm"),
      }),
    });

    const confirmed = unwrap(
      confirmQuestionnaireReviewFields(applied, {
        applicantId: applied.applicants[0]?.id ?? "",
        fieldIds: ["passport-no"],
        nowIso: "2026-06-27T08:10:00.000Z",
        source: "passport_ocr",
      }),
    );
    const submitted = unwrap(submitOperationalForReview(confirmed, "agent"));

    expect(confirmed.applicants[0]?.passportExtraction?.verifiedAtIso).toBe(
      "2026-06-27T08:10:00.000Z",
    );
    expect(field(confirmed, 0, "passport-no")).toMatchObject({
      reviewConfirmedAtIso: "2026-06-27T08:10:00.000Z",
      reviewOriginSource: "passport_ocr",
      reviewSource: "manual",
      reviewState: "confirmed",
    });
    expect(submitted.status).toBe("submitted_for_review");
  });

  test("uses questionnaire fallback for missing OCR passport expiry and blocks expired passports", () => {
    const inProgress = setApplicantFieldValues(completeInProgressSubmission(), 0, {
      "passport-expiry-date": "26.02.2026",
    });
    const applied = unwrap(
      applyPassportAutofillResult(inProgress, {
        applicantId: inProgress.applicants[0]?.id ?? "",
        fields: [
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: false,
            source: "passport_scan",
            value: mainReference.passportNumber,
          },
        ],
        nowIso: "2026-06-27T08:00:00.000Z",
        status: "ready",
      }),
    );
    const confirmed = unwrap(
      confirmQuestionnaireReviewFields(applied, {
        applicantId: applied.applicants[0]?.id ?? "",
        fieldIds: ["passport-no"],
        nowIso: "2026-06-27T08:10:00.000Z",
        source: "passport_ocr",
      }),
    );

    expect(submitOperationalForReview(confirmed, "agent")).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("просрочен"),
      }),
    });
  });

  test("does not overwrite conflicting manually entered passport fields in safe mode", () => {
    const inProgress = setApplicantFieldValues(completeInProgressSubmission(), 0, {
      "passport-no": "123456789",
    });
    const applied = unwrap(
      applyPassportAutofillResult(inProgress, {
        applicantId: inProgress.applicants[0]?.id ?? "",
        fields: [
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: false,
            source: "passport_scan",
            value: mainReference.passportNumber,
          },
        ],
        status: "ready",
      }),
    );

    expect(field(applied, 0, "passport-no")).toMatchObject({
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
      value: "123456789",
    });
    expect(applied.applicants[0]?.passportExtraction?.appliedFieldKeys).toEqual([]);
  });

  test("reuses passport OCR gates before operational submit", () => {
    const inProgress = completeInProgressSubmission();
    const passportFile = inProgress.files.find(
      (file) =>
        file.type === "passport_scan" &&
        file.applicantId === inProgress.applicants[0]?.id,
    );
    if (!passportFile) throw new Error("Missing passport file.");

    const extracted = finishPassportExtraction(inProgress, passportFile, {
      fields: [
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: false,
          value: mainReference.passportNumber,
        },
      ],
      guardrails: [],
      source: "local-ocr",
      status: "extracted",
      summary: "Passport number detected.",
    });

    expect(submitOperationalForReview(extracted, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Проверьте распознанные паспортные данные"),
      },
    });
  });

  test("preserves draft and manual fields when OCR fails", () => {
    const withPassportScan = draftWithUploadedPassportScan();
    const manual = setApplicantFieldValues(withPassportScan, 0, {
      "passport-no": "123456789",
    });
    const failed = unwrap(
      applyPassportAutofillResult(manual, {
        applicantId: manual.applicants[0]?.id ?? "",
        error: "Text layer unavailable.",
        status: "failed",
      }),
    );

    expect(field(failed, 0, "passport-no")?.value).toBe("123456789");
    expect(failed.applicants[0]?.passportExtraction).toMatchObject({
      appliedFieldKeys: [],
      status: "failed",
    });
  });

  test("allows manual review submission after OCR failure when passport fields are complete", () => {
    const inProgress = setApplicantFieldValues(completeInProgressSubmission(), 0, {
      "passport-expiry-date": "26.02.2028",
    });
    const failed = unwrap(
      applyPassportAutofillResult(inProgress, {
        applicantId: inProgress.applicants[0]?.id ?? "",
        error: "Text layer unavailable.",
        status: "failed",
      }),
    );
    const submitted = unwrap(submitOperationalForReview(failed, "agent"));

    expect(failed.applicants[0]?.passportExtraction).toMatchObject({
      appliedFieldKeys: [],
      status: "failed",
    });
    expect(submitted.status).toBe("submitted_for_review");
  });

  test("rejects no-op review confirmation", () => {
    const submission = completeInProgressSubmission();

    expect(
      confirmQuestionnaireReviewFields(submission, {
        applicantId: submission.applicants[0]?.id ?? "",
        fieldIds: ["passport-no"],
        source: "passport_ocr",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "No matching review fields were confirmed.",
      },
    });
  });

  test("propagates family shared answers without touching individual passport fields", () => {
    const family = createDraftSubmission({
      applicantNames: ["ANTON VOLKOV", "IRINA VOLKOVA"],
      city: "Москва",
      familyCount: 2,
      submissions: [],
      type: "family",
    });

    const applied = unwrap(
      applyFamilySharedAnswers(family, {
        homeAddress: "NEVSKY 10",
        sameHomeAddress: true,
        sameSpainStay: true,
        sameTripDetails: true,
        spainStay: {
          address: "CALLE 10",
          city: "MADRID",
          contact: "34910000000",
          country: "Spain",
          email: "hotel@example.test",
          name: "HOTEL CENTRAL",
          postalCode: "28001",
        },
        tripDetails: {
          arrivalDate: "2026-05-18",
          costCoveredBy: "By the applicant - Самим заявителем",
          departureDate: "2026-05-22",
          entryCount: "Single Entry - Однократный",
          meansOfSupport: "Cash - Наличные",
          purpose: "BUSINESS",
          route: "Москва, Мадрид, Москва",
          stayDuration: "5",
        },
      }),
    );

    for (const applicantIndex of [0, 1]) {
      expect(field(applied, applicantIndex, "home-address")).toMatchObject({
        reviewOriginSource: "family_shared",
        reviewSource: "family_shared",
        reviewState: "needs_review",
        value: "NEVSKY 10",
      });
      expect(field(applied, applicantIndex, "hotel-city")?.value).toBe("MADRID");
      expect(field(applied, applicantIndex, "route")?.value).toBe(
        "Москва, Мадрид, Москва",
      );
    }
    expect(field(applied, 1, "passport-no")?.value).toBe("");
    expect(field(applied, 1, "passport-no")?.reviewState).toBeUndefined();
    expect(applied.history[0]).toMatchObject({
      source: "agent",
      text: "Агент распространил общие ответы семьи по заявителям",
    });
  });

  test("resolves an issue to the exact questionnaire field without closing it", () => {
    const submission = withIssue(
      createDraftSubmission({
        applicantNames: ["ANTON VOLKOV"],
        city: "Москва",
        familyCount: 1,
        submissions: [],
        type: "single",
      }),
      {
        field: "Дата рождения",
        section: "Личные данные",
      },
    );

    const focusTarget = unwrap(resolveIssueFocusTarget(submission, "issue-birth-date"));

    expect(focusTarget).toMatchObject({
      drawerTab: "questionnaire",
      fieldId: "birth-date",
      fieldLabel: "Дата рождения",
      focus: true,
      highlight: "error",
      sectionTitle: "Личные данные",
    });
    expect(submission.issues[0]?.status).toBe("open");
  });

  test("builds one Excel batch per city with families first and package identity", () => {
    const singleMoscow = readySubmission({
      city: "Москва",
      id: "ready-single-msk",
      names: ["SERGEY IVANOV"],
      type: "single",
    });
    const familyMoscow = readySubmission({
      city: "Москва",
      id: "ready-family-msk",
      names: ["ANTON VOLKOV", "IRINA VOLKOVA"],
      type: "family",
    });
    const singleKazan = readySubmission({
      city: "Казань",
      id: "ready-single-kzn",
      names: ["OLGA PETROVA"],
      type: "single",
    });

    const batches = buildCityExportBatchPlan([singleMoscow, familyMoscow, singleKazan]);
    const moscow = batches.find((batch) => batch.city === "Москва");
    const kazan = batches.find((batch) => batch.city === "Казань");

    expect(batches.map((batch) => batch.city)).toEqual(["Москва", "Казань"]);
    expect(moscow?.ready).toBe(true);
    expect(moscow?.blockers).toEqual([]);
    expect(moscow?.contractValid).toBe(true);
    expect(moscow?.packageIdentity).toMatchObject({
      format: "xlsx",
      rowCount: 3,
      submissionIds: ["ready-family-msk", "ready-single-msk"],
    });
    expect(moscow?.submissions.map((submission) => submission.id)).toEqual([
      "ready-family-msk",
      "ready-single-msk",
    ]);
    expect(moscow?.rows.map((row) => row.submissionId)).toEqual([
      "ready-family-msk",
      "ready-family-msk",
      "ready-single-msk",
    ]);
    expect(moscow?.familyMarkers).toEqual([
      {
        color: "green",
        familyIndex: 1,
        rowEndIndex: 1,
        rowStartIndex: 0,
        submissionId: "ready-family-msk",
        submissionTitle: "Семейная подача VOLKOV",
      },
    ]);
    expect(kazan?.rows).toHaveLength(1);
  });

  test("creates blocking issues from returned application PDF mismatches", () => {
    const exported = exportedSubmission();
    const result = unwrap(
      applyReturnedPdfPackageReview(exported, {
        applicationPdfs: [
          {
            artifact: pdfArtifact(
              `${mainReference.passportNumber}_application.pdf`,
              exported.id,
              exported.applicants[0]?.id ?? "",
            ),
            pdfText: pdfTextFor({
              ...mainReference,
              birthDate: "21.08.1990",
            }),
          },
        ],
        commonAppointmentPdf: appointmentPdf,
        nowIso: "2026-06-27T08:00:00.000Z",
      }),
    );

    expect(result.submission.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          createdBy: "system",
          severity: "blocker",
          status: "open",
          target: expect.objectContaining({
            applicantId: exported.applicants[0]?.id,
            field: "Дата рождения",
            section: "Личные данные",
          }),
        }),
      ]),
    );
    expect(field(result.submission, 0, "birth-date")).toMatchObject({
      reviewOriginSource: "pdf_reconciliation",
      reviewSource: "pdf_reconciliation",
      reviewState: "needs_review",
    });
    expect(result.submission.history[0]).toMatchObject({
      source: "system",
      text: "PDF mismatch issue created from returned PDF",
    });
    expect(result.handoffPackage.ready).toBe(false);
    expect(result.handoffPackage.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining("Дата рождения")]),
    );
  });

  test("rejects returned PDF package review before external export", () => {
    const ready = readySubmission({
      city: "Москва",
      id: "ready-for-export-main",
      names: ["ANTON VOLKOV"],
      type: "single",
    });

    expect(
      applyReturnedPdfPackageReview(ready, {
        applicationPdfs: [],
        commonAppointmentPdf: appointmentPdf,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Returned PDF package can be reviewed only after export.",
      },
    });
  });

  test("keeps handoff blocked until returned PDF mismatch issue is closed after clean retry", () => {
    const exported = exportedSubmission();
    const applicant = exported.applicants[0];
    if (!applicant) throw new Error("Missing applicant.");
    const mismatched = unwrap(
      applyReturnedPdfPackageReview(exported, {
        applicationPdfs: [
          {
            artifact: pdfArtifact(
              `${mainReference.passportNumber}_application.pdf`,
              exported.id,
              applicant.id,
            ),
            pdfText: pdfTextFor({
              ...mainReference,
              birthDate: "21.08.1990",
            }),
          },
        ],
        commonAppointmentPdf: appointmentPdf,
      }),
    );
    const blockedIssueId = mismatched.submission.issues.find(
      (issue) => issue.reason === "Returned PDF mismatch",
    )?.id;
    if (!blockedIssueId) throw new Error("Missing blocked PDF mismatch issue.");

    expect(
      confirmReturnedPdfMismatchIssue(mismatched.submission, "admin", {
        issueId: blockedIssueId,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Returned PDF mismatch is still present in the latest PDF review.",
      },
    });

    const cleanRetry = unwrap(
      applyReturnedPdfPackageReview(mismatched.submission, {
        applicationPdfs: [
          {
            artifact: pdfArtifact(
              `${mainReference.passportNumber}_application.pdf`,
              exported.id,
              applicant.id,
            ),
            pdfText: pdfTextFor(mainReference),
          },
        ],
      }),
    );
    const blockedPackage = buildAgentHandoffPackage(cleanRetry.submission);

    expect(cleanRetry.submission.returnedPdfPackage?.commonAppointmentPdf).toEqual(
      appointmentPdf,
    );
    expect(blockedPackage).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        expect.stringContaining("returned PDF mismatch issue is open"),
      ]),
    });

    const reviewId = cleanRetry.submission.visaApplicationPdfReviews?.at(-1)?.id;
    if (!reviewId) throw new Error("Missing clean retry review.");
    const confirmedPdfSubmission = confirmVisaApplicationPdfManualReview(
      cleanRetry.submission,
      reviewId,
      "admin-1",
    );
    const issueId = confirmedPdfSubmission.issues.find(
      (issue) => issue.reason === "Returned PDF mismatch",
    )?.id;
    if (!issueId) throw new Error("Missing returned PDF mismatch issue.");
    const confirmedIssueSubmission = unwrap(
      confirmReturnedPdfMismatchIssue(confirmedPdfSubmission, "admin", {
        actorId: "admin-1",
        issueId,
        nowIso: "2026-06-27T11:00:00.000Z",
      }),
    );

    expect(buildAgentHandoffPackage(confirmedIssueSubmission).ready).toBe(true);
  });

  test("reopens stale returned PDF mismatch issues for the same field", () => {
    const exported = exportedSubmission();
    const applicant = exported.applicants[0];
    if (!applicant) throw new Error("Missing applicant.");
    const staleIssueId = `зм-${exported.id}-pdf-${applicant.id}-birthDate`;
    const withClosedIssue: Submission = {
      ...exported,
      issues: [
        {
          comment: "Old mismatch.",
          createdAt: "2026-06-20T08:00:00.000Z",
          createdBy: "system",
          id: staleIssueId,
          reason: "Returned PDF mismatch",
          severity: "blocker",
          status: "closed_by_admin",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Дата рождения",
            section: "Личные данные",
          },
          type: "field",
        },
      ],
    };

    const result = unwrap(
      applyReturnedPdfPackageReview(withClosedIssue, {
        applicationPdfs: [
          {
            artifact: pdfArtifact(
              `${mainReference.passportNumber}_application.pdf`,
              exported.id,
              applicant.id,
            ),
            pdfText: pdfTextFor({
              ...mainReference,
              birthDate: "22.08.1990",
            }),
          },
        ],
        commonAppointmentPdf: appointmentPdf,
        nowIso: "2026-06-27T09:00:00.000Z",
      }),
    );
    const reopenedIssue = result.submission.issues.find(
      (issue) => issue.id === staleIssueId,
    );

    expect(reopenedIssue).toMatchObject({
      comment: "PDF не совпадает с заявкой: дата рождения.",
      status: "open",
    });
    expect(result.submission.history[0]).toMatchObject({
      text: "PDF mismatch issue reopened from returned PDF",
    });
  });

  test("blocks agent handoff for unmatched returned PDFs and missing artifacts", () => {
    const exported = exportedSubmission();
    const applicant = exported.applicants[0];
    if (!applicant) throw new Error("Missing applicant.");
    const cleanReview = cleanPdfReview(applicant);
    const unmatchedBlockedReview: VisaApplicationPdfReviewState = {
      checkedAtIso: "2026-06-27T08:00:00.000Z",
      data: {
        passportNumber: "000000000",
      },
      fileName: "unmatched_application.pdf",
      findings: [
        {
          code: "pdf_applicant_match_missing",
          field: "passportNumber",
          message: "PDF анкеты не удалось сопоставить с заявителем.",
          severity: "critical",
        },
      ],
      handoffStatus: "blocked",
      id: "visa-pdf-unmatched",
      status: "blocked",
    };
    const withUnmatchedReview: Submission = {
      ...exported,
      visaApplicationPdfReviews: [cleanReview, unmatchedBlockedReview],
    };

    expect(
      buildAgentHandoffPackage(withUnmatchedReview, {
        commonAppointmentPdf: appointmentPdf,
      }),
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        expect.stringContaining("не удалось сопоставить"),
      ]),
    });

    const withoutArtifact: Submission = {
      ...exported,
      visaApplicationPdfReviews: [
        {
          ...cleanReview,
          artifact: undefined,
        },
      ],
    };

    expect(
      buildAgentHandoffPackage(withoutArtifact, {
        commonAppointmentPdf: appointmentPdf,
      }),
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        expect.stringContaining("artifact is missing"),
      ]),
    });
  });

  test("packages returned PDFs for the agent only when every applicant PDF is clean", () => {
    const exported = exportedSubmission();
    const applicant = exported.applicants[0];
    if (!applicant) throw new Error("Missing applicant.");
    const cleanReview = cleanPdfReview(applicant);
    const reviewWithoutStorage: VisaApplicationPdfReviewState = {
      ...cleanReview,
      artifact: cleanReview.artifact
        ? {
            ...cleanReview.artifact,
            storageBucket: undefined,
            storagePath: undefined,
          }
        : undefined,
    };
    const withReviewWithoutStorage: Submission = {
      ...exported,
      visaApplicationPdfReviews: [reviewWithoutStorage],
    };

    expect(
      buildAgentHandoffPackage(withReviewWithoutStorage, {
        commonAppointmentPdf: appointmentPdf,
      }),
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        expect.stringContaining("private storage identity"),
      ]),
    });

    const withCleanReview: Submission = {
      ...exported,
      visaApplicationPdfReviews: [cleanReview],
    };

    expect(buildAgentHandoffPackage(withCleanReview).ready).toBe(false);
    expect(
      buildAgentHandoffPackage(withCleanReview, {
        commonAppointmentPdf: {
          ...appointmentPdf,
          storagePath: buildAppointmentPdfStorageTarget({
            sha256: appointmentPdf.sha256,
            submissionId: "other-submission",
          }).path,
        },
      }),
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        expect.stringContaining("appointment PDF storage identity"),
      ]),
    });

    const wrongApplicantTarget = buildVisaApplicationPdfStorageTarget({
      applicantId: "other-applicant",
      sha256: cleanReview.artifact?.sha256 ?? "",
      submissionId: exported.id,
    });
    const withWrongApplicantStorage: Submission = {
      ...exported,
      visaApplicationPdfReviews: [
        {
          ...cleanReview,
          artifact: cleanReview.artifact
            ? {
                ...cleanReview.artifact,
                storagePath: wrongApplicantTarget.path,
              }
            : undefined,
        },
      ],
    };

    expect(
      buildAgentHandoffPackage(withWrongApplicantStorage, {
        commonAppointmentPdf: appointmentPdf,
      }),
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        expect.stringContaining("application PDF storage identity"),
      ]),
    });

    const withDuplicateReadyReviews: Submission = {
      ...exported,
      visaApplicationPdfReviews: [
        cleanReview,
        {
          ...cleanReview,
          id: "visa-pdf-clean-main-duplicate",
        },
      ],
    };

    expect(
      buildAgentHandoffPackage(withDuplicateReadyReviews, {
        commonAppointmentPdf: appointmentPdf,
      }),
    ).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining([
        expect.stringContaining("exactly one ready review"),
      ]),
    });

    const packageResult = buildAgentHandoffPackage(withCleanReview, {
      commonAppointmentPdf: appointmentPdf,
    });

    expect(packageResult.ready).toBe(true);
    expect(packageResult.applicantPdfs).toEqual([
      expect.objectContaining({
        applicantId: applicant.id,
        fileName: `${mainReference.passportNumber}_application.pdf`,
        fileNames: {
          application: `${mainReference.passportNumber}_application.pdf`,
          appointment: `${mainReference.passportNumber}_appointment.pdf`,
          passportScan: `${mainReference.passportNumber}_passport_scan.pdf`,
          selfie: `${mainReference.passportNumber}_selfie.jpg`,
          selfie2: `${mainReference.passportNumber}_selfie_2.jpg`,
        },
        status: "clear",
      }),
    ]);
    expect(buildApplicantArtifactFileNames(withCleanReview, applicant.id)).toEqual({
      application: `${mainReference.passportNumber}_application.pdf`,
      appointment: `${mainReference.passportNumber}_appointment.pdf`,
      passportScan: `${mainReference.passportNumber}_passport_scan.pdf`,
      selfie: `${mainReference.passportNumber}_selfie.jpg`,
      selfie2: `${mainReference.passportNumber}_selfie_2.jpg`,
    });
  });

  test("stores common appointment PDF durably in the returned package state", () => {
    const exported = exportedSubmission();
    const applicant = exported.applicants[0];
    if (!applicant) throw new Error("Missing applicant.");

    const reviewed = unwrap(
      applyReturnedPdfPackageReview(exported, {
        actorId: "admin-1",
        applicationPdfs: [
          {
            artifact: pdfArtifact(
              `${mainReference.passportNumber}_application.pdf`,
              exported.id,
              applicant.id,
            ),
            pdfText: pdfTextFor(mainReference),
          },
        ],
        commonAppointmentPdf: appointmentPdf,
        nowIso: "2026-06-27T10:00:00.000Z",
      }),
    );

    expect(reviewed.submission.returnedPdfPackage).toMatchObject({
      commonAppointmentPdf: appointmentPdf,
      reviewedAtIso: "2026-06-27T10:00:00.000Z",
      reviewedBy: "admin-1",
    });
    expect(buildAgentHandoffPackage(reviewed.submission).blockers).not.toContain(
      "Common appointment/list PDF is missing.",
    );
  });
});

function unwrap<T>(result: CommandResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function completeInProgressSubmission(): Submission {
  return {
    ...uploadRequiredFilesWithRealPassportScan(
      setApplicantFieldValues(
        completeQuestionnaire(
          createDraftSubmission({
            applicantNames: ["ANTON VOLKOV"],
            city: "Москва",
            familyCount: 1,
            submissions: [],
            type: "single",
          }),
        ),
        0,
        {
          "birth-country": mainReference.birthCountry,
          "birth-date": mainReference.birthDate,
          "birth-place": mainReference.birthPlace,
          nationality: mainReference.citizenship,
          "first-name": mainReference.firstName,
          "passport-expiry-date": mainReference.passportExpiresAt,
          "passport-issue-country": mainReference.passportIssueCountry,
          "passport-issue-date": mainReference.passportIssuedAt,
          "passport-no": mainReference.passportNumber,
          surname: mainReference.surname,
        },
      ),
    ),
    status: "in_progress",
    tripDateFrom: "2026-07-10",
    tripDateTo: "2026-07-18",
  };
}

function uploadRequiredFilesWithRealPassportScan(submission: Submission): Submission {
  const passportScan = submission.files.find((file) => file.type === "passport_scan");
  const withPassportScan = passportScan
    ? uploadRequiredFile(submission, passportScan.id, {
        generatedFileName: "passport-scan.pdf",
        mimeType: "application/pdf",
        originalFileName: "passport-scan.pdf",
        sizeBytes: 150_000,
        uploadedAtIso: "2026-06-27T08:00:00.000Z",
      })
    : submission;

  return uploadRequiredFiles(withPassportScan);
}

function draftWithUploadedPassportScan(): Submission {
  const draft = createDraftSubmission({
    applicantNames: ["ANTON VOLKOV"],
    city: "Москва",
    familyCount: 1,
    submissions: [],
    type: "single",
  });
  const passportScan = draft.files.find((file) => file.type === "passport_scan");
  if (!passportScan) throw new Error("Missing passport scan slot.");

  return uploadRequiredFile(draft, passportScan.id, {
    generatedFileName: "scan.pdf",
    mimeType: "application/pdf",
    originalFileName: "scan.pdf",
    sizeBytes: 150_000,
    uploadedAtIso: "2026-06-27T08:00:00.000Z",
  });
}

function readySubmission(input: {
  city: Submission["city"];
  id: string;
  names: string[];
  type: Submission["type"];
}): Submission {
  const completed = completedWithReference(input);
  return {
    ...completed,
    exportState: "ready",
    files: completed.files.map((file) => ({ ...file, status: "accepted" })),
    id: input.id,
    issues: [],
    listTitle:
      input.type === "family" ? `Семья ${surnameFromName(input.names[0])}` : undefined,
    status: "ready_for_export",
    title:
      input.type === "family"
        ? `Семейная подача ${surnameFromName(input.names[0])}`
        : `Подача ${input.names[0]}`,
  };
}

function exportedSubmission(): Submission {
  const submission = completedWithReference({
    city: "Москва",
    id: "exported-main",
    names: ["ANTON VOLKOV"],
    type: "single",
  });

  return {
    ...submission,
    exportState: "marked_exported",
    files: submission.files.map((file) => ({ ...file, status: "accepted" })),
    id: "exported-main",
    status: "exported",
  };
}

function completedWithReference(input: {
  city: Submission["city"];
  id: string;
  names: string[];
  type: Submission["type"];
}): Submission {
  const draft = createDraftSubmission({
    applicantNames: input.names,
    city: input.city,
    familyCount: input.names.length,
    submissions: [],
    type: input.type,
  });
  const completed = completeQuestionnaire(draft);
  const withReference = setApplicantFieldValues(completed, 0, {
    "birth-country": mainReference.birthCountry,
    "birth-date": mainReference.birthDate,
    "birth-place": mainReference.birthPlace,
    nationality: mainReference.citizenship,
    "first-name": mainReference.firstName,
    "passport-expiry-date": mainReference.passportExpiresAt,
    "passport-issue-country": mainReference.passportIssueCountry,
    "passport-issue-date": mainReference.passportIssuedAt,
    "passport-no": mainReference.passportNumber,
    surname: mainReference.surname,
  });

  return {
    ...uploadRequiredFiles(withReference),
    id: input.id,
    title:
      input.type === "family"
        ? `Семейная подача ${surnameFromName(input.names[0])}`
        : `Подача ${input.names[0]}`,
    tripDateFrom: "2026-07-10",
    tripDateTo: "2026-07-18",
  };
}

function setApplicantFieldValues(
  submission: Submission,
  applicantIndex: number,
  values: ApplicantFieldValues,
): Submission {
  const applicantId = submission.applicants[applicantIndex]?.id;
  if (!applicantId) throw new Error("Missing applicant.");

  return normalizeSubmissionQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      if (applicant.id !== applicantId) return applicant;

      return {
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((candidate) => {
            const value = values[candidate.id];
            return value === undefined ? candidate : { ...candidate, value };
          }),
        })),
      };
    }),
  });
}

function field(submission: Submission, applicantIndex: number, fieldId: string) {
  return submission.applicants[applicantIndex]?.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === fieldId);
}

function withIssue(
  submission: Submission,
  target: Pick<Issue["target"], "field" | "section">,
): Submission {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant.");

  return {
    ...submission,
    issues: [
      {
        comment: "Проверьте значение в анкете.",
        createdAt: "2026-06-27T08:00:00.000Z",
        createdBy: "admin",
        id: "issue-birth-date",
        reason: "Данные требуют проверки",
        severity: "blocker",
        status: "open",
        target: {
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          field: target.field,
          section: target.section,
        },
        type: "field",
      },
    ],
  };
}

function cleanPdfReview(
  applicant: Submission["applicants"][number],
): VisaApplicationPdfReviewState {
  const artifact = pdfArtifact(
    `${mainReference.passportNumber}_application.pdf`,
    "exported-main",
    applicant.id,
  );

  return {
    applicantId: applicant.id,
    applicantName: applicant.fullName,
    artifact: {
      ...artifact,
      uploadedAtIso: artifact.uploadedAtIso ?? "2026-06-27T08:00:00.000Z",
    },
    checkedAtIso: "2026-06-27T08:00:00.000Z",
    data: {
      passportNumber: mainReference.passportNumber,
    },
    fileName: artifact.fileName,
    findings: [],
    handoffStatus: "ready_for_agent",
    id: "visa-pdf-clean-main",
    status: "clear",
  };
}

function pdfArtifact(
  fileName: string,
  submissionId = "exported-main",
  applicantId = "з-main",
): VisaApplicationPdfArtifactInput {
  const sha256 = "b".repeat(64);
  const target = buildVisaApplicationPdfStorageTarget({
    applicantId,
    sha256,
    submissionId,
  });

  return {
    extractionSource: "text_layer",
    fileName,
    mimeType: "application/pdf",
    sha256,
    sizeBytes: 120_000,
    storageBucket: target.bucket,
    storagePath: target.path,
    uploadedAtIso: "2026-06-27T08:00:00.000Z",
    uploadedBy: "admin@example.test",
  };
}

function pdfTextFor(reference: typeof mainReference) {
  return `
1.
${reference.surname}
2.
${reference.surname}
3.
${reference.firstName}
4.
${reference.birthDate}
5.
${reference.birthPlace}
6.
${reference.birthCountry}
7.
${reference.citizenship}
8.
MALE
9.
MARRIED
10.
11.
12.
ORDINARY PASSPORT
13.
${reference.passportNumber}
14.
${reference.passportIssuedAt}
15.
${reference.passportExpiresAt}
16.
${reference.passportIssueCountry}
17.
18.
19.
NEVSKY 10
20.
21.
22.
23.
24.
25.
Spain
26.
Spain
27.
Una
28.
2026-05-18
2026-05-22
29.
30.
31.
HOTEL CENTRAL
32.
CALLE 10
33.
By the applicant himself/herself
34.
`;
}

function surnameFromName(name: string | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.at(-1) ?? "FAMILY";
}
