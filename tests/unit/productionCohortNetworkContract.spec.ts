import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import {
  PRODUCTION_COHORT_APP_ORIGIN,
  assertProductionNetworkRecordsHealthy,
  isPermittedCohortStaticRuntimeRequest,
} from "../e2e-supabase-ui/production-cohort-helpers";
import {
  StrictProductionA1S1ExportNetworkGate,
  productionA1S1ExportDigest,
  productionA1S1ExportPayloadMatches,
} from "../e2e-supabase-ui/production-export-a1-s1-helpers";
import {
  acquireProductionCohortMutationLock,
  assertProductionLifecycleMutationAudit,
  createProductionMutationDiagnosticError,
  createProductionResponseDiagnosticError,
  evidenceDigest,
  productionDraftValueDigest,
  productionLifecycleMutationPayloadMatches,
  runWithFailurePreservingCleanup,
} from "../e2e-supabase-ui/production-lifecycle-helpers";

function requiredDigest(value: unknown) {
  const digest = productionDraftValueDigest(value);
  if (!digest) throw new Error("Unit fixture value must be digestible.");
  return digest;
}

function draftFixture(input: {
  correctionStatus: "closed" | "fixed" | "open";
  ownerId: string;
  snapshotStatus:
    | "corrections_received"
    | "ready_for_export"
    | "returned"
    | "submitted_for_review";
  submissionId: string;
}) {
  const applicantId = "applicant-a2-s1";
  const correctionReason = "Требуется исправить поле «Примечание» — RUN A2-S1: correct the note";
  const media = {
    applicant_id: applicantId,
    id: "media-a2-s1-passport",
    storage_bucket: "submission-media",
    storage_path: `${input.submissionId}/${applicantId}/passport_scan/asset`,
    submission_id: input.submissionId,
    type: "passport_scan",
  };
  const answer = {
    applicant_id: applicantId,
    field_id: "field-1",
    label: "Примечание",
    section_id: "section-1",
    submission_id: input.submissionId,
    value: "answer",
  };
  const correction = {
    applicant_id: applicantId,
    field_key: "Примечание",
    fixed_at:
      input.correctionStatus === "open" ? null : "2026-07-14T12:00:00.000Z",
    id: "correction-a2-s1",
    media_type: null,
    reason: correctionReason,
    scope: "field",
    severity: "blocking",
    status: input.correctionStatus,
    submission_id: input.submissionId,
  };
  const snapshotIssueStatus =
    input.correctionStatus === "open"
      ? "open"
      : input.correctionStatus === "fixed"
        ? "fixed_by_agent"
        : "closed_by_admin";
  const payload = {
    applicants: [{ id: applicantId, submission_id: input.submissionId }],
    corrections: [correction],
    media_assets: [media],
    questionnaire_answers: [answer],
    status_history: [],
    submission: {
      agent_id: input.ownerId,
      family_intelligence: {
        status: "unreviewed",
        v19CockpitSnapshot: {
          submission: {
            agentId: input.ownerId,
            applicants: [
              {
                id: applicantId,
                sections: [{ fields: [{ id: answer.field_id }], id: answer.section_id }],
              },
            ],
            files: [
              {
                applicantId,
                storageBucket: media.storage_bucket,
                storagePath: media.storage_path,
                type: "passport_scan",
              },
            ],
            history: [],
            id: input.submissionId,
            issues: [
              {
                comment: "RUN A2-S1: correct the note",
                reason: "Требуется исправить поле «Примечание»",
                severity: "blocker",
                status: snapshotIssueStatus,
                target: { applicantId, field: "Примечание" },
                type: "field",
              },
            ],
            status: input.snapshotStatus,
          },
          version: 1,
        },
      },
      id: input.submissionId,
    },
  };
  return {
    payload,
    draft: {
      applicants: [{ id: applicantId, submissionId: input.submissionId }],
      corrections: [
        {
          applicantId,
          fieldKey: correction.field_key,
          id: correction.id,
          mediaType: correction.media_type,
          reasonDigest: requiredDigest(correction.reason),
          scope: correction.scope,
          severity: correction.severity,
          status: correction.status,
          submissionId: input.submissionId,
          targetMarker: true,
        },
      ],
      mediaAssets: [
        {
          applicantId,
          id: media.id,
          storageBucket: media.storage_bucket,
          storagePathDigest: requiredDigest(media.storage_path),
          submissionId: input.submissionId,
          type: media.type,
        },
      ],
      questionnaireAnswers: [
        {
          applicantId,
          fieldId: answer.field_id,
          labelDigest: requiredDigest(answer.label),
          sectionId: answer.section_id,
          submissionId: input.submissionId,
          valueDigest: requiredDigest(answer.value),
        },
      ],
      snapshotHistoryCount: 0,
      snapshotIssueCount: 1,
      statusHistory: [],
    },
  };
}

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
  test("allows only the exact selected submission and lifecycle payload", () => {
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId: "owner-a2-s1",
      snapshotStatus: "returned",
      submissionId: "submission-a2-s1",
    });
    const contract = {
      correction: {
        mode: "existing" as const,
        reasonIncludes: "RUN A2-S1",
        status: "open" as const,
      },
      draft: fixture.draft,
      history: {
        actorId: "owner-a2-s1",
        actorSource: "agent" as const,
        snapshotStatus: "returned" as const,
      },
      ownerId: "owner-a2-s1",
      submissionId: "submission-a2-s1",
      submissionStatus: "returned" as const,
    };
    const payload = {
      payload: {
        ...fixture.payload,
        submission: {
          ...fixture.payload.submission,
          status: "returned",
        },
      },
    };

    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(payload), contract),
    ).toBe(true);
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify({
          ...payload,
          payload: {
          ...payload.payload,
            submission: {
              ...payload.payload.submission,
              id: "other-submission",
              status: "returned",
            },
          },
        }),
        contract,
      ),
    ).toBe(false);
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify({
          ...payload,
          payload: {
            ...payload.payload,
            applicants: [],
          },
        }),
        contract,
      ),
    ).toBe(false);
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify({
          ...payload,
          payload: {
            ...payload.payload,
            submission: {
              ...payload.payload.submission,
              agent_id: "other-owner",
              status: "returned",
            },
          },
        }),
        contract,
      ),
    ).toBe(false);
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify({
          ...payload,
          payload: {
            ...payload.payload,
            corrections: [
              {
                ...payload.payload.corrections[0],
                fixed_at: "2026-07-14T12:00:00.000Z",
                status: "fixed",
              },
            ],
          },
        }),
        contract,
      ),
    ).toBe(false);
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify({
          ...payload,
          payload: {
            ...payload.payload,
            questionnaire_answers: [],
          },
        }),
        contract,
      ),
    ).toBe(false);
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify({
          ...payload,
          payload: {
            ...payload.payload,
            submission: {
              ...payload.payload.submission,
              family_intelligence: {
                ...payload.payload.submission.family_intelligence,
                v19CockpitSnapshot: {
                  ...payload.payload.submission.family_intelligence.v19CockpitSnapshot,
                  submission: {
                    ...payload.payload.submission.family_intelligence.v19CockpitSnapshot
                      .submission,
                    agentId: "other-owner",
                  },
                },
              },
            },
          },
        }),
        contract,
      ),
    ).toBe(false);
  });

  test("uses one atomic lock across lifecycle and export lanes", async () => {
    const runMarker = `unit-${randomUUID()}`;
    const results = await Promise.allSettled([
      acquireProductionCohortMutationLock(runMarker, "lifecycle"),
      acquireProductionCohortMutationLock(runMarker, "export"),
    ]);
    const acquired = results.filter(
      (result): result is PromiseFulfilledResult<() => Promise<void>> =>
        result.status === "fulfilled",
    );

    expect(acquired).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await acquired[0]!.value();
  });

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

  test("accepts the six-attempt production auth ceiling with one successful response", () => {
    expect(() =>
      assertProductionLifecycleMutationAudit(
        [
          { count: 5, method: "POST", path: "/auth/v1/token", status: 0 },
          { count: 1, method: "POST", path: "/auth/v1/token", status: 200 },
        ],
        6,
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
          { count: 6, method: "POST", path: "/auth/v1/token", status: 0 },
          { count: 1, method: "POST", path: "/auth/v1/token", status: 200 },
        ],
        7,
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

describe("production A2-S1 export artifact contract", () => {
  const exportFixture = draftFixture({
    correctionStatus: "closed",
    ownerId: "owner-a2-s1",
    snapshotStatus: "ready_for_export",
    submissionId: "submission-a2-s1",
  });
  const networkContract = {
    adminId: "admin-a2-s1",
    draft: exportFixture.draft,
    documentAssetIds: ["document-1", "document-2", "document-3"],
    ownerId: "owner-a2-s1",
    preCommitStatus: "ready_for_excel" as const,
    submissionId: "submission-a2-s1",
  };
  const packageIdentity = {
    contentFingerprint: "PII_SENTINEL_CONTENT_FINGERPRINT_4815162342",
    fileName: "visaflow-export-abc1234.xlsx",
    idempotencyKey: "abc1234",
    zipFileName: "visaflow-export-abc1234_documents.zip",
  };
  const artifactContract = {
    contentFingerprintDigest: productionA1S1ExportDigest(
      packageIdentity.contentFingerprint,
    ),
    idempotencyKeyDigest: productionA1S1ExportDigest(packageIdentity.idempotencyKey),
    workbookFileNameDigest: productionA1S1ExportDigest(packageIdentity.fileName),
    zipFileNameDigest: productionA1S1ExportDigest(packageIdentity.zipFileName),
  };

  const draftPayload = {
    payload: {
      ...exportFixture.payload,
      submission: {
        ...exportFixture.payload.submission,
        exported_at: null,
        family_intelligence: {
          ...exportFixture.payload.submission.family_intelligence,
          v19CockpitSnapshot: {
            ...exportFixture.payload.submission.family_intelligence.v19CockpitSnapshot,
            submission: {
              ...exportFixture.payload.submission.family_intelligence.v19CockpitSnapshot
                .submission,
              exportPackage: {
                contentFingerprint: packageIdentity.contentFingerprint,
                fileName: packageIdentity.fileName,
                format: "xlsx",
                idempotencyKey: packageIdentity.idempotencyKey,
                rowCount: 1,
                submissionIds: [networkContract.submissionId],
              },
            },
          },
        },
        status: networkContract.preCommitStatus,
      },
    },
  };

  const terminalPayload = {
    payload: {
      batch: {
        content_fingerprint: packageIdentity.contentFingerprint,
        file_name: packageIdentity.fileName,
        format: "xlsx",
        idempotency_key: packageIdentity.idempotencyKey,
        row_count: 1,
        submission_ids: [networkContract.submissionId],
      },
      document_export: {
        applicant_count: 1,
        asset_ids: networkContract.documentAssetIds,
        file_count: 4,
        workbook_file_name: packageIdentity.fileName,
        zip_file_name: packageIdentity.zipFileName,
      },
    },
  };

  test("requires the verified ZIP/XLSX identity on every released export RPC", () => {
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(draftPayload),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(true);
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(terminalPayload),
        "POST /rest/v1/rpc/complete_export_package",
        networkContract,
        artifactContract,
      ),
    ).toBe(true);
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify({
          ...terminalPayload,
          payload: {
            ...terminalPayload.payload,
            batch: {
              ...terminalPayload.payload.batch,
              idempotency_key: "different",
            },
          },
        }),
        "POST /rest/v1/rpc/complete_export_package",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify({
          ...draftPayload,
          payload: {
            ...draftPayload.payload,
            questionnaire_answers: [],
          },
        }),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify({
          ...draftPayload,
          payload: {
            ...draftPayload.payload,
            media_assets: [
              {
                ...draftPayload.payload.media_assets[0],
                submission_id: "other-submission",
              },
            ],
          },
        }),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify({
          ...draftPayload,
          payload: {
            ...draftPayload.payload,
            submission: {
              ...draftPayload.payload.submission,
              family_intelligence: {
                v19CockpitSnapshot: {
                  submission: {
                    ...draftPayload.payload.submission.family_intelligence
                      .v19CockpitSnapshot.submission,
                    agentId: "other-owner",
                  },
                },
              },
            },
          },
        }),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);
  });

  test("refuses terminal release until a verified artifact contract is bound", () => {
    const gate = new StrictProductionA1S1ExportNetworkGate(networkContract);
    gate.beginExport();
    expect(() => gate.releaseExportMutations()).toThrow(/verified.*artifact/i);
    gate.cancelExportMutations();
    gate.finishExport();
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
