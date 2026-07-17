import JSZip from "jszip";
import { describe, expect, test, vi } from "vitest";
import {
  buildDocumentsZip,
  normalizePassportNumberForExport,
  type DocumentZipDownloader,
} from "../../src/modules/documents/documentExport";
import {
  DOCUMENT_TYPES,
  normalizeDocumentType,
  parseDocumentStoragePath,
  type DocumentAsset,
  type DocumentType,
} from "../../src/modules/documents/documentTypes";
import { validateDocuments } from "../../src/modules/documents/documentValidation";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { mediaStorageBucket } from "../../src/modules/submissions/mediaStoragePolicy";
import type { Applicant, Submission } from "../../src/modules/submissions/types";

const exportDate = "2026-07-07";
const now = "2026-07-07T00:00:00.000Z";

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return withVisaFormReady(submission);
}

function withVisaFormReady(submission: Submission): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: [
        ...applicant.sections,
        {
          id: "pdf-export-ready",
          title: "pdf-export-ready",
          status: "complete",
          fields: [
            questionnaireField("surname", "TEST"),
            questionnaireField("surname-at-birth", "TEST"),
            questionnaireField("first-name", "APPLICANT"),
            questionnaireField("birth-date", "1990-01-01"),
            questionnaireField("birth-place", "MOSCOW"),
            questionnaireField("birth-country", "Russian Federation"),
            questionnaireField("nationality", "Russian Federation"),
            questionnaireField("gender", "Male"),
            questionnaireField("marital-status", "Single"),
            questionnaireField("passport-type", "Ordinary Passport"),
            questionnaireField("passport-no", passportNumberFor(applicant)),
            questionnaireField("passport-issue-date", "2020-01-01"),
            questionnaireField("passport-expiry-date", "2030-01-01"),
            questionnaireField("passport-issue-country", "Russian Federation"),
            questionnaireField("passport-issue-place", "MVD"),
            questionnaireField("home-address", "1 TEST STREET"),
            questionnaireField("home-city", "MOSCOW"),
            questionnaireField("home-country", "Russian Federation"),
            questionnaireField("postal-code", "100000"),
            questionnaireField("email", "TEST@EXAMPLE.COM"),
            questionnaireField("contact-number", "70000000000"),
            questionnaireField("occupation", "ENGINEER"),
            questionnaireField("employer-name", "TEST EMPLOYER"),
            questionnaireField("purpose", "TOURISM"),
            questionnaireField("main-destination", "Spain"),
            questionnaireField("first-entry-country", "Spain"),
            questionnaireField("entry-count", "Multiple Entry"),
            questionnaireField("arrival-date", "2026-07-20"),
            questionnaireField("departure-date", "2026-07-27"),
            questionnaireField("stay-duration", "7"),
            questionnaireField("hotel-name", "TEST HOTEL"),
            questionnaireField("hotel-address", "1 HOTEL ROAD"),
            questionnaireField("hotel-city", "MADRID"),
            questionnaireField("hotel-country", "Spain"),
            questionnaireField("cost-covered-by", "Applicant"),
            questionnaireField("means-of-support", "Cash"),
          ],
        },
      ],
    })),
  };
}

function passportNumberFor(applicant: Applicant) {
  return (
    applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "passport-no")
      ?.value.trim() || "AA1234567"
  );
}

function questionnaireField(id: string, value: string) {
  return { id, label: id, value, required: true };
}

function documentAssetsFor(submission: Submission): DocumentAsset[] {
  return submission.applicants.flatMap((applicant) =>
    DOCUMENT_TYPES.map((type) => documentAsset(submission, applicant, type)),
  );
}

function documentAsset(
  submission: Submission,
  applicant: Applicant,
  type: DocumentType,
): DocumentAsset {
  const storageType = type === "selfie_1" ? "selfie" : type;
  const filename = `${storageType}.jpg`;

  return {
    applicantId: applicant.id,
    checksum: null,
    createdAt: now,
    exportStatus: "ready",
    id: `asset-${submission.id}-${applicant.id}-${type}`,
    mime: "image/jpeg",
    ownerUserId: submission.agentId,
    size: 16,
    sourceMediaAssetId: null,
    storage: {
      bucket: mediaStorageBucket,
      filename,
      path: `submissions/${submission.id}/applicants/${applicant.id}/${storageType}/${filename}`,
    },
    submissionId: submission.id,
    type,
    updatedAt: now,
    uploadedAt: now,
    uploadStatus: "uploaded",
    validatedAt: now,
    validationStatus: "passed",
  };
}

async function zipFileNames(zip: JSZip): Promise<string[]> {
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  const loaded = await JSZip.loadAsync(bytes);
  return Object.keys(loaded.files)
    .filter((name) => !loaded.files[name]?.dir)
    .sort();
}

describe("document export ZIP builder", () => {
  test("normalizes passport-only document prefixes", () => {
    expect(normalizePassportNumberForExport(" ab 12-34/56 ")).toBe("AB123456");
    expect(normalizePassportNumberForExport("  / -  ")).toBeNull();
  });

  test("normalizes legacy selfie into selfie_1", () => {
    const parsed = parseDocumentStoragePath(
      "submissions/SUB-1/applicants/APP-1/selfie/selfie.jpg",
    );

    expect(normalizeDocumentType("selfie")).toBe("selfie_1");
    expect(parsed).toMatchObject({
      applicantId: "APP-1",
      submissionId: "SUB-1",
      type: "selfie_1",
    });
  });

  test("groups a family by city and submission folder", async () => {
    const submission = byId("SUB-1102");
    const result = await buildDocumentsZip({
      assets: documentAssetsFor(submission),
      downloadAsset: async (asset) =>
        new Blob([asset.id], { type: asset.mime ?? "image/jpeg" }),
      exportDate,
      submissions: [submission],
    });

    expect(result).toMatchObject({ applicantCount: 3, fileCount: 5 });
    expect(await zipFileNames(result.zip)).toEqual(
      expect.arrayContaining([
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/660011021_passport_scan.jpg",
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/660011021_selfie_1.jpg",
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/660011021_selfie_2.jpg",
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/660011022_passport_scan.jpg",
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/660011023_passport_scan.jpg",
      ]),
    );
  });

  test("fails closed before download when any applicant has no passport number", async () => {
    const source = byId("SUB-1102");
    const submission: Submission = {
      ...source,
      applicants: source.applicants.map((applicant, index) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            index === 1 && field.id === "passport-no" ? { ...field, value: "" } : field,
          ),
        })),
      })),
    };
    const downloadAsset = vi.fn(
      async () => new Blob(["bytes"], { type: "image/jpeg" }),
    );

    await expect(
      buildDocumentsZip({
        assets: documentAssetsFor(submission),
        downloadAsset,
        exportDate,
        submissions: [submission],
      }),
    ).rejects.toMatchObject({ reason: "passport_number_missing" });
    expect(downloadAsset).not.toHaveBeenCalled();
  });

  test("does not validate questionnaire PDF fields", async () => {
    const source = byId("ПД-1056");
    const submission: Submission = {
      ...source,
      applicants: source.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "home-address" ? { ...field, value: "A".repeat(500) } : field,
          ),
        })),
      })),
    };
    const downloadAsset = vi.fn(
      async () => new Blob(["bytes"], { type: "image/jpeg" }),
    );

    const result = await buildDocumentsZip({
      assets: documentAssetsFor(submission),
      downloadAsset,
      exportDate,
      submissions: [submission],
    });
    expect(result.fileCount).toBe(3);
    expect(downloadAsset).toHaveBeenCalledTimes(3);
  });

  test("normalizes the passport number used for archive filenames", async () => {
    const source = byId("ПД-1056");
    const submission: Submission = {
      ...source,
      applicants: source.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "passport-no" ? { ...field, value: " ab 12-34/56 " } : field,
          ),
        })),
      })),
    };
    const downloadAsset = vi.fn(
      async (asset: Parameters<DocumentZipDownloader>[0]) =>
        new Blob([asset.id], { type: asset.mime ?? "image/jpeg" }),
    );

    const result = await buildDocumentsZip({
      assets: documentAssetsFor(submission),
      downloadAsset,
      exportDate,
      submissions: [submission],
    });
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/AB123456_passport_scan\.jpg$/),
      ]),
    );
    expect(downloadAsset).toHaveBeenCalledTimes(3);
  });

  test("blocks missing selfie_2", () => {
    const submission = byId("ПД-1056");
    const docs = documentAssetsFor(submission).filter(
      (asset) => asset.type !== "selfie_2",
    );

    expect(validateDocuments(docs)).toMatchObject({
      missing: ["selfie_2"],
      ok: false,
    });
  });

  test("blocks applicant ownership mismatch before download", async () => {
    const submission = byId("ПД-1056");
    const assets = documentAssetsFor(submission).map((asset, index) =>
      index === 0
        ? {
            ...asset,
            storage: {
              ...asset.storage,
              path: asset.storage.path.replace(
                `/applicants/${asset.applicantId}/`,
                "/applicants/other-applicant/",
              ),
            },
          }
        : asset,
    );

    await expect(
      buildDocumentsZip({
        assets,
        downloadAsset: async () => new Blob(["bytes"], { type: "image/jpeg" }),
        exportDate,
        submissions: [submission],
      }),
    ).rejects.toMatchObject({ reason: "media_not_ready" });
  });

  test("blocks empty storage blobs", async () => {
    const submission = byId("ПД-1056");

    await expect(
      buildDocumentsZip({
        assets: documentAssetsFor(submission),
        downloadAsset: async () => new Blob([]),
        exportDate,
        submissions: [submission],
      }),
    ).rejects.toMatchObject({ reason: "empty_file" });
  });
});
