import { describe, expect, test } from "vitest";

import {
  assertAdminDocumentPackageExportEnabled,
  adminDocumentPackageExportIsEnabled,
  describeAdminExportActionFeedback,
} from "../../src/modules/submissions/adminExportActions";

describe("admin export integration contract", () => {
  test("blocks document ZIP T9 while Excel T8 remains the active artifact", () => {
    const feedback = describeAdminExportActionFeedback({
      action: "download_zip",
      blockerReasons: [],
      prepared: true,
      selectedCount: 1,
    });

    expect(feedback).toMatchObject({
      canRun: false,
      nextAction: "Только Excel",
      tone: "warning",
    });
    expect(feedback.message).toMatch(/T9|каноническим контрактом/);
    expect(() => assertAdminDocumentPackageExportEnabled()).toThrow(
      /T9.*Excel T8/,
    );
  });

  test("requires explicit release metadata before document package export", () => {
    expect(adminDocumentPackageExportIsEnabled(undefined)).toBe(false);
    expect(adminDocumentPackageExportIsEnabled("blocked")).toBe(false);
    expect(adminDocumentPackageExportIsEnabled("enabled")).toBe(true);
  });
});
