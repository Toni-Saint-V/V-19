import { describe, expect, test } from "vitest";
import {
  detectCollectionDocType,
  findCollectionDocumentUpload,
  normalizeCollectionPassportNumber,
  normalizeCollectionDocuments,
  passportNumberFromCollectionText,
  resolveCollectionUploadTarget,
  upsertCollectionDocumentUpload,
  type CollectionApplicantIndexEntry,
} from "../../src/modules/submissions/documentCollectionIntake";
import type { CollectionDocumentUpload, Submission } from "../../src/modules/submissions/types";

const applicants: CollectionApplicantIndexEntry[] = [
  {
    applicantId: "app-1",
    applicantName: "VOLKOV ANTON",
    passportNumber: "752869613",
    submissionId: "SUB-1",
  },
  {
    applicantId: "app-2",
    applicantName: "PETROVA ANNA",
    passportNumber: "701234567",
    submissionId: "SUB-1",
  },
];

describe("document collection intake", () => {
  test("detects document type from common Russian and English filenames", () => {
    expect(detectCollectionDocType("752869613_passport.pdf")).toBe("passport");
    expect(detectCollectionDocType("752869613_selfie_2.jpg")).toBe("selfie2");
    expect(detectCollectionDocType("701234567_анкета.pdf")).toBe("questionnaire");
    expect(detectCollectionDocType("scan-without-context.bin")).toBe("unknown");
  });

  test("extracts and normalizes passport numbers only inside supported length", () => {
    expect(normalizeCollectionPassportNumber("75 286 9613")).toBe("752869613");
    expect(passportNumberFromCollectionText("passport_752869613_main.pdf")).toBe("752869613");
    expect(normalizeCollectionPassportNumber("123456")).toBe("");
    expect(passportNumberFromCollectionText("passport_without_number.pdf")).toBe("");
  });

  test("resolves an exact applicant and slot target", () => {
    expect(
      resolveCollectionUploadTarget({
        applicants,
        detectedDocType: "selfie",
        passportNumber: "701234567",
      }),
    ).toEqual({
      status: "matched",
      target: {
        applicantId: "app-2",
        docType: "selfie",
        submissionId: "SUB-1",
      },
    });
  });

  test("keeps ambiguous and incomplete uploads out of automatic assignment", () => {
    expect(
      resolveCollectionUploadTarget({
        applicants,
        detectedDocType: "unknown",
        passportNumber: "752869613",
      }),
    ).toMatchObject({
      reason: "Тип документа не определён по имени файла.",
      status: "unmatched",
    });

    expect(
      resolveCollectionUploadTarget({
        applicants,
        detectedDocType: "passport",
        passportNumber: "",
      }),
    ).toMatchObject({
      reason: "Номер паспорта не найден в имени файла или OCR.",
      status: "unmatched",
    });

    expect(
      resolveCollectionUploadTarget({
        applicants: [
          ...applicants,
          {
            applicantId: "app-3",
            applicantName: "DUPLICATE",
            passportNumber: "701234567",
            submissionId: "SUB-2",
          },
        ],
        detectedDocType: "questionnaire",
        passportNumber: "701234567",
      }),
    ).toMatchObject({
      reason: "Номер паспорта не дал одного точного совпадения.",
      status: "unmatched",
    });
  });

  test("normalizes only questionnaire collection uploads", () => {
    const normalized = normalizeCollectionDocuments(
      [
        {
          applicantId: "app-1",
          docType: "questionnaire",
          fileName: "form.pdf",
          id: "doc-1",
          passportNumber: "75 286 9613",
          sizeBytes: 1200,
          status: "uploaded",
          submissionId: "SUB-1",
          uploadedAtIso: "2026-07-07T09:00:00.000Z",
        },
        {
          applicantId: "app-1",
          docType: "selfie",
          fileName: "selfie.jpg",
          id: "doc-2",
          status: "uploaded",
          submissionId: "SUB-1",
        },
      ],
      "SUB-1",
    );

    expect(normalized).toEqual([
      {
        applicantId: "app-1",
        docType: "questionnaire",
        fileName: "form.pdf",
        id: "doc-1",
        mimeType: "application/octet-stream",
        passportNumber: "752869613",
        sizeBytes: 1200,
        status: "uploaded",
        submissionId: "SUB-1",
        uploadedAtIso: "2026-07-07T09:00:00.000Z",
      },
    ]);
  });

  test("upserts questionnaire records without using questionnaireStatus as file readiness", () => {
    const baseSubmission = {
      id: "SUB-1",
      applicants: [
        {
          id: "app-1",
          questionnaireStatus: "complete",
        },
      ],
      collectionDocuments: [],
      history: [],
    } as unknown as Submission;
    const record: CollectionDocumentUpload = {
      applicantId: "app-1",
      docType: "questionnaire",
      fileName: "form.pdf",
      id: "doc-1",
      mimeType: "application/pdf",
      sizeBytes: 1200,
      status: "uploaded",
      submissionId: "SUB-1",
      uploadedAtIso: "2026-07-07T09:00:00.000Z",
    };

    expect(findCollectionDocumentUpload(baseSubmission, "app-1", "questionnaire")).toBeUndefined();

    const withUpload = upsertCollectionDocumentUpload(baseSubmission, record);
    expect(findCollectionDocumentUpload(withUpload, "app-1", "questionnaire")).toMatchObject({
      fileName: "form.pdf",
      status: "uploaded",
    });

    const replaced = upsertCollectionDocumentUpload(withUpload, {
      ...record,
      fileName: "form-v2.pdf",
      id: "doc-2",
      status: "needs_review",
    });

    expect(replaced.collectionDocuments).toHaveLength(1);
    expect(findCollectionDocumentUpload(replaced, "app-1", "questionnaire")).toMatchObject({
      fileName: "form-v2.pdf",
      status: "needs_review",
    });
  });
});
