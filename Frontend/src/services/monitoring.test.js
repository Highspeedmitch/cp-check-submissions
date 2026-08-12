import React from "react";
import { render, screen } from "@testing-library/react";
import { MonitoringBoundary } from "./monitoring";

function BrokenScreen() {
  throw new Error("Render failed");
}

test("shows a recovery screen even when monitoring is not configured", () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      <MonitoringBoundary>
        <BrokenScreen />
      </MonitoringBoundary>
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload app" })).toBeInTheDocument();
    expect(screen.queryByText(/problem was reported/i)).not.toBeInTheDocument();
  } finally {
    consoleError.mockRestore();
  }
});
