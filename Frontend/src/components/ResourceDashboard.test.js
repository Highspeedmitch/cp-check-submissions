import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResourceDashboard from "./ResourceDashboard";
import { api } from "../services/api";
import { openNativeMaps } from "../services/mapNavigation";

jest.mock("../services/api", () => ({ api: { get: jest.fn() } }));
jest.mock("../services/mapNavigation", () => ({ openNativeMaps: jest.fn() }));
jest.mock("../services/session", () => ({ logoutSession: jest.fn() }));

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
