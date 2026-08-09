import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PlatformFinancialOverview, { currentMonth } from "./PlatformFinancialOverview";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const overview = {
  month: "2026-08",
  basis: "assignment_start_month",
  summary: {
    assignmentCount: 3,
    billableAssignmentCount: 2,
    internalAssignmentCount: 1,
    propertyCount: 3,
    scheduledAfterlightCount: 1,
    completedAfterlightCount: 1,
    projectedRevenueCents: 40000,
    earnedRevenueCents: 22000,
    paidRevenueCents: 0,
    outstandingReceivableCents: 22000,
    projectedPayoutCents: 13500,
    earnedPayoutCents: 7500,
    projectedOperatingCostCents: 5000,
    actualOperatingCostCents: 3000,
    projectedNetCents: 21500,
    earnedNetCents: 11500,
    missingCustomerRateCount: 0,
    missingPayoutRateCount: 0,
  },
  organizations: [{
    organizationId: "org-1",
    organizationName: "PICOR",
    scheduledAfterlightCount: 1,
    completedAfterlightCount: 1,
    internalAssignmentCount: 1,
    projectedRevenueCents: 40000,
    projectedPayoutCents: 13500,
    earnedRevenueCents: 22000,
    earnedPayoutCents: 7500,
    projectedMarginCents: 26500,
  }],
  assignments: [{
    assignmentId: "assignment-1",
    organizationName: "PICOR",
    propertyName: "Commerce Center",
    startDate: "2026-08-10T00:00:00.000Z",
    status: "scheduled",
    fulfillmentSource: "afterlight_contractor",
    revenueCents: 18000,
    revenueSource: "assignment_snapshot",
    payoutCents: 6000,
    payoutSource: "assignment_snapshot",
  }],
  costs: [{
    _id: "cost-1",
    name: "AWS",
    category: "aws",
    amountCents: 3000,
    startMonth: "2026-08",
    recurrence: "monthly",
    classification: "actual",
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue(overview);
  api.post.mockResolvedValue({});
  api.put.mockResolvedValue({});
  api.delete.mockResolvedValue({});
  window.confirm = jest.fn(() => true);
});

test("financial overview presents monthly revenue, costs, and fulfillment detail", async () => {
  render(<PlatformFinancialOverview />);

  const summary = await screen.findByRole("region", { name: "Monthly financial summary" });
  expect(within(summary).getByText("Projected revenue")).toBeInTheDocument();
  expect(within(summary).getByText("$400")).toBeInTheDocument();
  expect(within(summary).getByText("$215")).toBeInTheDocument();
  expect(screen.getByText("Customer-resource assignments")).toBeInTheDocument();
  expect(screen.getAllByText("PICOR").length).toBeGreaterThan(0);
  expect(screen.getByText("Afterlight contractor")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith(
    `/api/platform-finance/overview?month=${encodeURIComponent(currentMonth())}`
  );
});

test("platform admin can add a recurring operating-cost estimate", async () => {
  render(<PlatformFinancialOverview />);
  await screen.findByRole("region", { name: "Monthly financial summary" });

  fireEvent.change(screen.getByLabelText("Cost name"), { target: { value: "Render hosting" } });
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "45.25" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "hosting" } });
  fireEvent.change(screen.getByLabelText("Timing"), { target: { value: "monthly" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform-finance/costs",
    {
      name: "Render hosting",
      amountCents: 4525,
      category: "hosting",
      startMonth: currentMonth(),
      recurrence: "monthly",
      classification: "estimated",
    }
  ));
  expect(await screen.findByText("Operating cost added.")).toBeInTheDocument();
});

test("an operating cost can be reclassified as an estimate", async () => {
  render(<PlatformFinancialOverview />);
  fireEvent.click(await screen.findByRole("button", { name: "Mark Estimated" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/platform-finance/costs/cost-1",
    { classification: "estimated" }
  ));
  expect(await screen.findByText("Cost marked estimated.")).toBeInTheDocument();
});

test("stopping a recurring cost preserves earlier months", async () => {
  render(<PlatformFinancialOverview />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop" }));

  expect(window.confirm).toHaveBeenCalledWith(
    `Stop AWS for ${currentMonth()} and future months?`
  );
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
    `/api/platform-finance/costs/cost-1?month=${encodeURIComponent(currentMonth())}`
  ));
  expect(await screen.findByText("Recurring operating cost ended.")).toBeInTheDocument();
});
