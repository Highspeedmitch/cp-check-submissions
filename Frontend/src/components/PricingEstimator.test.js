import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PricingEstimator, { estimateSummaryText } from "./PricingEstimator";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { post: jest.fn() },
}));

const weeklyEstimate = {
  version: 5,
  pricingMode: "single",
  estimatedPerVisitCents: 12500,
  estimatedMonthlyCents: 45000,
  managedService: {
    baseMonthlyFeeCents: 50000,
    includedInContractTotal: false,
    estimatedContractMonthlyCents: 45000,
  },
  requiresManualReview: false,
  manualReviewReasons: [],
  inputs: {
    normalizedSquareFeet: 18000,
    complexityModifier: 1,
    visitsPerMonth: 4,
    frequencyMultiplier: 3.6,
    knownIssuesProvided: false,
    sizeBenchmarkPerVisitCents: 12500,
  },
};

const clusterEstimate = {
  version: 5,
  pricingMode: "cluster",
  estimatedPerVisitCents: 10000,
  estimatedMonthlyCents: 10000,
  standalonePerVisitCents: 15000,
  standaloneMonthlyCents: 15000,
  clusterDiscountPerVisitCents: 5000,
  clusterDiscountMonthlyCents: 5000,
  managedService: {
    baseMonthlyFeeCents: 50000,
    includedInContractTotal: false,
    estimatedContractMonthlyCents: 10000,
  },
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
    standalonePerVisitCents: 5000,
    standaloneMonthlyCents: 5000,
    normalizedSquareFeet: 1500,
    complexityModifier: 0.87,
  })),
};

const routeAwareEstimate = {
  version: 5,
  pricingMode: "route_aware",
  estimatedPerVisitCents: 5000,
  estimatedMonthlyCents: 5000,
  managedService: {
    baseMonthlyFeeCents: 50000,
    includedInContractTotal: false,
    estimatedContractMonthlyCents: 5000,
  },
  basePerVisitCents: 10000,
  travelSurchargeCents: 0,
  routeCreditCents: 5000,
  portfolioCreditCents: 0,
  combinedCreditCents: 5000,
  requiresManualReview: false,
  manualReviewReasons: [],
  inputs: {
    normalizedSquareFeet: 18000,
    complexityModifier: 0.87,
    visitsPerMonth: 1,
    frequencyMultiplier: 1,
    minimumPerVisitCents: 5000,
    sizeBenchmarkPerVisitCents: 12500,
    travelPolicy: {
      includedRoundTripMiles: 10,
      includedRoundTripMinutes: 30,
      maximumTravelSurchargeRate: 0.35,
      routeSavingsPassThroughRate: 0.5,
      maximumRouteFitCreditRate: 0.7,
      maximumPortfolioCreditRate: 0.15,
      maximumCombinedCreditRate: 0.8,
    },
  },
  geography: {
    method: "road_matrix",
    provider: "mapbox",
    profile: "mapbox/driving",
    candidate: {
      id: "address.1",
      name: "100 Example Road, Tucson, Arizona 85710, United States",
      lat: 32.22,
      lng: -110.88,
    },
    home: { roundTripMiles: 8.6, roundTripMinutes: 20.64 },
    portfolio: {
      propertyCount: 2,
      densityScore: 0.4356,
      nearestPropertyDistanceMiles: 0.91,
    },
    route: {
      confidence: 0.6,
      commitment: "modeled",
      fitScore: 0.9567,
      commitmentFactor: 0.9,
      pricingBand: "direct_route",
      additionalMiles: 1.04,
      additionalMinutes: 2.5,
      modeledStopNames: ["Broadway Center", "San Clemente"],
      insertionAfterPropertyName: "Broadway Center",
      insertionBeforePropertyName: "Tucson operations base",
    },
  },
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
      includeManagedServiceFee: false,
    }
  ));
  expect(within((await screen.findByText("Estimated per visit")).closest("article"))
    .getByText("$125")).toBeInTheDocument();
  expect(screen.getByText("$450")).toBeInTheDocument();
  expect(screen.getByText("1.00x")).toBeInTheDocument();
  expect(screen.queryByText("Manual pricing review required")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining("$125 estimated per visit; $450 estimated monthly for visit service")
  ));
  expect(await screen.findByRole("status")).toHaveTextContent("Estimate summary copied.");
});

test("adds the managed-service base once when preparing a new agreement quote", async () => {
  api.post.mockResolvedValue({
    ...weeklyEstimate,
    estimatedPerVisitCents: 20000,
    estimatedMonthlyCents: 20000,
    managedService: {
      baseMonthlyFeeCents: 50000,
      includedInContractTotal: true,
      estimatedContractMonthlyCents: 70000,
    },
  });
  render(<PricingEstimator />);

  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "40000" },
  });
  fireEvent.change(screen.getByLabelText("Property type"), {
    target: { value: "strip_mall" },
  });
  fireEvent.click(screen.getByLabelText(
    "Include the organization-level $500 managed-service base in this quote"
  ));
  fireEvent.click(screen.getByRole("button", { name: "Calculate estimate" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform/pricing-estimate",
    expect.objectContaining({ includeManagedServiceFee: true })
  ));
  expect(within((await screen.findByText("Managed-service base")).closest("article"))
    .getByText("$500")).toBeInTheDocument();
  expect(within(screen.getByText("Contract monthly total").closest("article"))
    .getByText("$700")).toBeInTheDocument();
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
      includeManagedServiceFee: false,
    }
  ));
  expect(await screen.findByRole("heading", { name: "Cluster planning estimate" })).toBeInTheDocument();
  expect(screen.getByText("$150")).toBeInTheDocument();
  expect(within(screen.getByText("Cluster savings per visit").closest("article"))
    .getByText("$50")).toBeInTheDocument();
  expect(screen.getAllByText("$100")).toHaveLength(2);
  expect(screen.getByText("Additional properties at 50%")).toBeInTheDocument();
  expect(screen.getByText("Primary")).toBeInTheDocument();
});

test("calculates a portfolio-aware estimate with backend geographic context", async () => {
  api.post.mockImplementation((url) => {
    if (url === "/api/platform/pricing-locations") {
      return Promise.resolve({
        results: [{
          locationId: "address.1",
          label: "100 Example Road, Tucson, Arizona 85710, United States",
          lat: 32.22,
          lng: -110.88,
          confidence: "high",
          accuracy: "rooftop",
        }],
      });
    }
    return Promise.resolve(routeAwareEstimate);
  });
  render(<PricingEstimator organizations={[{
    organizationId: "organization-1",
    name: "Example Organization",
  }]} />);

  fireEvent.click(screen.getByRole("radio", { name: /Portfolio-aware property/ }));
  fireEvent.change(screen.getByLabelText("Organization"), {
    target: { value: "organization-1" },
  });
  fireEvent.change(screen.getByLabelText("Proposed property address"), {
    target: { value: "100 Example Road, Tucson, AZ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find address" }));
  expect(await screen.findByText("100 Example Road, Tucson, Arizona 85710, United States"))
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /100 Example Road/ }));
  expect(screen.getByText(/Confirmed location:/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "18000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Calculate estimate" }));

  await waitFor(() => expect(api.post).toHaveBeenNthCalledWith(
    2,
    "/api/platform/pricing-estimate",
    {
      pricingMode: "route_aware",
      organizationId: "organization-1",
      candidate: {
        id: "address.1",
        name: "100 Example Road, Tucson, Arizona 85710, United States",
        lat: 32.22,
        lng: -110.88,
      },
      routeCommitment: "modeled",
      grossSquareFeet: 18000,
      propertyType: "free_standing",
      serviceFrequency: "monthly",
      hasKnownIssues: false,
      includeManagedServiceFee: false,
    }
  ));
  expect(await screen.findByRole("heading", { name: "Portfolio-aware planning estimate" })).toBeInTheDocument();
  expect(within(screen.getByText("Estimated per visit").closest("article"))
    .getByText("$50")).toBeInTheDocument();
  expect(screen.getByText("Road matrix")).toBeInTheDocument();
  expect(screen.getByText("8.6 mi · 20.64 min")).toBeInTheDocument();
  expect(screen.getByText("96% · Direct-route marginal price")).toBeInTheDocument();
  expect(screen.getByText("Broadway Center → Tucson operations base")).toBeInTheDocument();
  expect(screen.getByText("Broadway Center → San Clemente")).toBeInTheDocument();
  expect(screen.queryByText("Manual pricing review required")).not.toBeInTheDocument();
});

test("portfolio-aware pricing requires a confirmed address result", async () => {
  render(<PricingEstimator organizations={[{
    organizationId: "organization-1",
    name: "Example Organization",
  }]} />);
  fireEvent.click(screen.getByRole("radio", { name: /Portfolio-aware property/ }));
  fireEvent.change(screen.getByLabelText("Organization"), {
    target: { value: "organization-1" },
  });
  fireEvent.change(screen.getByLabelText("Proposed property address"), {
    target: { value: "100 Example Road, Tucson, AZ" },
  });
  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "18000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Calculate estimate" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Find and confirm the proposed property address before calculating."
  );
  expect(api.post).not.toHaveBeenCalled();
});

test("portfolio-aware pricing labels a live-routing fallback for review", async () => {
  api.post.mockImplementation((url) => {
    if (url === "/api/platform/pricing-locations") {
      return Promise.resolve({ results: [{
        locationId: "address.1",
        label: "100 Example Road, Tucson, Arizona",
        lat: 32.22,
        lng: -110.88,
        confidence: "high",
      }] });
    }
    return Promise.resolve({
      ...routeAwareEstimate,
      requiresManualReview: true,
      manualReviewReasons: ["routing_provider_fallback"],
      geography: { ...routeAwareEstimate.geography, method: "modeled_coordinates" },
    });
  });
  render(<PricingEstimator organizations={[{
    organizationId: "organization-1",
    name: "Example Organization",
  }]} />);
  fireEvent.click(screen.getByRole("radio", { name: /Portfolio-aware property/ }));
  fireEvent.change(screen.getByLabelText("Organization"), {
    target: { value: "organization-1" },
  });
  fireEvent.change(screen.getByLabelText("Proposed property address"), {
    target: { value: "100 Example Road, Tucson, AZ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find address" }));
  fireEvent.click(await screen.findByRole("radio", { name: /100 Example Road/ }));
  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "18000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Calculate estimate" }));
  expect(await screen.findByText("Coordinate fallback")).toBeInTheDocument();
  expect(screen.getByText(/Live road routing was unavailable/)).toBeInTheDocument();
});

test("formats a copyable summary without persisting prospect information", () => {
  expect(estimateSummaryText({
    grossSquareFeet: "18000",
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  }, {
    ...weeklyEstimate,
    estimatedPerVisitCents: 10000,
    estimatedMonthlyCents: 10000,
    managedService: {
      baseMonthlyFeeCents: 50000,
      includedInContractTotal: false,
      estimatedContractMonthlyCents: 10000,
    },
  })).toBe(
    "Afterlight planning estimate: 18,000 sq ft free standing, monthly service. "
    + "$100 estimated per visit; $100 estimated monthly for visit service. "
    + "$500 organization-level managed-service base not included. "
    + "No automatic manual-review flags were identified."
  );
});

test("formats a cluster summary with its savings comparison", () => {
  expect(estimateSummaryText({ serviceFrequency: "monthly" }, clusterEstimate)).toBe(
    "Afterlight cluster planning estimate: 3 properties, monthly service. "
    + "$100 combined per visit; $100 estimated monthly for visit service. "
    + "$50 per-visit savings against $150 standalone. "
    + "$500 organization-level managed-service base not included. "
    + "No automatic manual-review flags were identified."
  );
});
