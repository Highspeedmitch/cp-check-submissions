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
    license: {
      tier: null,
      adminLimit: null,
      userLimit: null,
      propertyLimit: null,
      planLabel: "Managed service",
    },
    defaultSource: "afterlight_staff",
    policyVersion: 2,
    updatedAt: null,
  },
  properties: [],
  options: {
    serviceModels: ["platform", "managed", "hybrid"],
    meteredServiceModels: ["platform", "hybrid"],
    licenseTiers: ["tier_1", "tier_2", "tier_3"],
    tierLimits: {
      tier_1: { adminLimit: 2, userLimit: 5, propertyLimit: 10 },
      tier_2: { adminLimit: 3, userLimit: 20, propertyLimit: 50 },
      tier_3: { adminLimit: 5, userLimit: 50, propertyLimit: 250 },
    },
    hybridPortfolioMinimums: { tier_1: 15, tier_2: 12, tier_3: 10 },
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
        changeType: payload.changeType,
        currentServiceModel: "managed",
        requestedServiceModel: payload.requestedServiceModel,
        currentLicenseTier: null,
        requestedLicenseTier: payload.requestedLicenseTier,
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

test("managed-service organizations do not see license tier controls", async () => {
  render(
    <MemoryRouter>
      <ServiceDeliverySettings />
    </MemoryRouter>
  );

  expect(await screen.findByRole("heading", { name: "Service plan" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Increase license tier" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Requested license tier")).not.toBeInTheDocument();
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
  fireEvent.change(screen.getByLabelText("Service model requested effective date (optional)"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.change(screen.getByLabelText("Service model business reason and operational context"), {
    target: { value: "We need overflow coverage for the fall portfolio expansion." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request service model change" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/api/service-model-changes", {
      changeType: "service_model",
      requestedServiceModel: "hybrid",
      requestedLicenseTier: "tier_1",
      reason: "We need overflow coverage for the fall portfolio expansion.",
      proposedEffectiveDate: "2026-09-01",
    });
  });
  expect(api.put).not.toHaveBeenCalled();
  expect(await screen.findByText(/platform administration was notified/i)).toBeInTheDocument();
});

test("a SaaS administrator can request only a higher license tier", async () => {
  const tieredSettings = {
    ...settings,
    organization: {
      ...settings.organization,
      serviceModel: "platform",
      defaultSource: "customer_employee",
      license: {
        tier: "tier_1",
        adminLimit: 2,
        userLimit: 5,
        propertyLimit: 10,
        planLabel: "Full Stack SaaS Tier 1",
      },
    },
  };
  api.get.mockImplementation(async (path) => path === "/api/fulfillment" ? tieredSettings : []);
  api.post.mockImplementation(async (path, payload) => {
    if (path !== "/api/service-model-changes") throw new Error(`Unexpected POST ${path}`);
    return {
      _id: "tier-request-1",
      changeType: "license_tier",
      currentServiceModel: "platform",
      requestedServiceModel: "platform",
      currentLicenseTier: "tier_1",
      requestedLicenseTier: payload.requestedLicenseTier,
      reason: payload.reason,
      proposedEffectiveDate: payload.proposedEffectiveDate,
      status: "pending_review",
      createdAt: "2026-08-05T12:00:00.000Z",
      emailDelivered: true,
    };
  });

  render(
    <MemoryRouter>
      <ServiceDeliverySettings />
    </MemoryRouter>
  );

  expect(await screen.findByRole("heading", { name: "Increase license tier" })).toBeInTheDocument();
  const tierSelect = screen.getByLabelText("Requested license tier");
  const tierDate = screen.getByLabelText("Tier requested effective date (optional)");
  expect(tierSelect.closest("form")).toHaveClass("beta-tier-request-form");
  expect(tierDate.closest("label")).toHaveClass("beta-contract-change-date");
  expect([...tierSelect.options].map(({ value }) => value)).toEqual(["tier_2", "tier_3"]);
  fireEvent.change(tierSelect, { target: { value: "tier_3" } });
  fireEvent.change(tierDate, {
    target: { value: "2026-10-01" },
  });
  fireEvent.change(screen.getByLabelText("Tier increase business reason and operational context"), {
    target: { value: "Our portfolio will exceed Tier 1 capacity this quarter." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request tier increase" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/api/service-model-changes", {
      changeType: "license_tier",
      requestedLicenseTier: "tier_3",
      reason: "Our portfolio will exceed Tier 1 capacity this quarter.",
      proposedEffectiveDate: "2026-10-01",
    });
  });
  expect(await screen.findByText(/License tier increase requested/)).toBeInTheDocument();
});
