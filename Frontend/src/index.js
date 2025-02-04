import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { defineCustomElements } from "@ionic/pwa-elements/loader";

// ✅ Import Ionic styles
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import './theme/variables.css'; // ✅ Add this line

// Render the App inside Ionic
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

// Load Ionic's PWA Elements for native features (Camera, File Picker, etc.)
defineCustomElements(window);

// Report performance metrics
reportWebVitals();
