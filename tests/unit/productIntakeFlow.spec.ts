import { describe, expect, test, vi } from "vitest";
import { persistCreatedSubmissionWithPassports } from "../../src/modules/submissions/createSubmissionPassportUseCase";
import { buildExportRows } from "../../src/modules/submissions/exportRules";
import {
  buildProductIntakeDraft,
  getPrefillPreviewFields,
  type ProductIntakeFile,
} from "../../src/modules/submissions/productIntakeFlow";
import { productIntakeDraftToPassportUploads } from "../../src/modules/submissions/productIntakeSubmissionAdapter";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";

describe("product intake passport prefill", () => {
  test("does not seed demo applicant values when no passport data was extracted", () => {
    const passportFile: ProductIntakeFile = {
      extractedFieldKeys: [],
      id: "passport-unreadable",
      kind: "passport",
      name: "passport.jpeg",
      progress: 100,
      status: "needs_review",
    };

    const draft = buildProductIntakeDraft(
      "single",
      [passportFile],
      "2026-07-07T07:00:00.000Z",
    );

    expect(draft.title).toBe("Новый заявитель");
    expect(draft.applicants[0]?.fullName).toBe("Заявитель 1");
    expect(draft.applicants[0]?.fields).toMatchObject({
      firstName: "",
      passportNo: "",
      surname: "",
    });
    expect(JSON.stringify(draft)).not.toMatch(/PETROV|IVAN|SMIRNOVA|ALINA|75 1234567/);
  });

  test("uses extracted passport values instead of demo applicant seed", () => {
    const file = new File(["passport"], "passport.jpeg", { type: "image/jpeg" });
    const passportFile: ProductIntakeFile = {
      extractedFieldKeys: ["surname", "firstName", "passportNumber"],
      extractedValues: {
        birthDate: "20.08.1990",
        firstName: "ANTON",
        passportExpiresAt: "26.02.2026",
        passportNo: "752869613",
        surname: "VOLKOV",
      },
      id: "passport-real-sample",
      kind: "passport",
      name: "passport.jpeg",
      progress: 100,
      status: "recognized",
      fileRef: file,
    };

    const draft = buildProductIntakeDraft(
      "single",
      [passportFile],
      "2026-07-07T07:00:00.000Z",
    );

    expect(draft.applicants[0]?.fields).toMatchObject({
      birthDate: "20.08.1990",
      firstName: "ANTON",
      passportExpiresAt: "26.02.2026",
      passportNo: "752869613",
      surname: "VOLKOV",
    });
    expect(getPrefillPreviewFields(draft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "surname",
          sourceFileName: "passport.jpeg",
          value: "VOLKOV",
        }),
        expect.objectContaining({
          key: "passportNo",
          sourceFileName: "passport.jpeg",
          value: "752869613",
        }),
      ]),
    );
    expect(productIntakeDraftToPassportUploads(draft)).toEqual([
      expect.objectContaining({
        applicantIndex: 0,
        file,
        fileName: "passport.jpeg",
        status: "ready",
        extractedFields: expect.arrayContaining([
          expect.objectContaining({
            key: "passportNumber",
            source: "passport_scan",
            value: "752869613",
          }),
        ]),
      }),
    ]);
  });

  test("keeps each browser passport bound to its original family applicant slot", () => {
    const unreadableFile = new File(["unreadable"], "passport-main.jpeg", {
      type: "image/jpeg",
    });
    const spouseFile = new File(["spouse"], "passport-spouse.jpeg", {
      type: "image/jpeg",
    });
    const draft = buildProductIntakeDraft(
      "family",
      [
        {
          extractedFieldKeys: [],
          fileRef: unreadableFile,
          id: "passport-main",
          kind: "passport",
          name: unreadableFile.name,
          progress: 100,
          status: "failed",
        },
        {
          extractedFieldKeys: ["surname", "firstName", "passportNumber"],
          extractedValues: {
            birthCountry: "RUS",
            firstName: "ANNA",
            passportNo: "761234567",
            surname: "PETROVA",
          },
          fileRef: spouseFile,
          id: "passport-spouse",
          kind: "passport",
          name: spouseFile.name,
          progress: 100,
          status: "recognized",
        },
      ],
      "2026-07-16T08:00:00.000Z",
    );

    const uploads = productIntakeDraftToPassportUploads(draft);

    expect(uploads).toHaveLength(2);
    expect(uploads[0]).toMatchObject({
      applicantIndex: 0,
      extractedFields: [],
      file: unreadableFile,
      status: "failed",
    });
    expect(uploads[1]).toMatchObject({
      applicantIndex: 1,
      file: spouseFile,
      status: "ready",
    });
    expect(uploads[1]?.extractedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "surname", value: "PETROVA" }),
        expect.objectContaining({ key: "firstName", value: "ANNA" }),
        expect.objectContaining({ key: "passportNumber", value: "761234567" }),
        expect.objectContaining({ key: "birthCountry", value: "Russian Federation" }),
      ]),
    );
  });

  test("keeps an explicitly selected family slot when passport files arrive out of order", () => {
    const fourthFile = new File(["fourth"], "passport-fourth.jpeg", {
      type: "image/jpeg",
    });
    const secondFile = new File(["second"], "passport-second.jpeg", {
      type: "image/jpeg",
    });
    const draft = buildProductIntakeDraft(
      "family",
      [
        {
          applicantIndex: 3,
          extractedFieldKeys: ["surname", "firstName"],
          extractedValues: { firstName: "CHILD", surname: "FOUR" },
          fileRef: fourthFile,
          id: "passport-fourth",
          kind: "passport",
          name: fourthFile.name,
          progress: 100,
          status: "recognized",
        },
        {
          applicantIndex: 1,
          extractedFieldKeys: ["surname", "firstName"],
          extractedValues: { firstName: "SPOUSE", surname: "TWO" },
          fileRef: secondFile,
          id: "passport-second",
          kind: "passport",
          name: secondFile.name,
          progress: 100,
          status: "recognized",
        },
      ],
      "2026-07-19T09:00:00.000Z",
      4,
    );

    expect(draft.applicants).toHaveLength(4);
    expect(draft.applicants.map((applicant) => applicant.fullName)).toEqual([
      "Заявитель 1",
      "SPOUSE TWO",
      "Заявитель 3",
      "CHILD FOUR",
    ]);
    expect(productIntakeDraftToPassportUploads(draft)).toEqual([
      expect.objectContaining({ applicantIndex: 3, file: fourthFile }),
      expect.objectContaining({ applicantIndex: 1, file: secondFile }),
    ]);
  });

  test("builds the requested empty family grid before any passport is uploaded", () => {
    const draft = buildProductIntakeDraft(
      "family",
      [],
      "2026-07-19T09:10:00.000Z",
      4,
    );

    expect(draft.applicants).toHaveLength(4);
    expect(draft.files).toEqual([]);
  });

  test("preserves applicant indexes when an earlier passport has no live File reference", () => {
    const secondFile = new File(["second"], "passport-second.jpeg", {
      type: "image/jpeg",
    });
    const draft = buildProductIntakeDraft(
      "family",
      [
        {
          extractedFieldKeys: [],
          id: "restored-without-file",
          kind: "passport",
          name: "passport-first.jpeg",
          progress: 100,
          status: "needs_review",
        },
        {
          extractedFieldKeys: ["surname", "firstName"],
          extractedValues: { firstName: "ELENA", surname: "SMIRNOVA" },
          fileRef: secondFile,
          id: "live-second-file",
          kind: "passport",
          name: secondFile.name,
          progress: 100,
          status: "recognized",
        },
      ],
      "2026-07-16T08:05:00.000Z",
    );

    expect(productIntakeDraftToPassportUploads(draft)).toEqual([
      expect.objectContaining({ applicantIndex: 1, file: secondFile }),
    ]);
  });

  test("keeps per-applicant passport values in separate Excel rows after canonical persistence", async () => {
    const firstFile = new File(["first"], "passport-first.jpeg", {
      type: "image/jpeg",
    });
    const secondFile = new File(["second"], "passport-second.jpeg", {
      type: "image/jpeg",
    });
    const draft = buildProductIntakeDraft(
      "family",
      [
        {
          extractedFieldKeys: ["surname", "firstName", "passportNumber"],
          extractedValues: {
            firstName: "IVAN",
            passportNo: "751111111",
            surname: "PETROV",
          },
          fileRef: firstFile,
          id: "passport-first",
          kind: "passport",
          name: firstFile.name,
          progress: 100,
          status: "recognized",
        },
        {
          extractedFieldKeys: ["surname", "firstName", "passportNumber"],
          extractedValues: {
            firstName: "ANNA",
            passportNo: "762222222",
            surname: "PETROVA",
          },
          fileRef: secondFile,
          id: "passport-second",
          kind: "passport",
          name: secondFile.name,
          progress: 100,
          status: "recognized",
        },
      ],
      "2026-07-16T08:10:00.000Z",
    );
    const uploads = productIntakeDraftToPassportUploads(draft);
    const applicantNames: string[] = [];
    for (const upload of uploads) {
      const firstName = upload.extractedFields.find(
        (field) => field.key === "firstName",
      )?.value;
      const surname = upload.extractedFields.find(
        (field) => field.key === "surname",
      )?.value;
      applicantNames[upload.applicantIndex] = [firstName, surname]
        .filter(Boolean)
        .join(" ");
    }
    const submission = createDraftSubmission({
      agentId: "00000000-0000-4000-8000-000000000001",
      applicantNames,
      city: "Москва",
      familyCount: draft.applicants.length,
      idScheme: "supabase",
      submissions: [],
      type: "family",
    });

    const persisted = await persistCreatedSubmissionWithPassports({
      onPendingSubmission: () => undefined,
      passportUploads: uploads,
      persistSubmission: async () => undefined,
      submission,
      uploadMedia: vi.fn(async (target) => ({ path: target.path })),
    });
    const rows = buildExportRows([persisted]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      applicantIndex: 1,
      applicantName: "IVAN PETROV",
      excelRowNumber: 2,
      passportNumber: "751111111",
    });
    expect(rows[1]).toMatchObject({
      applicantIndex: 2,
      applicantName: "ANNA PETROVA",
      excelRowNumber: 3,
      passportNumber: "762222222",
    });
  });
});
