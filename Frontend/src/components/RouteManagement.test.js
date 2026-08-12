import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RouteManagement from "./RouteManagement";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const properties = Array.from({ length: 7 }, (_, index) => ({
  _id: `property-${index + 1}`,
  name: `Property ${index + 1}`,
  region: "Tucson - East/Central",
  physicalAddress: `${index + 1} Broadway Blvd, Tucson, AZ`,
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async (path) => path.startsWith("/api/service-routes")
    ? {
      routes: [],
      regions: ["Tucson - East/Central"],
      maxPropertiesPerRoute: 6,
    }
    : properties);
  api.post.mockImplementation(async (path) => path.endsWith("/suggest-order")
    ? {
      orderedPropertyIds: ["property-6", "property-5", "property-4", "property-3", "property-2", "property-1"],
      totalMiles: 8.4,
      totalMinutes: 17,
      message: "Efficient order suggested from live road travel times.",
    }
    : { message: "Route created." });
  api.put.mockResolvedValue({ message: "Route updated." });
  window.scrollTo = jest.fn();
});

test("caps a route at six properties and saves the suggested stop order", async () => {
  render(<MemoryRouter><RouteManagement /></MemoryRouter>);

  await screen.findByRole("heading", { name: "Regions & Routes" });
  fireEvent.change(screen.getByLabelText("Route name"), {
    target: { value: "Tucson - East/Central" },
  });
  fireEvent.change(screen.getByLabelText("Region"), {
    target: { value: "Tucson - East/Central" },
  });

  properties.slice(0, 6).forEach((property) => {
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(property.name) }));
  });

  expect(screen.getByRole("checkbox", { name: /Property 7/ })).toBeDisabled();
  expect(screen.getByText("6/6 stops selected")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Suggest efficient order" }));
  expect(await screen.findByText(/8.4 miles \/ 17 minutes/)).toBeInTheDocument();

  const orderedStops = screen.getByRole("region", { name: "Ordered route stops" });
  expect([...orderedStops.querySelectorAll("ol li strong")].map((node) => node.textContent)).toEqual([
    "Property 6",
    "Property 5",
    "Property 4",
    "Property 3",
    "Property 2",
    "Property 1",
  ]);

  fireEvent.click(within(orderedStops.closest("form")).getByRole("button", { name: "Create route" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/service-routes", {
    name: "Tucson - East/Central",
    region: "Tucson - East/Central",
    propertyIds: ["property-6", "property-5", "property-4", "property-3", "property-2", "property-1"],
  }));
});

test("warns before stop changes leave scheduled route assignments on their snapshots", async () => {
  const route = {
    _id: "route-1",
    name: "Tucson - East/Central",
    region: "Tucson - East/Central",
    propertyIds: ["property-1", "property-2"],
    properties: properties.slice(0, 2).map((property, stopIndex) => ({ ...property, stopIndex })),
    version: 1,
    status: "active",
  };
  api.get.mockImplementation(async (path) => path.startsWith("/api/service-routes")
    ? {
      routes: [route],
      regions: ["Tucson - East/Central"],
      maxPropertiesPerRoute: 6,
    }
    : properties);
  api.put
    .mockRejectedValueOnce(Object.assign(new Error("Scheduled assignments retain their snapshots."), {
      status: 409,
      data: {
        code: "ROUTE_SNAPSHOT_CONFIRMATION_REQUIRED",
        scheduledRouteAssignmentCount: 2,
        currentStopCount: 2,
        updatedStopCount: 3,
      },
    }))
    .mockResolvedValueOnce({ message: "Route updated." });

  render(<MemoryRouter><RouteManagement /></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: "Edit route" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Property 3/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save route changes" }));

  const dialog = await screen.findByRole("dialog", { name: "This route has scheduled assignments" });
  expect(within(dialog).getByText(/2 scheduled route assignments will keep their existing 2-stop snapshots/i)).toBeInTheDocument();
  expect(dialog).toHaveTextContent("Added: Property 3");
  expect(api.put).toHaveBeenCalledTimes(1);

  fireEvent.click(within(dialog).getByRole("button", { name: "Save Route Anyway" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
  expect(api.put).toHaveBeenNthCalledWith(2, "/api/service-routes/route-1", {
    name: "Tucson - East/Central",
    region: "Tucson - East/Central",
    propertyIds: ["property-1", "property-2", "property-3"],
    confirmScheduledSnapshotImpact: true,
  });
});
