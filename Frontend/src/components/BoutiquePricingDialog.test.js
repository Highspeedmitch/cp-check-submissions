import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BoutiquePricingDialog, { boutiqueEstimateSummaryText } from "./BoutiquePricingDialog";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { post: jest.fn() },
}));

const estimate = {
  version: "boutique-1",
  pricingMode: "boutique",
  estimatedPerVisitCents: 5167,
  estimatedMonthlyCents: 5167,
  baseVisitTotalCents: 5000,
  travelAdjustmentCents: 167,
  boutiqueService: {
    baseMonthlyFeeCents: 7500,
    estimatedContractMonthlyCents: 12667,
  },
  properties: [{
    index: 0,
    name: "100 Main Street, Tucson, Arizona",
    grossSquareFeet: 4500,
    propertyType: "free_standing",
    baseVisitCents: 5000,
    travelAdjustmentCents: 167,
    estimatedPerVisitCents: 5167,
    estimatedMonthlyCents: 5167,
  }],
  geography: {
    method: "road_matrix",
    sameScheduledVisit: true,
    trips: [{
      roundTripMiles: 8,
      roundTripMinutes: 22,
      stopNames: ["100 Main Street, Tucson, Arizona"],
    }],
  },
  requiresManualReview: false,
  manualReviewReasons: [],
  inputs: {
    propertyCount: 1,
    maximumProperties: 3,
    maximumPropertySquareFeetExclusive: 5000,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  api.post.mockImplementation(async (path) => {
    if (path === "/api/platform/pricing-locations") {
      return {
        results: [{
          locationId: "location-1",
          label: "100 Main Street, Tucson, Arizona",
          lat: 32.22,
          lng: -110.93,
          confidence: "exact",
        }],
      };
    }
    if (path === "/api/platform/pricing-estimate") return estimate;
    throw new Error(`Unexpected request: ${path}`);
  });
});

test("calculates a Boutique quote with the license fee included once", async () => {
  render(<BoutiquePricingDialog onClose={jest.fn()} />);

  fireEvent.change(screen.getByLabelText("Property address"), {
    target: { value: "100 Main Street" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find address" }));
  fireEvent.click(await screen.findByLabelText(/100 Main Street, Tucson, Arizona/));
  fireEvent.change(screen.getByLabelText("Gross square footage"), {
    target: { value: "4500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Calculate Boutique estimate" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform/pricing-estimate",
    {
      pricingMode: "boutique",
      properties: [{
        grossSquareFeet: 4500,
        propertyType: "free_standing",
        candidate: {
          id: "location-1",
          name: "100 Main Street, Tucson, Arizona",
          lat: 32.22,
          lng: -110.93,
        },
      }],
      sameScheduledVisit: true,
      hasKnownIssues: false,
    }
  ));

  const result = await screen.findByRole("region", { name: "Boutique pricing result" });
  expect(result).toHaveTextContent("Organization fee$75");
  expect(result).toHaveTextContent("Monthly contract total$126.67");
  expect(result).toHaveTextContent("Base workTravelVisit total");
  expect(result).toHaveTextContent("Free standing$50$1.67$51.67");
  expect(result).toHaveTextContent("8 mi");
});

test("enforces the three-property and sub-5,000-square-foot boundaries", () => {
  render(<BoutiquePricingDialog onClose={jest.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "Add property" }));
  fireEvent.click(screen.getByRole("button", { name: "Add property" }));
  expect(screen.getByText("3 of 3 properties")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add property" })).toBeDisabled();

  const sizeInputs = screen.getAllByLabelText("Gross square footage");
  sizeInputs.forEach((input) => fireEvent.change(input, { target: { value: "5000" } }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate Boutique estimate" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/below 5,000/);
  expect(api.post).not.toHaveBeenCalledWith("/api/platform/pricing-estimate", expect.anything());
});

test("formats a concise Boutique estimate summary", () => {
  expect(boutiqueEstimateSummaryText(estimate)).toBe(
    "Afterlight Boutique estimate for 1 property. $75 monthly organization fee plus $51.67 monthly visit service. $126.67 estimated contract total per month. No automatic manual-review flags were identified."
  );
});
