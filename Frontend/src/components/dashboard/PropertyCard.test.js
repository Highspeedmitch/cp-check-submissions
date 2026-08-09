import { fireEvent, render, screen } from "@testing-library/react";
import PropertyCard from "./PropertyCard";

test("keeps property-manager navigation inside the responsive action group", () => {
  const onNavigate = jest.fn();
  render(
    <PropertyCard
      property={{ name: "Winterhaven Square", lat: 33.45, lng: -112.07 }}
      isManagement
      role="property_manager"
      orgType="COM"
      onOpen={jest.fn()}
      onManageDetails={jest.fn()}
      onNavigate={onNavigate}
    />
  );

  const navigateButton = screen.getByRole("button", { name: "Navigate" });
  expect(navigateButton.closest(".beta-property-actions")).not.toBeNull();
  fireEvent.click(navigateButton);
  expect(onNavigate).toHaveBeenCalledWith(33.45, -112.07);
});

test.each([
  ["unscheduled", "Unscheduled"],
  ["scheduled", "Scheduled"],
  ["completed", "Completed"],
  ["missed", "Missed"],
])("renders the %s monthly scheduler state beneath the management badge", (status, label) => {
  render(
    <PropertyCard
      property={{ name: "Winterhaven Square" }}
      isManagement
      role="property_manager"
      orgType="COM"
      monthlyAssignmentStatus={{ status }}
      monthlyAssignmentMonth="August 2026"
      onOpen={jest.fn()}
      onManageDetails={jest.fn()}
      onNavigate={jest.fn()}
    />
  );

  expect(screen.getByText("Managed")).toBeInTheDocument();
  expect(screen.getByLabelText(`August 2026 schedule: ${label}`)).toHaveClass(`is-${status}`);
});
