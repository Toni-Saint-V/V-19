import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  addPreciseAdminIssue,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import { markSubmissionIssueFixedResult } from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";
import {
  PRODUCTION_COHORT_APP_ORIGIN,
  PRODUCTION_PROJECT_REF,
  assertProductionNetworkRecordsHealthy,
  buildProductionCohortPlan,
  isPermittedCohortStaticRuntimeRequest,
  productionCohortContactEmail,
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
  productionDraftSnapshotFullContentDigest,
  productionDraftSnapshotIssueIdentities,
  productionDraftSnapshotMutationFromBaseline,
  productionDraftSubmissionStaticContentDigest,
  productionDraftStableUuid,
  productionDraftValueDigest,
  productionLifecycleMutationPayloadMismatchCode,
  productionLifecycleMutationPayloadMatches,
  runWithFailurePreservingCleanup,
} from "../e2e-supabase-ui/production-lifecycle-helpers";
import {
  productionFamilyContactReadbackProvesResubmitted,
  productionFamilyContactRecoveryState,
} from "../e2e-supabase-ui/production-family-contact-helpers";

describe("production family contact resumable readback", () => {
  const exact = {
    contact: {
      applicantCount: 6,
      distinctLayerValueDigestCount: 1,
      durableExpectedCount: 6,
      layerAgreementCount: 6,
      questionnaireExpectedCount: 6,
      snapshotEmailErrorStates: { absent: 6, expected: 0, other: 0 },
      snapshotExpectedCount: 6,
    },
    lifecycle: {
      applicantCount: 6,
      answerCount: 462,
      mediaCount: 18,
      snapshotIssueStatuses: ["fixed_by_agent"],
      submissionStatus: "waiting_review",
      targetCorrectionCount: 1,
      targetCorrectionStatuses: ["fixed"],
    },
  };

  test("accepts only the exact persisted resubmission contract", () => {
    expect(productionFamilyContactReadbackProvesResubmitted(exact)).toBe(true);
    expect(productionFamilyContactRecoveryState(exact)).toBe("resubmitted");
  });

  test("retries safely when a resubmitting checkpoint still reads as returned", () => {
    const returned = {
      ...exact,
      lifecycle: { ...exact.lifecycle, submissionStatus: "returned" },
    };
    expect(productionFamilyContactRecoveryState(returned)).toBe("returned");
    expect(productionFamilyContactReadbackProvesResubmitted(returned)).toBe(false);
  });

  test.each([
    { contact: { ...exact.contact, durableExpectedCount: 5 } },
    {
      contact: {
        ...exact.contact,
        snapshotEmailErrorStates: { absent: 5, expected: 1, other: 0 },
      },
    },
    {
      lifecycle: {
        ...exact.lifecycle,
        targetCorrectionCount: 2,
        targetCorrectionStatuses: ["fixed", "fixed"],
      },
    },
    {
      lifecycle: {
        ...exact.lifecycle,
        snapshotIssueStatuses: ["fixed_by_agent", "closed_by_admin"],
      },
    },
  ])("rejects partial or ambiguous readback %#", (override) => {
    const readback = {
      contact: override.contact ?? exact.contact,
      lifecycle: override.lifecycle ?? exact.lifecycle,
    };
    expect(productionFamilyContactRecoveryState(readback)).toBe("invalid");
    expect(productionFamilyContactReadbackProvesResubmitted(readback)).toBe(false);
  });
});

function requiredDigest(value: unknown) {
  const digest = productionDraftValueDigest(value);
  if (!digest) throw new Error("Unit fixture value must be digestible.");
  return digest;
}

function draftFixture(input: {
  correctionStatus: "closed" | "fixed" | "open";
  fieldError?: string;
  includeTargetCorrection?: boolean;
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
  const includeTargetCorrection = input.includeTargetCorrection ?? true;
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
    updated_by: input.ownerId,
    value: "answer",
  };
  const correction = {
    applicant_id: applicantId,
    created_at: timestamp,
    created_by: input.ownerId,
    field_key: "Примечание",
    fixed_at:
      input.correctionStatus === "open" ? null : timestamp,
    id: productionDraftStableUuid(
      `correction:${input.submissionId}:зм-${input.submissionId}-новое-1`,
    ),
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
                  {
                    ...(input.fieldError ? { error: input.fieldError } : {}),
                    id: answer.field_id,
                    label: answer.label,
                    value: answer.value,
                  },
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
        issues: includeTargetCorrection
          ? [
              {
                comment: "RUN A2-S1: correct the note",
                createdAt: timestamp,
                createdBy: "admin",
                id: `зм-${input.submissionId}-новое-1`,
                reason: "Требуется исправить поле «Примечание»",
                severity: "blocker",
                snapshot: answer.value,
                status: snapshotIssueStatus,
                target: { applicantId, field: "Примечание" },
                type: "field",
              },
            ]
          : [],
        status: snapshotStatus,
        title: "A2-S1 technical case",
        updatedAt: timestamp,
      },
      version: 1,
    },
  };
  const payload = {
    applicants: [applicant],
    corrections: includeTargetCorrection ? [correction] : [],
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
  const snapshotIssues = productionDraftSnapshotIssueIdentities(familyIntelligence);
  const submissionStaticContentDigest =
    productionDraftSubmissionStaticContentDigest(payload.submission);
  if (
    !applicantContentDigest ||
    !mediaContentDigest ||
    !questionnaireValueIdentity ||
    !exportContentDigest ||
    !lifecycleContentDigest ||
    !historyIdentity ||
    !snapshotIssues ||
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
      corrections: includeTargetCorrection
        ? [
            {
              applicantId,
              createdAt: correction.created_at,
              fieldKey: correction.field_key,
              fixedAt: correction.fixed_at,
              id: correction.id,
              mediaType: correction.media_type,
              reasonDigest: requiredDigest(correction.reason),
              scope: correction.scope,
              severity: correction.severity,
              status: correction.status,
              submissionId: input.submissionId,
              targetMarker: true,
            },
          ]
        : [],
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
          snapshotErrorDigest: input.fieldError
            ? requiredDigest(input.fieldError)
            : null,
          submissionId: input.submissionId,
          valueDigest: questionnaireValueIdentity.valueDigest,
          valueStructureDigest: questionnaireValueIdentity.valueStructureDigest,
        },
      ],
      snapshot: { exportContentDigest, lifecycleContentDigest },
      snapshotHistory: historyIdentity.snapshotHistory,
      snapshotIssueCount: includeTargetCorrection ? 1 : 0,
      snapshotIssues,
      snapshotUntypedHistoryDigests: historyIdentity.snapshotUntypedHistoryDigests,
      statusHistory: [],
      submission: { staticContentDigest: submissionStaticContentDigest },
    },
  };
}

describe("production cohort runtime asset allowlist", () => {
  test("uses one shared contact email for every family while keeping cases distinct", () => {
    const cases = buildProductionCohortPlan("V19QA-20260715-CONTACT");
    const primaryContacts = new Set<string>();

    for (const cohortCase of cases) {
      const contacts = Array.from(
        { length: cohortCase.applicantCount },
        (_, applicantIndex) =>
          productionCohortContactEmail(cohortCase, applicantIndex),
      );
      primaryContacts.add(contacts[0] ?? "");
      expect(contacts.every((contact) => contact.endsWith("@example.invalid"))).toBe(
        true,
      );
      if (cohortCase.type === "family") {
        expect(new Set(contacts).size).toBe(1);
      }
    }

    expect(primaryContacts.size).toBe(cases.length);
  });

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
        JSON.stringify({ ...payload, unexpected: true }),
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

  test("allows one exact applicant email projection replacement with the questionnaire value", () => {
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId: "owner-a2-s1",
      snapshotStatus: "returned",
      submissionId: "submission-a2-s1",
    });
    const replacement = "family@example.invalid";
    const projectedApplicant = {
      ...fixture.payload.applicants[0]!,
      email: replacement,
    };
    const expectedContentDigest =
      productionDraftApplicantContentDigest(projectedApplicant);
    expect(expectedContentDigest).toBeTruthy();
    const contract = {
      applicantProjection: {
        applicantId: "applicant-a2-s1",
        expectedContentDigest: expectedContentDigest!,
        mode: "replace_email" as const,
      },
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
    request.payload.applicants[0] = projectedApplicant;
    request.payload.questionnaire_answers[0]!.value = replacement;
    request.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .applicants[0]!.sections[0]!.fields[0]!.value = replacement;

    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(request), contract),
    ).toBe(true);

    const extraProjectionChange = structuredClone(request);
    extraProjectionChange.payload.applicants[0]!.phone = "+7 999 999-99-99";
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify(extraProjectionChange),
        contract,
      ),
    ).toBe(false);
  });

  test("allows an exact full applicant serializer projection and rejects any extra field", () => {
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId: "owner-a2-s1",
      snapshotStatus: "returned",
      submissionId: "submission-a2-s1",
    });
    const projectedApplicant = {
      ...fixture.payload.applicants[0]!,
      questionnaire_percent: 83,
    };
    const expectedContentDigest =
      productionDraftApplicantContentDigest(projectedApplicant);
    expect(expectedContentDigest).toBeTruthy();
    const contract = {
      applicantProjection: {
        applicants: [
          {
            applicantId: "applicant-a2-s1",
            expectedContentDigest: expectedContentDigest!,
          },
        ],
        mode: "replace_exact" as const,
      },
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
    request.payload.applicants[0] = projectedApplicant;

    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(request), contract),
    ).toBe(true);

    const extraChange = structuredClone(request);
    extraChange.payload.applicants[0]!.phone = "+7 999 999-99-99";
    expect(
      productionLifecycleMutationPayloadMatches(
        JSON.stringify(extraChange),
        contract,
      ),
    ).toBe(false);
  });

  test("allows only the exact snapshot side effect for adding a lifecycle issue", () => {
    const submissionId = "submission-a2-s1";
    const applicantId = "applicant-a2-s1";
    const adminId = "admin-a2-s1";
    const actionTimestamp = "2026-07-14T12:00:00.000Z";
    const issueMarker = "RUN A2-S1: add lifecycle issue";
    const issueReason = "Требуется исправить поле «Примечание»";
    const fixture = draftFixture({
      correctionStatus: "open",
      includeTargetCorrection: false,
      ownerId: "owner-a2-s1",
      snapshotStatus: "submitted_for_review",
      submissionId,
    });
    const contract = {
      correction: {
        mode: "append" as const,
        reasonIncludes: issueMarker,
        status: "open" as const,
      },
      draft: fixture.draft,
      history: {
        actorId: adminId,
        actorSource: "admin" as const,
        snapshotStatus: "submitted_for_review" as const,
      },
      mode: "lifecycle" as const,
      ownerId: "owner-a2-s1",
      questionnaire: { mode: "exact" as const },
      snapshotMutation: {
        expectedContentDigest: "pending",
        fieldError: {
          applicantId,
          expectedValue: issueReason,
          fieldId: "field-1",
          sectionId: "section-1",
        },
        mode: "add_issue" as const,
        untypedHistory: {
          id: `и-${submissionId}-замечание`,
          source: "admin" as const,
          text: "Администратор добавил точное замечание",
        },
      },
      submissionId,
      submissionStatus: "waiting_review" as const,
      timestampWindow: {
        notAfter: "2026-07-14T12:01:00.000Z",
        notBefore: "2026-07-14T11:59:00.000Z",
      },
    };
    const issueId = `зм-${submissionId}-новое-1`;
    const request = { payload: structuredClone(fixture.payload) };
    request.payload.questionnaire_answers[0]!.updated_by = adminId;
    request.payload.corrections = [
      {
        applicant_id: applicantId,
        created_at: actionTimestamp,
        created_by: adminId,
        field_key: "Примечание",
        fixed_at: null,
        id: productionDraftStableUuid(`correction:${submissionId}:${issueId}`),
        media_type: null,
        reason: `${issueReason} — ${issueMarker}`,
        scope: "field",
        severity: "blocking",
        status: "open",
        submission_id: submissionId,
      },
    ];
    const snapshot =
      request.payload.submission.family_intelligence.v19CockpitSnapshot.submission;
    snapshot.updatedAt = "сейчас";
    snapshot.applicants[0]!.sections[0]!.fields[0]!.error = issueReason;
    snapshot.issues = [
      {
        comment: issueMarker,
        createdAt: "сейчас",
        createdBy: "admin",
        id: issueId,
        reason: issueReason,
        severity: "blocker",
        snapshot: "answer",
        status: "open",
        target: { applicantId, field: "Примечание" },
        type: "field",
      },
    ];
    snapshot.history = [
      {
        at: "сейчас",
        id: `и-${submissionId}-замечание`,
        source: "admin",
        text: "Администратор добавил точное замечание",
      },
    ];
    const expectedContentDigest = productionDraftSnapshotFullContentDigest(
      request.payload.submission.family_intelligence,
    );
    if (!expectedContentDigest) throw new Error("Expected add-issue snapshot digest.");
    contract.snapshotMutation.expectedContentDigest = expectedContentDigest;

    const matches = (candidate: typeof request) =>
      productionLifecycleMutationPayloadMatches(JSON.stringify(candidate), contract);
    expect(matches(request)).toBe(true);

    const changedError = structuredClone(request);
    changedError.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .applicants[0]!.sections[0]!.fields[0]!.error = "other error";
    expect(matches(changedError)).toBe(false);

    const changedHistory = structuredClone(request);
    changedHistory.payload.submission.family_intelligence.v19CockpitSnapshot.submission.history[0]!.text =
      "unexpected history";
    expect(matches(changedHistory)).toBe(false);

    const changedIssueSnapshot = structuredClone(request);
    changedIssueSnapshot.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .issues[0]!.snapshot = "tampered-snapshot";
    expect(matches(changedIssueSnapshot)).toBe(false);

    const staleRootTimestamp = structuredClone(request);
    staleRootTimestamp.payload.submission.updated_at = "2025-01-01T00:00:00.000Z";
    staleRootTimestamp.payload.submission.submitted_at =
      staleRootTimestamp.payload.submission.updated_at;
    expect(matches(staleRootTimestamp)).toBe(false);
  });

  test("allows only the exact snapshot side effect for marking an issue fixed", () => {
    const submissionId = "submission-a2-s1";
    const issueReason = "Требуется исправить поле «Примечание»";
    const actionTimestamp = "2026-07-14T12:00:00.000Z";
    const fixture = draftFixture({
      correctionStatus: "open",
      fieldError: issueReason,
      ownerId: "owner-a2-s1",
      snapshotStatus: "returned",
      submissionId,
    });
    const contract = {
      correction: {
        mode: "existing" as const,
        reasonIncludes: "RUN A2-S1",
        status: "fixed" as const,
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
      snapshotMutation: {
        expectedContentDigest: "pending",
        fieldError: {
          applicantId: "applicant-a2-s1",
          expectedValue: issueReason,
          fieldId: "field-1",
          sectionId: "section-1",
        },
        mode: "mark_issue_fixed" as const,
        untypedHistory: {
          id: `и-${submissionId}-зм-${submissionId}-новое-1-исправлено`,
          source: "agent" as const,
          text: "Агент отметил замечание исправленным",
        },
      },
      submissionId,
      submissionStatus: "returned" as const,
      timestampWindow: {
        notAfter: "2026-07-14T12:01:00.000Z",
        notBefore: "2026-07-14T11:59:00.000Z",
      },
    };
    const request = { payload: structuredClone(fixture.payload) };
    request.payload.corrections[0]!.fixed_at = actionTimestamp;
    request.payload.corrections[0]!.status = "fixed";
    const snapshot =
      request.payload.submission.family_intelligence.v19CockpitSnapshot.submission;
    snapshot.updatedAt = "сейчас";
    delete snapshot.applicants[0]!.sections[0]!.fields[0]!.error;
    snapshot.issues[0]!.status = "fixed_by_agent";
    snapshot.history = [
      {
        at: "сейчас",
        id: `и-${submissionId}-зм-${submissionId}-новое-1-исправлено`,
        source: "agent",
        text: "Агент отметил замечание исправленным",
      },
    ];
    const expectedContentDigest = productionDraftSnapshotFullContentDigest(
      request.payload.submission.family_intelligence,
    );
    if (!expectedContentDigest) throw new Error("Expected mark-fixed snapshot digest.");
    contract.snapshotMutation.expectedContentDigest = expectedContentDigest;

    const matches = (candidate: typeof request) =>
      productionLifecycleMutationPayloadMatches(JSON.stringify(candidate), contract);
    expect(matches(request)).toBe(true);

    const retainedError = structuredClone(request);
    retainedError.payload.submission.family_intelligence.v19CockpitSnapshot.submission
      .applicants[0]!.sections[0]!.fields[0]!.error = issueReason;
    expect(matches(retainedError)).toBe(false);

    const staleFixedAt = structuredClone(request);
    staleFixedAt.payload.corrections[0]!.fixed_at = "2025-01-01T00:00:00.000Z";
    expect(matches(staleFixedAt)).toBe(false);
  });

  test("derives questionnaire recalculation and complete issue metadata from source actions", () => {
    const sourceBaseline = initialSubmissions.find(
      (submission) => submission.id === "ПД-1053",
    );
    if (!sourceBaseline) throw new Error("Expected canonical lifecycle fixture.");
    const baseline = JSON.parse(JSON.stringify(sourceBaseline)) as Submission;
    const issueReason = "Нужно уточнить маршрут поездки";
    const issueComment = "Маршрут поездки должен быть конкретным.";
    const envelope = (submission: Submission) => ({
      status: "unreviewed",
      v19CockpitSnapshot: { submission, version: 1 },
    });
    const persistedEnvelope = (submission: Submission) =>
      JSON.parse(JSON.stringify(envelope(submission)));
    const addIntent = {
      comment: issueComment,
      fieldLabel: "Маршрут поездки",
      mode: "add_issue" as const,
      reason: issueReason,
      section: "Поездка",
    };
    const addMutation = productionDraftSnapshotMutationFromBaseline(
      envelope(baseline),
      addIntent,
    );
    if (!addMutation) throw new Error("Expected source-derived add-issue mutation.");

    const applicant = baseline.applicants[0];
    if (!applicant) throw new Error("Expected lifecycle applicant.");
    const added = addPreciseAdminIssue(baseline, {
      applicantId: applicant.id,
      comment: issueComment,
      field: "Страна первого въезда",
      reason: issueReason,
      section: "Поездка",
      severity: "blocker",
      type: "field",
    });
    const addedDigest = productionDraftSnapshotFullContentDigest(persistedEnvelope(added));
    expect(addedDigest).toBe(addMutation.expectedContentDigest);
    const addedIssue = added.issues[0];
    if (!addedIssue) throw new Error("Expected added lifecycle issue.");
    const addedTarget = added.applicants
      .find((item) => item.id === addedIssue.target.applicantId)
      ?.sections.flatMap((section) => section.fields.map((field) => ({ field, section })))
      .find(({ field }) => field.label === addedIssue.target.field);
    if (!addedTarget) throw new Error("Expected exact added issue target.");
    expect(addedTarget.field.error).toBe(issueReason);
    expect(addedTarget.section.status).toBe("needs_fix");
    expect(addedTarget.section.missing).toBe(issueReason);
    expect(added.applicants[0]?.questionnaireStatus).toBe("needs_fix");

    const tamperedAdded = structuredClone(added);
    tamperedAdded.issues[0]!.snapshot = "tampered-snapshot";
    expect(
      productionDraftSnapshotFullContentDigest(persistedEnvelope(tamperedAdded)),
    ).not.toBe(
      addMutation.expectedContentDigest,
    );

    const corrected = updateQuestionnaireField(added, {
      applicantId: addedIssue.target.applicantId,
      fieldId: addedTarget.field.id,
      sectionId: addedTarget.section.id,
      value: "Москва — Барселона — Москва",
    });
    const returned: Submission = { ...corrected, status: "returned" };
    const markMutation = productionDraftSnapshotMutationFromBaseline(
      persistedEnvelope(returned),
      { ...addIntent, mode: "mark_issue_fixed" },
    );
    if (!markMutation) throw new Error("Expected source-derived mark-fixed mutation.");
    const fixed = markSubmissionIssueFixedResult(
      returned,
      addedIssue.id,
      "agent",
      "2026-07-24T00:00:00.000Z",
    );
    if (!fixed.ok) throw new Error(fixed.error.message);
    expect(productionDraftSnapshotFullContentDigest(persistedEnvelope(fixed.data))).toBe(
      markMutation.expectedContentDigest,
    );
    const fixedTarget = fixed.data.applicants
      .find((item) => item.id === addedIssue.target.applicantId)
      ?.sections.flatMap((section) => section.fields)
      .find((field) => field.id === addedTarget.field.id);
    expect(fixedTarget?.error).toBeUndefined();

    const tamperedFixed = structuredClone(fixed.data);
    tamperedFixed.issues[0]!.target.applicantName = "tampered-applicant";
    expect(
      productionDraftSnapshotFullContentDigest(persistedEnvelope(tamperedFixed)),
    ).not.toBe(
      markMutation.expectedContentDigest,
    );
  });

  test("derives the active field-remark shape without an implicit section", () => {
    const sourceBaseline = initialSubmissions.find(
      (submission) => submission.id === "ПД-1053",
    );
    if (!sourceBaseline) throw new Error("Expected canonical lifecycle fixture.");
    const baseline = JSON.parse(JSON.stringify(sourceBaseline)) as Submission;
    const envelope = {
      status: "unreviewed",
      v19CockpitSnapshot: { submission: baseline, version: 1 },
    };
    const reason = "Требуется исправить поле «Номер паспорта»";
    const comment = "RUN A2-S1: add lifecycle issue";
    const mutation = productionDraftSnapshotMutationFromBaseline(envelope, {
      comment,
      fieldLabel: "Номер паспорта",
      mode: "add_issue",
      reason,
    });
    if (!mutation) throw new Error("Expected runtime-shaped add-issue mutation.");

    const applicant = baseline.applicants[0];
    if (!applicant) throw new Error("Expected lifecycle applicant.");
    const actual = addPreciseAdminIssue(baseline, {
      applicantId: applicant.id,
      comment,
      field: "Номер паспорта",
      reason,
      severity: "blocker",
      type: "field",
    });
    const persisted = JSON.parse(
      JSON.stringify({ status: "unreviewed", v19CockpitSnapshot: { submission: actual, version: 1 } }),
    );
    expect(productionDraftSnapshotFullContentDigest(persisted)).toBe(
      mutation.expectedContentDigest,
    );
    expect(Object.hasOwn(actual.issues[0]!.target, "section")).toBe(true);
    expect(Object.hasOwn(persisted.v19CockpitSnapshot.submission.issues[0].target, "section")).toBe(
      false,
    );
  });

  test("rejects stale durable and snapshot transition timestamps", () => {
    const submissionId = "submission-a2-s1";
    const adminId = "admin-a2-s1";
    const actionTimestamp = "2026-07-14T12:00:00.000Z";
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId: "owner-a2-s1",
      snapshotStatus: "returned",
      submissionId,
    });
    const transition = {
      comment: "Статус изменен: Возвращено",
      fromStatus: "submitted_for_review",
      note: "Администратор вернул подачу",
      toStatus: "returned",
    };
    const contract = {
      correction: {
        mode: "existing" as const,
        reasonIncludes: "RUN A2-S1",
        status: "open" as const,
      },
      draft: fixture.draft,
      history: {
        actorId: adminId,
        actorSource: "admin" as const,
        snapshotStatus: "returned" as const,
        transition,
      },
      mode: "lifecycle" as const,
      ownerId: "owner-a2-s1",
      questionnaire: { mode: "exact" as const },
      submissionId,
      submissionStatus: "returned" as const,
      timestampWindow: {
        notAfter: "2026-07-14T12:01:00.000Z",
        notBefore: "2026-07-14T11:59:00.000Z",
      },
    };
    const request = { payload: structuredClone(fixture.payload) };
    request.payload.questionnaire_answers[0]!.updated_by = adminId;
    request.payload.corrections[0]!.created_by = adminId;
    const transitionId = `и-${submissionId}-${transition.fromStatus}-${transition.toStatus}-1`;
    request.payload.status_history = [
      {
        changed_at: actionTimestamp,
        changed_by: adminId,
        comment: transition.comment,
        entity_id: submissionId,
        entity_type: "submission",
        from_status: transition.fromStatus,
        id: productionDraftStableUuid(`history:${submissionId}:${transitionId}`),
        note: transition.note,
        source: "admin",
        to_status: transition.toStatus,
      },
    ];
    const snapshot =
      request.payload.submission.family_intelligence.v19CockpitSnapshot.submission;
    snapshot.updatedAt = "сейчас";
    snapshot.history = [
      {
        actorId: adminId,
        at: "сейчас",
        createdAt: "сейчас",
        fromStatus: transition.fromStatus,
        id: transitionId,
        note: transition.note,
        source: "admin",
        text: transition.comment,
        toStatus: transition.toStatus,
      },
    ];

    const matches = (candidate: typeof request) =>
      productionLifecycleMutationPayloadMatches(JSON.stringify(candidate), contract);
    expect(matches(request)).toBe(true);

    const staleDurableHistory = structuredClone(request);
    staleDurableHistory.payload.status_history[0]!.changed_at =
      "2025-01-01T00:00:00.000Z";
    expect(matches(staleDurableHistory)).toBe(false);

    const changedSnapshotHistoryTimestamp = structuredClone(request);
    changedSnapshotHistoryTimestamp.payload.submission.family_intelligence.v19CockpitSnapshot.submission.history[0]!.at =
      "2025-01-01T00:00:00.000Z";
    expect(matches(changedSnapshotHistoryTimestamp)).toBe(false);
  });

  test("uses the exact source-derived history projection for a null-note return", () => {
    const submissionId = "submission-a2-f6";
    const adminId = "admin-a2-f6";
    const actionTimestamp = "2026-07-14T12:00:00.000Z";
    const fixture = draftFixture({
      correctionStatus: "open",
      ownerId: "owner-a2-f6",
      snapshotStatus: "returned",
      submissionId,
    });
    const transition = {
      comment: "Статус изменен: Возвращено",
      fromStatus: "submitted_for_review",
      note: null,
      toStatus: "returned",
    };
    const transitionId = `и-${submissionId}-${transition.fromStatus}-${transition.toStatus}-1`;
    const durableId = productionDraftStableUuid(
      `history:${submissionId}:${transitionId}`,
    );
    const contract = {
      correction: {
        mode: "existing" as const,
        reasonIncludes: "RUN A2-S1",
        status: "open" as const,
      },
      draft: fixture.draft,
      history: {
        actorId: adminId,
        actorSource: "admin" as const,
        snapshotStatus: "returned" as const,
        transition,
      },
      historyProjection: {
        mode: "replace_exact" as const,
        rows: [
          {
            changedAt: "action" as const,
            changedBy: adminId,
            commentDigest: requiredDigest(transition.comment),
            entityId: submissionId,
            entityType: "submission" as const,
            fromStatus: transition.fromStatus,
            id: durableId,
            noteDigest: null,
            source: "admin" as const,
            toStatus: transition.toStatus,
          },
        ],
      },
      mode: "lifecycle" as const,
      ownerId: "owner-a2-f6",
      questionnaire: { mode: "exact" as const },
      submissionId,
      submissionStatus: "returned" as const,
      timestampWindow: {
        notAfter: "2026-07-14T12:01:00.000Z",
        notBefore: "2026-07-14T11:59:00.000Z",
      },
    };
    const request = { payload: structuredClone(fixture.payload) };
    request.payload.questionnaire_answers[0]!.updated_by = adminId;
    request.payload.corrections[0]!.created_by = adminId;
    request.payload.status_history = [
      {
        changed_at: actionTimestamp,
        changed_by: adminId,
        comment: transition.comment,
        entity_id: submissionId,
        entity_type: "submission",
        from_status: transition.fromStatus,
        id: durableId,
        note: null,
        source: "admin",
        to_status: transition.toStatus,
      },
    ];
    const snapshot =
      request.payload.submission.family_intelligence.v19CockpitSnapshot.submission;
    snapshot.updatedAt = "сейчас";
    snapshot.history = [
      {
        actorId: adminId,
        at: "сейчас",
        createdAt: "сейчас",
        fromStatus: transition.fromStatus,
        id: transitionId,
        note: null,
        source: "admin",
        text: transition.comment,
        toStatus: transition.toStatus,
      },
    ];

    expect(
      productionLifecycleMutationPayloadMatches(JSON.stringify(request), contract),
    ).toBe(true);

    const wrongComment = structuredClone(request);
    wrongComment.payload.status_history[0]!.comment =
      "Статус изменен: Возвращено: лишний комментарий";
    expect(
      productionLifecycleMutationPayloadMismatchCode(
        JSON.stringify(wrongComment),
        contract,
      ),
    ).toBe("history_commentDigest");
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
          changedAt: row.changed_at,
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
  const exportTimestampWindow = {
    notAfter: "2026-07-14T12:01:00.000Z",
    notBefore: "2026-07-14T11:59:00.000Z",
  };
  const exportPayloadMatches = (
    body: string | null,
    key: string,
    currentNetworkContract: typeof networkContract,
    currentArtifactContract: typeof artifactContract,
  ) =>
    productionA1S1ExportPayloadMatches(
      body,
      key,
      currentNetworkContract,
      currentArtifactContract,
      exportTimestampWindow,
    );

  const draftPayload = {
    payload: {
      ...exportFixture.payload,
      corrections: exportFixture.payload.corrections.map((correction) => ({
        ...correction,
        created_by: networkContract.adminId,
      })),
      questionnaire_answers: exportFixture.payload.questionnaire_answers.map(
        (answer) => ({ ...answer, updated_by: networkContract.adminId }),
      ),
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
              updatedAt: "сейчас",
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
        id: "00000000-0000-4000-8000-000000000901",
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
      exportPayloadMatches(
        JSON.stringify(draftPayload),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(true);
    expect(
      exportPayloadMatches(
        JSON.stringify(terminalPayload),
        "POST /rest/v1/rpc/complete_export_package",
        networkContract,
        artifactContract,
      ),
    ).toBe(true);
    expect(
      exportPayloadMatches(
        JSON.stringify({ ...terminalPayload, unexpected: true }),
        "POST /rest/v1/rpc/complete_export_package",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const unexpectedTerminalPayloadKey = structuredClone(terminalPayload);
    (unexpectedTerminalPayloadKey.payload as Record<string, unknown>).unexpected = true;
    expect(
      exportPayloadMatches(
        JSON.stringify(unexpectedTerminalPayloadKey),
        "POST /rest/v1/rpc/complete_export_package",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const unexpectedBatchKey = structuredClone(terminalPayload);
    (
      unexpectedBatchKey.payload.batch as Record<string, unknown>
    ).unexpected = true;
    expect(
      exportPayloadMatches(
        JSON.stringify(unexpectedBatchKey),
        "POST /rest/v1/rpc/complete_export_package",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const unexpectedDocumentExportKey = structuredClone(terminalPayload);
    (
      unexpectedDocumentExportKey.payload.document_export as Record<string, unknown>
    ).unexpected = true;
    expect(
      exportPayloadMatches(
        JSON.stringify(unexpectedDocumentExportKey),
        "POST /rest/v1/rpc/complete_export_package",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);
    expect(
      exportPayloadMatches(
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

    const unexpectedDraftPayloadKey = structuredClone(draftPayload);
    (unexpectedDraftPayloadKey.payload as Record<string, unknown>).unexpected = true;
    expect(
      exportPayloadMatches(
        JSON.stringify(unexpectedDraftPayloadKey),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);
    expect(
      exportPayloadMatches(
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
      exportPayloadMatches(
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
      exportPayloadMatches(
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
      exportPayloadMatches(
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
      exportPayloadMatches(
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
      exportPayloadMatches(
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
      exportPayloadMatches(
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
      exportPayloadMatches(
        JSON.stringify(detachedAcceptedAt),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);

    const staleExportTimestamp = structuredClone(draftPayload);
    staleExportTimestamp.payload.submission.updated_at =
      "2026-07-14T11:58:59.000Z";
    staleExportTimestamp.payload.submission.accepted_at =
      "2026-07-14T11:58:59.000Z";
    expect(
      exportPayloadMatches(
        JSON.stringify(staleExportTimestamp),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
      ),
    ).toBe(false);
  });

  test("anchors a slow ZIP export timestamp window to the persistence request", () => {
    const slowZipPersistence = structuredClone(draftPayload);
    slowZipPersistence.payload.submission.updated_at =
      "2026-07-14T12:03:00.000Z";
    slowZipPersistence.payload.submission.accepted_at =
      "2026-07-14T12:03:00.000Z";
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(slowZipPersistence),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
        {
          notAfter: "2026-07-14T12:05:00.000Z",
          notBefore: "2026-07-14T12:02:59.000Z",
        },
      ),
    ).toBe(true);
    expect(
      productionA1S1ExportPayloadMatches(
        JSON.stringify(slowZipPersistence),
        "POST /rest/v1/rpc/save_submission_draft",
        networkContract,
        artifactContract,
        {
          notAfter: "2026-07-14T12:02:00.000Z",
          notBefore: "2026-07-14T11:59:00.000Z",
        },
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
