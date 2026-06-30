import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./shared/ui/system.css";

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
