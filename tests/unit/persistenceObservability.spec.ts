import { describe, expect, test } from "vitest";
import {
  formatPersistenceFailureForUser,
  isDefinitivePersistenceRejection,
  mapSupabasePersistenceError,
  PersistenceObservableError,
} from "../../src/services/persistenceObservability";

describe("Supabase persistence observability", () => {
  test("distinguishes terminal database rejection from ambiguous transport failure", () => {
    const rejected = mapSupabasePersistenceError(
      { code: "40001", message: "stale revision", status: 400 },
      {
        operation: "rpc.save_agent_submission_if_current",
        fallbackKind: "save",
      },
    );
    const ambiguous = mapSupabasePersistenceError(
      new TypeError("Failed to fetch"),
      {
        operation: "rpc.save_agent_submission_if_current",
        fallbackKind: "save",
      },
    );
    const statementUnknown = mapSupabasePersistenceError(
      { code: "40003", message: "statement completion unknown", status: 500 },
      {
        operation: "rpc.save_agent_submission_if_current",
        fallbackKind: "save",
      },
    );
    const connectionFailure = mapSupabasePersistenceError(
      { code: "08006", message: "connection failure", status: 500 },
      {
        operation: "rpc.save_agent_submission_if_current",
        fallbackKind: "save",
      },
    );

    expect(isDefinitivePersistenceRejection(rejected)).toBe(true);
    expect(isDefinitivePersistenceRejection(ambiguous)).toBe(false);
    expect(isDefinitivePersistenceRejection(statementUnknown)).toBe(false);
    expect(isDefinitivePersistenceRejection(connectionFailure)).toBe(false);
  });

  test("maps RPC RLS denial to safe diagnostics and user copy", () => {
    const error = mapSupabasePersistenceError(
      {
        name: "PostgrestError",
        code: "42501",
        status: 403,
        message:
          "new row violates row-level security policy for table submissions with internal details",
        details: "private SQL predicate",
        hint: "internal policy name",
      },
      {
        operation: "rpc.save_submission_draft",
        fallbackKind: "save",
      },
    );

    expect(error).toBeInstanceOf(PersistenceObservableError);
    expect(error.diagnostics).toEqual({
      operation: "rpc.save_submission_draft",
      kind: "rls",
      safeCode: "rpc.save_submission_draft:rls:42501",
      retryable: false,
      httpStatus: 403,
      supabaseCode: "42501",
      sourceName: "PostgrestError",
    });

    const message = formatPersistenceFailureForUser(error, "fallback");
    expect(message).toContain("Access was denied by Supabase policy.");
    expect(message).toContain("Reference: rpc.save_submission_draft:rls:42501.");
    expect(message).not.toContain("private SQL predicate");
    expect(message).not.toContain("internal policy name");
  });

  test("maps Storage upload failures without exposing raw provider text", () => {
    const error = mapSupabasePersistenceError(
      {
        name: "StorageApiError",
        code: "S3Error",
        statusCode: 500,
        message: "bucket backend stack trace: token=secret",
      },
      {
        operation: "storage.upload_media",
        fallbackKind: "upload",
      },
    );

    expect(error.diagnostics).toMatchObject({
      operation: "storage.upload_media",
      kind: "upload",
      safeCode: "storage.upload_media:upload:S3Error",
      retryable: true,
      httpStatus: 500,
      supabaseCode: "S3Error",
    });
    expect(formatPersistenceFailureForUser(error, "fallback")).toBe(
      "Media upload failed. No uploaded file was marked complete. Reference: storage.upload_media:upload:S3Error.",
    );
  });

  test("maps Auth failures to credential-safe copy", () => {
    const error = mapSupabasePersistenceError(
      {
        name: "AuthApiError",
        status: 400,
        message: "Invalid login credentials for user@example.com",
      },
      {
        operation: "auth.sign_in_password",
        fallbackKind: "auth",
      },
    );

    expect(error.diagnostics).toMatchObject({
      operation: "auth.sign_in_password",
      kind: "auth",
      safeCode: "auth.sign_in_password:auth:HTTP_400",
      retryable: false,
      httpStatus: 400,
    });
    expect(formatPersistenceFailureForUser(error, "fallback")).toBe(
      "Unable to sign in. Check email, password, and Supabase profile. Reference: auth.sign_in_password:auth:HTTP_400.",
    );
  });

  test("maps transient Auth network failures as retryable", () => {
    const error = mapSupabasePersistenceError(
      {
        name: "AuthRetryableFetchError",
        message: "Failed to fetch",
      },
      {
        operation: "auth.sign_in_password",
        fallbackKind: "auth",
      },
    );

    expect(error.diagnostics).toMatchObject({
      operation: "auth.sign_in_password",
      kind: "auth",
      safeCode: "auth.sign_in_password:auth:NETWORK",
      retryable: true,
      sourceName: "AuthRetryableFetchError",
    });
    expect(formatPersistenceFailureForUser(error, "fallback")).toBe(
      "Unable to sign in. Check email, password, and Supabase profile. Reference: auth.sign_in_password:auth:NETWORK.",
    );
  });
});
