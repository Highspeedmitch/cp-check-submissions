import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InvoiceReview from "./InvoiceReview";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("./help/ContextualHelpLink", () => () => <span>Help</span>);

const pendingInvoice = {
  _id: "invoice-1",
  invoiceNumber: "PIC-1234",
  billingOwner: "afterlight_platform",
  amountCents: 10000,
  inspectionDate: "2026-08-07T12:00:00.000Z",
  status: "pending_review",
  propertySnapshot: {
    name: "Starbucks NWC | Glenn & Campbell",
    propertyCode: "SBX-104",
    apMethod: "email",
  },
  fulfillmentSnapshot: { invoiceRouting: "afterlight_service_billing" },
  submitterId: { username: "Field Operator" },
  delivery: {},
  pdfUrl: "https://files.example/invoice.pdf",
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("the authenticated review UI retains Approve & Send to AP", async () => {
  api.get.mockResolvedValue(pendingInvoice);
  api.post.mockResolvedValue({
    ...pendingInvoice,
    status: "submitted",
    delivery: { status: "accepted" },
    warning: "Invoice approved and queued with the AP email provider.",
  });

  render(
    <MemoryRouter initialEntries={["/billing/review/invoice-1"]}>
      <Routes>
        <Route path="/billing/review/:id" element={<InvoiceReview />} />
      </Routes>
    </MemoryRouter>
  );

  const approveButton = await screen.findByRole("button", { name: "Approve & Send to AP" });
  fireEvent.click(approveButton);

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/billing/invoice-1/approve",
    {}
  ));
  expect(await screen.findByRole("status")).toHaveTextContent("queued with the AP email provider");
});
