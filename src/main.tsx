import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import "@/styles/app.css";

const container = document.getElementById("root");
if (!container) throw new Error("Le point d'ancrage #root est absent de index.html.");

function boot(container: HTMLElement) {
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

// Le jeu de fixtures ne s'inclut en production que pour une démo explicitement activée.
if (
  (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "1") ||
  import.meta.env.VITE_DEMO_MODE === "1"
) {
  void import("@/dev/mock-api").then(({ installMockApi }) => {
    installMockApi();
    boot(container);
  });
} else {
  boot(container);
}
