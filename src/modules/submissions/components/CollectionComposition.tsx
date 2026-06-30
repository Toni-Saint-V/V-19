import type { ReactNode } from "react";

import type { CollectionActiveFilter } from "./CollectionPrimitives";
import { ToolbarTools } from "./CollectionPrimitives";

export function compactActiveFilters(
  filters: Array<CollectionActiveFilter | false | null | undefined>,
): CollectionActiveFilter[] {
  return filters.filter((filter): filter is CollectionActiveFilter => Boolean(filter));
}

export function CollectionToolbarTools({
  desktopTools,
  mobileContextTool = null,
  mobileFilter = null,
}: {
  desktopTools?: ReactNode;
  mobileContextTool?: ReactNode;
  mobileFilter?: ReactNode;
}) {
  return (
    <ToolbarTools>
      {desktopTools ? (
        <div className="v19-desktop-toolbar-tools">{desktopTools}</div>
      ) : null}
      {mobileFilter}
      {mobileContextTool}
    </ToolbarTools>
  );
}
