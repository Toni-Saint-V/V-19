import { describe, expect, test } from "vitest";
import {
  PRODUCTION_COHORT_APP_ORIGIN,
  assertProductionNetworkRecordsHealthy,
  isPermittedCohortStaticRuntimeRequest,
} from "../e2e-supabase-ui/production-cohort-helpers";
import {
  assertProductionLifecycleMutationAudit,
  createProductionMutationDiagnosticError,
  createProductionResponseDiagnosticError,
  evidenceDigest,
  runWithFailurePreservingCleanup,
} from "../e2e-supabase-ui/production-lifecycle-helpers";

describe("production cohort runtime asset allowlist", () => {
  test.each([
    "/tesseract/worker.min.js",
    "/tesseract/core/tesseract-core-simd.wasm",
    "/tesseract/core/tesseract-core-simd.wasm.js",
    "/tesseract/lang/eng.traineddata.gz",
  ])("allows the exact read-only OCR runtime surface: %s", (path) => {
    expect(
      isPermittedCohortStaticRuntimeRequest(
        new URL(path, PRODUCTION_COHORT_APP_ORIGIN),
        "GET",
      ),
    ).toBe(true);
  });

  test.each([
    ["GET", "/tesseract/core/config.json"],
    ["GET", "/tesseract/lang/other.traineddata.gz"],
    ["GET", "/tesseract/core/nested/runtime.wasm"],
    ["POST", "/tesseract/worker.min.js"],
    ["GET", "/api/submissions"],
  ])("rejects non-runtime request %s %s", (method, path) => {
    expect(
      isPermittedCohortStaticRuntimeRequest(
        new URL(path, PRODUCTION_COHORT_APP_ORIGIN),
        method,
      ),
    ).toBe(false);
  });

  test("rejects the same path on another origin", () => {
    expect(
      isPermittedCohortStaticRuntimeRequest(
        new URL("http://127.0.0.1:4203/tesseract/worker.min.js"),
        "GET",
      ),
    ).toBe(false);
  });
});

describe("production lifecycle mutation audit", () => {
  test("redacts raw production failure and alert text from recursive error serialization", () => {
    const sentinel = "PII_SENTINEL_SUBMISSION_AND_APPLICANT_4815162342";
    const error = createProductionMutationDiagnosticError({
      alertTexts: [`Visible alert ${sentinel}`],
      gateMessage: `Gate failure ${sentinel}`,
      label: "add lifecycle issue",
      operationMessage: `Operation failure ${sentinel}`,
      phase: "response",
      remarkFormVisible: false,
    });
    const recursiveSerialization = JSON.stringify({
      cause: (error as Error & { cause?: unknown }).cause,
      message: error.message,
      ownProperties: Object.fromEntries(
        Object.getOwnPropertyNames(error).map((name) => [
          name,
          String((error as unknown as Record<string, unknown>)[name]),
        ]),
      ),
      stack: error.stack,
    });

    expect(recursiveSerialization).not.toContain(sentinel);
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(error.message).toContain(evidenceDigest(`Visible alert ${sentinel}`));
    expect(error.message).toContain(evidenceDigest(`Operation failure ${sentinel}`));
    expect(error.message).toContain(evidenceDigest(`Gate failure ${sentinel}`));
  });

  test("preserves the sanitized operation failure when cleanup also fails", async () => {
    const primaryFailure = createProductionMutationDiagnosticError({
      alertTexts: [],
      gateMessage: "gate failure",
      label: "add lifecycle issue",
      operationMessage: "operation failure",
      phase: "action",
      remarkFormVisible: true,
    });

    await expect(
      runWithFailurePreservingCleanup(
        async () => {
          throw primaryFailure;
        },
        async () => {
          throw new Error("context.close cleanup failure");
        },
      ),
    ).rejects.toBe(primaryFailure);
  });

  test("still surfaces cleanup failure after a successful operation", async () => {
    const cleanupFailure = new Error("session audit cleanup failure");

    await expect(
      runWithFailurePreservingCleanup(
        async () => "operation completed",
        async () => {
          throw cleanupFailure;
        },
      ),
    ).rejects.toBe(cleanupFailure);
  });

  test("records non-2xx status and body digest without serializing response PII", () => {
    const sentinel = "PII_SENTINEL_DATABASE_RESPONSE_8675309";
    const error = createProductionResponseDiagnosticError({
      label: "add lifecycle issue",
      responseBody: `Database response ${sentinel}`,
      status: 400,
    });

    expect(error.message).toContain("status=400");
    expect(error.message).toContain(evidenceDigest(`Database response ${sentinel}`));
    expect(JSON.stringify({ message: error.message, stack: error.stack })).not.toContain(
      sentinel,
    );
  });

  test("accepts a bounded auth transport retry that recovers", () => {
    expect(() =>
      assertProductionLifecycleMutationAudit(
        [
          { count: 2, method: "POST", path: "/auth/v1/token", status: 0 },
          { count: 1, method: "POST", path: "/auth/v1/token", status: 200 },
          {
            count: 1,
            method: "POST",
            path: "/rest/v1/rpc/add_submission_issue",
            status: 200,
          },
        ],
        3,
      ),
    ).not.toThrow();
  });

  test("rejects an auth transport failure that never recovers", () => {
    expect(() =>
      assertProductionLifecycleMutationAudit(
        [{ count: 3, method: "POST", path: "/auth/v1/token", status: 0 }],
        3,
      ),
    ).toThrow(/did not recover/);
  });

  test("rejects a non-retryable auth HTTP failure", () => {
    expect(() =>
      assertProductionLifecycleMutationAudit(
        [
          { count: 1, method: "POST", path: "/auth/v1/token", status: 503 },
          { count: 1, method: "POST", path: "/auth/v1/token", status: 200 },
        ],
        2,
      ),
    ).toThrow(/non-retryable HTTP failure/);
  });

  test("rejects auth attempts beyond the bounded retry contract", () => {
    expect(() =>
      assertProductionLifecycleMutationAudit(
        [
          { count: 3, method: "POST", path: "/auth/v1/token", status: 0 },
          { count: 1, method: "POST", path: "/auth/v1/token", status: 200 },
        ],
        4,
      ),
    ).toThrow(/bounded retry contract/);
  });

  test("rejects any failed business mutation after recovered auth", () => {
    expect(() =>
      assertProductionLifecycleMutationAudit(
        [
          { count: 1, method: "POST", path: "/auth/v1/token", status: 0 },
          { count: 1, method: "POST", path: "/auth/v1/token", status: 200 },
          {
            count: 1,
            method: "POST",
            path: "/rest/v1/rpc/add_submission_issue",
            status: 0,
          },
        ],
        2,
      ),
    ).toThrow(/business mutation failed/);
  });
});

describe("production cohort network health", () => {
  test("accepts a recovered bounded password-auth transport retry", () => {
    expect(() =>
      assertProductionNetworkRecordsHealthy(
        [
          { method: "POST", path: "/auth/v1/token", status: 0 },
          { method: "POST", path: "/auth/v1/token", status: 200 },
        ],
        "login",
      ),
    ).not.toThrow();
  });

  test("rejects a password-auth retry that never recovers", () => {
    expect(() =>
      assertProductionNetworkRecordsHealthy(
        [{ method: "POST", path: "/auth/v1/token", status: 0 }],
        "login",
      ),
    ).toThrow(/did not recover/);
  });

  test("rejects a failed business mutation after recovered auth", () => {
    expect(() =>
      assertProductionNetworkRecordsHealthy(
        [
          { method: "POST", path: "/auth/v1/token", status: 200 },
          { method: "POST", path: "/rest/v1/rpc/save_submission_draft", status: 0 },
        ],
        "save",
      ),
    ).toThrow(/production mutation failed/);
  });
});
