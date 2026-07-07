import { describe, expect, test } from "vitest";
import {
  detectCollectionDocType,
  normalizeCollectionPassportNumber,
  passportNumberFromCollectionText,
  resolveCollectionUploadTarget,
  type CollectionApplicantIndexEntry,
} from "../../src/modules/submissions/documentCollectionIntake";

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
});
