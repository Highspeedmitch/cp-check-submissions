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
        properties: [{ _id: "property-2", name: "Property B" }],
      },
      propertyIds: [],
      rateOverrideCents: null,
      status: "paused",
    },
  ],
  organizations: [
    { _id: "org-1", name: "Atlas Management", serviceModel: "managed", properties: [{ _id: "property-1", name: "Property A" }] },
    { _id: "org-2", name: "Beacon Partners", serviceModel: "hybrid", properties: [{ _id: "property-2", name: "Property B" }] },
  ],
  earnings: [],
  payoutBatches: [],
};

const archivedDirectory = {
  resources: [{
    _id: "resource-archived",
    displayName: "Archived Inspector",
    email: "archived@example.com",
    resourceType: "contractor",
    skills: ["inspections"],
    regions: ["Tucson"],
    status: "suspended",
    availabilityStatus: "unavailable",
    archivedAt: "2026-08-04T12:00:00.000Z",
    archiveReason: "Contract ended",
    assignmentCount: 12,
    completedAssignmentCount: 10,
    earningCount: 8,
    deploymentCount: 2,
    deployedOrganizations: ["Atlas Management"],
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async (path) => path.includes("directory=archived")
    ? archivedDirectory
    : dashboard);
  api.put.mockResolvedValue({});
  api.post.mockResolvedValue({});
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => "Contract ended");
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

test("platform admins can find and restore an archived resource without losing its history", async () => {
  api.post.mockResolvedValueOnce({ message: "Resource restored.", status: "suspended" });
  render(<PlatformResources />);

  await screen.findByRole("heading", { name: "Alpha Resource" });
  fireEvent.click(screen.getByRole("button", { name: "Find archived resource" }));

  const heading = await screen.findByRole("heading", { name: "Archived Inspector" });
  const card = heading.closest("article");
  expect(within(card).getByText("Atlas Management")).toBeInTheDocument();
  fireEvent.click(within(card).getByRole("button", { name: "View details" }));
  expect(within(card).getByText("Contract ended")).toBeInTheDocument();
  expect(within(card).getByText("10")).toBeInTheDocument();

  fireEvent.click(within(card).getByRole("button", { name: "Restore Resource" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform-resources/resources/resource-archived/restore",
    {}
  ));
  expect(await screen.findByText("Resource restored.")).toBeInTheDocument();
});

test("archiving a current resource requires a reason and uses the dedicated lifecycle endpoint", async () => {
  api.post.mockResolvedValueOnce({ message: "Resource archived.", pausedDeployments: 1 });
  render(<PlatformResources />);

  const heading = await screen.findByRole("heading", { name: "Alpha Resource" });
  const card = heading.closest("article");
  fireEvent.click(within(card).getByRole("button", { name: "Edit details" }));
  fireEvent.click(within(card).getByRole("button", { name: "Archive Resource" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform-resources/resources/resource-1/archive",
    { reason: "Contract ended" }
  ));
  expect(await screen.findByText("Resource archived.")).toBeInTheDocument();
});

test("eligible properties remain hidden until an organization is selected", async () => {
  render(<PlatformResources />);

  await screen.findByRole("heading", { name: "Deploy a Resource" });
  expect(screen.queryByLabelText("Eligible properties")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Managed or hybrid organization"), { target: { value: "org-1" } });
  expect(screen.getByLabelText("Eligible properties")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Property A" })).toBeInTheDocument();
});

test("deployment records expose responsive labels inside the deployment panel", async () => {
  render(<PlatformResources />);

  const heading = await screen.findByRole("heading", { name: "Deploy a Resource" });
  const panel = heading.closest("section");
  const table = within(panel).getByRole("table");
  const resourceCell = within(table).getByText("Alpha Resource").closest("td");
  const scopeCell = within(table).getByText("Property A").closest("td");

  expect(panel).toHaveClass("platform-resource-deployment-panel");
  expect(table).toHaveClass("platform-resource-deployment-table");
  expect(resourceCell).toHaveAttribute("data-label", "Resource");
  expect(scopeCell).toHaveAttribute("data-label", "Scope");
});

test("contractor earnings expose the same responsive card labels on mobile", async () => {
  api.get.mockResolvedValue({
    ...dashboard,
    earnings: [{
      _id: "earning-1",
      resourceProfileId: { _id: "resource-1", displayName: "Alpha Resource" },
      organizationId: { _id: "org-1", name: "Atlas Management" },
      earnedAt: "2026-08-04T12:00:00.000Z",
      grossAmountCents: 9000,
      reimbursementCents: 0,
      currency: "USD",
      status: "pending_approval",
    }],
  });
  render(<PlatformResources />);

  const heading = await screen.findByRole("heading", { name: "Contractor Earnings" });
  const panel = heading.closest("section");
  const table = within(panel).getByRole("table");
  const resourceCell = within(table).getByText("Alpha Resource").closest("td");
  const amountCell = within(table).getByText("$90.00").closest("td");
  const selectCell = within(table).getByRole("checkbox", { name: "Select earning for Alpha Resource" }).closest("td");

  expect(panel).toHaveClass("platform-contractor-earnings-panel");
  expect(table).toHaveClass("platform-contractor-earnings-table");
  expect(resourceCell).toHaveAttribute("data-label", "Resource");
  expect(amountCell).toHaveAttribute("data-label", "Amount");
  expect(selectCell).toHaveAttribute("data-label", "Select");
});

test("current deployments can move organizations and change eligible property scope", async () => {
  api.put.mockResolvedValueOnce({ organizationChanged: true });
  render(<PlatformResources />);

  await screen.findByRole("heading", { name: "Alpha Resource" });
  fireEvent.click(screen.getByRole("button", { name: "Edit deployment for Alpha Resource" }));

  expect(screen.getByRole("heading", { name: "Edit Resource Deployment" })).toBeInTheDocument();
  expect(screen.getByLabelText("Resource")).toHaveValue("resource-1");
  expect(screen.getByLabelText("Resource")).toBeDisabled();
  expect(screen.getByLabelText("Managed or hybrid organization")).toHaveValue("org-1");
  expect(screen.getByLabelText("Contractor pay override")).toHaveValue(90);
  expect([...screen.getByLabelText("Eligible properties").selectedOptions].map((option) => option.value)).toEqual(["property-1"]);

  fireEvent.change(screen.getByLabelText("Managed or hybrid organization"), { target: { value: "org-2" } });
  const propertySelect = screen.getByLabelText("Eligible properties");
  screen.getByRole("option", { name: "Property B" }).selected = true;
  fireEvent.change(propertySelect);
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/platform-resources/deployments/deployment-1/scope",
    {
      organizationId: "org-2",
      propertyIds: ["property-2"],
      rateOverrideCents: 9000,
    }
  ));
  expect(await screen.findByText(/Resource moved to the new organization/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Deploy a Resource" })).toBeInTheDocument();
});
