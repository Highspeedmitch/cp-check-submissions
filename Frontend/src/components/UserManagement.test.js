import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserManagement from "./UserManagement";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const properties = [{
  _id: "property-1",
  name: "Winterhaven Square",
  propertyManagers: [],
  clientOwners: [],
}];
const currentDirectory = {
  users: [{
    _id: "user-1",
    username: "Current Submitter",
    email: "current@example.com",
    role: "user",
    accountStatus: "active",
  }],
  properties,
  invitations: [],
  administrators: [{
    _id: "admin-1",
    username: "Current Administrator",
    email: "admin@example.com",
    role: "admin",
    accountStatus: "active",
  }],
  adminInvitations: [],
  adminSeats: {
    limit: 2,
    active: 1,
    pending: 0,
    allocated: 1,
    remaining: 1,
    unmetered: false,
    overLimit: false,
    planLabel: "Full Stack SaaS Tier 1",
  },
  license: {
    serviceModel: "platform",
    tier: "tier_1",
    adminLimit: 2,
    userLimit: 5,
    propertyLimit: 10,
    label: "Full Stack SaaS Tier 1",
  },
  licenseOptions: {
    tiers: ["tier_1", "tier_2", "tier_3"],
    tierLimits: {
      tier_1: { adminLimit: 2, userLimit: 5, propertyLimit: 10 },
      tier_2: { adminLimit: 3, userLimit: 20, propertyLimit: 50 },
      tier_3: { adminLimit: 5, userLimit: 50, propertyLimit: 250 },
    },
    hybridPortfolioMinimums: { tier_1: 15, tier_2: 12, tier_3: 10 },
  },
};
const archivedDirectory = {
  users: [{
    _id: "user-archived",
    username: "Former Submitter",
    email: "former@example.com",
    role: "user",
    accountStatus: "active",
    organizationArchivedAt: "2026-08-04T12:00:00.000Z",
    organizationArchiveReason: "No longer with the organization",
    submissionCount: 17,
    assignmentCount: 19,
  }],
  properties,
  invitations: [],
  administrators: [],
  adminInvitations: [],
  adminSeats: null,
  license: null,
  licenseOptions: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem("userId", "admin-1");
  api.get.mockImplementation(async (path) => path.includes("directory=archived")
    ? archivedDirectory
    : currentDirectory);
  api.post.mockResolvedValue({ message: "Operation completed." });
  window.confirm = jest.fn(() => true);
});

function renderManagement() {
  return render(<MemoryRouter><UserManagement /></MemoryRouter>);
}

test("organization admins can find an archived user and review retained activity", async () => {
  renderManagement();
  await screen.findByText("Current Submitter");

  fireEvent.click(screen.getByRole("button", { name: "Find archived user" }));
  const row = await screen.findByRole("button", { name: /Former Submitter/ });
  fireEvent.click(row);

  const editor = screen.getByRole("heading", { name: "Former Submitter" }).closest("section");
  expect(within(editor).getByText("No longer with the organization")).toBeInTheDocument();
  expect(within(editor).getByText("17")).toBeInTheDocument();
  expect(within(editor).getByText("19")).toBeInTheDocument();
});

test("restoring an archived user uses the reversible lifecycle endpoint", async () => {
  renderManagement();
  await screen.findByText("Current Submitter");
  fireEvent.click(screen.getByRole("button", { name: "Find archived user" }));
  fireEvent.click(await screen.findByRole("button", { name: /Former Submitter/ }));
  fireEvent.click(screen.getByRole("button", { name: "Restore User" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/admin-users/user-archived/restore",
    {}
  ));
});

test("archiving a current user requires a recorded reason", async () => {
  renderManagement();
  fireEvent.click(await screen.findByRole("button", { name: /Current Submitter/ }));
  fireEvent.click(screen.getByRole("button", { name: "Archive User" }));
  fireEvent.change(screen.getByLabelText("Archive reason"), {
    target: { value: "No longer with the organization" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm Archive" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/admin-users/user-1/archive",
    { reason: "No longer with the organization" }
  ));
});

test("administrator seat meter invites a second Tier 1 administrator through a scoped passkey grant", async () => {
  api.post.mockImplementation(async (path) => {
    if (path === "/api/organization-security/grants") return { grant: "admin-grant" };
    if (path === "/api/admin-users/admin-invitations") return { message: "Administrator invitation sent." };
    return { message: "Operation completed." };
  });
  renderManagement();

  expect(await screen.findByText("1/2")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "1 of 2 administrator seats allocated" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Invite Administrator" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Administrator email addresses/i }), {
    target: { value: "second.admin@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Administrative action passkey/i), {
    target: { value: "organization-passkey" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send administrator invitation" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/organization-security/grants",
    { purpose: "invite_admin", passkey: "organization-passkey" }
  ));
  expect(api.post).toHaveBeenCalledWith(
    "/api/admin-users/admin-invitations",
    { emails: ["second.admin@example.com"], adminActionGrant: "admin-grant" }
  );
});

test("a full administrator meter offers the license request path", async () => {
  api.get.mockResolvedValue({
    ...currentDirectory,
    adminSeats: { ...currentDirectory.adminSeats, active: 2, allocated: 2, remaining: 0 },
  });
  renderManagement();
  expect(await screen.findByText("2/2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Request Additional License" }));
  expect(screen.getByRole("dialog", { name: "Request a license tier increase" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Business reason and capacity context"), {
    target: { value: "We need another administrator for our growing portfolio." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/service-model-changes",
    {
      changeType: "license_tier",
      requestedLicenseTier: "tier_2",
      reason: "We need another administrator for our growing portfolio.",
      proposedEffectiveDate: null,
    }
  ));
  expect(screen.queryByRole("button", { name: "Invite Administrator" })).not.toBeInTheDocument();
});

test("Tier 3 organizations can request a custom administrator capacity", async () => {
  api.get.mockResolvedValue({
    ...currentDirectory,
    adminSeats: {
      ...currentDirectory.adminSeats,
      limit: 5,
      active: 5,
      allocated: 5,
      remaining: 0,
      planLabel: "Full Stack SaaS Tier 3",
    },
    license: {
      ...currentDirectory.license,
      tier: "tier_3",
      adminLimit: 5,
      userLimit: 50,
      propertyLimit: 250,
      label: "Full Stack SaaS Tier 3",
    },
  });
  renderManagement();

  fireEvent.click(await screen.findByRole("button", { name: "Request Additional License" }));
  expect(screen.getByRole("dialog", { name: "Request custom administrator capacity" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("spinbutton", { name: /Requested administrator capacity/ }), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText("Business reason and capacity context"), {
    target: { value: "We need three additional regional administrators." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/service-model-changes",
    {
      changeType: "custom_capacity",
      requestedAdminLimit: 8,
      reason: "We need three additional regional administrators.",
      proposedEffectiveDate: null,
    }
  ));
});

test("revoking a pending invitation uses an in-app confirmation and releases the invitation", async () => {
  api.get.mockResolvedValue({
    ...currentDirectory,
    adminInvitations: [{
      _id: "invitation-1",
      email: "pending.admin@example.com",
      role: "admin",
      status: "pending",
    }],
    adminSeats: { ...currentDirectory.adminSeats, pending: 1, allocated: 2, remaining: 0 },
  });
  api.delete.mockResolvedValue(null);
  renderManagement();

  fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
  expect(screen.getByRole("dialog", { name: "Revoke this invitation?" })).toHaveTextContent("pending.admin@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));

  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/admin-users/invitations/invitation-1"));
  expect(await screen.findByRole("status")).toHaveTextContent("Invitation revoked.");
});

test("an organization administrator can securely remove another administrator", async () => {
  const secondAdministrator = {
    _id: "admin-2",
    username: "Second Administrator",
    email: "second.admin@example.com",
    role: "admin",
    accountStatus: "active",
  };
  api.get.mockResolvedValue({
    ...currentDirectory,
    administrators: [...currentDirectory.administrators, secondAdministrator],
    adminSeats: { ...currentDirectory.adminSeats, active: 2, allocated: 2, remaining: 0 },
  });
  api.post.mockImplementation(async (path) => {
    if (path === "/api/organization-security/grants") return { grant: "removal-grant" };
    if (path === "/api/admin-users/administrators/admin-2/access") {
      return { message: "Administrator access removed and the account was archived." };
    }
    return { message: "Operation completed." };
  });
  renderManagement();

  fireEvent.click(await screen.findByRole("button", { name: "Manage access for second.admin@example.com" }));
  expect(screen.getByRole("dialog", { name: "Manage administrator access" })).toHaveTextContent("1 active administrator will remain");
  fireEvent.change(screen.getByLabelText("Reason for access change"), {
    target: { value: "No longer employed by the organization" },
  });
  fireEvent.change(screen.getByLabelText("Type second.admin@example.com to confirm"), {
    target: { value: "second.admin@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Confirm your account password"), {
    target: { value: "account-password" },
  });
  fireEvent.change(screen.getByLabelText("Current authenticator code"), {
    target: { value: "123456" },
  });
  fireEvent.change(screen.getByLabelText("Administrative action passkey"), {
    target: { value: "organization-passkey" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove administrator access" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/organization-security/grants",
    {
      purpose: "remove_admin",
      currentPassword: "account-password",
      code: "123456",
      passkey: "organization-passkey",
    }
  ));
  expect(api.post).toHaveBeenCalledWith(
    "/api/admin-users/administrators/admin-2/access",
    {
      disposition: "archive",
      targetRole: null,
      engagementType: null,
      propertyIds: [],
      reason: "No longer employed by the organization",
      adminActionGrant: "removal-grant",
    }
  );
});

test("administrator access can be changed to a property-scoped non-admin role", async () => {
  api.get.mockResolvedValue({
    ...currentDirectory,
    administrators: [
      ...currentDirectory.administrators,
      {
        _id: "admin-2",
        username: "Second Administrator",
        email: "second.admin@example.com",
        role: "admin",
        accountStatus: "active",
      },
    ],
    adminSeats: { ...currentDirectory.adminSeats, active: 2, allocated: 2, remaining: 0 },
  });
  api.post.mockImplementation(async (path) => path === "/api/organization-security/grants"
    ? { grant: "removal-grant" }
    : { message: "Administrator access changed." });
  renderManagement();

  fireEvent.click(await screen.findByRole("button", { name: "Manage access for second.admin@example.com" }));
  fireEvent.change(screen.getByLabelText("Access outcome"), { target: { value: "demote" } });
  fireEvent.change(screen.getByLabelText("Resulting organization role"), { target: { value: "property_manager" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Winterhaven Square" }));
  fireEvent.change(screen.getByLabelText("Reason for access change"), { target: { value: "Moving to property operations" } });
  fireEvent.change(screen.getByLabelText("Type second.admin@example.com to confirm"), { target: { value: "second.admin@example.com" } });
  fireEvent.change(screen.getByLabelText("Confirm your account password"), { target: { value: "account-password" } });
  fireEvent.change(screen.getByLabelText("Current authenticator code"), { target: { value: "123456" } });
  fireEvent.change(screen.getByLabelText("Administrative action passkey"), { target: { value: "organization-passkey" } });
  fireEvent.click(screen.getByRole("button", { name: "Change administrator access" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/admin-users/administrators/admin-2/access",
    expect.objectContaining({
      disposition: "demote",
      targetRole: "property_manager",
      engagementType: "",
      propertyIds: ["property-1"],
      reason: "Moving to property operations",
    })
  ));
});

test("the current and last active administrators cannot open the removal workflow", async () => {
  renderManagement();
  await screen.findByText("Current Administrator");
  expect(screen.getByText("Current administrator")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Manage access for admin@example.com/ })).not.toBeInTheDocument();
});

test("invites a Field Operator with a separate Customer Contractor assignment type", async () => {
  renderManagement();
  fireEvent.click(await screen.findByRole("button", { name: "Invite User" }));

  expect(screen.getByRole("option", { name: "Field Operator" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Contractor" })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Property Owner" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "operator@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^Assignment type/), {
    target: { value: "customer_contractor" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/admin-users/invitations",
    {
      email: "operator@example.com",
      role: "user",
      engagementType: "customer_contractor",
      propertyIds: [],
    }
  ));
});

test("the user editor uses the same role list and exposes Property Owner", async () => {
  renderManagement();
  fireEvent.click(await screen.findByRole("button", { name: /Current Submitter/ }));
  const editor = screen.getByRole("heading", { name: "Current Submitter" }).closest("section");
  const roleSelect = within(editor).getByLabelText("Role");

  expect(within(roleSelect).getByRole("option", { name: "Field Operator" })).toBeInTheDocument();
  expect(within(roleSelect).getByRole("option", { name: "Property Owner" })).toBeInTheDocument();
  expect(within(roleSelect).queryByRole("option", { name: "Contractor" })).not.toBeInTheDocument();
});
