import type { ExportContractPreview } from "../modules/submissions/exportContract";
import { ChevronDown } from "lucide-react";

function rowCountLabel(rowCount: number): string {
  const remainder100 = rowCount % 100;
  const remainder10 = rowCount % 10;

  if (remainder100 >= 11 && remainder100 <= 14) {
    return `${rowCount} строк`;
  }
  if (remainder10 === 1) {
    return `${rowCount} строка`;
  }
  if (remainder10 >= 2 && remainder10 <= 4) {
    return `${rowCount} строки`;
  }

  return `${rowCount} строк`;
}

function previewApplicantLabel(
  headers: string[],
  row: string[],
  rowIndex: number,
) {
  const firstName = row[headers.indexOf("FirstName")] ?? "";
  const lastName = row[headers.indexOf("Surname (Family Name)")] ?? "";
  return [firstName, lastName].filter(Boolean).join(" ") || `Заявитель ${rowIndex + 1}`;
}

function previewPassportLabel(headers: string[], row: string[]) {
  return row[headers.indexOf("Passport No")] || "Паспорт не указан";
}

export function ExportWorkbookPreview({
  preview,
}: {
  preview: ExportContractPreview;
}) {
  return (
    <section
      aria-label="Данные Excel Preview"
      className="v19-excel-preview rounded-xl border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-page)] p-3"
    >
      <div className="v19-excel-preview-head mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-[var(--v19b-color-text)]">
            Excel · {rowCountLabel(preview.rows.length)}
          </h5>
          <p className="mt-1 text-xs text-[var(--v19b-color-text-muted)]">
            {preview.sheetName} · {preview.columnCount} полей
          </p>
        </div>
      </div>

      <div className="hidden max-h-80 overflow-auto rounded-lg border border-[var(--v19b-color-border)] lg:block">
        <table
          aria-label={`Excel Preview ${preview.sheetName}`}
          className="min-w-max border-collapse text-left text-xs"
        >
          <thead className="sticky top-0 z-10 bg-[var(--v19b-color-control)]">
            <tr>
              {preview.headers.map((header, columnIndex) => (
                <th
                  className="max-w-64 border-b border-r border-[var(--v19b-color-border)] px-3 py-2 align-top font-semibold text-[var(--v19b-color-text)] last:border-r-0"
                  key={`${columnIndex}-${header}`}
                  scope="col"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={`excel-preview-row-${rowIndex + 1}`}>
                {preview.headers.map((header, columnIndex) => (
                  <td
                    className="max-w-64 border-b border-r border-[var(--v19b-color-border)] px-3 py-2 align-top text-[var(--v19b-color-text-muted)] last:border-r-0"
                    key={`${rowIndex}-${columnIndex}-${header}`}
                  >
                    {row[columnIndex] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        aria-label="Excel Preview mobile"
        className="space-y-3 lg:hidden"
      >
        {preview.rows.map((row, rowIndex) => (
          <details
            aria-label={`Строка Excel ${rowIndex + 1}`}
            className="v19-excel-preview-person rounded-lg border border-[var(--v19b-color-border)] bg-[var(--v19b-color-panel)]"
            key={`excel-preview-mobile-row-${rowIndex + 1}`}
          >
            <summary className="cursor-pointer list-none text-xs text-[var(--v19b-color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)]">
              <span aria-hidden="true" className="v19-excel-preview-person-index">
                {String(rowIndex + 1).padStart(2, "0")}
              </span>
              <span className="v19-excel-preview-person-copy">
                <strong>
                  {previewApplicantLabel(preview.headers, row, rowIndex)}
                </strong>
                <span>
                  Паспорт {previewPassportLabel(preview.headers, row)}
                </span>
              </span>
              <span className="v19-excel-preview-person-count">
                {preview.columnCount}
              </span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <dl className="mt-3 space-y-2 border-t border-[var(--v19b-color-border)] pt-3">
              {preview.headers.map((header, columnIndex) => (
                <div
                  className="grid gap-1 border-b border-[var(--v19b-color-border)] pb-2 last:border-b-0 last:pb-0"
                  key={`${rowIndex}-${columnIndex}-${header}`}
                >
                  <dt className="text-xs text-[var(--v19b-color-text-faint)]">
                    {header}
                  </dt>
                  <dd className="break-words text-xs font-medium text-[var(--v19b-color-text)]">
                    {row[columnIndex] || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
    </section>
  );
}
