import { describe, expect, test } from "vitest";
import { buildMediaSlot, normalizeSubmission } from "../../src/lib/workflow";
import {
  mapExportBatchRow,
  toAppointmentInsert,
  toApplicantInsert,
  toCorrectionInserts,
  toExportBatchInserts,
  toMediaAssetInserts,
  toSubmissionDraftPersistencePayload,
  toStatusHistoryInserts,
  toSubmissionInsert,
} from "../../src/services/submissionService";
import type { Applicant, Submission } from "../../src/types/domain";

const applicant: Applicant = {
  id: "applicant-1",
  name: "Ivan Petrov",
  role: "Заявитель",
  passport: "75 1234567",
  form: 100,
  media: 3,
  mediaRequired: 3,
  birthDate: "1990-02-10",
  citizenship: "РФ",
  address: "Moscow",
  phone: "+79001234567",
  email: "ivan@example.com",
  passportIssuedAt: "2021-03-12",
  passportExpiresAt: "2031-03-12",
  country: "Испания",
  city: "Мадрид",
  tripDates: "2026-08-20",
  hotelName: "Madrid Central",
  hotelAddress: "Gran Via 21",
  mediaSlots: [
    buildMediaSlot(
      {
        id: "applicant-1",
        name: "Ivan Petrov",
        role: "Заявитель",
        passport: "75 1234567",
        form: 100,
        media: 3,
        mediaRequired: 3,
      },
      "photo_white",
      "uploaded",
    ),
  ],
};

function makeSubmission(): Submission {
  return normalizeSubmission({
    id: "VF-1044",
    title: "Ivan Petrov",
    type: "single",
    agentId: "00000000-0000-4000-8000-000000000001",
    agentName: "Nord Travel",
    country: "Испания",
    city: "Мадрид",
    travelDate: "2026-08-20",
    updated: "2026-06-12T10:00:00.000Z",
    status: "ready_for_review",
    appointment: "not_started",
    priority: "Средний",
    fields: 0,
    media: 0,
    mediaRequired: 0,
    applicants: [applicant],
    mediaRows: [],
    notes: [],
  });
}

describe("Supabase submission mapping", () => {
  test("persists normalized submission readiness", () => {
    const submission = {
      ...makeSubmission(),
      submittedAt: "11.06.2026",
      acceptedAt: "2026-06-12T10:00:00.000Z",
    };
    const insert = toSubmissionInsert(submission);

    expect(insert.id).toBe("VF-1044");
    expect(insert.agent_id).toBe("00000000-0000-4000-8000-000000000001");
    expect(insert.readiness_percent).toBeGreaterThan(0);
    expect(insert.appointment_status).toBe("not_started");
    expect(insert.submitted_at).toBe("2026-06-11T00:00:00.000Z");
    expect(insert.accepted_at).toBe("2026-06-12T10:00:00.000Z");
  });

  test("splits legacy submission travel date ranges into durable endpoints", () => {
    const insert = toSubmissionInsert({
      ...makeSubmission(),
      travelDate: "2026-08-11 - 2026-08-20",
    });

    expect(insert.travel_date).toBe("2026-08-11 - 2026-08-20");
    expect(insert.trip_date_from).toBe("2026-08-11");
    expect(insert.trip_date_to).toBe("2026-08-20");
  });

  test("persists normalized applicant completion and safe dates", () => {
    const insert = toApplicantInsert("VF-1044", {
      ...applicant,
      birthDate: "",
      passportIssuedAt: "11.06.2026",
      passportExpiresAt: "2031-03-12",
    });

    expect(insert.submission_id).toBe("VF-1044");
    expect(insert.full_name).toBe("Ivan Petrov");
    expect(insert.questionnaire_percent).toBe(93);
    expect(insert.media_percent).toBeGreaterThan(0);
    expect(insert.birth_date).toBeNull();
    expect(insert.passport_issued_at).toBeNull();
    expect(insert.passport_expires_at).toBe("2031-03-12");
  });

  test("persists media metadata using private storage path contract", () => {
    const submission = makeSubmission();
    const mediaInserts = toMediaAssetInserts({
      ...submission,
      applicants: [
        {
          ...submission.applicants[0],
          mediaSlots: [
            {
              ...submission.applicants[0].mediaSlots![0],
              state: "accepted",
              reviewStatus: "not_reviewed",
              uploadedAt: "11.06.2026",
              reviewedAt: "2026-06-12T10:00:00.000Z",
              mimeType: "image/jpeg",
              sizeBytes: 2048,
            },
          ],
        },
      ],
    });

    expect(mediaInserts[0]).toMatchObject({
      id: "applicant-1-photo_white",
      submission_id: "VF-1044",
      applicant_id: "applicant-1",
      type: "photo_white",
      original_file_name: null,
      generated_file_name: "751234567_photo_white.jpg",
      storage_bucket: "submission-media",
      storage_path: "VF-1044/applicant-1/photo_white/751234567_photo_white.jpg",
      upload_status: "uploaded",
      review_status: "accepted",
      mime_type: "image/jpeg",
      size_bytes: 2048,
      uploaded_at: "2026-06-11T00:00:00.000Z",
      reviewed_at: "2026-06-12T10:00:00.000Z",
    });
  });

  test("preserves original media file name separately from generated storage file name", () => {
    const submission = makeSubmission();
    const [insert] = toMediaAssetInserts({
      ...submission,
      applicants: [
        {
          ...submission.applicants[0],
          mediaSlots: [
            {
              ...submission.applicants[0].mediaSlots![0],
              originalFileName: "phone_upload_name.jpg",
            },
          ],
        },
      ],
    });

    expect(insert.original_file_name).toBe("phone_upload_name.jpg");
    expect(insert.generated_file_name).toBe("751234567_photo_white.jpg");
    expect(insert.storage_path).toBe(
      "VF-1044/applicant-1/photo_white/751234567_photo_white.jpg",
    );
  });

  test("derives replacement review status from media state", () => {
    const submission = makeSubmission();
    const mediaInserts = toMediaAssetInserts({
      ...submission,
      applicants: [
        {
          ...submission.applicants[0],
          mediaSlots: [
            {
              ...submission.applicants[0].mediaSlots![0],
              state: "replace",
              reviewStatus: "not_reviewed",
            },
          ],
        },
      ],
    });

    expect(mediaInserts[0].upload_status).toBe("uploaded");
    expect(mediaInserts[0].review_status).toBe("replace_required");
  });

  test("persists corrections, timeline, export batches and appointments", () => {
    const actorId = "00000000-0000-4000-8000-000000000001";
    const submission = {
      ...makeSubmission(),
      notes: [
        {
          id: "00000000-0000-4000-8000-000000000101",
          target: "Анкета",
          text: "Уточнить адрес",
          scope: "field" as const,
          applicantId: "applicant-1",
          fieldKey: "address" as const,
          severity: "blocking" as const,
          status: "fixed" as const,
          createdBy: "00000000-0000-4000-8000-000000000999",
          createdAt: "11.06.2026",
          fixedAt: "2026-06-12T10:00:00.000Z",
        },
      ],
      timeline: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          entityType: "submission" as const,
          entityId: "VF-1044",
          fromStatus: "draft",
          toStatus: "waiting_review",
          comment: "Передано оператору",
          changedBy: actorId,
          changedAt: "11.06.2026",
        },
      ],
      exportHistory: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          createdBy: actorId,
          createdAt: "11.06.2026",
          format: "xlsx" as const,
          idempotencyKey: "export-content-1",
          fileName: "visaflow-export-export-content-1.xlsx",
          rowCount: 1,
          submissionIds: ["VF-1044"],
        },
      ],
      appointmentDetails: {
        submissionId: "VF-1044",
        status: "appointment_scheduled" as const,
        city: "Мадрид",
        date: "2026-08-20",
        time: "10:30",
        operatorComment: "Подтверждено вручную",
        updatedBy: actorId,
        updatedAt: "11.06.2026",
      },
      appointment: "appointment_scheduled" as const,
    };

    expect(toCorrectionInserts(submission, actorId)[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000101",
      submission_id: "VF-1044",
      applicant_id: "applicant-1",
      scope: "field",
      field_key: "address",
      status: "fixed",
      created_by: actorId,
      created_at: "2026-06-11T00:00:00.000Z",
      fixed_at: "2026-06-12T10:00:00.000Z",
    });
    expect(toStatusHistoryInserts(submission, actorId)[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000201",
      changed_at: "2026-06-11T00:00:00.000Z",
    });
    expect(toExportBatchInserts(submission)[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000301",
      created_at: "2026-06-11T00:00:00.000Z",
      idempotency_key: "export-content-1",
      file_name: "visaflow-export-export-content-1.xlsx",
    });
    expect(toAppointmentInsert(submission, actorId)).toMatchObject({
      submission_id: "VF-1044",
      status: "appointment_scheduled",
      date: "2026-08-20",
      updated_by: actorId,
      updated_at: "2026-06-11T00:00:00.000Z",
    });
  });

  test("builds an atomic Supabase draft payload for questionnaire, media, corrections and timeline", () => {
    const actorId = "00000000-0000-4000-8000-000000000001";
    const submission = {
      ...makeSubmission(),
      notes: [
        {
          id: "00000000-0000-4000-8000-000000000101",
          target: "Анкета",
          text: "Уточнить адрес",
        },
      ],
      timeline: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          entityType: "submission" as const,
          entityId: "VF-1044",
          toStatus: "ready_for_review",
          comment: "Готово к проверке",
          changedBy: actorId,
          changedAt: "2026-06-12T10:00:00.000Z",
        },
      ],
      exportHistory: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          createdBy: actorId,
          createdAt: "2026-06-12T10:00:00.000Z",
          format: "xlsx" as const,
          rowCount: 1,
          submissionIds: ["VF-1044"],
        },
      ],
    };

    const payload = toSubmissionDraftPersistencePayload(
      submission,
      actorId,
      new Set(["00000000-0000-4000-8000-000000000201"]),
    );

    expect(payload.submission.id).toBe("VF-1044");
    expect(payload.applicants).toHaveLength(1);
    expect(payload.media_assets.map((item) => item.type).sort()).toEqual([
      "passport_scan",
      "photo_white",
      "selfie",
      "selfie_2",
    ]);
    expect(payload.status_history).toHaveLength(0);
    expect(payload.corrections).toHaveLength(1);
    expect(payload.corrections[0]).toMatchObject({
      submission_id: "VF-1044",
      reason: "Уточнить адрес",
      status: "open",
    });
    expect(payload).not.toHaveProperty("export_batches");
    expect(payload).not.toHaveProperty("appointments");
  });

  test("maps export batch identity from Supabase rows while tolerating legacy nulls", () => {
    expect(
      mapExportBatchRow({
        id: "00000000-0000-4000-8000-000000000301",
        created_by: "00000000-0000-4000-8000-000000000001",
        created_at: "2026-06-11T00:00:00.000Z",
        format: "xlsx",
        content_fingerprint: "xlsx|1|VF-1044",
        idempotency_key: "export-content-1",
        file_name: "visaflow-export-export-content-1.xlsx",
        row_count: 1,
        submission_ids: ["VF-1044"],
      }),
    ).toMatchObject({
      id: "00000000-0000-4000-8000-000000000301",
      idempotencyKey: "export-content-1",
      contentFingerprint: "xlsx|1|VF-1044",
      fileName: "visaflow-export-export-content-1.xlsx",
    });

    expect(
      mapExportBatchRow({
        id: "00000000-0000-4000-8000-000000000302",
        created_by: "00000000-0000-4000-8000-000000000001",
        created_at: "2026-06-11T00:00:00.000Z",
        format: "csv",
        content_fingerprint: null,
        idempotency_key: null,
        file_name: null,
        row_count: 1,
        submission_ids: ["VF-1044"],
      }),
    ).not.toHaveProperty("idempotencyKey");
  });
});
