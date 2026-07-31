import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";
import ThemeToggle from "../components/ui/ThemeToggle";

function ThemeValue() {
  const { theme } = useTheme();
  return <span>{theme}</span>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

test("restores a stored dark preference globally", async () => {
  localStorage.setItem("darkMode", "true");
  render(<ThemeProvider><ThemeValue /></ThemeProvider>);

  expect(screen.getByText("dark")).toBeInTheDocument();
  await waitFor(() => expect(document.documentElement).toHaveClass("dark-mode"));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
});

test("the shared toggle updates and persists the theme", async () => {
  render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
  const toggle = screen.getByRole("checkbox", { name: "Dark mode" });

  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);

  expect(toggle).toBeChecked();
  await waitFor(() => expect(localStorage.getItem("darkMode")).toBe("true"));
  expect(document.documentElement).toHaveClass("dark-mode");
});
