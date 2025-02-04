import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import './theme/variables.css'; // ✅ Add this line

// Render the App inside Ionic
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

// Load Ionic's PWA Elements for native features (Camera, File Picker, etc.)
defineCustomElements(window);

// Report performance metrics
reportWebVitals();
