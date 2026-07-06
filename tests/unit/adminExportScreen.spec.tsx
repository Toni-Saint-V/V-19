import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ExportScreen,
} from "../../src/modules/submissions/pages/OperationsScreens";
import { exportSummary } from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { CityFilterMenu } from "../../src/modules/submissions/components/OperationalFilters";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
});

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
}

describe("admin export screen", () => {
  test("renders the city filter in the export toolbar", () => {
    const moscowReady = byId("ПД-1056");

    render(
      <ExportScreen
        exportPlan={exportSummary([])}
        exportTab="ready"
        filterControl={
          <CityFilterMenu
            options={["Все города", "Москва", "Казань"]}
            value="Москва"
            onChange={vi.fn()}
          />
        }
        historyList={[]}
        onDownload={vi.fn()}
        onGenerate={vi.fn()}
        onChoosePackage={vi.fn()}
        onMarkExported={vi.fn()}
        onOpen={vi.fn()}
        onTab={vi.fn()}
        onToggle={vi.fn()}
        readyList={[moscowReady]}
        searchControl={<label>Поиск<input /></label>}
        selectedExportIds={[]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Фильтр по городу: Москва" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Дмитрий Орлов").length).toBeGreaterThan(0);
  });
});
