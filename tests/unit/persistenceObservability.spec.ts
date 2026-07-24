import { describe, expect, test } from "vitest";
import {
  formatPersistenceFailureForUser,
  mapSupabasePersistenceError,
  PersistenceObservableError,
} from "../../src/services/persistenceObservability";

describe("Supabase persistence observability", () => {
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
    expect(message).toBe(
      "Недостаточно прав для этого действия. Обратитесь к администратору.",
    );
    expect(message).not.toContain("42501");
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
      "Не удалось загрузить файл. Он не был отмечен как загруженный.",
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
      "Не удалось войти. Проверьте email и пароль.",
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
      "Не удалось войти. Проверьте email и пароль.",
    );
  });
});
