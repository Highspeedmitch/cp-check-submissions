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
