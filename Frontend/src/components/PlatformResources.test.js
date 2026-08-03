import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PlatformResources from "./PlatformResources";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const dashboard = {
  resources: [
    {
      _id: "resource-1",
      displayName: "Alpha Resource",
      email: "alpha@example.com",
      resourceType: "contractor",
      skills: ["inspections", "lighting"],
      regions: ["Tucson"],
      defaultRateCents: 7500,
      availabilityStatus: "available",
      status: "active",
      gusto: { contractorUuid: "", onboardingStatus: "onboarding_completed" },
    },
    {
      _id: "resource-2",
      displayName: "Bravo Employee",
      email: "bravo@example.com",
      resourceType: "employee",
      skills: ["photography"],
      regions: ["Phoenix"],
      defaultRateCents: 0,
      availabilityStatus: "unavailable",
      status: "onboarding",
      gusto: {},
    },
    {
      _id: "resource-3",
      displayName: "Charlie Contractor",
      email: "charlie@example.com",
      resourceType: "contractor",
      skills: ["inspections"],
      regions: ["Flagstaff"],
      defaultRateCents: 8000,
      availabilityStatus: "available",
      status: "suspended",
      gusto: { contractorUuid: "", onboardingStatus: "self_onboarding_review" },
    },
  ],
  deployments: [
    {
      _id: "deployment-1",
      resourceProfileId: "resource-1",
      organizationId: {
        _id: "org-1",
        name: "Atlas Management",
        properties: [{ _id: "property-1", name: "Property A" }],
      },
      propertyIds: ["property-1"],
      rateOverrideCents: 9000,
      status: "active",
    },
    {
      _id: "deployment-2",
      resourceProfileId: "resource-3",
      organizationId: {
        _id: "org-2",
        name: "Beacon Partners",
        properties: [],
      },
      propertyIds: [],
      rateOverrideCents: null,
      status: "paused",
    },
  ],
  organizations: [
    { _id: "org-1", name: "Atlas Management", serviceModel: "managed", properties: [{ _id: "property-1", name: "Property A" }] },
    { _id: "org-2", name: "Beacon Partners", serviceModel: "hybrid", properties: [] },
  ],
  earnings: [],
  payoutBatches: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue(dashboard);
  api.put.mockResolvedValue({});
  api.post.mockResolvedValue({});
});

test("resource profiles are compact by default and expose the editor on demand", async () => {
  render(<PlatformResources />);

  const heading = await screen.findByRole("heading", { name: "Alpha Resource" });
  const card = heading.closest("article");

  expect(within(card).getByRole("link", { name: "alpha@example.com" })).toHaveAttribute("href", "mailto:alpha@example.com");
  expect(within(card).getByText("Atlas Management")).toBeInTheDocument();
  expect(within(card).queryByDisplayValue("Alpha Resource")).not.toBeInTheDocument();

  fireEvent.click(within(card).getByRole("button", { name: "Edit details" }));

  expect(within(card).getByDisplayValue("Alpha Resource")).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "Close details" })).toHaveAttribute("aria-expanded", "true");
});

test("resource directory supports search, status, availability, and organization filters", async () => {
  render(<PlatformResources />);
  await screen.findByRole("heading", { name: "Alpha Resource" });

  fireEvent.change(screen.getByLabelText("Search resources"), { target: { value: "bravo@example.com" } });
  expect(screen.getByRole("heading", { name: "Bravo Employee" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Alpha Resource" })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Search resources"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Resource status"), { target: { value: "active" } });
  expect(screen.getByRole("heading", { name: "Alpha Resource" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Bravo Employee" })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Resource status"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Resource availability"), { target: { value: "unavailable" } });
  expect(screen.getByRole("heading", { name: "Bravo Employee" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Alpha Resource" })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Resource availability"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Deployed organization"), { target: { value: "org-2" } });
  expect(screen.getByRole("heading", { name: "Charlie Contractor" })).toBeInTheDocument();
  expect(screen.getByText("Beacon Partners (paused)")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Alpha Resource" })).not.toBeInTheDocument();
});

test("expanded resource details retain the existing save workflow", async () => {
  render(<PlatformResources />);

  const heading = await screen.findByRole("heading", { name: "Alpha Resource" });
  const card = heading.closest("article");
  fireEvent.click(within(card).getByRole("button", { name: "Edit details" }));
  fireEvent.change(within(card).getByLabelText("Default contractor pay rate"), { target: { value: "90.00" } });
  fireEvent.click(within(card).getByRole("button", { name: "Save Resource" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/platform-resources/resources/resource-1",
    expect.objectContaining({
      displayName: "Alpha Resource",
      resourceType: "contractor",
      defaultRateCents: 9000,
      availabilityStatus: "available",
      status: "active",
      gustoOnboardingStatus: "onboarding_completed",
    })
  ));
  expect(await screen.findByText("Resource profile updated.")).toBeInTheDocument();
  expect(within(card).queryByDisplayValue("Alpha Resource")).not.toBeInTheDocument();
});
