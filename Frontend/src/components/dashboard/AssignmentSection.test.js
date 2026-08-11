import { fireEvent, render, screen, within } from "@testing-library/react";
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

test("groups route stops into one clearly labeled assignment in suggested order", () => {
  const properties = [
    { _id: "property-1", name: "Spanish Trail Plaza", lat: 32.2, lng: -110.8 },
    { _id: "property-2", name: "Broadway Center", lat: 32.221219, lng: -110.872634 },
  ];
  const assignments = [
    {
      _id: "assignment-2",
      propertyId: "property-2",
      propertyName: "Broadway Center",
      routeRunId: "route-run-1",
      routeName: "Tucson - East/Central",
      routeStopIndex: 1,
      routeStopCount: 2,
      startDate: "2026-08-08T19:00:00.000Z",
    },
    {
      _id: "assignment-1",
      propertyId: "property-1",
      propertyName: "Spanish Trail Plaza",
      routeRunId: "route-run-1",
      routeName: "Tucson - East/Central",
      routeStopIndex: 0,
      routeStopCount: 2,
      startDate: "2026-08-08T19:00:00.000Z",
    },
  ];
  const onOpenProperty = jest.fn();

  render(
    <AssignmentSection
      assignments={assignments}
      properties={properties}
      onOpenProperty={onOpenProperty}
      onNavigate={jest.fn()}
    />
  );

  expect(screen.getByText("Tucson - East/Central")).toBeInTheDocument();
  expect(screen.getByText(/ROUTE assignment.*2 stops/)).toBeInTheDocument();
  const stopItems = screen.getAllByRole("listitem");
  expect(stopItems.map((item) => item.querySelector("strong").textContent)).toEqual([
    "Spanish Trail Plaza",
    "Broadway Center",
  ]);

  fireEvent.click(within(stopItems[0]).getByRole("button", { name: "Start" }));
  expect(onOpenProperty).toHaveBeenCalledWith(properties[0], assignments[1]);
});
