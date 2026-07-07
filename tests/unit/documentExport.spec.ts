import JSZip from "jszip";
import { describe, expect, test } from "vitest";
import {
  buildDocumentsZip,
  DocumentZipBuilderError,
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
import type {
  Applicant,
  Submission,
} from "../../src/modules/submissions/types";

const exportDate = "2026-07-07";
const now = "2026-07-07T00:00:00.000Z";

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
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
  const blob = await zip.generateAsync({ type: "blob" });
  const loaded = await JSZip.loadAsync(blob);
  return Object.keys(loaded.files)
    .filter((name) => !loaded.files[name]?.dir)
    .sort();
}

describe("document export ZIP builder", () => {
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

    expect(result).toMatchObject({ applicantCount: 3, fileCount: 9 });
    expect(await zipFileNames(result.zip)).toEqual(
      expect.arrayContaining([
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/01_анна_волкова_passport.jpg",
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/01_анна_волкова_selfie_1.jpg",
        "VisaFlow_Export_2026-07-07/Москва/Семья Волковых/02_игорь_волков_selfie_2.jpg",
      ]),
    );
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
