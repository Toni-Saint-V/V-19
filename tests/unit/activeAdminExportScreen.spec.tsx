import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { AdminExportScreen } from "../../src/components/AdminExportScreen";
import { exportSummary } from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
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

describe("active admin export screen", () => {
  test("renders the selected package Excel Preview with all 56 contract columns and values", async () => {
    const submission = readySubmission();
    const preview = exportSummary([submission]).preview;
    const applicantEmailColumn = preview.headers.indexOf("Applicant Email");
    const passportColumn = preview.headers.indexOf("Passport No");

    render(<AdminExportScreen submissions={[submission]} />);

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
});
