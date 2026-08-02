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
  api.get.mockImplementation(async (path) => path === "/api/fulfillment" ? settings : []);
  api.post.mockResolvedValue({ grant: "policy-grant" });
  api.put.mockResolvedValue({
    ...settings,
    organization: {
      ...settings.organization,
      serviceModel: "hybrid",
      policyVersion: 3,
    },
  });
});

test("organization policy save requires passkey verification before the update", async () => {
  render(
    <MemoryRouter>
      <ServiceDeliverySettings />
    </MemoryRouter>
  );

  fireEvent.change(await screen.findByLabelText("Service model"), {
    target: { value: "hybrid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save organization policy" }));

  expect(await screen.findByRole("heading", { name: "Save organization policy" })).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
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
      serviceModel: "hybrid",
      defaultSource: "afterlight_staff",
      adminActionGrant: "policy-grant",
    });
  });
  expect(await screen.findByText(/Organization defaults updated/)).toBeInTheDocument();
});
