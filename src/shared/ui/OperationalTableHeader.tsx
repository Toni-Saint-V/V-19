import type { ReactNode } from "react";

export type OperationalTableColumn = {
  key: string;
  label: ReactNode;
};

export function OperationalTableHeader({
  className = "",
  columns,
  leadingControl,
}: {
  className?: string;
  columns: OperationalTableColumn[];
  leadingControl?: ReactNode;
}) {
  return (
    <div
      className={`v19-operational-table-header ${className}`.trim()}
      role="presentation"
    >
      {leadingControl ? (
        <span className="v19-operational-table-header-control">
          {leadingControl}
        </span>
      ) : null}
      {columns.map((column) => (
        <span key={column.key}>{column.label}</span>
      ))}
    </div>
  );
}
