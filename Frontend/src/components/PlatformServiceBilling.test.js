import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PlatformServiceBilling from "./PlatformServiceBilling";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const serviceInvoice = {
  _id: "invoice-1",
  organizationId: { _id: "org-1", name: "Picor" },
  submitterId: { _id: "resource-user-1", username: "Afterlight Resource" },
  billingOwner: "afterlight_platform",
  inspectionDate: "2026-08-02T12:00:00.000Z",
  amountCents: 17500,
  invoiceNumber: null,
  status: "unbilled",
  pdfUrl: null,
  propertySnapshot: {
    name: "Commerce Center",
    propertyCode: "PIC-100",
    apMethod: "email",
    apEmail: "ap@picor.example",
  },
  fulfillmentSnapshot: { invoiceRouting: "afterlight_service_billing" },
  review: {},
};

beforeEach(() => {
  api.get.mockResolvedValue([serviceInvoice]);
  api.put.mockResolvedValue(serviceInvoice);
  api.post.mockResolvedValue(serviceInvoice);
});

test("platform billing presents customer charges separately from the inspection performer", async () => {
  render(<PlatformServiceBilling />);

  expect(await screen.findByRole("heading", { name: "Commerce Center" })).toBeInTheDocument();
  expect(screen.getByText("Picor")).toBeInTheDocument();
  expect(screen.getByText(/Performed by Afterlight Resource/)).toBeInTheDocument();
  expect(screen.getByText("ap@picor.example")).toBeInTheDocument();
  expect(screen.getByText("$175.00")).toBeInTheDocument();
});

test("platform admin can save an independent customer invoice amount", async () => {
  render(<PlatformServiceBilling />);

  fireEvent.change(await screen.findByLabelText("Customer invoice amount"), {
    target: { value: "225.00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Amount" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/billing/platform-service-invoices/invoice-1/amount",
    { amountCents: 22500 }
  ));
  expect(await screen.findByText("Customer invoice amount saved.")).toBeInTheDocument();
});
