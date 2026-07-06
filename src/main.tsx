import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./shared/ui/tokens/index.css";
import "./shared/ui/system.css";
import "./shared/ui/visual-baseline.css";
import "./shared/ui/linear-workspace.css";
import "./shared/ui/v19-constructor.css";
import "./shared/ui/v19-product-kit.css";
import "./shared/ui/side-menu-button.css";
import "./shared/ui/v19-workflow-premium.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

const appRoot = root;

function renderApp() {
  createRoot(appRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

renderApp();
