// tests/unit/activeAdminExportScreen.spec.tsx
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminExportScreen } from "../../src/components/AdminExportScreen";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
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
  test("shows only submissions that pass the canonical export readiness gate", () => {
    const ready = readySubmission();
    const returnedForRework: Submission = {
      ...ready,
      id: "RETURNED-FOR-REWORK-1",
      listTitle: "Пакет на доработке",
      status: "returned",
      title: "Пакет на доработке",
    };
    const incompletePackage: Submission = {
      ...ready,
      id: "INCOMPLETE-EXPORT-1",
      files: [],
      listTitle: "Пакет без документов",
      title: "Пакет без документов",
    };

    render(
      <AdminExportScreen
        submissions={[ready, returnedForRework, incompletePackage]}
      />,
    );

    expect(screen.getByTestId(`admin-export-row-${ready.id}`)).toBeInTheDocument();
    expect(
      screen.queryByTestId(`admin-export-row-${returnedForRework.id}`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`admin-export-row-${incompletePackage.id}`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: `Выбрать ${returnedForRework.listTitle ?? returnedForRework.title}`,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Стоп" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Доступно" })).toHaveTextContent("1");
  });

  test("keeps selection-level blockers for individually ready packages", () => {
    const ready = readySubmission();
    const crossCity = initialSubmissions.find((item) => item.id === "SUB-1103");
    if (!crossCity) {
      throw new Error("Missing cross-city export fixture SUB-1103");
    }

    render(<AdminExportScreen submissions={[ready, crossCity]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${ready.listTitle ?? ready.title}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${crossCity.listTitle ?? crossCity.title}`,
      }),
    );

    const diagnostics = screen.getByRole("region", {
      name: "Почему выгрузка остановлена",
    });
    expect(diagnostics).toHaveTextContent("Нельзя смешивать разные города");
    expect(
      screen.getByRole("region", { name: "Панель контроля выгрузки" }),
    ).toHaveTextContent("сам пакет готов");
    expect(screen.queryByRole("button", { name: "Стоп" })).not.toBeInTheDocument();
  });

  test("shows an action failure as a readable alert with a recovery step", async () => {
    const submission = readySubmission();
    const workbookVerification =
      await import("../../src/modules/submissions/exportWorkbookVerification");
    vi.spyOn(workbookVerification, "verifyExportWorkbookArtifact").mockResolvedValue(
      false,
    );

    render(<AdminExportScreen submissions={[submission]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сформировать Excel" }));

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Выгрузка не выполнена");
    expect(failure).toHaveTextContent("Excel не прошёл внутреннюю проверку");
    expect(failure).toHaveTextContent("сформируйте Excel заново");
  });

  test("does not expose a thrown technical export error", async () => {
    const submission = readySubmission();
    const workbookVerification =
      await import("../../src/modules/submissions/exportWorkbookVerification");
    vi.spyOn(workbookVerification, "verifyExportWorkbookArtifact").mockRejectedValue(
      new Error("Supabase Storage PGRST301 token=private"),
    );

    render(<AdminExportScreen submissions={[submission]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сформировать Excel" }));

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Не удалось сформировать Excel");
    expect(failure).not.toHaveTextContent("Supabase");
    expect(failure).not.toHaveTextContent("PGRST301");
    expect(failure).not.toHaveTextContent("token=private");
  });

  test("sanitizes a technical document archive failure", async () => {
    const submission = readySubmission();
    const exportMediaZip = await import("../../src/modules/submissions/exportMediaZip");
    vi.spyOn(exportMediaZip, "prepareExportMediaZip").mockResolvedValue({
      ok: false,
      reason: "storage_download_failed",
      safeMessage: "Supabase Storage private bucket PGRST301 token=private",
    });

    render(<AdminExportScreen submissions={[submission]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сформировать ZIP с Excel" }));

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent(
      "Обязательные документы сейчас недоступны для выгрузки",
    );
    expect(failure).toHaveTextContent("повторите формирование ZIP");
    expect(failure).not.toHaveTextContent("Supabase");
    expect(failure).not.toHaveTextContent("PGRST301");
    expect(failure).not.toHaveTextContent("token=private");
  });

  test("shows the canonical submission city used by export package rules", () => {
    const submission = initialSubmissions.find((item) => item.id === "SUB-1103");
    if (!submission) {
      throw new Error("Missing cross-city export fixture SUB-1103");
    }

    render(<AdminExportScreen submissions={[submission]} />);

    const row = screen.getByTestId(`admin-export-row-${submission.id}`);
    expect(within(row).getByText("Санкт-Петербург")).toBeInTheDocument();
    expect(within(row).queryByText("Москва")).not.toBeInTheDocument();
  });

  test("shows family, applicant, country, and readiness context inside export cells", () => {
    const submission = initialSubmissions.find((item) => item.id === "SUB-1102");
    if (!submission) {
      throw new Error("Missing family export fixture SUB-1102");
    }

    render(<AdminExportScreen submissions={[submission]} />);

    const row = screen.getByTestId(`admin-export-row-${submission.id}`);
    expect(within(row).getByText(submission.applicants[0]?.fullName ?? "")).toBeVisible();
    expect(
      within(row).getByText(/Волковы · 3 заявителя · 3 строки/u),
    ).toBeVisible();
    expect(within(row).getByText(submission.country)).toBeVisible();
    expect(within(row).getByText("Готовность 100%")).toBeVisible();
    expect(within(row).getByText("Даты поездки")).toBeVisible();
    expect(within(row).getByText("Город")).toBeVisible();
    expect(within(row).getByText("Агент")).toBeVisible();
  });

  test("moves the active package to the remaining selected submission", () => {
    const first = readySubmission();
    const second = initialSubmissions.find((item) => item.id === "ПД-1054");
    if (!second) {
      throw new Error("Missing ready export fixture ПД-1054");
    }

    render(<AdminExportScreen submissions={[first, second]} />);

    const firstCheckbox = screen.getByRole("checkbox", {
      name: `Выбрать ${first.listTitle ?? first.title}`,
    });
    const secondCheckbox = screen.getByRole("checkbox", {
      name: `Выбрать ${second.listTitle ?? second.title}`,
    });
    fireEvent.click(firstCheckbox);
    fireEvent.click(secondCheckbox);
    expect(
      screen.getByRole("region", { name: "Панель контроля выгрузки" }),
    ).toHaveTextContent(
      new RegExp(`Активный пакет\\s*${second.listTitle ?? second.title}`),
    );

    fireEvent.click(secondCheckbox);

    expect(firstCheckbox).toBeChecked();
    expect(secondCheckbox).not.toBeChecked();
    expect(
      screen.getByRole("region", { name: "Панель контроля выгрузки" }),
    ).toHaveTextContent(
      new RegExp(`Активный пакет\\s*${first.listTitle ?? first.title}`),
    );
  });

  test("keeps the active preview when a different selected package is removed", () => {
    const first = readySubmission();
    const second = initialSubmissions.find((item) => item.id === "ПД-1054");
    const third = initialSubmissions.find((item) => item.id === "SUB-1101");
    if (!second || !third) {
      throw new Error("Missing ready export fixtures ПД-1054 or SUB-1101");
    }

    render(<AdminExportScreen submissions={[first, second, third]} />);

    const firstCheckbox = screen.getByRole("checkbox", {
      name: `Выбрать ${first.listTitle ?? first.title}`,
    });
    const secondCheckbox = screen.getByRole("checkbox", {
      name: `Выбрать ${second.listTitle ?? second.title}`,
    });
    const thirdCheckbox = screen.getByRole("checkbox", {
      name: `Выбрать ${third.listTitle ?? third.title}`,
    });
    fireEvent.click(firstCheckbox);
    fireEvent.click(secondCheckbox);
    fireEvent.click(thirdCheckbox);
    expect(
      screen.getByRole("region", { name: "Панель контроля выгрузки" }),
    ).toHaveTextContent(
      new RegExp(`Активный пакет\\s*${third.listTitle ?? third.title}`),
    );

    fireEvent.click(firstCheckbox);

    expect(firstCheckbox).not.toBeChecked();
    expect(secondCheckbox).toBeChecked();
    expect(thirdCheckbox).toBeChecked();
    expect(
      screen.getByRole("region", { name: "Панель контроля выгрузки" }),
    ).toHaveTextContent(
      new RegExp(`Активный пакет\\s*${third.listTitle ?? third.title}`),
    );
  });

  test("renders the selected package Excel Preview with all 56 contract columns and values", async () => {
    const submission = readySubmission();
    const preview = exportSummary([submission]).preview;
    const applicantEmailColumn = preview.headers.indexOf("Applicant Email");
    const passportColumn = preview.headers.indexOf("Passport No");

    const { container } = render(<AdminExportScreen submissions={[submission]} />);
    const queueRow = screen.getByTestId(`admin-export-row-${submission.id}`);

    expect(queueRow).toHaveAttribute("data-export-state", "ready");
    expect(within(queueRow).getByText("Готов")).toBeInTheDocument();
    expect(
      within(queueRow).getByText(/Индивидуальная подача · 1 строка/u),
    ).toBeInTheDocument();
    expect(within(queueRow).getByText(submission.country)).toBeInTheDocument();
    expect(within(queueRow).getByText("Готовность 100%")).toBeInTheDocument();
    expect(container.querySelectorAll(".v19-admin-export-row-cell-v2")).toHaveLength(4);
    expect(
      container.querySelector(".v19-admin-export-row-identity-v2"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-row-city-v2"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-row-dates-v2"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-row-agent-v2"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".v19-admin-export-row-icon-v2")).toHaveLength(4);
    expect(
      container.querySelector(".v19-admin-export-row-family-count-v2"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-row-identity-v2"),
    ).toHaveTextContent(submission.applicants[0]?.fullName ?? "");

    const packageCheckbox = screen.getByRole("checkbox", {
      name: `Выбрать ${submission.listTitle ?? submission.title}`,
    });
    expect(packageCheckbox).not.toBeChecked();
    fireEvent.click(packageCheckbox);
    expect(queueRow).toHaveAttribute("data-export-state", "selected");
    expect(within(queueRow).getByText("В пакете")).toBeInTheDocument();

    const table = await screen.findByRole("table", {
      name: "Excel Preview Sheet1",
    });

    expect(within(table).getAllByRole("columnheader")).toHaveLength(56);
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(
      within(table).getByText(
        preview.rows[0]?.[applicantEmailColumn] ?? "missing-email",
      ),
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

  test("keeps packages with an ambiguous primary applicant out of export", () => {
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

    expect(
      screen.queryByTestId(`admin-export-row-${ambiguousPrimary.id}`),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Очередь выгрузки пуста")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Здесь появятся только пакеты, прошедшие все обязательные проверки.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Стоп" })).not.toBeInTheDocument();
  });

  test("shows a compact agent reference instead of a raw UUID", () => {
    const submission = {
      ...readySubmission(),
      agentId: "8d17d610-50bc-4015-88c5-2deda1d48631",
    };

    render(<AdminExportScreen submissions={[submission]} />);

    const row = screen.getByTestId(`admin-export-row-${submission.id}`);
    expect(within(row).getByText("8D17")).toBeInTheDocument();
    expect(
      row.querySelector(".v19-admin-export-row-agent-v2.is-opaque-agent"),
    ).toBeInTheDocument();
    expect(row).not.toHaveTextContent("50bc");
    expect(row).not.toHaveTextContent("2deda1d48631");
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
    expect(await screen.findByRole("link", { name: "Скачать Excel" })).toHaveAttribute(
      "href",
      "blob:verified-export-workbook",
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  test("locks rapid duplicate Excel preparation and unlocks for retry", async () => {
    const submission = readySubmission();
    const workbookVerification =
      await import("../../src/modules/submissions/exportWorkbookVerification");
    const verifyWorkbook = vi
      .spyOn(workbookVerification, "verifyExportWorkbookArtifact")
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:retry-safe-export-workbook"),
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(<AdminExportScreen submissions={[submission]} />);
    expect(screen.getByTestId(`admin-export-row-${submission.id}`)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    const prepare = screen.getByRole("button", { name: "Сформировать Excel" });

    act(() => {
      prepare.click();
      prepare.click();
    });

    expect(
      await screen.findByText("Excel не прошёл внутреннюю проверку. Файл не скачан."),
    ).toBeInTheDocument();
    expect(verifyWorkbook).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Сформировать Excel" }));
    expect(await screen.findByRole("link", { name: "Скачать Excel" })).toHaveAttribute(
      "href",
      "blob:retry-safe-export-workbook",
    );
    expect(verifyWorkbook).toHaveBeenCalledTimes(2);
  });

  test("keeps the terminal export receipt visible after the exported item leaves the queue", async () => {
    const submission = readySubmission();
    const onExportPackages = vi.fn(async () => undefined);
    const exportMediaZip = await import("../../src/modules/submissions/exportMediaZip");
    const workbookVerification =
      await import("../../src/modules/submissions/exportWorkbookVerification");
    vi.spyOn(workbookVerification, "verifyExportWorkbookArtifact").mockResolvedValue(
      true,
    );
    vi.spyOn(exportMediaZip, "prepareExportMediaZip").mockImplementation(
      async (_submissions, identity) => {
        if (!identity) throw new Error("Missing export identity in test.");
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

    const renderScreen = (items: Submission[]) => (
      <VisaflowBusinessBridgeProvider bridge={{ onExportPackages }}>
        <AdminExportScreen submissions={items} />
      </VisaflowBusinessBridgeProvider>
    );
    const view = render(renderScreen([submission]));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сформировать ZIP с Excel" }));

    const download = await screen.findByRole("link", { name: "Скачать ZIP" });
    fireEvent.click(download);
    fireEvent.click(
      await screen.findByRole("button", { name: "Подтвердить скачивание" }),
    );
    await waitFor(() => expect(onExportPackages).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("export-action-feedback")).toHaveTextContent(
      "Скачивание подтверждено, пакет зафиксирован",
    );

    view.rerender(
      renderScreen([
        {
          ...submission,
          exportState: "file_downloaded",
          exportedAt: "2026-07-28T12:00:00.000Z",
          status: "exported",
        },
      ]),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId(`admin-export-row-${submission.id}`),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("export-action-feedback")).toHaveTextContent(
      "Скачивание подтверждено, пакет зафиксирован",
    );
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
