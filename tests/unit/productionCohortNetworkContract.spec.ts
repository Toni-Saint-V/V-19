import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import {
  PRODUCTION_COHORT_APP_ORIGIN,
  PRODUCTION_PROJECT_REF,
  assertProductionNetworkRecordsHealthy,
  isPermittedCohortStaticRuntimeRequest,
} from "../e2e-supabase-ui/production-cohort-helpers";
import {
  StrictProductionA1S1ExportNetworkGate,
  prepareProductionA2S1ExportRetryCheckpoint,
  productionA2S1StartsInTerminalReadbackLane,
  productionA1S1ExportDigest,
  productionA1S1ExportPayloadMatches,
  type ProductionA1S1ExportState,
} from "../e2e-supabase-ui/production-export-a1-s1-helpers";
import {
  acquireProductionCohortMutationLock,
  assertProductionLifecycleMutationAudit,
  createProductionMutationDiagnosticError,
  createProductionResponseDiagnosticError,
  evidenceDigest,
  productionDraftApplicantContentDigest,
  productionDraftEffectiveSnapshotHistory,
  productionDraftHistoryPayloadId,
  productionDraftMediaContentDigest,
  productionDraftQuestionnaireValueIdentity,
  productionDraftSnapshotContentDigest,
  productionDraftSubmissionStaticContentDigest,
  productionDraftStableUuid,
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
  const timestamp = "2026-07-14T12:00:00.000Z";
  const correctionReason = "Требуется исправить поле «Примечание» — RUN A2-S1: correct the note";
  const applicant = {
    address: "Санкт-Петербург",
    birth_date: "1990-01-01",
    citizenship: "Россия",
    city: "Санкт-Петербург",
    country: "Испания",
    email: "pilot@example.invalid",
    full_name: "Технический заявитель",
    hotel_address: "Test address",
    hotel_name: "Test hotel",
    id: applicantId,
    media_percent: 100,
    passport_expires_at: "2030-01-01",
    passport_issued_at: "2020-01-01",
    passport_number: "TEST-PASSPORT",
    patronymic: null,
    phone: "+70000000000",
    questionnaire_percent: 100,
    role: "Основной заявитель",
    role_confirmed: true,
    submission_id: input.submissionId,
    suggested_role: null,
    trip_dates: "2026-08-01 - 2026-08-10",
  };
  const media = {
    applicant_id: applicantId,
    generated_file_name: "passport_scan.jpg",
    id: "media-a2-s1-passport",
    mime_type: "image/jpeg",
    original_file_name: "passport.jpg",
    review_status: "accepted",
    reviewed_at: timestamp,
    reviewed_by: input.ownerId,
    size_bytes: 2048,
    storage_bucket: "submission-media",
    storage_path: `${input.submissionId}/${applicantId}/passport_scan/asset`,
    submission_id: input.submissionId,
    type: "passport_scan",
    upload_status: "uploaded",
    uploaded_at: timestamp,
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
      input.correctionStatus === "open" ? null : timestamp,
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
  const snapshotStatus = input.snapshotStatus;
  const persistedStatus =
    snapshotStatus === "returned"
      ? "returned"
      : snapshotStatus === "ready_for_export"
        ? "ready_for_excel"
        : "waiting_review";
  const familyIntelligence = {
    status: "unreviewed",
    v19CockpitSnapshot: {
      submission: {
        agentId: input.ownerId,
        applicants: [
          {
            fullName: applicant.full_name,
            id: applicantId,
            sections: [
              {
                fields: [
                  { id: answer.field_id, label: answer.label, value: answer.value },
                ],
                id: answer.section_id,
              },
            ],
          },
        ],
        files: [
          {
            applicantId,
            generatedFileName: media.generated_file_name,
            mimeType: media.mime_type,
            sizeBytes: media.size_bytes,
            storageBucket: media.storage_bucket,
            storagePath: media.storage_path,
            type: "passport_scan",
          },
        ],
        history: [] as Array<Record<string, unknown>>,
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
        status: snapshotStatus,
        title: "A2-S1 technical case",
        updatedAt: timestamp,
      },
      version: 1,
    },
  };
  const payload = {
    applicants: [applicant],
    corrections: [correction],
    media_assets: [media],
    questionnaire_answers: [answer],
    status_history: [] as Array<Record<string, unknown>>,
    submission: {
      accepted_at: snapshotStatus === "ready_for_export" ? timestamp : null,
      agent_id: input.ownerId,
      appointment_status: "not_started",
      city: "Санкт-Петербург",
      country: "Испания",
      exported_at: null,
      family_intelligence: familyIntelligence,
      id: input.submissionId,
      priority: persistedStatus === "returned" ? "Высокий" : "Средний",
      readiness_percent: 100,
      review_started_at: null,
      status: persistedStatus,
      submitted_at: snapshotStatus === "submitted_for_review" ? timestamp : null,
      title: "A2-S1 technical case",
      travel_date: "2026-08-01 - 2026-08-10",
      trip_date_from: "2026-08-01",
      trip_date_to: "2026-08-10",
      type: "single",
      updated_at: timestamp,
    },
  };
  const applicantContentDigest = productionDraftApplicantContentDigest(applicant);
  const mediaContentDigest = productionDraftMediaContentDigest(media);
  const questionnaireValueIdentity = productionDraftQuestionnaireValueIdentity(
    answer.value,
  );
  const exportContentDigest = productionDraftSnapshotContentDigest(
    familyIntelligence,
    "export",
  );
  const lifecycleContentDigest = productionDraftSnapshotContentDigest(
    familyIntelligence,
    "lifecycle",
  );
  const historyIdentity = productionDraftEffectiveSnapshotHistory({
    familyIntelligence,
    statusHistory: [],
  });
  const submissionStaticContentDigest =
    productionDraftSubmissionStaticContentDigest(payload.submission);
  if (
    !applicantContentDigest ||
    !mediaContentDigest ||
    !questionnaireValueIdentity ||
    !exportContentDigest ||
    !lifecycleContentDigest ||
    !historyIdentity ||
    !submissionStaticContentDigest
  ) {
    throw new Error("Unit fixture canonical identity is incomplete.");
  }
  return {
    payload,
    draft: {
      applicants: [
        {
          contentDigest: applicantContentDigest,
          id: applicantId,
          submissionId: input.submissionId,
        },
      ],
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
      effectiveHistoryCount: historyIdentity.effectiveHistoryCount,
      mediaAssets: [
        {
          applicantId,
          contentDigest: mediaContentDigest,
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
          logicalValueDigest: questionnaireValueIdentity.logicalValueDigest,
          sectionId: answer.section_id,
          submissionId: input.submissionId,
          valueDigest: questionnaireValueIdentity.valueDigest,
          valueStructureDigest: questionnaireValueIdentity.valueStructureDigest,
        },
      ],
      snapshot: { exportContentDigest, lifecycleContentDigest },
      snapshotHistory: historyIdentity.snapshotHistory,
      snapshotIssueCount: 1,
      snapshotUntypedHistoryDigests: historyIdentity.snapshotUntypedHistoryDigests,
      statusHistory: [],
      submission: { staticContentDigest: submissionStaticContentDigest },
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
      mode: "lifecycle" as const,
      ownerId: "owner-a2-s1",
      questionnaire: { mode: "exact" as const },
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

  test("rejects writable applicant, media, root, and snapshot content drift", () => {
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
      mode: "lifecycle" as const,
      ownerId: "owner-a2-s1",
      questionnaire: { mode: "exact" as const },
      submissionId: "submission-a2-s1",
      submissionStatus: "returned" as const,
    };
    const request = { payload: structuredClone(fixture.payload) };
    const matches = (candidate: typeof request) =>
      productionLifecycleMutationPayloadMatches(JSON.stringify(candidate), contract);
    expect(matches(request)).toBe(true);

    for (const [key, value] of [
      ["full_name", "Changed applicant"],
      ["passport_number", "CHANGED-PASSPORT"],
    ] as const) {
      const candidate = structuredClone(request);
      (candidate.payload.applicants[0] as Record<string, unknown>)[key] = value;
      expect(matches(candidate)).toBe(false);
    }

    for (const [key, value] of [
      ["original_file_name", "changed.jpg"],
      ["generated_file_name", "changed-generated.jpg"],
      ["mime_type", "image/png"],
      ["size_bytes", 4096],
      ["reviewed_by", "other-reviewer"],
      ["reviewed_at", "2026-07-14T13:00:00.000Z"],
      ["uploaded_at", "2026-07-14T13:00:00.000Z"],
    ] as const) {
      const candidate = structuredClone(request);
      (candidate.payload.media_assets[0] as Record<string, unknown>)[key] = value;
      expect(matches(candidate)).toBe(false);
    }

    const rootDrift = structuredClone(request);
    rootDrift.payload.submission.title = "Changed root title";
    expect(matches(rootDrift)).toBe(false);

    const rootLifecycleTimestampDrift = structuredClone(request);
    rootLifecycleTimestampDrift.payload.submission.accepted_at =
      "2026-07-14T13:00:00.000Z";
    expect(matches(rootLifecycleTimestampDrift)).toBe(false);

    const snapshotApplicantDrift = structuredClone(request);
    snapshotApplicantDrift.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .applicants[0]!.fullName = "Changed snapshot applicant";
    expect(matches(snapshotApplicantDrift)).toBe(false);

    const snapshotFieldDrift = structuredClone(request);
    snapshotFieldDrift.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .applicants[0]!.sections[0]!.fields[0]!.value = "changed snapshot field";
    expect(matches(snapshotFieldDrift)).toBe(false);

    const snapshotFileDrift = structuredClone(request);
    snapshotFileDrift.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .files[0]!.sizeBytes = 8192;
    expect(matches(snapshotFileDrift)).toBe(false);

    const unknownEnvelopeKey = structuredClone(request);
    (
      unknownEnvelopeKey.payload.submission.family_intelligence
        .v19CockpitSnapshot as Record<string, unknown>
    ).unexpected = true;
    expect(matches(unknownEnvelopeKey)).toBe(false);
  });

  test("allows only the exact questionnaire field replacement", () => {
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId: "owner-a2-s1",
      snapshotStatus: "returned",
      submissionId: "submission-a2-s1",
    });
    const replacement = "Corrected production note";
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
      mode: "lifecycle" as const,
      ownerId: "owner-a2-s1",
      questionnaire: {
        applicantId: "applicant-a2-s1",
        expectedValueDigest: requiredDigest(replacement),
        fieldId: "field-1",
        mode: "replace" as const,
        sectionId: "section-1",
      },
      submissionId: "submission-a2-s1",
      submissionStatus: "returned" as const,
    };
    const request = { payload: structuredClone(fixture.payload) };
    request.payload.questionnaire_answers[0]!.value = replacement;
    request.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .applicants[0]!.sections[0]!.fields[0]!.value = replacement;

    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(request), contract),
    ).toBe(true);

    const wrongValue = structuredClone(request);
    wrongValue.payload.questionnaire_answers[0]!.value = "Different note";
    wrongValue.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .applicants[0]!.sections[0]!.fields[0]!.value = "Different note";
    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(wrongValue), contract),
    ).toBe(false);
  });

  test("preserves duplicate durable semantics by UUID and rejects UUID rehash", () => {
    const submissionId = "submission-a2-s1";
    const ownerId = "owner-a2-s1";
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId,
      snapshotStatus: "returned",
      submissionId,
    });
    const durableIds = [
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ];
    const durableRows = durableIds.map((id, index) => ({
      changed_at: `2026-07-14T12:0${index}:00.000Z`,
      changed_by: ownerId,
      comment: "Same semantic transition",
      entity_id: submissionId,
      entity_type: "submission",
      from_status: "submitted_for_review",
      id,
      note: "same note",
      source: "agent",
      to_status: "returned",
    }));
    const effectiveHistory = productionDraftEffectiveSnapshotHistory({
      familyIntelligence: fixture.payload.submission.family_intelligence,
      statusHistory: durableRows,
    });
    if (!effectiveHistory) throw new Error("Expected effective history identity");
    const snapshotHistory = durableRows.map((row) => ({
      actorId: row.changed_by,
      at: row.changed_at,
      createdAt: row.changed_at,
      fromStatus: row.from_status,
      id: row.id,
      note: row.note,
      source: row.source,
      text: row.comment,
      toStatus: row.to_status,
    }));
    const request = { payload: structuredClone(fixture.payload) };
    request.payload.status_history = durableRows;
    request.payload.submission.family_intelligence.v19CockpitSnapshot.submission.history =
      snapshotHistory;
    const contract = {
      correction: {
        mode: "existing" as const,
        reasonIncludes: "RUN A2-S1",
        status: "open" as const,
      },
      draft: {
        ...fixture.draft,
        effectiveHistoryCount: effectiveHistory.effectiveHistoryCount,
        snapshotHistory: effectiveHistory.snapshotHistory,
        snapshotUntypedHistoryDigests:
          effectiveHistory.snapshotUntypedHistoryDigests,
        statusHistory: durableRows.map((row) => ({
          commentDigest: requiredDigest(row.comment),
          entityId: row.entity_id,
          entityType: "submission" as const,
          fromStatus: row.from_status,
          id: row.id,
          noteDigest: requiredDigest(row.note),
          source: "agent" as const,
          toStatus: row.to_status,
        })),
      },
      history: {
        actorId: ownerId,
        actorSource: "agent" as const,
        snapshotStatus: "returned" as const,
      },
      mode: "lifecycle" as const,
      ownerId,
      questionnaire: { mode: "exact" as const },
      submissionId,
      submissionStatus: "returned" as const,
    };

    expect(productionDraftHistoryPayloadId(submissionId, durableIds[0]!)).toBe(
      durableIds[0],
    );
    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(request), contract),
    ).toBe(true);

    const rehashed = structuredClone(request);
    rehashed.payload.status_history[0]!.id = productionDraftStableUuid(
      `history:${submissionId}:${durableIds[0]}`,
    );
    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(rehashed), contract),
    ).toBe(false);

    const missingDuplicate = structuredClone(request);
    missingDuplicate.payload.status_history = [missingDuplicate.payload.status_history[0]!];
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify(missingDuplicate),
        contract,
      ),
    ).toBe(false);
  });

  test("counts durable duplicates plus retained snapshot-only history", () => {
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId: "owner-a2-s1",
      snapshotStatus: "returned",
      submissionId: "submission-a2-s1",
    });
    fixture.payload.submission.family_intelligence.v19CockpitSnapshot.submission.history = [
      { at: "2026-07-14T11:00:00.000Z", id: "snapshot-only", text: "UI note" },
      {
        fromStatus: "submitted_for_review",
        id: "covered-snapshot-row",
        note: "same note",
        source: "agent",
        text: "Same semantic transition",
        toStatus: "returned",
      },
    ];
    const durableRows = [1, 2].map((index) => ({
      changed_at: `2026-07-14T12:0${index}:00.000Z`,
      changed_by: "owner-a2-s1",
      comment: "Same semantic transition",
      entity_id: "submission-a2-s1",
      entity_type: "submission",
      from_status: "submitted_for_review",
      id: `00000000-0000-4000-8000-00000000010${index}`,
      note: "same note",
      source: "agent",
      to_status: "returned",
    }));
    const effective = productionDraftEffectiveSnapshotHistory({
      familyIntelligence: fixture.payload.submission.family_intelligence,
      statusHistory: durableRows,
    });

    expect(effective).toMatchObject({
      effectiveHistoryCount: 3,
      snapshotHistory: [{ id: durableRows[1]!.id }, { id: durableRows[0]!.id }],
    });
    expect(effective?.snapshotUntypedHistoryDigests).toHaveLength(1);
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
              exportState: "file_downloaded",
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

    const wrongExportState = structuredClone(draftPayload);
    wrongExportState.payload.submission.family_intelligence.v19CockpitSnapshot.submission.exportState =
      "file_generated";
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(wrongExportState),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const unexpectedHistory = structuredClone(draftPayload);
    unexpectedHistory.payload.submission.family_intelligence.v19CockpitSnapshot.submission.history.push(
      { at: "сейчас", id: "unexpected-export-history", text: "unexpected" },
    );
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(unexpectedHistory),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const unknownSnapshotKey = structuredClone(draftPayload);
    (
      unknownSnapshotKey.payload.submission.family_intelligence.v19CockpitSnapshot
        .submission as Record<string, unknown>
    ).unexpected = true;
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(unknownSnapshotKey),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const invalidUpdatedAt = structuredClone(draftPayload);
    invalidUpdatedAt.payload.submission.family_intelligence.v19CockpitSnapshot.submission.updatedAt =
      "not-a-timestamp";
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(invalidUpdatedAt),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const detachedAcceptedAt = structuredClone(draftPayload);
    detachedAcceptedAt.payload.submission.accepted_at =
      "2026-07-14T13:00:00.000Z";
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(detachedAcceptedAt),
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

  test("routes ambiguous terminal checkpoints away from primary mutation evidence", () => {
    expect(productionA2S1StartsInTerminalReadbackLane("artifact_verified")).toBe(
      true,
    );
    expect(productionA2S1StartsInTerminalReadbackLane("verified")).toBe(true);
    expect(productionA2S1StartsInTerminalReadbackLane("pending")).toBe(false);
    expect(productionA2S1StartsInTerminalReadbackLane("excel_verified")).toBe(
      false,
    );
    expect(productionA2S1StartsInTerminalReadbackLane("exporting")).toBe(false);
  });

  test("recovers only an unchanged ambiguous artifact checkpoint for one retry", () => {
    const preflight = {
      applicantDigest: "a".repeat(64),
      documentAssetCount: 3 as const,
      documentAssetIdentityDigest: "b".repeat(64),
      mediaAssetCount: 3 as const,
      mediaDigest: "c".repeat(64),
      rawStatus: "ready_for_excel" as const,
    };
    const state: ProductionA1S1ExportState = {
      caseKey: "A2-S1",
      caseMarkerDigest: "d".repeat(64),
      excelProof: {
        byteDigest: "e".repeat(64),
        byteLength: 1024,
        columnCount: 56,
        dataRowCount: 1,
        dimension: "A1:BD2",
        markerRowCount: 1,
        sheetName: "Sheet1",
      },
      postCommitUiNoticeVerified: true,
      preflight,
      projectRef: PRODUCTION_PROJECT_REF,
      runMarker: "V19QA-20260711-AUDIT",
      schemaVersion: 1,
      stage: "artifact_verified",
      submissionDigest: "f".repeat(64),
      updatedAt: "2026-07-14T12:00:00.000Z",
      zipProof: {
        applicantCount: 1,
        byteDigest: "1".repeat(64),
        byteLength: 2048,
        documentCount: 4,
        downloadWaitMs: 100,
        entryCount: 7,
        questionnairePdfCount: 1,
        workbookDigest: "e".repeat(64),
        workbookFileNameDigest: "2".repeat(64),
        zipFileNameDigest: "3".repeat(64),
      },
    };

    expect(
      prepareProductionA2S1ExportRetryCheckpoint(state, { ...preflight }),
    ).toBe(state);
    expect(state).toMatchObject({
      excelProof: { byteDigest: "e".repeat(64) },
      preflight,
      stage: "excel_verified",
    });
    expect(state.zipProof).toBeUndefined();
    expect(state.postCommitUiNoticeVerified).toBeUndefined();

    const changedState = structuredClone({
      ...state,
      postCommitUiNoticeVerified: true as const,
      stage: "artifact_verified" as const,
      zipProof: {
        applicantCount: 1 as const,
        byteDigest: "1".repeat(64),
        byteLength: 2048,
        documentCount: 4 as const,
        downloadWaitMs: 100,
        entryCount: 7 as const,
        questionnairePdfCount: 1 as const,
        workbookDigest: "e".repeat(64),
        workbookFileNameDigest: "2".repeat(64),
        zipFileNameDigest: "3".repeat(64),
      },
    });
    expect(() =>
      prepareProductionA2S1ExportRetryCheckpoint(changedState, {
        ...preflight,
        mediaDigest: "9".repeat(64),
      }),
    ).toThrow(/facts changed/);
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
