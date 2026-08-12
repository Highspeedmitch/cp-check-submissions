import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PlatformWarRoom from "./PlatformWarRoom";
import { api } from "../services/api";

jest.mock("../services/api", () => ({ api: { get: jest.fn() } }));

const report = {
  period: { monthLabel: "August 2026", weekLabel: "Aug 10 - Aug 16" },
  summary: {
    organizationCount: 2,
    completeCount: 0,
    onTrackCount: 1,
    atRiskCount: 1,
    behindCount: 0,
    requiredPropertyCount: 12,
    coveredPropertyCount: 12,
    completedPropertyCount: 3,
    dueThisWeekCount: 5,
    remainingThisWeekCount: 2,
  },
  organizations: [{
    organizationId: "org-hybrid",
    name: "Hybrid Client",
    serviceModel: "hybrid",
    status: "at_risk",
    statusReasons: ["Afterlight covers 10% of the portfolio; 15% is required."],
    month: {
      label: "August 2026",
      daysRemaining: 21,
      requiredPropertyCount: 10,
      coveredPropertyCount: 10,
      completedPropertyCount: 2,
      unscheduledPropertyCount: 0,
      missedPropertyCount: 0,
    },
    week: { dueAssignmentCount: 3, completedAssignmentCount: 1, remainingAssignmentCount: 2, overdueAssignmentCount: 0 },
    hybridCoverage: {
      assignedPropertyCount: 1,
      requiredAssignedPropertyCount: 2,
      totalPropertyCount: 10,
      actualPercent: 10,
      minimumPercent: 15,
      meetsMinimum: false,
    },
  }, {
    organizationId: "org-managed",
    name: "Managed Client",
    serviceModel: "managed",
    status: "on_track",
    statusReasons: [],
    month: {
      label: "August 2026",
      daysRemaining: 21,
      requiredPropertyCount: 2,
      coveredPropertyCount: 2,
      completedPropertyCount: 1,
      unscheduledPropertyCount: 0,
      missedPropertyCount: 0,
    },
    week: { dueAssignmentCount: 2, completedAssignmentCount: 2, remainingAssignmentCount: 0, overdueAssignmentCount: 0 },
    hybridCoverage: null,
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue(report);
});

test("War Room presents monthly, weekly, and Hybrid threshold health", async () => {
  render(<PlatformWarRoom onOpenOrganization={jest.fn()} />);

  const hybridCard = (await screen.findByRole("heading", { name: "Hybrid Client" })).closest("article");
  expect(within(hybridCard).getByText("At Risk")).toBeInTheDocument();
  expect(within(hybridCard).getByText("10/10")).toBeInTheDocument();
  expect(within(hybridCard).getByText("10% / 15% required")).toBeInTheDocument();
  expect(within(hybridCard).getByRole("progressbar", { name: "Hybrid Afterlight minimum progress" })).toHaveAttribute("aria-valuenow", "10");
  expect(hybridCard).toHaveTextContent("1 of 10 properties assigned to Afterlight; 2 required");
  expect(screen.getByRole("region", { name: "War Room summary" })).toHaveTextContent("12/12");
});

test("War Room filters to portfolios needing attention", async () => {
  render(<PlatformWarRoom onOpenOrganization={jest.fn()} />);
  await screen.findByRole("heading", { name: "Managed Client" });

  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "attention" } });

  expect(screen.getByRole("heading", { name: "Hybrid Client" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Managed Client" })).not.toBeInTheDocument();
});

test("War Room opens the selected organization Admin View", async () => {
  const onOpenOrganization = jest.fn();
  render(<PlatformWarRoom onOpenOrganization={onOpenOrganization} />);
  const managedCard = (await screen.findByRole("heading", { name: "Managed Client" })).closest("article");

  fireEvent.click(within(managedCard).getByRole("button", { name: "Open Admin View" }));

  await waitFor(() => expect(onOpenOrganization).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: "org-managed" })
  ));
});
