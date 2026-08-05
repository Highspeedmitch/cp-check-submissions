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
};

beforeEach(() => {
  jest.clearAllMocks();
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
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/admin-users/admin-license-requests",
    {}
  ));
  expect(screen.queryByRole("button", { name: "Invite Administrator" })).not.toBeInTheDocument();
});
