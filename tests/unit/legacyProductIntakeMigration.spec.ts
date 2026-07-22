import { beforeEach, describe, expect, test, vi } from "vitest";
import { migrateLegacyProductIntakeDrafts } from "../../src/modules/submissions/legacyProductIntakeMigration";
import {
  buildProductIntakeDraft,
  loadProductIntakeDrafts,
  saveProductIntakeDrafts,
  type ProductIntakeFile,
} from "../../src/modules/submissions/productIntakeFlow";
import type { Submission } from "../../src/modules/submissions/types";

function legacyRecognizedDraft() {
  const passport: ProductIntakeFile = {
    applicantIndex: 0,
    extractedFieldKeys: ["firstName", "surname", "passportNumber"],
    extractedValues: {
      firstName: "ANTON",
      passportNo: "SYNTHETIC-001",
      surname: "VOLKOV",
    },
    id: "legacy-passport",
    kind: "passport",
    name: "legacy-passport.jpg",
    progress: 100,
    status: "recognized",
  };
  const draft = buildProductIntakeDraft(
    "single",
    [passport],
    "2026-07-22T12:00:00.000Z",
  );
  return { ...draft, city: "Казань" };
}

describe("legacy product intake migration", () => {
  beforeEach(() => localStorage.clear());

  test("persists canonical OCR data without claiming serialized files were uploaded", async () => {
    saveProductIntakeDrafts([legacyRecognizedDraft()]);
    const persistSubmissions = vi.fn(
      async (submissions: Submission[]) => void submissions,
    );

    await expect(
      migrateLegacyProductIntakeDrafts({
        canonicalSubmissions: [],
        persistSubmissions,
      }),
    ).resolves.toBe(1);

    expect(persistSubmissions).toHaveBeenCalledTimes(1);
    const migrated = persistSubmissions.mock.calls[0]?.[0]?.[0];
    expect(migrated).toMatchObject({ city: "Казань", status: "draft" });
    expect(migrated?.applicants[0]?.passportExtraction).toMatchObject({
      sourceFileName: "legacy-passport.jpg",
      status: "ready",
    });
    const passport = migrated?.files.find((file) => file.type === "passport_scan");
    expect(passport).toMatchObject({
      originalFileName: undefined,
      status: "missing",
      type: "passport_scan",
      uploadStatus: "none",
    });
    expect(passport).not.toHaveProperty("storageAdapter");
    expect(loadProductIntakeDrafts()).toEqual([]);
  });

  test("does not duplicate a draft that already exists canonically", async () => {
    const draft = legacyRecognizedDraft();
    saveProductIntakeDrafts([draft]);
    const persistSubmissions = vi.fn(
      async (submissions: Submission[]) => void submissions,
    );

    await expect(
      migrateLegacyProductIntakeDrafts({
        canonicalSubmissions: [{ id: draft.id } as never],
        persistSubmissions,
      }),
    ).resolves.toBe(0);

    expect(persistSubmissions).not.toHaveBeenCalled();
    expect(loadProductIntakeDrafts()).toEqual([]);
  });
});
