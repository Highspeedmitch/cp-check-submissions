import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResourceDashboard from "./ResourceDashboard";
import { api } from "../services/api";
import { openNativeMaps } from "../services/mapNavigation";
import { todayDateKey } from "../services/assignmentUrgency";

jest.mock("../services/api", () => ({ api: { get: jest.fn() } }));
jest.mock("../services/mapNavigation", () => ({ openNativeMaps: jest.fn() }));
jest.mock("../services/session", () => ({ logoutSession: jest.fn() }));

function dateKeyWithOffset(offset) {
  const [year, month, day] = todayDateKey().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("accountScope", "afterlight_resource");
  localStorage.setItem("role", "contractor");
  api.get.mockResolvedValue({
    profile: {
      displayName: "Test Resource",
      resourceType: "contractor",
      status: "active",
      availabilityStatus: "available",
    },
    assignments: [],
    earnings: [],
  });
});

test("resource workspace moves calendar management into External Connections navigation", async () => {
  render(<MemoryRouter><ResourceDashboard setUser={jest.fn()} /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "Test Resource" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "External Connections" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Connect My Calendar" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox", { name: "Dark mode" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Help Center" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Log out" })).toHaveLength(1);
});

test("resource assignments use the shared native map navigation", async () => {
  api.get.mockResolvedValue({
    profile: {
      displayName: "Test Resource",
      resourceType: "contractor",
      status: "active",
      availabilityStatus: "available",
    },
    assignments: [{
      _id: "assignment-1",
      organizationName: "PICOR",
      propertyName: "Parkview Plaza",
      orgType: "COM",
      status: "scheduled",
      startDate: "2026-08-12T00:00:00.000Z",
      endDate: "2026-08-12T00:00:00.000Z",
      property: { lat: 32.2226, lng: -110.8807 },
    }],
    earnings: [],
  });
  render(<MemoryRouter><ResourceDashboard setUser={jest.fn()} /></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: "Navigate" }));

  expect(openNativeMaps).toHaveBeenCalledWith(32.2226, -110.8807);
});

test("resource assignments default to urgent work and allow upcoming and all views", async () => {
  api.get.mockResolvedValue({
    profile: {
      displayName: "Test Resource",
      resourceType: "contractor",
      status: "active",
      availabilityStatus: "available",
    },
    assignments: [
      {
        _id: "overdue",
        organizationName: "PICOR",
        propertyName: "Overdue Plaza",
        status: "scheduled",
        startDate: dateKeyWithOffset(-2),
        endDate: dateKeyWithOffset(-1),
      },
      {
        _id: "today",
        organizationName: "PICOR",
        propertyName: "Today Plaza",
        status: "scheduled",
        startDate: dateKeyWithOffset(0),
        endDate: dateKeyWithOffset(0),
      },
      {
        _id: "future",
        organizationName: "PICOR",
        propertyName: "Future Plaza",
        status: "scheduled",
        startDate: dateKeyWithOffset(2),
        endDate: dateKeyWithOffset(2),
      },
    ],
    earnings: [],
  });

  render(<MemoryRouter><ResourceDashboard setUser={jest.fn()} /></MemoryRouter>);

  expect(await screen.findByRole("tab", { name: "Needs attention 2" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "Overdue Plaza" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Today Plaza" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Future Plaza" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Upcoming 1" }));
  expect(screen.getByRole("heading", { name: "Future Plaza" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "All assignments 3" }));
  expect(screen.getByRole("heading", { name: "Overdue Plaza" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Future Plaza" })).toBeInTheDocument();
});
