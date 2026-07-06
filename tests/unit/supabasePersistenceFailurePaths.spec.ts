import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Submission } from "../../src/types/domain";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | Record<string, unknown>,
}));
const supabaseConfigMock = vi.hoisted(() => ({
  activationTarget: "sandbox" as "sandbox" | "production",
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));
vi.mock("../../src/lib/supabase/config", () => ({
  supabaseRuntimeConfig: {
    evidence: {
      get target() {
        return supabaseConfigMock.activationTarget;
      },
    },
  },
}));

import {
  signInSupabaseWithPassword,
} from "../../src/services/authService";
import { saveSubmissionDraft } from "../../src/services/submissionService";
import {
  buildMediaStoragePath,
  deleteMediaFromStorage,
  downloadMediaFromStorage,
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
  beforeEach(() => {
    supabaseMock.client = null;
    supabaseConfigMock.activationTarget = "sandbox";
  });

  test("does not overwrite an existing Storage object during media upload", async () => {
    const upload = vi.fn(async () => ({
      data: {
        path: "submissions/VF-1044/applicants/applicant-1/selfie/751234567_selfie.jpg",
      },
      error: null,
    }));
    supabaseMock.client = {
      storage: {
        from: () => ({
          upload,
        }),
      },
    };
    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "selfie",
      "751234567_selfie.jpg",
    );
    const file = new File(["x"], "selfie.jpg", { type: "image/jpeg" });

    await expect(uploadMediaToStorage(target, file)).resolves.toEqual({
      path: target.path,
    });
    expect(upload).toHaveBeenCalledWith(target.path, file, {
      contentType: "image/jpeg",
      upsert: false,
    });
  });

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
      "selfie",
      "751234567_selfie.jpg",
    );

    await expect(
      uploadMediaToStorage(
        target,
        new File(["x"], "selfie.jpg", { type: "image/jpeg" }),
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

  test("wraps Storage cleanup failures with safe diagnostics", async () => {
    supabaseMock.client = {
      storage: {
        from: () => ({
          remove: async () => ({
            data: null,
            error: {
              name: "StorageApiError",
              code: "S3Error",
              statusCode: 500,
              message: "remove backend stack trace",
            },
          }),
        }),
      },
    };

    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "selfie",
      "751234567_selfie.jpg",
    );

    await expect(deleteMediaFromStorage(target)).rejects.toMatchObject({
      diagnostics: {
        operation: "storage.delete_media",
        kind: "storage",
        safeCode: "storage.delete_media:storage:S3Error",
        retryable: true,
      },
      userMessage: "Supabase storage could not complete the file action.",
    });
  });

  test("wraps Storage download failures with safe diagnostics", async () => {
    supabaseMock.client = {
      storage: {
        from: () => ({
          download: async () => ({
            data: null,
            error: {
              name: "StorageApiError",
              code: "S3Error",
              statusCode: 500,
              message: "download backend stack trace",
            },
          }),
        }),
      },
    };

    const target = buildMediaStoragePath(
      "VF-1044",
      "applicant-1",
      "selfie",
      "751234567_selfie.jpg",
    );

    await expect(downloadMediaFromStorage(target)).rejects.toMatchObject({
      diagnostics: {
        operation: "storage.download_media",
        kind: "storage",
        safeCode: "storage.download_media:storage:S3Error",
        retryable: true,
      },
      userMessage: "Supabase storage could not complete the file action.",
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

  test("retries transient Auth sign-in network failures once", async () => {
    const userId = "00000000-0000-4000-8000-000000000777";
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({
        data: { session: null },
        error: {
          name: "AuthRetryableFetchError",
          message: "Failed to fetch",
        },
      })
      .mockResolvedValueOnce({
        data: {
          session: {
            user: {
              id: userId,
              email: "retry-agent@example.com",
            },
          },
        },
        error: null,
      });
    supabaseMock.client = {
      auth: { signInWithPassword },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: userId,
                    email: "retry-agent@example.com",
                    display_name: "Retry Agent",
                    organization_name: "Retry Agency",
                    role: "agent",
                    created_at: "2026-07-05T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    await expect(
      signInSupabaseWithPassword("retry-agent@example.com", "secret-password"),
    ).resolves.toMatchObject({
      mode: "supabase",
      profile: {
        email: "retry-agent@example.com",
        role: "agent",
      },
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
  });

  test("does not auto-create a missing Supabase profile during sign-in", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: {
        session: {
          user: {
            id: "00000000-0000-4000-8000-000000000321",
            email: "confirmed-agent@example.com",
            user_metadata: {
              display_name: "Confirmed Agent",
              organization_name: "Confirmed Agency",
            },
          },
        },
      },
      error: null,
    }));
    const upsert = vi.fn();
    const signOut = vi.fn(async () => ({ error: null }));
    supabaseMock.client = {
      auth: { signInWithPassword, signOut },
      from: (table: string) => {
        if (table === "access_requests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          upsert,
        };
      },
    };

    await expect(
      signInSupabaseWithPassword("confirmed-agent@example.com", "secret-password"),
    ).rejects.toThrow(
      "Production profile repair requires owner-approved role assignment.",
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test("shows pending access request instead of repairing profile", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: {
        session: {
          user: {
            id: "00000000-0000-4000-8000-000000000322",
            email: "pending-agent@example.com",
            user_metadata: {
              display_name: "Pending Agent",
              organization_name: "Pending Agency",
            },
          },
        },
      },
      error: null,
    }));
    const upsert = vi.fn();
    const signOut = vi.fn(async () => ({ error: null }));
    supabaseMock.client = {
      auth: { signInWithPassword, signOut },
      from: (table: string) => {
        if (table === "access_requests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        status: "pending",
                        rejection_reason: null,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          upsert,
        };
      },
    };

    await expect(
      signInSupabaseWithPassword("pending-agent@example.com", "secret-password"),
    ).rejects.toThrow(
      "Заявка отправлена. Доступ появится после подтверждения администратором.",
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test("clears rejected access request auth session after successful Supabase sign-in", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: {
        session: {
          user: {
            id: "00000000-0000-4000-8000-000000000323",
            email: "rejected-agent@example.com",
            user_metadata: {
              display_name: "Rejected Agent",
              organization_name: "Rejected Agency",
            },
          },
        },
      },
      error: null,
    }));
    const upsert = vi.fn();
    const signOut = vi.fn(async () => ({ error: null }));
    supabaseMock.client = {
      auth: { signInWithPassword, signOut },
      from: (table: string) => {
        if (table === "access_requests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        status: "rejected",
                        rejection_reason: "Нет договора",
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          upsert,
        };
      },
    };

    await expect(
      signInSupabaseWithPassword("rejected-agent@example.com", "secret-password"),
    ).rejects.toThrow("Заявка отклонена: Нет договора");
    expect(upsert).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test("does not auto-create a missing profile during production sign-in", async () => {
    supabaseConfigMock.activationTarget = "production";
    const signInWithPassword = vi.fn(async () => ({
      data: {
        session: {
          user: {
            id: "00000000-0000-4000-8000-000000000654",
            email: "orphan-agent@example.com",
            user_metadata: {
              display_name: "Orphan Agent",
            },
          },
        },
      },
      error: null,
    }));
    const upsert = vi.fn();
    const signOut = vi.fn(async () => ({ error: null }));
    supabaseMock.client = {
      auth: { signInWithPassword, signOut },
      from: (table: string) => {
        if (table === "access_requests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          upsert,
        };
      },
    };

    await expect(
      signInSupabaseWithPassword("orphan-agent@example.com", "secret-password"),
    ).rejects.toThrow(
      "Production profile repair requires owner-approved role assignment.",
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

});
