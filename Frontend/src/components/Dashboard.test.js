import { render, screen } from "@testing-library/react";
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
    put: jest.fn(),
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
  expect(screen.queryByRole("button", { name: "Manage Details" })).not.toBeInTheDocument();
});
