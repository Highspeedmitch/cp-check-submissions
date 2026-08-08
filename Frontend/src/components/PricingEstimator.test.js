import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PricingEstimator, { estimateSummaryText } from "./PricingEstimator";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { post: jest.fn() },
}));

const weeklyEstimate = {
  version: 2,
  estimatedPerVisitCents: 25000,
  estimatedMonthlyCents: 90000,
  requiresManualReview: false,
  manualReviewReasons: [],
  inputs: {
    normalizedSquareFeet: 18000,
    complexityModifier: 1.15,
    visitsPerMonth: 4,
    frequencyMultiplier: 3.6,
    knownIssuesProvided: false,
  },
};

const clusterEstimate = {
  version: 2,
  pricingMode: "cluster",
  estimatedPerVisitCents: 15000,
  estimatedMonthlyCents: 15000,
  standalonePerVisitCents: 22500,
  standaloneMonthlyCents: 22500,
  clusterDiscountPerVisitCents: 7500,
  clusterDiscountMonthlyCents: 7500,
  requiresManualReview: false,
  manualReviewReasons: [],
  inputs: {
    propertyCount: 3,
    primaryPropertyIndex: 0,
    additionalPropertyMultiplier: 0.5,
    clusterDistanceMiles: 0.5,
    visitsPerMonth: 1,
    frequencyMultiplier: 1,
    knownIssuesProvided: false,
  },
  properties: [0, 1, 2].map((index) => ({
    index,
    grossSquareFeet: 1500,
    propertyType: "free_standing",
    standalonePerVisitCents: 7500,
    standaloneMonthlyCents: 7500,
    normalizedSquareFeet: 1500,
    complexityModifier: 1,
  })),
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

test("calculates and copies an internal pricing estimate", async () => {
  api.post.mockResolvedValue(weeklyEstimate);
  render(<PricingEstimator />);

  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "18000" },
  });
  fireEvent.change(screen.getByLabelText("Property type"), {
    target: { value: "strip_mall" },
  });
  fireEvent.change(screen.getByLabelText("Service frequency"), {
    target: { value: "weekly" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Calculate estimate" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform/pricing-estimate",
    {
      grossSquareFeet: 18000,
      propertyType: "strip_mall",
      serviceFrequency: "weekly",
      hasKnownIssues: false,
    }
  ));
  expect(await screen.findByText("$250")).toBeInTheDocument();
  expect(screen.getByText("$900")).toBeInTheDocument();
  expect(screen.getByText("1.15x")).toBeInTheDocument();
  expect(screen.queryByText("Manual pricing review required")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining("$250 estimated per visit; $900 estimated monthly")
  ));
  expect(await screen.findByRole("status")).toHaveTextContent("Estimate summary copied.");
});

test("shows manual review reasons and clears stale results when inputs change", async () => {
  api.post.mockResolvedValue({
    ...weeklyEstimate,
    estimatedMonthlyCents: null,
    requiresManualReview: true,
    manualReviewReasons: ["ad_hoc_frequency", "known_issues"],
  });
  render(<PricingEstimator />);

  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "10000" },
  });
  fireEvent.change(screen.getByLabelText("Service frequency"), {
    target: { value: "ad_hoc" },
  });
  fireEvent.click(screen.getByLabelText("Known site concerns are expected"));
  fireEvent.click(screen.getByRole("button", { name: "Calculate estimate" }));

  expect(await screen.findByText("Manual review", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByText("Manual pricing review required")).toBeInTheDocument();
  expect(screen.getByText("Ad-hoc work requires a manually prepared monthly estimate.")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "12000" },
  });
  expect(screen.queryByRole("heading", { name: "Planning estimate" })).not.toBeInTheDocument();
});

test("calculates an eligible three-property cluster with a standalone comparison", async () => {
  api.post.mockResolvedValue(clusterEstimate);
  render(<PricingEstimator />);

  fireEvent.click(screen.getByRole("radio", { name: /Property cluster/ }));
  fireEvent.change(screen.getByLabelText("Property 1 gross square footage"), {
    target: { value: "1500" },
  });
  fireEvent.change(screen.getByLabelText("Property 2 gross square footage"), {
    target: { value: "1500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add property" }));
  fireEvent.change(screen.getByLabelText("Property 3 gross square footage"), {
    target: { value: "1500" },
  });
  fireEvent.click(screen.getByLabelText("Every property is within 0.5 mile of the primary property"));
  fireEvent.click(screen.getByLabelText("Every property will be serviced during the same scheduled visit"));
  fireEvent.click(screen.getByRole("button", { name: "Calculate estimate" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform/pricing-estimate",
    {
      pricingMode: "cluster",
      properties: [0, 1, 2].map(() => ({
        grossSquareFeet: 1500,
        propertyType: "free_standing",
      })),
      serviceFrequency: "monthly",
      hasKnownIssues: false,
      withinHalfMile: true,
      sameScheduledVisit: true,
    }
  ));
  expect(await screen.findByRole("heading", { name: "Cluster planning estimate" })).toBeInTheDocument();
  expect(screen.getByText("$225")).toBeInTheDocument();
  expect(within(screen.getByText("Cluster savings per visit").closest("article"))
    .getByText("$75")).toBeInTheDocument();
  expect(screen.getAllByText("$150")).toHaveLength(2);
  expect(screen.getByText("Additional properties at 50%")).toBeInTheDocument();
  expect(screen.getByText("Primary")).toBeInTheDocument();
});

test("formats a copyable summary without persisting prospect information", () => {
  expect(estimateSummaryText({
    grossSquareFeet: "18000",
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  }, {
    ...weeklyEstimate,
    estimatedPerVisitCents: 22500,
    estimatedMonthlyCents: 22500,
  })).toBe(
    "Afterlight planning estimate: 18,000 sq ft free standing, monthly service. "
    + "$225 estimated per visit; $225 estimated monthly. "
    + "No automatic manual-review flags were identified."
  );
});

test("formats a cluster summary with its savings comparison", () => {
  expect(estimateSummaryText({ serviceFrequency: "monthly" }, clusterEstimate)).toBe(
    "Afterlight cluster planning estimate: 3 properties, monthly service. "
    + "$150 combined per visit; $150 estimated monthly. "
    + "$75 per-visit savings against $225 standalone. "
    + "No automatic manual-review flags were identified."
  );
});
