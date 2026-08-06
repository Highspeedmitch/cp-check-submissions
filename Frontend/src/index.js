import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./beta-ui.css";
import App from "./App";
import { installAuthenticatedFetch, installSessionLifecycle } from "./services/session";
import { registerPwa } from "./services/pwa";
import { ThemeProvider } from "./context/ThemeContext";
import { initializeFrontendMonitoring, MonitoringBoundary } from "./services/monitoring";

initializeFrontendMonitoring();
installAuthenticatedFetch();
installSessionLifecycle();
registerPwa();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <MonitoringBoundary>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </MonitoringBoundary>
);
