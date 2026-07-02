import { describe, expect, test } from "vitest";
import {
  CANONICAL_FRONTEND_MEDIA_TYPES,
  CANONICAL_STORAGE_MEDIA_TYPES,
  CANONICAL_SUBMISSION_STATUSES,
  canonicalRequiredMediaReadiness,
  isCanonicalSubmissionStatus,
  isExportedTerminal,
  isForbiddenIssueTransition,
  isForbiddenStatusTransition,
  isIssueTransitionAllowed,
  isStatusTransitionAllowed,
  normalizeLegacySubmissionStatus,
  toCanonicalStorageMediaType,
} from "../../../src/modules/submissions/domainContract";
import {
  applyActionToSubmissionListResult,
  completeQuestionnaire,
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../../src/modules/submissions/submissionActions";
import { applySubmissionAction } from "../../../src/modules/submissions/status";

describe("Package 1 canonical domain contract", () => {
  test("exports the exact canonical status list", () => {
    expect(CANONICAL_SUBMISSION_STATUSES).toEqual([
      "draft",
      "in_progress",
      "submitted_for_review",
      "returned",
      "corrections_received",
      "ready_for_export",
      "exported",
    ]);
  });

  test("normalizes known legacy statuses and fails closed for unknown status", () => {
    expect(isCanonicalSubmissionStatus("requires_action")).toBe(false);
    expect(isStatusTransitionAllowed("requires_action", "corrections_received")).toBe(
      false,
    );
    expect(normalizeLegacySubmissionStatus("requires_action")).toEqual({
      ok: true,
      data: "returned",
    });
    expect(normalizeLegacySubmissionStatus("filling")).toEqual({
      ok: true,
      data: "in_progress",
    });
    expect(normalizeLegacySubmissionStatus("ready_for_review")).toEqual({
      ok: true,
      data: "submitted_for_review",
    });
    expect(normalizeLegacySubmissionStatus("waiting_review")).toEqual({
      ok: true,
      data: "submitted_for_review",
    });
    expect(normalizeLegacySubmissionStatus("in_review")).toEqual({
      ok: true,
      data: "submitted_for_review",
    });
    expect(normalizeLegacySubmissionStatus("accepted")).toEqual({
      ok: true,
      data: "ready_for_export",
    });
    expect(normalizeLegacySubmissionStatus("ready_for_excel")).toEqual({
      ok: true,
      data: "ready_for_export",
    });
    expect(normalizeLegacySubmissionStatus("attention_required")).toEqual({
      ok: true,
      data: "returned",
    });
    expect(normalizeLegacySubmissionStatus("sent_to_appointment")).toEqual({
      ok: true,
      data: "ready_for_export",
    });
    expect(
      normalizeLegacySubmissionStatus("sent_to_appointment", {
        exportedAt: "2026-06-26T10:00:00.000Z",
      }),
    ).toEqual({ ok: true, data: "exported" });
    expect(
      normalizeLegacySubmissionStatus("appointment_scheduled", {
        exportedAt: "2026-06-26T10:00:00.000Z",
      }),
    ).toEqual({ ok: true, data: "exported" });
    expect(normalizeLegacySubmissionStatus("completed")).toEqual({
      ok: true,
      data: "ready_for_export",
    });
    expect(normalizeLegacySubmissionStatus("unknown")).toEqual({
      ok: false,
      reason: "Unknown submission status.",
    });
  });

  test("keeps canonical media exactly passport_scan, selfie, selfie_2", () => {
    expect(CANONICAL_FRONTEND_MEDIA_TYPES).toEqual([
      "passport_scan",
      "selfie",
      "selfie_2",
    ]);
    expect(CANONICAL_FRONTEND_MEDIA_TYPES).not.toContain("photo");
    expect(CANONICAL_FRONTEND_MEDIA_TYPES).not.toContain("photo_white");
    expect(CANONICAL_FRONTEND_MEDIA_TYPES).not.toContain("video");
  });

  test("rejects legacy photo, photo_white, and video media mappings", () => {
    expect(toCanonicalStorageMediaType("photo").ok).toBe(false);
    expect(toCanonicalStorageMediaType("photo_white").ok).toBe(false);
    expect(toCanonicalStorageMediaType("video").ok).toBe(false);
    expect(toCanonicalStorageMediaType("video")).not.toEqual({
      ok: true,
      data: "selfie_2",
    });
    expect(toCanonicalStorageMediaType("photo_white")).not.toEqual({
      ok: true,
      data: "photo",
    });
  });

  test("maps only canonical media to storage slots", () => {
    expect(CANONICAL_STORAGE_MEDIA_TYPES).toEqual({
      passport_scan: "passport_scan",
      selfie: "selfie",
      selfie_2: "selfie_2",
    });
  });

  test("enforces required media readiness without legacy media", () => {
    const ready = {
      applicants: [{ id: "app-1" }],
      files: [
        { applicantId: "app-1", status: "uploaded", type: "passport_scan" },
        { applicantId: "app-1", status: "uploaded", type: "selfie" },
        { applicantId: "app-1", status: "uploaded", type: "selfie_2" },
      ],
    };

    expect(canonicalRequiredMediaReadiness(ready)).toEqual({
      ok: true,
      data: true,
    });
    expect(
      canonicalRequiredMediaReadiness({
        ...ready,
        files: [...ready.files, { applicantId: "app-1", status: "uploaded", type: "photo" }],
      }).ok,
    ).toBe(false);
    expect(
      canonicalRequiredMediaReadiness({
        ...ready,
        files: [
          ...ready.files,
          { applicantId: "app-1", status: "uploaded", type: "photo_white" },
        ],
      }).ok,
    ).toBe(false);
    expect(
      canonicalRequiredMediaReadiness({
        ...ready,
        files: [...ready.files, { applicantId: "app-1", status: "uploaded", type: "video" }],
      }).ok,
    ).toBe(false);
    expect(
      canonicalRequiredMediaReadiness({
        applicants: ready.applicants,
        files: ready.files.filter((file) => file.type !== "selfie_2"),
      }).ok,
    ).toBe(false);
  });

  test("allows only open -> fixed_by_agent -> closed_by_admin issue lifecycle", () => {
    expect(isIssueTransitionAllowed(null, "open")).toBe(true);
    expect(isIssueTransitionAllowed("open", "fixed_by_agent")).toBe(true);
    expect(isIssueTransitionAllowed("fixed_by_agent", "closed_by_admin")).toBe(true);
    expect(isForbiddenIssueTransition("open", "closed_by_admin")).toBe(true);
    expect(isForbiddenIssueTransition("closed_by_admin", "open")).toBe(true);
  });

  test("keeps exported terminal and rejects forbidden status transitions", () => {
    expect(isExportedTerminal("exported")).toBe(true);
    expect(isStatusTransitionAllowed("exported", "ready_for_export")).toBe(false);
    expect(isForbiddenStatusTransition("draft", "submitted_for_review")).toBe(true);
    expect(isForbiddenStatusTransition("in_progress", "ready_for_export")).toBe(true);
    expect(isForbiddenStatusTransition("returned", "ready_for_export")).toBe(true);
    expect(isForbiddenStatusTransition("submitted_for_review", "exported")).toBe(true);
  });

  test("invalid command transition does not mutate list state", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    const inProgress = applySubmissionAction(
      uploadRequiredFiles(completeQuestionnaire(draft)),
      "save_progress",
      "agent",
    );
    const submissions = [inProgress];

    const result = applyActionToSubmissionListResult(
      submissions,
      inProgress.id,
      "accept",
      "agent",
    );

    expect(result.ok).toBe(false);
    expect(submissions[0]).toBe(inProgress);
    expect(submissions[0]?.status).toBe("in_progress");
  });
});
