import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardNavigation from "./DashboardNavigation";

const defaults = {
  open: false,
  onClose: jest.fn(),
  orgName: "Test Organization",
  orgType: "COM",
  navigate: jest.fn(),
  onLogout: jest.fn(),
  regions: [],
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test.each(["user", "contractor", "cleaner"])(
  "shows External Connections to assignable %s users",
  (role) => {
    render(<DashboardNavigation {...defaults} role={role} accountScope="organization" />);
    expect(screen.getByRole("button", { name: "External Connections" })).toBeInTheDocument();
  }
);

test.each(["admin", "property_manager", "client"])(
  "does not show External Connections to %s users",
  (role) => {
    render(<DashboardNavigation {...defaults} role={role} accountScope="organization" />);
    expect(screen.queryByRole("button", { name: "External Connections" })).not.toBeInTheDocument();
  }
);

test("shows External Connections in the Afterlight resource workspace", () => {
  render(<DashboardNavigation {...defaults} role="resource" accountScope="afterlight_resource" />);
  expect(screen.getByRole("button", { name: "External Connections" })).toBeInTheDocument();
});

test.each([
  ["organization", "Switch to Resource Portal"],
  ["afterlight_resource", "Switch to Organization Workspace"],
])("shows the destination workspace in open mobile navigation from %s", (accountScope, label) => {
  localStorage.setItem("accountScope", accountScope);
  localStorage.setItem("availableWorkspaces", JSON.stringify([
    "organization",
    "afterlight_resource",
  ]));

  render(
    <MemoryRouter>
      <DashboardNavigation {...defaults} open role="admin" accountScope={accountScope} />
    </MemoryRouter>
  );

  expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
});

test("does not show a workspace switcher in mobile navigation for a single-workspace account", () => {
  localStorage.setItem("accountScope", "organization");
  localStorage.setItem("availableWorkspaces", JSON.stringify(["organization"]));

  render(
    <MemoryRouter>
      <DashboardNavigation {...defaults} open role="admin" accountScope="organization" />
    </MemoryRouter>
  );

  expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
});

test("lets administrators collapse Workspace and Admin tools independently", () => {
  render(
    <MemoryRouter>
      <DashboardNavigation {...defaults} role="admin" accountScope="organization" />
    </MemoryRouter>
  );

  const workspaceToggle = screen.getByRole("button", { name: "Workspace" });
  const adminToolsToggle = screen.getByRole("button", { name: "Admin tools" });
  expect(workspaceToggle).toHaveAttribute("aria-expanded", "true");
  expect(adminToolsToggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Setup Guide" })).not.toBeInTheDocument();

  fireEvent.click(adminToolsToggle);
  expect(adminToolsToggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Setup Guide" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add Properties" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Bulk Onboarding" })).not.toBeInTheDocument();
  expect(workspaceToggle).toHaveAttribute("aria-expanded", "true");

  fireEvent.click(workspaceToggle);
  expect(workspaceToggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
  expect(adminToolsToggle).toHaveAttribute("aria-expanded", "true");
});

test("remembers navigation section preferences on the device", () => {
  const firstRender = render(
    <MemoryRouter>
      <DashboardNavigation {...defaults} role="admin" accountScope="organization" />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole("button", { name: "Admin tools" }));
  firstRender.unmount();

  render(
    <MemoryRouter>
      <DashboardNavigation {...defaults} role="admin" accountScope="organization" />
    </MemoryRouter>
  );

  expect(screen.getByRole("button", { name: "Admin tools" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Setup Guide" })).toBeInTheDocument();
});

test("keeps logout outside the independently scrolling navigation content", () => {
  const { container } = render(
    <MemoryRouter>
      <DashboardNavigation {...defaults} role="admin" accountScope="organization" />
    </MemoryRouter>
  );

  const logout = screen.getByRole("button", { name: "Log out" });
  expect(logout.closest(".beta-sidebar-footer")).not.toBeNull();
  expect(logout.closest(".beta-sidebar-scroll")).toBeNull();
  expect(container.querySelector(".beta-sidebar-scroll")).not.toBeNull();
});
