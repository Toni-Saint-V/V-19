import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminExportScreen } from "../../src/components/AdminExportScreen";
import {
  buildExportPackageIdentity,
  exportSummary,
} from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function readySubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1056");
  if (!submission) {
    throw new Error("Missing ready export fixture ПД-1056");
  }

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => {
          if (field.id === "email") {
            return { ...field, value: "preview.user@example.test" };
          }
          if (field.id === "passport-no") {
            return { ...field, value: "991234567" };
          }

          return field;
        }),
      })),
    })),
    files: submission.files.filter(
      (file) =>
        file.type === "passport_scan" ||
        file.type === "selfie" ||
        file.type === "selfie_2",
    ),
  };
}

function changeQuestionnaireField(
  submission: Submission,
  fieldId: string,
  value: string,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) =>
          field.id === fieldId ? { ...field, value } : field,
        ),
      })),
    })),
  };
}

describe("active admin export screen", () => {
  test("renders the selected package Excel Preview with all 56 contract columns and values", async () => {
    const submission = readySubmission();
    const preview = exportSummary([submission]).preview;
    const applicantEmailColumn = preview.headers.indexOf("Applicant Email");
    const passportColumn = preview.headers.indexOf("Passport No");

    const { container } = render(<AdminExportScreen submissions={[submission]} />);

    expect(
      container.querySelector(".v19-admin-export-row-identity-v2"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-row-city-v2"),
    ).toBeInTheDocument();
    expect(container.querySelector(".v19-admin-export-row-agent-v2"))
      .toBeInTheDocument();

    const packageCheckbox = screen.getByRole("checkbox", {
      name: `Выбрать ${submission.listTitle ?? submission.title}`,
    });
    expect(packageCheckbox).not.toBeChecked();
    fireEvent.click(packageCheckbox);

    const table = await screen.findByRole("table", {
      name: "Excel Preview Sheet1",
    });

    expect(within(table).getAllByRole("columnheader")).toHaveLength(56);
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(
      within(table).getByText(preview.rows[0]?.[applicantEmailColumn] ?? "missing-email"),
    ).toBeInTheDocument();
    expect(
      within(table).getByText(preview.rows[0]?.[passportColumn] ?? "missing-passport"),
    ).toBeInTheDocument();
    expect(screen.getByText("A:BD · 56 колонок · 1 строка")).toBeInTheDocument();
  });

  test("counts only canonical family media and keeps one Excel row per tourist", async () => {
    const submission = initialSubmissions.find((item) => item.id === "SUB-1102");
    if (!submission) {
      throw new Error("Missing family export fixture SUB-1102");
    }

    render(<AdminExportScreen submissions={[submission]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );

    const table = await screen.findByRole("table", {
      name: "Excel Preview Sheet1",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("A:BD · 56 колонок · 3 строки")).toBeInTheDocument();
    expect(screen.getByText("5 файлов")).toBeInTheDocument();
    expect(screen.queryByText("9 файлов")).not.toBeInTheDocument();
  });

  test("keeps canonical media counts in package control without repeating them in the queue row", () => {
    const submission = initialSubmissions.find((item) => item.id === "SUB-1102");
    if (!submission) {
      throw new Error("Missing family export fixture SUB-1102");
    }
    const ambiguousPrimary: Submission = {
      ...submission,
      applicants: submission.applicants.map((applicant) => ({
        ...applicant,
        role: "main",
      })),
    };

    render(<AdminExportScreen submissions={[ambiguousPrimary]} />);
    fireEvent.click(screen.getByRole("button", { name: "Стоп" }));

    const filesMetric = screen.getByText("Файлы").parentElement;
    expect(filesMetric).not.toBeNull();
    expect(within(filesMetric as HTMLElement).getByText("3")).toBeInTheDocument();
    expect(screen.queryByText(/Excel \+ \d+/)).not.toBeInTheDocument();
  });

  test("prepares Excel before exposing a real browser download link", async () => {
    const submission = readySubmission();
    const createObjectURL = vi.fn(() => "blob:verified-export-workbook");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const view = render(<AdminExportScreen submissions={[submission]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сформировать Excel" }));

    const download = await screen.findByRole("link", { name: "Скачать Excel" });
    expect(download).toHaveAttribute("href", "blob:verified-export-workbook");
    expect(download).toHaveAttribute(
      "download",
      expect.stringMatching(/^visaflow-export-.+\.xlsx$/),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const refreshBase = readySubmission();
    const reviewOnlyRefresh: Submission = {
      ...refreshBase,
      applicants: refreshBase.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field, index) =>
            index === 0
              ? {
                  ...field,
                  reviewConfirmedAtIso: "2026-07-16T12:00:00.000Z",
                }
              : field,
          ),
        })),
      })),
    };
    view.rerender(<AdminExportScreen submissions={[reviewOnlyRefresh]} />);
    expect(
      await screen.findByRole("link", { name: "Скачать Excel" }),
    ).toHaveAttribute("href", "blob:verified-export-workbook");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  test("invalidates prepared downloads when a PDF-only questionnaire field changes", async () => {
    const submission = readySubmission();
    const changed = changeQuestionnaireField(
      submission,
      "main-destination",
      "Portugal",
    );
    expect(buildExportPackageIdentity([changed])).toEqual(
      buildExportPackageIdentity([submission]),
    );
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:prepared-before-questionnaire-refresh"),
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    const view = render(<AdminExportScreen submissions={[submission]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сформировать Excel" }));
    await screen.findByRole("link", { name: "Скачать Excel" });

    view.rerender(<AdminExportScreen submissions={[changed]} />);
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Скачать Excel" }),
      ).not.toBeInTheDocument(),
    );
  });
});
