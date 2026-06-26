import { describe, expect, test } from "vitest";
import {
  applySubmissionAction,
  applySubmissionActionResult,
  canPerformAction,
  getPrimaryAction,
} from "../../src/modules/submissions/status";
import {
  createSubmissionActionErrorState,
  submissionActionErrorForSubmission,
} from "../../src/modules/submissions/submissionActionErrors";
import {
  applyActionToSubmissionListResult,
  completeQuestionnaire,
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

function reviewReadySubmission(): Submission {
  const draft = createDraftSubmission({
    applicantNames: ["Мария Иванова"],
    city: "Москва",
    familyCount: 1,
    idScheme: "supabase",
    submissions: [],
    type: "single",
  });

  return {
    ...uploadRequiredFiles(completeQuestionnaire(draft)),
    status: "in_progress",
  };
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
        file.type === "photo"
          ? {
              ...file,
              originalFileName: "fresh-photo.jpg",
              storagePath: "fresh/photo.jpg",
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
        originalFileName: "fresh-photo.jpg",
        status: "pending_review",
        storagePath: "fresh/photo.jpg",
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
    const accepted = applySubmissionAction(submitted, "accept", "admin");

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
});
