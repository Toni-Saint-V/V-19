import type { ExportContractPreview } from "../modules/submissions/exportContract";

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

export function ExportWorkbookPreview({
  preview,
}: {
  preview: ExportContractPreview;
}) {
  return (
    <section
      aria-label="Данные Excel Preview"
      className="rounded-xl border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-page)] p-3"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-[var(--v19b-color-text)]">
            Excel Preview · {preview.sheetName}
          </h5>
          <p className="mt-1 text-xs text-[var(--v19b-color-text-muted)]">
            {preview.range} · {preview.columnCount} колонок · {rowCountLabel(preview.rows.length)}
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
          <article
            aria-label={`Строка Excel ${rowIndex + 1}`}
            className="rounded-lg border border-[var(--v19b-color-border)] bg-[var(--v19b-color-panel)] p-3"
            key={`excel-preview-mobile-row-${rowIndex + 1}`}
          >
            <h6 className="mb-3 text-xs font-semibold text-[var(--v19b-color-text)]">
              Заявитель {rowIndex + 1}
            </h6>
            <dl className="space-y-2">
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
          </article>
        ))}
      </div>
    </section>
  );
}
