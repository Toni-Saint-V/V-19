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
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import { adminDocumentPackageExportEnabled } from "../../src/modules/submissions/adminExportActions";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const exportT9Test = adminDocumentPackageExportEnabled ? test : test.skip;

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

describe("active admin export screen", () => {
  test("uses three explicit filters and the same compact card contract", () => {
    const submission = readySubmission();
    const { container } = render(<AdminExportScreen submissions={[submission]} />);

    const filters = screen.getByRole("group", { name: "Фильтры выгрузки" });
    expect(filters.querySelectorAll(".v19-admin-toolbar-select")).toHaveLength(3);
    expect(
      container.querySelector(".v19-unified-filter-popover"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-table-head-v2"),
    ).toBeInTheDocument();

    const row = screen.getByTestId(`admin-export-row-${submission.id}`);
    expect(row.querySelector(".v19-admin-export-row-identity-v2")).toBeInTheDocument();
    expect(row.querySelector(".v19-admin-export-row-dates-v2")).toBeInTheDocument();
    expect(row.querySelector(".v19-admin-export-row-city-v2")).toBeInTheDocument();
    expect(row.querySelector(".v19-admin-export-row-agent-v2")).not.toBeInTheDocument();
    expect(row.querySelector(".v19-admin-export-row-title-v2")).toHaveTextContent(
      submission.applicants[0]?.fullName ?? "",
    );
  });

  test("keeps preparation under the hood and exposes one final action", () => {
    const submission = readySubmission();
    const { container } = render(<AdminExportScreen submissions={[submission]} />);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );

    expect(screen.getByRole("region", { name: "Текущая выгрузка" })).toHaveTextContent(
      "1 пакет",
    );
    expect(
      screen.getByRole("button", {
        name: adminDocumentPackageExportEnabled
          ? "Скачать ZIP + Excel"
          : "Скачать Excel",
      }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Сформировать Excel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Сформировать ZIP с Excel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: /Excel Preview/ }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-rail-head-v2"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".v19-admin-export-rail-footer-v2"),
    ).not.toBeInTheDocument();
  });

  test("shows useful focused package details before selection", () => {
    const submission = readySubmission();
    render(<AdminExportScreen submissions={[submission]} />);

    const summary = screen.getByRole("region", { name: "Текущая выгрузка" });
    expect(summary).toHaveTextContent("Пакет в фокусе");
    expect(summary).toHaveTextContent(submission.listTitle ?? submission.title);
    expect(summary).toHaveTextContent(`${submission.completeness.total}%`);
    expect(summary).toHaveTextContent(
      `${submission.tripDateFrom} – ${submission.tripDateTo}`,
    );
    expect(summary).toHaveTextContent(submission.city);
    expect(summary).toHaveTextContent("готов к выбору");
    expect(summary).toHaveTextContent(
      "Отметьте пакет в списке, чтобы добавить его в текущую выгрузку.",
    );
    expect(within(summary).queryByText("Пакеты")).not.toBeInTheDocument();
  });

  test("puts a blocked reason and recovery guidance before statistics", () => {
    const ready = readySubmission();
    const blocked: Submission = {
      ...ready,
      id: "BLOCKED-EXPORT-1",
      listTitle: "Пакет с ошибкой",
      title: "Пакет с ошибкой",
      files: [],
    };

    render(<AdminExportScreen submissions={[ready, blocked]} />);
    fireEvent.click(screen.getByRole("button", { name: "Стоп" }));

    const diagnostics = screen.getByRole("region", {
      name: "Почему выгрузка остановлена",
    });
    expect(diagnostics).toHaveTextContent("нельзя выгрузить");
    expect(diagnostics).toHaveTextContent("Что сделать");
    expect(diagnostics).toHaveTextContent("обязательные документы");
    expect(screen.queryByText("Тихая AI-помощь")).not.toBeInTheDocument();
  });

  test("keeps selected export status ready while a blocked package is in focus", () => {
    const ready = readySubmission();
    const blocked: Submission = {
      ...ready,
      id: "BLOCKED-EXPORT-MIXED-STATE",
      listTitle: "Пакет с ошибкой",
      title: "Пакет с ошибкой",
      files: [],
    };

    render(<AdminExportScreen submissions={[ready, blocked]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${ready.listTitle ?? ready.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Стоп" }));

    const summary = screen.getByRole("region", { name: "Текущая выгрузка" });
    expect(summary).toHaveTextContent("Текущая выгрузка");
    expect(summary).toHaveTextContent("1 пакет");
    expect(summary).toHaveTextContent("готово");
    expect(summary).not.toHaveTextContent("есть блокеры");
    expect(
      screen.getByRole("region", { name: "Почему выгрузка остановлена" }),
    ).toHaveTextContent("нельзя выгрузить");
    expect(
      screen.getByRole("button", {
        name: adminDocumentPackageExportEnabled
          ? "Скачать ZIP + Excel"
          : "Скачать Excel",
      }),
    ).toBeEnabled();
  });

  test("shows the canonical submission city used by export package rules", () => {
    const submission = initialSubmissions.find((item) => item.id === "SUB-1103");
    if (!submission) throw new Error("Missing cross-city export fixture SUB-1103");

    render(<AdminExportScreen submissions={[submission]} />);

    const row = screen.getByTestId(`admin-export-row-${submission.id}`);
    expect(within(row).getByText("Санкт-Петербург")).toBeInTheDocument();
    expect(within(row).queryByText("Москва")).not.toBeInTheDocument();
  });

  test("shows a safe action failure without leaking technical details", async () => {
    const submission = readySubmission();
    const verification =
      await import("../../src/modules/submissions/exportWorkbookVerification");
    vi.spyOn(verification, "verifyExportWorkbookArtifact").mockRejectedValue(
      new Error("Supabase Storage PGRST301 token=private"),
    );

    render(<AdminExportScreen submissions={[submission]} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: adminDocumentPackageExportEnabled
          ? "Скачать ZIP + Excel"
          : "Скачать Excel",
      }),
    );

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Выгрузка не выполнена");
    expect(failure).not.toHaveTextContent("Supabase");
    expect(failure).not.toHaveTextContent("PGRST301");
    expect(failure).not.toHaveTextContent("token=private");
  });

  test("keeps verified Excel downloadable while document ZIP authority is blocked", async () => {
    if (adminDocumentPackageExportEnabled) return;

    const submission = readySubmission();
    const onExportPackages = vi.fn(async () => undefined);
    const verification =
      await import("../../src/modules/submissions/exportWorkbookVerification");
    vi.spyOn(verification, "verifyExportWorkbookArtifact").mockResolvedValue(true);
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:verified-export-workbook"),
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
        <AdminExportScreen submissions={[submission]} />
      </VisaflowBusinessBridgeProvider>,
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Выбрать ${submission.listTitle ?? submission.title}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Скачать Excel" }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(onExportPackages).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Excel скачан" })).toBeDisabled();
    expect(screen.getByTestId("export-action-feedback")).toHaveTextContent(
      "Excel скачан",
    );
  });

  exportT9Test(
    "commits a verified bundle only after explicit confirmation",
    async () => {
      const submission = readySubmission();
      const onExportPackages = vi.fn(async () => undefined);
      const exportMediaZip =
        await import("../../src/modules/submissions/exportMediaZip");
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
          <AdminExportScreen submissions={[submission]} />
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
      expect(
        await screen.findByRole("button", { name: "Подтвердить скачивание" }),
      ).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "Подтвердить скачивание" }));
      await waitFor(() => expect(onExportPackages).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("export-action-feedback")).toHaveTextContent(
        "Скачивание подтверждено, пакет зафиксирован",
      );
    },
  );
});
