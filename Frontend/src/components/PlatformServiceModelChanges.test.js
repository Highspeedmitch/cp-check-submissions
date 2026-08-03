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
