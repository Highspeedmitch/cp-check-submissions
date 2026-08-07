import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InvoiceEmailApproval from "./InvoiceEmailApproval";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { post: jest.fn() },
}));

const invoice = {
  invoiceNumber: "PIC-1234",
  propertyName: "Starbucks NWC | Glenn & Campbell",
  propertyCode: "SBX-104",
  amountCents: 10000,
  inspectionDate: "2026-08-07T12:00:00.000Z",
  apDestination: "ac••••••@client.example",
  status: "pending_review",
  decision: "",
};

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/billing/email-approval#token=secure-token-value-123456789012345678901234");
});

test("resolves an email link without authentication and requires explicit confirmation", async () => {
  api.post
    .mockResolvedValueOnce({ invoice, canApprove: true })
    .mockResolvedValueOnce({
      invoice: { ...invoice, status: "submitted", decision: "approved", approvedBy: "Jordan Lee" },
      message: "Invoice approved and queued with the AP email provider.",
    });

  render(<InvoiceEmailApproval />);

  expect(await screen.findByRole("heading", { name: "Approve invoice" })).toBeInTheDocument();
  expect(screen.getByText("$100.00")).toBeInTheDocument();
  expect(api.post).toHaveBeenNthCalledWith(
    1,
    "/api/invoice-email-actions/resolve",
    { token: "secure-token-value-123456789012345678901234" },
    { auth: false }
  );

  fireEvent.click(screen.getByRole("button", { name: "Approve & Send to AP" }));

  await waitFor(() => expect(api.post).toHaveBeenNthCalledWith(
    2,
    "/api/invoice-email-actions/approve",
    { token: "secure-token-value-123456789012345678901234" },
    { auth: false }
  ));
  expect(await screen.findByRole("status")).toHaveTextContent("queued with the AP email provider");
  expect(screen.queryByRole("button", { name: "Approve & Send to AP" })).not.toBeInTheDocument();
});
