import { fireEvent, render, screen } from "@testing-library/react";
import AssignmentSection from "./AssignmentSection";

test("starts an inspection with the exact scheduled assignment", () => {
  const property = { _id: "property-1", name: "Broadway Center", lat: 0, lng: 0 };
  const assignment = {
    _id: "assignment-1",
    propertyName: property.name,
    startDate: "2026-08-08T12:00:00.000Z",
  };
  const onOpenProperty = jest.fn();

  render(
    <AssignmentSection
      assignments={[assignment]}
      properties={[property]}
      onOpenProperty={onOpenProperty}
      onNavigate={jest.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Start Inspection" }));

  expect(onOpenProperty).toHaveBeenCalledWith(property, assignment);
});
