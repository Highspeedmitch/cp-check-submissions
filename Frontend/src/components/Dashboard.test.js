import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import { api } from "../services/api";

jest.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    watchPosition: jest.fn(),
    clearWatch: jest.fn(),
  },
}));
jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  apiUrl: (path) => path,
}));
jest.mock("../services/session", () => ({
  logoutSession: jest.fn(),
}));
jest.mock("../services/notificationCenter", () => ({
  useMarkNotificationsRead: jest.fn(),
  useNotificationBadges: () => ({ dashboard: 0, billing: 0, bids: 0 }),
}));

const property = {
  _id: "property-1",
  name: "Broadway Center",
  orgType: "COM",
  emails: [],
};

function token() {
  return `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
}

function renderDashboard(role) {
  localStorage.setItem("token", token());
  localStorage.setItem("role", role);
  localStorage.setItem("orgType", "COM");
  localStorage.setItem("orgName", "PICOR");
  localStorage.setItem("userId", "user-1");
  localStorage.setItem("organizationId", "org-1");
  return render(
    <MemoryRouter>
      <Dashboard setUser={jest.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  api.get.mockResolvedValue([]);
  api.post.mockResolvedValue({ grant: "test-grant" });
  api.put.mockResolvedValue({ property: { ...property, emails: [] } });
  global.fetch = jest.fn(async (url) => {
    const data = String(url).includes("latest-statuses")
      ? { statuses: {} }
      : String(url).endsWith("/api/properties")
        ? [property]
        : [];
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});

test("admin dashboard renders one property card with admin management actions", async () => {
  const { container } = renderDashboard("admin");

  expect(await screen.findByRole("heading", { name: property.name })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: property.name })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "View Submissions" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage Emails" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage Details" })).toBeInTheDocument();
  expect(screen.getByText("Unassigned")).toHaveClass("declined");
  expect(screen.queryByRole("button", { name: "External Connections" })).not.toBeInTheDocument();
  expect(container.querySelector(".sidebar")).not.toBeInTheDocument();
});

test("property manager retains managed-property actions without admin email controls", async () => {
  renderDashboard("property_manager");

  expect(await screen.findByRole("heading", { name: property.name })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: property.name })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "View Submissions" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage Details" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Manage Emails" })).not.toBeInTheDocument();
});

test("submitter retains a single inspection action", async () => {
  renderDashboard("user");

  expect(await screen.findByRole("heading", { name: property.name })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: property.name })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Start Inspection" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "External Connections" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Connect My Calendar" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Manage Details" })).not.toBeInTheDocument();
});

test("admin can update property inspection recipients through the extracted dialog", async () => {
  api.put.mockResolvedValue({
    property: { ...property, emails: ["manager@example.com", "ops@example.com"] },
  });
  renderDashboard("admin");

  fireEvent.click(await screen.findByRole("button", { name: "Manage Emails" }));
  const recipientInput = screen.getByLabelText("Additional recipient emails");
  fireEvent.change(recipientInput, {
    target: { value: "manager@example.com\nops@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Emails" }));

  await waitFor(() => {
    expect(api.put).toHaveBeenCalledWith(
      "/api/properties/property-1/emails",
      { emails: ["manager@example.com", "ops@example.com"] }
    );
  });
  expect(await screen.findByText("Inspection recipients updated.")).toBeInTheDocument();
});

test("assigned property manager email is automatic and cannot be added twice", async () => {
  const managedProperty = {
    ...property,
    propertyManagers: ["pm-1"],
    automaticRecipientEmails: ["manager@example.com"],
  };
  global.fetch = jest.fn(async (url) => {
    const data = String(url).includes("latest-statuses")
      ? { statuses: {} }
      : String(url).endsWith("/api/properties")
        ? [managedProperty]
        : [];
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  renderDashboard("admin");

  fireEvent.click(await screen.findByRole("button", { name: "Manage Emails" }));
  expect(screen.getByLabelText("Automatic property manager recipients")).toHaveTextContent(
    "manager@example.com"
  );
  fireEvent.change(screen.getByLabelText("Additional recipient emails"), {
    target: { value: "MANAGER@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Emails" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("already included automatically");
  expect(api.put).not.toHaveBeenCalled();
});

test("valid admin passkey opens the reducer-backed add property form", async () => {
  api.post.mockResolvedValue({ grant: "test-grant" });
  api.get.mockImplementation(async (path) => path === "/api/admin-users"
    ? {
        users: [{
          _id: "pm-1",
          username: "Pat Manager",
          email: "pat@example.com",
          role: "property_manager",
          accountStatus: "active",
        }],
      }
    : []);
  renderDashboard("admin");

  fireEvent.click(await screen.findByRole("button", { name: "Add Property" }));
  fireEvent.change(screen.getByLabelText("Organization passkey"), {
    target: { value: "test-passkey" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByRole("heading", { name: "Add New Property" })).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Pat Manager (pat@example.com)" })
  ).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/api/organization-security/grants", {
    purpose: "add_property",
    passkey: "test-passkey",
  });
});
