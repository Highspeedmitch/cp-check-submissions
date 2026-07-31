import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext({
  theme: "light",
  darkMode: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = "darkMode";

function initialTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return "dark";
    if (stored === "false") return "light";
  } catch (error) {
    // Storage can be unavailable in restrictive browser privacy modes.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  const darkMode = theme === "dark";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark-mode", darkMode);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(darkMode));
    } catch (error) {
      // The in-memory preference still applies for the current session.
    }

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", darkMode ? "#151922" : "#f4f6f9");
  }, [darkMode, theme]);

  const value = useMemo(() => ({
    theme,
    darkMode,
    setTheme,
    toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark"),
  }), [darkMode, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
