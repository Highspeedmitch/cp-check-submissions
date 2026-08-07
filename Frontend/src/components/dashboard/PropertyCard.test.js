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
