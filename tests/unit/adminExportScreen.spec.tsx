import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { exportSummary } from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { ExportScreen } from "../../src/modules/submissions/pages/OperationsScreens";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
});

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
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

function renderExportScreen(selection: Submission[], canDownloadMediaZip: boolean) {
  render(
    <ExportScreen
      canDownloadMediaZip={canDownloadMediaZip}
      exportBusy={false}
      exportError=""
      exportPlan={exportSummary(selection)}
      exportTab="ready"
      historyList={[]}
      onChoosePackage={vi.fn()}
      onDownload={vi.fn()}
      onDownloadMediaZip={vi.fn()}
      onGenerate={vi.fn()}
      onMarkExported={vi.fn()}
      onOpen={vi.fn()}
      onTab={vi.fn()}
      onToggle={vi.fn()}
      readyList={selection}
      searchControl={<input aria-label="Поиск" />}
      selectedExportIds={selection.map((submission) => submission.id)}
    />,
  );
}

function zipButtons() {
  return screen.getAllByRole("button", { name: "Скачать ZIP файлов" });
}

describe("admin export screen media ZIP action", () => {
  test("shows ZIP download action disabled before package generation", () => {
    const selection = [byId("ПД-1056")];

    renderExportScreen(selection, false);

    expect(zipButtons().length).toBeGreaterThan(0);
    expect(zipButtons().every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
  });

  test("enables ZIP download action after package generation", () => {
    const selection = applyExportStateToSelection(
      [byId("ПД-1056")],
      ["ПД-1056"],
      "file_generated",
    );

    renderExportScreen(selection, true);

    expect(zipButtons().some((button) => !button.hasAttribute("disabled"))).toBe(
      true,
    );
  });
});
