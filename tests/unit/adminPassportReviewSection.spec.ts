import { describe, expect, test } from "vitest";
import {
  addPreciseAdminIssue,
  approvePassportReviewSectionForAdmin,
  createDraftSubmission,
  generatedCockpitMediaFileName,
} from "../../src/modules/submissions/submissionActions";
import {
  ADMIN_PASSPORT_REVIEW_FIELD_IDS,
  requiredPassportReviewMediaTypesForApplicant,
} from "../../src/modules/submissions/passportReviewContract";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import { canonicalRequiredMediaReadiness } from "../../src/modules/submissions/domainContract";
import { canReplaceDocument } from "../../src/modules/submissions/status";
import type { Submission, SubmissionFile } from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function reviewableSubmission(
  type: Submission["type"] = "single",
  familyCount = 1,
): Submission {
  const draft = fillRequiredQuestionnaireForTest(
    createDraftSubmission({
      city: "Москва",
      familyCount,
      idScheme: "supabase",
      submissions: [],
      type,
    }),
  );

  return {
    ...draft,
    files: draft.files.map((file) => {
      const generatedFileName = generatedCockpitMediaFileName({
        applicantId: file.applicantId,
        fileType: file.type,
        mimeType: "image/jpeg",
        submissionId: draft.id,
      });
      const target = buildMediaStoragePath(
        draft.id,
        file.applicantId,
        file.type,
        generatedFileName,
      );

      return {
        ...file,
        generatedFileName,
        mimeType: "image/jpeg",
        originalFileName: `${file.type}.jpg`,
        sizeBytes: 1_024,
        status: "pending_review" as const,
        storageAdapter: "supabase-private" as const,
        storageBucket: target.bucket,
        storagePath: target.path,
        uploadStatus: "uploaded" as const,
      };
    }),
    issues: [],
    status: "submitted_for_review",
  };
}

function unwrap(result: ReturnType<typeof approvePassportReviewSectionForAdmin>) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe("admin passport review section approval", () => {
  test("fails closed when a family has more than one primary applicant", () => {
    const submission = reviewableSubmission("family", 2);
    const ambiguous: Submission = {
      ...submission,
      applicants: submission.applicants.map((applicant) => ({
        ...applicant,
        role: "main",
      })),
    };

    expect(canonicalRequiredMediaReadiness(ambiguous)).toMatchObject({
      ok: false,
      reason: "Submission must have one unambiguous primary applicant.",
    });
    expect(
      approvePassportReviewSectionForAdmin(
        ambiguous,
        { applicantId: ambiguous.applicants[0]!.id },
        "admin-reviewer",
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  test.each(["selfie", "selfie_2"] as const)(
    "rejects a new %s issue for a secondary family applicant",
    (fileType) => {
      const submission = reviewableSubmission("family", 2);
      const secondary = submission.applicants[1];
      if (!secondary) throw new Error("Expected secondary applicant.");

      const withInvalidSelfieIssue = addPreciseAdminIssue(submission, {
        applicantId: secondary.id,
        comment: "Загрузите новое селфи.",
        fileType,
        reason: "Селфи требует замены",
        section: "Файлы",
        severity: "blocker",
        type: "file",
      });

      expect(withInvalidSelfieIssue).toBe(submission);
      expect(withInvalidSelfieIssue.issues).toHaveLength(0);

      const withPassportIssue = addPreciseAdminIssue(submission, {
        applicantId: secondary.id,
        comment: "Загрузите новый скан паспорта.",
        fileType: "passport_scan",
        reason: "Скан требует замены",
        section: "Файлы",
        severity: "blocker",
        type: "file",
      });
      expect(withPassportIssue.issues).toEqual([
        expect.objectContaining({
          target: expect.objectContaining({
            applicantId: secondary.id,
            fileType: "passport_scan",
          }),
        }),
      ]);
    },
  );

  test("marks an exact file target for replacement independent of its presentation section label", () => {
    const submission = reviewableSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");

    const withIssue = addPreciseAdminIssue(submission, {
      applicantId: applicant.id,
      comment: "Загрузите новый скан паспорта.",
      fileType: "passport_scan",
      reason: "Скан требует замены",
      section: "Паспорт",
      severity: "blocker",
      type: "file",
    });
    const flagged = withIssue.files.find(
      (file) => file.applicantId === applicant.id && file.type === "passport_scan",
    );

    expect(flagged).toMatchObject({
      linkedIssueId: withIssue.issues[0]?.id,
      reviewStatus: "replace_required",
      status: "needs_replacement",
    });
    expect(
      flagged && canReplaceDocument({ ...withIssue, status: "returned" }, flagged),
    ).toBe(true);
  });

  test("approves exactly eight passport fields and the protected single-applicant media", () => {
    const submission = reviewableSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");

    const approved = unwrap(
      approvePassportReviewSectionForAdmin(
        submission,
        { applicantId: applicant.id },
        "admin-reviewer",
        "2026-07-17T03:00:00.000Z",
      ),
    );
    const approvedFields = approved.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.adminReviewApprovedAtIso);

    expect(approvedFields?.map((field) => field.id)).toEqual(
      expect.arrayContaining([...ADMIN_PASSPORT_REVIEW_FIELD_IDS]),
    );
    expect(approvedFields).toHaveLength(ADMIN_PASSPORT_REVIEW_FIELD_IDS.length);
    expect(
      approved.files.filter((file) => file.applicantId === applicant.id),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "accepted", type: "passport_scan" }),
        expect.objectContaining({ status: "accepted", type: "selfie" }),
        expect.objectContaining({ status: "accepted", type: "selfie_2" }),
      ]),
    );
    expect(submission.files.every((file) => file.status === "pending_review")).toBe(
      true,
    );

    const repeated = approvePassportReviewSectionForAdmin(
      approved,
      { applicantId: applicant.id },
      "admin-reviewer",
      "2026-07-17T03:05:00.000Z",
    );
    expect(repeated).toEqual({ ok: true, data: approved });
  });

  test.each([
    "draft",
    "in_progress",
    "returned",
    "ready_for_export",
    "exported",
  ] as const)("rejects passport confirmation in the read-only %s status", (status) => {
    const source = reviewableSubmission();
    const submission: Submission = { ...source, status };
    const before = structuredClone(submission);

    expect(
      approvePassportReviewSectionForAdmin(
        submission,
        { applicantId: submission.applicants[0]?.id ?? "" },
        "admin-reviewer",
      ),
    ).toMatchObject({ ok: false });
    expect(submission).toEqual(before);
  });

  test.each([
    ["missing", { status: "missing" }],
    ["needs replacement", { status: "needs_replacement" }],
    ["rejected", { reviewStatus: "replace_required" }],
    ["poor quality", { reviewStatus: "poor_quality" }],
    ["non-canonical storage", { storageAdapter: "local-dev" }],
  ] satisfies Array<[string, Partial<SubmissionFile>]>)(
    "rejects %s protected media without mutation",
    (_label, filePatch) => {
      const source = reviewableSubmission();
      const applicant = source.applicants[0];
      if (!applicant) throw new Error("Expected applicant.");
      const submission: Submission = {
        ...source,
        files: source.files.map((file) =>
          file.applicantId === applicant.id && file.type === "passport_scan"
            ? { ...file, ...filePatch }
            : file,
        ),
      };
      const before = structuredClone(submission);

      expect(
        approvePassportReviewSectionForAdmin(
          submission,
          { applicantId: applicant.id },
          "admin-reviewer",
        ),
      ).toMatchObject({ ok: false });
      expect(submission).toEqual(before);
    },
  );

  test("accepts only passport_scan for a secondary family applicant", () => {
    const submission = reviewableSubmission("family", 3);
    const secondary = submission.applicants[1];
    if (!secondary) throw new Error("Expected secondary applicant.");

    expect(
      requiredPassportReviewMediaTypesForApplicant(submission, secondary.id),
    ).toEqual(["passport_scan"]);
    const approved = unwrap(
      approvePassportReviewSectionForAdmin(
        submission,
        { applicantId: secondary.id },
        "admin-reviewer",
      ),
    );

    expect(
      approved.files.filter((file) => file.applicantId === secondary.id),
    ).toEqual([
      expect.objectContaining({ status: "accepted", type: "passport_scan" }),
    ]);
    expect(
      approved.files.filter(
        (file) =>
          file.applicantId !== secondary.id && file.status === "pending_review",
      ),
    ).toHaveLength(4);
  });

  test("fails without mutation for missing protected media or an unresolved passport issue", () => {
    const submission = reviewableSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const withoutPassport = {
      ...submission,
      files: submission.files.filter((file) => file.type !== "passport_scan"),
    };

    expect(
      approvePassportReviewSectionForAdmin(
        withoutPassport,
        { applicantId: applicant.id },
        "admin-reviewer",
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });

    const withIssue: Submission = {
      ...submission,
      issues: [
        {
          comment: "Фамилия не совпадает со сканом.",
          createdAt: "2026-07-17T03:00:00.000Z",
          createdBy: "admin",
          id: "passport-field-issue",
          reason: "Проверьте фамилию",
          severity: "warning",
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Фамилия",
            section: "Личные данные заявителя",
          },
          type: "field",
        },
      ],
    };
    expect(
      approvePassportReviewSectionForAdmin(
        withIssue,
        { applicantId: applicant.id },
        "admin-reviewer",
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "ACCEPTANCE_BLOCKED" },
    });
    expect(withIssue.files.every((file) => file.status === "pending_review")).toBe(
      true,
    );

    const fixedByAgent: Submission = {
      ...withIssue,
      issues: withIssue.issues.map((issue) => ({
        ...issue,
        status: "fixed_by_agent" as const,
      })),
    };
    const rechecked = unwrap(
      approvePassportReviewSectionForAdmin(
        fixedByAgent,
        { applicantId: applicant.id },
        "admin-reviewer",
      ),
    );
    expect(rechecked.issues).toEqual([
      expect.objectContaining({
        id: "passport-field-issue",
        status: "closed_by_admin",
      }),
    ]);
    expect(rechecked.files.every((file) => file.status === "accepted")).toBe(true);
    expect(rechecked.history[0]?.text).toContain("закрыл исправленные замечания");
  });

  test("rechecks a protected legacy secondary selfie without making it required media", () => {
    const submission = reviewableSubmission("family", 2);
    const secondary = submission.applicants[1];
    const primarySelfie = submission.files.find(
      (file) => file.applicantId === submission.applicants[0]?.id && file.type === "selfie",
    );
    if (!secondary || !primarySelfie) throw new Error("Expected family review fixture.");
    const legacyFileName = generatedCockpitMediaFileName({
      applicantId: secondary.id,
      fileType: "selfie",
      mimeType: "image/jpeg",
      submissionId: submission.id,
    });
    const legacyTarget = buildMediaStoragePath(
      submission.id,
      secondary.id,
      "selfie",
      legacyFileName,
    );
    const legacySelfie = {
      ...primarySelfie,
      applicantId: secondary.id,
      generatedFileName: legacyFileName,
      id: `${secondary.id}-legacy-selfie`,
      storageBucket: legacyTarget.bucket,
      storagePath: legacyTarget.path,
      status: "pending_review" as const,
    };
    const withLegacyCorrection: Submission = {
      ...submission,
      files: [...submission.files, legacySelfie],
      issues: [
        {
          comment: "Селфи заменено агентом.",
          createdAt: "2026-07-17T03:00:00.000Z",
          createdBy: "admin",
          id: "legacy-secondary-selfie-issue",
          reason: "Проверьте заменённое селфи",
          severity: "warning",
          status: "fixed_by_agent",
          target: {
            applicantId: secondary.id,
            applicantName: secondary.fullName,
            field: "Селфи 1",
            fileType: "selfie",
            section: "Файлы",
          },
          type: "file",
        },
      ],
      status: "corrections_received",
    };

    const rechecked = unwrap(
      approvePassportReviewSectionForAdmin(
        withLegacyCorrection,
        { applicantId: secondary.id },
        "admin-reviewer",
      ),
    );

    expect(rechecked.issues[0]?.status).toBe("closed_by_admin");
    expect(
      rechecked.files.find(
        (file) => file.applicantId === secondary.id && file.type === "passport_scan",
      ),
    ).toMatchObject({ status: "accepted" });
    expect(
      rechecked.files.find((file) => file.id === legacySelfie.id),
    ).toMatchObject({ status: "pending_review" });
  });

  test("ignores an open section issue outside the passport review scope", () => {
    const submission = reviewableSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const withEmploymentIssue: Submission = {
      ...submission,
      issues: [
        {
          comment: "Нужно уточнить работодателя.",
          createdAt: "2026-07-17T03:00:00.000Z",
          createdBy: "admin",
          id: "employment-section-issue",
          reason: "Проверьте работу",
          severity: "warning",
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Работа / учеба",
            section: "Данные",
          },
          type: "section",
        },
      ],
    };

    const result = approvePassportReviewSectionForAdmin(
      withEmploymentIssue,
      { applicantId: applicant.id },
      "admin-reviewer",
    );

    expect(result.ok).toBe(true);
  });

  test.each([
    {
      field: "Прежняя фамилия",
      id: "personal-section-non-passport-field",
      section: "Личные данные заявителя",
      status: "open" as const,
    },
    {
      field: "Тип паспорта",
      id: "passport-section-non-passport-field",
      section: "Паспортные данные",
      status: "fixed_by_agent" as const,
    },
    {
      field: undefined,
      id: "passport-section-without-exact-target",
      section: "Паспортные данные",
      status: "open" as const,
    },
  ])(
    "does not block or close $id from a broad section label",
    ({ field, id, section, status }) => {
      const submission = reviewableSubmission();
      const applicant = submission.applicants[0];
      if (!applicant) throw new Error("Expected applicant.");
      const withBroadSectionIssue: Submission = {
        ...submission,
        issues: [
          {
            comment: "Замечание относится к другому полю.",
            createdAt: "2026-07-17T03:00:00.000Z",
            createdBy: "admin",
            id,
            reason: "Проверьте данные",
            severity: "warning",
            status,
            target: {
              applicantId: applicant.id,
              applicantName: applicant.fullName,
              field,
              section,
            },
            type: "section",
          },
        ],
      };

      const result = approvePassportReviewSectionForAdmin(
        withBroadSectionIssue,
        { applicantId: applicant.id },
        "admin-reviewer",
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.issues).toEqual([
        expect.objectContaining({ id, status }),
      ]);
      expect(result.data.history[0]?.text).toBe(
        "Администратор подтвердил паспортную секцию",
      );
    },
  );
});
