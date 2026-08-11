import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AddPropertyForm from "./AddPropertyForm";
import { api } from "../../services/api";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("serviceModel", "boutique");
  api.get.mockImplementation(async (path) => {
    if (path === "/api/properties/regions") return [];
    if (path === "/api/admin-users") return { users: [] };
    if (path === "/api/fulfillment") return {
      organization: { serviceModel: "boutique", defaultSource: "afterlight_staff" },
      options: { fulfillmentSources: ["afterlight_staff", "afterlight_contractor"] },
    };
    throw new Error(`Unexpected request: ${path}`);
  });
});

test("Boutique property creation requires sub-5,000-square-foot metadata and Afterlight fulfillment", async () => {
  const onCreate = jest.fn().mockResolvedValue(undefined);
  render(<AddPropertyForm orgType="COM" onCreate={onCreate} onClose={jest.fn()} />);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/fulfillment"));
  expect(await screen.findByRole("option", { name: "Afterlight staff" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Customer employee" })).not.toBeInTheDocument();

  const squareFootageInput = screen.getByLabelText(/^Gross square footage/);
  fireEvent.change(squareFootageInput, { target: { value: "5000" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Property" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/below 5,000/);
  expect(onCreate).not.toHaveBeenCalled();

  fireEvent.change(squareFootageInput, { target: { value: "4999" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Property" }));
  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    grossSquareFeet: "4999",
    propertyType: "free_standing",
  })));
});
