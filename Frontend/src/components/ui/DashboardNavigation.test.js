import { render, screen } from "@testing-library/react";
import DashboardNavigation from "./DashboardNavigation";

const defaults = {
  open: false,
  onClose: jest.fn(),
  orgName: "Test Organization",
  orgType: "COM",
  navigate: jest.fn(),
  onLogout: jest.fn(),
  regions: [],
  showMileageTracking: false,
};

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
