import React from "react";
import { useTheme } from "../../context/ThemeContext";

export default function ThemeToggle({ className = "" }) {
  const { darkMode, toggleTheme } = useTheme();

  return (
    <label className={`beta-theme-toggle${className ? ` ${className}` : ""}`}>
      <span>
        <strong>Dark mode</strong>
        <small>{darkMode ? "On" : "Off"}</small>
      </span>
      <input
        type="checkbox"
        checked={darkMode}
        onChange={toggleTheme}
        aria-label="Dark mode"
      />
    </label>
  );
}
