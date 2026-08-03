import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ServiceDeliverySettings from "./ServiceDeliverySettings";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const settings = {
  organization: {
    id: "org-1",
    name: "Example Organization",
    serviceModel: "managed",
    defaultSource: "afterlight_staff",
    policyVersion: 2,
    updatedAt: null,
  },
  properties: [],
  options: {
    serviceModels: ["platform", "managed", "hybrid"],
    fulfillmentSources: [
      "customer_employee",
      "customer_contractor",
      "afterlight_staff",
      "afterlight_contractor",
    ],
    sourcePolicies: {
      customer_employee: { queue: "customer_assigned", invoiceRouting: "none" },
      customer_contractor: {
        queue: "customer_assigned",
        invoiceRouting: "customer_accounts_payable",
      },
      afterlight_staff: {
        queue: "afterlight_coverage",
        invoiceRouting: "afterlight_service_billing",
      },
      afterlight_contractor: {
        queue: "afterlight_coverage",
        invoiceRouting: "afterlight_service_billing",
      },
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async (path) => {
    if (path === "/api/fulfillment") return settings;
    return [];
  });
  api.post.mockImplementation(async (path, payload) => {
    if (path === "/api/organization-security/grants") return { grant: "policy-grant" };
    if (path === "/api/service-model-changes") {
      return {
        _id: "request-1",
        currentServiceModel: "managed",
        requestedServiceModel: payload.requestedServiceModel,
        reason: payload.reason,
        proposedEffectiveDate: payload.proposedEffectiveDate,
        status: "pending_review",
        createdAt: "2026-08-02T12:00:00.000Z",
        emailDelivered: true,
      };
    }
    throw new Error(`Unexpected POST ${path}`);
  });
  api.put.mockResolvedValue({
    ...settings,
    organization: {
      ...settings.organization,
      defaultSource: "afterlight_contractor",
      policyVersion: 3,
    },
  });
});

test("the service model is contract controlled while fulfillment policy remains passkey protected", async () => {
  render(
    <MemoryRouter>
      <ServiceDeliverySettings />
    </MemoryRouter>
  );

  expect(await screen.findByText("Managed service")).toBeInTheDocument();
  expect(screen.queryByLabelText("Service model")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Default fulfillment"), {
    target: { value: "afterlight_contractor" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save organization policy" }));

  expect(await screen.findByRole("heading", { name: "Save organization policy" })).toBeInTheDocument();
  expect(api.put).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Organization passkey"), {
    target: { value: "organization-passkey" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save policy" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/api/organization-security/grants", {
      purpose: "update_fulfillment_policy",
      passkey: "organization-passkey",
    });
    expect(api.put).toHaveBeenCalledWith("/api/fulfillment/organization", {
      defaultSource: "afterlight_contractor",
      adminActionGrant: "policy-grant",
    });
  });
  expect(await screen.findByText(/Organization defaults updated/)).toBeInTheDocument();
});

test("an organization administrator can request a service model change without a passkey", async () => {
  render(
    <MemoryRouter>
      <ServiceDeliverySettings />
    </MemoryRouter>
  );

  fireEvent.change(await screen.findByLabelText("Requested service model"), {
    target: { value: "hybrid" },
  });
  fireEvent.change(screen.getByLabelText("Proposed effective date (optional)"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.change(screen.getByLabelText("Business reason and operational context"), {
    target: { value: "We need overflow coverage for the fall portfolio expansion." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request service model change" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/api/service-model-changes", {
      requestedServiceModel: "hybrid",
      reason: "We need overflow coverage for the fall portfolio expansion.",
      proposedEffectiveDate: "2026-09-01",
    });
  });
  expect(api.put).not.toHaveBeenCalled();
  expect(await screen.findByText(/platform administration was notified/i)).toBeInTheDocument();
});
