import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";  // ✅ Ensure this import exists
import "./index.css";
import "./beta-ui.css";
import App from "./App";
import { installAuthenticatedFetch, installSessionLifecycle } from "./services/session";
import { registerPwa } from "./services/pwa";
import { ThemeProvider } from "./context/ThemeContext";

installAuthenticatedFetch();
installSessionLifecycle();
registerPwa();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ThemeProvider>
    <BrowserRouter>  {/* ✅ Wrap App with BrowserRouter */}
      <App />
    </BrowserRouter>
  </ThemeProvider>
);
