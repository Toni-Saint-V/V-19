import { describe, expect, test } from "vitest";

import {
  assertAdminDocumentPackageExportEnabled,
  adminDocumentPackageExportIsEnabled,
  describeAdminExportActionFeedback,
} from "../../src/modules/submissions/adminExportActions";

describe("admin export integration contract", () => {
  test("enables document ZIP T9 after the release contract opts in", () => {
    const feedback = describeAdminExportActionFeedback({
      action: "download_zip",
      blockerReasons: [],
      prepared: true,
      selectedCount: 1,
    });

    expect(feedback).toMatchObject({
      canRun: true,
      message: "Можно скачать ZIP с Excel и документами.",
      nextAction: "Скачать ZIP с Excel",
      tone: "success",
    });
    expect(feedback.message).not.toMatch(/T9|Integration Contract/);
    expect(() => assertAdminDocumentPackageExportEnabled()).not.toThrow();
  });

  test("requires explicit release metadata before document package export", () => {
    expect(adminDocumentPackageExportIsEnabled(undefined)).toBe(false);
    expect(adminDocumentPackageExportIsEnabled("blocked")).toBe(false);
    expect(adminDocumentPackageExportIsEnabled("enabled")).toBe(true);
  });
});
