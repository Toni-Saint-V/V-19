import ReactDOM from "react-dom/client";
import { PwaInstallAssistant } from "./PwaInstallAssistant";
import { registerVisaFlowServiceWorker } from "./registerServiceWorker";
import "./pwa-shell.css";

const installRoot = document.createElement("div");
installRoot.id = "pwa-install-assistant-root";
document.body.append(installRoot);

ReactDOM.createRoot(installRoot).render(<PwaInstallAssistant />);
registerVisaFlowServiceWorker();
