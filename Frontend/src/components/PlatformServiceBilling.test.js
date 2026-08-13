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

test("platform admin can resend both review documents to selected property managers", async () => {
  const pending = {
    ...serviceInvoice,
    status: "pending_review",
    invoiceNumber: "PIC-100-1",
    pdfUrl: "https://example.com/invoice.pdf",
    review: { cycle: 1 },
  };
  api.get.mockImplementation(async (url) => {
    if (url.endsWith("/review-recipients")) {
      return {
        recipients: [
          { _id: "pm-1", name: "Jordan Lee", email: "jordan@picor.example" },
          { _id: "pm-2", name: "Taylor Kim", email: "taylor@picor.example" },
        ],
        lastAttempt: null,
      };
    }
    return [pending];
  });
  api.post.mockResolvedValue({
    message: "The review email was accepted by the email provider.",
    warning: "",
  });

  render(<PlatformServiceBilling />);
  fireEvent.click(await screen.findByRole("button", { name: "Resend Review Email" }));

  expect(await screen.findByRole("dialog", { name: "Resend review email" })).toBeInTheDocument();
  expect(await screen.findByText("jordan@picor.example")).toBeInTheDocument();
  const jordan = screen.getByRole("checkbox", { name: /Jordan Lee/ });
  const taylor = screen.getByRole("checkbox", { name: /Taylor Kim/ });
  expect(jordan).toBeChecked();
  expect(taylor).toBeChecked();
  fireEvent.click(taylor);
  fireEvent.change(screen.getByLabelText("Reason for resending"), {
    target: { value: "Customer quarantine was cleared." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Resend Email" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/billing/platform-service-invoices/invoice-1/resend-review",
    expect.objectContaining({
      recipientUserIds: ["pm-1"],
      reason: "Customer quarantine was cleared.",
      requestId: expect.stringMatching(/^[A-Za-z0-9_-]{16,100}$/),
    })
  ));
  expect(await screen.findByText("The review email was accepted by the email provider.")).toBeInTheDocument();
});
