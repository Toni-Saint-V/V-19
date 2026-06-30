import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

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

void import("./styles.deferred-a.css")
  .then(() => import("./styles.deferred-b.css"))
  .then(() => import("./styles.sidebar-contract.css"))
  .then(renderApp, renderApp);
