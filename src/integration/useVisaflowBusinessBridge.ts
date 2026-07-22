import { useContext } from "react";

import { VisaflowBusinessBridgeContext } from "./visaflowBusinessBridgeContext";

export function useVisaflowBusinessBridge() {
  return useContext(VisaflowBusinessBridgeContext);
}
