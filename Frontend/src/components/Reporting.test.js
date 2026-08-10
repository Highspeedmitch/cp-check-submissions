import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../services/api";
import Reporting from "./Reporting";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  apiUrl: (path) => path,
}));

const monthlyData = {
  feature: {
    mode: "preview",
    enabled: true,
    automaticEmailDelivery: false,
  },
  items: [{
    _id: "summary-1",
    recipient: { name: "Jordan PM", email: "jordan@example.com" },
    periodKey: "2026-07",
    periodLabel: "July 2026",
    status: "completed",
    mode: "preview",
    propertyCount: 3,
    metrics: {
      submissionCount: 4,
      propertiesWithSubmissionsCount: 3,
      managedPropertyCount: 3,
      inspectionsWithIssuesPercent: 50,
      inspectionsWithIssuesCount: 2,
      reportableSubmissionCount: 4,
      totalIssueOccurrences: 3,
    },
    comparison: {
      submissionCountDelta: 1,
      totalIssueOccurrencesDelta: -1,
    },
    narrative: {
      executiveSummary: "Four reports were submitted across all three managed properties.",
    },
    downloadUrl: "/api/reporting/monthly-summaries/summary-1/download",
  }],
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  localStorage.setItem("role", "property_manager");
  localStorage.setItem("orgName", "Picor - DEV");
});

test("property managers can review their monthly summary archive", async () => {
  api.get.mockResolvedValue(monthlyData);
  render(
    <MemoryRouter initialEntries={["/reporting?view=monthly"]}>
      <Reporting />
    </MemoryRouter>
  );

  expect(screen.getByRole("tab", { name: "Monthly Summaries" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Executive Portfolio Summaries")).toBeInTheDocument();
  expect(await screen.findByText(/DEV preview is active/i)).toBeInTheDocument();
  expect(screen.getByText("July 2026")).toBeInTheDocument();
  expect(screen.getByText("Four reports were submitted across all three managed properties.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(api.get).toHaveBeenCalledWith("/api/reporting/monthly-summaries");
});

test("an enabled recipient can queue the previous month from Reporting", async () => {
  api.get.mockResolvedValue({ ...monthlyData, items: [] });
  api.post.mockResolvedValue({ periodLabel: "July 2026" });
  render(
    <MemoryRouter initialEntries={["/reporting?view=monthly"]}>
      <Reporting />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("button", { name: "Prepare previous month" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/reporting/monthly-summaries", {}));
  expect(await screen.findByText("July 2026 was queued for preparation.")).toBeInTheDocument();
});
