import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CityFilterMenu } from "../../src/modules/submissions/components/OperationalFilters";
import { exportSummary } from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  AdminReviewScreen,
  ExportScreen,
} from "../../src/modules/submissions/pages/OperationsScreens";
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

function renderExportScreen({
  canDownloadMediaZip,
  filterControl,
  selection,
}: {
  canDownloadMediaZip: boolean;
  filterControl?: ReactNode;
  selection: Submission[];
}) {
  render(
    <ExportScreen
      canDownloadMediaZip={canDownloadMediaZip}
      exportBusy={false}
      exportError=""
      exportPlan={exportSummary(selection)}
      exportTab="ready"
      filterControl={filterControl}
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

describe("admin export screen", () => {
  test("keeps only admin-owned statuses in the alternate Review surface", () => {
    const review = byId("ПД-1053");
    const returned = byId("ПД-1048");
    const ready = byId("ПД-1056");
    const { container } = render(
      <AdminReviewScreen
        onOpen={vi.fn()}
        onSelect={vi.fn()}
        onTab={vi.fn()}
        reviewList={[review, returned, ready]}
        reviewSource={[review, returned, ready]}
        reviewTab="all"
        searchControl={<input aria-label="Поиск проверки" />}
        visibleSubmission={null}
      />,
    );

    expect(
      container.querySelector(`[data-submission-id="${review.id}"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-submission-id="${returned.id}"]`),
    ).toBeNull();
    expect(
      container.querySelector(`[data-submission-id="${ready.id}"]`),
    ).toBeNull();
  });

  test("renders the city filter in the export toolbar", () => {
    const moscowReady = byId("ПД-1056");

    renderExportScreen({
      canDownloadMediaZip: false,
      filterControl: (
        <CityFilterMenu
          options={["Все города", "Москва", "Казань"]}
          value="Москва"
          onChange={vi.fn()}
        />
      ),
      selection: [moscowReady],
    });

    expect(
      screen.getByRole("button", { name: "Фильтр по городу: Москва" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Дмитрий Орлов").length).toBeGreaterThan(0);
  });

  test("shows ZIP download action disabled before package generation", () => {
    const selection = [byId("ПД-1056")];

    renderExportScreen({ canDownloadMediaZip: false, selection });

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

    renderExportScreen({ canDownloadMediaZip: true, selection });

    expect(zipButtons().some((button) => !button.hasAttribute("disabled"))).toBe(
      true,
    );
  });
});
