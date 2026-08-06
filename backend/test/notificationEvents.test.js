const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectionSubmitted,
  assignmentCompleted,
  assignmentChanged,
  afterlightServiceInvoicePaid,
  contractorEarningChanged,
  contractorEarningCreated,
  gustoBatchChanged,
  invoiceApDeliveryChanged,
  invoiceSubmitted,
  invoiceSubmittedForPropertyManager,
  invoiceReviewChanged,
  invoiceStatusChanged,
  serviceModelChangeEvent,
  administratorLicenseRequested,
  bulkOnboardingAssistanceRequested,
  bidRequestSubmitted,
  bidRequestReceived,
  bidRequestStatusChanged,
} = require("../services/notificationEvents");

test("inspection notifications link property managers to the property history", () => {
  const event = inspectionSubmitted("22 & Harrison", "submission-1");
  assert.equal(event.type, "inspection_submitted");
  assert.equal(event.route, "/admin/submissions/22%20%26%20Harrison");
  assert.equal(event.entityId, "submission-1");
});

test("assignment completion notifications identify scheduled work without exposing comments", () => {
  const event = assignmentCompleted("22 & Harrison", "submission-1");
  assert.equal(event.type, "assignment_completed");
  assert.equal(event.title, "Scheduled inspection completed");
  assert.match(event.body, /22 & Harrison/);
  assert.equal(event.route, "/admin/submissions/22%20%26%20Harrison");
  assert.equal(event.entityId, "submission-1");
});

test("assignment lifecycle events route organization and resource assignees correctly", () => {
  const assignment = { _id: "assignment-1", propertyName: "Broadway Center" };
  assert.equal(assignmentChanged(assignment, "rescheduled").type, "assignment_rescheduled");
  assert.match(assignmentChanged(assignment, "reassigned", { previousRecipient: true }).body, /no longer assigned/);
  assert.equal(assignmentChanged({ ...assignment, resourceProfileId: "resource-1" }, "canceled").route, "/resource");
});

test("invoice events confirm submission and describe a later status change", () => {
  const invoice = {
    _id: "invoice-1",
    status: "paid",
    propertySnapshot: { name: "Broadway Center" },
    delivery: { status: "accepted" },
  };
  assert.match(invoiceSubmitted(invoice).body, /property manager for review/);
  const managerEvent = invoiceSubmittedForPropertyManager(invoice);
  assert.equal(managerEvent.type, "invoice_submitted_for_review");
  assert.equal(managerEvent.route, "/billing/review/invoice-1");
  assert.equal(managerEvent.entityId, "invoice-1");
  assert.match(managerEvent.body, /ready for your review/);
  assert.match(invoiceReviewChanged(invoice, "approved").body, /approved and queued for AP email delivery/);
  assert.match(invoiceReviewChanged(invoice, "declined").body, /declined/);
  assert.match(invoiceStatusChanged(invoice).body, /now paid/);
});

test("AP and Afterlight payment events describe recorded state without claiming mailbox delivery", () => {
  const invoice = {
    _id: "invoice-1",
    invoiceNumber: "INV-10",
    billingOwner: "afterlight_platform",
    propertySnapshot: { name: "Broadway Center" },
  };
  const queued = invoiceApDeliveryChanged(invoice, "queued");
  assert.equal(queued.type, "invoice_ap_delivery_queued");
  assert.match(queued.body, /queued/);
  assert.doesNotMatch(queued.body, /delivered|sent successfully/i);
  assert.equal(invoiceApDeliveryChanged(invoice, "failed").type, "invoice_ap_delivery_failed");
  assert.equal(afterlightServiceInvoicePaid(invoice).type, "afterlight_service_invoice_paid");
});

test("contractor earnings and Gusto batches produce resource and platform events", () => {
  const earning = { _id: "earning-1", grossAmountCents: 5000, reimbursementCents: 500, currency: "USD" };
  assert.equal(contractorEarningCreated(earning, "Broadway Center").type, "contractor_earning_created");
  assert.equal(contractorEarningChanged(earning, "approved").type, "contractor_earning_approved");
  assert.equal(contractorEarningChanged(earning, "void").type, "contractor_earning_voided");
  const batch = { _id: "batch-1", batchNumber: "GUSTO-1", totalAmountCents: 5500, currency: "USD" };
  assert.equal(gustoBatchChanged(batch, "created", { platform: true }).type, "gusto_batch_created");
  assert.equal(gustoBatchChanged(batch, "submitted").route, "/resource");
  assert.equal(gustoBatchChanged(batch, "paid").type, "gusto_batch_paid");
});

test("service model workflow events link each recipient to the correct workspace", () => {
  const request = { _id: "request-1" };
  assert.equal(serviceModelChangeEvent(request, "Example Org", "requested").route, "/platform?view=service-models");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "information_supplied").type, "service_model_information_supplied");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "information_requested").route, "/service-delivery");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "approved").type, "service_model_change_approved");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "denied").type, "service_model_change_denied");
});

test("license tier workflow events share the contract-review routes without becoming service-model events", () => {
  const request = { _id: "request-tier-1", changeType: "license_tier" };
  assert.equal(serviceModelChangeEvent(request, "Example Org", "requested").type, "license_tier_change_requested");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "requested").route, "/platform?view=service-models");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "approved").type, "license_tier_change_approved");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "approved").route, "/service-delivery");
});

test("custom capacity workflow events share service-plan review routes", () => {
  const request = { _id: "request-capacity-1", changeType: "custom_capacity" };
  const requested = serviceModelChangeEvent(request, "Example Org", "requested");
  assert.equal(requested.type, "custom_capacity_change_requested");
  assert.equal(requested.route, "/platform?view=service-models");
  assert.match(requested.body, /administrator capacity/);
  assert.equal(serviceModelChangeEvent(request, "Example Org", "approved").type, "custom_capacity_change_approved");
  assert.equal(serviceModelChangeEvent(request, "Example Org", "approved").route, "/service-delivery");
});

test("administrator license requests alert platform administrators", () => {
  const event = administratorLicenseRequested(
    { _id: "audit-1" },
    "Example Org",
    { allocated: 3, limit: 3 }
  );
  assert.equal(event.type, "administrator_license_requested");
  assert.equal(event.route, "/platform?view=overview");
  assert.match(event.body, /3\/3/);
});

test("bulk onboarding assistance alerts platform administrators without CSV contents", () => {
  const event = bulkOnboardingAssistanceRequested(
    { _id: "audit-2" },
    "Example Org",
    { type: "properties", estimatedRows: 42 }
  );
  assert.equal(event.type, "bulk_onboarding_assistance_requested");
  assert.equal(event.route, "/platform?view=overview");
  assert.match(event.body, /42 properties/);
  assert.doesNotMatch(event.body, /csv|email/i);
});

test("initial bid messages distinguish sender confirmation from admin receipt", () => {
  const request = { _id: "bid-1", address: "100 Main Street" };
  assert.match(bidRequestSubmitted(request).body, /sent successfully/);
  assert.match(bidRequestReceived(request).body, /received/);
});

test("bid status push copy remains neutral and does not expose the decision", () => {
  const request = {
    _id: "bid-1",
    address: "100 Main Street",
    status: "declined",
  };
  const event = bidRequestStatusChanged(request);
  assert.equal(event.body, "Your bid for 100 Main Street has a new status.");
  assert.doesNotMatch(event.body, /approved|declined|accepted|denied/i);
});
