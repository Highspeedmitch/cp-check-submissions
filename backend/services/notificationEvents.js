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
  invoiceSubmitted,
  invoiceSubmittedForPropertyManager,
  invoiceReviewChanged,
  invoiceStatusChanged,
  bidRequestSubmitted,
  bidRequestReceived,
  bidRequestStatusChanged,
};
