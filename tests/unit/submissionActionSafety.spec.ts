import { describe, expect, test } from "vitest";
import {
  applySubmissionAction,
  applySubmissionActionResult,
  calculateSubmissionProgress,
  canPerformAction,
  getPrimaryAction,
  transitionSubmissionById,
} from "../../src/modules/submissions/status";
import {
  createSubmissionActionErrorState,
  submissionActionErrorForSubmission,
} from "../../src/modules/submissions/submissionActionErrors";
import {
  applyActionToSubmissionListResult,
  createDraftSubmission,
  uploadRequiredFile,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";
import {
  adminAcceptRequiredMediaForTest,
  adminApprovePassportFieldsForTest,
  fillRequiredQuestionnaireForTest,
} from "./helpers/questionnaireTestFill";

function reviewReadySubmission(): Submission {
  const draft = createDraftSubmission({
    applicantNames: ["Мария Иванова"],
    city: "Москва",
    familyCount: 1,
    idScheme: "supabase",
    submissions: [],
    type: "single",
  });

  return adminApprovePassportFieldsForTest({
    ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft)),
    status: "in_progress",
    tripDateFrom: "2026-07-10",
    tripDateTo: "2026-07-18",
  });
}

describe("submission action safety", () => {
  test("does not allow history view action to export a submission under review", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );

    expect(canPerformAction(submitted, "open_history", "admin")).toEqual({
      ok: false,
      reason: "Действие недоступно в текущем статусе",
    });

    expect(applySubmissionAction(submitted, "open_history", "admin")).toBe(submitted);
    expect(applySubmissionActionResult(submitted, "open_history", "admin")).toEqual({
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Действие недоступно в текущем статусе",
      },
    });
  });

  test("keeps exported history view read-only", () => {
    const exported = {
      ...reviewReadySubmission(),
      exportState: "marked_exported",
      status: "exported",
    } satisfies Submission;

    expect(canPerformAction(exported, "open_history", "admin")).toEqual({ ok: true });
    expect(applySubmissionAction(exported, "open_history", "admin")).toBe(exported);
    expect(applySubmissionActionResult(exported, "open_history", "admin")).toEqual({
      ok: true,
      data: exported,
    });
  });

  test("returns a typed failure instead of silently swallowing blocked lifecycle actions", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );

    expect(applySubmissionActionResult(submitted, "accept", "agent")).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Недостаточно прав",
      },
    });
    expect(
      applySubmissionActionResult(submitted, "submit_for_review", "agent"),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Действие недоступно в текущем статусе",
      },
    });
  });

  test("list action result applies lifecycle changes to the current candidate", () => {
    const staleSubmission = reviewReadySubmission();
    const currentSubmission = {
      ...staleSubmission,
      city: "Казань",
      files: staleSubmission.files.map((file) =>
        file.type === "selfie_2"
          ? {
              ...file,
              originalFileName: "fresh-selfie-2.jpg",
              storagePath: "fresh/selfie_2.jpg",
              uploadedAtIso: "2026-06-25T10:00:00.000Z",
            }
          : file,
      ),
    } satisfies Submission;

    const result = applyActionToSubmissionListResult(
      [currentSubmission],
      staleSubmission.id,
      "submit_for_review",
      "agent",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const updated = result.data[0];
    expect(updated).toBeDefined();
    if (!updated) return;

    expect(updated).toMatchObject({
      city: "Казань",
      status: "submitted_for_review",
    });
    expect(updated.files).toContainEqual(
      expect.objectContaining({
        originalFileName: "fresh-selfie-2.jpg",
        status: "pending_review",
        storagePath: "fresh/selfie_2.jpg",
        uploadedAtIso: "2026-06-25T10:00:00.000Z",
      }),
    );
  });

  test("list action result returns typed failure without mutating blocked candidates", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const submissions = [submitted];

    const result = applyActionToSubmissionListResult(
      submissions,
      submitted.id,
      "accept",
      "agent",
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Недостаточно прав",
      },
    });
    expect(submissions[0]).toBe(submitted);
  });

  test("scoped action errors clear after the submission state changes", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const error = createSubmissionActionErrorState({
      action: "accept",
      error: {
        code: "PERMISSION_DENIED",
        message: "Недостаточно прав",
      },
      submission: submitted,
    });

    expect(submissionActionErrorForSubmission(error, submitted, "agent")).toBe(
      "Недостаточно прав",
    );
    expect(
      submissionActionErrorForSubmission(
        error,
        { ...submitted, status: "ready_for_export" },
        "agent",
      ),
    ).toBe("");
  });

  test("scoped action errors clear when the role can now perform the action", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const error = createSubmissionActionErrorState({
      action: "accept",
      error: {
        code: "PERMISSION_DENIED",
        message: "Недостаточно прав",
      },
      submission: submitted,
    });

    expect(submissionActionErrorForSubmission(error, submitted, "admin")).toBe("");
  });

  test("scoped action errors use stable codes instead of localized copy for applicability", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const error = createSubmissionActionErrorState({
      action: "accept",
      error: {
        code: "PERMISSION_DENIED",
        message: "Old permission copy",
      },
      submission: submitted,
    });

    expect(submissionActionErrorForSubmission(error, submitted, "agent")).toBe(
      "Old permission copy",
    );
  });

  test("keeps agent status view reachable without exposing a lifecycle transition", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );

    expect(getPrimaryAction(submitted, "agent", "agent")).toEqual({
      action: "open_history",
      label: "Смотреть статус",
    });
    expect(applySubmissionActionResult(submitted, "open_history", "agent")).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Недостаточно прав",
      },
    });
  });

  test("keeps workbook generation as a package-level action, not a submission mutation", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const accepted = applySubmissionAction(
      adminAcceptRequiredMediaForTest(submitted),
      "accept",
      "admin",
    );

    expect(accepted).toMatchObject({
      exportState: "ready",
      status: "ready_for_export",
    });
    expect(canPerformAction(accepted, "generate_export", "admin")).toEqual({
      ok: false,
      reason: "Формирование Excel выполняется только через пакет выгрузки",
    });
    expect(
      applySubmissionActionResult(accepted, "generate_export", "admin"),
    ).toEqual({
      ok: false,
      error: {
        code: "EXPORT_NOT_READY",
        message: "Формирование Excel выполняется только через пакет выгрузки",
      },
    });
  });

  test("uses the canonical transition helper for allowed and role-blocked moves", () => {
    const draft = {
      ...reviewReadySubmission(),
      status: "draft" as const,
    };

    const started = transitionSubmissionById([draft], {
      actorId: "agent-1",
      actorRole: "agent",
      nextStatus: "in_progress",
      note: "Агент начал заполнение",
      source: "agent",
      submissionId: draft.id,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data[0]?.status).toBe("in_progress");
    expect(started.data[0]?.history[0]).toMatchObject({
      actorId: "agent-1",
      fromStatus: "draft",
      note: "Агент начал заполнение",
      source: "agent",
      toStatus: "in_progress",
    });

    expect(
      transitionSubmissionById([draft], {
        actorRole: "agent",
        nextStatus: "ready_for_export",
        source: "agent",
        submissionId: draft.id,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Действие недоступно в текущем статусе",
      },
    });
  });

  test("canonical transition helper rejects direct review handoff without required work", () => {
    const incomplete = {
      ...reviewReadySubmission(),
      files: [],
      status: "in_progress" as const,
    };

    expect(
      transitionSubmissionById([incomplete], {
        actorRole: "agent",
        nextStatus: "submitted_for_review",
        source: "agent",
        submissionId: incomplete.id,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Есть незаполненные поля или недостающие файлы",
      },
    });
  });

  test("canonical transition helper requires prepared export approval snapshot", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );

    expect(
      transitionSubmissionById([submitted], {
        actorRole: "admin",
        nextStatus: "ready_for_export",
        source: "admin",
        submissionId: submitted.id,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Подтвердите обязательные файлы перед принятием",
      },
    });
  });

  test("empty progress denominators are not persisted as complete", () => {
    const malformed: Submission = {
      ...reviewReadySubmission(),
      applicants: [
        {
          ...(reviewReadySubmission().applicants[0] as Submission["applicants"][number]),
          sections: [],
        },
      ],
      files: [],
    };

    expect(calculateSubmissionProgress(malformed)).toEqual({
      files: 0,
      questionnaire: 0,
      total: 0,
    });
  });

  test("blocks approval when any open issue remains, not only blocker severity", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const withWarningIssue: Submission = {
      ...submitted,
      issues: [
        {
          id: "issue-warning-open",
          type: "field",
          target: {
            applicantId: submitted.applicants[0]?.id ?? "applicant-1",
            applicantName: submitted.applicants[0]?.fullName ?? "Applicant",
            field: "Маршрут поездки",
            section: "Анкета",
          },
          reason: "Нужно уточнить",
          comment: "Не хватает детали",
          severity: "warning",
          status: "open",
          createdBy: "admin",
          createdAt: "сейчас",
        },
      ],
    };

    expect(canPerformAction(withWarningIssue, "accept", "admin")).toEqual({
      ok: false,
      reason: "Есть незакрытые замечания",
    });
    expect(applySubmissionActionResult(withWarningIssue, "accept", "admin")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Есть незакрытые замечания",
      },
    });
  });

  test("replacement upload fixes the matching file issue and does not move status", () => {
    const returned: Submission = {
      ...reviewReadySubmission(),
      status: "returned",
      issues: [],
    };
    const targetFile = returned.files[0];
    if (!targetFile) throw new Error("Missing file fixture");
    const needsReplacement: Submission = {
      ...returned,
      files: returned.files.map((file) =>
        file.id === targetFile.id
          ? {
              ...file,
              status: "needs_replacement",
              storageBucket: "submission-media",
              storagePath: "old/path.jpg",
            }
          : file,
      ),
      issues: [
        {
          id: "issue-file-replacement",
          type: "file",
          target: {
            applicantId: targetFile.applicantId,
            applicantName:
              returned.applicants.find((item) => item.id === targetFile.applicantId)
                ?.fullName ?? "Applicant",
            fileType: targetFile.type,
            section: "Файлы",
          },
          reason: "Файл нужно заменить",
          comment: "Плохое качество",
          severity: "blocker",
          status: "open",
          createdBy: "admin",
          createdAt: "сейчас",
        },
      ],
    };

    const uploaded = uploadRequiredFile(needsReplacement, targetFile.id, {
      generatedFileName: "new-file.jpg",
      mimeType: "image/jpeg",
      originalFileName: "new-file.jpg",
      sizeBytes: 1234,
      storageAdapter: "supabase-private",
      storageBucket: "submission-media",
      storagePath: "new/path.jpg",
      uploadedAtIso: "2026-07-07T10:00:00.000Z",
    });

    expect(uploaded.status).toBe("returned");
    expect(uploaded.issues[0]?.status).toBe("fixed_by_agent");
    expect(uploaded.files.find((file) => file.id === targetFile.id)).toMatchObject({
      status: "uploaded",
      storagePath: "new/path.jpg",
      uploadStatus: "uploaded",
    });
    expect(uploaded.history[0]?.detail).toContain("old/path.jpg");
  });

  test("exported blocks upload and status changes", () => {
    const exported: Submission = {
      ...reviewReadySubmission(),
      exportState: "marked_exported",
      status: "exported",
    };
    const targetFile = exported.files[0];
    if (!targetFile) throw new Error("Missing file fixture");

    expect(uploadRequiredFile(exported, targetFile.id)).toBe(exported);
    expect(
      transitionSubmissionById([exported], {
        actorRole: "admin",
        nextStatus: "ready_for_export",
        source: "admin",
        submissionId: exported.id,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "EXPORTED_TERMINAL",
        message: "Exported is terminal for V-19.",
      },
    });
  });
});
