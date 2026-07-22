import type { ReactNode } from "react";

import { ToolbarTools } from "./CollectionPrimitives";

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
