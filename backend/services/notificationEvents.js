function inspectionSubmitted(propertyName, submissionId) {
  return {
    type: "inspection_submitted",
    title: "Property inspection submitted",
    body: `A new inspection was submitted for ${propertyName}.`,
    route: `/admin/submissions/${encodeURIComponent(propertyName)}`,
    entityId: submissionId,
  };
}

function assignmentCompleted(propertyName, submissionId) {
  return {
    type: "assignment_completed",
    title: "Scheduled inspection completed",
    body: `The scheduled inspection for ${propertyName} was completed.`,
    route: `/admin/submissions/${encodeURIComponent(propertyName)}`,
    entityId: submissionId,
  };
}

function assignmentChanged(assignment, change, { previousRecipient = false } = {}) {
  const propertyName = assignment.propertyName || "a property";
  const types = {
    rescheduled: ["assignment_rescheduled", "Assignment rescheduled"],
    reassigned: ["assignment_reassigned", "Assignment reassigned"],
    canceled: ["assignment_canceled", "Assignment canceled"],
  };
  const [type, title] = types[change] || ["assignment_updated", "Assignment updated"];
  const body = change === "reassigned"
    ? previousRecipient
      ? `You are no longer assigned to ${propertyName}.`
      : `${propertyName} was reassigned to you.`
    : change === "canceled"
      ? `Your assignment for ${propertyName} was canceled.`
      : `Your assignment for ${propertyName} has a new schedule.`;
  return {
    type,
    title,
    body,
    route: assignment.resourceProfileId ? "/resource" : "/dashboard",
    entityId: assignment._id,
  };
}

function invoiceSubmitted(invoice) {
  return {
    type: "invoice_submitted",
    title: "Invoice sent for review",
    body: `Your invoice for ${invoice.propertySnapshot.name} was sent to the property manager for review.`,
    route: "/billing",
    entityId: invoice._id,
  };
}

function invoiceSubmittedForPropertyManager(invoice) {
  return {
    type: "invoice_submitted_for_review",
    title: "Invoice awaiting review",
    body: `An invoice for ${invoice.propertySnapshot.name} is ready for your review.`,
    route: `/billing/review/${invoice._id}`,
    entityId: invoice._id,
  };
}

function invoiceReviewChanged(invoice, decision) {
  const approved = decision === "approved";
  const emailQueued = approved && invoice.delivery?.status === "accepted";
  return {
    type: "invoice_review_changed",
    title: approved ? "Invoice approved" : "Invoice needs revision",
    body: approved
      ? emailQueued
        ? `Your invoice for ${invoice.propertySnapshot.name} was approved and queued for AP email delivery.`
        : `Your invoice for ${invoice.propertySnapshot.name} was approved and sent to AP.`
      : `Your invoice for ${invoice.propertySnapshot.name} was declined and needs your attention.`,
    route: "/billing",
    entityId: invoice._id,
  };
}

function invoiceStatusChanged(invoice) {
  return {
    type: "invoice_status_changed",
    title: "Invoice status updated",
    body: `Your invoice for ${invoice.propertySnapshot.name} is now ${invoice.status}.`,
    route: "/billing",
    entityId: invoice._id,
  };
}

function invoiceApDeliveryChanged(invoice, status) {
  const failed = status === "failed";
  const invoiceLabel = invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : "";
  const propertyName = invoice.propertySnapshot?.name || "the property";
  return {
    type: failed ? "invoice_ap_delivery_failed" : "invoice_ap_delivery_queued",
    title: failed ? "AP delivery failed" : "AP email queued",
    body: failed
      ? `AP delivery failed for invoice${invoiceLabel} for ${propertyName}.`
      : `Invoice${invoiceLabel} for ${propertyName} was queued for AP email delivery.`,
    route: invoice.billingOwner === "afterlight_platform" ? "/platform?view=billing" : "/billing",
    entityId: invoice._id,
  };
}

function afterlightServiceInvoicePaid(invoice) {
  const invoiceLabel = invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : "";
  const propertyName = invoice.propertySnapshot?.name || "the property";
  return {
    type: "afterlight_service_invoice_paid",
    title: "Customer payment recorded",
    body: `Payment was recorded for invoice${invoiceLabel} for ${propertyName}.`,
    route: "/platform?view=billing",
    entityId: invoice._id,
  };
}

function currency(cents, code = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format((cents || 0) / 100);
}

function contractorEarningCreated(earning, propertyName, { platform = false } = {}) {
  const amount = currency((earning.grossAmountCents || 0) + (earning.reimbursementCents || 0), earning.currency);
  return {
    type: "contractor_earning_created",
    title: platform ? "Contractor earning awaiting approval" : "Earning recorded",
    body: platform
      ? `${amount} for ${propertyName} is awaiting payable approval.`
      : `${amount} for ${propertyName} was recorded and is awaiting approval.`,
    route: platform ? "/platform?view=resources" : "/resource",
    entityId: earning._id,
  };
}

function contractorEarningChanged(earning, status) {
  const approved = status === "approved";
  return {
    type: approved ? "contractor_earning_approved" : "contractor_earning_voided",
    title: approved ? "Earning approved" : "Earning voided",
    body: approved
      ? `Your ${currency(earning.grossAmountCents, earning.currency)} earning was approved for payout.`
      : "A contractor earning was voided. Open your Resource Portal for details.",
    route: "/resource",
    entityId: earning._id,
  };
}

function gustoBatchChanged(batch, status, { platform = false, amountCents = null } = {}) {
  const labels = {
    created: ["gusto_batch_created", "Gusto batch ready"],
    submitted: ["gusto_batch_submitted", "Gusto payment submitted"],
    paid: ["gusto_batch_paid", "Gusto payment completed"],
  };
  const [type, title] = labels[status];
  const amount = currency(amountCents == null ? batch.totalAmountCents : amountCents, batch.currency);
  const body = platform
    ? `${batch.batchNumber} for ${amount} was ${status === "created" ? "created" : status}.`
    : status === "paid"
      ? `Your ${amount} Gusto payment was marked paid.`
      : status === "submitted"
        ? `Your ${amount} Gusto payment was submitted for processing.`
        : `Your ${amount} Gusto payment batch was prepared.`;
  return {
    type,
    title,
    body,
    route: platform ? "/platform?view=resources" : "/resource",
    entityId: batch._id,
  };
}

function serviceModelChangeEvent(request, organizationName, status) {
  const labels = {
    requested: ["service_model_change_requested", "Service model change requested"],
    information_requested: ["service_model_information_requested", "More information requested"],
    information_supplied: ["service_model_information_supplied", "Service model information supplied"],
    approved: ["service_model_change_approved", "Service model change approved"],
    denied: ["service_model_change_denied", "Service model change denied"],
  };
  const [type, title] = labels[status];
  const platformRecipient = ["requested", "information_supplied"].includes(status);
  return {
    type,
    title,
    body: platformRecipient
      ? `${organizationName} submitted a service model workflow update.`
      : `${organizationName}'s service model request is now ${status.replaceAll("_", " ")}.`,
    route: platformRecipient ? "/platform?view=service-models" : "/service-delivery",
    entityId: request._id,
  };
}

function administratorLicenseRequested(request, organizationName, adminSeats) {
  return {
    type: "administrator_license_requested",
    title: "Administrator license increase requested",
    body: `${organizationName} requested additional administrator seats after reaching ${adminSeats.allocated}/${adminSeats.limit}.`,
    route: "/platform?view=organizations",
    entityId: request._id,
  };
}

function bidRequestSubmitted(request) {
  return {
    type: "bid_request_submitted",
    title: "Bid request sent",
    body: `Your bid request for ${request.address} was sent successfully.`,
    route: "/bid-requests",
    entityId: request._id,
  };
}

function bidRequestReceived(request) {
  return {
    type: "bid_request_received",
    title: "New bid request received",
    body: `A new bid request was received for ${request.address}.`,
    route: "/bid-requests",
    entityId: request._id,
  };
}

function bidRequestStatusChanged(request) {
  return {
    type: "bid_request_status_changed",
    title: "Bid request updated",
    body: `Your bid for ${request.address} has a new status.`,
    route: "/bid-requests",
    entityId: request._id,
  };
}

module.exports = {
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
  bidRequestSubmitted,
  bidRequestReceived,
  bidRequestStatusChanged,
};
