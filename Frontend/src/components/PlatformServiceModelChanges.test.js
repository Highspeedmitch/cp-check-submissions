import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlatformServiceModelChanges from "./PlatformServiceModelChanges";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const request = {
  _id: "request-1",
  changeType: "service_model",
  organization: { _id: "org-1", name: "Picor" },
  requestedBy: { email: "admin@picor.example" },
  currentServiceModel: "platform",
  requestedServiceModel: "hybrid",
  reason: "We need Afterlight overflow coverage.",
  proposedEffectiveDate: "2026-09-01T00:00:00.000Z",
  status: "pending_review",
  organizationSnapshot: {
    propertyCount: 5,
    propertyOverrideCount: 1,
    defaultFulfillmentSource: "customer_employee",
    currentAdminLimit: 2,
    requestedAdminLimit: 2,
    currentUserLimit: 5,
    requestedUserLimit: 5,
    currentPropertyLimit: 10,
    requestedPropertyLimit: 10,
    activeAdministratorCount: 2,
    pendingAdministratorCount: 0,
    activeUserCount: 4,
    pendingUserCount: 1,
  },
  messages: [{
    _id: "message-1",
    actorScope: "organization_admin",
    message: "We need Afterlight overflow coverage.",
    createdAt: "2026-08-02T12:00:00.000Z",
  }],
  createdAt: "2026-08-02T12:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue([request]);
  api.post.mockImplementation(async (_path, payload) => ({
    ...request,
    status: payload.action === "approve" ? "approved" : "information_requested",
    platformResponse: payload.response,
  }));
});

test("platform administrators can review organization request details", async () => {
  render(<PlatformServiceModelChanges />);

  expect(await screen.findByText("Picor")).toBeInTheDocument();
  expect(screen.getByText(/Full-stack SaaS.*Hybrid/)).toBeInTheDocument();
  expect(screen.getByText("We need Afterlight overflow coverage.")).toBeInTheDocument();
  expect(screen.getByText("admin@picor.example", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("9/1/2026")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve and apply" })).toBeInTheDocument();
});

test("requesting more information records a required platform response", async () => {
  render(<PlatformServiceModelChanges />);

  fireEvent.click(await screen.findByRole("button", { name: "Request more information" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Enter a platform response/);

  fireEvent.change(screen.getByLabelText("Platform response"), {
    target: { value: "Please provide the requested go-live date and affected properties." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request more information" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/api/service-model-changes/platform/request-1/review", {
      action: "request_information",
      response: "Please provide the requested go-live date and affected properties.",
    });
  });
  expect(await screen.findByText(/More information requested from the organization/)).toBeInTheDocument();
});

test("platform administrators see tier capacity changes without fulfillment side effects", async () => {
  api.get.mockResolvedValue([{
    ...request,
    _id: "tier-request-1",
    changeType: "license_tier",
    currentServiceModel: "hybrid",
    requestedServiceModel: "hybrid",
    currentLicenseTier: "tier_1",
    requestedLicenseTier: "tier_2",
    reason: "We need more licensed capacity.",
    organizationSnapshot: {
      ...request.organizationSnapshot,
      currentAdminLimit: 2,
      requestedAdminLimit: 3,
      currentUserLimit: 5,
      requestedUserLimit: 20,
      currentPropertyLimit: 10,
      requestedPropertyLimit: 50,
      currentAfterlightPortfolioMinimumPercent: 15,
      requestedAfterlightPortfolioMinimumPercent: 12,
    },
  }]);

  render(<PlatformServiceModelChanges />);

  expect(await screen.findByText("Tier increase")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Hybrid Tier 1.*Tier 2/ })).toBeInTheDocument();
  expect(screen.getByText("5 → 20")).toBeInTheDocument();
  expect(screen.getByText("10 → 50")).toBeInTheDocument();
  expect(screen.getByText("15% → 12%")).toBeInTheDocument();
  expect(screen.getByText(/without changing fulfillment policy/)).toBeInTheDocument();
});

test("platform administrators can review custom administrator capacity requests", async () => {
  api.get.mockResolvedValue([{
    ...request,
    _id: "capacity-request-1",
    changeType: "custom_capacity",
    currentServiceModel: "platform",
    requestedServiceModel: "platform",
    currentLicenseTier: "tier_3",
    requestedLicenseTier: "tier_3",
    reason: "We need more regional administrators.",
    organizationSnapshot: {
      ...request.organizationSnapshot,
      currentAdminLimit: 5,
      requestedAdminLimit: 8,
      currentUserLimit: 50,
      requestedUserLimit: 50,
      currentPropertyLimit: 250,
      requestedPropertyLimit: 250,
    },
  }]);

  render(<PlatformServiceModelChanges />);

  expect(await screen.findByText("Custom capacity")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "5 → 8 administrator seats" })).toBeInTheDocument();
  expect(screen.getByText(/changes only the organization's administrator-seat capacity/)).toBeInTheDocument();
  expect(screen.queryByText("Property overrides")).not.toBeInTheDocument();
});
