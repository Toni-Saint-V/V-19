import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../src/modules/submissions/adminExportActions", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/modules/submissions/adminExportActions")
    >();
  return {
    ...actual,
    adminDocumentPackageExportEnabled: true,
    assertAdminDocumentPackageExportEnabled: vi.fn(),
  };
});

vi.mock("../../src/lib/supabase/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/supabase/client")>();
  return {
    ...actual,
    getSupabaseClient: vi.fn(() => ({})),
  };
});

import { AdminExportScreen } from "../../src/components/AdminExportScreen";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function readySubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1056");
  if (!submission) throw new Error("Missing ready export fixture ПД-1056");
  return {
    ...submission,
    files: submission.files.filter(
      (file) =>
        file.type === "passport_scan" ||
        file.type === "selfie" ||
        file.type === "selfie_2",
    ),
  };
}

describe("active admin export screen with T9 enabled", () => {
  test("commits only after the explicit confirmation click", async () => {
    const submission = readySubmission();
    const onExportPackages = vi.fn(async () => undefined);
    const exportMediaZip = await import("../../src/modules/submissions/exportMediaZip");
    const verification =
      await import("../../src/modules/submissions/exportWorkbookVerification");

    vi.spyOn(verification, "verifyExportWorkbookArtifact").mockResolvedValue(true);
    vi.spyOn(exportMediaZip, "prepareExportMediaZip").mockImplementation(
      async (_submissions, identity) => {
        if (!identity) throw new Error("Missing export identity in test");
        return {
          artifact: {
            applicantCount: 1,
            blob: new Blob(["verified-zip"], { type: "application/zip" }),
            contentType: "application/zip",
            documentAssetIds: submission.files.map((file) => file.id),
            fileCount: submission.files.length,
            fileName: `visaflow-export-${identity.idempotencyKey}_documents.zip`,
            packageIdentity: identity,
            submissionCount: 1,
            workbookFileName: identity.fileName,
          },
          ok: true,
        };
      },
    );
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:verified-export-archive"),
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <VisaflowBusinessBridgeProvider bridge={{ onExportPackages }}>
        <AdminExportScreen
          caseRevisionsBySubmissionId={new Map([[submission.id, 1]])}
          submissions={[submission]}
        />
      </VisaflowBusinessBridgeProvider>,
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Скачать ZIP + Excel" }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(onExportPackages).not.toHaveBeenCalled();

    const confirmButton = await screen.findByRole("button", {
      name: "Подтвердить скачивание",
    });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onExportPackages).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("export-action-feedback")).toHaveTextContent(
      "Скачивание подтверждено, пакет зафиксирован",
    );
  });
});
