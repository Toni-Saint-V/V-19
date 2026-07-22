import type { ReactNode } from "react";

import {
  noopVisaflowBusinessBridge,
  type VisaflowBusinessBridge,
} from "./visaflowBusinessBridgeContract";
import { VisaflowBusinessBridgeContext } from "./visaflowBusinessBridgeContext";

export function VisaflowBusinessBridgeProvider({
  bridge = noopVisaflowBusinessBridge,
  children,
}: {
  bridge?: VisaflowBusinessBridge;
  children: ReactNode;
}) {
  return (
    <VisaflowBusinessBridgeContext.Provider value={bridge}>
      {children}
    </VisaflowBusinessBridgeContext.Provider>
  );
}
