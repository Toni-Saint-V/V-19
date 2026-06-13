import { describe, expect, test, vi } from "vitest";
import type { Submission } from "../../src/types/domain";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | Record<string, unknown>,
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

import { signInSupabaseWithPassword } from "../../src/services/authService";
import { saveSubmissionDraft } from "../../src/services/submissionService";
import {
  buildMediaStoragePath,
  uploadMediaToStorage,
} from "../../src/services/storageService";

function makeSubmission(): Submission {
  return {
    id: "VF-1044",
    title: "Ivan Petrov",
    type: "single",
    agentId: "00000000-0000-4000-8000-000000000001",
    agentName: "Nord Travel",
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: "2026-06-12T10:00:00.000Z",
    status: "draft",
    appointment: "not_started",
    priority: "Средний",
    fields: 0,
    media: 0,
    mediaRequired: 0,
    applicants: [
      {
        id: "applicant-1",
        name: "Ivan Petrov",
        role: "Заявитель",
        passport: "75 1234567",
        form: 100,
        media: 0,
        mediaRequired: 0,
        country: "Spain",
        city: "Madrid",
        tripDates: "2026-08-20",
      },
    ],
    mediaRows: [],
    notes: [],
  };
}

describe("Supabase persistence failure paths", () => {
  test("wraps Storage upload failures with safe diagnostics", async () => {
    supabaseMock.client = {
      storage: {
        from: () => ({
          upload: async () => ({
            data: null,
            error: {
              name: "StorageApiError",
              code: "S3Error",
              statusCode: 500,
              message: "storage backend stack trace",
            },
          }),
        }),
      },
    };

    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "photo_white",
      "751234567_photo_white.jpg",
    );

    await expect(
      uploadMediaToStorage(
        target,
        new File(["x"], "photo.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toMatchObject({
      diagnostics: {
        operation: "storage.upload_media",
        kind: "upload",
        safeCode: "storage.upload_media:upload:S3Error",
        retryable: true,
      },
      userMessage: "Media upload failed. No uploaded file was marked complete.",
    });
  });

  test("wraps RPC save RLS failures before they reach UI", async () => {
    const rpc = vi.fn(async () => ({
      error: {
        name: "PostgrestError",
        code: "42501",
        status: 403,
        message: "new row violates row-level security policy",
      },
    }));
    supabaseMock.client = { rpc };

    await expect(
      saveSubmissionDraft(makeSubmission(), {
        actorId: "00000000-0000-4000-8000-000000000001",
        role: "agent",
      }),
    ).rejects.toMatchObject({
      diagnostics: {
        operation: "rpc.save_submission_draft",
        kind: "rls",
        safeCode: "rpc.save_submission_draft:rls:42501",
        retryable: false,
      },
      userMessage:
        "Access was denied by Supabase policy. Ask an operator to confirm access.",
    });
    expect(rpc).toHaveBeenCalledWith("save_submission_draft", {
      payload: expect.any(Object),
    });
  });

  test("wraps Auth sign-in failures with safe user copy", async () => {
    supabaseMock.client = {
      auth: {
        signInWithPassword: async () => ({
          data: { session: null },
          error: {
            name: "AuthApiError",
            status: 400,
            message: "Invalid login credentials for user@example.com",
          },
        }),
      },
    };

    await expect(
      signInSupabaseWithPassword("user@example.com", "secret-password"),
    ).rejects.toMatchObject({
      diagnostics: {
        operation: "auth.sign_in_password",
        kind: "auth",
        safeCode: "auth.sign_in_password:auth:HTTP_400",
        retryable: false,
      },
      userMessage: "Unable to sign in. Check email, password, and Supabase profile.",
    });
  });
});
