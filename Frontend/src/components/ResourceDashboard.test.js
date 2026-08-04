import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResourceDashboard from "./ResourceDashboard";
import { api } from "../services/api";

jest.mock("../services/api", () => ({ api: { get: jest.fn() } }));
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
