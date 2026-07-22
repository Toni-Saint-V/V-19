import { createContext } from "react";

import {
  noopVisaflowBusinessBridge,
  type VisaflowBusinessBridge,
} from "./visaflowBusinessBridgeContract";

export const VisaflowBusinessBridgeContext = createContext<VisaflowBusinessBridge>(
  noopVisaflowBusinessBridge,
);
